"""S8 오케스트레이션 테스트 (docs/checklist.md C9·C10): 수치 branch ∥ 문서
branch 병합, 인용 게이트로 확정 보류, provider 장애 EXTERNAL_ERROR 보존,
최대 3회 재검색 종료, 그룹 집계, 상충 표시, 결정론."""

from __future__ import annotations

from dataclasses import replace
from datetime import date

import pytest

from app.providers.base import ProviderRateLimitedError
from app.schemas.envelope import Status
from app.schemas.structured_claim import Comparator, ComparatorOp, StructuredClaim
from app.services import citation_integrity as s20
from app.services import evidence_orchestrator as orchestrator_module
from app.services.evidence_orchestrator import (
    DocumentSource,
    EvidenceOrchestrator,
    StaticDocumentSource,
    _to_citation_input,
)
from app.services.evidence_retriever import (
    DEFAULT_SCORE_THRESHOLD,
    DEFAULT_TOP_K,
    EvidenceRetriever,
    RetrievalResult,
    SourceDocument,
)


def _claim(
    claim_id: str = "c1", op: ComparatorOp = "MULTIPLE", group: str | None = None
) -> StructuredClaim:
    return StructuredClaim(
        claim_id=claim_id,
        claim_group_id=group,
        original_span="삼성전자 3분기 영업이익이 2배 증가했다",
        corp_code="00126380",
        stock_code="005930",
        claim_type="COMPARISON",
        metric="OPERATING_INCOME",
        evidence_domain="financial",
        comparator=Comparator(op=op, comparison_operator="GTE", target_value=2.0, target_unit="x"),
        direction="증가",
        current_period="2025Q3",
        comparison_period="2024Q3",
        as_of=date(2026, 7, 15),
        verifiable=True,
    )


def _ne(period: str, value: float, eid: str) -> dict[str, object]:
    return {
        "numeric_evidence_id": eid,
        "corp_code": "00126380",
        "metric": "OPERATING_INCOME",
        "evidence_domain": "financial",
        "target_period": period,
        "value": value,
        "integrity_status": "VERIFIED",
    }


def _doc(document_id: str, text: str, url: str | None = None) -> SourceDocument:
    return SourceDocument(
        document_id, 0, text, "00126380", "disclosure",
        url or f"https://opendart.fss.or.kr/api/document.xml?rcept_no={document_id}",
        "2025-11-14", "2025Q3", 0, "DISCLOSURE_DOCUMENT_CHUNK", document_id,
    )


_AS_OF = date(2026, 7, 15)


def test_numeric_supported_with_verified_citation() -> None:
    orch = EvidenceOrchestrator()
    docs = [_doc("rc1", "삼성전자 3분기 영업이익이 크게 증가했다.")]
    out = orch.verify([_claim()], [_ne("2025Q3", 300, "n1"), _ne("2024Q3", 100, "n2")],
                       StaticDocumentSource(docs), _AS_OF)
    r = out.claim_results[0]
    assert r.verdict == "SUPPORTED"
    assert r.reason_code == "MULTIPLE_COMPARISON"
    assert out.status is Status.SUCCESS


def test_citation_failure_downgrades_confirmed_verdict() -> None:
    # 수치 검산은 SUPPORTED지만 근거 문서의 URL이 위조되어 인용 검증 실패 →
    # 확정하지 않고 INSUFFICIENT_EVIDENCE로 하향(docs/skills.md S20 제약).
    orch = EvidenceOrchestrator()
    docs = [_doc("rc1", "삼성전자 3분기 영업이익이 크게 증가했다.", url="https://evil.example/x")]
    out = orch.verify([_claim()], [_ne("2025Q3", 300, "n1"), _ne("2024Q3", 100, "n2")],
                      StaticDocumentSource(docs), _AS_OF)
    r = out.claim_results[0]
    assert r.verdict == "INSUFFICIENT_EVIDENCE"
    assert r.reason_code == "CITATION_UNVERIFIED"
    assert r.rejected_citation_ids


def test_citation_input_checksum_survives_untampered_round_trip() -> None:
    # 정상 경로(변조 없음)에서는 index() 시점 checksum과 인용 검사 시점 재계산
    # checksum이 여전히 같은 텍스트에서 나오므로 일치해야 한다 — 아래 변조
    # 테스트가 통과하기 위한 회귀 방지(fix가 정상 경로를 깨뜨리지 않았는지).
    retriever = EvidenceRetriever()
    retriever.index([_doc("rc1", "삼성전자 3분기 영업이익이 크게 증가했다.")])
    ev = retriever.retrieve(_claim(), score_threshold=0.0).ranked_evidence[0]
    citation = _to_citation_input(_claim(), ev)
    assert citation.stored_checksum == citation.recomputed_checksum
    assert s20.check_citation(citation).checksum_ok is True


def test_citation_input_detects_post_index_text_tampering() -> None:
    # GPT 리뷰 2026-07-15 15:38 발견: stored_checksum·recomputed_checksum이 둘 다
    # 현재 doc.text로 다시 계산돼 항상 같은 값이 됐던 결함. 이제 stored_checksum은
    # index() 시점 값을 그대로 들고 오므로, index 이후 원문이 바뀌면(quote로 쓰이는
    # 텍스트가 색인 당시와 달라지면) 두 값이 실제로 어긋나야 한다.
    retriever = EvidenceRetriever()
    retriever.index([_doc("rc1", "삼성전자 3분기 영업이익이 크게 증가했다.")])
    ev = retriever.retrieve(_claim(), score_threshold=0.0).ranked_evidence[0]

    tampered = replace(ev, document=replace(ev.document, text="변조된 원문 텍스트입니다."))
    citation = _to_citation_input(_claim(), tampered)
    assert citation.stored_checksum != citation.recomputed_checksum

    result = s20.check_citation(citation)
    assert result.checksum_ok is False
    assert result.verified is False
    assert "checksum" in result.reason


def test_post_index_tampering_downgrades_confirmed_verdict_via_orchestrator(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # 위 단위 테스트를 S8 오케스트레이션 전체 경로로 재현: 색인 이후 원문이
    # 변조된 근거만 있으면 수치 검산이 SUPPORTED라도 확정하지 않고
    # CITATION_UNVERIFIED로 하향해야 한다(URL 위조 테스트의 checksum 버전).
    class TamperingRetriever(EvidenceRetriever):
        def retrieve(
            self,
            claim: StructuredClaim,
            *,
            query_text: str | None = None,
            top_k: int = DEFAULT_TOP_K,
            score_threshold: float = DEFAULT_SCORE_THRESHOLD,
            extra_where: dict[str, str | int] | None = None,
        ) -> RetrievalResult:
            result = super().retrieve(
                claim,
                query_text=query_text,
                top_k=top_k,
                score_threshold=score_threshold,
                extra_where=extra_where,
            )
            tampered = tuple(
                replace(ev, document=replace(ev.document, text=ev.document.text + " [변조]"))
                for ev in result.ranked_evidence
            )
            return replace(result, ranked_evidence=tampered)

    monkeypatch.setattr(orchestrator_module, "EvidenceRetriever", TamperingRetriever)

    orch = EvidenceOrchestrator()
    docs = [_doc("rc1", "삼성전자 3분기 영업이익이 크게 증가했다.")]
    out = orch.verify([_claim()], [_ne("2025Q3", 300, "n1"), _ne("2024Q3", 100, "n2")],
                      StaticDocumentSource(docs), _AS_OF)
    r = out.claim_results[0]
    assert r.verdict == "INSUFFICIENT_EVIDENCE"
    assert r.reason_code == "CITATION_UNVERIFIED"
    assert r.rejected_citation_ids


def test_provider_fault_preserved_as_external_error() -> None:
    class FaultySource:
        def search(self, claim: StructuredClaim, attempt: int) -> list[SourceDocument]:
            raise ProviderRateLimitedError("rate limited")

    orch = EvidenceOrchestrator()
    out = orch.verify([_claim()], [_ne("2025Q3", 300, "n1"), _ne("2024Q3", 100, "n2")],
                      FaultySource(), _AS_OF)
    assert out.status is Status.EXTERNAL_ERROR
    assert out.reason_code == "PROVIDER_RATE_LIMITED"
    assert out.claim_results == ()


def test_retry_loop_terminates_within_budget() -> None:
    attempts_seen: list[int] = []

    class CountingSource:
        def search(self, claim: StructuredClaim, attempt: int) -> list[SourceDocument]:
            attempts_seen.append(attempt)
            # 관련 문서를 절대 주지 않아 coverage가 계속 미충족 → 예산까지 재검색.
            return [_doc("noise", "급식 메뉴 안내 문서.")]

    orch = EvidenceOrchestrator(search_budget=3)
    out = orch.verify([_claim()], [], CountingSource(), _AS_OF)
    assert max(attempts_seen) <= 3
    assert len(out.claim_results[0].search_attempts) <= 3


def _claim_metric(claim_id: str, metric: str, group: str) -> StructuredClaim:
    c = _claim(claim_id, op="MULTIPLE", group=group)
    return c.model_copy(update={"metric": metric})


def _ne_metric(metric: str, period: str, value: float, eid: str) -> dict[str, object]:
    e = _ne(period, value, eid)
    e["metric"] = metric
    return e


def test_group_aggregation_partially_supported() -> None:
    # 같은 그룹에 SUPPORTED와 REFUTED 원자 결과 → 그룹 PARTIALLY_SUPPORTED.
    orch = EvidenceOrchestrator()
    c_sup = _claim_metric("c1", "OPERATING_INCOME", "g1")
    c_ref = _claim_metric("c2", "NET_INCOME", "g1")
    docs = [_doc("rc1", "삼성전자 3분기 영업이익이 크게 증가했다.")]
    ne = [
        _ne_metric("OPERATING_INCOME", "2025Q3", 300, "n1"),  # 3배 >= 2배 → SUPPORTED
        _ne_metric("OPERATING_INCOME", "2024Q3", 100, "n2"),
        _ne_metric("NET_INCOME", "2025Q3", 120, "n3"),  # 1.2배 < 2배 → REFUTED
        _ne_metric("NET_INCOME", "2024Q3", 100, "n4"),
    ]
    out = orch.verify([c_sup, c_ref], ne, StaticDocumentSource(docs), _AS_OF)
    verdicts = {r.claim_id: r.verdict for r in out.claim_results}
    assert verdicts["c1"] == "SUPPORTED"
    assert verdicts["c2"] == "REFUTED"
    assert out.group_results["g1"] == "PARTIALLY_SUPPORTED"


def test_conflict_is_surfaced_in_confidence_basis() -> None:
    orch = EvidenceOrchestrator()
    docs = [
        _doc("rc1", "삼성전자 3분기 영업이익이 크게 증가했다."),
        _doc("rc2", "삼성전자 일부 부문 영업이익이 감소하며 부진했다."),
    ]
    out = orch.verify([_claim()], [_ne("2025Q3", 300, "n1"), _ne("2024Q3", 100, "n2")],
                      StaticDocumentSource(docs), _AS_OF)
    r = out.claim_results[0]
    assert r.conflicts
    assert "상충" in r.confidence_basis


def test_orchestration_is_deterministic() -> None:
    docs = [_doc("rc1", "삼성전자 3분기 영업이익이 크게 증가했다.")]
    ne = [_ne("2025Q3", 300, "n1"), _ne("2024Q3", 100, "n2")]
    orch = EvidenceOrchestrator()
    a = orch.verify([_claim()], ne, StaticDocumentSource(docs), _AS_OF).claim_results[0]
    b = orch.verify([_claim()], ne, StaticDocumentSource(docs), _AS_OF).claim_results[0]
    assert (a.verdict, a.reason_code, a.verified_citation_ids) == (
        b.verdict,
        b.reason_code,
        b.verified_citation_ids,
    )


def test_static_source_satisfies_document_source_protocol() -> None:
    source: DocumentSource = StaticDocumentSource([])
    assert hasattr(source, "search")
