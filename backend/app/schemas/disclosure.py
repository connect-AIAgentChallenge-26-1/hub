import uuid
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field


class CollectPeriod(BaseModel):
    bgn_de: str
    end_de: str


class CollectDisclosuresRequest(BaseModel):
    operation: Literal["COLLECT"]
    corp_code: str
    as_of: date
    period: CollectPeriod
    reprt_codes: list[str] = Field(default_factory=list)
    fs_divs: list[str] = Field(default_factory=list)


class NormalizeDisclosuresRequest(BaseModel):
    operation: Literal["NORMALIZE"]
    eligible_raw_record_ids: list[uuid.UUID]
    normalization_policy_ref: str
    as_of: date


DisclosuresRequest = Annotated[
    CollectDisclosuresRequest | NormalizeDisclosuresRequest, Field(discriminator="operation")
]


class ProviderTraceEntry(BaseModel):
    raw_record_id: uuid.UUID
    record_type: str


class CollectPayload(BaseModel):
    raw_record_ids: list[uuid.UUID]
    provider_trace: list[ProviderTraceEntry]


class DisclosurePayload(BaseModel):
    rcept_no: str
    corp_code: str
    report_nm: str
    filed_at: date
    report_type: str
    is_correction: bool


class FinancialFactRowPayload(BaseModel):
    rcept_no: str
    corp_code: str
    fs_div: str
    sj_div: str
    account_id: str
    account_nm: str
    thstrm_amount: str | None
    filed_at: date


class DocumentChunkPayload(BaseModel):
    presentation_item_id: uuid.UUID
    rcept_no: str
    chunk_index: int
    quote: str
    chunk_offset: int


class CorrectionChainPayload(BaseModel):
    corp_code: str
    original_rcept_no: str
    correction_rcept_no: str
    matched_by: str


class NormalizePayload(BaseModel):
    disclosures: list[DisclosurePayload]
    eligible_financial_rows: list[FinancialFactRowPayload]
    document_chunks: list[DocumentChunkPayload]
    document_evidence: list[dict[str, object]]
    correction_chains: list[CorrectionChainPayload]
    trace: list[str]
