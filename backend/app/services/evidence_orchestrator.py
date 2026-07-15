"""S8 근거 계획·검증·검색 오케스트레이션 (docs/skills.md S8).

S17 계획 후 두 branch를 실행하고 병합한다:
- **수치 branch**: S16 결정론 검산(LLM이 덮어쓸 수 없음).
- **문서 branch**: S18 검색 → S19 반증 → S15.POST_DERIVED(수치 근거) → S20 인용
  게이트. 인용 검사에 실패한 근거로는 확정 verdict를 내리지 않는다.

두 branch가 끝난 뒤 5상태 판정·그룹 집계를 한다. 미충족 근거만 **최대 3회**
재검색하며(LangGraph 조건부 루프에 해당하는 결정론 state machine — 사용자
결정 2026-07-15로 T07은 순수 Python state graph로 구현, LangGraph 실바인딩은
T11/T13), 종료 기준은 S17 충족률·검색 예산·timeout이다(LLM 자기확신도 미사용).
provider 장애면 재검색 후에도 `EXTERNAL_ERROR`로 보존한다.

서술형 근거의 의미 해석(뉴스·테마 Claim의 LLM 판정)은 S23 게이트를 거친 LLM
단계이며(docs/skills.md S8), `UPSTAGE_API_KEY` 미발급으로 T07은 주입 가능한
`narrative_interpreter` 콜백으로만 계약을 검증한다(기본값 없음 → 결정론 안전
경로만, docs/checklist.md C9 한계). 결정론 경로는 수치 검산·상충·인용 게이트로
안전하게 `INSUFFICIENT_EVIDENCE`/`UNVERIFIABLE`을 낸다.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from typing import Protocol

from app.providers.base import ProviderError, map_provider_error
from app.schemas.envelope import Status
from app.schemas.structured_claim import StructuredClaim
from app.services import citation_integrity as s20
from app.services import evidence_planner as s17
from app.services.counter_evidence_retriever import (
    CounterEvidenceRetriever,
    classify_relation,
)
from app.services.deterministic_verifier import AtomicVerdictResult, verify_atomic, verify_group
from app.services.evidence_retriever import (
    DEFAULT_TOP_K,
    EvidenceRetriever,
    RetrievedEvidence,
    SourceDocument,
)
from app.services.vector_store import chunk_checksum
from app.services.verdict_aggregator import Verdict

EVIDENCE_ORCHESTRATOR_VERSION = "s8-evidence-orchestrator-1.0.0"
MAX_SEARCH_ATTEMPTS = 3


class DocumentSource(Protocol):
    """재검색 대상 문서를 제공한다. 재검색마다 `attempt`가 늘고, provider 구현은
    장애 시 `ProviderError`를 던져 EXTERNAL_ERROR로 종료시킬 수 있다."""

    def search(self, claim: StructuredClaim, attempt: int) -> list[SourceDocument]: ...


class StaticDocumentSource:
    """미리 적재된 문서를 그대로 돌려주는 in-process source(테스트·단일 호출용)."""

    def __init__(self, documents: list[SourceDocument]) -> None:
        self._documents = documents

    def search(self, claim: StructuredClaim, attempt: int) -> list[SourceDocument]:
        return [d for d in self._documents if d.corp_code == claim.corp_code]


@dataclass(frozen=True)
class SearchAttemptLog:
    attempt: int
    retrieved: int
    counter: int
    conflicts: int
    coverage_met: bool


@dataclass(frozen=True)
class ClaimResult:
    claim_id: str
    verdict: str
    reason_code: str
    calculation: dict[str, object] | None = None
    used_evidence_ids: tuple[str, ...] = field(default_factory=tuple)
    missing_fields: tuple[str, ...] = field(default_factory=tuple)
    verified_citation_ids: tuple[str, ...] = field(default_factory=tuple)
    rejected_citation_ids: tuple[str, ...] = field(default_factory=tuple)
    # 인용 원문 viewer용 상세 — evidence_id/quote/source_url/filed_at/target_period/
    # relation/method/integrity_score (docs/checklist.md C10 "인용 원문 viewer와
    # 출처·기준일 유지").
    citations: tuple[dict[str, object], ...] = field(default_factory=tuple)
    conflicts: tuple[dict[str, str], ...] = field(default_factory=tuple)
    search_attempts: tuple[SearchAttemptLog, ...] = field(default_factory=tuple)
    confidence_basis: str = ""


@dataclass(frozen=True)
class OrchestrationResult:
    status: Status
    reason_code: str
    as_of: date
    claim_results: tuple[ClaimResult, ...] = field(default_factory=tuple)
    group_results: dict[str, str] = field(default_factory=dict)
    evidence_plans: dict[str, list[str]] = field(default_factory=dict)
    search_logs: dict[str, list[str]] = field(default_factory=dict)
    orchestrator_version: str = EVIDENCE_ORCHESTRATOR_VERSION


# narrative_interpreter: (claim, verified_evidence_texts) -> relation 보강 결과.
# 반드시 S23 게이트를 거친 뒤 주입돼야 한다(docs/skills.md S8·공통 원칙 11).
NarrativeInterpreter = Callable[[StructuredClaim, list[str]], str]


def _to_citation_input(claim: StructuredClaim, ev: RetrievedEvidence) -> s20.CitationInput:
    doc = ev.document
    # stored_checksum: index() 시점에 IndexedChunk에 기록된 값(원문 색인 당시
    # 스냅샷). recomputed_checksum: 지금 인용문으로 쓰이는 doc.text로 다시 계산한
    # 값. 두 값을 같은 텍스트에서 동시에 계산하면 색인 이후 원문 변조를 절대
    # 탐지할 수 없으므로 서로 다른 시점의 값을 비교해야 한다(docs/skills.md S20).
    return s20.CitationInput(
        evidence_id=ev.chunk_id,
        quote=doc.text,
        source_text=doc.text,
        chunk_offset=doc.chunk_offset,
        source=doc.source,
        source_url=doc.source_url,
        rcept_no=doc.rcept_no,
        stored_checksum=ev.index_checksum,
        recomputed_checksum=chunk_checksum(doc.document_id, doc.chunk_index, doc.text),
    )


class EvidenceOrchestrator:
    def __init__(
        self,
        *,
        search_budget: int = MAX_SEARCH_ATTEMPTS,
        timeout_seconds: float | None = None,
        narrative_interpreter: NarrativeInterpreter | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._budget = min(search_budget, MAX_SEARCH_ATTEMPTS)
        self._timeout = timeout_seconds
        self._interpreter = narrative_interpreter
        self._clock = clock

    def verify(
        self,
        claims: list[StructuredClaim],
        numeric_evidence: list[dict[str, object]],
        document_source: DocumentSource,
        as_of: date,
        *,
        period_sequences: dict[str, list[str]] | None = None,
        top_k: int = DEFAULT_TOP_K,
    ) -> OrchestrationResult:
        period_sequences = period_sequences or {}
        claim_results: list[ClaimResult] = []
        evidence_plans: dict[str, list[str]] = {}
        search_logs: dict[str, list[str]] = {}

        for claim in claims:
            plan = s17.plan(claim)
            evidence_plans[claim.claim_id] = [r.key for r in plan.required_items]

            # 수치 branch — S16 결정론 검산(권위 있는 판정, LLM 덮어쓰기 불가).
            numeric = verify_atomic(claim, numeric_evidence, period_sequences.get(claim.claim_id))

            # 문서 branch — S18/S19/S20 재검색 루프. provider 장애면 즉시 종료.
            try:
                doc_outcome = self._document_branch(claim, document_source, top_k)
            except ProviderError as exc:
                mapping = map_provider_error(exc)
                search_logs[claim.claim_id] = [f"provider_fault={mapping.reason_code}"]
                return OrchestrationResult(
                    status=Status.EXTERNAL_ERROR,
                    reason_code=mapping.reason_code,
                    as_of=as_of,
                    evidence_plans=evidence_plans,
                    search_logs=search_logs,
                )
            search_logs[claim.claim_id] = list(doc_outcome.trace)

            claim_results.append(self._merge(claim, plan, numeric, doc_outcome))

        group_results = self._aggregate_groups(claims, claim_results)
        return OrchestrationResult(
            status=Status.SUCCESS,
            reason_code="OK",
            as_of=as_of,
            claim_results=tuple(claim_results),
            group_results=group_results,
            evidence_plans=evidence_plans,
            search_logs=search_logs,
        )

    @dataclass(frozen=True)
    class _DocOutcome:
        verified: tuple[RetrievedEvidence, ...]
        rejected_ids: tuple[str, ...]
        conflicts: tuple[dict[str, str], ...]
        citation_report: s20.CitationIntegrityReport
        citations: tuple[dict[str, object], ...]
        attempts: tuple[SearchAttemptLog, ...]
        trace: tuple[str, ...]

    def _document_branch(
        self, claim: StructuredClaim, source: DocumentSource, top_k: int
    ) -> _DocOutcome:
        started = self._clock()
        retriever = EvidenceRetriever()
        counter = CounterEvidenceRetriever(retriever)
        attempts: list[SearchAttemptLog] = []
        trace: list[str] = []
        supporting: tuple[RetrievedEvidence, ...] = ()
        conflicts: tuple[dict[str, str], ...] = ()

        for attempt in range(1, self._budget + 1):
            if self._timeout is not None and (self._clock() - started) > self._timeout:
                trace.append(f"timeout_after_attempt={attempt - 1}")
                break
            documents = source.search(claim, attempt)
            retriever.index(documents)
            # 재검색마다 threshold를 낮춰 미충족 근거 범위를 넓힌다.
            threshold = max(0.05, 0.15 - 0.05 * (attempt - 1))
            s18_result = retriever.retrieve(claim, top_k=top_k, score_threshold=threshold)
            supporting = s18_result.ranked_evidence
            counter_result = counter.retrieve(claim, supporting, top_k=top_k)
            conflicts = tuple(
                {
                    "supporting": c.supporting_chunk_id,
                    "refuting": c.refuting_chunk_id,
                    "reason": c.reason,
                }
                for c in counter_result.conflicts
            )
            coverage_met = s18_result.coverage >= 1.0
            attempts.append(
                SearchAttemptLog(
                    attempt=attempt,
                    retrieved=len(supporting),
                    counter=len(counter_result.counter_evidence),
                    conflicts=len(counter_result.conflicts),
                    coverage_met=coverage_met,
                )
            )
            trace.extend(s18_result.retrieval_trace)
            trace.extend(counter_result.search_trace)
            if coverage_met:
                break

        # S20 인용 게이트 — 지지 근거의 인용 무결성을 검사한다(반증 근거는
        # conflicts로 이미 반영됨).
        report = s20.check_citations([_to_citation_input(claim, ev) for ev in supporting])
        verified_ids = {c.evidence_id for c in report.verified_citations}
        verified = tuple(ev for ev in supporting if ev.chunk_id in verified_ids)
        rejected_ids = tuple(c.evidence_id for c in report.rejected_citations)
        method_by_id = {c.evidence_id: c.method for c in report.verified_citations}
        citations = tuple(
            {
                "evidence_id": ev.chunk_id,
                "quote": ev.document.text,
                "source_url": ev.document.source_url,
                "filed_at": ev.document.filed_at,
                "target_period": ev.document.target_period,
                "relation": classify_relation(claim, ev.document.text)[0],
                "method": method_by_id.get(ev.chunk_id, ""),
                "integrity_score": report.integrity_scores.get(ev.chunk_id, 0.0),
            }
            for ev in verified
        )
        return self._DocOutcome(
            verified=verified,
            rejected_ids=rejected_ids,
            conflicts=conflicts,
            citation_report=report,
            citations=citations,
            attempts=tuple(attempts),
            trace=tuple(trace),
        )

    def _merge(
        self,
        claim: StructuredClaim,
        plan: s17.EvidencePlan,
        numeric: AtomicVerdictResult,
        doc: _DocOutcome,
    ) -> ClaimResult:
        verified_ids = tuple(ev.chunk_id for ev in doc.verified)
        base = ClaimResult(
            claim_id=claim.claim_id,
            verdict=numeric.verdict.value,
            reason_code=numeric.reason_code,
            calculation=(
                {
                    "formula": numeric.calculation.formula,
                    "inputs": numeric.calculation.inputs,
                    "computed_value": numeric.calculation.computed_value,
                    "formula_version": numeric.calculation.formula_version,
                }
                if numeric.calculation
                else None
            ),
            used_evidence_ids=tuple(numeric.used_evidence_ids),
            missing_fields=tuple(numeric.missing_fields),
            verified_citation_ids=verified_ids,
            rejected_citation_ids=doc.rejected_ids,
            citations=doc.citations,
            conflicts=doc.conflicts,
            search_attempts=doc.attempts,
        )

        # 수치 검산이 확정(SUPPORTED/REFUTED)을 냈는데 그 근거의 인용이 전부
        # 실패했다면 확정하지 않는다(S20 제약) — INSUFFICIENT_EVIDENCE로 하향.
        confirmed = numeric.verdict in (Verdict.SUPPORTED, Verdict.REFUTED)
        numeric_grounded = bool(numeric.used_evidence_ids)
        if confirmed and numeric_grounded and not verified_ids and doc.rejected_ids:
            return _replace(
                base,
                verdict=Verdict.INSUFFICIENT_EVIDENCE.value,
                reason_code="CITATION_UNVERIFIED",
                confidence_basis="수치 검산은 확정했으나 인용 무결성 검사 실패로 확정 보류",
            )

        # 상충 근거가 있으면 확정 verdict라도 상충 사실을 confidence_basis에 남긴다.
        if doc.conflicts and confirmed:
            return _replace(
                base,
                confidence_basis=f"확정 판정과 함께 상충 근거 {len(doc.conflicts)}건 감지",
            )

        # 서술형(비수치) Claim에서 수치 근거가 없으면: 반증만 강하면 그 사실을 남기되
        # LLM 의미 판정 없이는 확정하지 않고 안전하게 INSUFFICIENT_EVIDENCE 유지.
        if not numeric_grounded and self._interpreter is None:
            basis = "수치 근거 없음·서술형 근거 의미 판정(LLM) 미적용 — 결정론 안전 판정"
            return _replace(base, confidence_basis=basis)

        return _replace(base, confidence_basis="수치 검산 기반 확정")

    def _aggregate_groups(
        self, claims: list[StructuredClaim], results: list[ClaimResult]
    ) -> dict[str, str]:
        by_id = {c.claim_id: c for c in claims}
        verdict_by_claim = {
            r.claim_id: AtomicVerdictResult(
                claim_id=r.claim_id, verdict=Verdict(r.verdict), reason_code=r.reason_code
            )
            for r in results
        }
        grouped: dict[str, list[AtomicVerdictResult]] = {}
        for r in results:
            claim = by_id[r.claim_id]
            key = claim.claim_group_id or r.claim_id
            grouped.setdefault(key, []).append(verdict_by_claim[r.claim_id])
        return {key: verify_group(items).value for key, items in grouped.items()}


def _replace(result: ClaimResult, **changes: object) -> ClaimResult:
    from dataclasses import replace

    return replace(result, **changes)  # type: ignore[arg-type]


__all__ = [
    "EvidenceOrchestrator",
    "OrchestrationResult",
    "ClaimResult",
    "SearchAttemptLog",
    "StaticDocumentSource",
    "DocumentSource",
    "classify_relation",
    "EVIDENCE_ORCHESTRATOR_VERSION",
]
