"""기능 C 근거 검증 라우터 — S8 오케스트레이션(S16 검산 ∥ S18 검색→S19 반증→
S20 인용)과 S9 체크리스트 (docs/skills.md S8·S9, docs/checklist.md C9·C10).

provider 장애는 재검색 후에도 EXTERNAL_ERROR로 보존한다(docs/skills.md S8).
"""

from fastapi import APIRouter, Depends, Request

from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.envelope import Envelope, Status, now_utc
from app.schemas.evidence_verify import (
    ChecklistItemPayload,
    ClaimResultPayload,
    SearchAttemptPayload,
    VerifyEvidencePayload,
    VerifyEvidenceRequest,
)
from app.services.checklist_generator import generate_checklist
from app.services.citation_integrity import verify_source_url
from app.services.evidence_orchestrator import (
    EVIDENCE_ORCHESTRATOR_VERSION,
    ClaimResult,
    EvidenceOrchestrator,
    StaticDocumentSource,
)
from app.services.evidence_retriever import SourceDocument

router = APIRouter(prefix="/api/v1/evidence", tags=["evidence"])


def _to_source_document(doc: object) -> SourceDocument:
    from app.schemas.evidence_verify import EvidenceDocumentInput

    assert isinstance(doc, EvidenceDocumentInput)
    return SourceDocument(
        document_id=doc.document_id,
        chunk_index=doc.chunk_index,
        text=doc.text,
        corp_code=doc.corp_code,
        source=doc.source,
        source_url=doc.source_url,
        filed_at=doc.filed_at,
        target_period=doc.target_period,
        chunk_offset=doc.chunk_offset,
        evidence_type=doc.evidence_type,
        rcept_no=doc.rcept_no,
        stored_checksum=doc.stored_checksum,
    )


def _claim_result_payload(result: ClaimResult) -> ClaimResultPayload:
    return ClaimResultPayload(
        claim_id=result.claim_id,
        verdict=result.verdict,
        reason_code=result.reason_code,
        calculation=result.calculation,
        used_evidence_ids=list(result.used_evidence_ids),
        missing_fields=list(result.missing_fields),
        verified_citation_ids=list(result.verified_citation_ids),
        rejected_citation_ids=list(result.rejected_citation_ids),
        citations=[dict(c) for c in result.citations],
        conflicts=[dict(c) for c in result.conflicts],
        search_attempts=[
            SearchAttemptPayload(
                attempt=a.attempt,
                retrieved=a.retrieved,
                counter=a.counter,
                conflicts=a.conflicts,
                coverage_met=a.coverage_met,
            )
            for a in result.search_attempts
        ],
        confidence_basis=result.confidence_basis,
    )


@router.post("/verify", response_model=Envelope[VerifyEvidencePayload])
def verify_evidence(
    body: VerifyEvidenceRequest,
    request: Request,
    _current_user: User = Depends(get_current_user),
) -> Envelope[VerifyEvidencePayload]:
    documents = [_to_source_document(d) for d in body.documents]
    orchestrator = EvidenceOrchestrator(
        search_budget=body.search_budget, timeout_seconds=body.timeout_seconds
    )
    outcome = orchestrator.verify(
        body.claims,
        body.numeric_evidence,
        StaticDocumentSource(documents),
        body.as_of,
        period_sequences=body.period_sequences,
        top_k=body.top_k,
    )

    started_at = now_utc()
    if outcome.status is not Status.SUCCESS:
        # provider 장애 등 — 데이터 없음과 구분해 EXTERNAL_ERROR로 보존한다.
        return Envelope[VerifyEvidencePayload](
            request_id=request.state.request_id,
            trace_id=request.state.trace_id,
            as_of=outcome.as_of,
            status=outcome.status,
            reason_code=outcome.reason_code,
            warnings=[],
            source_ids=[],
            model_or_rule_version=EVIDENCE_ORCHESTRATOR_VERSION,
            started_at=started_at,
            completed_at=now_utc(),
            data=None,
        )

    # citation canonical URL 링크 — 체크리스트 원문 이동에 쓴다.
    citation_urls: dict[str, str] = {}
    doc_by_chunk = {f"{d.document_id}:{d.chunk_index}": d for d in documents}
    for result in outcome.claim_results:
        for eid in result.verified_citation_ids:
            doc = doc_by_chunk.get(eid)
            if doc is not None:
                _ok, canonical = verify_source_url(doc.source, doc.source_url, doc.rcept_no)
                citation_urls[eid] = canonical

    checklist = generate_checklist(list(outcome.claim_results), citation_urls)
    payload = VerifyEvidencePayload(
        claim_results=[_claim_result_payload(r) for r in outcome.claim_results],
        group_results=outcome.group_results,
        evidence_plans=outcome.evidence_plans,
        search_logs=outcome.search_logs,
        checklist=[
            ChecklistItemPayload(
                item=c.item,
                related_claim_ids=list(c.related_claim_ids),
                status=c.status,
                source_links=list(c.source_links),
            )
            for c in checklist
        ],
        orchestrator_version=outcome.orchestrator_version,
    )
    return Envelope[VerifyEvidencePayload](
        request_id=request.state.request_id,
        trace_id=request.state.trace_id,
        as_of=outcome.as_of,
        status=Status.SUCCESS,
        warnings=[],
        source_ids=[],
        model_or_rule_version=EVIDENCE_ORCHESTRATOR_VERSION,
        started_at=started_at,
        completed_at=now_utc(),
        data=payload,
    )
