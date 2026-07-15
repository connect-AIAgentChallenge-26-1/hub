"""Maps every error path onto the common Envelope contract (docs/skills.md).
This is the one place FastAPI/domain exceptions become an Envelope response
so no endpoint has to hand-roll error shapes.
"""

import logging

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.dependencies import NotAuthenticatedError
from app.providers.base import ProviderError, map_provider_error
from app.repositories.user_repository import EmailAlreadyRegisteredError
from app.schemas.envelope import Envelope, Status, now_utc
from app.services.deterministic_verifier import AmbiguousEvidenceError
from app.services.structured_claim_extractor import ExtractionFailedError

logger = logging.getLogger("app.error")

# ProviderError는 map_provider_error()가 이미 status/reason_code를 결정하므로
# 여기서는 그 status를 HTTP status code로만 옮긴다. provider 쪽 실패(외부 장애·
# rate limit·no-data)는 우리 구현 오류가 아니므로 500으로 뭉개지 않는다.
_PROVIDER_STATUS_TO_HTTP = {
    Status.EXTERNAL_ERROR: status.HTTP_502_BAD_GATEWAY,
    Status.RATE_LIMITED: status.HTTP_429_TOO_MANY_REQUESTS,
    Status.NOT_FOUND: status.HTTP_404_NOT_FOUND,
}


def _envelope_response(
    request: Request,
    http_status: int,
    status_value: Status,
    reason_code: str,
    warnings: list[str] | None = None,
) -> JSONResponse:
    # 오류 응답은 구조화 오류 로그 한 줄을 함께 남긴다 (INTERNAL_ERROR는 error,
    # 그 외 클라이언트 기인 오류는 warning).
    logger.log(
        logging.ERROR if status_value is Status.INTERNAL_ERROR else logging.WARNING,
        "request failed",
        extra={
            "request_id": getattr(request.state, "request_id", "unknown"),
            "trace_id": getattr(request.state, "trace_id", "unknown"),
            "method": request.method,
            "path": request.url.path,
            "status_code": http_status,
            "reason_code": reason_code,
        },
    )
    started_at = getattr(request.state, "started_at", now_utc())
    envelope = Envelope[None](
        request_id=getattr(request.state, "request_id", "unknown"),
        trace_id=getattr(request.state, "trace_id", "unknown"),
        as_of=now_utc().date(),
        status=status_value,
        reason_code=reason_code,
        warnings=warnings or [],
        source_ids=[],
        model_or_rule_version="auth-1.0.0",
        started_at=started_at,
        completed_at=now_utc(),
        data=None,
    )
    return JSONResponse(status_code=http_status, content=jsonable_encoder(envelope.model_dump()))


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return _envelope_response(
            request,
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            Status.VALIDATION_ERROR,
            "REQUEST_SCHEMA_INVALID",
            warnings=[str(e) for e in exc.errors()],
        )

    @app.exception_handler(EmailAlreadyRegisteredError)
    async def email_conflict_handler(
        request: Request, exc: EmailAlreadyRegisteredError
    ) -> JSONResponse:
        return _envelope_response(
            request, status.HTTP_409_CONFLICT, Status.CONFLICT, "EMAIL_ALREADY_REGISTERED"
        )

    @app.exception_handler(NotAuthenticatedError)
    async def not_authenticated_handler(
        request: Request, exc: NotAuthenticatedError
    ) -> JSONResponse:
        return _envelope_response(
            request,
            status.HTTP_401_UNAUTHORIZED,
            Status.AUTHENTICATION_ERROR,
            "AUTHENTICATION_REQUIRED",
        )

    @app.exception_handler(ExtractionFailedError)
    async def extraction_failed_handler(
        request: Request, exc: ExtractionFailedError
    ) -> JSONResponse:
        # S7 LLM 출력이 schema를 벗어났다 — 우리 구현 결함이 아니라 LLM
        # 응답이 계약을 지키지 않은 것이므로 500이 아니라 422로 구분한다
        # (docs/skills.md S23 "차단 실패 시 판정 경로를 중단한다").
        return _envelope_response(
            request,
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            Status.VALIDATION_ERROR,
            "EXTRACTION_SCHEMA_VIOLATION",
            warnings=[str(exc)],
        )

    @app.exception_handler(AmbiguousEvidenceError)
    async def ambiguous_evidence_handler(
        request: Request, exc: AmbiguousEvidenceError
    ) -> JSONResponse:
        # 근거 후보가 여러 개면 임의로 하나를 고르지 않는다(docs/skills.md S3
        # 원칙과 동일) — 호출자가 준 evidence 목록 자체가 모호하다는 뜻이라
        # 우리 구현 결함(500)이 아니라 요청 검증 실패(422)로 구분한다.
        return _envelope_response(
            request,
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            Status.VALIDATION_ERROR,
            "AMBIGUOUS_EVIDENCE_CANDIDATES",
            warnings=[str(exc)],
        )

    @app.exception_handler(ProviderError)
    async def provider_error_handler(request: Request, exc: ProviderError) -> JSONResponse:
        mapping = map_provider_error(exc)
        http_status = _PROVIDER_STATUS_TO_HTTP.get(mapping.status, status.HTTP_502_BAD_GATEWAY)
        return _envelope_response(request, http_status, mapping.status, mapping.reason_code)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        return _envelope_response(
            request,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            Status.INTERNAL_ERROR,
            "UNHANDLED_EXCEPTION",
        )
