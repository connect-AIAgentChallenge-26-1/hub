import httpx
import pytest

from app.providers.base import (
    ProviderAuthError,
    ProviderMaintenanceError,
    ProviderRateLimitedError,
    ProviderTimeoutError,
)
from app.providers.solar import SolarProvider
from tests.support.opendart_mock import client_with_responses, json_response

_SCHEMA = {"type": "object", "properties": {"summary": {"type": "string"}}}


def _completion_response(content: str) -> httpx.Response:
    return json_response(
        {
            "id": "chatcmpl-1",
            "object": "chat.completion",
            "model": "solar-pro3",
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": content},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        }
    )


def test_complete_structured_parses_content_and_usage() -> None:
    client, transport = client_with_responses([_completion_response('{"summary":"ok"}')])
    with SolarProvider(api_key="k", client=client) as provider:
        result = provider.complete_structured("sys", "user", _SCHEMA)
    assert result.content == '{"summary":"ok"}'
    assert result.usage["total_tokens"] == 15
    assert transport.call_count == 1


def test_401_raises_provider_auth_error() -> None:
    client, _ = client_with_responses(
        [json_response({"error": {"message": "invalid api key"}}, status_code=401)]
    )
    with SolarProvider(api_key="bad", client=client) as provider, pytest.raises(ProviderAuthError):
        provider.complete_structured("sys", "user", _SCHEMA)


def test_403_insufficient_credit_raises_provider_auth_error() -> None:
    client, _ = client_with_responses(
        [json_response({"error": {"message": "Insufficient credit"}}, status_code=403)]
    )
    with SolarProvider(api_key="k", client=client) as provider, pytest.raises(ProviderAuthError):
        provider.complete_structured("sys", "user", _SCHEMA)


def test_429_raises_provider_rate_limited_error() -> None:
    client, _ = client_with_responses(
        [json_response({"error": {"message": "rate limited"}}, status_code=429)]
    )
    with SolarProvider(api_key="k", client=client) as provider:
        with pytest.raises(ProviderRateLimitedError):
            provider.complete_structured("sys", "user", _SCHEMA)


def test_5xx_raises_provider_maintenance_error() -> None:
    client, _ = client_with_responses(
        [json_response({"error": {"message": "internal error"}}, status_code=503)]
    )
    with SolarProvider(api_key="k", client=client) as provider:
        with pytest.raises(ProviderMaintenanceError):
            provider.complete_structured("sys", "user", _SCHEMA)


def test_response_missing_choices_raises_provider_maintenance_error() -> None:
    client, _ = client_with_responses([json_response({"id": "x", "choices": []})])
    with SolarProvider(api_key="k", client=client) as provider:
        with pytest.raises(ProviderMaintenanceError):
            provider.complete_structured("sys", "user", _SCHEMA)


def test_two_timeouts_then_success_is_retried_and_succeeds() -> None:
    client, transport = client_with_responses(
        [
            httpx.TimeoutException("timeout 1"),
            httpx.TimeoutException("timeout 2"),
            _completion_response('{"summary":"ok"}'),
        ]
    )
    with SolarProvider(api_key="k", client=client) as provider:
        result = provider.complete_structured("sys", "user", _SCHEMA)
    assert result.content == '{"summary":"ok"}'
    assert transport.call_count == 3


def test_three_consecutive_timeouts_gives_up() -> None:
    client, transport = client_with_responses(
        [httpx.TimeoutException("t1"), httpx.TimeoutException("t2"), httpx.TimeoutException("t3")]
    )
    with SolarProvider(api_key="k", client=client) as provider, pytest.raises(ProviderTimeoutError):
        provider.complete_structured("sys", "user", _SCHEMA)
    assert transport.call_count == 3


def test_complete_structured_json_parses_valid_json_content() -> None:
    client, _ = client_with_responses([_completion_response('{"summary":"ok","score":1}')])
    with SolarProvider(api_key="k", client=client) as provider:
        parsed = provider.complete_structured_json("sys", "user", _SCHEMA)
    assert parsed == {"summary": "ok", "score": 1}


def test_complete_structured_json_rejects_non_json_content_instead_of_silently_passing() -> None:
    client, _ = client_with_responses([_completion_response("이건 JSON이 아니라 그냥 문장이다")])
    with SolarProvider(api_key="k", client=client) as provider, pytest.raises(ValueError):
        provider.complete_structured_json("sys", "user", _SCHEMA)


def test_complete_structured_json_rejects_json_array_content() -> None:
    client, _ = client_with_responses([_completion_response("[1, 2, 3]")])
    with SolarProvider(api_key="k", client=client) as provider, pytest.raises(ValueError):
        provider.complete_structured_json("sys", "user", _SCHEMA)


def test_request_uses_documented_endpoint_and_bearer_auth_header() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["auth"] = request.headers.get("authorization")
        return _completion_response('{"summary":"ok"}')

    client = httpx.Client(transport=httpx.MockTransport(handler))
    with SolarProvider(api_key="my-key", client=client) as provider:
        provider.complete_structured("sys", "user", _SCHEMA)
    assert captured["url"] == "https://api.upstage.ai/v1/chat/completions"
    assert captured["auth"] == "Bearer my-key"
