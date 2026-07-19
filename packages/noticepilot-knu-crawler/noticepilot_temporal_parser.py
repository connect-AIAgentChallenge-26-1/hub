#!/usr/bin/env python3
"""Deterministic temporal parsing layer extracted in S22.

The parser owns only date/time token detection and normalization. Policy-specific
regular expressions are injected once by the runtime composition root so this
module can be tested independently without importing the policy pipeline.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

TEMPORAL_PARSER_VERSION = "0.1.0"

_CONFIGURED = False

def configure_temporal_parser(**dependencies: Any) -> None:
    """Inject the immutable policy lexicon used by the compatibility parser."""
    global _CONFIGURED
    globals().update(dependencies)
    _CONFIGURED = True

def _require_configured() -> None:
    if not _CONFIGURED:
        raise RuntimeError("temporal parser is not configured")


@dataclass(frozen=True)
class ParsedDateToken:
    value: date
    explicit_year: bool
    span_start: int
    span_end: int
    raw: str
    time_value: str | None


@dataclass(frozen=True)
class DateResolution:
    start: str
    end: str | None
    is_all_day: bool
    date_text: str
    kind: str
    evidence: str
    inferred_year: bool = False
    calculation_policy: str | None = None


def normalize_space(value: str | None) -> str:
    return SPACE_RE.sub(" ", (value or "").replace("\xa0", " ")).strip()


def parse_iso_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def format_datetime(d: date, time_value: str | None) -> tuple[str, bool]:
    if not time_value:
        return d.isoformat(), True
    return f"{d.isoformat()}T{time_value}:00+09:00", False


def infer_year(month: int, day: int, published: date) -> int | None:
    """Infer a year only when the month/day is a valid calendar date.

    KNU notice text can contain malformed or OCR-like date expressions such as
    ``2월 31일``.  Date inference must never construct those values before the
    parser has a chance to reject them.
    """
    try:
        candidate = date(published.year, month, day)
    except ValueError:
        return None
    delta = (candidate - published).days
    if delta < -180:
        inferred = published.year + 1
    elif delta > 300:
        inferred = published.year - 1
    else:
        inferred = published.year
    try:
        date(inferred, month, day)
    except ValueError:
        return None
    return inferred


def matched_year(match: re.Match[str]) -> tuple[int | None, bool]:
    """Return a normalized four-digit year from a date-token match.

    Korean notices frequently abbreviate years as ``'26``/```26`` or as an
    unquoted leading component such as ``27.3.5``.  A plain two-digit year is
    accepted only when it is greater than 12, so ordinary month/day text is
    not reinterpreted as a year.
    """
    if match.group("year"):
        return int(match.group("year")), True
    quoted = match.group("short_year_quoted")
    if quoted:
        value = int(re.sub(r"\D", "", quoted))
        return 2000 + value, True
    plain = match.group("short_year_plain")
    if plain:
        return 2000 + int(plain), True
    return None, False


def is_non_date_numeric_match(segment: str, match: re.Match[str]) -> bool:
    """Reject numeric ratios, scores, metadata, and section numbers."""
    sep = match.group("md_sep")
    before = segment[max(0, match.start() - 40) : match.start()]
    after = segment[match.end() : match.end() + 40]
    local = segment[max(0, match.start() - 70) : match.end() + 70]

    # Explicit calendar dates can still be non-action metadata, eligibility
    # reference dates, or revision timestamps.
    revision_before = REVISION_METADATA_BEFORE_RE.search(before)
    # ``수강신청 변경: 2026. 5. 12. ~ ...`` describes the action schedule,
    # not a document revision timestamp.  Revision filtering must not erase
    # the first boundary merely because the local action label ends in 변경.
    action_change_label = re.search(
        r"(?:수강\s*신청|신청|접수|등록|일정|기간)\s*(?:일정\s*)?변경\s*[:：]?\s*$",
        before,
    )
    if (revision_before and not action_change_label) or REVISION_METADATA_AFTER_RE.search(after):
        return True
    if NON_ACTION_DATE_CONTEXT_RE.search(local):
        return True

    _, explicit_year = matched_year(match)
    if explicit_year:
        return False

    if sep == "/" and FRACTION_CONTEXT_RE.search(before):
        return True

    score_context = re.search(
        r"(?:평점|학점|점수|등급|GPA|IELTS|TOEIC|TOEFL|오픽|OPIc)"
        r"(?:은|는|이|가)?\s*$",
        before,
        flags=re.IGNORECASE,
    )
    score_suffix = re.match(
        r"^\s*(?:점\s*(?:만점|이상|이하|미만)?|\+)",
        after,
        flags=re.IGNORECASE,
    )
    adjacent_score_table = (
        re.search(r"\d(?:\.\d{1,2})\s*$", before) is not None
        and re.search(r"(?:성적|평점|학점|등급|기준)", after, flags=re.IGNORECASE) is not None
    )
    if sep == "." and (score_context or score_suffix or adjacent_score_table):
        return True

    # Named historical dates are part of a proper noun, not a schedule.
    if sep == "." and re.match(
        r"^\s*(?:독립만세운동|독립운동|민주항쟁|민주화운동|혁명|사건|기념일)",
        after,
    ):
        return True

    if sep == "." and re.match(
        r"^\s*(?:[.]\s*(?:모집대상|신청방법|신청기간|접수방법|접수기간|"
        r"제출서류|제출방법|선발|일정|방법|기간|대상|지원|문의|유의|절차)"
        r"|차\s*(?:선발|전형|합격|면접))",
        after,
    ):
        return True
    # Course-credit notation such as ``3-3-0`` is not a calendar date.
    if sep == "-" and re.match(r"^\s*-\s*\d", after):
        return True

    # Bare yearless hyphen pairs are frequently project/section codes (for
    # example ``4-3 강원형 사업``).  Accept them only when the token itself
    # carries an immediate calendar cue such as a weekday, clock, range, or
    # deadline suffix.  Ambiguous ``4-3`` forms fail closed.
    if sep == "-" and not explicit_year:
        calendar_suffix = re.match(
            r"^\s*(?:일)?\s*(?:[\(（]\s*[월화수목금토일]\s*[\)）]|"
            r"(?:오전|오후)?\s*(?:[01]?\d|2[0-3])\s*(?::|시)|"
            r"까지|마감|~|∼|～|부터)",
            after,
        )
        if not calendar_suffix:
            return True
    return False


def is_local_range_connector(value: str) -> bool:
    """Return True only for text that directly connects two date tokens."""
    without_time = TIME_TOKEN_RE.sub("", value)
    # Compact titles sometimes write the weekday as ``3.2.월~3.12.목``
    # without parentheses.  The weekday suffix belongs to the first date and
    # must not break the range connector.
    without_time = re.sub(r"^\s*[.]?\s*[월화수목금토일]\s*", "", without_time)
    cleaned = normalize_space(without_time)
    cleaned = re.sub(r"^[.,()\s]+|[.,()\s]+$", "", cleaned)
    return bool(LOCAL_RANGE_CONNECTOR_RE.fullmatch(cleaned))


def resolution_is_chronological(resolution: DateResolution) -> bool:
    """Validate the core inclusive range before it reaches the ICS exporter."""
    if not resolution.end:
        return True
    try:
        if resolution.is_all_day:
            return date.fromisoformat(resolution.end[:10]) >= date.fromisoformat(resolution.start[:10])
        start = datetime.fromisoformat(resolution.start.replace("Z", "+00:00"))
        end = datetime.fromisoformat(resolution.end.replace("Z", "+00:00"))
        return end >= start
    except ValueError:
        return False


def contains_invalid_date_token(segment: str, published: date) -> bool:
    """Return True when text contains a syntactic date that is impossible.

    This is intentionally fail-closed.  For example, ``2.1~2.31`` must not be
    reduced to a misleading one-day event on February 1 merely because the
    invalid range end was skipped.
    """
    for match in DATE_TOKEN_RE.finditer(segment):
        if is_non_date_numeric_match(segment, match):
            continue
        matched, explicit_year = matched_year(match)
        month = int(match.group("month"))
        day = int(match.group("day"))
        if explicit_year:
            year = int(matched)
        else:
            year = infer_year(month, day, published)
            if year is None:
                return True
        try:
            date(year, month, day)
        except ValueError:
            return True
    return False


def normalize_clock(hour: int, minute: int, ampm: str | None) -> tuple[int, int] | None:
    if minute < 0 or minute > 59:
        return None
    if ampm == "오후" and hour < 12:
        hour += 12
    elif ampm == "오전" and hour == 12:
        hour = 0
    if hour < 0 or hour > 23:
        return None
    return hour, minute


def parse_time_after(segment: str, end_pos: int) -> str | None:
    tail = segment[end_pos : end_pos + 40]
    match = TIME_TOKEN_RE.search(tail)
    if not match:
        return None

    # A time belonging to the next date token must never leak backward to the
    # current token.  This occurs in ranges such as ``2.13.~3.8. 23:59``.
    next_date = DATE_TOKEN_RE.search(tail)
    if next_date and next_date.start() < match.start():
        return None

    prefix = tail[: match.start()]
    if len(prefix) > 12 and not re.fullmatch(r"[\s,()~∼～부터까지-]*", prefix):
        return None
    normalized = normalize_clock(
        int(match.group("hour")),
        int(match.group("minute") or 0),
        match.group("ampm"),
    )
    if normalized is None:
        return None
    hour, minute = normalized
    return f"{hour:02d}:{minute:02d}"


def parse_time_range_after(segment: str, end_pos: int) -> tuple[str, str, bool] | None:
    """Parse a same-day clock range immediately following one date token.

    The final boolean records whether a textual ``24:00`` boundary was
    normalized to ``23:59`` on the stated calendar date.
    """
    tail = segment[end_pos : end_pos + 80]
    match = TIME_RANGE_RE.search(tail)
    if not match:
        return None
    prefix = tail[: match.start()]
    if len(prefix) > 14 and not re.fullmatch(r"[\s,()~∼～부터까지-]*", prefix):
        return None

    start_ampm = match.group("start_ampm")
    end_ampm = match.group("end_ampm")
    start_hour = int(match.group("start_hour"))
    end_hour = int(match.group("end_hour"))
    start_minute = int(match.group("start_minute") or match.group("start_minute_word") or 0)
    end_minute = int(match.group("end_minute") or match.group("end_minute_word") or 0)

    start_clock = normalize_clock(start_hour, start_minute, start_ampm)
    if start_clock is None:
        return None

    normalized_24 = end_hour == 24
    if normalized_24:
        if end_minute != 0:
            return None
        end_clock = (23, 59)
    else:
        inherited_ampm = end_ampm
        if inherited_ampm is None and start_ampm is not None:
            inherited_ampm = start_ampm
        end_clock = normalize_clock(end_hour, end_minute, inherited_ampm)
        if end_clock is None:
            return None

    if end_clock < start_clock:
        return None
    return (
        f"{start_clock[0]:02d}:{start_clock[1]:02d}",
        f"{end_clock[0]:02d}:{end_clock[1]:02d}",
        normalized_24,
    )


def has_end_of_day_24_after(segment: str, end_pos: int) -> bool:
    tail = segment[end_pos : end_pos + 36]
    match = END_OF_DAY_24_RE.search(tail)
    if not match:
        return False
    next_date = DATE_TOKEN_RE.search(tail)
    if next_date and next_date.start() < match.start():
        return False
    prefix = tail[: match.start()]
    return len(prefix) <= 14 or bool(re.fullmatch(r"[\s,()~∼～부터까지-]*", prefix))


def parse_date_tokens(segment: str, published: date) -> list[ParsedDateToken]:
    tokens: list[ParsedDateToken] = []
    for match in DATE_TOKEN_RE.finditer(segment):
        if is_non_date_numeric_match(segment, match):
            continue
        matched, explicit_year = matched_year(match)
        month = int(match.group("month"))
        day = int(match.group("day"))
        if explicit_year:
            year = int(matched)
        else:
            year = infer_year(month, day, published)
            if year is None:
                continue
        try:
            value = date(year, month, day)
        except ValueError:
            continue
        time_value = parse_time_after(segment, match.end())
        tokens.append(
            ParsedDateToken(
                value=value,
                explicit_year=explicit_year,
                span_start=match.start(),
                span_end=match.end(),
                raw=normalize_space(match.group(0)),
                time_value=time_value,
            )
        )
    if len(tokens) >= 2:
        fixed: list[ParsedDateToken] = [tokens[0]]
        for token in tokens[1:]:
            value = token.value
            prev_token = fixed[-1]
            connector = segment[prev_token.span_end : token.span_start]

            # In a directly connected range, an omitted end year inherits the
            # range start year.  Only roll to the next year when the month/day
            # itself crosses New Year.  Do not independently infer the end
            # year from publishedAt: ``2025.3.3~6.30`` must stay in 2025.
            if not token.explicit_year and is_local_range_connector(connector):
                try:
                    value = date(prev_token.value.year, value.month, value.day)
                    if value < prev_token.value:
                        value = date(prev_token.value.year + 1, value.month, value.day)
                except ValueError:
                    pass

            fixed.append(
                ParsedDateToken(
                    value=value,
                    explicit_year=token.explicit_year,
                    span_start=token.span_start,
                    span_end=token.span_end,
                    raw=token.raw,
                    time_value=token.time_value,
                )
            )
        tokens = fixed
    return tokens


def resolve_day_only_range(segment: str, published: date) -> DateResolution | None:
    """Resolve ranges whose end omits the month, e.g. ``1.23.~27.``."""
    tokens = parse_date_tokens(segment, published)
    if len(tokens) != 1:
        return None
    first = tokens[0]
    tail = segment[first.span_end :]
    match = DAY_ONLY_RANGE_TAIL_RE.match(tail)
    if not match:
        return None
    try:
        last_date = date(first.value.year, first.value.month, int(match.group("day")))
    except ValueError:
        return None
    if last_date < first.value:
        return None

    last_end = first.span_end + match.end()
    connector_start = first.span_end + match.start("connector")
    first_time = parse_time_after(segment[:connector_start], first.span_end)
    last_time = parse_time_after(segment, last_end)
    calculation_policy: str | None = None
    if first_time is None and last_time is not None:
        first_time = "00:00"
        calculation_policy = "start_of_day_assumed_for_timed_range"
    elif first_time is not None and last_time is None:
        if "까지" in segment or "종료" in segment:
            last_time = "23:59"
            calculation_policy = "end_of_day_assumed_for_timed_range"
        else:
            return None

    first_value, first_all_day = format_datetime(first.value, first_time)
    last_value, last_all_day = format_datetime(last_date, last_time)
    if first_all_day != last_all_day:
        return None
    resolution = DateResolution(
        start=first_value,
        end=last_value,
        is_all_day=first_all_day and last_all_day,
        date_text=normalize_space(segment[first.span_start:last_end + 36]),
        kind="absolute_range_day_only_end",
        evidence=segment,
        inferred_year=not first.explicit_year,
        calculation_policy=calculation_policy,
    )
    return resolution if resolution_is_chronological(resolution) else None


def has_multiple_discrete_dates(segment: str, published: date) -> bool:
    tokens = parse_date_tokens(segment, published)
    if len(tokens) < 2:
        return False
    for first, last in zip(tokens, tokens[1:]):
        connector = segment[first.span_end:last.span_start]
        if is_local_range_connector(connector):
            continue
        if MULTIPLE_DISCRETE_DATE_CONNECTOR_RE.search(connector):
            return True
    return False


def has_recurring_time_window_after_date_range(segment: str, published: date) -> bool:
    """Detect date windows followed by daily hours, which require expansion."""
    tokens = parse_date_tokens(segment, published)
    range_end_pos: int | None = None
    if len(tokens) >= 2:
        for first, last in zip(tokens, tokens[1:]):
            if is_local_range_connector(segment[first.span_end:last.span_start]):
                range_end_pos = last.span_end
                break
    elif len(tokens) == 1:
        match = DAY_ONLY_RANGE_TAIL_RE.match(segment[tokens[0].span_end:])
        if match:
            range_end_pos = tokens[0].span_end + match.end()
    if range_end_pos is None:
        return False
    tail = segment[range_end_pos:range_end_pos + 100]
    return TIME_RANGE_RE.search(tail) is not None


def has_truncated_date_context(segment: str) -> bool:
    if TRUNCATED_DATE_CONTEXT_RE.search(segment):
        return True

    # DATE_TOKEN_RE consumes a weekday parenthetical only when it is closed.
    # Therefore an opening parenthesis immediately after a parsed date token
    # indicates HTML/text truncation even when later text was joined into the
    # same extraction window.
    for match in DATE_TOKEN_RE.finditer(segment):
        tail = segment[match.end() : match.end() + 18]
        opened = re.match(r"^\s*[.]?\s*([\(（])\s*[월화수목금토일]?", tail)
        if not opened:
            continue
        close = ")" if opened.group(1) == "(" else "）"
        if close not in tail[:12]:
            return True
    return False


def resolve_relative_date(segment: str, published: date) -> DateResolution | None:
    match = RELATIVE_NEXT_DAY_FOR_RE.search(segment)
    if match:
        days = int(match.group("days"))
        start = published + timedelta(days=1)
        end = published + timedelta(days=days)
        return DateResolution(
            start=start.isoformat(),
            end=end.isoformat(),
            is_all_day=True,
            date_text=normalize_space(match.group(0)),
            kind="relative_period",
            evidence=segment,
            calculation_policy="inclusive_window_starting_day_after_publishedAt",
        )
    match = RELATIVE_FOR_RE.search(segment)
    if match:
        days = int(match.group("days"))
        start = published
        end = published + timedelta(days=max(days - 1, 0))
        return DateResolution(
            start=start.isoformat(),
            end=end.isoformat(),
            is_all_day=True,
            date_text=normalize_space(match.group(0)),
            kind="relative_period",
            evidence=segment,
            calculation_policy="inclusive_window_starting_at_publishedAt",
        )
    match = RELATIVE_WITHIN_RE.search(segment)
    if match:
        days = int(match.group("days"))
        deadline = published + timedelta(days=days)
        return DateResolution(
            start=deadline.isoformat(),
            end=deadline.isoformat(),
            is_all_day=True,
            date_text=normalize_space(match.group(0)),
            kind="relative_deadline",
            evidence=segment,
            calculation_policy="publishedAt_plus_n_calendar_days",
        )
    return None


def resolve_absolute_date(segment: str, published: date) -> DateResolution | None:
    if contains_invalid_date_token(segment, published):
        return None
    day_only_range = resolve_day_only_range(segment, published)
    if day_only_range:
        return day_only_range
    tokens = parse_date_tokens(segment, published)
    if not tokens:
        return None

    range_pairs: list[tuple[ParsedDateToken, ParsedDateToken]] = []
    for first, last in zip(tokens, tokens[1:]):
        connector = segment[first.span_end : last.span_start]
        if is_local_range_connector(connector):
            range_pairs.append((first, last))

    # Multiple directly connected ranges inside one extraction segment are
    # semantically ambiguous.  The deterministic MVP parser must fail closed
    # instead of joining the first date of one schedule to the last date of
    # another schedule.
    if len(range_pairs) > 1:
        return None

    if len(range_pairs) == 1:
        # A local range plus any additional date token is also ambiguous:
        # e.g. an event period followed by a separate application deadline.
        if len(tokens) != 2:
            return None
        first, last = range_pairs[0]
        first_date = first.value
        first_time = first.time_value
        last_time = last.time_value
        first_is_24 = has_end_of_day_24_after(segment, first.span_end)
        last_is_24 = has_end_of_day_24_after(segment, last.span_end)
        calculation_policy: str | None = None

        # A 24:00 start boundary means the beginning of the next calendar day.
        # A 24:00 end boundary remains attached to the stated final day as
        # 23:59, matching the existing conservative ICS projection policy.
        if first_is_24:
            first_date = first_date + timedelta(days=1)
            first_time = "00:00"
            calculation_policy = "start_boundary_24_normalized"

        if last_is_24 and first_time is None:
            last_time = None
        elif last_is_24:
            last_time = "23:59"
            calculation_policy = "end_of_day_24_normalized"

        # Common application periods omit the start clock but state an exact
        # end deadline: ``2.13.~3.8. 23:59``.  Preserve the full period by
        # projecting the start to local midnight rather than leaking the end
        # time backward to the first date.
        if first_time is None and last_time is not None:
            first_time = "00:00"
            calculation_policy = calculation_policy or "start_of_day_assumed_for_timed_range"
        elif first_time is not None and last_time is None:
            if "까지" in segment or "종료" in segment:
                last_time = "23:59"
                calculation_policy = calculation_policy or "end_of_day_assumed_for_timed_range"
            else:
                return None

        first_value, first_all_day = format_datetime(first_date, first_time)
        last_value, last_all_day = format_datetime(last.value, last_time)
        all_day = first_all_day and last_all_day
        if not all_day and (first_all_day or last_all_day):
            return None
        resolution = DateResolution(
            start=first_value,
            end=last_value,
            is_all_day=all_day,
            date_text=normalize_space(segment[first.span_start : last.span_end + 36]),
            kind="absolute_range",
            evidence=segment,
            inferred_year=not first.explicit_year or not last.explicit_year,
            calculation_policy=calculation_policy,
        )
        return resolution if resolution_is_chronological(resolution) else None

    # Without a direct connector, multiple dates represent separate facts.
    # Prefer the final token only for explicit deadline language; otherwise use
    # the first date and let overlapping extraction segments recover other
    # actions independently.
    chosen = tokens[-1] if ("까지" in segment or "마감" in segment or "기한" in segment) else tokens[0]

    same_day_time_range = parse_time_range_after(segment, chosen.span_end)
    if same_day_time_range:
        start_time, end_time, normalized_24 = same_day_time_range
        resolution = DateResolution(
            start=f"{chosen.value.isoformat()}T{start_time}:00+09:00",
            end=f"{chosen.value.isoformat()}T{end_time}:00+09:00",
            is_all_day=False,
            date_text=normalize_space(segment[chosen.span_start : chosen.span_end + 60]),
            kind="absolute_time_range",
            evidence=segment,
            inferred_year=not chosen.explicit_year,
            calculation_policy="end_of_day_24_normalized" if normalized_24 else None,
        )
        return resolution if resolution_is_chronological(resolution) else None

    if has_end_of_day_24_after(segment, chosen.span_end):
        resolution = DateResolution(
            start=f"{chosen.value.isoformat()}T23:59:00+09:00",
            end=None,
            is_all_day=False,
            date_text=normalize_space(segment[chosen.span_start : chosen.span_end + 36]),
            kind="absolute_single",
            evidence=segment,
            inferred_year=not chosen.explicit_year,
            calculation_policy="end_of_day_24_normalized",
        )
        return resolution

    value, all_day = format_datetime(chosen.value, chosen.time_value)
    resolution = DateResolution(
        start=value,
        end=value if all_day else None,
        is_all_day=all_day,
        date_text=chosen.raw,
        kind="absolute_single",
        evidence=segment,
        inferred_year=not chosen.explicit_year,
    )
    return resolution if resolution_is_chronological(resolution) else None


def resolve_date(segment: str, published: date) -> DateResolution | None:
    relative = resolve_relative_date(segment, published)
    if relative:
        return relative
    return resolve_absolute_date(segment, published)

class TemporalParser:
    """Facade for the extracted deterministic temporal layer."""

    version = TEMPORAL_PARSER_VERSION

    def parse_tokens(self, text: str, published: date) -> list[ParsedDateToken]:
        _require_configured()
        return parse_date_tokens(text, published)

    def resolve(self, text: str, published: date) -> DateResolution | None:
        _require_configured()
        return resolve_date(text, published)

    def has_multiple_discrete_dates(self, text: str, published: date) -> bool:
        _require_configured()
        return has_multiple_discrete_dates(text, published)

    def has_truncated_context(self, text: str) -> bool:
        _require_configured()
        return has_truncated_date_context(text)

    def to_temporal_mention(self, segment_id: str, text: str, published: date):
        """Project the compatibility resolution into the S21 contract."""
        _require_configured()
        from noticepilot_judgment_models import TemporalMention
        resolution = resolve_date(text, published)
        if resolution is None:
            return None
        tokens = parse_date_tokens(text, published)
        span_start = min((token.span_start for token in tokens), default=None)
        span_end = max((token.span_end for token in tokens), default=None)
        mention_id = "tm-" + hashlib.sha256(
            f"{segment_id}|{resolution.start}|{resolution.end or ''}|{resolution.kind}|{text}".encode("utf-8")
        ).hexdigest()[:16]
        return TemporalMention(
            mention_id=mention_id,
            segment_id=segment_id,
            raw_text=resolution.date_text or text,
            normalized_start=resolution.start,
            normalized_end=resolution.end,
            resolution_kind=resolution.kind,
            deterministic=True,
            inferred_year=resolution.inferred_year,
            span_start=span_start,
            span_end=span_end,
        )

__all__ = [
    "TEMPORAL_PARSER_VERSION", "ParsedDateToken", "DateResolution", "TemporalParser",
    "configure_temporal_parser", "parse_date_tokens", "resolve_date",
    "has_multiple_discrete_dates", "has_recurring_time_window_after_date_range",
    "has_truncated_date_context", "resolution_is_chronological", "parse_iso_date",
]
