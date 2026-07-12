import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

from app.observability import record_request_metrics
from app.schemas.envelope import now_utc

REQUEST_ID_HEADER = "X-Request-Id"
TRACE_ID_HEADER = "X-Trace-Id"

logger = logging.getLogger("app.request")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assigns request_id/trace_id per request so every Envelope response can
    carry them (docs/skills.md 공통 원칙 10 "추적 가능성"). A caller-supplied
    X-Request-Id is honored (idempotency-key style correlation); trace_id is
    always generated fresh per request. 요청 1건당 구조화 로그 한 줄과
    Prometheus metrics를 남긴다.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        trace_id = str(uuid.uuid4())
        request.state.request_id = request_id
        request.state.trace_id = trace_id
        request.state.started_at = now_utc()
        started = time.perf_counter()

        response = await call_next(request)

        duration = time.perf_counter() - started
        # metrics label은 raw path가 아닌 route template을 써서 cardinality를
        # 제한한다. 매칭되지 않은 경로(404 등)는 하나의 label로 묶는다.
        route = request.scope.get("route")
        route_path = route.path if isinstance(route, Route) else "unmatched"
        record_request_metrics(request.method, route_path, response.status_code, duration)
        logger.info(
            "request completed",
            extra={
                "request_id": request_id,
                "trace_id": trace_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round(duration * 1000, 2),
            },
        )

        response.headers[REQUEST_ID_HEADER] = request_id
        response.headers[TRACE_ID_HEADER] = trace_id
        return response
