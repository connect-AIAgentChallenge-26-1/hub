import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.dependencies import get_opendart_provider
from app.providers.opendart import OpenDartProvider, RawFetch, checksum_of
from app.services.company_resolver import CompanyResolver
from tests.support.opendart_mock import client_with_responses, load_bytes, zip_response


def _register_and_get_token(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": f"{uuid.uuid4()}@example.com", "password": "correct-horse-battery"},
    )
    token: str = response.json()["data"]["access_token"]
    return token


def _seed_companies(db_session: Session) -> None:
    resolver = CompanyResolver(db_session)
    zip_bytes = load_bytes("corp_code_sample.zip")
    resolver.ingest_corp_master(RawFetch(raw_payload=zip_bytes, checksum=checksum_of(zip_bytes)))


def test_resolve_returns_matched_company(client, db_session):
    _seed_companies(db_session)
    response = client.get("/api/v1/companies/resolve", params={"query": "005930"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "SUCCESS"
    assert body["data"]["matched"] is True
    assert body["data"]["corp_code"] == "00126380"


def test_resolve_returns_ambiguous_candidates_without_matching(client, db_session):
    _seed_companies(db_session)
    response = client.get("/api/v1/companies/resolve", params={"query": "덕성"})
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["matched"] is False
    assert body["data"]["reason_code"] == "AMBIGUOUS"
    assert len(body["data"]["candidates"]) == 4


def test_resolve_requires_a_query_param(client, db_session):
    response = client.get("/api/v1/companies/resolve")
    assert response.status_code == 422


def test_ingest_requires_authentication(client):
    response = client.post("/api/v1/companies/ingest")
    assert response.status_code == 401


def test_ingest_populates_companies_from_provider(client, db_session):
    token = _register_and_get_token(client)
    zip_bytes = load_bytes("corp_code_sample.zip")
    fake_client, _ = client_with_responses([zip_response(zip_bytes)])
    fake_provider = OpenDartProvider(api_key="test-key", client=fake_client)
    client.app.dependency_overrides[get_opendart_provider] = lambda: fake_provider

    try:
        response = client.post(
            "/api/v1/companies/ingest", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        assert response.json()["data"]["record_count"] == 9

        resolve_response = client.get(
            "/api/v1/companies/resolve", params={"query": "NAVER"}
        )
        assert resolve_response.json()["data"]["matched"] is True
    finally:
        del client.app.dependency_overrides[get_opendart_provider]
        fake_provider.close()
