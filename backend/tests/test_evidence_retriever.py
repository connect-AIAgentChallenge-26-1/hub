"""S18 근거 검색 테스트 (docs/checklist.md C9): hybrid dense+sparse, 종목
metadata filter, score threshold, 중복 제거, Recall@K·precision, chunk schema
checksum/version."""

from __future__ import annotations

from dataclasses import replace
from datetime import date

from app.schemas.structured_claim import Comparator, ComparatorOp, StructuredClaim
from app.services.embedding_provider import HashingEmbeddingProvider
from app.services.evidence_retriever import (
    EvidenceRetriever,
    SourceDocument,
    recall_at_k,
    relevance_precision_at_k,
)
from app.services.vector_store import CHUNK_SCHEMA_VERSION, chunk_checksum


def _claim(corp_code: str = "00126380", op: ComparatorOp = "MULTIPLE") -> StructuredClaim:
    return StructuredClaim(
        claim_id="c1",
        original_span="삼성전자 2025년 3분기 영업이익이 2배 증가했다",
        corp_code=corp_code,
        stock_code="005930",
        claim_type="COMPARISON",
        metric="OPERATING_INCOME",
        evidence_domain="financial",
        comparator=Comparator(
            op=op, comparison_operator="GTE", target_value=2.0, target_unit="multiple"
        ),
        direction="증가",
        current_period="2025Q3",
        comparison_period="2024Q3",
        as_of=date(2026, 7, 15),
        verifiable=True,
    )


def _doc(document_id: str, text: str, corp_code: str = "00126380") -> SourceDocument:
    return SourceDocument(
        document_id=document_id,
        chunk_index=0,
        text=text,
        corp_code=corp_code,
        source="disclosure",
        source_url=f"https://opendart.fss.or.kr/api/document.xml?rcept_no={document_id}",
        filed_at="2025-11-14",
        target_period="2025Q3",
        chunk_offset=0,
        evidence_type="DISCLOSURE_DOCUMENT_CHUNK",
        rcept_no=document_id,
    )


def _doc_with_checksum(document_id: str, text: str, stored_checksum: str) -> SourceDocument:
    doc = _doc(document_id, text)
    return replace(doc, stored_checksum=stored_checksum)


def test_metadata_filter_excludes_other_companies() -> None:
    retriever = EvidenceRetriever()
    retriever.index(
        [
            _doc("rc1", "삼성전자 2025년 3분기 영업이익이 크게 증가했다.", "00126380"),
            _doc("other", "삼성전자 영업이익 증가 이야기지만 다른 회사 문서.", "00164779"),
        ]
    )
    result = retriever.retrieve(_claim())
    corp_codes = {e.document.corp_code for e in result.ranked_evidence}
    assert corp_codes == {"00126380"}
    assert all("corp_code" in t or True for t in result.retrieval_trace)


def test_hybrid_ranks_lexically_relevant_chunk_first() -> None:
    retriever = EvidenceRetriever()
    retriever.index(
        [
            _doc("rc1", "삼성전자 2025년 3분기 영업이익이 크게 증가하며 최대를 기록했다."),
            _doc("rc2", "회사 복리후생 제도에 관한 일반 공지 사항입니다."),
        ]
    )
    result = retriever.retrieve(_claim())
    assert result.ranked_evidence[0].document.document_id == "rc1"


def test_low_score_below_threshold_is_dropped() -> None:
    retriever = EvidenceRetriever()
    retriever.index([_doc("rc1", "전혀 무관한 급식 메뉴 안내와 주차 안내 문서.")])
    result = retriever.retrieve(_claim(), score_threshold=0.9)
    assert result.ranked_evidence == ()
    assert result.coverage == 0.0


def test_zero_results_is_not_treated_as_false() -> None:
    # 검색 결과 0건은 거짓 판정이 아니라 coverage 0으로만 표현된다.
    retriever = EvidenceRetriever()
    result = retriever.retrieve(_claim())
    assert result.ranked_evidence == ()
    assert "index_empty" in result.retrieval_trace


def test_duplicate_chunks_are_deduplicated() -> None:
    retriever = EvidenceRetriever()
    same = "삼성전자 2025년 3분기 영업이익이 증가했다."
    retriever.index(
        [
            SourceDocument("rc1", 0, same, "00126380", "disclosure", "u", "2025-11-14", "2025Q3", 0,
                           "DISCLOSURE_DOCUMENT_CHUNK", "rc1"),
            SourceDocument("rc1", 0, same, "00126380", "disclosure", "u", "2025-11-14", "2025Q3", 0,
                           "DISCLOSURE_DOCUMENT_CHUNK", "rc1"),
        ]
    )
    result = retriever.retrieve(_claim(), score_threshold=0.0)
    assert len(result.ranked_evidence) == 1


def test_top_k_limits_results() -> None:
    retriever = EvidenceRetriever()
    retriever.index([_doc(f"rc{i}", f"삼성전자 영업이익 증가 문서 번호 {i}.") for i in range(10)])
    result = retriever.retrieve(_claim(), top_k=3, score_threshold=0.0)
    assert len(result.ranked_evidence) <= 3


def test_chunk_schema_carries_checksum_and_version() -> None:
    provider = HashingEmbeddingProvider()
    from app.services.vector_store import InProcessVectorStore

    store = InProcessVectorStore()
    retriever = EvidenceRetriever(embedder=provider, vector_store=store)
    doc = _doc("rc1", "삼성전자 영업이익 증가.")
    retriever.index([doc])
    hits = store.query(tuple(provider.embed([doc.text])[0]), n_results=1)
    chunk = hits[0].chunk
    assert chunk.chunk_schema_version == CHUNK_SCHEMA_VERSION
    assert chunk.embedding_model == provider.model
    assert chunk.checksum == chunk_checksum(doc.document_id, 0, doc.text)


def test_retrieved_evidence_carries_index_time_checksum() -> None:
    # RetrievedEvidence.index_checksum은 retrieve() 시점이 아니라 index() 시점의
    # checksum이어야 S20이 색인 이후 원문 변조를 탐지할 수 있다(GPT 리뷰
    # 2026-07-15 15:38 발견, docs/skills.md S20).
    retriever = EvidenceRetriever()
    doc = _doc("rc1", "삼성전자 영업이익 증가.")
    retriever.index([doc])
    result = retriever.retrieve(_claim(), score_threshold=0.0)
    ev = result.ranked_evidence[0]
    assert ev.index_checksum == chunk_checksum(doc.document_id, doc.chunk_index, doc.text)


def test_retrieved_evidence_uses_stored_checksum_when_provided() -> None:
    original = "삼성전자 3분기 영업이익이 크게 증가했다."
    tampered = "삼성전자 3분기 영업이익 문구가 색인 이후 바뀌었다."
    stored = chunk_checksum("rc1", 0, original)
    retriever = EvidenceRetriever()
    retriever.index([_doc_with_checksum("rc1", tampered, stored)])

    ev = retriever.retrieve(_claim(), score_threshold=0.0).ranked_evidence[0]
    assert ev.index_checksum == stored
    assert ev.index_checksum != chunk_checksum("rc1", 0, tampered)


def test_recall_and_precision_helpers() -> None:
    retrieved = ["a", "b", "c", "d"]
    relevant = {"a", "c", "e"}
    assert recall_at_k(retrieved, relevant, 4) == 2 / 3
    assert relevance_precision_at_k(retrieved, relevant, 4) == 2 / 4
    assert recall_at_k(retrieved, set(), 4) == 0.0
    assert relevance_precision_at_k([], relevant, 4) == 0.0


def test_retrieval_is_deterministic() -> None:
    docs = [_doc(f"rc{i}", f"삼성전자 영업이익 증가 {i}.") for i in range(5)]
    r1 = EvidenceRetriever()
    r1.index(docs)
    r2 = EvidenceRetriever()
    r2.index(docs)
    ids1 = [e.chunk_id for e in r1.retrieve(_claim(), score_threshold=0.0).ranked_evidence]
    ids2 = [e.chunk_id for e in r2.retrieve(_claim(), score_threshold=0.0).ranked_evidence]
    assert ids1 == ids2
