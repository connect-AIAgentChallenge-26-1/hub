import uuid
from collections.abc import Generator

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.models.user import User
from app.providers.opendart import OpenDartProvider
from app.repositories.user_repository import UserRepository
from app.security.tokens import InvalidTokenError, decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login", auto_error=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_opendart_provider() -> Generator[OpenDartProvider, None, None]:
    # A FastAPI dependency (rather than direct instantiation in the router)
    # so tests can override it with a fixture-backed fake instead of making
    # real network calls (docs/checklist.md C2 "정상/실패/공격 테스트").
    with OpenDartProvider(api_key=get_settings().dart_api_key or "") as provider:
        yield provider


class NotAuthenticatedError(Exception):
    pass


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    if token is None:
        raise NotAuthenticatedError("missing bearer token")

    try:
        subject = decode_access_token(token)
    except InvalidTokenError as exc:
        raise NotAuthenticatedError(str(exc)) from exc

    user = UserRepository(db).get_by_id(uuid.UUID(subject))
    if user is None:
        raise NotAuthenticatedError("token subject does not match a known user")
    return user
