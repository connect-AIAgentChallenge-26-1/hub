"""FinancialFact/FinancialFactRow 저장 불변식 (docs/checklist.md C5): NULL인
account_detail·ord도 unique key로 실제 차단되는지, idempotent 저장 helper가
중복 대신 기존 행을 재사용하는지(GPT 리뷰 2026-07-15 22:14 발견)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.disclosure import FinancialFactRow, RawDisclosureRecord, RawRecordType
from app.models.financial_fact import FinancialFact, FsDiv
from app.repositories.financial_fact_repository import persist_facts_idempotently


def _raw_record(db_session: Session) -> RawDisclosureRecord:
    record = RawDisclosureRecord(
        source_provider="opendart",
        record_type=RawRecordType.FINANCIAL_STATEMENT_ROW,
        corp_code="00126380",
        raw_payload={"status": "000", "message": "정상"},
        checksum="test-checksum",
    )
    db_session.add(record)
    db_session.commit()
    db_session.refresh(record)
    return record


def _row(raw_record_id: uuid.UUID, **overrides: Any) -> FinancialFactRow:
    fields: dict[str, Any] = {
        "rcept_no": "20250311000001",
        "corp_code": "00126380",
        "bsns_year": "2024",
        "reprt_code": "11011",
        "fs_div": "CFS",
        "sj_div": "CF",
        "sj_nm": "현금흐름표",
        "account_id": "-표준계정코드 미사용-",
        "account_nm": "매각예정분류의 증감",
        "account_detail": None,
        "ord": None,
        "filed_at": date(2025, 3, 11),
        "is_eligible": True,
        "raw_record_id": raw_record_id,
    }
    fields.update(overrides)
    return FinancialFactRow(**fields)


def _fact(**overrides: Any) -> FinancialFact:
    fields: dict[str, Any] = {
        "corp_code": "00126380",
        "stock_code": "005930",
        "account_id": "-표준계정코드 미사용-",
        "account_name": "매각예정분류의 증감",
        "account_detail": None,
        "metric_key": None,
        "raw_value": "1000",
        "raw_unit": "KRW",
        "normalized_value": 1000.0,
        "normalized_unit": "KRW",
        "fiscal_period": "2024",
        "reprt_code": "11011",
        "report_type": "annual",
        "sj_div": "CF",
        "fs_div": FsDiv.CFS,
        "is_cumulative": False,
        "rcept_no": "20250311000001",
        "filed_at": date(2025, 3, 11),
        "source_url": "https://opendart.fss.or.kr/api/document.xml?rcept_no=20250311000001",
        "ord": None,
    }
    fields.update(overrides)
    return FinancialFact(**fields)


def test_financial_fact_row_unique_constraint_rejects_duplicate_null_account_detail_and_ord(
    db_session: Session,
) -> None:
    # CF의 "표준계정코드 미사용" 계정은 account_detail·ord가 둘 다 None인 채로
    # 여러 행이 나올 수 있다 — 이때도 진짜 중복(같은 rcept_no·fs_div·account_id·
    # sj_div)은 unique 제약이 막아야 한다. Postgres 기본 동작(NULL은 서로 distinct)
    # 에서는 이 두 행이 통과해버린다(GPT 리뷰 2026-07-15 22:14 발견 재현).
    raw_record = _raw_record(db_session)
    db_session.add(_row(raw_record.raw_record_id))
    db_session.commit()

    db_session.add(_row(raw_record.raw_record_id))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_financial_fact_unique_constraint_rejects_duplicate_null_account_detail_and_ord(
    db_session: Session,
) -> None:
    db_session.add(_fact())
    db_session.commit()

    db_session.add(_fact())
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_persist_facts_idempotently_reuses_existing_row_for_null_key_fields(
    db_session: Session,
) -> None:
    # normalize()는 매 호출마다 새 FinancialFact 객체를 만드는 순수 함수라, 같은
    # 입력을 두 번 넘겨도 두 번째는 새로 삽입하지 않고 첫 번째 행을 재사용해야
    # IntegrityError 없이 idempotent해야 한다.
    first = persist_facts_idempotently(db_session, [_fact()])
    second = persist_facts_idempotently(db_session, [_fact()])
    assert len(first) == 1
    assert len(second) == 1
    assert first[0].id == second[0].id
