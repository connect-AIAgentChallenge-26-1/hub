import enum
import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime, Enum, Integer, LargeBinary, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ListingStatus(str, enum.Enum):
    LISTED = "LISTED"
    UNLISTED = "UNLISTED"


class RawCorpMasterBatch(Base):
    """Immutable record of one corpCode.xml ingest (S1 "OpenDART 고유번호와
    상장 종목 master 수집·버전 관리"). The raw zip bytes are kept so a past
    ingest can be re-parsed or audited without re-calling the provider."""

    __tablename__ = "raw_corp_master_batches"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    source_provider: Mapped[str] = mapped_column(String(50), nullable=False, default="opendart")
    raw_payload: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    record_count: Mapped[int] = mapped_column(Integer, nullable=False)
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Company(Base):
    """Current normalized projection of the corp master (S1). Upserted on
    each ingest; `RawCorpMasterBatch` is the immutable version history.
    `market`(KOSPI/KOSDAQ/KONEX) is intentionally absent — OpenDART's
    corpCode.xml does not classify market, and no market-data provider is
    chosen yet (T03). `listing_status` is the one fact this feed actually
    supports: whether `stock_code` is currently populated."""

    __tablename__ = "companies"

    corp_code: Mapped[str] = mapped_column(String(8), primary_key=True)
    corp_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    corp_eng_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stock_code: Mapped[str | None] = mapped_column(String(6), nullable=True, index=True)
    listing_status: Mapped[ListingStatus] = mapped_column(
        Enum(ListingStatus, name="listing_status"), nullable=False
    )
    source_modify_date: Mapped[date] = mapped_column(Date, nullable=False)
    source_batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class RawCompanyOverviewRecord(Base):
    """Immutable raw snapshot of OpenDART 기업개황(company.json) — T08 종목
    공부 리포트가 쓰는 대표자·설립일·주소 등(S1 확장, docs/skills.md migration
    기록 참고). `Company`와 달리 upsert projection을 두지 않는다 — 기업개황은
    검색 마스터처럼 자주 재사용되는 식별 정보가 아니라 리포트 생성 시점마다
    한 번 조회해 그 시점 값을 그대로 보여주는 것으로 충분하고(as_of가 리포트
    응답에 이미 기록됨), 별도 캐시/현재값 테이블을 두면 정정 이력 없이 최신
    상태를 덮어써 과거 리포트의 근거를 잃는다."""

    __tablename__ = "raw_company_overview_records"

    raw_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    source_provider: Mapped[str] = mapped_column(String(50), nullable=False, default="opendart")
    corp_code: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
