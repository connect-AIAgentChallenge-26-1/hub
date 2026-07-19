#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NoticePilot ICS exporter v0.4.4.

Scope:
  - input: calendar candidate JSON files created by noticepilot_candidate_extractor.py
  - output: static iCalendar (.ics) file plus export report
  - policy: export only confirmed calendar-feed candidates

This exporter intentionally does not crawl, parse, or call an LLM. It only projects
already-validated candidate JSON into a deterministic iCalendar artifact.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

SCHEMA_VERSION = "noticepilot.icsExport.v0.4"
EXPORTER_VERSION = "0.4.5-policy.1"
PRODID = "-//NoticePilot//KNU Calendar Export//KO"
DEFAULT_CALENDAR_NAME = "NoticePilot 마감 일정"
DEFAULT_DURATION_MINUTES = 30
KST = timezone(timedelta(hours=9))
TZID = "Asia/Seoul"

ELIGIBLE_STATUSES = {"auto_confirmed", "user_confirmed"}

CAMPUS_LABELS = {
    "chuncheon": "춘천",
    "samcheok": "삼척",
    "dogye": "도계",
    "gangneung_wonju": "강릉원주",
    "all": "전체",
    "unknown": "불명확",
}
VALID_CAMPUSES = set(CAMPUS_LABELS.keys()) - {"unknown", "all"}


def normalize_space(text: str | None) -> str:
    return " ".join((text or "").replace("\xa0", " ").split())


def parse_campus_filter(value: str | None) -> set[str]:
    if not value:
        return set()
    out = {x.strip() for x in value.split(",") if x.strip()}
    aliases = {
        "춘천": "chuncheon",
        "삼척": "samcheok",
        "도계": "dogye",
        "강릉원주": "gangneung_wonju",
        "강릉": "gangneung_wonju",
        "원주": "gangneung_wonju",
    }
    normalized = {aliases.get(x, x) for x in out}
    invalid = sorted(x for x in normalized if x not in VALID_CAMPUSES)
    if invalid:
        raise ValueError(f"invalid campus filter values: {invalid}. valid: {sorted(VALID_CAMPUSES)}")
    return normalized


def format_campuses(campuses: set[str] | list[str]) -> str:
    return ",".join(CAMPUS_LABELS.get(c, c) for c in sorted(campuses))


def load_feed_profiles(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"feed profiles config does not exist: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    profiles = data.get("profiles") or []
    if not isinstance(profiles, list):
        raise ValueError("feed profiles config must contain a profiles array")
    by_id: dict[str, dict[str, Any]] = {}
    for profile in profiles:
        pid = profile.get("profileId")
        if not pid:
            raise ValueError("feed profile missing profileId")
        campuses = set(profile.get("campuses") or [])
        invalid = sorted(c for c in campuses if c not in VALID_CAMPUSES)
        if invalid:
            raise ValueError(f"feed profile {pid} has invalid campuses: {invalid}")
        by_id[pid] = profile
    return {"raw": data, "profiles": by_id}


def profile_summary(profile: dict[str, Any] | None) -> dict[str, Any] | None:
    if not profile:
        return None
    campuses = list(profile.get("campuses") or [])
    return {
        "profileId": profile.get("profileId"),
        "label": profile.get("label"),
        "calendarName": profile.get("calendarName"),
        "campuses": campuses,
        "campusLabels": {c: CAMPUS_LABELS.get(c, c) for c in campuses},
        "includeAllCampus": bool(profile.get("includeAllCampus", False)),
        "includeUnknownCampus": bool(profile.get("includeUnknownCampus", False)),
    }


def resolve_export_options(args: argparse.Namespace) -> dict[str, Any]:
    """Resolve CLI flags and optional feed profile into concrete export options."""
    profile = None
    profiles_config_path = Path(args.profiles_config)
    if args.profile or args.list_profiles or args.export_all_profiles:
        profiles = load_feed_profiles(profiles_config_path)["profiles"]
        if args.profile:
            profile = profiles.get(args.profile)
            if not profile:
                valid = ", ".join(sorted(profiles))
                raise ValueError(f"unknown feed profile: {args.profile}. valid profiles: {valid}")

    if profile:
        feed_campuses = set(profile.get("campuses") or [])
        include_all = bool(profile.get("includeAllCampus", False))
        include_unknown = bool(profile.get("includeUnknownCampus", False))
        calendar_name = profile.get("calendarName") or DEFAULT_CALENDAR_NAME
    else:
        feed_campuses = set()
        include_all = False
        include_unknown = False
        calendar_name = DEFAULT_CALENDAR_NAME

    if args.campuses:
        feed_campuses = parse_campus_filter(args.campuses)
    if args.include_all_campus is not None:
        include_all = bool(args.include_all_campus)
    if args.include_unknown_campus is not None:
        include_unknown = bool(args.include_unknown_campus)
    if args.calendar_name:
        calendar_name = args.calendar_name

    return {
        "calendar_name": calendar_name,
        "feed_campuses": feed_campuses,
        "include_all_campus": include_all,
        "include_unknown_campus": include_unknown,
        "profile": profile,
        "profiles_config_path": profiles_config_path,
    }


def get_campus_scope(candidate: dict[str, Any]) -> dict[str, Any]:
    scope = candidate.get("campusScope")
    if isinstance(scope, dict) and scope.get("campuses"):
        return scope
    return {
        "sourceLabel": None,
        "campuses": ["unknown"],
        "scopeType": "unknown",
        "confidence": "low",
        "source": "candidate_missing_campus_scope",
        "labels": {"unknown": CAMPUS_LABELS["unknown"]},
    }


def campus_match_reason(
    candidate: dict[str, Any],
    feed_campuses: set[str],
    include_all_campus: bool,
    include_unknown_campus: bool,
) -> tuple[bool, str]:
    if not feed_campuses:
        return True, "campus_filter_inactive"
    scope = get_campus_scope(candidate)
    campuses = set(scope.get("campuses") or ["unknown"])
    if "all" in campuses or scope.get("scopeType") == "all_campuses":
        return (True, "all_campus_included") if include_all_campus else (False, "all_campus_excluded")
    if "unknown" in campuses or scope.get("scopeType") == "unknown":
        return (True, "unknown_campus_included") if include_unknown_campus else (False, "unknown_campus_excluded")
    if campuses & feed_campuses:
        return True, "campus_matched"
    return False, "campus_mismatch"


def now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def format_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def format_local(dt: datetime) -> str:
    return dt.astimezone(KST).strftime("%Y%m%dT%H%M%S")


def parse_datetime(value: str) -> datetime:
    # Python accepts +09:00 with fromisoformat. Normalize Z if ever present.
    value = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        raise ValueError(f"timezone missing in datetime: {value}")
    return dt


def compact_date(value: str) -> str:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value or ""):
        raise ValueError(f"invalid all-day date: {value}")
    return value.replace("-", "")


def escape_ics_text(value: Any) -> str:
    text = "" if value is None else str(value)
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\n", "\\n")
    )


def fold_ical_line(line: str, limit: int = 75) -> list[str]:
    """Fold an iCalendar content line by UTF-8 octets.

    RFC 5545 content lines are folded after 75 octets. Continuation lines begin
    with one space. This implementation avoids splitting inside a UTF-8 byte
    sequence by accumulating whole characters.
    """
    encoded_len = 0
    current = ""
    folded: list[str] = []
    for ch in line:
        ch_len = len(ch.encode("utf-8"))
        if current and encoded_len + ch_len > limit:
            folded.append(current)
            current = " " + ch
            encoded_len = 1 + ch_len
        else:
            current += ch
            encoded_len += ch_len
    folded.append(current)
    return folded


def build_description(candidate: dict[str, Any]) -> str:
    parts = [
        f"원문 공지: {candidate.get('sourceTitle') or ''}",
        f"근거: {candidate.get('evidence') or ''}",
    ]
    source_url = candidate.get("sourceUrl")
    if source_url:
        parts.append(f"URL: {source_url}")
    if candidate.get("targetActor"):
        parts.append(f"대상: {candidate.get('targetActor')}")
    scope = get_campus_scope(candidate)
    campuses = scope.get("campuses") or []
    if campuses and campuses != ["unknown"]:
        parts.append(f"캠퍼스: {format_campuses(campuses)}")
    if candidate.get("confidence"):
        parts.append(f"신뢰도: {candidate.get('confidence')}")
    return "\n".join(parts)




def timezone_lines() -> list[str]:
    # Korea Standard Time has no daylight-saving transition in current use.
    # Including VTIMEZONE lets clients display timed deadlines as Asia/Seoul
    # instead of showing a secondary GMT time.
    return [
        "BEGIN:VTIMEZONE",
        f"TZID:{TZID}",
        f"X-LIC-LOCATION:{TZID}",
        "BEGIN:STANDARD",
        "TZOFFSETFROM:+0900",
        "TZOFFSETTO:+0900",
        "TZNAME:KST",
        "DTSTART:19700101T000000",
        "END:STANDARD",
        "END:VTIMEZONE",
    ]

def candidate_is_exportable(candidate: dict[str, Any]) -> bool:
    return bool(candidate.get("includeInCalendarFeed")) and candidate.get("status") in ELIGIBLE_STATUSES


def iter_candidate_files(input_path: Path) -> list[Path]:
    if not input_path.exists():
        raise FileNotFoundError(f"candidate input path does not exist: {input_path}")
    if input_path.is_file():
        if input_path.name == "candidate_extraction_report.json":
            raise ValueError(
                "candidate_extraction_report.json is a report, not a candidate file. "
                "Pass the directory containing *.candidates.json files instead."
            )
        if not input_path.name.endswith(".candidates.json"):
            raise ValueError(f"input file is not a *.candidates.json file: {input_path}")
        return [input_path]
    # Prefer the direct candidate directory, but support one-level/recursive input
    # such as --input extracted when users point at the parent directory.
    files = sorted(p for p in input_path.glob("*.candidates.json") if p.is_file())
    if files:
        return files
    return sorted(p for p in input_path.rglob("*.candidates.json") if p.is_file())


def load_candidates(
    input_path: Path,
    feed_campuses: set[str] | None = None,
    include_all_campus: bool = False,
    include_unknown_campus: bool = False,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[Path], dict[str, int]]:
    feed_campuses = feed_campuses or set()
    exportable: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    campus_filtered_count = 0
    candidate_files = iter_candidate_files(input_path)
    for path in candidate_files:
        data = json.loads(path.read_text(encoding="utf-8"))
        for candidate in data.get("candidates") or []:
            scope = get_campus_scope(candidate)
            record = {
                "sourceFile": str(path),
                "candidateId": candidate.get("id"),
                "sourceNoticeId": candidate.get("sourceNoticeId"),
                "title": candidate.get("title"),
                "status": candidate.get("status"),
                "includeInCalendarFeed": candidate.get("includeInCalendarFeed"),
                "campusScope": scope,
            }
            if not candidate_is_exportable(candidate):
                record["skipReason"] = "not_calendar_feed_eligible"
                skipped.append(record)
                continue
            matched, reason = campus_match_reason(candidate, feed_campuses, include_all_campus, include_unknown_campus)
            if not matched:
                record["skipReason"] = reason
                skipped.append(record)
                campus_filtered_count += 1
                continue
            candidate = dict(candidate)
            candidate["campusMatch"] = {
                "matched": True,
                "reason": reason,
                "feedCampuses": sorted(feed_campuses),
            }
            exportable.append(candidate)
    # Stable output: sort by date/time then title, but preserve uniqueness by UID.
    seen_uids: set[str] = set()
    unique: list[dict[str, Any]] = []
    for candidate in sorted(exportable, key=lambda c: (c.get("normalizedStart") or "", c.get("title") or "")):
        uid = candidate.get("uidHint") or candidate.get("id")
        if uid in seen_uids:
            skipped.append({
                "candidateId": candidate.get("id"),
                "sourceNoticeId": candidate.get("sourceNoticeId"),
                "title": candidate.get("title"),
                "status": candidate.get("status"),
                "includeInCalendarFeed": candidate.get("includeInCalendarFeed"),
                "campusScope": get_campus_scope(candidate),
                "skipReason": "duplicate_uid",
            })
            continue
        seen_uids.add(uid)
        unique.append(candidate)
    counts = {"campusFilteredCount": campus_filtered_count}
    return unique, skipped, candidate_files, counts

def event_lines(candidate: dict[str, Any], dtstamp: datetime, duration_minutes: int) -> list[str]:
    uid = candidate.get("uidHint") or f"{candidate.get('id')}@noticepilot.local"
    title = candidate.get("title") or "NoticePilot 일정"
    description = build_description(candidate)
    normalized_start = candidate.get("normalizedStart")
    if not normalized_start:
        raise ValueError(f"missing normalizedStart for {candidate.get('id')}")

    lines = [
        "BEGIN:VEVENT",
        f"UID:{escape_ics_text(uid)}",
        f"DTSTAMP:{format_utc(dtstamp)}",
        f"SUMMARY:{escape_ics_text(title)}",
        f"DESCRIPTION:{escape_ics_text(description)}",
        f"CATEGORIES:{escape_ics_text('NoticePilot')}",
        f"URL:{escape_ics_text(candidate.get('sourceUrl') or '')}",
        "TRANSP:TRANSPARENT",
    ]
    normalized_end = candidate.get("normalizedEnd")
    if candidate.get("isAllDay"):
        start_date = date.fromisoformat(normalized_start)
        end_date = date.fromisoformat(normalized_end) if normalized_end else start_date
        if end_date < start_date:
            raise ValueError(f"normalizedEnd before normalizedStart for {candidate.get('id')}")
        # Core dates are inclusive. RFC 5545 all-day DTEND is exclusive.
        exclusive_end = end_date + timedelta(days=1)
        lines.append(f"DTSTART;VALUE=DATE:{compact_date(start_date.isoformat())}")
        lines.append(f"DTEND;VALUE=DATE:{compact_date(exclusive_end.isoformat())}")
    else:
        start_dt = parse_datetime(normalized_start)
        end_dt = parse_datetime(normalized_end) if normalized_end else start_dt + timedelta(minutes=duration_minutes)
        if end_dt <= start_dt:
            end_dt = start_dt + timedelta(minutes=duration_minutes)
        lines.append(f"DTSTART;TZID={TZID}:{format_local(start_dt)}")
        lines.append(f"DTEND;TZID={TZID}:{format_local(end_dt)}")
    lines.extend([
        f"X-NOTICEPILOT-SOURCE-NOTICE-ID:{escape_ics_text(candidate.get('sourceNoticeId') or '')}",
        f"X-NOTICEPILOT-CANDIDATE-ID:{escape_ics_text(candidate.get('id') or '')}",
        f"X-NOTICEPILOT-STATUS:{escape_ics_text(candidate.get('status') or '')}",
        f"X-NOTICEPILOT-CAMPUS-SCOPE:{escape_ics_text(','.join(get_campus_scope(candidate).get('campuses') or []))}",
        "END:VEVENT",
    ])
    return lines


def build_ics(candidates: Iterable[dict[str, Any]], calendar_name: str, duration_minutes: int) -> str:
    dtstamp = now_utc()
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape_ics_text(calendar_name)}",
        f"X-WR-TIMEZONE:{TZID}",
    ]
    lines.extend(timezone_lines())
    for candidate in candidates:
        lines.extend(event_lines(candidate, dtstamp, duration_minutes))
    lines.append("END:VCALENDAR")

    folded: list[str] = []
    for line in lines:
        folded.extend(fold_ical_line(line))
    return "\r\n".join(folded) + "\r\n"


def write_export(
    input_path: Path,
    output_dir: Path,
    calendar_name: str,
    filename: str,
    duration_minutes: int,
    feed_campuses: set[str] | None = None,
    include_all_campus: bool = False,
    include_unknown_campus: bool = False,
    feed_profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    feed_campuses = feed_campuses or set()
    candidates, skipped, candidate_files, filter_counts = load_candidates(input_path, feed_campuses, include_all_campus, include_unknown_campus)
    if not candidate_files:
        raise ValueError(
            f"no *.candidates.json files found under {input_path}. "
            "Run noticepilot_candidate_extractor.py first, or pass the correct --input directory."
        )
    ics_text = build_ics(candidates, calendar_name, duration_minutes)
    ics_path = output_dir / filename
    report_path = output_dir / "ics_export_report.json"
    ics_path.write_text(ics_text, encoding="utf-8", newline="")
    report = {
        "schemaVersion": SCHEMA_VERSION,
        "exporterVersion": EXPORTER_VERSION,
        "calendarName": calendar_name,
        "feedProfile": profile_summary(feed_profile),
        "timezone": TZID,
        "timedEventMode": "TZID",
        "availability": "transparent",
        "campusFilterActive": bool(feed_campuses),
        "feedCampuses": sorted(feed_campuses),
        "feedCampusLabels": {c: CAMPUS_LABELS.get(c, c) for c in sorted(feed_campuses)},
        "includeAllCampus": bool(include_all_campus),
        "includeUnknownCampus": bool(include_unknown_campus),
        "campusFilteredCount": filter_counts.get("campusFilteredCount", 0),
        "input": str(input_path),
        "outputIcsPath": str(ics_path),
        "inputCandidateFileCount": len(candidate_files),
        "inputCandidateFiles": [str(p) for p in candidate_files],
        "eventCount": len(candidates),
        "skippedCount": len(skipped),
        "exportedEvents": [
            {
                "uid": c.get("uidHint") or c.get("id"),
                "candidateId": c.get("id"),
                "sourceNoticeId": c.get("sourceNoticeId"),
                "title": c.get("title"),
                "normalizedStart": c.get("normalizedStart"),
                "normalizedEnd": c.get("normalizedEnd"),
                "endDateInclusive": c.get("endDateInclusive"),
                "isAllDay": c.get("isAllDay"),
                "status": c.get("status"),
                "campusScope": get_campus_scope(c),
                "campusMatch": c.get("campusMatch"),
            }
            for c in candidates
        ],
        "skippedCandidates": skipped,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def run_offline_export_check(args: argparse.Namespace) -> int:
    input_path = Path(args.sample_candidate_dir)
    output_dir = Path(args.output_dir)
    try:
        opts = resolve_export_options(args)
        report = write_export(
            input_path=input_path,
            output_dir=output_dir,
            calendar_name=opts["calendar_name"],
            filename=args.filename,
            duration_minutes=args.duration_minutes,
            feed_campuses=opts["feed_campuses"],
            include_all_campus=opts["include_all_campus"],
            include_unknown_campus=opts["include_unknown_campus"],
            feed_profile=opts["profile"],
        )
    except Exception as exc:
        output = {"offlineIcsExportCheck": {"failureCount": 1, "failures": [str(exc)]}}
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return 1
    ics_path = Path(report["outputIcsPath"])
    ics_bytes = ics_path.read_bytes()
    ics_text = ics_bytes.decode("utf-8")
    failures: list[str] = []
    if not ics_bytes.startswith(b"BEGIN:VCALENDAR\r\n"):
        failures.append("ics does not start with BEGIN:VCALENDAR + CRLF")
    if not ics_bytes.endswith(b"END:VCALENDAR\r\n"):
        failures.append("ics does not end with END:VCALENDAR + CRLF")
    if report["eventCount"] <= 0:
        failures.append("no events exported")
    if "학과 제출 마감" in ics_text:
        failures.append("needs_review department deadline leaked into ICS")
    if "BEGIN:VEVENT" not in ics_text:
        failures.append("VEVENT missing")
    if "BEGIN:VTIMEZONE" not in ics_text or "TZID:Asia/Seoul" not in ics_text:
        failures.append("Asia/Seoul VTIMEZONE missing")
    if "TRANSP:TRANSPARENT" not in ics_text:
        failures.append("transparent availability missing")
    if report.get("campusFilterActive") and report.get("campusFilteredCount", 0) < 0:
        failures.append("campus filter report missing")
    timed_utc_lines = [line for line in ics_text.splitlines() if line.startswith(("DTSTART:", "DTEND:")) and line.endswith("Z")]
    if timed_utc_lines:
        failures.append("timed events should use TZID=Asia/Seoul rather than UTC Z DTSTART/DTEND")
    output = {"offlineIcsExportCheck": {**report, "failureCount": len(failures), "failures": failures}}
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


def run_export(args: argparse.Namespace) -> int:
    try:
        opts = resolve_export_options(args)
        report = write_export(
            input_path=Path(args.input),
            output_dir=Path(args.output_dir),
            calendar_name=opts["calendar_name"],
            filename=args.filename,
            duration_minutes=args.duration_minutes,
            feed_campuses=opts["feed_campuses"],
            include_all_campus=opts["include_all_campus"],
            include_unknown_campus=opts["include_unknown_campus"],
            feed_profile=opts["profile"],
        )
    except (FileNotFoundError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"\nSaved: {report['outputIcsPath']}")
    print(f"Saved: {Path(args.output_dir) / 'ics_export_report.json'}")
    return 0


def run_list_profiles(args: argparse.Namespace) -> int:
    try:
        data = load_feed_profiles(Path(args.profiles_config))
    except (FileNotFoundError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    output = {
        "profilesConfig": args.profiles_config,
        "profiles": [profile_summary(p) for p in data["profiles"].values()],
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


def run_export_all_profiles(args: argparse.Namespace) -> int:
    try:
        profiles = load_feed_profiles(Path(args.profiles_config))["profiles"]
        base_out = Path(args.output_dir)
        reports = []
        for profile_id, profile in profiles.items():
            profile_out = base_out / profile_id
            report = write_export(
                input_path=Path(args.input),
                output_dir=profile_out,
                calendar_name=args.calendar_name or profile.get("calendarName") or DEFAULT_CALENDAR_NAME,
                filename=args.filename,
                duration_minutes=args.duration_minutes,
                feed_campuses=set(profile.get("campuses") or []),
                include_all_campus=bool(profile.get("includeAllCampus", False)),
                include_unknown_campus=bool(profile.get("includeUnknownCampus", False)),
                feed_profile=profile,
            )
            reports.append({
                "profileId": profile_id,
                "outputIcsPath": report["outputIcsPath"],
                "eventCount": report["eventCount"],
                "skippedCount": report["skippedCount"],
                "campusFilteredCount": report.get("campusFilteredCount", 0),
            })
    except (FileNotFoundError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    output = {
        "schemaVersion": "noticepilot.profileBatchExport.v0.4",
        "exporterVersion": EXPORTER_VERSION,
        "profilesConfig": args.profiles_config,
        "input": args.input,
        "outputDir": args.output_dir,
        "profileCount": len(reports),
        "reports": reports,
    }
    batch_report_path = Path(args.output_dir) / "profile_batch_export_report.json"
    batch_report_path.parent.mkdir(parents=True, exist_ok=True)
    batch_report_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(output, ensure_ascii=False, indent=2))
    print(f"\nSaved: {batch_report_path}")
    return 0


def build_arg_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="NoticePilot candidate JSON -> static .ics exporter v0.4.5-policy.1")
    ap.add_argument("--input", default="extracted/candidates", help="candidate JSON file or directory")
    ap.add_argument("--output-dir", default="calendar", help="calendar export output directory")
    ap.add_argument("--filename", default="noticepilot.ics", help="ICS filename")
    ap.add_argument("--calendar-name", default=None, help="X-WR-CALNAME value. Defaults to profile calendarName or NoticePilot default.")
    ap.add_argument("--duration-minutes", type=int, default=DEFAULT_DURATION_MINUTES, help="duration for timed deadline events")
    ap.add_argument("--campuses", default="", help="comma-separated feed campus filter: chuncheon,samcheok,dogye,gangneung_wonju")
    ap.add_argument("--include-all-campus", action=argparse.BooleanOptionalAction, default=None, help="include candidates scoped to all campuses")
    ap.add_argument("--include-unknown-campus", action=argparse.BooleanOptionalAction, default=None, help="include candidates with unknown campus scope")
    ap.add_argument("--profiles-config", default="configs/knu_feed_profiles.v0.4.4.json", help="feed profile preset config")
    ap.add_argument("--profile", default="", help="feed profile id, e.g. knu-samcheok")
    ap.add_argument("--list-profiles", action="store_true", help="print available feed profile presets and exit")
    ap.add_argument("--export-all-profiles", action="store_true", help="export one .ics directory per profile under --output-dir")
    ap.add_argument("--offline-export-check", action="store_true", help="run bundled sample candidate JSON export check")
    ap.add_argument("--sample-candidate-dir", default="samples/extracted/candidates", help="sample candidate directory")
    return ap


def main() -> int:
    args = build_arg_parser().parse_args()
    if args.list_profiles:
        return run_list_profiles(args)
    if args.export_all_profiles:
        return run_export_all_profiles(args)
    if args.offline_export_check:
        return run_offline_export_check(args)
    return run_export(args)


if __name__ == "__main__":
    raise SystemExit(main())
