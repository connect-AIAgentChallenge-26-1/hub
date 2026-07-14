import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.schemas.structured_claim import StructuredClaim


class CollectNewsRequest(BaseModel):
    operation: Literal["COLLECT"]
    claim: StructuredClaim
    company_name: str
    display: int = 10


class NormalizeExternalRequest(BaseModel):
    operation: Literal["NORMALIZE"]
    eligible_raw_record_ids: list[uuid.UUID]
    company_name: str
    normalization_policy_ref: str
    as_of: date


ExternalEvidenceRequest = Annotated[
    CollectNewsRequest | NormalizeExternalRequest, Field(discriminator="operation")
]


class CollectPayload(BaseModel):
    raw_record_ids: list[uuid.UUID]
    query: str
    query_builder_version: str


class ExternalDocumentPayload(BaseModel):
    source_provider: str
    corp_code: str
    stock_code: str
    title: str
    description: str
    source_url: str
    published_at: datetime | None
    revised_at: datetime | None
    entity_matched: bool
    entity_match_text: str | None
    checksum: str


class NormalizePayload(BaseModel):
    external_documents: list[ExternalDocumentPayload]
    numeric_evidence: list[dict[str, object]]
    publication_times: list[str]
    entity_matches: list[dict[str, object]]
    provider_trace: list[str]
    trace: list[str]
    verifiable_status: str
