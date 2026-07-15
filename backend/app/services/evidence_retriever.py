"""S18 근거 검색 (docs/skills.md S18, I6 준비·I7 연결).

공시(S2 document_chunks)·외부 문서(S14 external_documents)를 versioned chunk·
embedding index로 적재하고, dense(임베딩 코사인)+sparse(BM25) hybrid로 Claim
관련 근거를 검색한다. 종목·기간·문서 metadata filter를 필수 적용하고, 중복
제거·reranking·score threshold를 거친 `ranked_evidence`를 반환한다.

결정론: 임베딩(HashingEmbeddingProvider)·BM25·RRF·정렬이 전부 결정론적이라
동일 입력은 동일 순위를 낸다. 실제 의미 검색 품질(Recall@K threshold)은 Solar
임베딩 라이브 검증(T12) 전까지 placeholder다(docs/skills.md Threshold Registry).
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field

from app.schemas.structured_claim import StructuredClaim
from app.services.embedding_provider import EmbeddingProvider, HashingEmbeddingProvider
from app.services.vector_store import (
    IndexedChunk,
    InProcessVectorStore,
    QueryHit,
    VectorStore,
    chunk_checksum,
)

EVIDENCE_RETRIEVER_VERSION = "s18-evidence-retriever-1.0.0"
QUERY_BUILDER_VERSION = "s18-query-builder-1.0.0"

# hybrid·threshold 기본값 — 낮은 점수 근거를 확정 근거로 쓰지 않는다
# (docs/skills.md S18 제약). RRF k 상수는 표준값 60.
DEFAULT_RRF_K = 60
DEFAULT_SCORE_THRESHOLD = 0.15
DEFAULT_TOP_K = 5

_TOKEN_MIN_LEN = 1


@dataclass(frozen=True)
class SourceDocument:
    """검색 index에 적재할 원문 단위. S2 document_chunk 하나 또는 S14
    external_document 하나에 대응한다. 텍스트 chunking은 S2/S14 책임이다."""

    document_id: str
    chunk_index: int
    text: str
    corp_code: str
    source: str  # "disclosure" | "external_news" 등
    source_url: str
    filed_at: str
    target_period: str
    chunk_offset: int
    evidence_type: str
    rcept_no: str = ""
    stored_checksum: str = ""


@dataclass(frozen=True)
class RetrievedEvidence:
    chunk_id: str
    document: SourceDocument
    retrieval_score: float
    dense_score: float
    sparse_score: float
    rank: int
    # index() 시점에 IndexedChunk에 기록된 checksum(S20 "stored" 값). 인용
    # 검사 시점에 document.text로 다시 계산하는 checksum과 서로 다른 출처여야
    # 색인 이후 원문 변조를 실제로 탐지할 수 있다(docs/skills.md S20).
    index_checksum: str = ""


@dataclass(frozen=True)
class RetrievalResult:
    ranked_evidence: tuple[RetrievedEvidence, ...] = field(default_factory=tuple)
    retrieval_trace: tuple[str, ...] = field(default_factory=tuple)
    coverage: float = 0.0
    scores: dict[str, float] = field(default_factory=dict)
    query_text: str = ""


def _tokenize(text: str) -> list[str]:
    from app.services.embedding_provider import _tokenize as tok

    return [t for t in tok(text) if len(t) >= _TOKEN_MIN_LEN]


def build_query(claim: StructuredClaim) -> str:
    """Claim에서 검색어를 결정론적으로 만든다(S14 query-builder와 동일 원칙 —
    Claim 필드만 사용, LLM 미사용). 원문 span·metric·기간을 결합한다."""
    parts = [claim.original_span, claim.metric, claim.current_period]
    if claim.comparison_period:
        parts.append(claim.comparison_period)
    return " ".join(p for p in parts if p).strip()


class _BM25:
    """표준 BM25(Okapi) sparse 검색기. 순수 Python, 외부 의존 없음."""

    def __init__(self, corpus_tokens: list[list[str]], k1: float = 1.5, b: float = 0.75) -> None:
        self._k1 = k1
        self._b = b
        self._docs = corpus_tokens
        self._n = len(corpus_tokens)
        self._doc_len = [len(d) for d in corpus_tokens]
        self._avgdl = (sum(self._doc_len) / self._n) if self._n else 0.0
        self._tf = [Counter(d) for d in corpus_tokens]
        df: Counter[str] = Counter()
        for d in corpus_tokens:
            for term in set(d):
                df[term] += 1
        self._idf = {
            term: math.log(1 + (self._n - freq + 0.5) / (freq + 0.5)) for term, freq in df.items()
        }

    def scores(self, query_tokens: list[str]) -> list[float]:
        out = [0.0] * self._n
        if self._avgdl == 0.0:
            return out
        for i in range(self._n):
            tf = self._tf[i]
            dl = self._doc_len[i]
            score = 0.0
            for term in query_tokens:
                if term not in tf:
                    continue
                idf = self._idf.get(term, 0.0)
                freq = tf[term]
                denom = freq + self._k1 * (1 - self._b + self._b * dl / self._avgdl)
                score += idf * (freq * (self._k1 + 1)) / denom
            out[i] = score
        return out


class EvidenceRetriever:
    def __init__(
        self,
        embedder: EmbeddingProvider | None = None,
        vector_store: VectorStore | None = None,
    ) -> None:
        self._embedder = embedder or HashingEmbeddingProvider()
        self._store = vector_store or InProcessVectorStore()
        self._documents: dict[str, SourceDocument] = {}
        self._checksums: dict[str, str] = {}
        self._corpus_ids: list[str] = []
        self._corpus_tokens: list[list[str]] = []
        self._bm25: _BM25 | None = None

    @staticmethod
    def _chunk_id(doc: SourceDocument) -> str:
        return f"{doc.document_id}:{doc.chunk_index}"

    def index(self, documents: list[SourceDocument]) -> None:
        """문서를 versioned chunk·embedding index로 적재한다."""
        if not documents:
            return
        embeddings = self._embedder.embed([d.text for d in documents])
        indexed: list[IndexedChunk] = []
        for doc, emb in zip(documents, embeddings, strict=True):
            chunk_id = self._chunk_id(doc)
            self._documents[chunk_id] = doc
            self._corpus_ids.append(chunk_id)
            self._corpus_tokens.append(_tokenize(doc.text))
            checksum = doc.stored_checksum or chunk_checksum(
                doc.document_id, doc.chunk_index, doc.text
            )
            self._checksums[chunk_id] = checksum
            indexed.append(
                IndexedChunk(
                    chunk_id=chunk_id,
                    document_id=doc.document_id,
                    text=doc.text,
                    embedding=tuple(emb),
                    metadata={
                        "corp_code": doc.corp_code,
                        "filed_at": doc.filed_at,
                        "target_period": doc.target_period,
                        "source": doc.source,
                        "source_url": doc.source_url,
                        "rcept_no": doc.rcept_no,
                        "chunk_offset": doc.chunk_offset,
                        "evidence_type": doc.evidence_type,
                        "document_id": doc.document_id,
                    },
                    embedding_model=self._embedder.model,
                    checksum=checksum,
                )
            )
        self._store.add(indexed)
        # BM25는 전체 코퍼스 통계가 필요해 index 시점마다 재구성한다.
        self._bm25 = _BM25(self._corpus_tokens)

    def _dense_hits(
        self, query_text: str, where: dict[str, str | int] | None, pool: int
    ) -> list[QueryHit]:
        query_emb = tuple(self._embedder.embed([query_text])[0])
        return self._store.query(query_emb, n_results=pool, where=where)

    def _sparse_ranking(
        self, query_tokens: list[str], where: dict[str, str | int] | None
    ) -> list[tuple[str, float]]:
        if self._bm25 is None:
            return []
        scores = self._bm25.scores(query_tokens)
        ranked: list[tuple[str, float]] = []
        for chunk_id, score in zip(self._corpus_ids, scores, strict=True):
            doc = self._documents[chunk_id]
            if where and where.get("corp_code") not in (None, doc.corp_code):
                continue
            ranked.append((chunk_id, score))
        ranked.sort(key=lambda x: (-x[1], x[0]))
        return ranked

    def retrieve(
        self,
        claim: StructuredClaim,
        *,
        query_text: str | None = None,
        top_k: int = DEFAULT_TOP_K,
        score_threshold: float = DEFAULT_SCORE_THRESHOLD,
        extra_where: dict[str, str | int] | None = None,
    ) -> RetrievalResult:
        query = query_text if query_text is not None else build_query(claim)
        trace: list[str] = [f"query_builder={QUERY_BUILDER_VERSION}", f"query={query!r}"]
        if self._store.count() == 0:
            trace.append("index_empty")
            return RetrievalResult(retrieval_trace=tuple(trace), query_text=query)

        # 종목 metadata filter는 필수 — 타기업 근거가 섞이지 않게 한다.
        where: dict[str, str | int] = {"corp_code": claim.corp_code}
        if extra_where:
            where.update(extra_where)
        trace.append(f"where={where}")

        pool = max(top_k * 4, 20)
        dense_hits = self._dense_hits(query, where, pool)
        sparse_ranked = self._sparse_ranking(_tokenize(query), where)
        trace.append(f"dense_candidates={len(dense_hits)} sparse_candidates={len(sparse_ranked)}")

        dense_rank = {hit.chunk.chunk_id: i for i, hit in enumerate(dense_hits)}
        dense_scoremap = {hit.chunk.chunk_id: hit.dense_score for hit in dense_hits}
        sparse_rank = {cid: i for i, (cid, _) in enumerate(sparse_ranked)}
        sparse_raw = {cid: s for cid, s in sparse_ranked}
        max_sparse = max((s for _, s in sparse_ranked), default=0.0)

        # RRF hybrid fusion — dense·sparse 두 순위를 rank 기반으로 결합해 서로
        # 다른 점수 스케일 문제를 피한다(docs/skills.md S18 "dense+sparse hybrid").
        candidate_ids = set(dense_rank) | set(sparse_rank)
        fused: list[tuple[str, float, float, float]] = []
        for cid in candidate_ids:
            rrf = 0.0
            if cid in dense_rank:
                rrf += 1.0 / (DEFAULT_RRF_K + dense_rank[cid] + 1)
            if cid in sparse_rank:
                rrf += 1.0 / (DEFAULT_RRF_K + sparse_rank[cid] + 1)
            dense_s = dense_scoremap.get(cid, 0.0)
            sparse_s = (sparse_raw.get(cid, 0.0) / max_sparse) if max_sparse > 0 else 0.0
            # 최종 retrieval_score: 정규화된 dense·sparse의 최댓값(둘 중 하나라도
            # 강하면 관련도가 높다) — threshold 비교에 절대 스케일로 쓴다.
            fused.append((cid, rrf, dense_s, sparse_s))

        # rerank: RRF 우선, 동점은 정규화 관련도, 그다음 chunk_id.
        fused.sort(key=lambda x: (-x[1], -max(x[2], x[3]), x[0]))

        ranked: list[RetrievedEvidence] = []
        seen_text: set[str] = set()
        for cid, _rrf, dense_s, sparse_s in fused:
            doc = self._documents[cid]
            # 중복 제거: 동일 문서·offset 또는 동일 본문은 한 번만.
            dedup_key = f"{doc.document_id}:{doc.chunk_offset}:{doc.text}"
            if dedup_key in seen_text:
                continue
            relevance = max(dense_s, sparse_s)
            if relevance < score_threshold:
                continue
            seen_text.add(dedup_key)
            ranked.append(
                RetrievedEvidence(
                    chunk_id=cid,
                    document=doc,
                    retrieval_score=round(relevance, 6),
                    dense_score=round(dense_s, 6),
                    sparse_score=round(sparse_s, 6),
                    rank=len(ranked),
                    index_checksum=self._checksums[cid],
                )
            )
            if len(ranked) >= top_k:
                break

        trace.append(f"after_threshold={len(ranked)} threshold={score_threshold}")
        coverage = 1.0 if ranked else 0.0
        scores = {
            "top_score": ranked[0].retrieval_score if ranked else 0.0,
            "threshold": score_threshold,
        }
        return RetrievalResult(
            ranked_evidence=tuple(ranked),
            retrieval_trace=tuple(trace),
            coverage=coverage,
            scores=scores,
            query_text=query,
        )


def recall_at_k(retrieved_ids: list[str], relevant_ids: set[str], k: int) -> float:
    """검색 Recall@K — 상위 K 안에 든 gold 관련 chunk 비율(docs/checklist.md C9)."""
    if not relevant_ids:
        return 0.0
    topk = set(retrieved_ids[:k])
    return len(topk & relevant_ids) / len(relevant_ids)


def relevance_precision_at_k(retrieved_ids: list[str], relevant_ids: set[str], k: int) -> float:
    """relevance precision@K — 상위 K 중 gold 관련 비율."""
    topk = retrieved_ids[:k]
    if not topk:
        return 0.0
    return len([cid for cid in topk if cid in relevant_ids]) / len(topk)
