from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

from app.config import get_settings

TOKEN_SUBJECT_CLAIM = "sub"


class InvalidTokenError(Exception):
    pass


def create_access_token(subject: str, expires_minutes: int | None = None) -> str:
    settings = get_settings()
    expire = datetime.now(UTC) + timedelta(
        minutes=expires_minutes if expires_minutes is not None else settings.jwt_expire_minutes
    )
    payload: dict[str, Any] = {TOKEN_SUBJECT_CLAIM: subject, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> str:
    """Returns the token subject (user id) or raises InvalidTokenError."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc

    subject = payload.get(TOKEN_SUBJECT_CLAIM)
    if not isinstance(subject, str):
        raise InvalidTokenError("token payload missing subject claim")
    return subject
