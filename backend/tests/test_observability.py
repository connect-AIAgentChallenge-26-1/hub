import json
import logging

from app.observability import JsonLineFormatter


def test_request_emits_structured_log_line(client, caplog):
    with caplog.at_level(logging.INFO, logger="app.request"):
        response = client.get("/api/v1/health")
    assert response.status_code == 200

    records = [r for r in caplog.records if r.name == "app.request"]
    assert len(records) == 1
    record = records[0]
    assert record.request_id == response.headers["X-Request-Id"]
    assert record.trace_id == response.headers["X-Trace-Id"]
    assert record.method == "GET"
    assert record.path == "/api/v1/health"
    assert record.status_code == 200
    assert record.duration_ms >= 0

    # JSON line formatter가 구조화 필드를 실제로 직렬화하는지 확인한다.
    line = json.loads(JsonLineFormatter().format(record))
    assert line["request_id"] == response.headers["X-Request-Id"]
    assert line["status_code"] == 200


def test_error_response_logs_reason_code(client, caplog):
    with caplog.at_level(logging.WARNING, logger="app.error"):
        response = client.get("/api/v1/auth/me")  # 토큰 없음 → 401
    assert response.status_code == 401

    records = [r for r in caplog.records if r.name == "app.error"]
    assert len(records) == 1
    assert records[0].reason_code == "AUTHENTICATION_REQUIRED"
    assert records[0].levelno == logging.WARNING


def test_metrics_endpoint_exposes_request_counters(client):
    client.get("/api/v1/health")
    response = client.get("/metrics")
    assert response.status_code == 200
    body = response.text
    assert "http_requests_total" in body
    assert '/api/v1/health' in body
    assert "http_request_duration_seconds" in body
