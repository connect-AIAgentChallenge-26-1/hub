import uuid
from collections.abc import Generator

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.models.user import User
from app.providers.kis import KisProvider
from app.providers.naver_news import NaverNewsProvider
from app.providers.opendart import OpenDartProvider
from app.providers.solar import SolarProvider
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


def get_kis_provider() -> Generator[KisProvider, None, None]:
    settings = get_settings()
    with KisProvider(
        app_key=settings.kis_app_key or "",
        app_secret=settings.kis_app_secret or "",
        env=settings.kis_env,
    ) as provider:
        yield provider


def get_naver_provider() -> Generator[NaverNewsProvider, None, None]:
    settings = get_settings()
    with NaverNewsProvider(
        client_id=settings.naver_client_id or "",
        client_secret=settings.naver_client_secret or "",
    ) as provider:
        yield provider


def get_solar_provider() -> Generator[SolarProvider, None, None]:
    # docs/prerequisites.md T06·T07 — UPSTAGE_API_KEY 미발급 상태에서도 backend가
    # 시작은 되도록(다른 provider와 동일 패턴) 빈 문자열 fallback을 쓴다. 실제
    # 호출 시에는 401(ProviderAuthError)로 안전하게 실패한다.
    with SolarProvider(api_key=get_settings().upstage_api_key or "") as provider:
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
