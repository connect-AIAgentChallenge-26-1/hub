from fastapi import FastAPI, Request, Response

from app.exception_handlers import register_exception_handlers
from app.middleware import RequestContextMiddleware
from app.observability import configure_logging, latest_metrics
from app.routers import (
    auth,
    companies,
    disclosures,
    external_evidence,
    financial_facts,
    market,
    temporal_integrity,
)
from app.schemas.envelope import Envelope, Status, now_utc


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(title="근거 검증 Agent API", version="0.1.0")

    app.add_middleware(RequestContextMiddleware)
    register_exception_handlers(app)
    app.include_router(auth.router)
    app.include_router(companies.router)
    app.include_router(disclosures.router)
    app.include_router(market.router)
    app.include_router(external_evidence.router)
    app.include_router(temporal_integrity.router)
    app.include_router(financial_facts.router)

    @app.get("/api/v1/health", response_model=Envelope[dict[str, bool]])
    def health(request: Request) -> Envelope[dict[str, bool]]:
        started_at = now_utc()
        return Envelope[dict[str, bool]](
            request_id=request.state.request_id,
            trace_id=request.state.trace_id,
            as_of=started_at.date(),
            status=Status.SUCCESS,
            source_ids=[],
            model_or_rule_version="health-1.0.0",
            started_at=started_at,
            completed_at=now_utc(),
            data={"ok": True},
        )

    # Prometheus scrape endpoint. 공개 배포 전 접근 제어는 T13(배포·운영)에서
    # 다룬다 — 현재는 로컬·CI 환경 전용.
    @app.get("/metrics", include_in_schema=False)
    def metrics() -> Response:
        payload, content_type = latest_metrics()
        return Response(content=payload, media_type=content_type)

    return app


app = create_app()
