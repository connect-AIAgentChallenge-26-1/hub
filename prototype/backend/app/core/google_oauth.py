"""구글 OAuth + 캘린더 API 연동 유틸리티.

로그인과 캘린더 읽기 권한을 하나의 동의 화면에서 함께 요청한다.
"""

from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
import jwt

from app.config import settings

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

SCOPES = "openid email profile https://www.googleapis.com/auth/calendar.readonly"


def create_oauth_state() -> str:
    payload = {
        "purpose": "google_oauth",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def verify_oauth_state(state: str) -> bool:
    try:
        payload = jwt.decode(state, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return False
    return payload.get("purpose") == "google_oauth"


def build_auth_url(state: str) -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        # 최초 동의 시 refresh_token을 확실히 받기 위한 설정
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


def exchange_code(code: str) -> dict:
    response = httpx.post(
        GOOGLE_TOKEN_URL,
        data={
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": settings.google_redirect_uri,
        },
        timeout=10,
    )
    response.raise_for_status()
    return response.json()


def refresh_access_token(refresh_token: str) -> dict:
    response = httpx.post(
        GOOGLE_TOKEN_URL,
        data={
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=10,
    )
    response.raise_for_status()
    return response.json()


def fetch_userinfo(access_token: str) -> dict:
    response = httpx.get(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()


def fetch_calendar_events(access_token: str, time_min: datetime, time_max: datetime) -> list[dict]:
    events: list[dict] = []
    page_token: str | None = None
    while True:
        params = {
            "timeMin": time_min.isoformat(),
            "timeMax": time_max.isoformat(),
            "singleEvents": "true",  # 반복 일정을 개별 인스턴스로 펼친다
            "orderBy": "startTime",
            "maxResults": "250",
        }
        if page_token:
            params["pageToken"] = page_token
        response = httpx.get(
            GOOGLE_CALENDAR_EVENTS_URL,
            params=params,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
        events.extend(data.get("items", []))
        page_token = data.get("nextPageToken")
        if not page_token:
            return events
