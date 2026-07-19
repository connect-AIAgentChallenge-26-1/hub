#!/usr/bin/env python3
"""Audit S27-D persistent UID ICS projection against the S27-C registry."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from noticepilot_registry_ics_projector import (
    FEEDS,
    FEED_REPORT_SCHEMA_VERSION,
    MIGRATION_MODE,
    OUTBOX_RECEIPT_SCHEMA_VERSION,
    PROJECTION_ID,
    PROJECTION_SCHEMA_VERSION,
    UID_MAP_SCHEMA_VERSION,
    file_sha256,
    persistent_uid,
    projection_content_digest,
    read_jsonl,
    unfold_ical_lines,
    validate_registry_for_projection,
    load_registry,
)

SCHEMA_VERSION = "noticepilot.s27dIcsProjectionAudit.v0.1"


def relative(path: Path, base: Path) -> str:
    return os.path.relpath(path.resolve(), base.resolve()).replace(os.sep, "/")


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_events(text: str) -> list[list[str]]:
    events: list[list[str]] = []
    current: list[str] | None = None
    for line in unfold_ical_lines(text):
        if line == "BEGIN:VEVENT":
            if current is not None:
                raise ValueError("nested VEVENT")
            current = []
        elif line == "END:VEVENT":
            if current is None:
                raise ValueError("VEVENT end without begin")
            events.append(current)
            current = None
        elif current is not None:
            current.append(line)
    if current is not None:
        raise ValueError("unterminated VEVENT")
    return events


def props(lines: list[str]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = defaultdict(list)
    for line in lines:
        if ":" not in line:
            continue
        name, value = line.split(":", 1)
        result[name].append(value)
    return result


def single(p: dict[str, list[str]], name: str) -> str | None:
    values = p.get(name) or []
    return values[0] if len(values) == 1 else None


def run_layered_compare(current: Path, output: Path) -> tuple[int, dict[str, Any]]:
    cmd = [
        sys.executable,
        str(ROOT / "tools" / "compare_layered_baseline.py"),
        "--baseline", str(ROOT / "baseline" / "layered-s26-v1"),
        "--current", str(current),
        "--output", str(output),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    report = json.loads(output.read_text(encoding="utf-8")) if output.exists() else {"result": "error", "stderr": result.stderr}
    return result.returncode, report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--current", default=str(ROOT / "derived" / "mvp-policy-v0.1"))
    parser.add_argument("--registry", default=str(ROOT / "registry" / "s27c-v1"))
    parser.add_argument("--projection", default=str(ROOT / "projection" / "s27d-v1"))
    parser.add_argument("--output-dir", default=str(ROOT / "derived" / "mvp-policy-v0.1" / "reports" / "s27d-ics-projection"))
    args = parser.parse_args()

    current = Path(args.current).resolve()
    registry = Path(args.registry).resolve()
    projection = Path(args.projection).resolve()
    out = Path(args.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    report_path = out / "s27d-ics-projection-audit.json"
    semantic_diff_path = out / "s27d-active-projection-semantic-diff.json"
    layered_path = out / "s27d-layered-baseline-diff.json"

    manifest = json.loads((projection / "manifest.json").read_text(encoding="utf-8"))
    registry_data = load_registry(registry)
    registry_errors = validate_registry_for_projection(registry_data)
    active = read_jsonl(projection / "active-calendar-event-projections.jsonl")
    uid_map = read_jsonl(projection / "legacy-candidate-uid-cutover-map.jsonl")
    receipts = read_jsonl(projection / "outbox-consumption-receipts.jsonl")
    events_by_id = {row["calendarEventId"]: row for row in registry_data["events"]}
    active_by_id = {row["calendarEventId"]: row for row in active}
    assignments_by_candidate = {row["candidateId"]: row for row in registry_data["assignments"]}
    outbox_by_id = {row["outboxId"]: row for row in registry_data["outbox"]}
    links_by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in registry_data["links"]:
        links_by_event[row["calendarEventId"]].append(row)

    manifest_hash_errors = []
    for key, entry in manifest.get("artifacts", {}).items():
        path = projection / entry["path"]
        actual = file_sha256(path) if path.exists() else None
        if actual != entry.get("sha256"):
            manifest_hash_errors.append({"artifact": key, "expected": entry.get("sha256"), "actual": actual})
    for feed_scope, feed in manifest.get("feeds", {}).items():
        for kind in ("ics", "report"):
            entry = feed[kind]
            path = projection / entry["path"]
            actual = file_sha256(path) if path.exists() else None
            if actual != entry.get("sha256"):
                manifest_hash_errors.append({"artifact": f"feeds.{feed_scope}.{kind}", "expected": entry.get("sha256"), "actual": actual})

    source_registry_hash_matches = file_sha256(registry / "manifest.json") == manifest["sourceRegistry"]["manifestSha256"]
    legacy_hash_errors = []
    for feed_scope, artifacts in manifest.get("legacyArtifacts", {}).items():
        for kind, entry in artifacts.items():
            path = (projection / entry["path"]).resolve()
            actual = file_sha256(path) if path.exists() else None
            if actual != entry.get("sha256"):
                legacy_hash_errors.append({"feedScope": feed_scope, "artifact": kind, "expected": entry.get("sha256"), "actual": actual})

    semantic_changes: list[dict[str, Any]] = []
    for event_id, event in events_by_id.items():
        row = active_by_id.get(event_id)
        if not row:
            semantic_changes.append({"calendarEventId": event_id, "error": "missing_active_projection"})
            continue
        expected = {
            "uid": persistent_uid(event_id),
            "sequence": event["sequence"],
            "revisionNumber": event["revisionNumber"],
            "relationBasis": event["relationBasis"],
            "canonicalCandidateId": event["canonicalCandidateId"],
            "projection": event["projection"],
            "sourceCandidateIds": event["sourceCandidateIds"],
            "sourceNoticeIds": event["sourceNoticeIds"],
        }
        for field, value in expected.items():
            if row.get(field) != value:
                semantic_changes.append({"calendarEventId": event_id, "field": field, "expected": value, "actual": row.get(field)})
    write_json(semantic_diff_path, {
        "schemaVersion": "noticepilot.s27dActiveProjectionSemanticDiff.v0.1",
        "result": "match" if not semantic_changes else "different",
        "changeCount": len(semantic_changes),
        "changes": semantic_changes[:100],
    })

    uid_map_by_candidate = {row["candidateId"]: row for row in uid_map}
    uid_map_errors = []
    if set(uid_map_by_candidate) != set(assignments_by_candidate):
        uid_map_errors.append({"error": "candidate_coverage_mismatch"})
    for candidate_id, assignment in assignments_by_candidate.items():
        row = uid_map_by_candidate.get(candidate_id)
        if not row:
            continue
        if row["calendarEventId"] != assignment["calendarEventId"]:
            uid_map_errors.append({"candidateId": candidate_id, "error": "event_assignment_mismatch"})
        if row["persistentUid"] != persistent_uid(assignment["calendarEventId"]):
            uid_map_errors.append({"candidateId": candidate_id, "error": "persistent_uid_mismatch"})
        if row.get("legacyCancellationTombstoneEmitted"):
            uid_map_errors.append({"candidateId": candidate_id, "error": "unexpected_legacy_tombstone"})

    receipt_by_outbox = {row["outboxId"]: row for row in receipts}
    receipt_errors = []
    if set(receipt_by_outbox) != set(outbox_by_id):
        receipt_errors.append({"error": "outbox_coverage_mismatch"})
    for outbox_id, intent in outbox_by_id.items():
        row = receipt_by_outbox.get(outbox_id)
        if not row:
            continue
        if row.get("calendarEventId") != intent.get("calendarEventId") or row.get("status") != "consumed" or row.get("icsSerialized") is not True:
            receipt_errors.append({"outboxId": outbox_id, "error": "invalid_receipt"})

    feed_checks: dict[str, Any] = {}
    feed_errors: list[dict[str, Any]] = []
    all_ics_uids: set[str] = set()
    source_url_line_count = 0
    timed_without_end_observed = 0
    sequence_one_uids: list[str] = []
    for feed_scope, cfg in FEEDS.items():
        feed_dir = projection / "feeds" / feed_scope
        ics_path = feed_dir / cfg["filename"]
        report = json.loads((feed_dir / "ics-projection-report.json").read_text(encoding="utf-8"))
        raw = ics_path.read_bytes()
        text = raw.decode("utf-8")
        physical_lines = raw.split(b"\r\n")
        overlong = [len(line) for line in physical_lines if len(line) > 75]
        parsed = parse_events(text)
        event_props = [props(lines) for lines in parsed]
        uids = [single(p, "UID") for p in event_props]
        expected_events = [row for row in active if feed_scope in row["feedScopes"]]
        expected_uids = {row["uid"] for row in expected_events}
        duplicate_uids = len(uids) - len(set(uids))
        if set(uids) != expected_uids:
            feed_errors.append({"feedScope": feed_scope, "error": "uid_set_mismatch"})
        if duplicate_uids:
            feed_errors.append({"feedScope": feed_scope, "error": "duplicate_uid", "count": duplicate_uids})
        if any(uid and uid.startswith("noticepilot-cand-") for uid in uids):
            feed_errors.append({"feedScope": feed_scope, "error": "legacy_candidate_uid_present"})
        if not raw.startswith(b"BEGIN:VCALENDAR\r\n") or not raw.endswith(b"END:VCALENDAR\r\n"):
            feed_errors.append({"feedScope": feed_scope, "error": "invalid_crlf_boundary"})
        if overlong:
            feed_errors.append({"feedScope": feed_scope, "error": "line_exceeds_75_octets", "max": max(overlong)})
        for p in event_props:
            uid = single(p, "UID")
            if single(p, "STATUS") != "CONFIRMED":
                feed_errors.append({"feedScope": feed_scope, "uid": uid, "error": "nonconfirmed_active_event"})
            seq = single(p, "SEQUENCE")
            if seq == "1":
                sequence_one_uids.append(uid)
            source_url_line_count += len(p.get("X-NOTICEPILOT-SOURCE-URL") or [])
            timed = bool(p.get(f"DTSTART;TZID=Asia/Seoul"))
            if timed and not p.get(f"DTEND;TZID=Asia/Seoul"):
                timed_without_end_observed += 1
            if p.get("DTSTART;VALUE=DATE"):
                start = date.fromisoformat(f"{p['DTSTART;VALUE=DATE'][0][0:4]}-{p['DTSTART;VALUE=DATE'][0][4:6]}-{p['DTSTART;VALUE=DATE'][0][6:8]}")
                end_raw = (p.get("DTEND;VALUE=DATE") or [None])[0]
                if not end_raw:
                    feed_errors.append({"feedScope": feed_scope, "uid": uid, "error": "all_day_missing_dtend"})
                else:
                    end = date.fromisoformat(f"{end_raw[0:4]}-{end_raw[4:6]}-{end_raw[6:8]}")
                    if end <= start:
                        feed_errors.append({"feedScope": feed_scope, "uid": uid, "error": "nonexclusive_all_day_dtend"})
        all_ics_uids.update(uid for uid in uids if uid)
        feed_checks[feed_scope] = {
            "eventCount": len(parsed),
            "expectedEventCount": len(expected_events),
            "uniqueUidCount": len(set(uids)),
            "legacyEventCount": report.get("legacyEventCount"),
            "eventCountDelta": report.get("eventCountDelta"),
            "lineOver75OctetCount": len(overlong),
            "crlfValid": raw.startswith(b"BEGIN:VCALENDAR\r\n") and raw.endswith(b"END:VCALENDAR\r\n"),
        }

    relation_counts = Counter(row["relationBasis"] for row in active)
    disposition_counts = Counter(row["disposition"] for row in uid_map)
    layered_code, layered = run_layered_compare(current, layered_path)

    checks = {
        "calendarEventCount": len(active),
        "uniquePersistentUidCount": len({row["uid"] for row in active}),
        "legacyCandidateUidMapCount": len(uid_map),
        "legacyUniqueUidCount": len({row["legacyUid"] for row in uid_map}),
        "outboxIntentCount": len(registry_data["outbox"]),
        "outboxConsumptionReceiptCount": len(receipts),
        "legacyCancellationTombstoneCount": sum(row.get("legacyCancellationTombstoneEmitted", False) for row in uid_map),
        "singletonEventCount": relation_counts["singleton"],
        "duplicateEventCount": relation_counts["duplicate"],
        "extensionEventCount": relation_counts["extension"],
        "sequenceOneEventCount": sum(row["sequence"] == 1 for row in active),
        "sourceUrlLineCountAcrossFeeds": source_url_line_count,
        "timedWithoutEndExpectedCount": sum(not row["projection"]["isAllDay"] and not row["projection"].get("normalizedEnd") for row in active),
        "timedWithoutEndObservedCount": timed_without_end_observed,
        "manifestHashErrorCount": len(manifest_hash_errors),
        "legacyArtifactHashErrorCount": len(legacy_hash_errors),
        "sourceRegistryManifestHashMatches": source_registry_hash_matches,
        "registryValidationErrorCount": len(registry_errors),
        "activeProjectionSemanticChangeCount": len(semantic_changes),
        "uidMapErrorCount": len(uid_map_errors),
        "outboxReceiptErrorCount": len(receipt_errors),
        "feedErrorCount": len(feed_errors),
        "projectionContentDigestMatches": manifest.get("contentDigest") == projection_content_digest(projection),
        "allIcsUidCount": len(all_ics_uids),
        "sequenceOneUids": sequence_one_uids,
        "uidDispositionCounts": dict(sorted(disposition_counts.items())),
        "layeredBaselineResult": layered.get("result"),
        "layeredBaselineChangeCount": layered.get("changeCount"),
    }

    expected_feed_counts = {"student_default": 601, "job_application": 299}
    pass_conditions = [
        manifest.get("schemaVersion") == PROJECTION_SCHEMA_VERSION,
        manifest.get("projectionId") == PROJECTION_ID,
        manifest.get("migrationMode") == MIGRATION_MODE,
        manifest.get("uidPolicy", {}).get("legacyCancellationTombstonesEmitted") is False,
        len(active) == 900,
        len(active_by_id) == 900,
        len({row["uid"] for row in active}) == 900,
        len(uid_map) == 909,
        len({row["legacyUid"] for row in uid_map}) == 909,
        len(receipts) == 900,
        relation_counts == Counter({"singleton": 891, "duplicate": 8, "extension": 1}),
        sum(row["sequence"] == 1 for row in active) == 1,
        source_url_line_count == 909,
        timed_without_end_observed == 155,
        not registry_errors,
        not manifest_hash_errors,
        not legacy_hash_errors,
        source_registry_hash_matches,
        not semantic_changes,
        not uid_map_errors,
        not receipt_errors,
        not feed_errors,
        manifest.get("contentDigest") == projection_content_digest(projection),
        all(feed_checks[scope]["eventCount"] == count for scope, count in expected_feed_counts.items()),
        layered_code == 0,
        layered.get("result") == "match",
        layered.get("changeCount") == 0,
        all(row.get("schemaVersion") == UID_MAP_SCHEMA_VERSION for row in uid_map),
        all(row.get("schemaVersion") == OUTBOX_RECEIPT_SCHEMA_VERSION for row in receipts),
        all(json.loads((projection / "feeds" / scope / "ics-projection-report.json").read_text())["schemaVersion"] == FEED_REPORT_SCHEMA_VERSION for scope in FEEDS),
    ]

    report = {
        "schemaVersion": SCHEMA_VERSION,
        "result": "pass" if all(pass_conditions) else "fail",
        "projectionId": manifest.get("projectionId"),
        "projectorVersion": manifest.get("projectorVersion"),
        "migrationMode": manifest.get("migrationMode"),
        "currentDir": relative(current, report_path.parent),
        "registryDir": relative(registry, report_path.parent),
        "projectionDir": relative(projection, report_path.parent),
        "pathReferences": {"base": "audit_report_directory", "format": "posix_relative"},
        "scope": {
            "persistentCalendarEventUidProjectionExecuted": True,
            "s27cOutboxConsumedViaImmutableReceiptLedger": True,
            "legacyCandidateUidCancellationTombstonesEmitted": False,
            "legacyCandidateUidArtifactsModified": False,
            "s27cRegistryModified": False,
            "subscriptionEndpointImplemented": False,
            "calendarClientPhysicalQaPerformed": False,
        },
        "checks": checks,
        "feeds": feed_checks,
        "artifacts": {
            "projectionManifest": relative(projection / "manifest.json", report_path.parent),
            "activeProjectionSemanticDiff": relative(semantic_diff_path, report_path.parent),
            "layeredBaselineDiff": relative(layered_path, report_path.parent),
        },
        "samples": {
            "manifestHashErrors": manifest_hash_errors[:20],
            "legacyArtifactHashErrors": legacy_hash_errors[:20],
            "registryErrors": registry_errors[:20],
            "uidMapErrors": uid_map_errors[:20],
            "receiptErrors": receipt_errors[:20],
            "feedErrors": feed_errors[:20],
            "semanticChanges": semantic_changes[:20],
        },
    }
    write_json(report_path, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["result"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
