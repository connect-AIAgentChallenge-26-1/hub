import uuid
from typing import cast

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies import get_kis_provider
from app.providers.kis import KisProvider, TokenCache
from tests.support.kis_mock import client_with_responses, json_response, load_json


def _register_and_get_token(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": f"{uuid.uuid4()}@example.com", "password": "correct-horse-battery"},
    )
    token: str = response.json()["data"]["access_token"]
    return token


def _override_provider(
    client: TestClient, responses: list[httpx.Response | Exception]
) -> KisProvider:
    fake_client, _transport = client_with_responses(responses)
    fake_provider = KisProvider(
        app_key="test-key", app_secret="test-secret", env="vps",
        client=fake_client, token_cache=TokenCache(),
    )
    cast(FastAPI, client.app).dependency_overrides[get_kis_provider] = lambda: fake_provider
    return fake_provider


def _clear_provider_override(client: TestClient, fake_provider: KisProvider) -> None:
    del cast(FastAPI, client.app).dependency_overrides[get_kis_provider]
    fake_provider.close()


def test_market_requires_authentication(client):
    response = client.post(
        "/api/v1/market",
        json={
            "operation": "COLLECT_CURRENT_PRICE",
            "stock_code": "005930",
            "corp_code": "00126380",
            "as_of": "2026-07-14",
        },
    )
    assert response.status_code == 401


def test_collect_current_price_returns_raw_record_id(client, db_session):
    token = _register_and_get_token(client)
    token_fixture = load_json("token_issue_success_redacted.json")
    price_fixture = load_json("current_price_005930.json")
    fake_provider = _override_provider(
        client, [json_response(token_fixture), json_response(price_fixture)]
    )
    try:
        response = client.post(
            "/api/v1/market",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "operation": "COLLECT_CURRENT_PRICE",
                "stock_code": "005930",
                "corp_code": "00126380",
                "as_of": "2026-07-14",
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "SUCCESS"
        assert len(body["data"]["raw_record_ids"]) == 1
        assert body["data"]["provider"] == "kis"
    finally:
        _clear_provider_override(client, fake_provider)


def test_collect_unknown_stock_code_maps_to_not_found_envelope(client, db_session):
    token = _register_and_get_token(client)
    token_fixture = load_json("token_issue_success_redacted.json")
    error_fixture = load_json("current_price_invalid_stock_code.json")
    fake_provider = _override_provider(
        client, [json_response(token_fixture), json_response(error_fixture)]
    )
    try:
        response = client.post(
            "/api/v1/market",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "operation": "COLLECT_CURRENT_PRICE",
                "stock_code": "999999",
                "corp_code": "00126380",
                "as_of": "2026-07-14",
            },
        )
        assert response.status_code == 404
        assert response.json()["status"] == "NOT_FOUND"
        assert response.json()["reason_code"] == "PROVIDER_NO_DATA"
    finally:
        _clear_provider_override(client, fake_provider)


def test_collect_invalid_credentials_maps_to_external_error_envelope(client, db_session):
    token = _register_and_get_token(client)
    token_fixture = load_json("token_issue_success_redacted.json")
    error_fixture = load_json("current_price_invalid_credentials.json")
    fake_provider = _override_provider(
        client, [json_response(token_fixture), json_response(error_fixture)]
    )
    try:
        response = client.post(
            "/api/v1/market",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "operation": "COLLECT_CURRENT_PRICE",
                "stock_code": "005930",
                "corp_code": "00126380",
                "as_of": "2026-07-14",
            },
        )
        assert response.status_code == 502
        assert response.json()["status"] == "EXTERNAL_ERROR"
        assert response.json()["reason_code"] == "PROVIDER_AUTH_FAILED"
    finally:
        _clear_provider_override(client, fake_provider)


def test_normalize_operation_returns_quotes_from_collected_records(client, db_session):
    token = _register_and_get_token(client)
    token_fixture = load_json("token_issue_success_redacted.json")
    price_fixture = load_json("period_price_005930_unadjusted.json")
    fake_provider = _override_provider(
        client, [json_response(token_fixture), json_response(price_fixture)]
    )
    try:
        collect_response = client.post(
            "/api/v1/market",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "operation": "COLLECT_PERIOD_PRICE",
                "stock_code": "005930",
                "corp_code": "00126380",
                "start": "20260601",
                "end": "20260713",
                "adjusted": False,
                "as_of": "2026-07-13",
            },
        )
        raw_record_ids = collect_response.json()["data"]["raw_record_ids"]

        normalize_response = client.post(
            "/api/v1/market",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "operation": "NORMALIZE",
                "eligible_raw_record_ids": raw_record_ids,
                "corp_code": "00126380",
                "normalization_policy_ref": "interim-pre-s15-v1",
                "as_of": "2026-07-13",
            },
        )
        assert normalize_response.status_code == 200
        body = normalize_response.json()["data"]
        assert len(body["quotes"]) == len(price_fixture["output2"])
        assert body["license"]
    finally:
        _clear_provider_override(client, fake_provider)


def test_manual_input_operation_creates_quote_without_calling_provider(client, db_session):
    token = _register_and_get_token(client)
    # provider override로 빈 응답 큐를 주어 provider가 실제로 호출되면 테스트가
    # 실패하도록 만든다 — MANUAL_INPUT은 provider를 호출하지 않아야 한다.
    fake_provider = _override_provider(client, [])
    try:
        response = client.post(
            "/api/v1/market",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "operation": "MANUAL_INPUT",
                "stock_code": "005930",
                "corp_code": "00126380",
                "trade_date": "2026-07-10",
                "close_price": "263000",
                "source_note": "증권사 HTS 수기 입력",
                "as_of": "2026-07-14",
            },
        )
        assert response.status_code == 200
        body = response.json()["data"]
        assert body["quote"]["provider"] == "manual_input"
    finally:
        _clear_provider_override(client, fake_provider)


def test_collect_rejects_malformed_body_with_validation_envelope(client, db_session):
    token = _register_and_get_token(client)
    response = client.post(
        "/api/v1/market",
        headers={"Authorization": f"Bearer {token}"},
        json={"operation": "COLLECT_CURRENT_PRICE", "stock_code": "005930"},
    )
    assert response.status_code == 422
    assert response.json()["status"] == "VALIDATION_ERROR"
