#!/usr/bin/env python3
"""Audit the S27-C opaque CalendarEvent registry against current S27-B outputs."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from noticepilot_calendar_event_registry import (
    EVENT_SCHEMA_VERSION,
    ID_STRATEGY,
    MANIFEST_SCHEMA_VERSION,
    REGISTRY_ID,
    file_sha256,
    registry_content_digest,
    validate_registry_artifacts,
)

SCHEMA_VERSION = "noticepilot.s27cCalendarEventRegistryAudit.v0.1"
FILES = {
    "events": "calendar-events.jsonl",
    "sourceLinks": "calendar-event-source-links.jsonl",
    "revisions": "calendar-event-revisions.jsonl",
    "assignments": "candidate-event-assignments.jsonl",
    "relationDecisions": "relation-decisions.jsonl",
    "promotionDecisions": "promotion-decisions.jsonl",
    "outbox": "projection-outbox-intents.jsonl",
}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def relative(path: Path, base: Path) -> str:
    return Path(os.path.relpath(path.resolve(), start=base.resolve())).as_posix()


def run_layered_compare(current: Path, output: Path) -> tuple[int, dict[str, Any]]:
    result = subprocess.run(
        [
            "python3", str(ROOT / "tools" / "compare_layered_baseline.py"),
            "--baseline", str(ROOT / "baseline" / "layered-s26-v1"),
            "--current", str(current),
            "--output", str(output),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode, read_json(output) if output.exists() else {}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--registry", type=Path, default=ROOT / "registry" / "s27c-v1")
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()

    current = args.current.resolve()
    registry = args.registry.resolve()
    output_dir = (args.output_dir or current / "reports" / "s27c-calendar-event-registry").resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / "s27c-calendar-event-registry-audit.json"
    diff_path = output_dir / "registry-semantic-diff.json"
    layered_path = output_dir / "layered-baseline-no-change-diff.json"

    manifest = read_json(registry / "manifest.json")
    artifacts = {key: read_jsonl(registry / filename) for key, filename in FILES.items()}
    validation_errors: list[str] = []
    try:
        validate_registry_artifacts(artifacts, expected_candidate_count=909)
    except Exception as exc:  # audit must report, not hide, contract failures
        validation_errors.append(str(exc))

    s27b = current / "reports" / "s27b-cross-notice"
    views = read_jsonl(s27b / "reconciliation-candidate-views.jsonl")
    current_decisions = read_jsonl(s27b / "relation-decisions.jsonl")
    plans = read_jsonl(s27b / "merge-plans.jsonl")
    approved_plans = [row for row in plans if row.get("status") == "approved"]
    views_by_id = {row["candidateId"]: row for row in views}
    assignments = list(artifacts["assignments"])
    events = list(artifacts["events"])
    links = list(artifacts["sourceLinks"])
    revisions = list(artifacts["revisions"])
    persisted_decisions = list(artifacts["relationDecisions"])
    promotions = list(artifacts["promotionDecisions"])
    outbox = list(artifacts["outbox"])

    assignments_by_candidate = {row["candidateId"]: row for row in assignments}
    events_by_id = {row["calendarEventId"]: row for row in events}
    links_by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    revisions_by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in links:
        links_by_event[row["calendarEventId"]].append(row)
    for row in revisions:
        revisions_by_event[row["calendarEventId"]].append(row)

    differences: list[dict[str, Any]] = []
    if set(assignments_by_candidate) != set(views_by_id):
        differences.append({
            "path": "candidateAssignments",
            "expectedCandidateIds": sorted(set(views_by_id) - set(assignments_by_candidate))[:20],
            "unexpectedCandidateIds": sorted(set(assignments_by_candidate) - set(views_by_id))[:20],
        })

    for candidate_id, assignment in assignments_by_candidate.items():
        view = views_by_id.get(candidate_id)
        if view is None:
            continue
        event = events_by_id.get(assignment["calendarEventId"])
        if event is None:
            differences.append({"path": f"assignments.{candidate_id}.calendarEventId", "error": "event_not_found"})
            continue
        matching_links = [row for row in links_by_event[event["calendarEventId"]] if row["sourceCandidateId"] == candidate_id]
        if len(matching_links) != 1:
            differences.append({"path": f"sourceLinks.{candidate_id}", "error": "expected_exactly_one_link"})
        else:
            link = matching_links[0]
            identity = view["sourceIdentity"]
            for key in ["sourceNoticeId", "publishedAt"]:
                expected = view[key]
                actual = link[key]
                if actual != expected:
                    differences.append({"path": f"sourceLinks.{candidate_id}.{key}", "expected": expected, "actual": actual})
            for key in ["observedSourceUrl", "canonicalSourceUrl"]:
                expected = identity[key]
                actual = link[key]
                if actual != expected:
                    differences.append({"path": f"sourceLinks.{candidate_id}.{key}", "expected": expected, "actual": actual})
            if link["sourceIdentity"] != identity:
                differences.append({"path": f"sourceLinks.{candidate_id}.sourceIdentity", "error": "identity_mismatch"})

    for plan in approved_plans:
        member_ids = plan["memberCandidateIds"]
        assigned_event_ids = {assignments_by_candidate[candidate_id]["calendarEventId"] for candidate_id in member_ids}
        if len(assigned_event_ids) != 1:
            differences.append({"path": f"mergePlans.{plan['decisionPairIds']}", "error": "members_do_not_share_event"})
            continue
        event = events_by_id[next(iter(assigned_event_ids))]
        if event["canonicalCandidateId"] != plan["canonicalCandidateId"]:
            differences.append({
                "path": f"events.{event['calendarEventId']}.canonicalCandidateId",
                "expected": plan["canonicalCandidateId"],
                "actual": event["canonicalCandidateId"],
            })
        if event["projection"] != views_by_id[plan["canonicalCandidateId"]]["eventProjection"]:
            differences.append({"path": f"events.{event['calendarEventId']}.projection", "error": "canonical_projection_mismatch"})

    current_decisions_by_pair = {row["pairId"]: row for row in current_decisions}
    persisted_by_pair = {row["pairId"]: row for row in persisted_decisions}
    if set(current_decisions_by_pair) != set(persisted_by_pair):
        differences.append({"path": "relationDecisions", "error": "pair_set_mismatch"})
    for pair_id, decision in current_decisions_by_pair.items():
        persisted = persisted_by_pair.get(pair_id)
        if not persisted:
            continue
        for key in ["relation", "decisionStatus", "mergeAllowed"]:
            if persisted[key] != decision[key]:
                differences.append({"path": f"relationDecisions.{pair_id}.{key}", "expected": decision[key], "actual": persisted[key]})
        expected_event_ids = sorted({assignments_by_candidate[candidate_id]["calendarEventId"] for candidate_id in decision["candidateIds"]})
        if persisted["calendarEventIds"] != expected_event_ids:
            differences.append({"path": f"relationDecisions.{pair_id}.calendarEventIds", "error": "assignment_mismatch"})
        expected_merge = decision["relation"] in {"duplicate", "extension"} and decision["mergeAllowed"]
        if persisted["mergeApplied"] != expected_merge:
            differences.append({"path": f"relationDecisions.{pair_id}.mergeApplied", "expected": expected_merge, "actual": persisted["mergeApplied"]})

    extension_events = [row for row in events if row["relationBasis"] == "extension"]
    duplicate_events = [row for row in events if row["relationBasis"] == "duplicate"]
    singleton_events = [row for row in events if row["relationBasis"] == "singleton"]
    extension_history_valid = False
    if len(extension_events) == 1:
        extension = extension_events[0]
        history = sorted(revisions_by_event[extension["calendarEventId"]], key=lambda row: row["revisionNumber"])
        if len(history) == 2:
            first_end = history[0]["projection"]["normalizedEnd"]
            second_end = history[1]["projection"]["normalizedEnd"]
            extension_history_valid = (
                history[0]["sequence"] == 0
                and history[1]["sequence"] == 1
                and not history[0]["active"]
                and history[1]["active"]
                and history[1]["previousRevisionId"] == history[0]["revisionId"]
                and first_end < second_end
                and extension["sequence"] == 1
            )
    if not extension_history_valid:
        differences.append({"path": "extensionRevisionHistory", "error": "invalid_or_missing"})

    manifest_hash_errors: list[dict[str, Any]] = []
    manifest_count_errors: list[dict[str, Any]] = []
    for key, entry in manifest.get("artifacts", {}).items():
        path = registry / entry["path"]
        actual = file_sha256(path) if path.exists() else None
        if actual != entry["sha256"]:
            manifest_hash_errors.append({"artifact": key, "expected": entry["sha256"], "actual": actual})
    upstream_hash_errors: list[dict[str, Any]] = []
    upstream_files = {
        "s27bAudit": s27b / "s27b-cross-notice-reconciler-audit.json",
        "reconciliationCandidateViews": s27b / "reconciliation-candidate-views.jsonl",
        "relationDecisions": s27b / "relation-decisions.jsonl",
        "mergePlans": s27b / "merge-plans.jsonl",
    }
    for key, path in upstream_files.items():
        expected = (manifest.get("upstream", {}).get(key) or {}).get("sha256")
        actual = file_sha256(path)
        if expected != actual:
            upstream_hash_errors.append({"artifact": key, "expected": expected, "actual": actual})

    expected_manifest_counts = {
        "publishableCandidateCount": len(views),
        "calendarEventCount": len(events),
        "candidateAssignmentCount": len(assignments),
        "sourceLinkCount": len(links),
        "revisionCount": len(revisions),
        "relationDecisionCount": len(persisted_decisions),
        "promotionDecisionCount": len(promotions),
        "outboxIntentCount": len(outbox),
        "singletonEventCount": len(singleton_events),
        "duplicateEventCount": len(duplicate_events),
        "extensionEventCount": len(extension_events),
        "approvedMergePlanCount": len(approved_plans),
        "activeRevisionCount": sum(row["active"] for row in revisions),
        "icsUidMigrationCount": 0,
    }
    for key, expected in expected_manifest_counts.items():
        actual = (manifest.get("counts") or {}).get(key)
        if actual != expected:
            manifest_count_errors.append({"field": key, "expected": expected, "actual": actual})
    content_digest_matches = manifest.get("contentDigest") == registry_content_digest(artifacts)

    write_json(diff_path, {
        "schemaVersion": "noticepilot.s27cRegistrySemanticDiff.v0.1",
        "result": "match" if not differences else "different",
        "changeCount": len(differences),
        "changes": differences,
    })
    compare_code, layered = run_layered_compare(current, layered_path)

    relation_counts = Counter(row["relation"] for row in persisted_decisions)
    assignment_event_counts = Counter(row["calendarEventId"] for row in assignments)
    checks = {
        "publishableCandidateCount": len(views),
        "calendarEventCount": len(events),
        "uniqueCalendarEventIdCount": len(events_by_id),
        "candidateAssignmentCount": len(assignments),
        "uniqueAssignedCandidateCount": len(assignments_by_candidate),
        "sourceLinkCount": len(links),
        "revisionCount": len(revisions),
        "activeRevisionCount": sum(row["active"] for row in revisions),
        "promotionDecisionCount": len(promotions),
        "persistedRelationDecisionCount": len(persisted_decisions),
        "projectionOutboxIntentCount": len(outbox),
        "singletonEventCount": len(singleton_events),
        "duplicateEventCount": len(duplicate_events),
        "extensionEventCount": len(extension_events),
        "twoCandidateEventCount": sum(count == 2 for count in assignment_event_counts.values()),
        "oneCandidateEventCount": sum(count == 1 for count in assignment_event_counts.values()),
        "approvedMergePlanCount": len(approved_plans),
        "mergeAppliedDecisionCount": sum(row["mergeApplied"] for row in persisted_decisions),
        "needsReviewRelationCount": relation_counts["needs_review"],
        "needsReviewMergeAppliedCount": sum(row["relation"] == "needs_review" and row["mergeApplied"] for row in persisted_decisions),
        "extensionHistoryValid": extension_history_valid,
        "registryValidationErrorCount": len(validation_errors),
        "manifestHashErrorCount": len(manifest_hash_errors),
        "manifestCountErrorCount": len(manifest_count_errors),
        "contentDigestMatches": content_digest_matches,
        "upstreamHashErrorCount": len(upstream_hash_errors),
        "registrySemanticDiffResult": "match" if not differences else "different",
        "registrySemanticChangeCount": len(differences),
        "layeredBaselineResult": layered.get("result"),
        "layeredBaselineChangeCount": layered.get("changeCount"),
        "icsUidMigrationCount": sum(row.get("icsUidMigrationPerformed", False) for row in events),
        "outboxConsumedCount": sum(row.get("icsSerialized", False) for row in outbox),
    }

    pass_conditions = [
        manifest.get("schemaVersion") == MANIFEST_SCHEMA_VERSION,
        manifest.get("registryId") == REGISTRY_ID,
        manifest.get("idStrategy") == ID_STRATEGY,
        len(views) == 909,
        len(events) == 900,
        len(events_by_id) == 900,
        len(assignments) == 909,
        len(assignments_by_candidate) == 909,
        len(links) == 909,
        len(revisions) == 901,
        sum(row["active"] for row in revisions) == 900,
        len(promotions) == 900,
        len(persisted_decisions) == 343,
        len(outbox) == 900,
        len(singleton_events) == 891,
        len(duplicate_events) == 8,
        len(extension_events) == 1,
        sum(count == 2 for count in assignment_event_counts.values()) == 9,
        sum(count == 1 for count in assignment_event_counts.values()) == 891,
        len(approved_plans) == 9,
        sum(row["mergeApplied"] for row in persisted_decisions) == 9,
        not any(row["relation"] == "needs_review" and row["mergeApplied"] for row in persisted_decisions),
        extension_history_valid,
        not validation_errors,
        not manifest_hash_errors,
        not manifest_count_errors,
        content_digest_matches,
        not upstream_hash_errors,
        not differences,
        compare_code == 0,
        layered.get("result") == "match",
        layered.get("changeCount") == 0,
        all(row.get("schemaVersion") == EVENT_SCHEMA_VERSION for row in events),
        not any(row.get("icsUidMigrationPerformed") for row in events),
        not any(row.get("icsSerialized") for row in outbox),
    ]

    report = {
        "schemaVersion": SCHEMA_VERSION,
        "result": "pass" if all(pass_conditions) else "fail",
        "registryVersion": manifest.get("registryVersion"),
        "registryId": manifest.get("registryId"),
        "idStrategy": manifest.get("idStrategy"),
        "currentDir": relative(current, report_path.parent),
        "registryDir": relative(registry, report_path.parent),
        "pathReferences": {"base": "audit_report_directory", "format": "posix_relative"},
        "scope": {
            "allPublishableCandidatesAssigned": True,
            "approvedMergePlansPersisted": True,
            "relationDecisionsPersisted": True,
            "opaqueCalendarEventIdsIssued": True,
            "revisionHistoryPersisted": True,
            "existingRuntimeCandidateMutationExecuted": False,
            "icsUidMigrationExecuted": False,
            "outboxConsumed": False,
        },
        "checks": checks,
        "artifacts": {
            "manifest": relative(registry / "manifest.json", report_path.parent),
            **{key: relative(registry / filename, report_path.parent) for key, filename in FILES.items()},
            "registrySemanticDiff": relative(diff_path, report_path.parent),
            "layeredBaselineNoChangeDiff": relative(layered_path, report_path.parent),
        },
        "errors": {
            "registryValidation": validation_errors,
            "manifestHashes": manifest_hash_errors,
            "manifestCounts": manifest_count_errors,
            "upstreamHashes": upstream_hash_errors,
            "semanticChanges": differences[:20],
        },
        "samples": {
            "extensionEvent": extension_events[:1],
            "duplicateEvents": duplicate_events[:3],
        },
    }
    write_json(report_path, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["result"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
