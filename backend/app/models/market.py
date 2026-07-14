"""S13 시세·기업행위 수집 (docs/skills.md S13) — KIS Developers Open API.

RawMarketRecord is the immutable provider snapshot (mirrors RawDisclosureRecord,
app/models/disclosure.py). NORMALIZE only processes PERIOD_PRICE raw records into
day-indexed Quote rows (that endpoint alone returns a clean trade-date series);
CURRENT_PRICE raw records become a single latest-snapshot NumericEvidence plus the
SharesOutstanding row (KIS only echoes `lstn_stcn`/상장주식수 on the price endpoints,
not on a dedicated master-data endpoint); CORPORATE_ACTION raw records become
CorporateAction rows tagged by action type.

거래 캘린더 한계: KIS의 전용 국내휴장일조회 TR(CTCA0903R)은 모의투자(vps) 환경에서
"모의투자 TR이 아닙니다"(EGW02006)로 거부된다(2026-07-14 실제 호출로 확인) — 실전투자
전용이다. 따라서 거래 캘린더는 기간별시세 응답에 실제로 존재하는 거래일 집합에서
파생한다(빠진 날짜 = 휴장일이라는 암묵 가정, 문서화된 단순화).
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime, Enum, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class RawMarketRecordType(str, enum.Enum):
    CURRENT_PRICE = "CURRENT_PRICE"
    PERIOD_PRICE = "PERIOD_PRICE"
    CORPORATE_ACTION = "CORPORATE_ACTION"


class RawMarketRecord(Base):
    """Immutable KIS provider snapshot (docs/skills.md RawMarketRecord 등가)."""

    __tablename__ = "raw_market_records"

    raw_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    source_provider: Mapped[str] = mapped_column(String(50), nullable=False, default="kis")
    record_type: Mapped[RawMarketRecordType] = mapped_column(
        Enum(RawMarketRecordType, name="raw_market_record_type"), nullable=False
    )
    stock_code: Mapped[str] = mapped_column(String(6), nullable=False, index=True)
    target_period: Mapped[str | None] = mapped_column(String(50), nullable=True)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PriceBasis(str, enum.Enum):
    ADJUSTED = "ADJUSTED"  # 수정주가 (FID_ORG_ADJ_PRC=0)
    UNADJUSTED = "UNADJUSTED"  # 원주가 (FID_ORG_ADJ_PRC=1)


class Quote(Base):
    """S13 NORMALIZE `quotes` — one row per (stock_code, trade_date, price_basis).
    Values are kept as the provider's raw string form (같은 이유로 FinancialFactRow도
    문자열 유지 — 단위·정밀도 손실 없이 원본 보존, 실제 numeric_evidence 변환 시점에
    파싱한다)."""

    __tablename__ = "quotes"
    __table_args__ = (
        UniqueConstraint("stock_code", "trade_date", "price_basis", name="uq_quote"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    stock_code: Mapped[str] = mapped_column(String(6), nullable=False, index=True)
    corp_code: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    price_basis: Mapped[PriceBasis] = mapped_column(
        Enum(PriceBasis, name="price_basis"), nullable=False
    )
    open_price: Mapped[str] = mapped_column(String(20), nullable=False)
    high_price: Mapped[str] = mapped_column(String(20), nullable=False)
    low_price: Mapped[str] = mapped_column(String(20), nullable=False)
    close_price: Mapped[str] = mapped_column(String(20), nullable=False)
    volume: Mapped[str] = mapped_column(String(20), nullable=False)
    trading_value: Mapped[str] = mapped_column(String(20), nullable=False)
    # flng_cls_code != "00"은 그 거래일에 권리락 등 조정 처리가 있었다는 KIS 신호다
    # (docs/skills.md "액면분할·증자·배당락 metadata 보존") — 값 자체는 보존만 하고
    # 해석(어떤 기업행위인지)은 CorporateAction 조인으로 한다.
    adjustment_flag_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="kis")
    license: Mapped[str] = mapped_column(String(255), nullable=False)
    raw_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("raw_market_records.raw_record_id"), nullable=False
    )
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class SharesOutstanding(Base):
    """S13 NORMALIZE `shares_outstanding` — KIS의 상장주식수(`lstn_stcn`)/액면가
    (`stck_fcam`)는 현재가·기간별시세 응답에만 실려온다(전용 마스터 endpoint 없음)."""

    __tablename__ = "shares_outstanding"
    __table_args__ = (
        UniqueConstraint("stock_code", "as_of_date", name="uq_shares_outstanding"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    stock_code: Mapped[str] = mapped_column(String(6), nullable=False, index=True)
    corp_code: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    as_of_date: Mapped[date] = mapped_column(Date, nullable=False)
    shares_outstanding: Mapped[str] = mapped_column(String(20), nullable=False)
    face_value: Mapped[str] = mapped_column(String(20), nullable=False)
    raw_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("raw_market_records.raw_record_id"), nullable=False
    )
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class CorporateActionType(str, enum.Enum):
    DIVIDEND = "DIVIDEND"  # 예탁원정보(배당일정)
    BONUS_ISSUE = "BONUS_ISSUE"  # 예탁원정보(무상증자일정)
    PAID_IN_CAPITAL_INCREASE = "PAID_IN_CAPITAL_INCREASE"  # 예탁원정보(유상증자일정)
    FACE_VALUE_CHANGE = "FACE_VALUE_CHANGE"  # 예탁원정보(액면교체일정) — 액면분할/병합

    @property
    def tr_id(self) -> str:
        return {
            CorporateActionType.DIVIDEND: "HHKDB669102C0",
            CorporateActionType.BONUS_ISSUE: "HHKDB669101C0",
            CorporateActionType.PAID_IN_CAPITAL_INCREASE: "HHKDB669100C0",
            CorporateActionType.FACE_VALUE_CHANGE: "HHKDB669105C0",
        }[self]

    @property
    def path(self) -> str:
        return {
            CorporateActionType.DIVIDEND: "/uapi/domestic-stock/v1/ksdinfo/dividend",
            CorporateActionType.BONUS_ISSUE: "/uapi/domestic-stock/v1/ksdinfo/bonus-issue",
            CorporateActionType.PAID_IN_CAPITAL_INCREASE: (
                "/uapi/domestic-stock/v1/ksdinfo/paidin-capin"
            ),
            CorporateActionType.FACE_VALUE_CHANGE: "/uapi/domestic-stock/v1/ksdinfo/rev-split",
        }[self]


class CorporateAction(Base):
    """S13 NORMALIZE `corporate_actions` — 예탁원(KSD) 4종 일정 API를 하나의 조회
    가능한 이력으로 통합한다. `detail`은 provider가 반환한 type별 원본 필드를 그대로
    보존한다(환각 금지 — 문서가 각 유형의 필드를 전부 명세하지 않으므로 존재만 요구)."""

    __tablename__ = "corporate_actions"
    __table_args__ = (
        UniqueConstraint(
            "stock_code", "action_type", "record_date", name="uq_corporate_action"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    stock_code: Mapped[str] = mapped_column(String(6), nullable=False, index=True)
    corp_code: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    action_type: Mapped[CorporateActionType] = mapped_column(
        Enum(CorporateActionType, name="corporate_action_type"), nullable=False
    )
    record_date: Mapped[date] = mapped_column(Date, nullable=False)
    detail: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    raw_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("raw_market_records.raw_record_id"), nullable=False
    )
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
