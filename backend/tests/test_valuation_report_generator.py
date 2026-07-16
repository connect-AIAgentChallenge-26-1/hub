"""기능 B 오케스트레이션 통합 테스트 (docs/checklist.md C6). 실제 삼성전자(대상)
·SK하이닉스·DB하이텍·삼성전기(peer 후보) 2026-07-15 라이브 캡처 데이터로 S1
확장·S2·S3·S13·S21·S5·S6 전체 파이프라인을 검증한다."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date
from decimal import Decimal

import httpx

from app.models.financial_fact import FinancialFact, FsDiv
from app.providers.base import ProviderRateLimitedError
from app.providers.kis import KisProvider, TokenCache
from app.providers.opendart import OpenDartProvider
from app.services.financial_calculator import RatioResult
from app.services.peer_universe import CompanyProfile
from app.services.price_position import BELOW_MODEL_RANGE
from app.services.valuation_report_generator import (
    VALUATION_REPORT_GENERATOR_VERSION,
    Checkpoint,
    CompanySpec,
    ValuationReportGenerator,
    _apply_post_derived_gate,
    _derived_check_input,
    _gate_ratio_evidence,
)
from tests.support.kis_mock import QueueTransport as KisQueueTransport
from tests.support.kis_mock import client_with_responses as kis_client
from tests.support.kis_mock import load_json as load_kis_json
from tests.support.opendart_mock import QueueTransport as OpenDartQueueTransport
from tests.support.opendart_mock import client_with_responses as opendart_client
from tests.support.opendart_mock import json_response as opendart_json_response
from tests.support.opendart_mock import load_json as load_opendart_json

AS_OF = date(2026, 7, 15)

_TARGET = CompanySpec(corp_code="00126380", stock_code="005930")
_PEERS = [
    CompanySpec(corp_code="00164779", stock_code="000660"),  # SK하이닉스
    CompanySpec(corp_code="00160843", stock_code="000990"),  # DB하이텍
    CompanySpec(corp_code="00126371", stock_code="009150"),  # 삼성전기
]


def _opendart_provider(
    responses: Sequence[httpx.Response | Exception],
) -> tuple[OpenDartProvider, OpenDartQueueTransport]:
    client, transport = opendart_client(list(responses))
    return OpenDartProvider(api_key="test-key", client=client), transport


def _kis_provider(
    responses: Sequence[httpx.Response | Exception],
    token_responses: Sequence[httpx.Response | Exception] | None = None,
) -> tuple[KisProvider, KisQueueTransport]:
    token_fixture = load_kis_json("token_issue_success_redacted.json")
    all_responses = list(token_responses or [opendart_json_response(token_fixture)]) + list(
        responses
    )
    client, transport = kis_client(all_responses)
    return (
        KisProvider(
            app_key="k", app_secret="s", env="vps", client=client, token_cache=TokenCache()
        ),
        transport,
    )


def _happy_path_dart_responses() -> list[httpx.Response | Exception]:
    return [
        opendart_json_response(load_opendart_json("company_overview_samsung.json")),
        opendart_json_response(
            load_opendart_json("financial_calculator/annual_2024_CFS.json")
        ),
        opendart_json_response(load_opendart_json("company_overview_skhynix.json")),
        opendart_json_response(
            load_opendart_json("financial_calculator/peer_2024_CFS_skhynix.json")
        ),
        opendart_json_response(load_opendart_json("company_overview_dbhitek.json")),
        opendart_json_response(
            load_opendart_json("financial_calculator/peer_2024_CFS_dbhitek.json")
        ),
        opendart_json_response(load_opendart_json("company_overview_samsung_electro.json")),
        opendart_json_response(
            load_opendart_json("financial_calculator/peer_2024_CFS_samsung_electro.json")
        ),
    ]


def _happy_path_kis_responses() -> list[httpx.Response | Exception]:
    return [
        opendart_json_response(load_kis_json("current_price_005930.json")),
        opendart_json_response(load_kis_json("current_price_skhynix_000660.json")),
        opendart_json_response(load_kis_json("current_price_dbhitek_000990.json")),
        opendart_json_response(load_kis_json("current_price_samsung_electro_009150.json")),
    ]


def test_full_report_happy_path(db_session):
    dart_provider, _ = _opendart_provider(_happy_path_dart_responses())
    kis_provider, _ = _kis_provider(_happy_path_kis_responses())
    generator = ValuationReportGenerator(
        db_session, dart_provider, kis_provider, today_provider=lambda: AS_OF
    )

    report = generator.generate(_TARGET, _PEERS, AS_OF, bsns_year="2024", reprt_code="11011")

    assert report.target_profile is not None
    assert report.target_profile.corp_name == "삼성전자(주)"
    assert report.target_profile.industry_code == "264"

    assert report.peer_result is not None
    assert len(report.peer_result.peer_universe) == 3
    assert report.peer_result.sufficient is True

    assert report.valuation is not None
    assert report.valuation.data_quality == "SUFFICIENT"
    assert len(report.valuation.value_ranges) == 3

    assert report.price_position is not None
    # 실제 2026-07-15 라이브 데이터 — 삼성전자 262,500원은 반도체 peer 대비 낮은 범위.
    assert report.price_position.overall_position == BELOW_MODEL_RANGE

    assert report.generator_version == VALUATION_REPORT_GENERATOR_VERSION


def test_industry_mismatched_candidate_is_excluded_not_silently_dropped(db_session):
    # 4번째 후보로 업종이 다른 회사를 추가해도 크래시 없이 exclusions에 남는지 확인.
    dart_responses = _happy_path_dart_responses() + [
        opendart_json_response(load_opendart_json("company_overview_samsung.json")),
        opendart_json_response(
            load_opendart_json("financial_calculator/annual_2023_CFS.json")
        ),
    ]
    dart_provider, _ = _opendart_provider(dart_responses)
    kis_responses = _happy_path_kis_responses() + [
        opendart_json_response(load_kis_json("current_price_005930.json"))
    ]
    kis_provider, _ = _kis_provider(kis_responses)
    generator = ValuationReportGenerator(
        db_session, dart_provider, kis_provider, today_provider=lambda: AS_OF
    )

    unrelated = CompanySpec(corp_code="00126380", stock_code="005930")
    report = generator.generate(
        _TARGET, [*_PEERS, unrelated], AS_OF, bsns_year="2024", reprt_code="11011"
    )
    assert report.peer_result is not None
    assert any(e.reason_code == "IS_TARGET" for e in report.peer_result.exclusions)


def test_provider_fault_on_target_price_is_a_checkpoint_not_a_crash(db_session):
    dart_responses = [
        opendart_json_response(load_opendart_json("company_overview_samsung.json")),
    ]
    dart_provider, _ = _opendart_provider(dart_responses)
    kis_provider, _ = _kis_provider([ProviderRateLimitedError("rate limited")])
    generator = ValuationReportGenerator(
        db_session, dart_provider, kis_provider, today_provider=lambda: AS_OF
    )

    report = generator.generate(_TARGET, [], AS_OF, bsns_year="2024", reprt_code="11011")
    assert report.target_profile is None
    assert any(c.code.startswith("PRICE_") for c in report.checkpoints)
    assert any(c.code == "TARGET_DATA_UNAVAILABLE" for c in report.checkpoints)


def test_overview_provider_fault_does_not_crash_candidate_collection(db_session):
    from tests.support.opendart_mock import load_error

    dart_responses = [
        opendart_json_response(load_opendart_json("company_overview_samsung.json")),
        opendart_json_response(
            load_opendart_json("financial_calculator/annual_2024_CFS.json")
        ),
        opendart_json_response(load_error("020_rate_limited")),
    ]
    dart_provider, _ = _opendart_provider(dart_responses)
    kis_responses = [
        opendart_json_response(load_kis_json("current_price_005930.json")),
    ]
    kis_provider, _ = _kis_provider(kis_responses)
    generator = ValuationReportGenerator(
        db_session, dart_provider, kis_provider, today_provider=lambda: AS_OF
    )

    report = generator.generate(
        _TARGET, [_PEERS[0]], AS_OF, bsns_year="2024", reprt_code="11011"
    )
    assert report.target_profile is not None
    assert report.peer_result is not None
    assert report.peer_result.peer_universe == ()
    assert any(c.code.startswith("OVERVIEW_") for c in report.checkpoints)


def test_insufficient_peers_reports_checkpoint(db_session):
    dart_responses = [
        opendart_json_response(load_opendart_json("company_overview_samsung.json")),
        opendart_json_response(
            load_opendart_json("financial_calculator/annual_2024_CFS.json")
        ),
        opendart_json_response(load_opendart_json("company_overview_skhynix.json")),
        opendart_json_response(
            load_opendart_json("financial_calculator/peer_2024_CFS_skhynix.json")
        ),
    ]
    dart_provider, _ = _opendart_provider(dart_responses)
    kis_responses = [
        opendart_json_response(load_kis_json("current_price_005930.json")),
        opendart_json_response(load_kis_json("current_price_skhynix_000660.json")),
    ]
    kis_provider, _ = _kis_provider(kis_responses)
    generator = ValuationReportGenerator(
        db_session, dart_provider, kis_provider, today_provider=lambda: AS_OF
    )

    report = generator.generate(
        _TARGET, [_PEERS[0]], AS_OF, bsns_year="2024", reprt_code="11011"
    )
    assert report.peer_result is not None
    assert report.peer_result.sufficient is False
    assert any(c.code == "INSUFFICIENT_PEERS" for c in report.checkpoints)
    assert report.valuation is not None
    assert report.valuation.data_quality == "INSUFFICIENT_PEERS"
    assert report.price_position is not None
    from app.services.price_position import INSUFFICIENT

    assert report.price_position.overall_position == INSUFFICIENT


def test_historical_as_of_does_not_stamp_live_current_price(db_session):
    # KIS 현재가 endpoint는 거래일자를 제공하지 않는 "지금" 스냅샷이다 — as_of가
    # 오늘(주입된 today_provider)과 다르면 그 스냅샷을 as_of의 가격이라 증명할 수
    # 없으므로 호출조차 하지 않고 checkpoint로 안전 종료해야 한다(GPT 리뷰
    # 2026-07-16 11:00 발견: 과거 as_of 요청에도 라이브 현재가가 통과하던 결함).
    dart_responses = [
        opendart_json_response(load_opendart_json("company_overview_samsung.json")),
    ]
    dart_provider, _ = _opendart_provider(dart_responses)
    # KIS 응답 큐를 비워둔다 — 현재가 조회 자체가 호출되지 않아야 함을 검증.
    kis_provider, _ = _kis_provider([])
    today = date(2026, 7, 16)
    historical_as_of = date(2026, 1, 1)
    generator = ValuationReportGenerator(
        db_session, dart_provider, kis_provider, today_provider=lambda: today
    )

    report = generator.generate(
        _TARGET, [], historical_as_of, bsns_year="2024", reprt_code="11011"
    )

    assert report.target_profile is None
    assert any(
        c.code == "CURRENT_PRICE_AS_OF_MISMATCH_005930" for c in report.checkpoints
    )


def test_report_is_reproducible(db_session):
    # 같은 session 안에서 두 번째 generate()를 호출하면 S2의 재무제표 TTL
    # 캐시(ProviderCacheEntry, 24시간)가 그 4건의 HTTP 요청 자체를 건너뛴다
    # (기업개황은 S1 확장에서 의도적으로 캐시하지 않음, company_overview.py
    # docstring 참고) — 그래서 두 번째 DART 큐는 기업개황 4건만 필요하다.
    dart_provider, _ = _opendart_provider(_happy_path_dart_responses())
    kis_provider, _ = _kis_provider(_happy_path_kis_responses())
    generator = ValuationReportGenerator(
        db_session, dart_provider, kis_provider, today_provider=lambda: AS_OF
    )
    report1 = generator.generate(_TARGET, _PEERS, AS_OF, bsns_year="2024", reprt_code="11011")

    dart_overview_only = [
        opendart_json_response(load_opendart_json("company_overview_samsung.json")),
        opendart_json_response(load_opendart_json("company_overview_skhynix.json")),
        opendart_json_response(load_opendart_json("company_overview_dbhitek.json")),
        opendart_json_response(load_opendart_json("company_overview_samsung_electro.json")),
    ]
    dart_provider2, _ = _opendart_provider(dart_overview_only)
    kis_provider2, _ = _kis_provider(_happy_path_kis_responses())
    generator2 = ValuationReportGenerator(
        db_session, dart_provider2, kis_provider2, today_provider=lambda: AS_OF
    )
    report2 = generator2.generate(_TARGET, _PEERS, AS_OF, bsns_year="2024", reprt_code="11011")

    assert report1.valuation is not None and report2.valuation is not None
    assert report1.valuation.value_ranges == report2.valuation.value_ranges


def _target_profile(**overrides: object) -> CompanyProfile:
    fields: dict[str, object] = {
        "corp_code": "00126380",
        "corp_name": "삼성전자",
        "stock_code": "005930",
        "industry_code": "264",
        "eps": 100.0,
        "bps": 1000.0,
        "per": 10.0,
        "pbr": 1.0,
        "roe": 0.1,
        "price": 1000.0,
        "price_as_of": AS_OF,
        "financial_as_of": AS_OF,
    }
    fields.update(overrides)
    return CompanyProfile(**fields)  # type: ignore[arg-type]


def test_apply_post_derived_gate_rejects_evidence_with_unknown_corp_code() -> None:
    # S15.POST_DERIVED가 실제로 낯선(peer universe 밖) corp_code가 섞인 파생
    # evidence를 VERIFIED로 통과시키지 않고 제외 + checkpoint로 드러내는지 확인
    # (GPT 리뷰 2026-07-16 13:52 발견 — 이전에는 S21/S5 numeric_evidence가 S15를
    # 아예 거치지 않아 이런 오염을 잡을 방법이 없었다).
    good_evidence: dict[str, object] = {
        "numeric_evidence_id": "ev-good",
        "metric": "PEER_PER_MEDIAN",
        "source_ids": ["00164779"],
        "unit": "RATIO",
        "provenance": {"rule_version": "s21-peer-universe-1.0.0"},
    }
    tampered_evidence: dict[str, object] = {
        "numeric_evidence_id": "ev-tampered",
        "metric": "PEER_PER_MEDIAN",
        "source_ids": ["00999999"],  # target도 아니고 실제 peer universe에도 없는 기업
        "unit": "RATIO",
        "provenance": {"rule_version": "s21-peer-universe-1.0.0"},
    }
    checkpoints: list[Checkpoint] = []

    result = _apply_post_derived_gate(
        (good_evidence, tampered_evidence),
        _target_profile(),
        ["00126380", "00164779"],
        AS_OF,
        checkpoints,
        "TEST_EVIDENCE_POST_DERIVED_REJECTED",
    )

    assert [ev["numeric_evidence_id"] for ev in result] == ["ev-good"]
    assert any(c.code == "TEST_EVIDENCE_POST_DERIVED_REJECTED" for c in checkpoints)


def _eps_evidence(
    as_of: date = AS_OF, target_period: str = "2024-ANNUAL", unit: str = "KRW_PER_SHARE"
) -> dict[str, object]:
    return {
        "numeric_evidence_id": "target-eps-ev",
        "evidence_domain": "financial",
        "corp_code": "00126380",
        "metric": "EPS",
        "value": 100.0,
        "unit": unit,
        "target_period": target_period,
        "as_of": as_of.isoformat(),
        "formula": "NET_INCOME / SHARES_OUTSTANDING",
        "source_ids": ["fact-1"],
        "provenance": {"formula_version": "s3-financial-calculator-1.0.0"},
        "integrity_status": "VERIFIED",
    }


def _per_relative_evidence(source_ids: list[str]) -> dict[str, object]:
    return {
        "numeric_evidence_id": "per-relative-ev",
        "evidence_domain": "valuation",
        "corp_code": "00126380",
        "metric": "PER_RELATIVE",
        "value": 1000.0,
        "unit": "KRW",
        "target_period": AS_OF.isoformat(),
        "as_of": AS_OF.isoformat(),
        "formula": "target.EPS × peer PER(P25/중앙값/P75)",
        "source_ids": source_ids,
        "provenance": {
            "formula_version": "s5-valuation-scenarios-1.0.0",
            "low": 900.0,
            "high": 1100.0,
        },
        "integrity_status": "VERIFIED",
    }


def test_derived_check_input_includes_target_eps_component_for_per_relative() -> None:
    # PER_RELATIVE = target.EPS × peer PER — evidence의 provenance는 peer
    # corp_code뿐 아니라 target 자신의 EPS component도 가리켜야 감사 로그로
    # 실제 계산 출처를 추적할 수 있다(GPT 리뷰 2026-07-16 16:28 발견 — 이전에는
    # peer corp_code만 source_ids에 실렸다).
    target_profile = _target_profile(ratio_evidence={"EPS": _eps_evidence()})
    ev = _per_relative_evidence(["00164779"])

    check = _derived_check_input(ev, target_profile, ["00126380", "00164779"], AS_OF)

    assert "00164779" in check.source_ids
    assert "target-eps-ev" in check.source_ids
    assert check.source_components is not None
    units_by_corp = {c.corp_code: c.unit for c in check.source_components}
    assert units_by_corp["00164779"] == "RATIO"
    assert units_by_corp["00126380"] == "KRW_PER_SHARE"


def test_per_relative_evidence_rejected_when_target_eps_component_as_of_is_future() -> None:
    # target EPS component의 as_of가 valuation record의 as_of보다 미래면(오염·
    # 버그로 잘못된 기준일이 실린 상황) S5 evidence가 검증을 통과해서는 안 된다.
    from app.services.temporal_integrity import post_derived

    future_eps = _eps_evidence(as_of=date(2026, 12, 31))
    target_profile = _target_profile(ratio_evidence={"EPS": future_eps})
    ev = _per_relative_evidence(["00164779"])

    check = _derived_check_input(ev, target_profile, ["00126380", "00164779"], AS_OF)
    result = post_derived([check], AS_OF)

    assert result.rejected == ["per-relative-ev"]
    assert result.verified == []


def test_per_relative_evidence_rejected_when_target_eps_component_unit_is_wrong() -> None:
    # target EPS component는 항상 KRW_PER_SHARE여야 한다 — RATIO처럼 다른
    # role의 단위가 잘못 붙으면(예: 엉뚱한 evidence가 연결되는 버그) 거부해야
    # 한다(GPT 리뷰 2026-07-16 21:14 발견 — 이전에는 component의 unit을 전혀
    # 검사하지 않아 role에 안 맞는 값도 corp_code·as_of만 맞으면 통과했다).
    from app.services.temporal_integrity import post_derived

    wrong_unit_eps = _eps_evidence(unit="RATIO")
    target_profile = _target_profile(
        financial_period="2024-ANNUAL", ratio_evidence={"EPS": wrong_unit_eps}
    )
    ev = _per_relative_evidence(["00164779"])

    check = _derived_check_input(ev, target_profile, ["00126380", "00164779"], AS_OF)
    result = post_derived([check], AS_OF)

    assert result.rejected == ["per-relative-ev"]
    assert result.verified == []


def test_per_relative_evidence_rejected_when_target_eps_component_period_mismatches() -> None:
    # target EPS component의 target_period가 CompanyProfile.financial_period와
    # 다르면(예: 다른 분기 evidence가 잘못 연결됨) 거부해야 한다.
    from app.services.temporal_integrity import post_derived

    stale_period_eps = _eps_evidence(target_period="2023-ANNUAL")
    target_profile = _target_profile(
        financial_period="2024-ANNUAL", ratio_evidence={"EPS": stale_period_eps}
    )
    ev = _per_relative_evidence(["00164779"])

    check = _derived_check_input(ev, target_profile, ["00126380", "00164779"], AS_OF)
    result = post_derived([check], AS_OF)

    assert result.rejected == ["per-relative-ev"]
    assert result.verified == []


def test_per_relative_evidence_rejected_when_target_eps_component_is_missing() -> None:
    # target.ratio_evidence에 EPS가 없으면(S3 게이트에서 거부됐거나 애초에
    # 비어 있으면) S5 evidence가 peer 컴포넌트만으로 조용히 통과해서는 안
    # 된다 — target provenance를 강제하려는 목적이 무력화되기 때문이다(GPT
    # 리뷰 2026-07-16 21:14 발견).
    from app.services.temporal_integrity import post_derived

    target_profile = _target_profile(ratio_evidence={})
    ev = _per_relative_evidence(["00164779"])

    check = _derived_check_input(ev, target_profile, ["00126380", "00164779"], AS_OF)
    result = post_derived([check], AS_OF)

    assert result.rejected == ["per-relative-ev"]
    assert result.verified == []


def _fact(corp_code: str, fiscal_period: str = "2024-ANNUAL") -> FinancialFact:
    return FinancialFact(
        id=uuid.uuid4(),
        corp_code=corp_code,
        stock_code="005930",
        account_id="ifrs-full_ProfitLoss",
        account_name="당기순이익",
        raw_value="1000000000",
        raw_unit="KRW",
        normalized_value=1_000_000_000.0,
        normalized_unit="KRW",
        fiscal_period=fiscal_period,
        reprt_code="11011",
        report_type="ANNUAL",
        sj_div="IS",
        fs_div=FsDiv.CFS,
        is_cumulative=False,
        rcept_no="20250311000001",
        filed_at=date(2025, 3, 11),
        source_url="https://opendart.fss.or.kr/api/document.xml?rcept_no=20250311000001",
    )


def test_gate_ratio_evidence_rejects_ratio_backed_by_a_mismatched_corp_code_fact() -> None:
    # target/peer EPS/BPS/PER/PBR/ROE도 S21/S5 입력이자 API target_profile로
    # 노출되는 값이라 S15.POST_DERIVED를 통과해야 한다(GPT 리뷰 2026-07-16
    # 14:36 발견 — 이전에는 compute_ratios() 결과를 검증 없이 그대로 반환했다).
    # 근거 fact 중 하나가 다른 기업 것이면(오염) 그 metric은 거부돼야 한다.
    good_fact = _fact("00126380")
    tampered_fact = _fact("00999999")  # 낯선 기업 데이터가 섞여 들어온 상황
    ratios = [
        RatioResult(
            metric="EPS",
            value=Decimal("100"),
            unit="KRW_PER_SHARE",
            formula="NET_INCOME / SHARES_OUTSTANDING",
            formula_version="s3-financial-calculator-1.0.0",
        )
    ]
    checkpoints: list[Checkpoint] = []

    result = _gate_ratio_evidence(
        ratios,
        [good_fact, tampered_fact],
        "00126380",
        "2024-ANNUAL",
        date(2025, 3, 11),
        checkpoints,
    )

    assert "EPS" not in result
    assert any(c.code == "RATIO_POST_DERIVED_REJECTED_00126380" for c in checkpoints)


def test_gate_ratio_evidence_keeps_ratio_when_all_sources_are_consistent() -> None:
    good_fact = _fact("00126380")
    ratios = [
        RatioResult(
            metric="EPS",
            value=Decimal("100"),
            unit="KRW_PER_SHARE",
            formula="NET_INCOME / SHARES_OUTSTANDING",
            formula_version="s3-financial-calculator-1.0.0",
        )
    ]
    checkpoints: list[Checkpoint] = []

    result = _gate_ratio_evidence(
        ratios, [good_fact], "00126380", "2024-ANNUAL", date(2025, 3, 11), checkpoints
    )

    assert result["EPS"]["value"] == 100.0
    assert not any(c.code.startswith("RATIO_POST_DERIVED_REJECTED") for c in checkpoints)
