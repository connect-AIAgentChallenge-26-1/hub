"""Upstage Solar provider (S7 Structured Claim Extractor 전용, S23 게이트를
통해서만 호출된다 — CLAUDE.md "LLM 사용 경계"). OpenAI 호환 chat/completions
endpoint를 httpx로 직접 호출한다.

엔드포인트·요청/응답 shape는 공식 문서 조사로 확인했다(2026-07-14, WebSearch —
console.upstage.ai/api/chat, console.upstage.ai/api/docs/for-agents/raw):
`POST https://api.upstage.ai/v1/chat/completions`, `Authorization: Bearer
<key>`, `model` "solar-pro3"(docs/prerequisites.md 결정), Structured Outputs는
`response_format={"type":"json_schema","json_schema":{...}}`. 오류 status:
400(잘못된 요청)·401/403(인증·크레딧 부족)·429(rate limit)·5xx(서버 오류).

**BLOCKED(docs/backlog.md T06)**: `UPSTAGE_API_KEY`가 아직 발급되지 않아
(docs/prerequisites.md T06·T07) 이 provider의 실제 라이브 호출은 검증하지
못했다 — httpx `MockTransport`로 timeout·retry·오류 매핑·정상 응답 파싱만
검증했다(`backend/tests/test_solar_provider.py`). 키가 발급되면 T02~T05와
동일한 방식(실 라이브 호출 캡처, redacted placeholder로 token 치환)으로
`backend/tests/fixtures/solar/`를 채우고 이 문서 노트를 갱신한다.
"""

from __future__ import annotations

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
)

SOLAR_BASE_URL = "https://api.upstage.ai/v1"
SOLAR_DEFAULT_MODEL = "solar-pro3"

_RETRYABLE_EXCEPTIONS = (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError)


def _raise_for_status_code(status_code: int, body: str) -> None:
    if status_code == 200:
        return
    if status_code in (401, 403):
        raise ProviderAuthError(f"Upstage Solar {status_code}: {body}")
    if status_code == 429:
        raise ProviderRateLimitedError(f"Upstage Solar 429: {body}")
    # 400(malformed request)과 5xx(서버 오류)는 OpenDART provider와 동일하게
    # "예상 밖 provider-side 상태" 버킷으로 묶는다 — 조용히 성공 취급하지 않는다.
    raise ProviderMaintenanceError(f"Upstage Solar unexpected status {status_code}: {body}")


@dataclass(frozen=True)
class SolarCompletion:
    content: str
    raw_response: dict[str, Any]
    usage: dict[str, int]


class SolarProvider:
    source_provider = "upstage_solar"

    def __init__(
        self,
        api_key: str,
        client: httpx.Client | None = None,
        timeout: float = 30.0,
        model: str = SOLAR_DEFAULT_MODEL,
    ) -> None:
        self._api_key = api_key
        self._client = client or httpx.Client(timeout=timeout)
        self._owns_client = client is None
        self._model = model

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> SolarProvider:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    @retry(
        # OpenDartProvider와 동일 패턴: 각 시도가 httpx 예외를 ProviderTimeoutError로
        # 변환한 뒤 재시도 대상은 그 타입만 본다.
        retry=retry_if_exception_type(ProviderTimeoutError),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, max=4),
        reraise=True,
    )
    def _post(self, payload: dict[str, Any]) -> httpx.Response:
        try:
            return self._client.post(
                f"{SOLAR_BASE_URL}/chat/completions",
                json=payload,
                headers={"Authorization": f"Bearer {self._api_key}"},
            )
        except _RETRYABLE_EXCEPTIONS as exc:
            raise ProviderTimeoutError(f"Upstage Solar network error: {exc}") from exc

    def complete_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        json_schema: dict[str, Any],
        schema_name: str = "structured_claim_extraction",
    ) -> SolarCompletion:
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": schema_name, "schema": json_schema, "strict": True},
            },
        }
        response = self._post(payload)
        _raise_for_status_code(response.status_code, response.text)
        data: dict[str, Any] = response.json()
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise ProviderMaintenanceError(
                f"Upstage Solar response missing choices[0].message.content: {data!r}"
            ) from exc
        return SolarCompletion(content=content, raw_response=data, usage=data.get("usage", {}))

    def complete_structured_json(
        self, system_prompt: str, user_prompt: str, json_schema: dict[str, Any]
    ) -> dict[str, Any]:
        """S23 `run_structured`의 `complete_structured: Callable[[str], dict]`
        서명에 맞춘 얇은 wrapper용 헬퍼 — content 문자열을 JSON dict로 파싱한다.
        모델이 schema를 어겨 JSON이 아닌 텍스트를 내면 예외를 그대로 올려
        S7이 malformed output으로 처리하게 한다(삼키지 않음)."""
        completion = self.complete_structured(system_prompt, user_prompt, json_schema)
        try:
            parsed = json.loads(completion.content)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Upstage Solar content is not valid JSON: {exc}") from exc
        if not isinstance(parsed, dict):
            raise ValueError(f"Upstage Solar content is not a JSON object: {type(parsed).__name__}")
        return parsed
