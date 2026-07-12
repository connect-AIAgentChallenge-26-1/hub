from app.middleware import REQUEST_ID_HEADER, TRACE_ID_HEADER


def test_health_returns_success_envelope(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200

    body = response.json()
    assert body["status"] == "SUCCESS"
    assert body["data"] == {"ok": True}
    assert body["schema_version"] == "1.0.0"


def test_health_response_carries_request_and_trace_ids(client):
    response = client.get("/api/v1/health")
    assert REQUEST_ID_HEADER in response.headers
    assert TRACE_ID_HEADER in response.headers


def test_caller_supplied_request_id_is_echoed_back(client):
    response = client.get("/api/v1/health", headers={REQUEST_ID_HEADER: "caller-req-1"})
    assert response.headers[REQUEST_ID_HEADER] == "caller-req-1"
