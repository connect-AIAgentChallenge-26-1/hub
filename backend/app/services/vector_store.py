"""벡터 스토어 (S18 RAG index, docs/checklist.md C9 "Chroma document·
embedding·chunk schema와 checksum/version").

CLAUDE.md 목표 아키텍처는 Chroma metadata-filtered RAG다. Chroma의 실제 영속·
호스팅은 배포 결정(docs/checklist.md C14/T13 "PostgreSQL·Chroma 영속 저장 방식
확정")이므로, T07은 Chroma와 **동일한 시맨틱**(collection에 embedding+metadata+
document를 add, metadata `where` filter로 코사인 거리 query)을 갖는 결정론적
in-process 구현으로 검색 로직·chunk/embedding schema를 확정한다. `VectorStore`
인터페이스는 T13에서 `ChromaVectorStore` 어댑터로 교체할 수 있게 설계했다
(사용자 결정 2026-07-15, docs/report/report_claude.md T07 참고).

`IndexedChunk`가 그 chunk/embedding schema다 — checksum(원문 변조 감지)과
`chunk_schema_version`·`embedding_model`(버전)을 포함한다.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Protocol

CHUNK_SCHEMA_VERSION = "s18-indexed-chunk-1.0.0"


def chunk_checksum(document_id: str, chunk_index: int, text: str) -> str:
    """색인된 chunk의 무결성 checksum. 원문 텍스트가 색인 이후 바뀌면 검색
    결과의 checksum이 S20 인용 검사에서 원본과 어긋난다(docs/skills.md S20)."""
    h = hashlib.sha256()
    h.update(document_id.encode("utf-8"))
    h.update(str(chunk_index).encode("utf-8"))
    h.update(text.encode("utf-8"))
    return h.hexdigest()


@dataclass(frozen=True)
class IndexedChunk:
    """검색 index의 단위 문서(chunk). Chroma의 (id, document, embedding,
    metadata)에 대응하며 checksum·schema/embedding 버전을 함께 보존한다."""

    chunk_id: str
    document_id: str
    text: str
    embedding: tuple[float, ...]
    # metadata: corp_code / filed_at / target_period / source / source_url /
    # rcept_no / chunk_offset / evidence_type 등 (docs/skills.md S18 metadata filter).
    metadata: dict[str, str | int] = field(default_factory=dict)
    embedding_model: str = ""
    checksum: str = ""
    chunk_schema_version: str = CHUNK_SCHEMA_VERSION


@dataclass(frozen=True)
class QueryHit:
    chunk: IndexedChunk
    distance: float  # 코사인 거리 (0 = 동일 방향, 2 = 반대 방향)

    @property
    def dense_score(self) -> float:
        # 코사인 유사도 [-1, 1] → [0, 1]로 정규화한 점수.
        return (2.0 - self.distance) / 2.0


def _cosine_distance(a: tuple[float, ...], b: tuple[float, ...]) -> float:
    if len(a) != len(b):
        raise ValueError("embedding dimension mismatch")
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    # 임베딩은 L2 정규화되어 있어 norm≈1 — 방어적으로 clamp.
    dot = max(-1.0, min(1.0, dot))
    return 1.0 - dot


def _matches_where(metadata: dict[str, str | int], where: dict[str, str | int] | None) -> bool:
    """Chroma `where`와 동일한 등가(equality) metadata filter. 종목·날짜·문서
    metadata를 필수 적용한다(docs/skills.md S18 제약)."""
    if not where:
        return True
    return all(metadata.get(key) == value for key, value in where.items())


class VectorStore(Protocol):
    def add(self, chunks: list[IndexedChunk]) -> None: ...

    def query(
        self,
        embedding: tuple[float, ...],
        n_results: int,
        where: dict[str, str | int] | None = None,
    ) -> list[QueryHit]: ...

    def count(self) -> int: ...


class InProcessVectorStore:
    """결정론적 in-process 벡터 스토어. Chroma collection과 동일 시맨틱."""

    def __init__(self) -> None:
        self._chunks: dict[str, IndexedChunk] = {}

    def add(self, chunks: list[IndexedChunk]) -> None:
        for chunk in chunks:
            self._chunks[chunk.chunk_id] = chunk

    def query(
        self,
        embedding: tuple[float, ...],
        n_results: int,
        where: dict[str, str | int] | None = None,
    ) -> list[QueryHit]:
        hits = [
            QueryHit(chunk=chunk, distance=_cosine_distance(embedding, chunk.embedding))
            for chunk in self._chunks.values()
            if _matches_where(chunk.metadata, where)
        ]
        # 거리 오름차순(가까운 것 먼저), 동점은 chunk_id로 결정론적 정렬.
        hits.sort(key=lambda h: (h.distance, h.chunk.chunk_id))
        return hits[:n_results]

    def count(self) -> int:
        return len(self._chunks)
