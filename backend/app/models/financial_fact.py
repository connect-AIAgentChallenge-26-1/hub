"""S3 재무 정규화·계산 (docs/skills.md S3) — `FinancialFact`는 S2의
`eligible_financial_rows`(원본 문자열 그대로인 `FinancialFactRow`)를 계정 매핑 +
raw/normalized 값·단위 동시 보존 형태로 정규화한 것이다(contracts/schemas.js
FINANCIAL_FACT_SPEC과 필드 동일)."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class FsDiv(str, enum.Enum):
    CFS = "CFS"  # 연결재무제표
    OFS = "OFS"  # 별도재무제표


class FinancialFact(Base):
    """S3 NORMALIZE `facts` — account_id를 canonical `metric_key`로 매핑하고
    raw_value/raw_unit과 normalized_value/normalized_unit을 함께 보존한다
    (docs/skills.md S3 제약 "원본 문자열을 보존한다")."""

    __tablename__ = "financial_facts"
    __table_args__ = (
        # account_detail도 키에 포함한다 — FinancialFactRow와 같은 이유(SCE는 같은
        # account_id 아래 자본 구성요소별로 여러 행을 내고 account_detail로만
        # 구분된다, app/models/disclosure.py uq_financial_fact_row 주석 참고).
        UniqueConstraint(
            "rcept_no", "fs_div", "account_id", "sj_div", "is_cumulative", "account_detail",
            name="uq_financial_fact",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    corp_code: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    stock_code: Mapped[str] = mapped_column(String(6), nullable=False)
    account_id: Mapped[str] = mapped_column(String(255), nullable=False)
    account_name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_detail: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 매핑 후보가 모호하면 임의로 고르지 않고 metric_key를 비워 둔 채 raw만
    # 보존한다(docs/skills.md S3 제약) — 계산에는 metric_key가 있는 fact만 쓴다.
    metric_key: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    raw_value: Mapped[str] = mapped_column(String(30), nullable=False)
    raw_unit: Mapped[str] = mapped_column(String(10), nullable=False)
    normalized_value: Mapped[float] = mapped_column(Numeric(30, 4), nullable=False)
    normalized_unit: Mapped[str] = mapped_column(String(10), nullable=False, default="KRW")
    fiscal_period: Mapped[str] = mapped_column(String(20), nullable=False)
    reprt_code: Mapped[str] = mapped_column(String(5), nullable=False)
    report_type: Mapped[str] = mapped_column(String(10), nullable=False)
    sj_div: Mapped[str] = mapped_column(String(10), nullable=False)
    fs_div: Mapped[FsDiv] = mapped_column(Enum(FsDiv, name="fs_div"), nullable=False)
    # True면 회계연도 시작부터의 누적값(당기누적), False면 해당 보고서가 다루는
    # 단일 기간(연간 보고서는 연간 전체, 분기·반기 보고서는 그 분기·반기만) 실제값.
    is_cumulative: Mapped[bool] = mapped_column(Boolean, nullable=False)
    is_provisional: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_derived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    derivation_note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rcept_no: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    filed_at: Mapped[date] = mapped_column(Date, nullable=False)
    source_url: Mapped[str] = mapped_column(String(255), nullable=False)
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
