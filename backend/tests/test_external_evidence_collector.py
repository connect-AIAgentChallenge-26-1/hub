from datetime import date
from typing import Any

import httpx
import pytest
from sqlalchemy.orm import Session

from app.models.external_evidence import ExternalSourceProvider, RawExternalRecord
from app.providers.naver_news import NaverNewsProvider, checksum_of, stable_json_bytes
from app.schemas.structured_claim import Comparator, StructuredClaim
from app.services.external_evidence_collector import (
    ExternalEvidenceCollector,
    build_news_query,
    promote_official_numeric_evidence,
)
from tests.support.naver_mock import client_with_responses, json_response, load_json


def _claim(**overrides: object) -> StructuredClaim:
    defaults: dict[str, object] = dict(
        claim_id="claim-1",
        original_span="삼성전자 영업이익이 전분기 대비 늘었다",
        corp_code="00126380",
        stock_code="005930",
        claim_type="COMPARISON",
        metric="영업이익",
        evidence_domain="financial",
        comparator=Comparator(
            op="THRESHOLD", comparison_operator="GT", target_value=0, target_unit="KRW"
        ),
        direction="INCREASE",
        current_period="2026Q2",
        comparison_period="2026Q1",
        as_of=date(2026, 7, 13),
        verifiable=True,
        ambiguity_flags=[],
    )
    defaults.update(overrides)
    return StructuredClaim(**defaults)  # type: ignore[arg-type]


def test_build_news_query_is_deterministic():
    claim = _claim()
    assert build_news_query(claim, "삼성전자") == build_news_query(claim, "삼성전자")


def test_build_news_query_only_uses_company_name_metric_and_period():
    claim = _claim()
    query = build_news_query(claim, "삼성전자")
    assert query == "삼성전자 영업이익 2026Q2"
    # claim_id·original_span 같은 다른 필드는 검색어에 새어 들어가지 않는다.
    assert "claim-1" not in query
    assert "전분기 대비" not in query


def test_build_news_query_changes_when_metric_changes():
    base = build_news_query(_claim(), "삼성전자")
    changed = build_news_query(_claim(metric="순이익"), "삼성전자")
    assert base != changed


def _collector(
    db_session: Session, responses: list[httpx.Response | Exception]
) -> tuple[ExternalEvidenceCollector, NaverNewsProvider]:
    client, _transport = client_with_responses(responses)
    provider = NaverNewsProvider(client_id="id", client_secret="secret", client=client)
    return ExternalEvidenceCollector(db_session, provider), provider


def test_collect_news_stores_query_and_raw_record(db_session):
    fixture = load_json("news_search_samsung.json")
    collector, _ = _collector(db_session, [json_response(fixture)])
    record = collector.collect_news(_claim(), "삼성전자")
    assert record.source_provider is ExternalSourceProvider.NAVER_NEWS
    assert record.query == "삼성전자 영업이익 2026Q2"
    assert record.claim_id == "claim-1"
    assert record.checksum


def test_collect_news_cannot_run_without_a_structured_claim(db_session):
    # docs/checklist.md C7 "S14 외부 근거 수집이 S7 StructuredClaim 이후에만
    # 실행되는 contract test" — S14.collect_news는 StructuredClaim이 없으면
    # 검색어 자체를 만들 수 없다(build_news_query가 claim.metric/current_period
    # 속성 접근에 의존). S7이 아직 유효한 Claim을 만들지 못한 상태(예: dict를
    # 그대로 넘김)를 흉내내면 즉시 AttributeError로 막힌다 — 조용히 빈 검색어로
    # 진행하지 않는다.
    collector, _ = _collector(db_session, [])
    not_a_claim = {"metric": "영업이익", "current_period": "2026Q2"}
    with pytest.raises(AttributeError):
        collector.collect_news(not_a_claim, "삼성전자")  # type: ignore[arg-type]


def _stored_raw_record(db_session: Session, payload: dict[str, Any]) -> RawExternalRecord:
    record = RawExternalRecord(
        source_provider=ExternalSourceProvider.NAVER_NEWS,
        claim_id="claim-1",
        query="삼성전자 영업이익",
        query_builder_version="s14-query-builder-1.0.0",
        corp_code="00126380",
        stock_code="005930",
        raw_payload=payload,
        checksum=checksum_of(stable_json_bytes(payload)),
    )
    db_session.add(record)
    db_session.commit()
    db_session.refresh(record)
    return record


def test_normalize_marks_entity_match_when_company_name_present(db_session):
    fixture = load_json("news_search_samsung.json")
    record = _stored_raw_record(db_session, fixture)
    collector, _ = _collector(db_session, [])
    result = collector.normalize([record], company_name="삼성전자", as_of=date(2026, 7, 14))
    assert len(result.external_documents) == len(fixture["items"])
    assert any(d.entity_matched for d in result.external_documents)


def test_normalize_never_produces_numeric_evidence_from_naver_source(db_session):
    # 산문(뉴스 description)에서 나온 수치를 NumericEvidence로 승격하지 않는다는
    # 계약(docs/skills.md S14 제약)의 실행 지점 — NORMALIZE 결과에 numeric_evidence가
    # 하나도 없어야 한다.
    fixture = load_json("news_search_samsung.json")
    record = _stored_raw_record(db_session, fixture)
    collector, _ = _collector(db_session, [])
    result = collector.normalize([record], company_name="삼성전자", as_of=date(2026, 7, 14))
    assert result.numeric_evidence == []


def test_normalize_revised_at_always_none_for_naver_source(db_session):
    fixture = load_json("news_search_samsung.json")
    record = _stored_raw_record(db_session, fixture)
    collector, _ = _collector(db_session, [])
    result = collector.normalize([record], company_name="삼성전자", as_of=date(2026, 7, 14))
    assert all(d.revised_at is None for d in result.external_documents)


def test_normalize_verifiable_status_unverifiable_when_no_documents(db_session):
    collector, _ = _collector(db_session, [])
    result = collector.normalize([], company_name="삼성전자", as_of=date(2026, 7, 14))
    assert result.verifiable_status == "UNVERIFIABLE"


def test_normalize_verifiable_status_source_available_when_entity_matched(db_session):
    fixture = load_json("news_search_samsung.json")
    record = _stored_raw_record(db_session, fixture)
    collector, _ = _collector(db_session, [])
    result = collector.normalize([record], company_name="삼성전자", as_of=date(2026, 7, 14))
    assert result.verifiable_status == "SOURCE_AVAILABLE"


def test_promote_official_numeric_evidence_rejects_prose_source(db_session):
    # 커뮤니티 소문·뉴스 산문을 사실 근거로 승격하지 않는 테스트 — 네이버 뉴스
    # source_provider로는 이 변환 함수를 아예 호출할 수 없다.
    fixture = load_json("news_search_samsung.json")
    record = _stored_raw_record(db_session, fixture)
    with pytest.raises(ValueError, match="prose"):
        promote_official_numeric_evidence(
            record, {"some_field": ("some_metric", "KRW")}, as_of=date(2026, 7, 14)
        )


def test_promote_official_numeric_evidence_succeeds_for_official_structured_source(db_session):
    # data.go.kr/KRX 자격증명이 아직 없어(docs/prerequisites.md T03) 실 provider
    # 호출 검증은 BLOCKED다 — 이 테스트는 변환 로직 자체만 검증하는 synthetic fixture
    # 다(실 API 캡처 아님, 공식 문서 shape를 흉내낸 최소 구조).
    synthetic_official_payload = {"foreign_net_buy_amount": "12345"}
    record = RawExternalRecord(
        source_provider=ExternalSourceProvider.DATA_GO_KR,
        claim_id="claim-1",
        query="삼성전자 수급",
        query_builder_version="s14-query-builder-1.0.0",
        corp_code="00126380",
        stock_code="005930",
        raw_payload=synthetic_official_payload,
        checksum=checksum_of(stable_json_bytes(synthetic_official_payload)),
    )
    db_session.add(record)
    db_session.commit()
    db_session.refresh(record)

    evidence = promote_official_numeric_evidence(
        record,
        {"foreign_net_buy_amount": ("foreign_net_buy_amount", "KRW")},
        as_of=date(2026, 7, 14),
    )
    assert len(evidence) == 1
    assert evidence[0]["value"] == 12345.0
    assert evidence[0]["evidence_domain"] == "flow"
    assert evidence[0]["source_ids"] == [str(record.raw_record_id)]


def test_external_source_provider_allowlist_has_exactly_three_official_values():
    # docs/skills.md S14 "이 3개 외 출처는 COLLECT 대상이 아니다" — 임의의 커뮤니티
    # 출처를 나타낼 값 자체가 enum에 존재하지 않는다.
    assert {p.value for p in ExternalSourceProvider} == {
        "naver_news",
        "data_go_kr",
        "krx_official",
    }
