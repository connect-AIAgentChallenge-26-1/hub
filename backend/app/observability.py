"""구조화 로그(JSON line)와 요청 metrics — docs/checklist.md "각 항목은 코드,
정상·실패 테스트, 문서, 로그·metrics를 함께 갖춰야 완료" 기준의 T01 최소 구현.

- 로그: 요청 1건당 request_id/trace_id/method/path/status/duration을 가진
  JSON 한 줄. 오류 envelope 변환 시 reason_code도 함께 남긴다.
- metrics: Prometheus counter/histogram. path label은 route template을 써서
  cardinality 폭발을 막는다. /metrics 노출은 T13(배포·운영)에서 접근 제어와
  함께 다룬다.
"""

import json
import logging
from typing import Any

from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Histogram,
    generate_latest,
)

STRUCTURED_FIELDS = (
    "request_id",
    "trace_id",
    "method",
    "path",
    "status_code",
    "duration_ms",
    "reason_code",
)

REQUEST_COUNT = Counter(
    "http_requests_total",
    "HTTP 요청 수 (route template 기준)",
    ["method", "path", "status"],
)
REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP 요청 처리 시간 (route template 기준)",
    ["method", "path"],
)


class JsonLineFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key in STRUCTURED_FIELDS:
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        return json.dumps(payload, ensure_ascii=False)


def configure_logging() -> None:
    """app.* logger에 JSON line handler를 붙인다. 중복 부착은 방지한다."""
    logger = logging.getLogger("app")
    if any(isinstance(h.formatter, JsonLineFormatter) for h in logger.handlers):
        return
    handler = logging.StreamHandler()
    handler.setFormatter(JsonLineFormatter())
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


def record_request_metrics(
    method: str, route_path: str, status_code: int, duration_seconds: float
) -> None:
    REQUEST_COUNT.labels(method=method, path=route_path, status=str(status_code)).inc()
    REQUEST_LATENCY.labels(method=method, path=route_path).observe(duration_seconds)


def latest_metrics() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST
