import httpx
import pytest

from app.providers.base import (
    ProviderAuthError,
    ProviderMaintenanceError,
    ProviderTimeoutError,
)
from app.providers.naver_news import NaverNewsProvider
from tests.support.naver_mock import QueueTransport, client_with_responses, json_response, load_json


def _provider(
    responses: list[httpx.Response | Exception],
) -> tuple[NaverNewsProvider, QueueTransport]:
    client, transport = client_with_responses(responses)
    provider = NaverNewsProvider(client_id="test-id", client_secret="test-secret", client=client)
    return provider, transport


def test_search_news_success_returns_real_fixture():
    fixture = load_json("news_search_samsung.json")
    provider, _ = _provider([json_response(fixture)])
    fetch = provider.search_news("삼성전자 영업이익")
    assert len(fetch.raw_payload["items"]) == len(fixture["items"])
    assert fetch.checksum


def test_invalid_credentials_raise_auth_error():
    error = load_json("news_search_invalid_credentials.json")
    provider, _ = _provider([httpx.Response(401, json=error)])
    with pytest.raises(ProviderAuthError):
        provider.search_news("삼성전자")


def test_missing_query_raises_maintenance_error():
    # 400 Bad Request는 우리가 401/429로 특별 취급하지 않는 그 외 오류 — provider가
    # "예상 밖 상태"로 응답했다는 뜻이므로 ProviderMaintenanceError로 구분한다
    # (실제로는 이 경로가 발생하지 않도록 query-builder가 항상 비어있지 않은
    # query를 만든다 — build_news_query 테스트 참고).
    error = load_json("news_search_missing_query.json")
    provider, _ = _provider([httpx.Response(400, json=error)])
    with pytest.raises(ProviderMaintenanceError):
        provider.search_news("")


def test_transient_network_errors_are_retried_then_succeed():
    fixture = load_json("news_search_samsung.json")
    provider, transport = _provider(
        [httpx.TimeoutException("boom"), httpx.ConnectError("boom again"), json_response(fixture)]
    )
    fetch = provider.search_news("삼성전자")
    assert len(fetch.raw_payload["items"]) == len(fixture["items"])
    assert transport.call_count == 3


def test_persistent_network_errors_exhaust_retries_and_raise():
    provider, transport = _provider(
        [httpx.TimeoutException("a"), httpx.TimeoutException("b"), httpx.TimeoutException("c")]
    )
    with pytest.raises(ProviderTimeoutError):
        provider.search_news("삼성전자")
    assert transport.call_count == 3
