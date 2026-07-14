import httpx
import pytest

from app.providers.base import (
    ProviderAuthError,
    ProviderMaintenanceError,
    ProviderNotFoundError,
    ProviderRateLimitedError,
    ProviderTimeoutError,
    ProviderTokenRateLimitedError,
)
from app.providers.kis import KisProvider, TokenCache
from tests.support.kis_mock import QueueTransport, client_with_responses, json_response, load_json


def _provider(
    responses: list[httpx.Response | Exception],
    token_responses: list[httpx.Response | Exception] | None = None,
) -> tuple[KisProvider, QueueTransport]:
    # 토큰 발급 응답을 먼저 큐에 넣고 그 뒤에 실제 조회 응답을 넣는다 — 매 테스트가
    # 독립된 TokenCache를 쓰므로(app_key가 같아도) 토큰 캐시가 테스트 간에 새지 않는다.
    token_fixture = load_json("token_issue_success_redacted.json")
    all_responses = (token_responses or [json_response(token_fixture)]) + responses
    client, transport = client_with_responses(all_responses)
    provider = KisProvider(
        app_key="test-app-key", app_secret="test-app-secret", env="vps",
        client=client, token_cache=TokenCache(),
    )
    return provider, transport


def test_fetch_current_price_success_returns_real_fixture():
    fixture = load_json("current_price_005930.json")
    provider, _ = _provider([json_response(fixture)])
    fetch = provider.fetch_current_price("005930")
    assert fetch.raw_payload["output"]["lstn_stcn"] == "5846278608"
    assert fetch.checksum


def test_fetch_current_price_unknown_stock_code_raises_not_found():
    # KIS는 존재하지 않는 종목코드에도 rt_cd="0"(성공)을 반환하고 output을 전부
    # 0/공백으로 채운다(명시적 오류 없음, 2026-07-14 실제 호출로 확인) — provider가
    # 이 shape을 감지해 ProviderNotFoundError로 변환해야 한다.
    fixture = load_json("current_price_invalid_stock_code.json")
    provider, _ = _provider([json_response(fixture)])
    with pytest.raises(ProviderNotFoundError):
        provider.fetch_current_price("999999")


def test_fetch_period_price_unadjusted_success():
    fixture = load_json("period_price_005930_unadjusted.json")
    provider, _ = _provider([json_response(fixture)])
    fetch = provider.fetch_period_price("005930", "20260601", "20260713", adjusted=False)
    assert len(fetch.raw_payload["output2"]) == len(fixture["output2"])


def test_fetch_period_price_adjusted_success():
    fixture = load_json("period_price_005930_adjusted.json")
    provider, _ = _provider([json_response(fixture)])
    fetch = provider.fetch_period_price("005930", "20260601", "20260713", adjusted=True)
    assert fetch.raw_payload["output1"]["stck_shrn_iscd"] == "005930"


def test_fetch_corporate_action_rev_split_returns_real_2018_samsung_split():
    fixture = load_json("corp_action_rev_split_005930_2018.json")
    provider, _ = _provider([json_response(fixture)])
    fetch = provider.fetch_corporate_action_raw(
        "/uapi/domestic-stock/v1/ksdinfo/rev-split",
        "HHKDB669105C0",
        {"SHT_CD": "005930", "CTS": "", "F_DT": "20180101", "T_DT": "20181231", "MARKET_GB": "0"},
    )
    row = fetch.raw_payload["output1"][0]
    assert row["inter_bf_face_amt"] == "000005000"
    assert row["inter_af_face_amt"] == "000000100"


def test_fetch_corporate_action_dividend_returns_real_fixture():
    fixture = load_json("corp_action_dividend_005930.json")
    provider, _ = _provider([json_response(fixture)])
    fetch = provider.fetch_corporate_action_raw(
        "/uapi/domestic-stock/v1/ksdinfo/dividend",
        "HHKDB669102C0",
        {
            "CTS": "", "GB1": "0", "F_DT": "20250101", "T_DT": "20261231",
            "SHT_CD": "005930", "HIGH_GB": "",
        },
    )
    assert len(fetch.raw_payload["output1"]) >= 1


def test_fetch_corporate_action_bonus_issue_empty_is_not_an_error():
    fixture = load_json("corp_action_bonus_issue_005930.json")
    provider, _ = _provider([json_response(fixture)])
    fetch = provider.fetch_corporate_action_raw(
        "/uapi/domestic-stock/v1/ksdinfo/bonus-issue",
        "HHKDB669101C0",
        {"CTS": "", "F_DT": "20200101", "T_DT": "20261231", "SHT_CD": "005930"},
    )
    assert fetch.raw_payload["output1"] == []


def test_invalid_appsecret_raises_auth_error():
    error = load_json("current_price_invalid_credentials.json")
    provider, _ = _provider([json_response(error)])
    with pytest.raises(ProviderAuthError):
        provider.fetch_current_price("005930")


def test_per_second_rate_limit_raises_rate_limited_error():
    error = load_json("current_price_per_second_rate_limited.json")
    provider, _ = _provider([json_response(error)])
    with pytest.raises(ProviderRateLimitedError):
        provider.fetch_current_price("005930")


def test_token_issuance_rate_limit_raises_dedicated_reason_code():
    error = load_json("token_rate_limited_raw.json")
    provider, _ = _provider(
        responses=[], token_responses=[httpx.Response(error["status_code"], json=error["body"])]
    )
    with pytest.raises(ProviderTokenRateLimitedError) as exc_info:
        provider.fetch_current_price("005930")
    assert exc_info.value.reason_code == "PROVIDER_TOKEN_RATE_LIMITED"


def test_token_is_cached_across_multiple_calls_within_process():
    # 토큰 응답 1개 + 조회 응답 2개만 큐에 넣는다 — 두 번째 fetch가 토큰을 다시
    # 발급받으려 하면 QueueTransport가 "예상 밖 요청"으로 실패한다.
    fixture = load_json("current_price_005930.json")
    provider, transport = _provider([json_response(fixture), json_response(fixture)])
    provider.fetch_current_price("005930")
    provider.fetch_current_price("005930")
    assert transport.call_count == 3  # token + 2 price calls


def test_unmapped_business_error_code_maps_to_maintenance_error():
    provider, _ = _provider(
        [json_response({"rt_cd": "1", "msg_cd": "EGW99999", "msg1": "unexpected"})]
    )
    with pytest.raises(ProviderMaintenanceError):
        provider.fetch_current_price("005930")


def test_transient_network_errors_are_retried_then_succeed():
    fixture = load_json("current_price_005930.json")
    provider, transport = _provider(
        [httpx.TimeoutException("boom"), httpx.ConnectError("boom again"), json_response(fixture)]
    )
    fetch = provider.fetch_current_price("005930")
    assert fetch.raw_payload["output"]["lstn_stcn"] == "5846278608"
    assert transport.call_count == 4  # token + 2 failed attempts + 1 success


def test_persistent_network_errors_exhaust_retries_and_raise():
    provider, transport = _provider(
        [httpx.TimeoutException("a"), httpx.TimeoutException("b"), httpx.TimeoutException("c")]
    )
    with pytest.raises(ProviderTimeoutError):
        provider.fetch_current_price("005930")
    assert transport.call_count == 4  # token + 3 failed attempts
