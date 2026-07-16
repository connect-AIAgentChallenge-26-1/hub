"""`FinancialFact` 저장 idempotency (docs/skills.md S3, docs/checklist.md C5).

`FinancialCalculator.normalize()`는 순수 함수라 매 호출마다 새 `FinancialFact`
객체를 만든다 — 같은 회사·기간을 다시 계산할 때(리포트 새로고침, API 재호출 등)
그대로 `db.add()`하면 `uq_financial_fact` unique constraint 위반이 난다(T08
`CompanyReportGenerator`에서 재현). 저장 전 존재 여부를 확인해 이미 있는 행은
재사용한다.

`/api/v1/financial-facts/calculate`(T04 공유 라우터)와 S11
`CompanyReportGenerator`가 이 함수를 공유해 같은 idempotency를 보장한다(GPT
리뷰 2026-07-15 22:14 발견 — 라우터에는 이 보호가 빠져 있어 같은
`financial_fact_row_ids`로 재호출하면 `IntegrityError`가 났다).
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.financial_fact import FinancialFact


def persist_facts_idempotently(db: Session, facts: list[FinancialFact]) -> list[FinancialFact]:
    persisted: list[FinancialFact] = []
    seen_in_batch: set[tuple[str, str, str, str, bool, str | None, str | None]] = set()
    for fact in facts:
        key = (
            fact.rcept_no,
            fact.fs_div.value,
            fact.account_id,
            fact.sj_div,
            fact.is_cumulative,
            fact.account_detail,
            fact.ord,
        )
        if key in seen_in_batch:
            continue
        seen_in_batch.add(key)
        existing = db.execute(
            select(FinancialFact).where(
                FinancialFact.rcept_no == fact.rcept_no,
                FinancialFact.fs_div == fact.fs_div,
                FinancialFact.account_id == fact.account_id,
                FinancialFact.sj_div == fact.sj_div,
                FinancialFact.is_cumulative == fact.is_cumulative,
                FinancialFact.account_detail == fact.account_detail,
                FinancialFact.ord == fact.ord,
            )
        ).scalar_one_or_none()
        if existing is not None:
            persisted.append(existing)
            continue
        db.add(fact)
        persisted.append(fact)
    db.commit()
    for fact in persisted:
        db.refresh(fact)
    return persisted
