import uuid
from typing import cast

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies import get_opendart_provider
from app.providers.opendart import OpenDartProvider
from tests.support.opendart_mock import (
    QueueTransport,
    client_with_responses,
    json_response,
    load_error,
    load_json,
)


def _register_and_get_token(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": f"{uuid.uuid4()}@example.com", "password": "correct-horse-battery"},
    )
    token: str = response.json()["data"]["access_token"]
    return token


def _override_provider(
    client: TestClient, responses: list[httpx.Response | Exception]
) -> tuple[OpenDartProvider, QueueTransport]:
    fake_client, transport = client_with_responses(responses)
    fake_provider = OpenDartProvider(api_key="test-key", client=fake_client)
    cast(FastAPI, client.app).dependency_overrides[get_opendart_provider] = lambda: fake_provider
    return fake_provider, transport


def _clear_provider_override(client: TestClient, fake_provider: OpenDartProvider) -> None:
    del cast(FastAPI, client.app).dependency_overrides[get_opendart_provider]
    fake_provider.close()


def test_disclosures_requires_authentication(client):
    response = client.post(
        "/api/v1/disclosures",
        json={
            "operation": "COLLECT",
            "corp_code": "00126380",
            "as_of": "2026-07-13",
            "period": {"bgn_de": "20240101", "end_de": "20240401"},
        },
    )
    assert response.status_code == 401


def test_collect_operation_stores_raw_records_and_returns_trace(client, db_session):
    token = _register_and_get_token(client)
    disclosure_fixture = load_json("disclosure_list_samsung.json")
    financial_fixture = load_json("financial_statements_samsung.json")
    fake_provider, _ = _override_provider(
        client, [json_response(disclosure_fixture), json_response(financial_fixture)]
    )

    try:
        response = client.post(
            "/api/v1/disclosures",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "operation": "COLLECT",
                "corp_code": "00126380",
                "as_of": "2024-04-01",
                "period": {"bgn_de": "20240101", "end_de": "20240401"},
                "reprt_codes": ["11011"],
                "fs_divs": ["CFS"],
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "SUCCESS"
        assert len(body["data"]["raw_record_ids"]) == 2
        record_types = {t["record_type"] for t in body["data"]["provider_trace"]}
        assert record_types == {"DISCLOSURE_LIST_ITEM", "FINANCIAL_STATEMENT_ROW"}
    finally:
        _clear_provider_override(client, fake_provider)


def test_normalize_operation_returns_disclosures_from_collected_records(client, db_session):
    token = _register_and_get_token(client)
    disclosure_fixture = load_json("disclosure_list_samsung.json")
    fake_provider, _ = _override_provider(client, [json_response(disclosure_fixture)])

    try:
        collect_response = client.post(
            "/api/v1/disclosures",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "operation": "COLLECT",
                "corp_code": "00126380",
                "as_of": "2026-07-13",
                "period": {"bgn_de": "20240101", "end_de": "20240401"},
            },
        )
        raw_record_ids = collect_response.json()["data"]["raw_record_ids"]

        normalize_response = client.post(
            "/api/v1/disclosures",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "operation": "NORMALIZE",
                "eligible_raw_record_ids": raw_record_ids,
                "normalization_policy_ref": "interim-pre-s15-v1",
                "as_of": "2026-07-13",
            },
        )
        assert normalize_response.status_code == 200
        body = normalize_response.json()["data"]
        assert len(body["disclosures"]) == len(disclosure_fixture["list"])
    finally:
        _clear_provider_override(client, fake_provider)


def test_normalize_with_unknown_raw_record_id_is_empty_with_a_warning_not_silent(
    client, db_session
):
    # 존재하지 않는 id는 500/변환 실패가 아니라 정상 응답이지만, 조용히
    # 버려지지 않고 envelope warnings에 남아야 한다 — 오탈자·경합 등 호출자
    # 오류를 구현이 삼키지 않기 위해서다(CLAUDE.md 절대 원칙 7).
    token = _register_and_get_token(client)
    fake_provider, _ = _override_provider(client, [])
    unknown_id = "00000000-0000-0000-0000-000000000000"

    try:
        response = client.post(
            "/api/v1/disclosures",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "operation": "NORMALIZE",
                "eligible_raw_record_ids": [unknown_id],
                "normalization_policy_ref": "interim-pre-s15-v1",
                "as_of": "2026-07-13",
            },
        )
        assert response.status_code == 200
        envelope = response.json()
        assert envelope["status"] == "SUCCESS"
        body = envelope["data"]
        assert body["disclosures"] == []
        assert body["eligible_financial_rows"] == []
        assert any(unknown_id in w for w in envelope["warnings"])
    finally:
        _clear_provider_override(client, fake_provider)


def test_collect_maps_provider_no_data_to_external_envelope_not_internal_error(
    client, db_session
):
    # ProviderError(여기서는 013 no-data -> ProviderNotFoundError)가 handler
    # 없이 generic Exception으로 새면 INTERNAL_ERROR/UNHANDLED_EXCEPTION이 된다.
    # provider 장애는 우리 구현 오류가 아니므로 별도 handler로 구분돼야 한다.
    token = _register_and_get_token(client)
    fake_provider, _ = _override_provider(
        client, [json_response(load_error("013_no_data"))]
    )

    try:
        response = client.post(
            "/api/v1/disclosures",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "operation": "COLLECT",
                "corp_code": "00126380",
                "as_of": "2026-07-13",
                "period": {"bgn_de": "20240101", "end_de": "20240401"},
            },
        )
        assert response.status_code == 404
        body = response.json()
        assert body["status"] == "NOT_FOUND"
        assert body["reason_code"] == "PROVIDER_NO_DATA"
    finally:
        _clear_provider_override(client, fake_provider)


def test_collect_maps_provider_rate_limit_to_external_error_not_internal_error(
    client, db_session
):
    token = _register_and_get_token(client)
    fake_provider, _ = _override_provider(
        client, [json_response(load_error("020_rate_limited"))]
    )

    try:
        response = client.post(
            "/api/v1/disclosures",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "operation": "COLLECT",
                "corp_code": "00126380",
                "as_of": "2026-07-13",
                "period": {"bgn_de": "20240101", "end_de": "20240401"},
            },
        )
        # docs/skills.md: RATE_LIMITED는 우리 서비스 한도 전용 — provider
        # rate limit은 EXTERNAL_ERROR + reason_code로 구분한다(502로 매핑).
        assert response.status_code == 502
        body = response.json()
        assert body["status"] == "EXTERNAL_ERROR"
        assert body["reason_code"] == "PROVIDER_RATE_LIMITED"
    finally:
        _clear_provider_override(client, fake_provider)


def test_collect_rejects_malformed_body_with_validation_envelope(client, db_session):
    token = _register_and_get_token(client)
    response = client.post(
        "/api/v1/disclosures",
        headers={"Authorization": f"Bearer {token}"},
        json={"operation": "COLLECT", "corp_code": "00126380"},
    )
    assert response.status_code == 422
    assert response.json()["status"] == "VALIDATION_ERROR"
