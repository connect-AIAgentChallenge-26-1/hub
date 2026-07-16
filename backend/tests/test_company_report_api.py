"""기능 A 종목 공부 리포트 API e2e (docs/checklist.md C5): 인증 필수, 정상
전체 리포트, provider 장애가 checkpoint로 안전 종료, 추천·단정 표현 0건."""

from __future__ import annotations

import uuid
from typing import cast

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies import get_opendart_provider
from app.providers.opendart import OpenDartProvider
from tests.support.opendart_mock import client_with_responses, json_response, load_bytes, load_json

CORP_CODE = "00126380"
STOCK_CODE = "005930"

_FORBIDDEN_PHRASES = ("매수", "매도", "관망", "분할매수", "보류", "목표가", "고평가", "저평가")


def _token(client: TestClient) -> str:
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": f"{uuid.uuid4()}@example.com", "password": "correct-horse-battery"},
    )
    return str(resp.json()["data"]["access_token"])


def _override_provider(client: TestClient, responses: list[httpx.Response | Exception]) -> None:
    fake_client, _transport = client_with_responses(responses)
    fake_provider = OpenDartProvider(api_key="test-key", client=fake_client)
    cast(FastAPI, client.app).dependency_overrides[get_opendart_provider] = lambda: fake_provider


def _happy_path_responses() -> list[httpx.Response | Exception]:
    doc_zip = load_bytes("document_20241129001733.zip")
    from tests.support.opendart_mock import zip_response

    return [
        json_response(load_json("company_overview_samsung.json")),
        json_response(load_json("disclosure_list_samsung.json")),
        json_response(load_json("financial_calculator/annual_2023_CFS.json")),
        json_response(load_json("financial_calculator/annual_2024_CFS.json")),
        zip_response(doc_zip),
        zip_response(doc_zip),
    ]


def _body() -> dict[str, object]:
    return {
        "corp_code": CORP_CODE,
        "stock_code": STOCK_CODE,
        "as_of": "2026-07-15",
        "bgn_de": "20240101",
        "end_de": "20240401",
        "bsns_years": ["2023", "2024"],
        "reprt_codes": ["11011"],
        "fs_div": "CFS",
    }


def test_requires_auth(client: TestClient) -> None:
    resp = client.post("/api/v1/company-report", json=_body())
    assert resp.status_code == 401


def test_full_report_e2e(client: TestClient) -> None:
    token = _token(client)
    _override_provider(client, _happy_path_responses())
    resp = client.post(
        "/api/v1/company-report", json=_body(), headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    data = resp.json()["data"]

    assert data["overview"]["corp_name"] == "삼성전자(주)"
    assert data["overview"]["corp_classification_label"] == "유가증권시장(코스피)"
    assert len(data["disclosures"]) == 10
    assert data["disclosures"][0]["source_url"].startswith("https://opendart.fss.or.kr")
    assert len(data["metric_trends"]) > 0
    assert data["citations"]
    assert all(c["verified"] for c in data["citations"])
    assert data["generator_version"] == "s11-company-report-generator-1.0.0"


def test_no_forbidden_phrases_anywhere_in_response(client: TestClient) -> None:
    token = _token(client)
    _override_provider(client, _happy_path_responses())
    resp = client.post(
        "/api/v1/company-report", json=_body(), headers={"Authorization": f"Bearer {token}"}
    )
    body_text = resp.text
    for phrase in _FORBIDDEN_PHRASES:
        assert phrase not in body_text, phrase


def test_provider_fault_on_overview_is_a_checkpoint(client: TestClient) -> None:
    token = _token(client)
    _override_provider(
        client,
        [
            json_response({"status": "020", "message": "요청 제한을 초과하였습니다."}),
            json_response(load_json("disclosure_list_samsung.json")),
        ],
    )
    body = _body()
    body["bsns_years"] = []
    body["reprt_codes"] = []
    resp = client.post(
        "/api/v1/company-report", json=body, headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["overview"] is None
    assert any(c["code"].startswith("OVERVIEW_") for c in data["checkpoints"])
    assert any(c["severity"] == "ERROR" for c in data["checkpoints"])
