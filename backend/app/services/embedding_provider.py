"""임베딩 provider (S18 dense 검색용, docs/skills.md S18·CLAUDE.md 목표
아키텍처 "Chroma metadata-filtered RAG").

CLAUDE.md는 dense 임베딩을 Upstage Solar embedding으로 생성하는 것을 목표로
하지만 `UPSTAGE_API_KEY`가 아직 발급되지 않았다(docs/prerequisites.md T06·T07).
그래서 solar.py(S7)와 동일한 선례를 따른다:

- `EmbeddingProvider` protocol을 두고,
- 테스트·dev 경로는 외부 자격증명이 필요 없는 **결정론적 로컬** 임베딩
  (`HashingEmbeddingProvider`)으로 hybrid 검색·Recall@K를 재현 가능하게 만들고,
- 실 provider(`SolarEmbeddingProvider`)는 공식 HTTP 계약(OpenAI 호환
  `/v1/embeddings`)으로 구현하되 라이브 호출은 키 발급 후에만 검증한다
  (docs/checklist.md C9 "한계", T06 S7과 동일 분류).

로컬 임베딩은 문자 n-gram 해싱 bag-of-words를 L2 정규화한 벡터다 — 학습된
의미 임베딩이 아니라 표기 겹침(lexical overlap)을 밀집 벡터 공간에 투영한
것으로, 결정론적이고 재현 가능하다. 실제 의미 검색 품질은 Solar 임베딩
라이브 검증(T12) 전까지 측정 대상이 아니다(그 threshold는 placeholder다,
docs/skills.md "Threshold Registry").
"""

from __future__ import annotations

import hashlib
import math
import re
from typing import Protocol, runtime_checkable

EMBEDDING_SCHEMA_VERSION = "s18-embedding-1.0.0"
HASHING_EMBEDDING_MODEL = "hashing-charngram-v1"
SOLAR_EMBEDDING_MODEL = "solar-embedding-1-large"

# 로컬 해싱 임베딩 차원 — 충돌을 줄이되 in-process 연산이 가벼운 크기.
_HASHING_DIM = 256
_TOKEN_PATTERN = re.compile(r"[0-9A-Za-z가-힣]+")


@runtime_checkable
class EmbeddingProvider(Protocol):
    """텍스트를 고정 차원 밀집 벡터로 변환. 동일 입력은 동일 출력을 낸다."""

    model: str

    def embed(self, texts: list[str]) -> list[list[float]]: ...


def _tokenize(text: str) -> list[str]:
    return _TOKEN_PATTERN.findall(text.lower())


def _char_ngrams(token: str, n: int = 3) -> list[str]:
    if len(token) <= n:
        return [token]
    return [token[i : i + n] for i in range(len(token) - n + 1)]


def _l2_normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vec))
    if norm == 0.0:
        return vec
    return [v / norm for v in vec]


class HashingEmbeddingProvider:
    """결정론적 로컬 임베딩. 외부 호출·자격증명이 없다.

    각 토큰의 문자 3-gram을 해싱해 고정 차원 버킷에 누적하고 L2 정규화한다.
    표기가 겹치는 텍스트끼리 코사인 유사도가 높아져 sparse 검색을 보완하는
    dense 신호로 쓸 수 있다.
    """

    def __init__(self, dim: int = _HASHING_DIM) -> None:
        self.dim = dim
        self.model = HASHING_EMBEDDING_MODEL

    def _embed_one(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        for token in _tokenize(text):
            for gram in _char_ngrams(token):
                digest = hashlib.sha1(gram.encode("utf-8")).digest()
                bucket = int.from_bytes(digest[:4], "big") % self.dim
                # 부호도 해시로 결정해 서로 다른 gram이 상쇄될 수 있게 한다.
                sign = 1.0 if digest[4] & 1 else -1.0
                vec[bucket] += sign
        return _l2_normalize(vec)

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]


class SolarEmbeddingProvider:
    """Upstage Solar embedding(OpenAI 호환 `/v1/embeddings`) provider.

    solar.py(S7)와 동일하게 httpx로 공식 계약에 맞춰 호출한다. `UPSTAGE_API_KEY`
    미발급으로 라이브 호출은 아직 검증하지 못했다(docs/checklist.md C9 한계).
    주입된 `transport`(httpx.MockTransport)로 계약·오류 경로를 테스트한다.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.upstage.ai/v1",
        model: str = SOLAR_EMBEDDING_MODEL,
        transport: object | None = None,
        timeout: float = 30.0,
    ) -> None:
        import httpx

        self.model = model
        self._base_url = base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=self._base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
            transport=transport,  # type: ignore[arg-type]
        )

    def embed(self, texts: list[str]) -> list[list[float]]:
        response = self._client.post("/embeddings", json={"model": self.model, "input": texts})
        response.raise_for_status()
        payload = response.json()
        # OpenAI 호환 응답: {"data": [{"index": i, "embedding": [...]}, ...]}
        rows = sorted(payload["data"], key=lambda r: r["index"])
        return [[float(x) for x in row["embedding"]] for row in rows]
