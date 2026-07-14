import json
import uuid
from datetime import date
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.disclosure import FinancialFactRow, RawDisclosureRecord, RawRecordType

FIXTURES_DIR = (
    Path(__file__).resolve().parent / "fixtures" / "opendart" / "financial_calculator"
)


def _load(name: str) -> dict[str, Any]:
    result: dict[str, Any] = json.loads((FIXTURES_DIR / f"{name}.json").read_bytes())
    return result


def _register_and_get_token(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": f"{uuid.uuid4()}@example.com", "password": "correct-horse-battery"},
    )
    token: str = response.json()["data"]["access_token"]
    return token


def _seed_financial_fact_rows(
    db_session: Session,
    account_ids: set[str],
    fixture_name: str = "annual_2024_CFS",
    filed_at: date = date(2025, 3, 11),
) -> list[uuid.UUID]:
    raw_record = RawDisclosureRecord(
        source_provider="opendart",
        record_type=RawRecordType.FINANCIAL_STATEMENT_ROW,
        corp_code="00126380",
        raw_payload={"status": "000", "message": "정상"},
        checksum="test-checksum",
    )
    db_session.add(raw_record)
    db_session.commit()
    db_session.refresh(raw_record)

    fixture = _load(fixture_name)
    row_ids = []
    for item in fixture["list"]:
        if item["account_id"] not in account_ids:
            continue
        row = FinancialFactRow(
            rcept_no=item["rcept_no"],
            corp_code=item["corp_code"],
            bsns_year=item["bsns_year"],
            reprt_code=item["reprt_code"],
            fs_div="CFS",
            sj_div=item["sj_div"],
            sj_nm=item["sj_nm"],
            account_id=item["account_id"],
            account_nm=item["account_nm"],
            account_detail=item.get("account_detail"),
            thstrm_nm=item.get("thstrm_nm"),
            thstrm_amount=item.get("thstrm_amount"),
            thstrm_add_amount=item.get("thstrm_add_amount") or None,
            frmtrm_nm=item.get("frmtrm_nm"),
            frmtrm_amount=item.get("frmtrm_amount"),
            bfefrmtrm_nm=item.get("bfefrmtrm_nm"),
            bfefrmtrm_amount=item.get("bfefrmtrm_amount"),
            ord=item.get("ord"),
            currency=item.get("currency"),
            filed_at=filed_at,
            is_eligible=True,
            raw_record_id=raw_record.raw_record_id,
        )
        db_session.add(row)
        row_ids.append(row)
    db_session.commit()
    for row in row_ids:
        db_session.refresh(row)
    return [row.id for row in row_ids]


def test_financial_facts_requires_authentication(client):
    response = client.post(
        "/api/v1/financial-facts/calculate",
        json={
            "financial_fact_row_ids": [],
            "corp_code": "00126380",
            "stock_code": "005930",
            "as_of": "2026-07-13",
            "normalization_policy_ref": "s3-financial-calculator-1.0.0",
        },
    )
    assert response.status_code == 401


def test_calculate_returns_facts_and_ratios_from_real_annual_data(client, db_session):
    token = _register_and_get_token(client)
    row_ids = _seed_financial_fact_rows(
        db_session,
        {
            "ifrs-full_Revenue",
            "dart_OperatingIncomeLoss",
            "ifrs-full_ProfitLoss",
            "ifrs-full_Assets",
            "ifrs-full_Liabilities",
            "ifrs-full_Equity",
        },
    )
    response = client.post(
        "/api/v1/financial-facts/calculate",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "financial_fact_row_ids": [str(rid) for rid in row_ids],
            "corp_code": "00126380",
            "stock_code": "005930",
            "as_of": "2026-07-13",
            "normalization_policy_ref": "s3-financial-calculator-1.0.0",
            "price": "262500",
            "price_as_of": "2026-07-13",
            "shares_outstanding": "5846278608",
            "shares_outstanding_as_of": "2026-07-13",
        },
    )
    assert response.status_code == 200
    body = response.json()["data"]
    assert len(body["facts"]) >= 6
    metrics = {e["metric"] for e in body["numeric_evidence"]}
    assert "ROE" in metrics
    assert "DEBT_RATIO" in metrics
    assert "PER" in metrics
    assert "PBR" in metrics
    # every returned numeric_evidence entry must carry provenance back to facts
    for evidence in body["numeric_evidence"]:
        assert evidence["source_ids"]
    assert body["post_derived_rejected"] == []


def test_calculate_ignores_price_without_matching_as_of(client, db_session):
    # price는 있지만 price_as_of가 없으면 기준일을 검증할 수 없으므로 PER/PBR
    # 계산에 그 price를 쓰지 않는다(docs/checklist.md C4 "시세 기준일 일치").
    token = _register_and_get_token(client)
    row_ids = _seed_financial_fact_rows(
        db_session, {"ifrs-full_ProfitLoss", "ifrs-full_Equity"}
    )
    response = client.post(
        "/api/v1/financial-facts/calculate",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "financial_fact_row_ids": [str(rid) for rid in row_ids],
            "corp_code": "00126380",
            "stock_code": "005930",
            "as_of": "2026-07-13",
            "normalization_policy_ref": "s3-financial-calculator-1.0.0",
            "price": "262500",
            "shares_outstanding": "5846278608",
            "shares_outstanding_as_of": "2026-07-13",
        },
    )
    assert response.status_code == 200
    envelope = response.json()
    metrics = {e["metric"] for e in envelope["data"]["numeric_evidence"]}
    assert "PER" not in metrics
    assert "PBR" not in metrics
    assert any("price_as_of" in w for w in envelope["warnings"])


def test_calculate_rejects_future_price_as_of_via_post_derived(client, db_session):
    token = _register_and_get_token(client)
    row_ids = _seed_financial_fact_rows(
        db_session, {"ifrs-full_ProfitLoss", "ifrs-full_Equity"}
    )
    response = client.post(
        "/api/v1/financial-facts/calculate",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "financial_fact_row_ids": [str(rid) for rid in row_ids],
            "corp_code": "00126380",
            "stock_code": "005930",
            "as_of": "2026-07-13",
            "normalization_policy_ref": "s3-financial-calculator-1.0.0",
            "price": "262500",
            "price_as_of": "2026-08-01",  # after the request as_of
            "shares_outstanding": "5846278608",
            "shares_outstanding_as_of": "2026-07-13",
        },
    )
    assert response.status_code == 200
    envelope = response.json()
    # price_as_of가 요청 as_of보다 미래라 S15 POST_DERIVED가 PER/PBR를 거부한다
    # (record_id는 numeric_evidence_id UUID이므로 "몇 건 거부됐는지"와 "PER/PBR가
    # 최종 numeric_evidence에서 빠졌는지"로 검증한다).
    assert len(envelope["data"]["post_derived_rejected"]) >= 1
    metrics = {e["metric"] for e in envelope["data"]["numeric_evidence"]}
    assert "PER" not in metrics
    assert "PBR" not in metrics
    # EPS/BPS는 가격을 쓰지 않으므로 price_as_of가 미래라는 이유만으로 함께
    # 거부돼선 안 된다(GPT 리뷰 2026-07-14 15:25 — source_as_of를 지표별로
    # 분리하기 전에는 EPS/BPS까지 여기서 잘못 거부됐다).
    assert "EPS" in metrics
    assert "BPS" in metrics


def test_calculate_computes_ratios_for_every_period_not_only_the_latest(client, db_session):
    # 두 회계연도(2023·2024) 재무제표 행을 함께 넘기면 이전에는 filed_at이 가장
    # 최신인 기간만 계산 대상에 남고 2023년 데이터는 조용히 버려졌다
    # (GPT 리뷰 2026-07-14 15:25). 두 기간 모두 numeric_evidence·formulas에
    # 나타나야 한다.
    token = _register_and_get_token(client)
    account_ids = {"ifrs-full_ProfitLoss", "ifrs-full_Equity"}
    row_ids_2023 = _seed_financial_fact_rows(
        db_session, account_ids, fixture_name="annual_2023_CFS", filed_at=date(2024, 3, 8)
    )
    row_ids_2024 = _seed_financial_fact_rows(
        db_session, account_ids, fixture_name="annual_2024_CFS", filed_at=date(2025, 3, 11)
    )
    response = client.post(
        "/api/v1/financial-facts/calculate",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "financial_fact_row_ids": [str(rid) for rid in row_ids_2023 + row_ids_2024],
            "corp_code": "00126380",
            "stock_code": "005930",
            "as_of": "2026-07-13",
            "normalization_policy_ref": "s3-financial-calculator-1.0.0",
        },
    )
    assert response.status_code == 200
    body = response.json()["data"]
    periods = {e["target_period"] for e in body["numeric_evidence"]}
    assert "2023-ANNUAL" in periods
    assert "2024-ANNUAL" in periods
    formula_periods = {f["fiscal_period"] for f in body["formulas"]}
    assert "2023-ANNUAL" in formula_periods
    assert "2024-ANNUAL" in formula_periods


def test_calculate_with_unknown_row_id_warns_instead_of_failing(client, db_session):
    token = _register_and_get_token(client)
    unknown_id = "00000000-0000-0000-0000-000000000000"
    response = client.post(
        "/api/v1/financial-facts/calculate",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "financial_fact_row_ids": [unknown_id],
            "corp_code": "00126380",
            "stock_code": "005930",
            "as_of": "2026-07-13",
            "normalization_policy_ref": "s3-financial-calculator-1.0.0",
        },
    )
    assert response.status_code == 200
    envelope = response.json()
    assert envelope["status"] == "SUCCESS"
    assert any(unknown_id in w for w in envelope["warnings"])
    assert envelope["data"]["facts"] == []


def test_calculate_rejects_malformed_body_with_validation_envelope(client, db_session):
    token = _register_and_get_token(client)
    response = client.post(
        "/api/v1/financial-facts/calculate",
        headers={"Authorization": f"Bearer {token}"},
        json={"financial_fact_row_ids": []},
    )
    assert response.status_code == 422
    assert response.json()["status"] == "VALIDATION_ERROR"
