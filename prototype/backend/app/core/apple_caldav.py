"""애플 캘린더(iCloud) CalDAV 연동.

Apple ID + 앱 암호(appleid.apple.com에서 발급)로 iCloud CalDAV에 접속해
기간 내 일정을 가져온다. 반복 일정은 서버 측 expand로 개별 인스턴스화한다.
"""

from datetime import date, datetime, timedelta, timezone

import caldav
from caldav.lib.error import AuthorizationError, DAVError

ICLOUD_CALDAV_URL = "https://caldav.icloud.com/"

KST = timezone(timedelta(hours=9))


class AppleCalendarError(Exception):
    pass


class AppleAuthError(AppleCalendarError):
    pass


def _to_datetime(value: datetime | date) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=KST)
        return value
    # 종일 일정(date)은 KST 자정으로. iCal의 DTEND date는 exclusive라 그대로 쓴다.
    return datetime.combine(value, datetime.min.time(), tzinfo=KST)


def verify_credentials(apple_id: str, app_password: str) -> None:
    client = caldav.DAVClient(url=ICLOUD_CALDAV_URL, username=apple_id, password=app_password)
    try:
        client.principal()
    except AuthorizationError:
        raise AppleAuthError("Apple ID 또는 앱 암호가 올바르지 않습니다.")
    except DAVError:
        raise AppleCalendarError("iCloud 캘린더 서버에 연결하지 못했습니다.")


def fetch_events(
    apple_id: str, app_password: str, time_min: datetime, time_max: datetime
) -> list[tuple[str, datetime, datetime]]:
    client = caldav.DAVClient(url=ICLOUD_CALDAV_URL, username=apple_id, password=app_password)
    try:
        principal = client.principal()
        calendars = principal.calendars()
    except AuthorizationError:
        raise AppleAuthError("Apple ID 또는 앱 암호가 올바르지 않습니다.")
    except DAVError:
        raise AppleCalendarError("iCloud 캘린더 서버에 연결하지 못했습니다.")

    events: list[tuple[str, datetime, datetime]] = []
    for calendar in calendars:
        try:
            found = calendar.search(start=time_min, end=time_max, event=True, expand=True)
        except DAVError:
            # 일정 검색을 지원하지 않는 캘린더(예: 구독 캘린더)는 건너뛴다
            continue
        for item in found:
            component = item.icalendar_component
            if component is None:
                continue
            dtstart = component.get("DTSTART")
            if dtstart is None:
                continue
            start_dt = _to_datetime(dtstart.dt)
            dtend = component.get("DTEND")
            if dtend is not None:
                end_dt = _to_datetime(dtend.dt)
            else:
                duration = component.get("DURATION")
                if duration is not None:
                    end_dt = start_dt + duration.dt
                else:
                    end_dt = start_dt + timedelta(hours=1)
            if end_dt <= start_dt:
                continue
            title = str(component.get("SUMMARY", "")) or "(제목 없음)"
            events.append((title, start_dt, end_dt))
    return events
