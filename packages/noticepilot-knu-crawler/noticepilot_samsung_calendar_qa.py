#!/usr/bin/env python3
"""S30 Samsung Calendar subscription QA contracts and automated audit.

The automated layer verifies the NoticePilot subscription feed and produces a
small three-stage lifecycle fixture for physical Samsung Calendar testing.
Physical client behavior is deliberately not inferred from RFC conformance.
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Mapping

from noticepilot_postgres_persistence import InMemoryPostgresReferenceStore, build_foundation_bootstrap_bundle
from noticepilot_registry_ics_projector import build_ics, unfold_ical_lines
from noticepilot_subscription_delivery import SubscriptionFeedDeliveryService

QA_SCHEMA_VERSION = "noticepilot.s30SamsungCalendarQa.v0.1"
QA_MANIFEST_SCHEMA_VERSION = "noticepilot.s30SamsungCalendarQaManifest.v0.1"
PHYSICAL_REPORT_SCHEMA_VERSION = "noticepilot.s30SamsungPhysicalQaResult.v0.1"
QA_VERSION = "0.1.0"
QA_CALENDAR_NAME = "NoticePilot Samsung Calendar QA"
QA_PATH = "/s30-samsung-calendar/noticepilot-qa.ics"
STAGES = ("initial", "updated", "cancelled")
UID_RE = re.compile(r"^evt_[0-9a-f]{32}@noticepilot\.local$")
ETAG_RE = re.compile(r'^"[0-9a-f]{64}"$')


class SamsungCalendarQaError(ValueError):
    pass


@dataclass(frozen=True)
class ParsedProperty:
    name: str
    params: dict[str, str]
    value: str
    raw: str


@dataclass(frozen=True)
class ParsedEvent:
    properties: tuple[ParsedProperty, ...]

    def values(self, name: str) -> list[ParsedProperty]:
        upper = name.upper()
        return [row for row in self.properties if row.name == upper]

    def one(self, name: str) -> ParsedProperty | None:
        rows = self.values(name)
        return rows[0] if len(rows) == 1 else None


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="")


def _check(check_id: str, passed: bool, *, expected: Any = None, actual: Any = None, detail: str = "") -> dict[str, Any]:
    row: dict[str, Any] = {"checkId": check_id, "status": "pass" if passed else "fail"}
    if expected is not None:
        row["expected"] = expected
    if actual is not None:
        row["actual"] = actual
    if detail:
        row["detail"] = detail
    return row


def _has_only_crlf(data: bytes) -> bool:
    for index, byte in enumerate(data):
        if byte == 10 and (index == 0 or data[index - 1] != 13):
            return False
        if byte == 13 and (index + 1 >= len(data) or data[index + 1] != 10):
            return False
    return True


def _parse_property(line: str) -> ParsedProperty:
    left, sep, value = line.partition(":")
    if not sep:
        raise SamsungCalendarQaError(f"content line has no colon: {line[:80]}")
    pieces = left.split(";")
    name = pieces[0].upper()
    params: dict[str, str] = {}
    for piece in pieces[1:]:
        key, eq, param_value = piece.partition("=")
        if not eq:
            raise SamsungCalendarQaError(f"invalid property parameter: {piece}")
        params[key.upper()] = param_value
    return ParsedProperty(name=name, params=params, value=value, raw=line)


def parse_ics(data: bytes) -> tuple[list[str], list[ParsedEvent]]:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise SamsungCalendarQaError("ICS is not valid UTF-8") from exc
    lines = unfold_ical_lines(text)
    events: list[ParsedEvent] = []
    current: list[ParsedProperty] | None = None
    for line in lines:
        if line == "BEGIN:VEVENT":
            if current is not None:
                raise SamsungCalendarQaError("nested VEVENT")
            current = []
            continue
        if line == "END:VEVENT":
            if current is None:
                raise SamsungCalendarQaError("orphan END:VEVENT")
            events.append(ParsedEvent(tuple(current)))
            current = None
            continue
        if current is not None:
            current.append(_parse_property(line))
    if current is not None:
        raise SamsungCalendarQaError("unterminated VEVENT")
    return lines, events


def _calendar_property_values(lines: Iterable[str], name: str) -> list[str]:
    prefix = name.upper() + ":"
    return [line[len(prefix):] for line in lines if line.upper().startswith(prefix)]


def _parse_compact_date(value: str) -> datetime:
    return datetime.strptime(value, "%Y%m%d")


def _parse_compact_local(value: str) -> datetime:
    return datetime.strptime(value, "%Y%m%dT%H%M%S")


def audit_ics_bytes(data: bytes, *, expected_event_count: int | None = None) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    try:
        text = data.decode("utf-8")
        utf8_ok = True
    except UnicodeDecodeError:
        text = ""
        utf8_ok = False
    checks.append(_check("utf8_encoding", utf8_ok, expected="valid UTF-8", actual="valid" if utf8_ok else "invalid"))
    checks.append(_check("crlf_line_endings", _has_only_crlf(data), expected="CRLF only"))
    checks.append(_check("final_crlf", data.endswith(b"\r\n"), expected=True, actual=data.endswith(b"\r\n")))

    physical = data.split(b"\r\n") if data else []
    overlong = [len(row) for row in physical if len(row) > 75]
    checks.append(_check("physical_line_octet_limit", not overlong, expected="<=75 octets", actual=max(overlong, default=max((len(row) for row in physical), default=0))))
    orphan_continuation = bool(physical and physical[0].startswith((b" ", b"\t")))
    checks.append(_check("folding_continuation_integrity", not orphan_continuation, expected="no orphan continuation"))

    lines: list[str] = []
    events: list[ParsedEvent] = []
    parse_error = None
    if utf8_ok:
        try:
            lines, events = parse_ics(data)
        except SamsungCalendarQaError as exc:
            parse_error = str(exc)
    checks.append(_check("ics_parse", parse_error is None, expected="parseable", actual=parse_error or "parseable"))
    if parse_error is not None:
        return {
            "schemaVersion": QA_SCHEMA_VERSION,
            "status": "fail",
            "eventCount": 0,
            "sha256": sha256_bytes(data),
            "checks": checks,
        }

    envelope_ok = bool(lines) and lines[0] == "BEGIN:VCALENDAR" and lines[-1] == "END:VCALENDAR"
    checks.append(_check("vcalendar_envelope", envelope_ok, expected=["BEGIN:VCALENDAR", "END:VCALENDAR"], actual=[lines[0] if lines else None, lines[-1] if lines else None]))
    required_calendar = {
        "VERSION": "2.0",
        "CALSCALE": "GREGORIAN",
        "METHOD": "PUBLISH",
        "X-WR-TIMEZONE": "Asia/Seoul",
    }
    actual_calendar = {key: _calendar_property_values(lines, key) for key in required_calendar}
    required_ok = all(actual_calendar[key] == [value] for key, value in required_calendar.items()) and len(_calendar_property_values(lines, "PRODID")) == 1
    checks.append(_check("required_calendar_properties", required_ok, expected=required_calendar, actual=actual_calendar))
    timezone_ok = all(token in lines for token in (
        "BEGIN:VTIMEZONE", "TZID:Asia/Seoul", "TZOFFSETFROM:+0900", "TZOFFSETTO:+0900", "END:VTIMEZONE"
    ))
    checks.append(_check("asia_seoul_vtimezone", timezone_ok, expected="VTIMEZONE Asia/Seoul +0900"))

    if expected_event_count is not None:
        checks.append(_check("event_count", len(events) == expected_event_count, expected=expected_event_count, actual=len(events)))

    uids: list[str] = []
    event_errors: list[str] = []
    all_day_count = 0
    timed_count = 0
    cancelled_count = 0
    for index, event in enumerate(events):
        uid = event.one("UID")
        dtstamp = event.one("DTSTAMP")
        start = event.one("DTSTART")
        summary = event.one("SUMMARY")
        sequence = event.one("SEQUENCE")
        status = event.one("STATUS")
        if None in (uid, dtstamp, start, summary, sequence, status):
            event_errors.append(f"event[{index}] missing or duplicate required property")
            continue
        assert uid and start and sequence and status
        uids.append(uid.value)
        if not UID_RE.fullmatch(uid.value):
            event_errors.append(f"event[{index}] invalid UID")
        try:
            sequence_value = int(sequence.value)
            if sequence_value < 0:
                raise ValueError
        except ValueError:
            event_errors.append(f"event[{index}] invalid SEQUENCE")
        if status.value not in {"CONFIRMED", "CANCELLED"}:
            event_errors.append(f"event[{index}] invalid STATUS")
        if status.value == "CANCELLED":
            cancelled_count += 1

        end = event.one("DTEND")
        is_all_day = start.params.get("VALUE") == "DATE"
        if is_all_day:
            all_day_count += 1
            if end is None or end.params.get("VALUE") != "DATE":
                event_errors.append(f"event[{index}] all-day DTEND mismatch")
            else:
                try:
                    if _parse_compact_date(end.value) <= _parse_compact_date(start.value):
                        event_errors.append(f"event[{index}] all-day exclusive DTEND not after DTSTART")
                except ValueError:
                    event_errors.append(f"event[{index}] invalid all-day date")
        else:
            timed_count += 1
            if start.params.get("TZID") != "Asia/Seoul":
                event_errors.append(f"event[{index}] timed DTSTART missing Asia/Seoul")
            if end is not None:
                if end.params.get("TZID") != "Asia/Seoul":
                    event_errors.append(f"event[{index}] timed DTEND missing Asia/Seoul")
                try:
                    if _parse_compact_local(end.value) <= _parse_compact_local(start.value):
                        event_errors.append(f"event[{index}] timed DTEND not after DTSTART")
                except ValueError:
                    event_errors.append(f"event[{index}] invalid timed date-time")

    checks.append(_check("vevent_required_properties", not event_errors, expected="valid UID/DTSTAMP/DTSTART/SUMMARY/SEQUENCE/STATUS and time form", actual=event_errors))
    duplicate_uids = sorted({uid for uid in uids if uids.count(uid) > 1})
    checks.append(_check("unique_uid_per_feed", not duplicate_uids, expected=[], actual=duplicate_uids))
    status = "pass" if all(row["status"] == "pass" for row in checks) else "fail"
    return {
        "schemaVersion": QA_SCHEMA_VERSION,
        "status": status,
        "eventCount": len(events),
        "allDayCount": all_day_count,
        "timedCount": timed_count,
        "cancelledCount": cancelled_count,
        "sha256": sha256_bytes(data),
        "checks": checks,
    }


def audit_http_response(status_code: int, headers: Mapping[str, str], body: bytes, *, expected_event_count: int) -> dict[str, Any]:
    checks = [
        _check("http_status", status_code == 200, expected=200, actual=status_code),
        _check("content_type", headers.get("Content-Type") == "text/calendar; charset=utf-8", expected="text/calendar; charset=utf-8", actual=headers.get("Content-Type")),
        _check("content_disposition", str(headers.get("Content-Disposition", "")).startswith("inline; filename=\"feed_"), expected="inline .ics filename", actual=headers.get("Content-Disposition")),
        _check("etag", bool(ETAG_RE.fullmatch(headers.get("ETag", ""))), expected="quoted SHA-256 ETag", actual=headers.get("ETag")),
        _check("cache_control", headers.get("Cache-Control") == "private, max-age=300, must-revalidate", expected="private, max-age=300, must-revalidate", actual=headers.get("Cache-Control")),
        _check("last_modified", bool(headers.get("Last-Modified")), expected="HTTP date", actual=headers.get("Last-Modified")),
    ]
    ics = audit_ics_bytes(body, expected_event_count=expected_event_count)
    status = "pass" if all(row["status"] == "pass" for row in checks) and ics["status"] == "pass" else "fail"
    return {"status": status, "httpChecks": checks, "icsAudit": ics}


def _event(event_id: str, *, title: str, start: str, end: str | None, all_day: bool, sequence: int, status: str, updated_at: str) -> dict[str, Any]:
    return {
        "calendarEventId": event_id,
        "canonicalCandidateId": "cand_" + event_id[4:],
        "canonicalSourceNoticeId": "notice_" + event_id[4:],
        "createdAt": "2026-07-13T21:00:00+09:00",
        "updatedAt": updated_at,
        "projection": {
            "title": title,
            "normalizedStart": start,
            "normalizedEnd": end,
            "isAllDay": all_day,
            "endDateInclusive": True if all_day else False,
            "feedScopes": ["student_default"],
        },
        "registryId": "s30-samsung-qa-registry-v1",
        "relationBasis": "qa_fixture",
        "revisionNumber": sequence,
        "sequence": sequence,
        "status": status,
    }


def _links(event_ids: Iterable[str]) -> dict[str, list[dict[str, Any]]]:
    return {
        event_id: [{
            "canonical": True,
            "relationRole": "canonical",
            "canonicalSourceUrl": f"https://example.invalid/notices/{event_id}",
            "observedSourceUrl": f"https://example.invalid/notices/{event_id}",
        }]
        for event_id in event_ids
    }


def build_lifecycle_fixtures() -> dict[str, bytes]:
    a = "evt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    b = "evt_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    c = "evt_cccccccccccccccccccccccccccccccc"
    initial = [
        _event(a, title="[S30 초기] 한글 장문 일정 — UTF-8 폴딩과 종일 종료일 검증", start="2026-08-01", end="2026-08-03", all_day=True, sequence=0, status="published", updated_at="2026-07-13T21:00:00+09:00"),
        _event(b, title="[S30 초기] Asia/Seoul 시간 일정", start="2026-08-05T14:00:00+09:00", end="2026-08-05T15:30:00+09:00", all_day=False, sequence=0, status="published", updated_at="2026-07-13T21:00:00+09:00"),
    ]
    updated = copy.deepcopy(initial)
    updated[0] = _event(a, title="[S30 수정] 한글 장문 일정 — 종료일 연장", start="2026-08-01", end="2026-08-05", all_day=True, sequence=1, status="updated", updated_at="2026-07-13T21:10:00+09:00")
    updated.append(_event(c, title="[S30 신규] 구독 갱신 신규 이벤트", start="2026-08-07T09:00:00+09:00", end=None, all_day=False, sequence=0, status="published", updated_at="2026-07-13T21:10:00+09:00"))
    cancelled = copy.deepcopy(updated)
    cancelled[0] = _event(a, title="[S30 취소] 한글 장문 일정 — 취소 상태", start="2026-08-01", end="2026-08-05", all_day=True, sequence=2, status="cancelled", updated_at="2026-07-13T21:20:00+09:00")
    result: dict[str, bytes] = {}
    for stage, events in (("initial", initial), ("updated", updated), ("cancelled", cancelled)):
        links = _links(row["calendarEventId"] for row in events)
        result[stage] = build_ics(events, links, QA_CALENDAR_NAME).encode("utf-8")
    return result


def _event_map(data: bytes) -> dict[str, ParsedEvent]:
    _, events = parse_ics(data)
    result: dict[str, ParsedEvent] = {}
    for event in events:
        uid = event.one("UID")
        if uid is None or uid.value in result:
            raise SamsungCalendarQaError("missing or duplicate lifecycle UID")
        result[uid.value] = event
    return result


def audit_lifecycle_fixtures(fixtures: Mapping[str, bytes]) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    checks.append(_check("stage_set", set(fixtures) == set(STAGES), expected=list(STAGES), actual=sorted(fixtures)))
    audits = {stage: audit_ics_bytes(fixtures[stage], expected_event_count={"initial": 2, "updated": 3, "cancelled": 3}[stage]) for stage in STAGES}
    checks.append(_check("stage_ics_conformance", all(row["status"] == "pass" for row in audits.values()), expected="all pass", actual={k: v["status"] for k, v in audits.items()}))
    maps = {stage: _event_map(fixtures[stage]) for stage in STAGES}
    uid_a = "evt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@noticepilot.local"
    uid_c = "evt_cccccccccccccccccccccccccccccccc@noticepilot.local"
    stable = all(uid_a in maps[stage] for stage in STAGES)
    checks.append(_check("stable_uid_across_update_cancel", stable, expected=uid_a))
    sequences = [int(maps[stage][uid_a].one("SEQUENCE").value) for stage in STAGES]
    checks.append(_check("monotonic_sequence", sequences == [0, 1, 2], expected=[0, 1, 2], actual=sequences))
    checks.append(_check("new_event_reflected", uid_c not in maps["initial"] and uid_c in maps["updated"] and uid_c in maps["cancelled"], expected="absent→present→present"))
    cancelled_status = maps["cancelled"][uid_a].one("STATUS").value
    checks.append(_check("cancelled_status_same_uid", cancelled_status == "CANCELLED", expected="CANCELLED", actual=cancelled_status))
    initial_end = maps["initial"][uid_a].one("DTEND").value
    updated_end = maps["updated"][uid_a].one("DTEND").value
    checks.append(_check("inclusive_end_extension_projection", initial_end == "20260804" and updated_end == "20260806", expected=["20260804", "20260806"], actual=[initial_end, updated_end]))
    status = "pass" if all(row["status"] == "pass" for row in checks) else "fail"
    return {"status": status, "checks": checks, "stageAudits": audits}


def physical_report_template() -> dict[str, Any]:
    core_checks = [
        "subscription_not_static_import",
        "initial_all_day_dates",
        "initial_timed_asia_seoul",
        "utf8_korean_rendering",
        "new_event_refresh",
        "update_same_uid_no_duplicate",
        "cancellation_same_uid_handling",
    ]
    return {
        "schemaVersion": PHYSICAL_REPORT_SCHEMA_VERSION,
        "resultStatus": "pending",
        "device": {
            "manufacturer": "Samsung",
            "model": None,
            "androidVersion": None,
            "oneUiVersion": None,
        },
        "calendarApp": {"name": "Samsung Calendar", "version": None},
        "subscription": {
            "mechanism": None,
            "urlAccepted": None,
            "staticImportOnly": None,
            "observedRefreshLatencySeconds": None,
        },
        "checks": [{"checkId": check_id, "status": "pending", "evidence": None} for check_id in core_checks],
        "requestLogPath": "runtime/s30-v1/physical-qa/request-log.jsonl",
        "notes": [],
        "completedAt": None,
    }


def validate_physical_report(report: Mapping[str, Any]) -> list[str]:
    errors: list[str] = []
    if report.get("schemaVersion") != PHYSICAL_REPORT_SCHEMA_VERSION:
        errors.append("schemaVersion mismatch")
    if report.get("resultStatus") != "pass":
        errors.append("resultStatus must be pass")
    device = report.get("device") or {}
    if str(device.get("manufacturer") or "").lower() != "samsung":
        errors.append("manufacturer must be Samsung")
    for key in ("model", "androidVersion", "oneUiVersion"):
        if not device.get(key):
            errors.append(f"device.{key} is required")
    app = report.get("calendarApp") or {}
    if app.get("name") != "Samsung Calendar" or not app.get("version"):
        errors.append("Samsung Calendar name/version are required")
    subscription = report.get("subscription") or {}
    mechanism = subscription.get("mechanism")
    if mechanism not in {"direct_url", "polling_calendar_account"}:
        errors.append("subscription mechanism must poll the same URL; static import is not accepted")
    if subscription.get("urlAccepted") is not True or subscription.get("staticImportOnly") is not False:
        errors.append("URL subscription must be accepted and must not be static import only")
    expected_ids = {
        "subscription_not_static_import",
        "initial_all_day_dates",
        "initial_timed_asia_seoul",
        "utf8_korean_rendering",
        "new_event_refresh",
        "update_same_uid_no_duplicate",
        "cancellation_same_uid_handling",
    }
    checks = report.get("checks") or []
    by_id = {row.get("checkId"): row for row in checks if isinstance(row, Mapping)}
    if set(by_id) != expected_ids:
        errors.append("physical check set mismatch")
    for check_id in sorted(expected_ids):
        row = by_id.get(check_id) or {}
        if row.get("status") != "pass" or not row.get("evidence"):
            errors.append(f"{check_id} must pass with evidence")
    if not report.get("completedAt"):
        errors.append("completedAt is required")
    return errors


def build_automated_qa(root: Path, output_dir: Path, *, generated_at: str = "2026-07-13T21:30:00+09:00") -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    fixture_dir = output_dir / "fixtures"
    fixture_dir.mkdir(parents=True, exist_ok=True)

    bundle = build_foundation_bootstrap_bundle(root)
    store = InMemoryPostgresReferenceStore()
    store.bootstrap(bundle)
    service = SubscriptionFeedDeliveryService(store)
    snapshots = {row["profile_id"]: row for row in store.rows("feed_snapshot")}
    heads = {row["profile_id"]: row for row in store.rows("subscription_profile_head")}
    profiles = sorted(heads, key=lambda pid: snapshots[pid]["event_count"])
    audits: dict[str, Any] = {}
    reference_meta: dict[str, Any] = {}
    for profile_id in profiles:
        snapshot = snapshots[profile_id]
        event_count = snapshot["event_count"]
        scope = "job_application" if event_count == 299 else "student_default"
        token_char = "J" if scope == "job_application" else "S"
        feed_digit = "2" if scope == "job_application" else "1"
        provisioned = service.provision_feed(
            profile_id=profile_id,
            snapshot_id=snapshot["snapshot_id"],
            calendar_name="NoticePilot 채용 접수 일정" if scope == "job_application" else "NoticePilot 학생 일정",
            now=generated_at,
            feed_id_factory=lambda d=feed_digit: "feed_" + d * 32,
            token_factory=lambda c=token_char: c * 43,
        )
        response = service.render_feed(provisioned.feed_id, provisioned.raw_token)
        audit = audit_http_response(response.status_code, dict(response.headers), response.body, expected_event_count=event_count)
        first_etag = dict(response.headers)["ETag"]
        not_modified = service.render_feed(provisioned.feed_id, provisioned.raw_token, if_none_match=first_etag)
        audit["conditionalGet"] = {
            "status": "pass" if not_modified.status_code == 304 and not not_modified.body else "fail",
            "statusCode": not_modified.status_code,
            "bodyLength": len(not_modified.body),
        }
        if audit["conditionalGet"]["status"] != "pass":
            audit["status"] = "fail"
        audits[scope] = audit
        reference_meta[scope] = {
            "eventCount": event_count,
            "bodySha256": sha256_bytes(response.body),
            "etag": first_etag,
            "snapshotId": snapshot["snapshot_id"],
        }

    fixtures = build_lifecycle_fixtures()
    for stage, body in fixtures.items():
        (fixture_dir / f"{stage}.ics").write_bytes(body)
    (output_dir / "active-stage.txt").write_text("initial\n", encoding="utf-8")
    lifecycle = audit_lifecycle_fixtures(fixtures)
    template = physical_report_template()
    write_json(output_dir / "samsung-physical-qa-result.template.json", template)

    automated_pass = all(row["status"] == "pass" for row in audits.values()) and lifecycle["status"] == "pass"
    report = {
        "schemaVersion": QA_SCHEMA_VERSION,
        "qaVersion": QA_VERSION,
        "generatedAt": generated_at,
        "automatedStatus": "pass" if automated_pass else "fail",
        "physicalClientStatus": "pending",
        "s30Completed": False,
        "referenceFeedAudits": audits,
        "referenceFeeds": reference_meta,
        "lifecycleFixtureAudit": lifecycle,
        "physicalQa": {
            "required": True,
            "template": "samsung-physical-qa-result.template.json",
            "resultPath": "physical-qa/samsung-physical-qa-result.json",
            "qaPath": QA_PATH,
            "staticImportAcceptedAsSubscription": False,
        },
    }
    report_no_hash = json.loads(json.dumps(report, ensure_ascii=False))
    report["reportSha256"] = hashlib.sha256(json.dumps(report_no_hash, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    write_json(output_dir / "automated-qa-report.json", report)

    artifact_paths = [
        "automated-qa-report.json",
        "active-stage.txt",
        "samsung-physical-qa-result.template.json",
        *[f"fixtures/{stage}.ics" for stage in STAGES],
    ]
    manifest = {
        "schemaVersion": QA_MANIFEST_SCHEMA_VERSION,
        "qaVersion": QA_VERSION,
        "createdAt": generated_at,
        "status": "automated_pass_physical_pending" if automated_pass else "automated_fail",
        "s30Completed": False,
        "artifacts": {path: {"path": path, "sha256": file_sha256(output_dir / path)} for path in artifact_paths},
        "automatedReportSha256": report["reportSha256"],
        "physicalQaRequired": True,
    }
    manifest_without_hash = json.loads(json.dumps(manifest, ensure_ascii=False))
    manifest["manifestHash"] = hashlib.sha256(json.dumps(manifest_without_hash, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    write_json(output_dir / "manifest.json", manifest)
    return report
