#!/usr/bin/env python3
"""Compare a pipeline derived directory with the immutable Policy.15 baseline.

The comparison is semantic: generated timestamps, absolute filesystem paths, and
ICS DTSTAMP values are ignored. Candidate IDs, semantic fields, decisions, and
ICS event identities remain strict unless explicitly allowlisted.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from baseline_common import (
    DIFF_REPORT_SCHEMA_VERSION,
    canonical_ics_events,
    canonical_ics_report,
    canonical_publishable,
    canonical_review,
    canonical_summary,
    read_json,
    read_jsonl,
    semantic_hash,
)


def load_allowlist(path: Path | None) -> dict[str, set[str]]:
    empty = {
        "allowedCandidateIds": set(),
        "allowedNoticeIds": set(),
        "allowedSummaryPaths": set(),
        "allowedIcsUids": set(),
    }
    if path is None:
        return empty
    value = read_json(path)
    for key in empty:
        empty[key] = {str(item) for item in value.get(key) or []}
    return empty


def flatten(value: Any, prefix: str = "") -> dict[str, Any]:
    result: dict[str, Any] = {}
    if isinstance(value, dict):
        for key in sorted(value):
            path = f"{prefix}.{key}" if prefix else str(key)
            result.update(flatten(value[key], path))
    elif isinstance(value, list):
        result[prefix] = value
    else:
        result[prefix] = value
    return result


def summary_diff(baseline: dict[str, Any], current: dict[str, Any], allowed_paths: set[str]) -> list[dict[str, Any]]:
    left = flatten(canonical_summary(baseline))
    right = flatten(canonical_summary(current))
    changes = []
    for path in sorted(set(left) | set(right)):
        if path in allowed_paths:
            continue
        if left.get(path) != right.get(path):
            changes.append({"path": path, "baseline": left.get(path), "current": right.get(path)})
    return changes


def map_candidate_rows(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    projected = canonical_publishable(rows)
    return {str(row.get("id")): row for row in projected}


def map_review_rows(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    projected = canonical_review(rows)
    return {str(row.get("sourceNoticeId")): row for row in projected}


def map_ics_events(path: Path) -> dict[str, dict[str, Any]]:
    return {str(row.get("UID")): row for row in canonical_ics_events(path)}


def keyed_diff(
    baseline: dict[str, dict[str, Any]],
    current: dict[str, dict[str, Any]],
    *,
    allowed_keys: set[str],
    allowed_notice_ids: set[str] | None = None,
) -> dict[str, Any]:
    allowed_notice_ids = allowed_notice_ids or set()

    def allowed(key: str, value: dict[str, Any] | None) -> bool:
        if key in allowed_keys:
            return True
        if not value:
            return False
        notice_id = value.get("sourceNoticeId") or value.get("X-NOTICEPILOT-SOURCE-NOTICE-ID")
        if isinstance(notice_id, list):
            return any(str(item) in allowed_notice_ids for item in notice_id)
        return str(notice_id or "") in allowed_notice_ids

    added = []
    removed = []
    changed = []
    for key in sorted(set(current) - set(baseline)):
        if not allowed(key, current[key]):
            added.append({"key": key, "current": current[key]})
    for key in sorted(set(baseline) - set(current)):
        if not allowed(key, baseline[key]):
            removed.append({"key": key, "baseline": baseline[key]})
    for key in sorted(set(baseline) & set(current)):
        if baseline[key] != current[key] and not allowed(key, current[key]):
            changed.append({"key": key, "baseline": baseline[key], "current": current[key]})
    return {"added": added, "removed": removed, "changed": changed}


def require_paths(root: Path) -> None:
    required = [
        "reports/policy-summary.json",
        "reports/candidate-integrity.json",
        "decisions/publishable-candidates.jsonl",
        "decisions/review-queue.jsonl",
        "ics/student_default/ics_export_report.json",
        "ics/student_default/noticepilot-student-default.ics",
        "ics/job_application/ics_export_report.json",
        "ics/job_application/noticepilot-job-applications.ics",
    ]
    missing = [rel for rel in required if not (root / rel).exists()]
    if missing:
        raise FileNotFoundError(f"missing derived artifacts under {root}: {missing}")


def compare(baseline_dir: Path, current_dir: Path, allowlist_path: Path | None) -> dict[str, Any]:
    require_paths(baseline_dir)
    require_paths(current_dir)
    allow = load_allowlist(allowlist_path)

    b_summary = read_json(baseline_dir / "reports/policy-summary.json")
    c_summary = read_json(current_dir / "reports/policy-summary.json")
    b_integrity = read_json(baseline_dir / "reports/candidate-integrity.json")
    c_integrity = read_json(current_dir / "reports/candidate-integrity.json")
    b_pub_rows = read_jsonl(baseline_dir / "decisions/publishable-candidates.jsonl")
    c_pub_rows = read_jsonl(current_dir / "decisions/publishable-candidates.jsonl")
    b_review_rows = read_jsonl(baseline_dir / "decisions/review-queue.jsonl")
    c_review_rows = read_jsonl(current_dir / "decisions/review-queue.jsonl")

    summary_changes = summary_diff(b_summary, c_summary, allow["allowedSummaryPaths"])
    candidate_changes = keyed_diff(
        map_candidate_rows(b_pub_rows),
        map_candidate_rows(c_pub_rows),
        allowed_keys=allow["allowedCandidateIds"],
        allowed_notice_ids=allow["allowedNoticeIds"],
    )
    review_changes = keyed_diff(
        map_review_rows(b_review_rows),
        map_review_rows(c_review_rows),
        allowed_keys=allow["allowedNoticeIds"],
    )

    ics_changes: dict[str, Any] = {}
    report_changes: dict[str, Any] = {}
    for feed, filename in [
        ("student_default", "noticepilot-student-default.ics"),
        ("job_application", "noticepilot-job-applications.ics"),
    ]:
        b_ics_path = baseline_dir / "ics" / feed / filename
        c_ics_path = current_dir / "ics" / feed / filename
        ics_changes[feed] = keyed_diff(
            map_ics_events(b_ics_path),
            map_ics_events(c_ics_path),
            allowed_keys=allow["allowedIcsUids"],
            allowed_notice_ids=allow["allowedNoticeIds"],
        )
        b_report = canonical_ics_report(read_json(baseline_dir / "ics" / feed / "ics_export_report.json"))
        c_report = canonical_ics_report(read_json(current_dir / "ics" / feed / "ics_export_report.json"))
        report_changes[feed] = [] if b_report == c_report else [{
            "baselineHash": semantic_hash(b_report),
            "currentHash": semantic_hash(c_report),
            "baselineEventCount": b_report.get("eventCount"),
            "currentEventCount": c_report.get("eventCount"),
        }]

    integrity_changes = [] if b_integrity == c_integrity else [{"baseline": b_integrity, "current": c_integrity}]
    sections = {
        "summary": summary_changes,
        "candidateIntegrity": integrity_changes,
        "publishableCandidates": candidate_changes,
        "reviewQueue": review_changes,
        "icsReports": report_changes,
        "icsEvents": ics_changes,
    }

    def count_changes(value: Any) -> int:
        if isinstance(value, list):
            return len(value)
        if isinstance(value, dict):
            return sum(count_changes(child) for child in value.values())
        return 0

    change_count = count_changes(sections)
    return {
        "schemaVersion": DIFF_REPORT_SCHEMA_VERSION,
        "baselineDir": str(baseline_dir),
        "currentDir": str(current_dir),
        "allowlist": str(allowlist_path) if allowlist_path else None,
        "result": "match" if change_count == 0 else "different",
        "changeCount": change_count,
        "sections": sections,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--allowlist", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = compare(args.baseline.resolve(), args.current.resolve(), args.allowlist.resolve() if args.allowlist else None)
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded, encoding="utf-8")
    print(json.dumps({"result": report["result"], "changeCount": report["changeCount"]}, ensure_ascii=False))
    return 0 if report["result"] == "match" else 1


if __name__ == "__main__":
    raise SystemExit(main())
