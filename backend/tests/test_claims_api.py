import json
import uuid
from typing import Any, cast

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies import get_solar_provider
from app.providers.solar import SolarProvider
from tests.support.opendart_mock import client_with_responses, json_response


def _register_and_get_token(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": f"{uuid.uuid4()}@example.com", "password": "correct-horse-battery"},
    )
    token: str = response.json()["data"]["access_token"]
    return token


def _completion_response(content_json_str: str) -> httpx.Response:
    return json_response(
        {
            "id": "chatcmpl-1",
            "choices": [
                {"index": 0, "message": {"role": "assistant", "content": content_json_str}}
            ],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        }
    )


def _override_solar(
    client: TestClient, responses: list[httpx.Response | Exception]
) -> SolarProvider:
    fake_client, _transport = client_with_responses(responses)
    fake_provider = SolarProvider(api_key="test-key", client=fake_client)
    cast(FastAPI, client.app).dependency_overrides[get_solar_provider] = lambda: fake_provider
    return fake_provider


def _clear_solar_override(client: TestClient, fake_provider: SolarProvider) -> None:
    del cast(FastAPI, client.app).dependency_overrides[get_solar_provider]
    fake_provider.close()


def _claim_json(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "claim_id": "c1",
        "claim_group_id": None,
        "original_span": "영업이익이 2배 이상 늘었다",
        "corp_code": "00000000",
        "stock_code": "000000",
        "claim_type": "COMPARISON",
        "metric": "operating_profit",
        "evidence_domain": "financial",
        "comparison_entity_ref": None,
        "peer_universe_ref": None,
        "comparator": {
            "op": "MULTIPLE",
            "comparison_operator": "GTE",
            "target_value": 2,
            "target_unit": "multiple",
            "continuity_direction": None,
            "tolerance_value": None,
            "tolerance_unit": None,
        },
        "direction": "increase",
        "current_period": "2025Q4",
        "comparison_period": "2024Q4",
        "as_of": "2020-01-01",
        "verifiable": True,
        "ambiguity_flags": [],
        "condition": None,
    }
    payload.update(overrides)
    return payload


def test_extract_requires_authentication(client: TestClient) -> None:
    response = client.post(
        "/api/v1/claims/extract",
        json={"text": "삼성전자 영업이익이 늘었다.", "as_of": "2026-07-14"},
    )
    assert response.status_code == 401


def test_verify_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/v1/claims/verify", json={"claims": [], "numeric_evidence": []})
    assert response.status_code == 401


def test_extract_end_to_end_via_mocked_solar_overwrites_trusted_fields(client: TestClient) -> None:
    token = _register_and_get_token(client)
    fake_provider = _override_solar(
        client, [_completion_response(json.dumps({"claims": [_claim_json()]}))]
    )
    try:
        response = client.post(
            "/api/v1/claims/extract",
            json={
                "text": "삼성전자 영업이익이 2배 이상 늘었다.",
                "as_of": "2026-07-14",
                "resolved_company": {"corp_code": "00126380", "stock_code": "005930"},
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "SUCCESS"
        claims = body["data"]["claims"]
        assert len(claims) == 1
        assert claims[0]["corp_code"] == "00126380"  # LLM이 준 값이 아니라 신뢰된 값
        assert claims[0]["as_of"] == "2026-07-14"
    finally:
        _clear_solar_override(client, fake_provider)


def test_extract_maps_solar_auth_failure_to_external_error(client: TestClient) -> None:
    token = _register_and_get_token(client)
    fake_provider = _override_solar(
        client, [json_response({"error": {"message": "bad key"}}, status_code=401)]
    )
    try:
        response = client.post(
            "/api/v1/claims/extract",
            json={
                "text": "삼성전자 영업이익이 2배 이상 늘었다.",
                "as_of": "2026-07-14",
                "resolved_company": {"corp_code": "00126380", "stock_code": "005930"},
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 502
        assert response.json()["status"] == "EXTERNAL_ERROR"
    finally:
        _clear_solar_override(client, fake_provider)


def test_extract_maps_malformed_llm_output_to_validation_error(client: TestClient) -> None:
    token = _register_and_get_token(client)
    bad_claim = _claim_json()
    del bad_claim["metric"]
    fake_provider = _override_solar(
        client, [_completion_response(json.dumps({"claims": [bad_claim]}))]
    )
    try:
        response = client.post(
            "/api/v1/claims/extract",
            json={
                "text": "삼성전자 영업이익이 2배 이상 늘었다.",
                "as_of": "2026-07-14",
                "resolved_company": {"corp_code": "00126380", "stock_code": "005930"},
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 422
        body = response.json()
        assert body["status"] == "VALIDATION_ERROR"
        assert body["reason_code"] == "EXTRACTION_SCHEMA_VIOLATION"
    finally:
        _clear_solar_override(client, fake_provider)


def _evidence(value: float, period: str, **overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = dict(
        numeric_evidence_id=f"ne-{period}-{value}",
        evidence_domain="financial",
        corp_code="00126380",
        metric="operating_profit",
        value=value,
        unit="KRW",
        target_period=period,
        as_of="2026-07-14",
        source_ids=["fact-1"],
        provenance={},
        integrity_status="VERIFIED",
    )
    base.update(overrides)
    return base


def test_verify_computes_supported_verdict_from_numeric_evidence(client: TestClient) -> None:
    token = _register_and_get_token(client)
    claim = _claim_json(corp_code="00126380", stock_code="005930", as_of="2026-07-14")
    response = client.post(
        "/api/v1/claims/verify",
        json={
            "claims": [claim],
            "numeric_evidence": [
                _evidence(200, "2025Q4"),
                _evidence(100, "2024Q4"),
            ],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["atomic_results"][0]["verdict"] == "SUPPORTED"
    assert body["group_results"]["c1"] == "SUPPORTED"


def test_verify_returns_refuted_for_1_38x_against_2x_threshold(client: TestClient) -> None:
    # docs/checklist.md C8 "배수 >= 2, 실제 1.38배 → REFUTED" — API 레벨로도 확인.
    token = _register_and_get_token(client)
    claim = _claim_json(corp_code="00126380", stock_code="005930", as_of="2026-07-14")
    response = client.post(
        "/api/v1/claims/verify",
        json={
            "claims": [claim],
            "numeric_evidence": [_evidence(138, "2025Q4"), _evidence(100, "2024Q4")],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    body = response.json()["data"]
    assert body["atomic_results"][0]["verdict"] == "REFUTED"


def test_verify_marks_unanswered_ambiguous_claim_as_unverifiable(client: TestClient) -> None:
    token = _register_and_get_token(client)
    claim = _claim_json(
        corp_code="00126380",
        stock_code="005930",
        as_of="2026-07-14",
        ambiguity_flags=["comparison_period_unclear"],
    )
    response = client.post(
        "/api/v1/claims/verify",
        json={"claims": [claim], "numeric_evidence": []},
        headers={"Authorization": f"Bearer {token}"},
    )
    body = response.json()["data"]
    assert body["atomic_results"][0]["verdict"] == "UNVERIFIABLE"
    assert body["atomic_results"][0]["reason_code"] == "AMBIGUITY_UNCONFIRMED"
    assert body["disclosure"][0]["mode"] == "CONFIRM_QUESTION"


def test_verify_group_aggregates_supported_and_refuted_into_partially_supported(
    client: TestClient,
) -> None:
    token = _register_and_get_token(client)
    supported_claim = _claim_json(
        claim_id="c1",
        claim_group_id="g1",
        corp_code="00126380",
        stock_code="005930",
        as_of="2026-07-14",
        metric="revenue",
        comparator={
            "op": "THRESHOLD",
            "comparison_operator": "GTE",
            "target_value": 100,
            "target_unit": "KRW",
            "continuity_direction": None,
            "tolerance_value": None,
            "tolerance_unit": None,
        },
        current_period="2025Q4",
    )
    refuted_claim = _claim_json(
        claim_id="c2",
        claim_group_id="g1",
        corp_code="00126380",
        stock_code="005930",
        as_of="2026-07-14",
        metric="operating_profit",
        comparator={
            "op": "THRESHOLD",
            "comparison_operator": "GTE",
            "target_value": 999999,
            "target_unit": "KRW",
            "continuity_direction": None,
            "tolerance_value": None,
            "tolerance_unit": None,
        },
        current_period="2025Q4",
    )
    response = client.post(
        "/api/v1/claims/verify",
        json={
            "claims": [supported_claim, refuted_claim],
            "numeric_evidence": [
                _evidence(200, "2025Q4", metric="revenue"),
                _evidence(200, "2025Q4", metric="operating_profit"),
            ],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    body = response.json()["data"]
    assert body["group_results"]["g1"] == "PARTIALLY_SUPPORTED"


def test_verify_ambiguous_evidence_candidates_returns_422(client: TestClient) -> None:
    token = _register_and_get_token(client)
    claim = _claim_json(corp_code="00126380", stock_code="005930", as_of="2026-07-14")
    response = client.post(
        "/api/v1/claims/verify",
        json={
            "claims": [claim],
            "numeric_evidence": [
                _evidence(200, "2025Q4"),
                _evidence(250, "2025Q4"),  # 같은 기간에 후보 2개 — 모호
                _evidence(100, "2024Q4"),
            ],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422
    assert response.json()["reason_code"] == "AMBIGUOUS_EVIDENCE_CANDIDATES"
