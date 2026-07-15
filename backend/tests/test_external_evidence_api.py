import uuid
from typing import cast

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies import get_naver_provider
from app.providers.naver_news import NaverNewsProvider
from tests.support.naver_mock import client_with_responses, json_response, load_json


def _register_and_get_token(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": f"{uuid.uuid4()}@example.com", "password": "correct-horse-battery"},
    )
    token: str = response.json()["data"]["access_token"]
    return token


def _claim_json(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "claim_id": "claim-1",
        "original_span": "삼성전자 영업이익이 늘었다",
        "corp_code": "00126380",
        "stock_code": "005930",
        "claim_type": "COMPARISON",
        "metric": "영업이익",
        "evidence_domain": "financial",
        "comparator": {
            "op": "THRESHOLD",
            "comparison_operator": "GT",
            "target_value": 0,
            "target_unit": "KRW",
        },
        "direction": "INCREASE",
        "current_period": "2026Q2",
        "comparison_period": "2026Q1",
        "as_of": "2026-07-13",
        "verifiable": True,
        "ambiguity_flags": [],
    }
    body.update(overrides)
    return body


def _override_provider(
    client: TestClient, responses: list[httpx.Response | Exception]
) -> NaverNewsProvider:
    fake_client, _transport = client_with_responses(responses)
    fake_provider = NaverNewsProvider(client_id="id", client_secret="secret", client=fake_client)
    cast(FastAPI, client.app).dependency_overrides[get_naver_provider] = lambda: fake_provider
    return fake_provider


def _clear_provider_override(client: TestClient, fake_provider: NaverNewsProvider) -> None:
    del cast(FastAPI, client.app).dependency_overrides[get_naver_provider]
    fake_provider.close()


def test_external_evidence_requires_authentication(client):
    response = client.post(
        "/api/v1/external-evidence",
        json={"operation": "COLLECT", "claim": _claim_json(), "company_name": "삼성전자"},
    )
    assert response.status_code == 401


def test_collect_news_returns_query_and_raw_record_id(client, db_session):
    token = _register_and_get_token(client)
    fixture = load_json("news_search_samsung.json")
    fake_provider = _override_provider(client, [json_response(fixture)])
    try:
        response = client.post(
            "/api/v1/external-evidence",
            headers={"Authorization": f"Bearer {token}"},
            json={"operation": "COLLECT", "claim": _claim_json(), "company_name": "삼성전자"},
        )
        assert response.status_code == 200
        body = response.json()["data"]
        assert body["query"] == "삼성전자 영업이익 2026Q2"
        assert len(body["raw_record_ids"]) == 1
    finally:
        _clear_provider_override(client, fake_provider)


def test_collect_invalid_credentials_maps_to_external_error(client, db_session):
    token = _register_and_get_token(client)
    error = load_json("news_search_invalid_credentials.json")
    fake_provider = _override_provider(client, [httpx.Response(401, json=error)])
    try:
        response = client.post(
            "/api/v1/external-evidence",
            headers={"Authorization": f"Bearer {token}"},
            json={"operation": "COLLECT", "claim": _claim_json(), "company_name": "삼성전자"},
        )
        assert response.status_code == 502
        assert response.json()["status"] == "EXTERNAL_ERROR"
        assert response.json()["reason_code"] == "PROVIDER_AUTH_FAILED"
    finally:
        _clear_provider_override(client, fake_provider)


def test_normalize_returns_external_documents_and_no_numeric_evidence(client, db_session):
    token = _register_and_get_token(client)
    fixture = load_json("news_search_samsung.json")
    fake_provider = _override_provider(client, [json_response(fixture)])
    try:
        collect_response = client.post(
            "/api/v1/external-evidence",
            headers={"Authorization": f"Bearer {token}"},
            json={"operation": "COLLECT", "claim": _claim_json(), "company_name": "삼성전자"},
        )
        raw_record_ids = collect_response.json()["data"]["raw_record_ids"]

        normalize_response = client.post(
            "/api/v1/external-evidence",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "operation": "NORMALIZE",
                "eligible_raw_record_ids": raw_record_ids,
                "company_name": "삼성전자",
                "normalization_policy_ref": "interim-pre-s15-v1",
                "as_of": "2026-07-14",
            },
        )
        assert normalize_response.status_code == 200
        body = normalize_response.json()["data"]
        assert len(body["external_documents"]) == len(fixture["items"])
        assert body["numeric_evidence"] == []
    finally:
        _clear_provider_override(client, fake_provider)


def test_collect_rejects_malformed_body_with_validation_envelope(client, db_session):
    token = _register_and_get_token(client)
    response = client.post(
        "/api/v1/external-evidence",
        headers={"Authorization": f"Bearer {token}"},
        json={"operation": "COLLECT", "claim": {"claim_id": "only-id"}, "company_name": "삼성전자"},
    )
    assert response.status_code == 422
    assert response.json()["status"] == "VALIDATION_ERROR"
