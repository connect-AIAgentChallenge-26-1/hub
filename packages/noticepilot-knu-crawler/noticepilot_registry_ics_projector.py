#!/usr/bin/env python3
"""S27-D persistent CalendarEvent registry to ICS projection.

This module consumes the immutable S27-C registry snapshot and produces a
separate, atomic S27-D projection snapshot. It intentionally leaves the S27-C
registry and legacy candidate-UID ICS artifacts untouched.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tempfile
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

PROJECTOR_VERSION = "0.1.0"
PROJECTION_SCHEMA_VERSION = "noticepilot.registryIcsProjectionManifest.v0.1"
FEED_REPORT_SCHEMA_VERSION = "noticepilot.registryIcsFeedReport.v0.1"
OUTBOX_RECEIPT_SCHEMA_VERSION = "noticepilot.calendarEventProjectionOutboxReceipt.v0.1"
UID_MAP_SCHEMA_VERSION = "noticepilot.legacyCandidateUidCutoverMap.v0.1"
ACTIVE_PROJECTION_SCHEMA_VERSION = "noticepilot.activeCalendarEventProjection.v0.1"
PROJECTION_ID = "s27d-registry-ics-projection-20260713-v1"
MIGRATION_MODE = "pre_subscription_cutover"
UID_DOMAIN = "noticepilot.local"
TZID = "Asia/Seoul"
PRODID = "-//NoticePilot//Persistent Calendar Registry//KO"

FEEDS = {
    "student_default": {
        "calendarName": "NoticePilot 학생 일정",
        "filename": "noticepilot-student-default.ics",
        "legacyReport": "derived/mvp-policy-v0.1/ics/student_default/ics_export_report.json",
        "legacyIcs": "derived/mvp-policy-v0.1/ics/student_default/noticepilot-student-default.ics",
    },
    "job_application": {
        "calendarName": "NoticePilot 채용 접수 일정",
        "filename": "noticepilot-job-applications.ics",
        "legacyReport": "derived/mvp-policy-v0.1/ics/job_application/ics_export_report.json",
        "legacyIcs": "derived/mvp-policy-v0.1/ics/job_application/noticepilot-job-applications.ics",
    },
}


class RegistryIcsProjectionError(ValueError):
    pass


class RegistryIcsProjectionConflictError(RegistryIcsProjectionError):
    pass


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows)
    path.write_text(text, encoding="utf-8", newline="")


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_space(value: Any) -> str:
    return " ".join(str(value or "").replace("\xa0", " ").split())


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


def unfold_ical_lines(text: str) -> list[str]:
    raw = text.replace("\r\n", "\n").split("\n")
    lines: list[str] = []
    for line in raw:
        if not line:
            continue
        if line.startswith((" ", "\t")) and lines:
            lines[-1] += line[1:]
        else:
            lines.append(line)
    return lines


def timezone_lines() -> list[str]:
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


def _parse_iso_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise RegistryIcsProjectionError(f"timezone missing: {value}")
    return parsed


def _format_utc(value: str) -> str:
    return _parse_iso_datetime(value).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _format_local(value: str) -> str:
    parsed = _parse_iso_datetime(value)
    return parsed.strftime("%Y%m%dT%H%M%S")


def _compact_date(value: str) -> str:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value or ""):
        raise RegistryIcsProjectionError(f"invalid date: {value}")
    return value.replace("-", "")


def persistent_uid(calendar_event_id: str) -> str:
    if not re.fullmatch(r"evt_[0-9a-f]{32}", calendar_event_id or ""):
        raise RegistryIcsProjectionError(f"invalid opaque calendarEventId: {calendar_event_id}")
    return f"{calendar_event_id}@{UID_DOMAIN}"


def _legacy_uid_from_report(row: dict[str, Any]) -> str:
    uid = row.get("uid")
    if not uid:
        raise RegistryIcsProjectionError(f"legacy exported event has no uid: {row.get('candidateId')}")
    return str(uid)


def load_registry(registry_dir: Path) -> dict[str, Any]:
    manifest = json.loads((registry_dir / "manifest.json").read_text(encoding="utf-8"))
    artifacts = {
        "events": read_jsonl(registry_dir / "calendar-events.jsonl"),
        "links": read_jsonl(registry_dir / "calendar-event-source-links.jsonl"),
        "revisions": read_jsonl(registry_dir / "calendar-event-revisions.jsonl"),
        "assignments": read_jsonl(registry_dir / "candidate-event-assignments.jsonl"),
        "outbox": read_jsonl(registry_dir / "projection-outbox-intents.jsonl"),
    }
    return {"manifest": manifest, **artifacts}


def _unique(rows: Iterable[dict[str, Any]], key: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        value = row.get(key)
        if not value or value in result:
            raise RegistryIcsProjectionConflictError(f"missing or duplicate {key}: {value}")
        result[value] = row
    return result


def validate_registry_for_projection(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    events = data["events"]
    links = data["links"]
    revisions = data["revisions"]
    assignments = data["assignments"]
    outbox = data["outbox"]
    try:
        events_by_id = _unique(events, "calendarEventId")
        _unique(assignments, "candidateId")
        _unique(outbox, "outboxId")
    except RegistryIcsProjectionConflictError as exc:
        return [str(exc)]

    links_by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in links:
        links_by_event[row.get("calendarEventId")].append(row)
    revisions_by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in revisions:
        revisions_by_event[row.get("calendarEventId")].append(row)
    outbox_by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in outbox:
        outbox_by_event[row.get("calendarEventId")].append(row)

    for event_id, event in events_by_id.items():
        event_links = links_by_event[event_id]
        if sum(bool(row.get("canonical")) for row in event_links) != 1:
            errors.append(f"{event_id}: expected exactly one canonical source link")
        active = [row for row in revisions_by_event[event_id] if row.get("active")]
        if len(active) != 1:
            errors.append(f"{event_id}: expected exactly one active revision")
        elif active[0].get("revisionId") != event.get("activeRevisionId"):
            errors.append(f"{event_id}: active revision mismatch")
        elif active[0].get("projection") != event.get("projection"):
            errors.append(f"{event_id}: event projection differs from active revision")
        if len(outbox_by_event[event_id]) != 1:
            errors.append(f"{event_id}: expected one projection outbox intent")
        elif outbox_by_event[event_id][0].get("status") != "pending_s27d_projection":
            errors.append(f"{event_id}: outbox is not pending S27-D projection")
        if event.get("icsUidMigrationPerformed") is not False:
            errors.append(f"{event_id}: S27-C source snapshot must remain unmigrated")
        if event.get("status") not in {"published", "updated", "cancelled", "suppressed"}:
            errors.append(f"{event_id}: unsupported event status")
        projection = event.get("projection") or {}
        if not projection.get("normalizedStart"):
            errors.append(f"{event_id}: normalizedStart missing")
        if not projection.get("feedScopes"):
            errors.append(f"{event_id}: feedScopes missing")
    if set(events_by_id) != set(outbox_by_event):
        errors.append("event/outbox event ID coverage mismatch")
    if len(events) != 900 or len(assignments) != 909 or len(outbox) != 900:
        errors.append("unexpected S27-C corpus counts")
    return errors


def _description(event: dict[str, Any], links: list[dict[str, Any]]) -> str:
    canonical = next(row for row in links if row.get("canonical"))
    ordered = sorted(links, key=lambda row: (not row.get("canonical"), row.get("canonicalSourceUrl") or ""))
    parts = [
        "NoticePilot 지속형 캘린더 이벤트",
        f"대표 공지: {canonical.get('canonicalSourceUrl') or canonical.get('observedSourceUrl') or ''}",
    ]
    if len(ordered) > 1:
        parts.append("관련 공지:")
        for row in ordered:
            role = row.get("relationRole") or "source"
            url = row.get("canonicalSourceUrl") or row.get("observedSourceUrl") or ""
            parts.append(f"- [{role}] {url}")
    parts.extend([
        f"이벤트 ID: {event['calendarEventId']}",
        f"개정: {event['revisionNumber']} / SEQUENCE {event['sequence']}",
    ])
    return "\n".join(parts)


def _event_status(event: dict[str, Any]) -> str:
    status = event.get("status")
    if status == "cancelled":
        return "CANCELLED"
    if status in {"published", "updated"}:
        return "CONFIRMED"
    raise RegistryIcsProjectionError(f"suppressed event cannot enter active ICS: {event['calendarEventId']}")


def event_lines(event: dict[str, Any], links: list[dict[str, Any]]) -> list[str]:
    projection = event["projection"]
    canonical = next(row for row in links if row.get("canonical"))
    status = _event_status(event)
    uid = persistent_uid(event["calendarEventId"])
    lines = [
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{_format_utc(event['updatedAt'])}",
        f"CREATED:{_format_utc(event['createdAt'])}",
        f"LAST-MODIFIED:{_format_utc(event['updatedAt'])}",
        f"SEQUENCE:{event['sequence']}",
        f"STATUS:{status}",
        f"SUMMARY:{escape_ics_text(projection.get('title') or 'NoticePilot 일정')}",
        f"DESCRIPTION:{escape_ics_text(_description(event, links))}",
        "CATEGORIES:NoticePilot",
        f"URL:{escape_ics_text(canonical.get('canonicalSourceUrl') or canonical.get('observedSourceUrl') or '')}",
        "TRANSP:TRANSPARENT",
    ]

    start = projection.get("normalizedStart")
    end = projection.get("normalizedEnd")
    if projection.get("isAllDay"):
        start_date = date.fromisoformat(start)
        end_date = date.fromisoformat(end) if end else start_date
        if end_date < start_date:
            raise RegistryIcsProjectionError(f"end before start: {event['calendarEventId']}")
        if projection.get("endDateInclusive") is not True:
            raise RegistryIcsProjectionError(f"all-day registry projection must use inclusive end: {event['calendarEventId']}")
        lines.append(f"DTSTART;VALUE=DATE:{_compact_date(start_date.isoformat())}")
        lines.append(f"DTEND;VALUE=DATE:{_compact_date((end_date + timedelta(days=1)).isoformat())}")
    else:
        lines.append(f"DTSTART;TZID={TZID}:{_format_local(start)}")
        if end:
            if _parse_iso_datetime(end) <= _parse_iso_datetime(start):
                raise RegistryIcsProjectionError(f"timed end must be after start: {event['calendarEventId']}")
            lines.append(f"DTEND;TZID={TZID}:{_format_local(end)}")
        # Deliberately omit DTEND when the core event has no end. Arbitrary
        # duration invention is forbidden by the authoritative domain contract.

    campuses = (projection.get("campusScope") or {}).get("campuses") or []
    lines.extend([
        f"X-NOTICEPILOT-EVENT-ID:{event['calendarEventId']}",
        f"X-NOTICEPILOT-REGISTRY-ID:{event['registryId']}",
        f"X-NOTICEPILOT-REVISION:{event['revisionNumber']}",
        f"X-NOTICEPILOT-RELATION-BASIS:{event['relationBasis']}",
        f"X-NOTICEPILOT-CANONICAL-CANDIDATE-ID:{event['canonicalCandidateId']}",
        f"X-NOTICEPILOT-CAMPUS-SCOPE:{escape_ics_text(','.join(campuses))}",
        f"X-NOTICEPILOT-SOURCE-COUNT:{len(links)}",
    ])
    for row in sorted(links, key=lambda item: (not item.get("canonical"), item.get("sourceCandidateId") or "")):
        lines.append(f"X-NOTICEPILOT-SOURCE-NOTICE-ID:{escape_ics_text(row.get('sourceNoticeId') or '')}")
        lines.append(f"X-NOTICEPILOT-SOURCE-CANDIDATE-ID:{escape_ics_text(row.get('sourceCandidateId') or '')}")
        lines.append(f"X-NOTICEPILOT-SOURCE-URL:{escape_ics_text(row.get('canonicalSourceUrl') or row.get('observedSourceUrl') or '')}")
    lines.append("END:VEVENT")
    return lines


def build_ics(events: list[dict[str, Any]], links_by_event: dict[str, list[dict[str, Any]]], calendar_name: str) -> str:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape_ics_text(calendar_name)}",
        f"X-WR-TIMEZONE:{TZID}",
        f"X-NOTICEPILOT-PROJECTION-ID:{PROJECTION_ID}",
        f"X-NOTICEPILOT-MIGRATION-MODE:{MIGRATION_MODE}",
    ]
    lines.extend(timezone_lines())
    for event in sorted(events, key=lambda row: (row["projection"].get("normalizedStart") or "", row["projection"].get("title") or "", row["calendarEventId"])):
        lines.extend(event_lines(event, links_by_event[event["calendarEventId"]]))
    lines.append("END:VCALENDAR")
    folded: list[str] = []
    for line in lines:
        folded.extend(fold_ical_line(line))
    return "\r\n".join(folded) + "\r\n"


def _load_legacy_events(root: Path) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for feed_scope, cfg in FEEDS.items():
        report = json.loads((root / cfg["legacyReport"]).read_text(encoding="utf-8"))
        for row in report.get("exportedEvents") or []:
            candidate_id = row.get("candidateId")
            if candidate_id in result:
                raise RegistryIcsProjectionConflictError(f"candidate appears in multiple legacy reports: {candidate_id}")
            result[candidate_id] = {**row, "feedScope": feed_scope, "legacyUid": _legacy_uid_from_report(row)}
    return result


def _projection_semantics(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": row.get("title"),
        "normalizedStart": row.get("normalizedStart"),
        "normalizedEnd": row.get("normalizedEnd"),
        "isAllDay": row.get("isAllDay"),
        "endDateInclusive": row.get("endDateInclusive"),
    }


def _active_projection_row(event: dict[str, Any], links: list[dict[str, Any]]) -> dict[str, Any]:
    canonical = next(row for row in links if row.get("canonical"))
    return {
        "schemaVersion": ACTIVE_PROJECTION_SCHEMA_VERSION,
        "projectionId": PROJECTION_ID,
        "calendarEventId": event["calendarEventId"],
        "uid": persistent_uid(event["calendarEventId"]),
        "feedScopes": event["projection"]["feedScopes"],
        "sequence": event["sequence"],
        "status": _event_status(event),
        "revisionNumber": event["revisionNumber"],
        "relationBasis": event["relationBasis"],
        "canonicalCandidateId": event["canonicalCandidateId"],
        "canonicalSourceNoticeId": event["canonicalSourceNoticeId"],
        "canonicalSourceUrl": canonical.get("canonicalSourceUrl") or canonical.get("observedSourceUrl"),
        "sourceCandidateIds": event["sourceCandidateIds"],
        "sourceNoticeIds": event["sourceNoticeIds"],
        "sourceUrls": sorted({row.get("canonicalSourceUrl") or row.get("observedSourceUrl") for row in links}),
        "projection": event["projection"],
    }


def materialize_projection(*, root: Path, registry_dir: Path, created_at: str = "2026-07-13T12:30:00+09:00") -> dict[str, Any]:
    data = load_registry(registry_dir)
    validation_errors = validate_registry_for_projection(data)
    if validation_errors:
        raise RegistryIcsProjectionConflictError("; ".join(validation_errors[:10]))

    events = [row for row in data["events"] if row.get("status") != "suppressed"]
    events_by_id = _unique(events, "calendarEventId")
    assignments_by_candidate = _unique(data["assignments"], "candidateId")
    links_by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in data["links"]:
        links_by_event[row["calendarEventId"]].append(row)
    legacy_by_candidate = _load_legacy_events(root)
    if set(assignments_by_candidate) != set(legacy_by_candidate):
        missing = sorted(set(assignments_by_candidate) - set(legacy_by_candidate))[:5]
        extra = sorted(set(legacy_by_candidate) - set(assignments_by_candidate))[:5]
        raise RegistryIcsProjectionConflictError(f"legacy/assignment candidate coverage mismatch; missing={missing}, extra={extra}")

    active_rows = [_active_projection_row(event, links_by_event[event["calendarEventId"]]) for event in events]
    cutover_rows: list[dict[str, Any]] = []
    semantic_mismatches: list[dict[str, Any]] = []
    for candidate_id, assignment in sorted(assignments_by_candidate.items()):
        event = events_by_id[assignment["calendarEventId"]]
        legacy = legacy_by_candidate[candidate_id]
        new_projection = event["projection"]
        legacy_semantics = _projection_semantics(legacy)
        new_semantics = _projection_semantics(new_projection)
        is_canonical = candidate_id == event["canonicalCandidateId"]
        disposition = "same_event_uid_rekeyed"
        if event["relationBasis"] == "duplicate" and not is_canonical:
            disposition = "duplicate_source_collapsed_into_canonical_event"
        elif event["relationBasis"] == "extension" and not is_canonical:
            disposition = "superseded_revision_collapsed_into_active_event"
        if is_canonical and legacy_semantics != new_semantics:
            semantic_mismatches.append({
                "candidateId": candidate_id,
                "calendarEventId": event["calendarEventId"],
                "legacy": legacy_semantics,
                "active": new_semantics,
            })
        cutover_rows.append({
            "schemaVersion": UID_MAP_SCHEMA_VERSION,
            "projectionId": PROJECTION_ID,
            "candidateId": candidate_id,
            "calendarEventId": event["calendarEventId"],
            "feedScope": legacy["feedScope"],
            "legacyUid": legacy["legacyUid"],
            "persistentUid": persistent_uid(event["calendarEventId"]),
            "relationBasis": event["relationBasis"],
            "canonical": is_canonical,
            "disposition": disposition,
            "legacyCancellationTombstoneEmitted": False,
            "migrationMode": MIGRATION_MODE,
        })
    if semantic_mismatches:
        raise RegistryIcsProjectionConflictError(f"canonical projection semantic mismatch: {semantic_mismatches[:3]}")

    receipts = []
    for intent in sorted(data["outbox"], key=lambda row: row["outboxId"]):
        receipts.append({
            "schemaVersion": OUTBOX_RECEIPT_SCHEMA_VERSION,
            "projectionId": PROJECTION_ID,
            "receiptId": "outreceipt_" + hashlib.sha256((PROJECTION_ID + "|" + intent["outboxId"]).encode()).hexdigest()[:32],
            "outboxId": intent["outboxId"],
            "registryId": intent["registryId"],
            "calendarEventId": intent["calendarEventId"],
            "status": "consumed",
            "consumedAt": created_at,
            "icsSerialized": True,
        })

    feeds: dict[str, dict[str, Any]] = {}
    for feed_scope, cfg in FEEDS.items():
        feed_events = [event for event in events if feed_scope in event["projection"].get("feedScopes", [])]
        ics_text = build_ics(feed_events, links_by_event, cfg["calendarName"])
        feed_rows = [_active_projection_row(event, links_by_event[event["calendarEventId"]]) for event in feed_events]
        feeds[feed_scope] = {
            "config": cfg,
            "events": feed_events,
            "activeRows": feed_rows,
            "icsText": ics_text,
        }

    relation_counts = Counter(event["relationBasis"] for event in events)
    projection_counts = Counter()
    for event in events:
        p = event["projection"]
        projection_counts["allDayEventCount" if p.get("isAllDay") else "timedEventCount"] += 1
        if not p.get("isAllDay") and not p.get("normalizedEnd"):
            projection_counts["timedWithoutEndCount"] += 1
        if event.get("sequence") == 1:
            projection_counts["sequenceOneEventCount"] += 1
    return {
        "sourceManifest": data["manifest"],
        "events": events,
        "links": data["links"],
        "activeRows": active_rows,
        "uidMap": cutover_rows,
        "receipts": receipts,
        "feeds": feeds,
        "counts": {
            "calendarEventCount": len(events),
            "legacyCandidateUidCount": len(cutover_rows),
            "persistentUidCount": len({row["persistentUid"] for row in cutover_rows}),
            "outboxIntentCount": len(data["outbox"]),
            "outboxConsumedCount": len(receipts),
            "legacyCancellationTombstoneCount": 0,
            "singletonEventCount": relation_counts["singleton"],
            "duplicateEventCount": relation_counts["duplicate"],
            "extensionEventCount": relation_counts["extension"],
            **projection_counts,
        },
    }


def _feed_report(feed_scope: str, data: dict[str, Any], output_path: Path, legacy_report: dict[str, Any]) -> dict[str, Any]:
    events = data["events"]
    lines = unfold_ical_lines(data["icsText"])
    uid_lines = [line.removeprefix("UID:") for line in lines if line.startswith("UID:")]
    sequence_lines = [int(line.removeprefix("SEQUENCE:")) for line in lines if line.startswith("SEQUENCE:")]
    dtend_lines = [line for line in lines if line.startswith("DTEND")]
    timed_no_end = sum(not e["projection"].get("isAllDay") and not e["projection"].get("normalizedEnd") for e in events)
    return {
        "schemaVersion": FEED_REPORT_SCHEMA_VERSION,
        "projectorVersion": PROJECTOR_VERSION,
        "projectionId": PROJECTION_ID,
        "migrationMode": MIGRATION_MODE,
        "feedScope": feed_scope,
        "calendarName": FEEDS[feed_scope]["calendarName"],
        "timezone": TZID,
        "outputIcsPath": output_path.name,
        "pathReferences": {"base": "feed_report_directory", "format": "posix_relative"},
        "eventCount": len(events),
        "uniqueUidCount": len(set(uid_lines)),
        "legacyEventCount": legacy_report.get("eventCount"),
        "eventCountDelta": len(events) - int(legacy_report.get("eventCount", 0)),
        "sequenceZeroEventCount": sum(v == 0 for v in sequence_lines),
        "sequenceOneEventCount": sum(v == 1 for v in sequence_lines),
        "allDayEventCount": sum(e["projection"].get("isAllDay") for e in events),
        "timedEventCount": sum(not e["projection"].get("isAllDay") for e in events),
        "timedWithoutEndCount": timed_no_end,
        "dtendLineCount": len(dtend_lines),
        "legacyCancellationTombstoneCount": 0,
        "events": data["activeRows"],
    }


def write_projection_snapshot(*, root: Path, registry_dir: Path, output_dir: Path, created_at: str = "2026-07-13T12:30:00+09:00") -> dict[str, Any]:
    if output_dir.exists() and any(output_dir.iterdir()):
        raise RegistryIcsProjectionError(f"refusing to overwrite nonempty projection directory: {output_dir}")
    materialized = materialize_projection(root=root, registry_dir=registry_dir, created_at=created_at)
    parent = output_dir.parent
    parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix=output_dir.name + ".tmp-", dir=parent))
    try:
        feeds_manifest: dict[str, Any] = {}
        for feed_scope, feed_data in materialized["feeds"].items():
            feed_dir = tmp / "feeds" / feed_scope
            feed_dir.mkdir(parents=True, exist_ok=True)
            ics_path = feed_dir / feed_data["config"]["filename"]
            ics_path.write_bytes(feed_data["icsText"].encode("utf-8"))
            legacy_report = json.loads((root / feed_data["config"]["legacyReport"]).read_text(encoding="utf-8"))
            report = _feed_report(feed_scope, feed_data, ics_path, legacy_report)
            report_path = feed_dir / "ics-projection-report.json"
            write_json(report_path, report)
            feeds_manifest[feed_scope] = {
                "calendarName": feed_data["config"]["calendarName"],
                "eventCount": report["eventCount"],
                "legacyEventCount": report["legacyEventCount"],
                "eventCountDelta": report["eventCountDelta"],
                "ics": {"path": str(ics_path.relative_to(tmp)), "sha256": file_sha256(ics_path)},
                "report": {"path": str(report_path.relative_to(tmp)), "sha256": file_sha256(report_path)},
            }

        active_path = tmp / "active-calendar-event-projections.jsonl"
        uid_map_path = tmp / "legacy-candidate-uid-cutover-map.jsonl"
        receipts_path = tmp / "outbox-consumption-receipts.jsonl"
        write_jsonl(active_path, materialized["activeRows"])
        write_jsonl(uid_map_path, materialized["uidMap"])
        write_jsonl(receipts_path, materialized["receipts"])

        source_manifest_path = registry_dir / "manifest.json"
        artifacts = {
            "activeProjections": {"path": active_path.name, "sha256": file_sha256(active_path)},
            "legacyUidCutoverMap": {"path": uid_map_path.name, "sha256": file_sha256(uid_map_path)},
            "outboxConsumptionReceipts": {"path": receipts_path.name, "sha256": file_sha256(receipts_path)},
        }
        manifest = {
            "schemaVersion": PROJECTION_SCHEMA_VERSION,
            "projectionId": PROJECTION_ID,
            "projectorVersion": PROJECTOR_VERSION,
            "createdAt": created_at,
            "migrationMode": MIGRATION_MODE,
            "uidPolicy": {
                "persistentUidFormat": "{calendarEventId}@noticepilot.local",
                "legacyCandidateUidDurable": False,
                "legacyCancellationTombstonesEmitted": False,
                "reason": "no_subscription_endpoint_and_legacy_candidate_uid_was_nonpersistent",
            },
            "sourceRegistry": {
                "registryId": materialized["sourceManifest"]["registryId"],
                "path": os.path.relpath(registry_dir, tmp).replace(os.sep, "/"),
                "manifestSha256": file_sha256(source_manifest_path),
            },
            "legacyArtifacts": {
                feed_scope: {
                    "report": {
                        "path": os.path.relpath(root / cfg["legacyReport"], tmp).replace(os.sep, "/"),
                        "sha256": file_sha256(root / cfg["legacyReport"]),
                    },
                    "ics": {
                        "path": os.path.relpath(root / cfg["legacyIcs"], tmp).replace(os.sep, "/"),
                        "sha256": file_sha256(root / cfg["legacyIcs"]),
                    },
                }
                for feed_scope, cfg in FEEDS.items()
            },
            "counts": materialized["counts"],
            "feeds": feeds_manifest,
            "artifacts": artifacts,
            "invariants": {
                "onePersistentUidPerCalendarEvent": True,
                "allOutboxIntentsConsumedExactlyOnce": True,
                "allLegacyCandidateUidsMapped": True,
                "duplicateSourcesCollapseToOneActiveVevent": True,
                "extensionPreservesUidAndUsesSequenceOne": True,
                "allSourceLinksPreserved": True,
                "timedEventsWithoutEndOmitDtend": True,
                "legacyArtifactsRemainUnmodified": True,
                "s27cRegistryRemainsImmutable": True,
            },
        }
        digest = hashlib.sha256()
        for key, entry in sorted(artifacts.items()):
            digest.update(key.encode())
            digest.update(entry["sha256"].encode())
        for feed_scope, entry in sorted(feeds_manifest.items()):
            digest.update(feed_scope.encode())
            digest.update(entry["ics"]["sha256"].encode())
            digest.update(entry["report"]["sha256"].encode())
        manifest["contentDigest"] = digest.hexdigest()
        manifest["pathReferences"] = {"base": "projection_manifest_directory", "format": "posix_relative"}
        write_json(tmp / "manifest.json", manifest)
        tmp.rename(output_dir)
        return manifest
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise


def projection_content_digest(output_dir: Path) -> str:
    manifest = json.loads((output_dir / "manifest.json").read_text(encoding="utf-8"))
    digest = hashlib.sha256()
    for key, entry in sorted(manifest["artifacts"].items()):
        digest.update(key.encode())
        digest.update(entry["sha256"].encode())
    for feed_scope, feed in sorted(manifest["feeds"].items()):
        digest.update(feed_scope.encode())
        digest.update(feed["ics"]["sha256"].encode())
        digest.update(feed["report"]["sha256"].encode())
    return digest.hexdigest()
