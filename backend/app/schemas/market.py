import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field


class CollectCurrentPriceRequest(BaseModel):
    operation: Literal["COLLECT_CURRENT_PRICE"]
    stock_code: str
    corp_code: str
    as_of: date


class CollectPeriodPriceRequest(BaseModel):
    operation: Literal["COLLECT_PERIOD_PRICE"]
    stock_code: str
    corp_code: str
    start: str
    end: str
    adjusted: bool
    as_of: date


class CollectCorporateActionRequest(BaseModel):
    operation: Literal["COLLECT_CORPORATE_ACTION"]
    stock_code: str
    corp_code: str
    action_type: Literal["DIVIDEND", "BONUS_ISSUE", "PAID_IN_CAPITAL_INCREASE", "FACE_VALUE_CHANGE"]
    start: str
    end: str
    as_of: date


class ManualInputRequest(BaseModel):
    operation: Literal["MANUAL_INPUT"]
    stock_code: str
    corp_code: str
    trade_date: date
    close_price: str
    source_note: str
    as_of: date


class NormalizeMarketRequest(BaseModel):
    operation: Literal["NORMALIZE"]
    eligible_raw_record_ids: list[uuid.UUID]
    corp_code: str
    normalization_policy_ref: str
    as_of: date


MarketRequest = Annotated[
    CollectCurrentPriceRequest
    | CollectPeriodPriceRequest
    | CollectCorporateActionRequest
    | ManualInputRequest
    | NormalizeMarketRequest,
    Field(discriminator="operation"),
]


class CollectPayload(BaseModel):
    raw_record_ids: list[uuid.UUID]
    provider: str
    license: str
    collected_at: datetime


class QuotePayload(BaseModel):
    stock_code: str
    corp_code: str
    trade_date: date
    price_basis: str
    open_price: str
    high_price: str
    low_price: str
    close_price: str
    volume: str
    trading_value: str
    adjustment_flag_code: str | None
    provider: str
    license: str


class CorporateActionPayload(BaseModel):
    stock_code: str
    corp_code: str
    action_type: str
    record_date: date
    detail: dict[str, object]


class SharesOutstandingPayload(BaseModel):
    stock_code: str
    corp_code: str
    as_of_date: date
    shares_outstanding: str
    face_value: str


class NormalizePayload(BaseModel):
    quotes: list[QuotePayload]
    corporate_actions: list[CorporateActionPayload]
    shares_outstanding: list[SharesOutstandingPayload]
    numeric_evidence: list[dict[str, object]]
    provider: str
    license: str
    trace: list[str]


class ManualInputPayload(BaseModel):
    quote: QuotePayload
