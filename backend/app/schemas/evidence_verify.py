"""기능 C 근거 검증(S8·S9·S18~S20) API 요청·응답 계약 (docs/skills.md S8·S9,
docs/checklist.md C10). 라우터는 이미 확보한 근거(numeric_evidence)와 검색
대상 문서(documents)를 받아 S8 오케스트레이션 + S9 체크리스트를 반환한다."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field

from app.schemas.structured_claim import StructuredClaim


class EvidenceDocumentInput(BaseModel):
    """S2 document_chunk / S14 external_document 하나에 대응하는 검색 대상."""

    document_id: str
    chunk_index: int = 0
    text: str
    corp_code: str
    source: str
    source_url: str
    filed_at: str
    target_period: str
    chunk_offset: int = 0
    evidence_type: str
    rcept_no: str = ""
    # S2/S14 raw snapshot 또는 index 시점에 저장된 checksum. 없으면 현재
    # text로 계산해 정상 dev/test 경로를 유지한다.
    stored_checksum: str = ""


class VerifyEvidenceRequest(BaseModel):
    claims: list[StructuredClaim]
    # S3/S13/S14 NORMALIZE + S15 POST_DERIVED를 이미 통과한 NumericEvidence.
    numeric_evidence: list[dict[str, object]] = Field(default_factory=list)
    # S18/S19가 검색할 문서(공시 chunk·외부 문서). 비면 문서 branch는 근거 0건.
    documents: list[EvidenceDocumentInput] = Field(default_factory=list)
    as_of: date
    period_sequences: dict[str, list[str]] = Field(default_factory=dict)
    search_budget: int = 3
    timeout_seconds: float | None = None
    top_k: int = 5


class SearchAttemptPayload(BaseModel):
    attempt: int
    retrieved: int
    counter: int
    conflicts: int
    coverage_met: bool


class ClaimResultPayload(BaseModel):
    claim_id: str
    verdict: str
    reason_code: str
    calculation: dict[str, object] | None
    used_evidence_ids: list[str]
    missing_fields: list[str]
    verified_citation_ids: list[str]
    rejected_citation_ids: list[str]
    citations: list[dict[str, object]]
    conflicts: list[dict[str, str]]
    search_attempts: list[SearchAttemptPayload]
    confidence_basis: str


class ChecklistItemPayload(BaseModel):
    item: str
    related_claim_ids: list[str]
    status: str
    source_links: list[str]


class VerifyEvidencePayload(BaseModel):
    claim_results: list[ClaimResultPayload]
    group_results: dict[str, str]
    evidence_plans: dict[str, list[str]]
    search_logs: dict[str, list[str]]
    checklist: list[ChecklistItemPayload]
    orchestrator_version: str
