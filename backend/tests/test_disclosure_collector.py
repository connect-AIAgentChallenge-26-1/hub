import base64
from datetime import date

import pytest

from app.models.disclosure import (
    CorrectionChain,
    Disclosure,
    FinancialFactRow,
    RawDisclosureRecord,
    RawRecordType,
)
from app.providers.opendart import OpenDartProvider
from app.services.disclosure_collector import (
    DisclosureCollector,
    classify_report_type,
    strip_correction_bracket,
)
from tests.support.opendart_mock import (
    client_with_responses,
    json_response,
    load_bytes,
    load_json,
    zip_response,
)


@pytest.fixture
def provider_factory():
    created = []

    def make(responses):
        client, transport = client_with_responses(responses)
        provider = OpenDartProvider(api_key="test-key", client=client)
        created.append(provider)
        return provider, transport

    yield make
    for provider in created:
        provider.close()


def test_strip_correction_bracket_extracts_base_name():
    base, is_correction = strip_correction_bracket("[기재정정]주요사항보고서(자기주식취득결정)")
    assert base == "주요사항보고서(자기주식취득결정)"
    assert is_correction is True


def test_strip_correction_bracket_leaves_plain_name_untouched():
    base, is_correction = strip_correction_bracket("사업보고서")
    assert base == "사업보고서"
    assert is_correction is False


@pytest.mark.parametrize(
    "report_nm,expected",
    [
        ("사업보고서", "ANNUAL"),
        ("반기보고서", "HALF"),
        ("분기보고서 (1분기보고서)", "Q1"),
        ("3분기보고서", "Q3"),
        ("[기재정정]사업보고서", "ANNUAL"),
        ("특수관계인과의보험거래", "OTHER"),
    ],
)
def test_classify_report_type(report_nm, expected):
    assert classify_report_type(report_nm).value == expected


# ---------------------------------------------------------------- COLLECT


def test_collect_disclosure_list_stores_immutable_raw_record(db_session, provider_factory):
    fixture = load_json("disclosure_list_samsung.json")
    provider, _ = provider_factory([json_response(fixture)])
    collector = DisclosureCollector(db_session, provider)

    record = collector.collect_disclosure_list("00126380", "20240101", "20240401")

    assert record.record_type is RawRecordType.DISCLOSURE_LIST_ITEM
    assert record.corp_code == "00126380"
    assert record.raw_payload["status"] == "000"
    assert record.checksum


def test_collect_financial_statements_stores_target_period(db_session, provider_factory):
    fixture = load_json("financial_statements_samsung.json")
    provider, _ = provider_factory([json_response(fixture)])
    collector = DisclosureCollector(db_session, provider)

    record = collector.collect_financial_statements("00126380", "2023", "11011", "CFS")

    assert record.record_type is RawRecordType.FINANCIAL_STATEMENT_ROW
    assert record.target_period == "2023-11011-CFS"


def test_collect_document_stores_base64_zip_payload(db_session, provider_factory):
    zip_bytes = load_bytes("document_20241129001733.zip")
    provider, _ = provider_factory([zip_response(zip_bytes)])
    collector = DisclosureCollector(db_session, provider)

    record = collector.collect_document("20241129001733", corp_code="00126380")

    assert record.record_type is RawRecordType.DOCUMENT_FILE
    assert record.source_native_id == "20241129001733"
    assert "zip_base64" in record.raw_payload


def test_collect_disclosure_list_uses_cache_on_repeated_identical_call(
    db_session, provider_factory
):
    fixture = load_json("disclosure_list_samsung.json")
    provider, transport = provider_factory([json_response(fixture)])
    collector = DisclosureCollector(db_session, provider)

    collector.collect_disclosure_list("00126380", "20240101", "20240401")
    collector.collect_disclosure_list("00126380", "20240101", "20240401")

    # 두 번째 호출은 캐시를 사용해 provider를 다시 부르지 않는다.
    assert transport.call_count == 1


def test_cache_hit_checksum_matches_original_fetch_for_korean_payload(db_session, provider_factory):
    # disclosure_list_samsung.json에는 한글 값(회사명·보고서명 등)이 들어 있다.
    # ensure_ascii 기본값(True) 차이로 캐시 hit checksum이 원본과 달라지던
    # 결함의 회귀 테스트 — 같은 raw_payload는 캐시를 거쳐도 같은 checksum이어야
    # "immutable snapshot" 의미가 성립한다.
    fixture = load_json("disclosure_list_samsung.json")
    provider, transport = provider_factory([json_response(fixture)])
    collector = DisclosureCollector(db_session, provider)

    first = collector.collect_disclosure_list("00126380", "20240101", "20240401")
    second = collector.collect_disclosure_list("00126380", "20240101", "20240401")

    assert transport.call_count == 1  # 두 번째 호출은 캐시 hit
    assert second.checksum == first.checksum


def test_collect_disclosure_list_cache_miss_on_different_params(db_session, provider_factory):
    fixture = load_json("disclosure_list_samsung.json")
    provider, transport = provider_factory([json_response(fixture), json_response(fixture)])
    collector = DisclosureCollector(db_session, provider)

    collector.collect_disclosure_list("00126380", "20240101", "20240401")
    collector.collect_disclosure_list("00126380", "20240401", "20240701")

    assert transport.call_count == 2


# --------------------------------------------------------------- NORMALIZE


def test_normalize_excludes_disclosures_filed_after_as_of(db_session, provider_factory):
    fixture = load_json("disclosure_list_with_correction.json")
    provider, _ = provider_factory([])
    collector = DisclosureCollector(db_session, provider)
    raw = RawDisclosureRecord(
        source_provider="opendart",
        record_type=RawRecordType.DISCLOSURE_LIST_ITEM,
        corp_code="00126380",
        raw_payload=fixture,
        checksum="test-checksum",
    )
    db_session.add(raw)
    db_session.commit()
    db_session.refresh(raw)

    result = collector.normalize([raw], as_of=date(2024, 11, 16))

    filed_dates = {d.filed_at for d in result.disclosures}
    assert all(d <= date(2024, 11, 16) for d in filed_dates)
    assert any("excluded" in t for t in result.trace)
    excluded_count = sum(1 for t in result.trace if "excluded" in t)
    assert excluded_count == len(fixture["list"]) - len(result.disclosures)


def test_normalize_resolves_correction_chain_to_shared_original(db_session, provider_factory):
    fixture = load_json("disclosure_list_with_correction.json")
    provider, _ = provider_factory([])
    collector = DisclosureCollector(db_session, provider)

    raw = RawDisclosureRecord(
        source_provider="opendart",
        record_type=RawRecordType.DISCLOSURE_LIST_ITEM,
        corp_code="00126380",
        raw_payload=fixture,
        checksum="test-checksum",
    )
    db_session.add(raw)
    db_session.commit()
    db_session.refresh(raw)

    result = collector.normalize([raw], as_of=date(2026, 7, 13))

    corrections = [d for d in result.disclosures if d.is_correction]
    assert len(corrections) == 2
    assert len(result.correction_chains) == 2
    original_rcept_nos = {c.original_rcept_no for c in result.correction_chains}
    assert original_rcept_nos == {"20241115000375"}
    assert all(c.matched_by == "BASE_REPORT_NAME_MATCH" for c in result.correction_chains)


def test_normalize_unresolvable_correction_is_not_silently_linked(db_session, provider_factory):
    # 원본을 찾을 수 없는 정정 공시는 임의로 짝짓지 않고 correction_chains에서
    # 빠진다 — "환각 금지" 원칙과 동일한 정신.
    provider, _ = provider_factory([])
    collector = DisclosureCollector(db_session, provider)
    payload = {
        "status": "000",
        "message": "정상",
        "list": [
            {
                "corp_code": "00126380",
                "corp_name": "삼성전자",
                "stock_code": "005930",
                "corp_cls": "Y",
                "report_nm": "[기재정정]존재하지않는원본보고서",
                "rcept_no": "20260101000001",
                "flr_nm": "삼성전자",
                "rcept_dt": "20260101",
                "rm": "",
            }
        ],
    }
    raw = RawDisclosureRecord(
        source_provider="opendart",
        record_type=RawRecordType.DISCLOSURE_LIST_ITEM,
        corp_code="00126380",
        raw_payload=payload,
        checksum="test-checksum",
    )
    db_session.add(raw)
    db_session.commit()
    db_session.refresh(raw)

    result = collector.normalize([raw], as_of=date(2026, 7, 13))

    assert len(result.disclosures) == 1
    assert result.disclosures[0].is_correction is True
    assert result.correction_chains == []


def test_normalize_financial_rows_marks_eligibility_by_filed_at(db_session, provider_factory):
    fixture = load_json("financial_statements_samsung.json")
    provider, _ = provider_factory([])
    collector = DisclosureCollector(db_session, provider)
    raw = RawDisclosureRecord(
        source_provider="opendart",
        record_type=RawRecordType.FINANCIAL_STATEMENT_ROW,
        corp_code="00126380",
        target_period="2023-11011-CFS",
        raw_payload=fixture,
        checksum="test-checksum",
    )
    db_session.add(raw)
    db_session.commit()
    db_session.refresh(raw)

    # rcept_no 20240312000736 -> filed_at 2024-03-12
    eligible_result = collector.normalize([raw], as_of=date(2024, 3, 12))
    assert len(eligible_result.eligible_financial_rows) == len(fixture["list"])

    db_session.query(FinancialFactRow).delete()
    db_session.commit()

    excluded_result = collector.normalize([raw], as_of=date(2024, 1, 1))
    assert len(excluded_result.eligible_financial_rows) == 0
    assert any("excluded" in t for t in excluded_result.trace)


def test_normalize_document_produces_chunks_and_neutral_evidence(db_session, provider_factory):
    zip_bytes = load_bytes("document_20241129001733.zip")
    provider, _ = provider_factory([])
    collector = DisclosureCollector(db_session, provider)
    raw = RawDisclosureRecord(
        source_provider="opendart",
        record_type=RawRecordType.DOCUMENT_FILE,
        corp_code="00126380",
        source_native_id="20241129001733",
        raw_payload={"zip_base64": base64.b64encode(zip_bytes).decode("ascii")},
        checksum="test-checksum",
    )
    db_session.add(raw)
    db_session.commit()
    db_session.refresh(raw)

    result = collector.normalize([raw], as_of=date(2026, 7, 13))

    assert len(result.document_chunks) >= 1
    assert all(c.rcept_no == "20241129001733" for c in result.document_chunks)
    assert len(result.document_evidence) == len(result.document_chunks)
    evidence = result.document_evidence[0]
    assert evidence["relation"] == "NEUTRAL"
    assert evidence["presentation_item_id"]
    assert "claim_id" not in evidence
    assert evidence["quote"]


def test_normalize_is_idempotent_across_repeated_calls(db_session, provider_factory):
    fixture = load_json("disclosure_list_with_correction.json")
    provider, _ = provider_factory([])
    collector = DisclosureCollector(db_session, provider)
    raw = RawDisclosureRecord(
        source_provider="opendart",
        record_type=RawRecordType.DISCLOSURE_LIST_ITEM,
        corp_code="00126380",
        raw_payload=fixture,
        checksum="test-checksum",
    )
    db_session.add(raw)
    db_session.commit()
    db_session.refresh(raw)

    collector.normalize([raw], as_of=date(2026, 7, 13))
    collector.normalize([raw], as_of=date(2026, 7, 13))

    total_disclosures = db_session.query(Disclosure).count()
    total_chains = db_session.query(CorrectionChain).count()
    assert total_disclosures == len(fixture["list"])
    assert total_chains == 2
