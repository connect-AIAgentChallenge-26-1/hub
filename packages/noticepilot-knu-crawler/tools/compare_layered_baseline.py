#!/usr/bin/env python3
"""Compare a current derived run with the immutable S26 layered baseline."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from layered_baseline_common import (
    LAYERED_BASELINE_DIFF_SCHEMA_VERSION,
    canonical_ics_events,
    current_snapshot,
    keyed,
    read_json,
    read_jsonl,
)

ARTIFACT_PATHS = {
    "summary": "reports/policy-summary.json",
    "integrity": "reports/candidate-integrity.json",
    "noticeDocuments": "candidates/notice-candidate-documents.jsonl",
    "studentCandidateDocuments": "candidates/student-default-documents.jsonl",
    "jobCandidateDocuments": "candidates/job-application-documents.jsonl",
    "allCandidates": "candidates/layered-candidates.jsonl",
    "publishableCandidates": "decisions/publishable-candidates.jsonl",
    "reviewQueue": "decisions/review-queue.jsonl",
    "studentIcsReport": "ics/student_default/ics_export_report.json",
    "studentIcsEvents": "ics/student_default/noticepilot-student-default.ics",
    "jobIcsReport": "ics/job_application/ics_export_report.json",
    "jobIcsEvents": "ics/job_application/noticepilot-job-applications.ics",
    "layeredAudit": "reports/s26-layered-full-corpus-audit.json",
    "runtimeWiringAudit": "reports/s24d-runtime-wiring.json",
    "candidateReconcilerAudit": "reports/s25-candidate-reconciler.json",
}


def baseline_snapshot(baseline_dir: Path) -> dict[str, Any]:
    return {
        "summary": read_json(baseline_dir / ARTIFACT_PATHS["summary"]),
        "integrity": read_json(baseline_dir / ARTIFACT_PATHS["integrity"]),
        "noticeDocuments": read_jsonl(baseline_dir / ARTIFACT_PATHS["noticeDocuments"]),
        "studentCandidateDocuments": read_jsonl(baseline_dir / ARTIFACT_PATHS["studentCandidateDocuments"]),
        "jobCandidateDocuments": read_jsonl(baseline_dir / ARTIFACT_PATHS["jobCandidateDocuments"]),
        "allCandidates": read_jsonl(baseline_dir / ARTIFACT_PATHS["allCandidates"]),
        "publishableCandidates": read_jsonl(baseline_dir / ARTIFACT_PATHS["publishableCandidates"]),
        "reviewQueue": read_jsonl(baseline_dir / ARTIFACT_PATHS["reviewQueue"]),
        "studentIcsReport": read_json(baseline_dir / ARTIFACT_PATHS["studentIcsReport"]),
        "studentIcsEvents": canonical_ics_events(baseline_dir / ARTIFACT_PATHS["studentIcsEvents"]),
        "jobIcsReport": read_json(baseline_dir / ARTIFACT_PATHS["jobIcsReport"]),
        "jobIcsEvents": canonical_ics_events(baseline_dir / ARTIFACT_PATHS["jobIcsEvents"]),
        "layeredAudit": read_json(baseline_dir / ARTIFACT_PATHS["layeredAudit"]),
        "runtimeWiringAudit": read_json(baseline_dir / ARTIFACT_PATHS["runtimeWiringAudit"]),
        "candidateReconcilerAudit": read_json(baseline_dir / ARTIFACT_PATHS["candidateReconcilerAudit"]),
    }


def scalar_diff(baseline: Any, current: Any, prefix: str = "") -> list[dict[str, Any]]:
    if baseline == current:
        return []
    if isinstance(baseline, dict) and isinstance(current, dict):
        changes: list[dict[str, Any]] = []
        for key in sorted(set(baseline) | set(current)):
            path = f"{prefix}.{key}" if prefix else str(key)
            if key not in baseline:
                changes.append({"path": path, "baseline": None, "current": current[key]})
            elif key not in current:
                changes.append({"path": path, "baseline": baseline[key], "current": None})
            else:
                changes.extend(scalar_diff(baseline[key], current[key], path))
        return changes
    return [{"path": prefix or "$", "baseline": baseline, "current": current}]


def keyed_diff(baseline_rows: list[dict[str, Any]], current_rows: list[dict[str, Any]], key: str) -> dict[str, Any]:
    baseline_map = keyed(baseline_rows, key)
    current_map = keyed(current_rows, key)
    added = sorted(set(current_map) - set(baseline_map))
    removed = sorted(set(baseline_map) - set(current_map))
    changed = [
        {
            "key": row_key,
            "baselineHash": _hash_for_report(baseline_map[row_key]),
            "currentHash": _hash_for_report(current_map[row_key]),
        }
        for row_key in sorted(set(baseline_map) & set(current_map))
        if baseline_map[row_key] != current_map[row_key]
    ]
    return {"added": added, "removed": removed, "changed": changed}


def _hash_for_report(value: Any) -> str:
    import hashlib
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def event_diff(baseline_rows: list[dict[str, Any]], current_rows: list[dict[str, Any]]) -> dict[str, Any]:
    return keyed_diff(baseline_rows, current_rows, "UID")


def change_count(value: Any) -> int:
    if isinstance(value, list):
        return len(value)
    if isinstance(value, dict):
        return sum(change_count(child) for child in value.values())
    return 0


def compare(baseline_dir: Path, current_dir: Path) -> dict[str, Any]:
    baseline_dir = baseline_dir.resolve()
    current_dir = current_dir.resolve()
    baseline = baseline_snapshot(baseline_dir)
    current = current_snapshot(current_dir)

    sections = {
        "summary": scalar_diff(baseline["summary"], current["summary"]),
        "candidateIntegrity": scalar_diff(baseline["integrity"], current["integrity"]),
        "noticeDocuments": keyed_diff(baseline["noticeDocuments"], current["noticeDocuments"], "sourceNoticeId"),
        "studentCandidateDocuments": keyed_diff(baseline["studentCandidateDocuments"], current["studentCandidateDocuments"], "sourceNoticeId"),
        "jobCandidateDocuments": keyed_diff(baseline["jobCandidateDocuments"], current["jobCandidateDocuments"], "sourceNoticeId"),
        "allCandidates": keyed_diff(baseline["allCandidates"], current["allCandidates"], "id"),
        "publishableCandidates": keyed_diff(baseline["publishableCandidates"], current["publishableCandidates"], "id"),
        "reviewQueue": keyed_diff(baseline["reviewQueue"], current["reviewQueue"], "sourceNoticeId"),
        "studentIcsReport": scalar_diff(baseline["studentIcsReport"], current["studentIcsReport"]),
        "studentIcsEvents": event_diff(baseline["studentIcsEvents"], current["studentIcsEvents"]),
        "jobIcsReport": scalar_diff(baseline["jobIcsReport"], current["jobIcsReport"]),
        "jobIcsEvents": event_diff(baseline["jobIcsEvents"], current["jobIcsEvents"]),
        "layeredAudit": scalar_diff(baseline["layeredAudit"], current["layeredAudit"]),
        "runtimeWiringAudit": scalar_diff(baseline["runtimeWiringAudit"], current["runtimeWiringAudit"]),
        "candidateReconcilerAudit": scalar_diff(baseline["candidateReconcilerAudit"], current["candidateReconcilerAudit"]),
    }
    total = change_count(sections)
    manifest = read_json(baseline_dir / "baseline-manifest.json")
    return {
        "schemaVersion": LAYERED_BASELINE_DIFF_SCHEMA_VERSION,
        "baselineId": manifest.get("baselineId"),
        "baselineDir": str(baseline_dir),
        "currentDir": str(current_dir),
        "result": "match" if total == 0 else "different",
        "changeCount": total,
        "comparisonPolicy": {
            "allowlistUsed": False,
            "strictFullCandidateObjects": True,
            "strictNoticeCandidateDocuments": True,
            "policy15ComparisonSeparate": True,
        },
        "sections": sections,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = compare(args.baseline, args.current)
    if args.output:
        output = args.output.resolve()
        report["baselineDir"] = Path(
            os.path.relpath(args.baseline.resolve(), start=output.parent)
        ).as_posix()
        report["currentDir"] = Path(
            os.path.relpath(args.current.resolve(), start=output.parent)
        ).as_posix()
        report["pathReferences"] = {
            "base": "diff_report_directory",
            "format": "posix_relative",
        }
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["result"] == "match" else 1


if __name__ == "__main__":
    raise SystemExit(main())
