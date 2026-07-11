from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.core import google_oauth
from app.core.security import create_access_token
from app.database import get_db
from app.models.calendar_integration import CalendarIntegration
from app.models.user import User

router = APIRouter(prefix="/auth/google", tags=["auth"])


def _require_google_config() -> None:
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="구글 OAuth가 설정되지 않았습니다. backend/.env에 GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET을 넣어주세요.",
        )


@router.get("/login")
def google_login() -> RedirectResponse:
    _require_google_config()
    state = google_oauth.create_oauth_state()
    return RedirectResponse(google_oauth.build_auth_url(state))


@router.get("/callback")
def google_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    _require_google_config()
    login_error_url = f"{settings.frontend_url}/login?error=google_oauth_failed"

    if error or not code or not state or not google_oauth.verify_oauth_state(state):
        return RedirectResponse(login_error_url)

    try:
        tokens = google_oauth.exchange_code(code)
        userinfo = google_oauth.fetch_userinfo(tokens["access_token"])
    except (httpx.HTTPError, KeyError):
        return RedirectResponse(login_error_url)

    google_sub = userinfo.get("sub")
    email = userinfo.get("email")
    if not google_sub or not email:
        return RedirectResponse(login_error_url)

    user = db.query(User).filter(User.google_sub == google_sub).first()
    if user is None:
        # 같은 이메일로 가입한 기존 계정이 있으면 구글 계정을 연결한다
        user = db.query(User).filter(User.email == email).first()
        if user is not None:
            user.google_sub = google_sub
        else:
            user = User(
                name=userinfo.get("name") or email.split("@")[0],
                email=email,
                hashed_password=None,
                google_sub=google_sub,
            )
            db.add(user)
    db.flush()

    integration = (
        db.query(CalendarIntegration)
        .filter(CalendarIntegration.user_id == user.id, CalendarIntegration.provider == "google")
        .first()
    )
    if integration is None:
        integration = CalendarIntegration(
            user_id=user.id,
            provider="google",
            external_calendar_id="primary",
        )
        db.add(integration)

    integration.access_token = tokens["access_token"]
    # 재로그인 시 구글이 refresh_token을 생략할 수 있으므로 기존 값을 유지한다
    if tokens.get("refresh_token"):
        integration.refresh_token = tokens["refresh_token"]
    integration.token_expiry = datetime.now(timezone.utc) + timedelta(
        seconds=tokens.get("expires_in", 3600)
    )
    db.commit()

    access_token = create_access_token(subject=str(user.id))
    # URL fragment로 전달해 서버 로그에 토큰이 남지 않게 한다
    return RedirectResponse(f"{settings.frontend_url}/oauth/callback#token={access_token}")
