import uuid

from fastapi.testclient import TestClient


def _register_and_get_token(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": f"{uuid.uuid4()}@example.com", "password": "correct-horse-battery"},
    )
    token: str = response.json()["data"]["access_token"]
    return token


def test_temporal_integrity_requires_authentication(client):
    response = client.post(
        "/api/v1/temporal-integrity",
        json={
            "mode": "PRE_NORMALIZE",
            "candidates": [],
            "as_of": "2026-07-13",
        },
    )
    assert response.status_code == 401


def test_pre_normalize_excludes_future_candidate(client, db_session):
    token = _register_and_get_token(client)
    response = client.post(
        "/api/v1/temporal-integrity",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "mode": "PRE_NORMALIZE",
            "candidates": [
                {
                    "record_id": "a",
                    "effective_date": "2026-07-01",
                    "source_type": "disclosure",
                },
                {
                    "record_id": "b",
                    "effective_date": "2026-07-20",
                    "source_type": "disclosure",
                },
            ],
            "as_of": "2026-07-13",
        },
    )
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["eligible_record_ids"] == ["a"]
    assert body["rejected_record_ids"] == ["b"]


def test_post_derived_rejects_corp_code_mismatch(client, db_session):
    token = _register_and_get_token(client)
    response = client.post(
        "/api/v1/temporal-integrity",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "mode": "POST_DERIVED",
            "derived_checks": [
                {
                    "record_id": "roe",
                    "corp_code": "00126380",
                    "source_ids": ["f1", "f2"],
                    "source_corp_codes": ["00126380", "00164779"],
                    "unit": "RATIO",
                    "source_units": ["KRW", "KRW"],
                    "as_of": "2026-07-13",
                    "source_as_of": ["2026-07-01", "2026-07-01"],
                    "formula_version": "s3-financial-calculator-1.0.0",
                    "target_period": "2025-ANNUAL",
                    "source_periods": ["2025-ANNUAL", "2025-ANNUAL"],
                }
            ],
            "normalization_policy_ref": "s15-post-derived-1.0.0",
            "as_of": "2026-07-13",
        },
    )
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["rejected_record_ids"] == ["roe"]


def test_schema_rejects_post_derived_check_with_mismatched_source_metadata_lengths(
    client, db_session
):
    # source_ids는 채워져 있지만 source_corp_codes/source_units/source_as_of/
    # source_periods 중 하나라도 개수가 다르면 API 단계에서 422로 거부한다
    # (GPT 리뷰 2026-07-14 15:56 — 이전에는 이런 입력이 200 + rejected_record_ids로
    # 흘러가는 business 판정으로만 걸러졌다).
    token = _register_and_get_token(client)
    response = client.post(
        "/api/v1/temporal-integrity",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "mode": "POST_DERIVED",
            "derived_checks": [
                {
                    "record_id": "ev-missing-source-metadata",
                    "corp_code": "00126380",
                    "source_ids": ["fact-1"],
                    "source_corp_codes": [],
                    "unit": "RATIO",
                    "source_units": [],
                    "as_of": "2026-07-13",
                    "source_as_of": [],
                    "formula_version": "s3-financial-calculator-1.0.0",
                    "target_period": "2025-ANNUAL",
                    "source_periods": [],
                }
            ],
            "normalization_policy_ref": "s15-post-derived-1.0.0",
            "as_of": "2026-07-13",
        },
    )
    assert response.status_code == 422
    assert response.json()["status"] == "VALIDATION_ERROR"


def test_schema_rejects_pre_normalize_payload_shaped_as_post_derived(client, db_session):
    # PRE_NORMALIZE candidates must have effective_date/source_type — sending
    # POST_DERIVED-shaped items (formula_version, source_corp_codes, no
    # effective_date) under mode=PRE_NORMALIZE must fail schema validation,
    # not silently coerce (docs/checklist.md C4 "PRE의 derived payload... 거부").
    token = _register_and_get_token(client)
    response = client.post(
        "/api/v1/temporal-integrity",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "mode": "PRE_NORMALIZE",
            "candidates": [
                {
                    "record_id": "roe",
                    "corp_code": "00126380",
                    "source_ids": ["f1"],
                    "source_corp_codes": ["00126380"],
                    "unit": "RATIO",
                    "source_units": ["KRW"],
                    "formula_version": "s3-financial-calculator-1.0.0",
                }
            ],
            "as_of": "2026-07-13",
        },
    )
    assert response.status_code == 422
    assert response.json()["status"] == "VALIDATION_ERROR"


def test_schema_rejects_post_derived_payload_shaped_as_pre_normalize(client, db_session):
    # POST_DERIVED derived_checks must have corp_code/source_ids/formula_version
    # etc — sending PRE_NORMALIZE-shaped candidates (effective_date, source_type)
    # under mode=POST_DERIVED must fail schema validation.
    token = _register_and_get_token(client)
    response = client.post(
        "/api/v1/temporal-integrity",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "mode": "POST_DERIVED",
            "derived_checks": [
                {
                    "record_id": "a",
                    "effective_date": "2026-07-01",
                    "source_type": "disclosure",
                }
            ],
            "normalization_policy_ref": "s15-post-derived-1.0.0",
            "as_of": "2026-07-13",
        },
    )
    assert response.status_code == 422
    assert response.json()["status"] == "VALIDATION_ERROR"
