from datetime import date, datetime

from app.core.availability import KST, compute_free_slots


def dt(y, m, d, hh, mm=0):
    return datetime(y, m, d, hh, mm, tzinfo=KST)


DAY = date(2026, 7, 20)  # 하루 창으로 계산 단순화


def slots_for_day(busy, **kw):
    return compute_free_slots(busy, DAY, 1, **kw)


def test_no_events_gives_full_day():
    """일정이 없으면 활동시간 전체(09~22)가 하나의 공강."""
    slots = slots_for_day([])
    assert len(slots) == 1
    assert slots[0].start == dt(2026, 7, 20, 9)
    assert slots[0].end == dt(2026, 7, 20, 22)
    assert slots[0].duration_min == 13 * 60


def test_single_event_splits_day():
    """14~16시 일정 → 09~14, 16~22 두 구간."""
    slots = slots_for_day([(dt(2026, 7, 20, 14), dt(2026, 7, 20, 16))])
    assert len(slots) == 2
    assert (slots[0].start, slots[0].end) == (dt(2026, 7, 20, 9), dt(2026, 7, 20, 14))
    assert (slots[1].start, slots[1].end) == (dt(2026, 7, 20, 16), dt(2026, 7, 20, 22))


def test_overlapping_events_merged():
    """겹치는 두 일정(10~12, 11~13)은 병합되어 하나의 busy로 처리."""
    slots = slots_for_day(
        [(dt(2026, 7, 20, 10), dt(2026, 7, 20, 12)), (dt(2026, 7, 20, 11), dt(2026, 7, 20, 13))]
    )
    # 09~10, 13~22
    assert len(slots) == 2
    assert (slots[0].start, slots[0].end) == (dt(2026, 7, 20, 9), dt(2026, 7, 20, 10))
    assert (slots[1].start, slots[1].end) == (dt(2026, 7, 20, 13), dt(2026, 7, 20, 22))


def test_two_participants_union():
    """참여자 A(10~12) + B(15~17)의 합집합 → 09~10, 12~15, 17~22."""
    busy = [
        (dt(2026, 7, 20, 10), dt(2026, 7, 20, 12)),  # A
        (dt(2026, 7, 20, 15), dt(2026, 7, 20, 17)),  # B
    ]
    slots = slots_for_day(busy)
    ranges = [(s.start.hour, s.end.hour) for s in slots]
    assert ranges == [(9, 10), (12, 15), (17, 22)]


def test_min_duration_filters_short_gap():
    """30분 공강(09:00~09:30)은 최소 60분 미만이라 제외."""
    slots = slots_for_day([(dt(2026, 7, 20, 9, 30), dt(2026, 7, 20, 22))])
    assert slots == []


def test_events_outside_activity_hours_ignored():
    """활동시간 밖(07~08시) 일정은 무시 → 하루 전체가 공강."""
    slots = slots_for_day([(dt(2026, 7, 20, 7), dt(2026, 7, 20, 8))])
    assert len(slots) == 1
    assert slots[0].duration_min == 13 * 60


def test_event_spanning_activity_boundary_clipped():
    """08~10시 일정 → 활동시간 경계로 잘려 10시부터 공강."""
    slots = slots_for_day([(dt(2026, 7, 20, 8), dt(2026, 7, 20, 10))])
    assert len(slots) == 1
    assert slots[0].start == dt(2026, 7, 20, 10)


def test_lunch_dinner_tagging():
    """09~22 통짜 공강은 점심·저녁 시간대 모두 겹침."""
    slot = slots_for_day([])[0]
    assert slot.overlaps_lunch is True
    assert slot.overlaps_dinner is True


def test_lunch_only_tag():
    """오후 15시부터 일정 → 09~15 공강은 점심만 겹치고 저녁은 안 겹침."""
    slots = slots_for_day([(dt(2026, 7, 20, 15), dt(2026, 7, 20, 22))])
    assert len(slots) == 1
    assert slots[0].overlaps_lunch is True
    assert slots[0].overlaps_dinner is False


def test_multi_day_window():
    """2일 창 + 일정 없음 → 이틀치 공강 2개."""
    slots = compute_free_slots([], DAY, 2)
    assert len(slots) == 2
    assert slots[0].start.date() == date(2026, 7, 20)
    assert slots[1].start.date() == date(2026, 7, 21)
