"""네이버 뉴스 검색 API provider (S14 외부 근거 수집의 provider allowlist 3개 중 1개
— docs/skills.md S14). 응답은 뉴스 기사 산문 요약(`description`)이므로 여기서 나온
수치를 검증 없이 NumericEvidence로 승격하지 않는다(app/services/external_evidence_collector.py
NORMALIZE가 강제).

계약 근거: developers.naver.com 공식 문서 + 2026-07-14 실제 호출로 확인한 응답 shape
(backend/tests/fixtures/naver/).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.providers.base import (
    ProviderAuthError,
    ProviderMaintenanceError,
    ProviderRateLimitedError,
    ProviderTimeoutError,
    RawSourceProvider,
)

NAVER_NEWS_URL = "https://openapi.naver.com/v1/search/news.json"

_RETRYABLE_EXCEPTIONS = (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError)


def checksum_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def stable_json_bytes(data: dict[str, Any]) -> bytes:
    return json.dumps(data, sort_keys=True, ensure_ascii=False).encode("utf-8")


@dataclass(frozen=True)
class RawFetch:
    raw_payload: dict[str, Any]
    checksum: str


class NaverNewsProvider(RawSourceProvider):
    source_provider = "naver_news"

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        client: httpx.Client | None = None,
        timeout: float = 10.0,
    ) -> None:
        self._client_id = client_id
        self._client_secret = client_secret
        self._client = client or httpx.Client(timeout=timeout)
        self._owns_client = client is None

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> NaverNewsProvider:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    @retry(
        retry=retry_if_exception_type(ProviderTimeoutError),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, max=4),
        reraise=True,
    )
    def _request(self, params: dict[str, Any]) -> httpx.Response:
        try:
            return self._client.get(
                NAVER_NEWS_URL,
                params=params,
                headers={
                    "X-Naver-Client-Id": self._client_id,
                    "X-Naver-Client-Secret": self._client_secret,
                },
            )
        except _RETRYABLE_EXCEPTIONS as exc:
            raise ProviderTimeoutError(f"Naver News network error: {exc}") from exc

    def search_news(self, query: str, display: int = 10, sort: str = "date") -> RawFetch:
        response = self._request({"query": query, "display": display, "sort": sort})
        if response.status_code == 200:
            data: dict[str, Any] = response.json()
            payload_bytes = stable_json_bytes(data)
            return RawFetch(raw_payload=data, checksum=checksum_of(payload_bytes))

        body: dict[str, Any] = {}
        try:
            body = response.json()
        except ValueError:
            pass
        error_code = body.get("errorCode", "")
        message = body.get("errorMessage", response.text)
        if response.status_code == 401:
            raise ProviderAuthError(f"Naver News auth failed {error_code}: {message}")
        if response.status_code == 429:
            raise ProviderRateLimitedError(f"Naver News rate limited {error_code}: {message}")
        raise ProviderMaintenanceError(
            f"Naver News unexpected status {response.status_code} {error_code}: {message}"
        )

    def collect(self, **query: Any) -> list[dict[str, Any]]:
        raise NotImplementedError("use search_news")
