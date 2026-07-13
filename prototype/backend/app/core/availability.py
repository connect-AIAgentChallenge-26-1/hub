"""공통 공강 시간 계산.

수락한 참여자 전원의 일정(busy)을 모아, 매일의 활동 시간(기본 09~22시)에서
아무도 일정이 없는 구간을 찾는다. 핵심 로직은 순수 함수로 두어 단위 테스트하기 쉽게 한다.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

KST = timezone(timedelta(hours=9))

DEFAULT_DAY_START_HOUR = 9
DEFAULT_DAY_END_HOUR = 22
DEFAULT_MIN_MINUTES = 60
LUNCH = (time(11, 0), time(14, 0))
DINNER = (time(17, 0), time(20, 0))


@dataclass
class FreeSlot:
    start: datetime
    end: datetime
    duration_min: int
    overlaps_lunch: bool
    overlaps_dinner: bool


def _merge_intervals(
    intervals: list[tuple[datetime, datetime]],
) -> list[tuple[datetime, datetime]]:
    """겹치거나 맞닿은 busy 구간들을 하나로 합친다."""
    valid = [(s, e) for s, e in intervals if e > s]
    if not valid:
        return []
    valid.sort(key=lambda iv: iv[0])
    merged = [valid[0]]
    for start, end in valid[1:]:
        last_start, last_end = merged[-1]
        if start <= last_end:  # 겹치거나 맞닿음
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return merged


def _overlaps(slot_start: datetime, slot_end: datetime, window: tuple[time, time], day: date) -> bool:
    w_start = datetime.combine(day, window[0], tzinfo=slot_start.tzinfo)
    w_end = datetime.combine(day, window[1], tzinfo=slot_start.tzinfo)
    return slot_start < w_end and slot_end > w_start


def compute_free_slots(
    busy_intervals: list[tuple[datetime, datetime]],
    start_date: date,
    days: int,
    *,
    day_start_hour: int = DEFAULT_DAY_START_HOUR,
    day_end_hour: int = DEFAULT_DAY_END_HOUR,
    min_minutes: int = DEFAULT_MIN_MINUTES,
    tz: timezone = KST,
) -> list[FreeSlot]:
    """busy 구간들의 여집합에서 min_minutes 이상인 공강 슬롯을 날짜별로 계산한다."""
    merged = _merge_intervals([(s.astimezone(tz), e.astimezone(tz)) for s, e in busy_intervals])
    slots: list[FreeSlot] = []

    for offset in range(days):
        day = start_date + timedelta(days=offset)
        day_start = datetime.combine(day, time(day_start_hour, 0), tzinfo=tz)
        day_end = datetime.combine(day, time(day_end_hour, 0), tzinfo=tz)

        # 이 날의 활동 시간과 겹치는 busy만 잘라서 사용
        cursor = day_start
        day_free: list[tuple[datetime, datetime]] = []
        for b_start, b_end in merged:
            if b_end <= day_start or b_start >= day_end:
                continue
            b_start = max(b_start, day_start)
            b_end = min(b_end, day_end)
            if b_start > cursor:
                day_free.append((cursor, b_start))
            cursor = max(cursor, b_end)
        if cursor < day_end:
            day_free.append((cursor, day_end))

        for f_start, f_end in day_free:
            duration = int((f_end - f_start).total_seconds() // 60)
            if duration < min_minutes:
                continue
            slots.append(
                FreeSlot(
                    start=f_start,
                    end=f_end,
                    duration_min=duration,
                    overlaps_lunch=_overlaps(f_start, f_end, LUNCH, day),
                    overlaps_dinner=_overlaps(f_start, f_end, DINNER, day),
                )
            )
    return slots
