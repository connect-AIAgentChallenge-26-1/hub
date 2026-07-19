#!/usr/bin/env python3
"""Structure-analysis layer extracted in S22.

This module reconstructs title, paragraph, list, continuation, and supported
flattened-table units. Semantic vocabularies remain injected dependencies during
the compatibility phase; the module itself owns structural ordering and
ownership boundaries.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from datetime import date
from typing import Any

STRUCTURE_ANALYZER_VERSION = "0.1.0"
_CONFIGURED = False

def configure_structure_analyzer(**dependencies: Any) -> None:
    global _CONFIGURED
    globals().update(dependencies)
    _CONFIGURED = True

def _require_configured() -> None:
    if not _CONFIGURED:
        raise RuntimeError("structure analyzer is not configured")


@dataclass(frozen=True)
class ScheduleSegment:
    """A structure-aware unit that owns local date/action semantics.

    The segment layer prevents title-wide or sliding-window keywords from
    relabelling unrelated dates.  Regex remains responsible for token
    detection, while this object preserves the structural relationship among
    a label, its value text, and the source location.
    """

    segment_id: str
    segment_type: str
    text: str
    label_text: str
    body_text: str
    line_index: int
    clause_index: int
    parent_segment_id: str | None
    action_signals: tuple[str, ...]
    audience_signals: tuple[str, ...]
    date_spans: tuple[tuple[str, int, int], ...]
    locally_grounded: bool

    def source_metadata(self) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEDULE_SEGMENT_SCHEMA_VERSION,
            "segmentId": self.segment_id,
            "segmentType": self.segment_type,
            "labelText": self.label_text,
            "bodyText": self.body_text,
            "sourceLocation": {
                "lineIndex": self.line_index,
                "clauseIndex": self.clause_index,
                "parentSegmentId": self.parent_segment_id,
            },
            "actionSignals": list(self.action_signals),
            "audienceSignals": list(self.audience_signals),
            "dateSpans": [
                {"value": value, "start": start, "end": end}
                for value, start, end in self.date_spans
            ],
            "locallyGrounded": self.locally_grounded,
        }


def _split_structural_clauses(raw_line: str) -> list[str]:
    """Split explicit structure while preserving dotted calendar dates."""
    normalized = normalize_space(raw_line)
    if not normalized:
        return []
    # Table rows keep their cells together because the left cell often owns
    # the schedule label and the right cell owns the date value.
    if "\t" in raw_line or (raw_line.count("|") >= 2 and not raw_line.lstrip().startswith("http")):
        cells = [normalize_space(cell) for cell in re.split(r"\t+|\s*\|\s*", raw_line)]
        return [" | ".join(cell for cell in cells if cell)]

    list_parts = [part for part in STRUCTURAL_LIST_SPLIT_RE.split(normalized) if part]
    clauses: list[str] = []
    for part in list_parts:
        label_matches = list(STRUCTURAL_LABEL_CLAUSE_RE.finditer(part))
        if len(label_matches) <= 1:
            clauses.append(part)
            continue
        starts = [match.start() for match in label_matches]
        if starts[0] != 0:
            starts.insert(0, 0)
        starts.append(len(part))
        for start, end in zip(starts, starts[1:]):
            clause = normalize_space(part[start:end])
            if clause:
                clauses.append(clause)
    return clauses


def _segment_label_text(text: str, published: date) -> str:
    tokens = parse_date_tokens(text, published)
    cutoff = tokens[0].span_start if tokens else len(text)
    prefix = normalize_space(text[:cutoff])
    prefix = STRUCTURAL_LIST_PREFIX_RE.sub("", prefix)
    # Prefer a compact label-value prefix.  Keep the trailing clause because
    # a long introductory sentence may precede ``신청기간:`` on the same line.
    colon_matches = list(re.finditer(r"[:：]", prefix))
    if colon_matches:
        candidate = normalize_space(prefix[: colon_matches[-1].start()])
        tail = re.split(r"[.;。]\s+", candidate)[-1]
        prefix = normalize_space(tail)
    elif len(prefix) > 120:
        prefix = normalize_space(re.split(r"[.;。]\s+", prefix)[-1])
    if not STRUCTURAL_LABEL_HINT_RE.search(prefix):
        return ""
    return prefix[-120:]


def _segment_action_signals(text: str, label_text: str) -> tuple[str, ...]:
    local = normalize_space(f"{label_text} {text}")
    signals: list[str] = []
    compact_label = normalize_space(label_text or text)
    # Standalone section headers in flattened tables are structural action
    # owners even though they omit the word 신청.  Audience phrases such as
    # 휴학생/복학생 remain excluded because this branch requires an exact
    # compact header.
    if re.fullmatch(r"(?:일반)?휴학", compact_label):
        signals.append("leave_of_absence_application")
    elif re.fullmatch(r"복학", compact_label):
        signals.append("return_from_leave_application")
    course_action = _course_action_type_from_text(local)
    if course_action:
        signals.append(course_action)
    shared_leave_return = SHARED_LEAVE_RETURN_RE.search(local)
    if shared_leave_return and re.search(r"(?:신청|기간|일정|기한|마감)", local):
        signals.extend(["leave_of_absence_application", "return_from_leave_application"])
    for signal, pattern in LOCAL_ACTION_SIGNAL_PATTERNS:
        if signal in signals:
            continue
        if pattern.search(local):
            signals.append(signal)
    return tuple(dict.fromkeys(signals))


def _segment_audience_signals(text: str, label_text: str) -> tuple[str, ...]:
    local = normalize_space(f"{label_text} {text}")
    signals: list[str] = []
    for year in infer_student_years(local):
        signals.append(f"student_year:{year}")
    for level in infer_degree_levels(local):
        signals.append(f"degree_level:{level}")
    for status in infer_enrollment_statuses(local):
        signals.append(f"enrollment_status:{status}")
    for admission in infer_admission_types(local):
        signals.append(f"admission_type:{admission}")
    return tuple(dict.fromkeys(signals))


def _segment_date_spans(text: str, published: date) -> tuple[tuple[str, int, int], ...]:
    return tuple(
        (token.value.isoformat(), token.span_start, token.span_end)
        for token in parse_date_tokens(text, published)
    )


def _make_schedule_segment(
    *,
    text: str,
    published: date,
    segment_type: str,
    line_index: int,
    clause_index: int,
    parent_segment_id: str | None = None,
) -> ScheduleSegment:
    normalized = normalize_space(text)
    label_text = _segment_label_text(normalized, published)
    date_spans = _segment_date_spans(normalized, published)
    action_signals = _segment_action_signals(normalized, label_text)
    audience_signals = _segment_audience_signals(normalized, label_text)
    first_date_start = date_spans[0][1] if date_spans else len(normalized)
    body_text = normalize_space(normalized[first_date_start:]) if date_spans else normalized
    segment_id = "seg-" + sha256_text(
        f"{segment_type}|{line_index}|{clause_index}|{parent_segment_id or ''}|{normalized}"
    )[:16]
    return ScheduleSegment(
        segment_id=segment_id,
        segment_type=segment_type,
        text=normalized,
        label_text=label_text,
        body_text=body_text,
        line_index=line_index,
        clause_index=clause_index,
        parent_segment_id=parent_segment_id,
        action_signals=action_signals,
        audience_signals=audience_signals,
        date_spans=date_spans,
        locally_grounded=bool(date_spans and action_signals),
    )


def _normalize_fragmented_date_text(value: str) -> str:
    text = normalize_space(value)
    text = re.sub(r"[\(（]\s*([월화수목금토일])\s*[\)）]", r"(\1)", text)
    text = re.sub(r"\s+([)）])", r"\1", text)
    text = re.sub(r"([\(（])\s+", r"\1", text)
    return text


def _is_date_fragment_piece(segment: ScheduleSegment) -> bool:
    text = normalize_space(segment.text)
    if not text or len(text) > 44:
        return False
    if segment.action_signals or segment.audience_signals:
        return False
    return bool(DATE_FRAGMENT_PIECE_RE.fullmatch(text))


def _assemble_date_fragment(
    body_segments: list[ScheduleSegment],
    start_index: int,
    published: date,
) -> tuple[str, int] | None:
    """Reassemble a date cell split into weekday/time fragments.

    PDF/table extraction frequently emits ``2.20.(``, ``금``, and
    ``) 10:00~13:00`` as separate lines.  This function joins only a bounded
    sequence of date-syntax fragments and stops before another date cell or
    semantic label.
    """
    first = body_segments[start_index]
    if not first.date_spans:
        return None
    parts = [first.text]
    end_index = start_index
    previous_line = first.line_index
    for index in range(start_index + 1, min(len(body_segments), start_index + 6)):
        current = body_segments[index]
        if current.line_index > previous_line + 1:
            break
        if current.date_spans:
            break
        if not _is_date_fragment_piece(current):
            break
        parts.append(current.text)
        end_index = index
        previous_line = current.line_index
        # A closed weekday followed by a clock normally completes one cell.
        joined = _normalize_fragmented_date_text(" ".join(parts))
        if re.search(r"[)）]\s*(?:오전|오후)?\s*\d{1,2}(?::\d{2}|시)", joined):
            # Continue only when the clock itself ends in a range connector.
            if not re.search(r"(?:~|∼|～|[-–—]|부터)\s*$", joined):
                break
    joined = _normalize_fragmented_date_text(" ".join(parts))

    # A flattened table can emit a multi-day range as three cells:
    # ``2.21.(토) 10:00`` / ``~`` / ``2.25.(수) 18:00``.  Reattach only
    # an explicit adjacent range connector; never infer a range merely from
    # two neighboring date cells.
    connector_index = end_index + 1
    second_index = connector_index + 1
    if (
        connector_index < len(body_segments)
        and second_index < len(body_segments)
        and body_segments[connector_index].line_index <= previous_line + 1
        and re.fullmatch(r"\s*(?:~|∼|～|[-–—]|부터)\s*", body_segments[connector_index].text)
        and body_segments[second_index].line_index <= body_segments[connector_index].line_index + 1
        and body_segments[second_index].date_spans
    ):
        second = _assemble_date_fragment(body_segments, second_index, published)
        if second is not None:
            second_text, second_end = second
            return normalize_space(f"{joined} ~ {second_text}"), second_end

    if (
        re.search(r"(?:~|∼|～|[-–—]|부터)\s*$", joined)
        and connector_index < len(body_segments)
        and body_segments[connector_index].line_index <= previous_line + 1
        and body_segments[connector_index].date_spans
    ):
        second = _assemble_date_fragment(body_segments, connector_index, published)
        if second is not None:
            second_text, second_end = second
            return normalize_space(f"{joined} {second_text}"), second_end

    return joined, end_index


def _cohort_cell_label(text: str) -> str | None:
    compact = normalize_space(text)
    if not COMPACT_COHORT_CELL_RE.fullmatch(compact):
        return None
    if compact in {"전체", "전학년", "전체학년"}:
        return "전체학년"
    return compact if compact.endswith("학년") else f"{compact}학년"


def _cohort_schedule_texts(
    date_groups: list[str],
    published: date,
) -> list[str]:
    """Convert date cells in one table row into one or more schedules."""
    schedules: list[str] = []
    index = 0
    while index < len(date_groups):
        raw_current = date_groups[index]
        current = re.sub(
            r"^\s*(?:~|∼|～|[-–—]|부터)\s*", "", raw_current
        )
        resolved = resolve_date(current, published)
        if resolved and resolved.end:
            schedules.append(current)
            index += 1
            continue
        if index + 1 < len(date_groups):
            raw_next = date_groups[index + 1]
            explicit_connector = bool(
                re.search(r"(?:~|∼|～|[-–—]|부터)\s*$", raw_current)
                or re.match(r"^\s*(?:~|∼|～|[-–—]|부터)", raw_next)
            )
            next_group = re.sub(
                r"^\s*(?:~|∼|～|[-–—]|부터)\s*", "", raw_next
            )
            if explicit_connector:
                combined = normalize_space(f"{current} ~ {next_group}")
                combined_resolution = resolve_date(combined, published)
                if combined_resolution and combined_resolution.end:
                    schedules.append(combined)
                    index += 2
                    continue
        schedules.append(current)
        index += 1
    return schedules


def _reconstruct_course_table_rows(
    body_segments: list[ScheduleSegment],
    title: str,
    published: date,
) -> list[ScheduleSegment]:
    """Recover explicit cohort/date rows from flattened course tables.

    Reconstruction is enabled only when a nearby header contains both a
    cohort dimension (학년) and a course-registration schedule label.  This
    prevents isolated numbers in ordinary prose from becoming cohorts.
    """
    if not COURSE_REGISTRATION_CONTEXT_RE.search(title):
        return []
    reconstructed: list[ScheduleSegment] = []
    seen: set[tuple[str, str]] = set()
    for index, segment in enumerate(body_segments):
        cohort_label = _cohort_cell_label(segment.text)
        if cohort_label is None:
            continue
        preceding = body_segments[max(0, index - 100):index]
        has_year_header = any(
            normalize_space(item.text) == "학년" or "학년별 일정" in item.text
            for item in preceding
        )
        course_headers = [
            item for item in preceding
            if "수강신청 일정" in item.text or "본 수강신청 일정" in item.text
        ]
        if not has_year_header or not course_headers:
            continue
        parent = course_headers[-1]

        next_cohort = len(body_segments)
        for candidate_index in range(index + 1, min(len(body_segments), index + 120)):
            candidate_text = normalize_space(body_segments[candidate_index].text)
            if candidate_index > index + 1 and (
                "학년별 일정" in candidate_text
                or "본 수강신청 일정" in candidate_text
            ):
                next_cohort = candidate_index
                break
            # A new/transfer-student row is a boundary even though it is not
            # represented as a numeric student-year applicability rule.
            if COURSE_COHORT_BOUNDARY_RE.fullmatch(candidate_text):
                next_cohort = candidate_index
                break
            # Flattened ``신(편)입생`` cells are emitted as five tiny lines.
            # Treat the first fragment as a row boundary so its date is not
            # attached to the preceding numeric-year cohort.
            if (
                candidate_text == "신"
                and candidate_index + 4 < len(body_segments)
                and normalize_space(body_segments[candidate_index + 1].text) in {"(", "（"}
                and normalize_space(body_segments[candidate_index + 2].text) == "편"
                and normalize_space(body_segments[candidate_index + 3].text) in {")", "）"}
                and "입생" in normalize_space(body_segments[candidate_index + 4].text)
            ):
                next_cohort = candidate_index
                break
            if _cohort_cell_label(body_segments[candidate_index].text):
                next_cohort = candidate_index
                break
        date_groups: list[str] = []
        cursor = index + 1
        while cursor < next_cohort:
            assembled = _assemble_date_fragment(body_segments, cursor, published)
            if assembled is None:
                cursor += 1
                continue
            date_text, end_index = assembled
            date_groups.append(date_text)
            cursor = end_index + 1
        for schedule_index, schedule_text in enumerate(
            _cohort_schedule_texts(date_groups, published)
        ):
            combined = normalize_space(
                f"수강신청 일정 | {cohort_label}: {schedule_text}"
            )
            key = (cohort_label, schedule_text)
            if key in seen:
                continue
            seen.add(key)
            reconstructed.append(
                _make_schedule_segment(
                    text=combined,
                    published=published,
                    segment_type="table_row",
                    line_index=segment.line_index,
                    clause_index=schedule_index,
                    parent_segment_id=parent.segment_id,
                )
            )
    return reconstructed


def _reconstruct_leave_return_rows(
    body_segments: list[ScheduleSegment],
    published: date,
) -> list[ScheduleSegment]:
    """Attach flattened leave/return section headers to their date rows."""
    reconstructed: list[ScheduleSegment] = []
    seen: set[tuple[str, str]] = set()
    for index, section in enumerate(body_segments):
        section_actions = [
            signal for signal in section.action_signals
            if signal in {"leave_of_absence_application", "return_from_leave_application"}
        ]
        if len(section_actions) != 1 or section.date_spans or len(section.text) > 24:
            continue
        action = section_actions[0]
        for cursor in range(index + 1, min(len(body_segments), index + 8)):
            current = body_segments[cursor]
            competing = {
                signal for signal in current.action_signals
                if signal in {"leave_of_absence_application", "return_from_leave_application"}
            }
            if competing and action not in competing:
                break
            assembled = _assemble_date_fragment(body_segments, cursor, published)
            if assembled is None:
                continue
            date_text, _ = assembled
            marker_parts = [
                item.text for item in body_segments[index + 1:cursor]
                if len(item.text) <= 28 and not item.date_spans and not item.action_signals
            ]
            explicit_markers = [
                part for part in marker_parts if re.search(r"《[^》]+》", part)
            ]
            marker = normalize_space(
                explicit_markers[-1] if explicit_markers else (marker_parts[-1] if marker_parts else "")
            )
            combined = normalize_space(
                f"{section.text} {marker} 신청기간: {date_text}"
            )
            key = (action, date_text)
            if key in seen:
                continue
            seen.add(key)
            reconstructed.append(
                _make_schedule_segment(
                    text=combined,
                    published=published,
                    segment_type="table_row",
                    line_index=section.line_index,
                    clause_index=cursor - index,
                    parent_segment_id=section.segment_id,
                )
            )
    return reconstructed


def build_schedule_segments(title: str, body: str, published: date) -> list[ScheduleSegment]:
    """Build auditable schedule units instead of overlapping text windows.

    Each date is evaluated inside its own title/paragraph/list/table unit.  A
    one-line continuation is allowed only when the preceding unit has an
    explicit schedule action and the following unit supplies the date without
    a competing action label.
    """
    segments: list[ScheduleSegment] = []
    seen_text_keys: set[tuple[str, int, int, str]] = set()

    normalized_title = normalize_space(title)
    if normalized_title:
        title_segment = _make_schedule_segment(
            text=normalized_title,
            published=published,
            segment_type="title",
            line_index=-1,
            clause_index=0,
        )
        segments.append(title_segment)

    body_segments: list[ScheduleSegment] = []
    for line_index, raw_line in enumerate(str(body or "").splitlines()):
        if not normalize_space(raw_line):
            continue
        table_row = "\t" in raw_line or (raw_line.count("|") >= 2 and not raw_line.lstrip().startswith("http"))
        clauses = _split_structural_clauses(raw_line)
        for clause_index, clause in enumerate(clauses):
            has_list_prefix = bool(STRUCTURAL_LIST_PREFIX_RE.match(clause))
            tentative_type = "table_row" if table_row else ("list_item" if has_list_prefix else "paragraph")
            segment = _make_schedule_segment(
                text=clause,
                published=published,
                segment_type=tentative_type,
                line_index=line_index,
                clause_index=clause_index,
            )
            if segment.label_text:
                segment = ScheduleSegment(
                    **{**segment.__dict__, "segment_type": "label_value"}
                )
            key = (segment.segment_type, line_index, clause_index, segment.text)
            if key not in seen_text_keys:
                seen_text_keys.add(key)
                body_segments.append(segment)

    # Explicit one-line continuation only; no 2–3 line sliding windows.
    continuation_segments: list[ScheduleSegment] = []
    for current, following in zip(body_segments, body_segments[1:]):
        if following.line_index != current.line_index + 1:
            continue
        if current.date_spans or not current.action_signals:
            continue
        if not following.date_spans or following.action_signals:
            continue
        # Do not carry an action label across a new numbered/lettered item.
        # A generic temporal cell such as ``2. 일시`` may still be owned by
        # an explicit event-name item immediately above it.
        if (
            STRUCTURAL_LIST_PREFIX_RE.match(current.text)
            and STRONG_STRUCTURAL_ITEM_RE.match(following.text)
            and not GENERIC_TEMPORAL_ITEM_RE.match(following.text)
        ):
            continue
        if len(current.text) > 140 or len(following.text) > 180:
            continue
        combined = normalize_space(f"{current.text} {following.text}")
        continuation_segments.append(
            _make_schedule_segment(
                text=combined,
                published=published,
                segment_type="continuation",
                line_index=current.line_index,
                clause_index=current.clause_index,
                parent_segment_id=current.segment_id,
            )
        )

    reconstructed_rows = (
        _reconstruct_course_table_rows(body_segments, normalized_title, published)
        + _reconstruct_leave_return_rows(body_segments, published)
    )

    segments.extend(body_segments)
    segments.extend(continuation_segments)
    segments.extend(reconstructed_rows)
    # Stable order: title, source order, then the continuation immediately
    # after the source line it belongs to.
    segments.sort(
        key=lambda item: (
            -1 if item.segment_type == "title" else item.line_index,
            item.clause_index,
            1 if item.segment_type in {"continuation", "table_row"} else 0,
            item.segment_id,
        )
    )
    return segments

class StructureAnalyzer:
    """Facade for structure-aware schedule segmentation."""

    version = STRUCTURE_ANALYZER_VERSION

    def analyze(self, title: str, body: str, published: date) -> list[ScheduleSegment]:
        _require_configured()
        return build_schedule_segments(title, body, published)

    def document(self, notice: dict[str, Any]) -> dict[str, Any]:
        _require_configured()
        published = parse_iso_date(notice.get("publishedAt")) or date.today()
        segments = self.analyze(normalize_space(notice.get("title")), str(notice.get("extractedText") or ""), published)
        return {
            "schemaVersion": SCHEDULE_SEGMENT_SCHEMA_VERSION,
            "sourceNoticeId": notice.get("noticeId"),
            "sourceContentHash": notice.get("contentHash"),
            "sourceTitle": notice.get("title"),
            "publishedAt": notice.get("publishedAt"),
            "extractor": {"version": STRUCTURE_ANALYZER_VERSION, "mode": "structure_analyzer_s22"},
            "segments": [segment.source_metadata() | {"text": segment.text} for segment in segments],
            "summary": {
                "segmentCount": len(segments),
                "locallyGroundedCount": sum(1 for segment in segments if segment.locally_grounded),
                "typeCounts": dict(Counter(segment.segment_type for segment in segments)),
            },
        }

__all__ = [
    "STRUCTURE_ANALYZER_VERSION", "ScheduleSegment", "StructureAnalyzer",
    "configure_structure_analyzer", "build_schedule_segments",
]
