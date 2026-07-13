from datetime import date

from pydantic import BaseModel


class CompanyCandidatePayload(BaseModel):
    corp_code: str
    corp_name: str
    stock_code: str | None
    listing_status: str


class ResolvePayload(BaseModel):
    matched: bool
    corp_name: str | None = None
    corp_code: str | None = None
    stock_code: str | None = None
    market: str | None = None
    matched_by: str | None = None
    listing_status: str | None = None
    resolved_at: date
    candidates: list[CompanyCandidatePayload] = []
    reason_code: str | None = None


class IngestPayload(BaseModel):
    record_count: int
