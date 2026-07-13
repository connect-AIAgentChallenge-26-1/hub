import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, Integer, LargeBinary, String, func
from sqlalchemy.dialects.postgresql import UUID
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
