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
from app.repositories.user_repository import EmailAlreadyRegisteredError
from app.schemas.envelope import Envelope, Status, now_utc

logger = logging.getLogger("app.error")


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

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        return _envelope_response(
            request,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            Status.INTERNAL_ERROR,
            "UNHANDLED_EXCEPTION",
        )
