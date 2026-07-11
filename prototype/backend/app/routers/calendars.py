import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core import apple_caldav, everytime, google_oauth
from app.core.deps import get_current_user
from app.database import get_db
from app.models.calendar_integration import CalendarIntegration
from app.models.event import Event
from app.models.user import User
from app.schemas.calendar import AppleConnect, EventRead, EverytimeConnect, IntegrationRead

router = APIRouter(prefix="/calendars", tags=["calendars"])

KST = timezone(timedelta(hours=9))
SYNC_WINDOW_DAYS = 14


@router.get("/integrations", response_model=list[IntegrationRead])
def list_integrations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CalendarIntegration]:
    return (
        db.query(CalendarIntegration)
        .filter(CalendarIntegration.user_id == current_user.id)
        .all()
    )


@router.get("/events", response_model=list[EventRead])
def list_events(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Event]:
    return (
        db.query(Event)
        .join(CalendarIntegration)
        .filter(CalendarIntegration.user_id == current_user.id)
        .order_by(Event.start_time)
        .all()
    )


def _get_integration(
    db: Session, user: User, provider: str, required: bool = True
) -> CalendarIntegration | None:
    integration = (
        db.query(CalendarIntegration)
        .filter(
            CalendarIntegration.user_id == user.id,
            CalendarIntegration.provider == provider,
        )
        .first()
    )
    if integration is None and required:
        provider_names = {"google": "구글", "everytime": "에브리타임", "apple": "애플"}
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{provider_names.get(provider, provider)} 캘린더 연동이 없습니다. 먼저 연동해주세요.",
        )
    return integration


def _replace_events(
    db: Session,
    integration: CalendarIntegration,
    events: list[tuple[str, datetime, datetime]],
) -> list[Event]:
    """동기화 창 안의 일정을 통째로 갈아끼운다."""
    db.query(Event).filter(Event.integration_id == integration.id).delete()
    for title, start, end in events:
        db.add(Event(integration_id=integration.id, title=title, start_time=start, end_time=end))
    db.commit()
    return (
        db.query(Event)
        .filter(Event.integration_id == integration.id)
        .order_by(Event.start_time)
        .all()
    )


@router.delete("/integrations/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_integration(
    integration_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    integration = (
        db.query(CalendarIntegration)
        .filter(
            CalendarIntegration.id == integration_id,
            CalendarIntegration.user_id == current_user.id,
        )
        .first()
    )
    if integration is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="연동을 찾을 수 없습니다."
        )
    db.delete(integration)  # cascade로 이벤트도 삭제
    db.commit()


def _ensure_valid_access_token(integration: CalendarIntegration, db: Session) -> str:
    now = datetime.now(timezone.utc)
    if (
        integration.access_token
        and integration.token_expiry is not None
        and integration.token_expiry > now + timedelta(seconds=60)
    ):
        return integration.access_token

    if not integration.refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="구글 캘린더 인증이 만료되었습니다. 구글 로그인으로 다시 연동해주세요.",
        )

    try:
        tokens = google_oauth.refresh_access_token(integration.refresh_token)
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="구글 캘린더 인증 갱신에 실패했습니다. 구글 로그인으로 다시 연동해주세요.",
        )

    integration.access_token = tokens["access_token"]
    integration.token_expiry = now + timedelta(seconds=tokens.get("expires_in", 3600))
    db.commit()
    return integration.access_token


def _parse_google_event_time(value: dict) -> datetime | None:
    if "dateTime" in value:
        return datetime.fromisoformat(value["dateTime"])
    if "date" in value:
        # 종일 일정: 자정(KST) 기준으로 저장. 구글의 종료 date는 exclusive라 그대로 쓰면 된다.
        return datetime.fromisoformat(value["date"]).replace(tzinfo=KST)
    return None


@router.post("/google/sync", response_model=list[EventRead])
def sync_google_calendar(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Event]:
    integration = _get_integration(db, current_user, "google")
    access_token = _ensure_valid_access_token(integration, db)

    time_min = datetime.now(timezone.utc)
    time_max = time_min + timedelta(days=SYNC_WINDOW_DAYS)
    try:
        raw_events = google_oauth.fetch_calendar_events(access_token, time_min, time_max)
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="구글 캘린더에서 일정을 가져오지 못했습니다. 잠시 후 다시 시도해주세요.",
        )

    events: list[tuple[str, datetime, datetime]] = []
    for raw in raw_events:
        if raw.get("status") == "cancelled":
            continue
        start = _parse_google_event_time(raw.get("start", {}))
        end = _parse_google_event_time(raw.get("end", {}))
        if start is None or end is None:
            continue
        events.append((raw.get("summary") or "(제목 없음)", start, end))
    return _replace_events(db, integration, events)


def _sync_everytime(integration: CalendarIntegration, db: Session) -> list[Event]:
    classes = everytime.fetch_timetable(integration.external_calendar_id)
    events = everytime.expand_to_events(
        classes, datetime.now(timezone.utc), SYNC_WINDOW_DAYS
    )
    return _replace_events(db, integration, events)


@router.post("/everytime/connect", response_model=list[EventRead])
def connect_everytime(
    payload: EverytimeConnect,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Event]:
    try:
        identifier = everytime.extract_identifier(payload.share_url)
    except everytime.EverytimeError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    integration = _get_integration(db, current_user, "everytime", required=False)
    if integration is None:
        integration = CalendarIntegration(
            user_id=current_user.id, provider="everytime", external_calendar_id=identifier
        )
        db.add(integration)
    else:
        integration.external_calendar_id = identifier
    db.flush()

    try:
        return _sync_everytime(integration, db)
    except everytime.EverytimeError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/everytime/sync", response_model=list[EventRead])
def sync_everytime(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Event]:
    integration = _get_integration(db, current_user, "everytime")
    try:
        return _sync_everytime(integration, db)
    except everytime.EverytimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


def _sync_apple(integration: CalendarIntegration, db: Session) -> list[Event]:
    time_min = datetime.now(timezone.utc)
    time_max = time_min + timedelta(days=SYNC_WINDOW_DAYS)
    events = apple_caldav.fetch_events(
        integration.external_calendar_id, integration.access_token, time_min, time_max
    )
    return _replace_events(db, integration, events)


def _apple_error_to_http(exc: apple_caldav.AppleCalendarError) -> HTTPException:
    if isinstance(exc, apple_caldav.AppleAuthError):
        return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/apple/connect", response_model=list[EventRead])
def connect_apple(
    payload: AppleConnect,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Event]:
    try:
        apple_caldav.verify_credentials(payload.apple_id, payload.app_password)
    except apple_caldav.AppleCalendarError as exc:
        raise _apple_error_to_http(exc)

    integration = _get_integration(db, current_user, "apple", required=False)
    if integration is None:
        integration = CalendarIntegration(
            user_id=current_user.id, provider="apple", external_calendar_id=payload.apple_id
        )
        db.add(integration)
    else:
        integration.external_calendar_id = payload.apple_id
    # MVP: 앱 암호를 access_token 컬럼에 저장 (로컬 개발 환경 전제)
    integration.access_token = payload.app_password
    db.flush()

    try:
        return _sync_apple(integration, db)
    except apple_caldav.AppleCalendarError as exc:
        db.rollback()
        raise _apple_error_to_http(exc)


@router.post("/apple/sync", response_model=list[EventRead])
def sync_apple(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Event]:
    integration = _get_integration(db, current_user, "apple")
    try:
        return _sync_apple(integration, db)
    except apple_caldav.AppleCalendarError as exc:
        raise _apple_error_to_http(exc)
