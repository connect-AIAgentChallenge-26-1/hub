def test_register_returns_token_and_user(client):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "new@example.com", "password": "correct-horse-battery"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "SUCCESS"
    assert body["data"]["user"]["email"] == "new@example.com"
    assert body["data"]["access_token"]


def test_register_rejects_duplicate_email_with_conflict_envelope(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "dup@example.com", "password": "correct-horse-battery"},
    )
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "dup@example.com", "password": "another-password"},
    )
    assert response.status_code == 409
    body = response.json()
    assert body["status"] == "CONFLICT"
    assert body["reason_code"] == "EMAIL_ALREADY_REGISTERED"


def test_register_rejects_short_password_with_validation_envelope(client):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "short@example.com", "password": "short"},
    )
    assert response.status_code == 422
    body = response.json()
    assert body["status"] == "VALIDATION_ERROR"


def test_login_succeeds_with_correct_password(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "login@example.com", "password": "correct-horse-battery"},
    )
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "correct-horse-battery"},
    )
    assert response.status_code == 200
    assert response.json()["data"]["access_token"]


def test_login_rejects_wrong_password_with_authentication_error_envelope(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "wrongpass@example.com", "password": "correct-horse-battery"},
    )
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "wrongpass@example.com", "password": "totally-wrong"},
    )
    assert response.status_code == 401
    body = response.json()
    assert body["status"] == "AUTHENTICATION_ERROR"
    assert body["reason_code"] == "AUTHENTICATION_REQUIRED"


def test_login_rejects_unknown_email(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "whatever123"},
    )
    assert response.status_code == 401


def test_me_requires_bearer_token(client):
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_me_returns_current_user_with_valid_token(client):
    register_response = client.post(
        "/api/v1/auth/register",
        json={"email": "me@example.com", "password": "correct-horse-battery"},
    )
    token = register_response.json()["data"]["access_token"]

    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["data"]["email"] == "me@example.com"


def test_me_rejects_garbage_token(client):
    response = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401
