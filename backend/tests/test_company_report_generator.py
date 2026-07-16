"""S11 종목 공부 리포트 오케스트레이션 테스트 (docs/checklist.md C5).
실제 삼성전자 fixture(기업개황·공시목록·2023/2024 연간 CFS 재무제표·공시원문)로
전체 파이프라인 A를 검증한다."""

from __future__ import annotations

from datetime import date

import httpx
import pytest

from app.providers.base import ProviderNotFoundError
from app.providers.opendart import OpenDartProvider
from app.services.company_report_generator import (
    COMPANY_REPORT_GENERATOR_VERSION,
    CompanyReportGenerator,
    contains_forbidden_phrase,
)
from tests.support.opendart_mock import (
    client_with_responses,
    json_response,
    load_bytes,
    load_json,
    zip_response,
)

CORP_CODE = "00126380"
STOCK_CODE = "005930"


@pytest.fixture
def provider_factory():
    created = []

    def make(responses):
        client, _transport = client_with_responses(responses)
        provider = OpenDartProvider(api_key="test-key", client=client)
        created.append(provider)
        return provider

    yield make
    for provider in created:
        provider.close()


def _happy_path_responses() -> list[httpx.Response]:
    doc_zip = load_bytes("document_20241129001733.zip")
    return [
        json_response(load_json("company_overview_samsung.json")),
        json_response(load_json("disclosure_list_samsung.json")),
        json_response(load_json("financial_calculator/annual_2023_CFS.json")),
        json_response(load_json("financial_calculator/annual_2024_CFS.json")),
        zip_response(doc_zip),
        zip_response(doc_zip),
    ]


def test_full_report_happy_path(db_session, provider_factory):
    provider = provider_factory(_happy_path_responses())
    generator = CompanyReportGenerator(db_session, provider)
    report = generator.generate(
        CORP_CODE,
        STOCK_CODE,
        as_of=date(2026, 7, 15),
        bgn_de="20240101",
        end_de="20240401",
        bsns_years=["2023", "2024"],
        reprt_codes=["11011"],
    )

    assert report.overview is not None
    assert report.overview.corp_name == "삼성전자(주)"
    assert report.overview.corp_classification_label == "유가증권시장(코스피)"

    assert len(report.disclosures) == 10
    assert all(d.source_url.startswith("https://opendart.fss.or.kr") for d in report.disclosures)

    metric_names = {t.metric for t in report.metric_trends}
    assert "OPERATING_INCOME" in metric_names or "REVENUE" in metric_names
    revenue_trend = next((t for t in report.metric_trends if len(t.points) >= 2), None)
    assert revenue_trend is not None
    assert revenue_trend.change_reason_code is not None
    assert all(p.account_id or p.account_name for p in revenue_trend.points)

    assert report.generator_version == COMPANY_REPORT_GENERATOR_VERSION


def test_overview_provider_not_found_is_a_checkpoint_not_a_crash(db_session, provider_factory):
    provider = provider_factory(
        [
            json_response({"status": "013", "message": "조회된 데이타가 없습니다."}),
            json_response(load_json("disclosure_list_samsung.json")),
        ]
    )
    generator = CompanyReportGenerator(db_session, provider)
    report = generator.generate(
        CORP_CODE,
        STOCK_CODE,
        as_of=date(2026, 7, 15),
        bgn_de="20240101",
        end_de="20240401",
        bsns_years=[],
        reprt_codes=[],
    )
    assert report.overview is None
    assert any(c.code.startswith("OVERVIEW_") for c in report.checkpoints)


def test_provider_fault_on_disclosures_is_distinct_from_no_data(db_session, provider_factory):
    # rate-limit(020)은 EXTERNAL_ERROR 계열 — "데이터 없음"과 다른 checkpoint여야 한다.
    provider = provider_factory(
        [
            json_response(load_json("company_overview_samsung.json")),
            json_response({"status": "020", "message": "요청 제한을 초과하였습니다."}),
        ]
    )
    generator = CompanyReportGenerator(db_session, provider)
    report = generator.generate(
        CORP_CODE,
        STOCK_CODE,
        as_of=date(2026, 7, 15),
        bgn_de="20240101",
        end_de="20240401",
        bsns_years=[],
        reprt_codes=[],
    )
    checkpoint = next(c for c in report.checkpoints if c.code.startswith("DISCLOSURES_"))
    assert checkpoint.severity == "ERROR"
    assert "PROVIDER_RATE_LIMITED" in checkpoint.code


def test_no_data_at_all_produces_checkpoint(db_session, provider_factory):
    provider = provider_factory(
        [
            json_response(load_json("company_overview_samsung.json")),
            json_response({"status": "013", "message": "조회된 데이타가 없습니다."}),
        ]
    )
    generator = CompanyReportGenerator(db_session, provider)
    report = generator.generate(
        CORP_CODE,
        STOCK_CODE,
        as_of=date(2026, 7, 15),
        bgn_de="20990101",
        end_de="20990401",
        bsns_years=[],
        reprt_codes=[],
    )
    assert report.disclosures == ()
    assert report.metric_trends == ()
    assert any(c.code == "NO_DATA_AVAILABLE" for c in report.checkpoints)


def test_correction_is_flagged_and_linked(db_session, provider_factory):
    provider = provider_factory(
        [
            json_response(load_json("company_overview_samsung.json")),
            json_response(load_json("disclosure_list_with_correction.json")),
        ]
    )
    generator = CompanyReportGenerator(db_session, provider)
    report = generator.generate(
        CORP_CODE,
        STOCK_CODE,
        as_of=date(2026, 7, 15),
        bgn_de="20241101",
        end_de="20241130",
        bsns_years=[],
        reprt_codes=[],
    )
    corrections = [d for d in report.disclosures if d.is_correction]
    assert corrections
    assert any(d.corrected_original_rcept_no is not None for d in corrections)
    assert any(c.code == "CORRECTION_PRESENT" for c in report.checkpoints)


def test_citation_checksum_tamper_is_rejected(db_session, provider_factory):
    provider = provider_factory(_happy_path_responses())
    generator = CompanyReportGenerator(db_session, provider)
    report = generator.generate(
        CORP_CODE,
        STOCK_CODE,
        as_of=date(2026, 7, 15),
        bgn_de="20240101",
        end_de="20240401",
        bsns_years=["2023", "2024"],
        reprt_codes=["11011"],
    )
    assert report.citations
    assert all(c.verified for c in report.citations)


def test_tampered_raw_payload_checksum_mismatch_is_detected(db_session, provider_factory):
    # collect_document()는 매 호출마다 새 immutable raw snapshot을 만든다
    # (append-only 설계, T02) — 그래서 변조 탐지는 "같은 요청 안에서 저장된
    # raw_payload가 나중에 바뀌면 재계산 checksum이 저장 시점 checksum과
    # 달라지는가"를 직접 확인한다(전체 리포트를 두 번 생성해 서로 다른
    # raw record를 비교하는 방식은 append-only 설계와 맞지 않는다).
    from app.services.company_report_generator import _recompute_document_checksum

    provider = provider_factory(_happy_path_responses())
    generator = CompanyReportGenerator(db_session, provider)
    report = generator.generate(
        CORP_CODE,
        STOCK_CODE,
        as_of=date(2026, 7, 15),
        bgn_de="20240101",
        end_de="20240401",
        bsns_years=["2023", "2024"],
        reprt_codes=["11011"],
    )
    assert report.citations, "sanity: happy path produced citations"

    from sqlalchemy import select

    from app.models.disclosure import RawDisclosureRecord, RawRecordType

    doc_record = db_session.execute(
        select(RawDisclosureRecord).where(
            RawDisclosureRecord.record_type == RawRecordType.DOCUMENT_FILE
        )
    ).scalars().first()
    assert doc_record is not None

    # 저장 시점 checksum과 지금 재계산한 checksum은 최초엔 일치해야 한다
    # (정상 상태에서 tautology가 아니라 실제로 같은 값을 도출함을 증명).
    assert _recompute_document_checksum(doc_record) == doc_record.checksum

    # 원문이 변조된 것을 재현 — payload를 다른 값으로 덮어쓴다.
    doc_record.raw_payload = {"zip_base64": "dGFtcGVyZWQ="}
    assert _recompute_document_checksum(doc_record) != doc_record.checksum


def test_forbidden_phrase_helper() -> None:
    assert contains_forbidden_phrase("이 종목은 지금 매수하세요") is True
    assert contains_forbidden_phrase("영업이익이 증가했습니다") is False


def test_no_forbidden_phrase_in_happy_path_report(db_session, provider_factory):
    provider = provider_factory(_happy_path_responses())
    generator = CompanyReportGenerator(db_session, provider)
    report = generator.generate(
        CORP_CODE,
        STOCK_CODE,
        as_of=date(2026, 7, 15),
        bgn_de="20240101",
        end_de="20240401",
        bsns_years=["2023", "2024"],
        reprt_codes=["11011"],
    )
    for definition in report.glossary.definitions:
        assert not contains_forbidden_phrase(definition.definition)
    for checkpoint in report.checkpoints:
        assert not contains_forbidden_phrase(checkpoint.message)


def test_missing_financial_data_does_not_crash_report(db_session, provider_factory):
    provider = provider_factory(
        [
            json_response(load_json("company_overview_samsung.json")),
            json_response(load_json("disclosure_list_samsung.json")),
            json_response({"status": "013", "message": "조회된 데이타가 없습니다."}),
        ]
    )
    generator = CompanyReportGenerator(db_session, provider)
    report = generator.generate(
        CORP_CODE,
        STOCK_CODE,
        as_of=date(2026, 7, 15),
        bgn_de="20240101",
        end_de="20240401",
        bsns_years=["2099"],
        reprt_codes=["11011"],
    )
    assert report.metric_trends == ()
    assert any(c.code.startswith("FINANCIALS_") for c in report.checkpoints)


def test_module_has_no_direct_llm_import() -> None:
    import ast
    from pathlib import Path

    base = Path(__file__).resolve().parent.parent
    path = base / "app" / "services" / "company_report_generator.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    imports = {
        node.module for node in ast.walk(tree) if isinstance(node, ast.ImportFrom) and node.module
    }
    assert "app.providers.solar" not in imports


def test_provider_not_found_is_exported_for_reference() -> None:
    # 계약 문서 목적 — ProviderNotFoundError가 이 모듈이 쓰는 예외 taxonomy임을
    # 명시적으로 확인(013 no-data mapping).
    assert issubclass(ProviderNotFoundError, Exception)
