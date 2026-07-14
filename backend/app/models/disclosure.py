import enum
import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class RawRecordType(str, enum.Enum):
    DISCLOSURE_LIST_ITEM = "DISCLOSURE_LIST_ITEM"
    FINANCIAL_STATEMENT_ROW = "FINANCIAL_STATEMENT_ROW"
    DOCUMENT_FILE = "DOCUMENT_FILE"


class RawDisclosureRecord(Base):
    """Immutable provider record (docs/skills.md RawDisclosureRecord). Never
    updated or deleted after insert — corrections/re-collection add new rows,
    they do not overwrite this one. `raw_payload` preserves the provider's
    response verbatim (JSON dict for list/financials, base64 zip bytes for
    document downloads, handled by the service layer)."""

    __tablename__ = "raw_disclosure_records"

    raw_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    source_provider: Mapped[str] = mapped_column(String(50), nullable=False, default="opendart")
    source_native_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    record_type: Mapped[RawRecordType] = mapped_column(
        Enum(RawRecordType, name="raw_record_type"), nullable=False
    )
    corp_code: Mapped[str | None] = mapped_column(String(8), nullable=True, index=True)
    stock_code: Mapped[str | None] = mapped_column(String(6), nullable=True)
    published_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_period: Mapped[str | None] = mapped_column(String(20), nullable=True)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ReportType(str, enum.Enum):
    ANNUAL = "ANNUAL"  # 사업보고서
    Q1 = "Q1"  # 1분기보고서
    HALF = "HALF"  # 반기보고서
    Q3 = "Q3"  # 3분기보고서
    OTHER = "OTHER"  # 그 외 수시공시 등


REPRT_CODE_TO_REPORT_TYPE = {
    "11011": ReportType.ANNUAL,
    "11012": ReportType.HALF,
    "11013": ReportType.Q1,
    "11014": ReportType.Q3,
}


class Disclosure(Base):
    """Normalized disclosure (S2 NORMALIZE `disclosures`). `rcept_no` is the
    OpenDART receipt number and the join key back to financial rows/documents
    (docs/skills.md "`rcept_no`로 공시 접수일·보고서명·재무 행 조인")."""

    __tablename__ = "disclosures"

    rcept_no: Mapped[str] = mapped_column(String(20), primary_key=True)
    corp_code: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    report_nm: Mapped[str] = mapped_column(String(255), nullable=False)
    filed_at: Mapped[date] = mapped_column(Date, nullable=False)
    flr_nm: Mapped[str | None] = mapped_column(String(255), nullable=True)
    corp_cls: Mapped[str | None] = mapped_column(String(1), nullable=True)
    remark: Mapped[str | None] = mapped_column(String(255), nullable=True)
    report_type: Mapped[ReportType] = mapped_column(
        Enum(ReportType, name="report_type"), nullable=False, default=ReportType.OTHER
    )
    is_correction: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    raw_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("raw_disclosure_records.raw_record_id"), nullable=False
    )
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class CorrectionChain(Base):
    """Links a `[...정정]` disclosure back to the original it corrects.
    Matching is a heuristic (same corp_code + base report name with the
    correction bracket stripped + an earlier rcept_no) since OpenDART's
    list.json does not return an explicit "supersedes" reference — this is
    documented as a known limitation, not silently assumed accurate."""

    __tablename__ = "correction_chains"
    __table_args__ = (UniqueConstraint("correction_rcept_no", name="uq_correction_rcept_no"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    corp_code: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    original_rcept_no: Mapped[str] = mapped_column(String(20), nullable=False)
    correction_rcept_no: Mapped[str] = mapped_column(String(20), nullable=False)
    matched_by: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class FinancialFactRow(Base):
    """S2 NORMALIZE `eligible_financial_rows` — DART's raw financial
    statement row shape plus the S15 PRE_NORMALIZE eligibility flag
    (`filed_at <= as_of`, docs/skills.md 금융 데이터 정합성 계약). This is
    *not* the final FinancialFact (S3/T04 owns unit normalization, CFS/OFS
    selection, cumulative->single-quarter conversion) — it is S3's input."""

    __tablename__ = "financial_fact_rows"
    __table_args__ = (
        # account_detail도 키에 포함해야 한다 — 자본변동표(SCE)는 같은 rcept_no·
        # fs_div·account_id·sj_div(예: ifrs-full_ProfitLoss) 아래 자본금/이익잉여금
        # 등 서로 다른 구성요소를 account_detail로만 구분해 여러 행으로 낸다(T04에서
        # 실제 삼성전자 SCE 데이터로 발견 — account_detail을 빼면 이 행들이 "이미
        # 존재"로 오인되어 조용히 유실된다).
        UniqueConstraint(
            "rcept_no", "fs_div", "account_id", "sj_div", "account_detail",
            name="uq_financial_fact_row",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    rcept_no: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    corp_code: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    bsns_year: Mapped[str] = mapped_column(String(4), nullable=False)
    reprt_code: Mapped[str] = mapped_column(String(5), nullable=False)
    fs_div: Mapped[str] = mapped_column(String(3), nullable=False)  # CFS/OFS, as queried
    sj_div: Mapped[str] = mapped_column(String(10), nullable=False)
    sj_nm: Mapped[str] = mapped_column(String(50), nullable=False)
    account_id: Mapped[str] = mapped_column(String(255), nullable=False)
    account_nm: Mapped[str] = mapped_column(String(255), nullable=False)
    account_detail: Mapped[str | None] = mapped_column(String(255), nullable=True)
    thstrm_nm: Mapped[str | None] = mapped_column(String(50), nullable=True)
    thstrm_amount: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # 분기·반기 보고서의 IS/CIS 계정에서만 채워진다 — 있으면 "연초부터 누적값"이고
    # 이때 thstrm_amount는 이미 "해당 분기·반기 단일 기간" 실제값이다(T04에서 실제
    # 라이브 호출로 확인, app/services/financial_calculator.py 모듈 docstring 참고).
    # annual 보고서는 항상 빈 문자열, BS·CF 계정은 필드 자체가 없어 None이다.
    thstrm_add_amount: Mapped[str | None] = mapped_column(String(50), nullable=True)
    frmtrm_nm: Mapped[str | None] = mapped_column(String(50), nullable=True)
    frmtrm_amount: Mapped[str | None] = mapped_column(String(50), nullable=True)
    bfefrmtrm_nm: Mapped[str | None] = mapped_column(String(50), nullable=True)
    bfefrmtrm_amount: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ord: Mapped[str | None] = mapped_column(String(10), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    filed_at: Mapped[date] = mapped_column(Date, nullable=False)
    is_eligible: Mapped[bool] = mapped_column(Boolean, nullable=False)
    raw_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("raw_disclosure_records.raw_record_id"), nullable=False
    )
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class DocumentChunk(Base):
    """S2 NORMALIZE `document_chunks` + A용 `document_evidence`
    (docs/skills.md Evidence, `presentation_item_id`+`relation=NEUTRAL`).
    One row serves both roles rather than duplicating into two tables —
    the presentation/evidence fields are fixed constants for this skill."""

    __tablename__ = "document_chunks"
    __table_args__ = (UniqueConstraint("rcept_no", "chunk_index", name="uq_document_chunk"),)

    presentation_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    rcept_no: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    corp_code: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    quote: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_offset: Mapped[int] = mapped_column(Integer, nullable=False)
    target_period: Mapped[str | None] = mapped_column(String(20), nullable=True)
    filed_at: Mapped[date] = mapped_column(Date, nullable=False)
    integrity_status: Mapped[str] = mapped_column(String(20), nullable=False, default="VERIFIED")
    raw_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("raw_disclosure_records.raw_record_id"), nullable=False
    )
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ProviderCacheEntry(Base):
    """TTL cache for idempotent provider GET calls (docs/checklist.md C2
    "cache"). Keyed by a deterministic hash of (provider, path, params) so
    repeated identical requests within the TTL window skip the network call."""

    __tablename__ = "provider_cache_entries"

    cache_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_provider: Mapped[str] = mapped_column(String(50), nullable=False)
    response_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
