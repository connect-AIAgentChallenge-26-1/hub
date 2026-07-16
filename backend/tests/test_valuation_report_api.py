"""기능 B 가치 범위·가격 위치 API e2e (docs/checklist.md C6): 인증 필수, 정상
전체 리포트, 단일 목표가·추천 문구 0건, provider 장애 checkpoint."""

from __future__ import annotations

import uuid
from datetime import date
from typing import cast

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies import get_kis_provider, get_opendart_provider
from app.providers.kis import KisProvider, TokenCache
from app.providers.opendart import OpenDartProvider
from tests.support.kis_mock import load_json as load_kis_json
from tests.support.opendart_mock import client_with_responses as opendart_client
from tests.support.opendart_mock import json_response
from tests.support.opendart_mock import load_json as load_opendart_json

_FORBIDDEN_PHRASES = ("매수", "매도", "관망", "분할매수", "보류", "목표가", "고평가", "저평가")


def _token(client: TestClient) -> str:
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": f"{uuid.uuid4()}@example.com", "password": "correct-horse-battery"},
    )
    return str(resp.json()["data"]["access_token"])


def _override_opendart(client: TestClient, responses: list[httpx.Response | Exception]) -> None:
    fake_client, _transport = opendart_client(responses)
    fake_provider = OpenDartProvider(api_key="test-key", client=fake_client)
    cast(FastAPI, client.app).dependency_overrides[get_opendart_provider] = lambda: fake_provider


def _override_kis(client: TestClient, responses: list[httpx.Response | Exception]) -> None:
    from tests.support.kis_mock import client_with_responses as kis_client

    token_fixture = load_kis_json("token_issue_success_redacted.json")
    fake_client, _transport = kis_client([json_response(token_fixture), *responses])
    fake_provider = KisProvider(
        app_key="k", app_secret="s", env="vps", client=fake_client, token_cache=TokenCache()
    )
    cast(FastAPI, client.app).dependency_overrides[get_kis_provider] = lambda: fake_provider


def _happy_path_dart_responses() -> list[httpx.Response | Exception]:
    return [
        json_response(load_opendart_json("company_overview_samsung.json")),
        json_response(load_opendart_json("financial_calculator/annual_2024_CFS.json")),
        json_response(load_opendart_json("company_overview_skhynix.json")),
        json_response(load_opendart_json("financial_calculator/peer_2024_CFS_skhynix.json")),
        json_response(load_opendart_json("company_overview_dbhitek.json")),
        json_response(load_opendart_json("financial_calculator/peer_2024_CFS_dbhitek.json")),
        json_response(load_opendart_json("company_overview_samsung_electro.json")),
        json_response(
            load_opendart_json("financial_calculator/peer_2024_CFS_samsung_electro.json")
        ),
    ]


def _happy_path_kis_responses() -> list[httpx.Response | Exception]:
    return [
        json_response(load_kis_json("current_price_005930.json")),
        json_response(load_kis_json("current_price_skhynix_000660.json")),
        json_response(load_kis_json("current_price_dbhitek_000990.json")),
        json_response(load_kis_json("current_price_samsung_electro_009150.json")),
    ]


def _body() -> dict[str, object]:
    # 라우터는 프로덕션 `date.today()`를 그대로 쓴다(주입 불가, 실제 서비스와
    # 동일 동작) — 현재가 endpoint가 거래일자를 증명하지 못해 as_of가 오늘이
    # 아니면 안전 종료하므로(GPT 리뷰 2026-07-16 11:00 발견), 이 e2e 테스트는
    # 항상 실제 오늘 날짜로 요청해야 한다.
    return {
        "target": {"corp_code": "00126380", "stock_code": "005930"},
        "candidates": [
            {"corp_code": "00164779", "stock_code": "000660"},
            {"corp_code": "00160843", "stock_code": "000990"},
            {"corp_code": "00126371", "stock_code": "009150"},
        ],
        "as_of": date.today().isoformat(),
        "bsns_year": "2024",
        "reprt_code": "11011",
        "fs_div": "CFS",
    }


def test_requires_auth(client: TestClient) -> None:
    resp = client.post("/api/v1/valuation-report", json=_body())
    assert resp.status_code == 401


def test_full_report_e2e(client: TestClient) -> None:
    token = _token(client)
    _override_opendart(client, _happy_path_dart_responses())
    _override_kis(client, _happy_path_kis_responses())
    resp = client.post(
        "/api/v1/valuation-report", json=_body(), headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    data = resp.json()["data"]

    assert data["target_profile"]["corp_name"] == "삼성전자(주)"
    assert data["peer"]["sufficient"] is True
    assert len(data["peer"]["peer_universe"]) == 3
    assert data["valuation"]["data_quality"] == "SUFFICIENT"
    assert len(data["valuation"]["value_ranges"]) == 3

    # S21/S5 numeric evidence는 S15.POST_DERIVED를 통과한 뒤 API에도 노출돼야
    # 한다(GPT 리뷰 2026-07-16 13:52 발견 — 이전에는 post_derived 호출도, API
    # 노출도 없었다).
    peer_corp_codes = {p["corp_code"] for p in data["peer"]["peer_universe"]}
    assert data["peer"]["numeric_evidence"]
    for ev in data["peer"]["numeric_evidence"]:
        assert ev["source_ids"]
        assert set(ev["source_ids"]) <= peer_corp_codes
    assert data["valuation"]["numeric_evidence"]
    for ev in data["valuation"]["numeric_evidence"]:
        assert ev["source_ids"]
        assert set(ev["source_ids"]) <= peer_corp_codes
    assert not any(c["code"].endswith("_POST_DERIVED_REJECTED") for c in data["checkpoints"])
    assert data["price_position"]["overall_position"] == "BELOW_MODEL_RANGE"
    assert len(data["price_position"]["method_positions"]) == 3


def test_no_single_target_price_or_forbidden_phrases(client: TestClient) -> None:
    token = _token(client)
    _override_opendart(client, _happy_path_dart_responses())
    _override_kis(client, _happy_path_kis_responses())
    resp = client.post(
        "/api/v1/valuation-report", json=_body(), headers={"Authorization": f"Bearer {token}"}
    )
    data = resp.json()["data"]
    # 방법마다 항상 low/mid/high 3점 범위 — 단일 target price 필드가 없다.
    for r in data["valuation"]["value_ranges"]:
        assert r["low"] < r["mid"] < r["high"]
    for phrase in _FORBIDDEN_PHRASES:
        assert phrase not in resp.text


def test_insufficient_peers_returns_insufficient_position(client: TestClient) -> None:
    token = _token(client)
    dart_responses: list[httpx.Response | Exception] = [
        json_response(load_opendart_json("company_overview_samsung.json")),
        json_response(load_opendart_json("financial_calculator/annual_2024_CFS.json")),
        json_response(load_opendart_json("company_overview_skhynix.json")),
        json_response(load_opendart_json("financial_calculator/peer_2024_CFS_skhynix.json")),
    ]
    _override_opendart(client, dart_responses)
    kis_responses: list[httpx.Response | Exception] = [
        json_response(load_kis_json("current_price_005930.json")),
        json_response(load_kis_json("current_price_skhynix_000660.json")),
    ]
    _override_kis(client, kis_responses)
    body = _body()
    body["candidates"] = [{"corp_code": "00164779", "stock_code": "000660"}]
    resp = client.post(
        "/api/v1/valuation-report", json=body, headers={"Authorization": f"Bearer {token}"}
    )
    data = resp.json()["data"]
    assert data["peer"]["sufficient"] is False
    assert data["price_position"]["overall_position"] == "INSUFFICIENT"
    assert any(c["code"] == "INSUFFICIENT_PEERS" for c in data["checkpoints"])


def test_provider_fault_is_a_checkpoint_not_a_500(client: TestClient) -> None:
    from app.providers.base import ProviderRateLimitedError

    token = _token(client)
    _override_opendart(
        client, [json_response(load_opendart_json("company_overview_samsung.json"))]
    )
    _override_kis(client, [ProviderRateLimitedError("rate limited")])
    body = _body()
    body["candidates"] = []
    resp = client.post(
        "/api/v1/valuation-report", json=body, headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["target_profile"] is None
    assert any(c["code"] == "TARGET_DATA_UNAVAILABLE" for c in data["checkpoints"])
