"""에타(에브리타임) 시간표 연동.

공유 링크(https://everytime.kr/@identifier)의 identifier로 비공식 API에서
시간표 XML을 받아 주간 수업 목록으로 파싱한다. 시간 값은 5분 단위(0 = 00:00).
"""

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone

import httpx

EVERYTIME_API_URL = "https://api.everytime.kr/find/timetable/table/friend"

KST = timezone(timedelta(hours=9))


@dataclass
class TimetableClass:
    title: str
    day: int  # 0=월요일 ... 6=일요일
    start: time
    end: time


class EverytimeError(Exception):
    pass


def extract_identifier(share_url_or_id: str) -> str:
    text = share_url_or_id.strip()
    match = re.search(r"@([A-Za-z0-9]+)", text)
    if match:
        return match.group(1)
    if re.fullmatch(r"[A-Za-z0-9]+", text):
        return text
    raise EverytimeError("올바른 에브리타임 공유 링크가 아닙니다.")


def _unit_to_time(unit: int) -> time:
    minutes = unit * 5
    return time(hour=minutes // 60, minute=minutes % 60)


def parse_timetable_xml(xml_text: str) -> list[TimetableClass]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        raise EverytimeError("시간표 응답을 해석하지 못했습니다.")

    classes: list[TimetableClass] = []
    for subject in root.iter("subject"):
        name_el = subject.find("name")
        title = (name_el.get("value") if name_el is not None else None) or "(제목 없음)"
        for data in subject.iter("data"):
            try:
                day = int(data.get("day", ""))
                start_unit = int(data.get("starttime", ""))
                end_unit = int(data.get("endtime", ""))
            except ValueError:
                continue
            if not (0 <= day <= 6) or end_unit <= start_unit:
                continue
            classes.append(
                TimetableClass(
                    title=title,
                    day=day,
                    start=_unit_to_time(start_unit),
                    end=_unit_to_time(end_unit),
                )
            )
    return classes


def fetch_timetable(identifier: str) -> list[TimetableClass]:
    try:
        response = httpx.post(
            EVERYTIME_API_URL,
            data={"identifier": identifier, "friendInfo": "true"},
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
                "Origin": "https://everytime.kr",
                "Referer": "https://everytime.kr/",
            },
            timeout=10,
        )
        response.raise_for_status()
    except httpx.HTTPError:
        raise EverytimeError("에브리타임 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.")

    classes = parse_timetable_xml(response.text)
    if not classes:
        raise EverytimeError(
            "시간표를 찾을 수 없습니다. 공유 링크가 맞는지, 시간표가 공개 상태인지 확인해주세요."
        )
    return classes


def expand_to_events(
    classes: list[TimetableClass], start_date: datetime, days: int
) -> list[tuple[str, datetime, datetime]]:
    """주간 시간표를 start_date부터 days일 동안의 실제 일정으로 확장한다."""
    events: list[tuple[str, datetime, datetime]] = []
    base = start_date.astimezone(KST).date()
    for offset in range(days):
        current = base + timedelta(days=offset)
        weekday = current.weekday()  # 0=월요일, 에타 day와 동일
        for cls in classes:
            if cls.day != weekday:
                continue
            start_dt = datetime.combine(current, cls.start, tzinfo=KST)
            end_dt = datetime.combine(current, cls.end, tzinfo=KST)
            events.append((cls.title, start_dt, end_dt))
    return events
