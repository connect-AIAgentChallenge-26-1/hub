#!/usr/bin/env python3
"""Build a reproducible Policy.15 baseline manifest and regression-case fixture."""
from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from baseline_common import (
    BASELINE_SCHEMA_VERSION,
    REGRESSION_CASE_SCHEMA_VERSION,
    canonical_ics_events,
    canonical_ics_report,
    canonical_publishable,
    canonical_review,
    canonical_summary,
    read_json,
    read_jsonl,
    semantic_hash,
    sha256_file,
)

KEY_FILES = [
    "reports/policy-summary.json",
    "reports/candidate-integrity.json",
    "decisions/publishable-candidates.jsonl",
    "decisions/review-queue.jsonl",
    "ics/student_default/ics_export_report.json",
    "ics/student_default/noticepilot-student-default.ics",
    "ics/job_application/ics_export_report.json",
    "ics/job_application/noticepilot-job-applications.ics",
]

CRITICAL_NOTICE_IDS = [
    "knu-720-2465",  # leave/return flattened table
    "knu-720-2352",  # course-registration cohort table
    "knu-720-2356",  # orientation vs course-registration leakage
    "knu-720-2423",  # cancellation/refund, activity period, course evaluation
    "knu-720-1588",  # readmission application and result announcement
    "knu-720-2343",  # admitted-participant follow-up held for review
]

REVIEW_REASON_CASES = [
    "reference_date_not_user_action",
    "conditional_selected_participant_action",
    "internal_process_period",
    "partial_activity_period_requires_review",
    "action_label_not_locally_grounded",
]


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _write_jsonl(path: Path, values: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for value in values:
            f.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n")


def build(derived_dir: Path, baseline_dir: Path) -> dict[str, Any]:
    for rel in KEY_FILES:
        path = baseline_dir / rel
        if not path.exists():
            raise FileNotFoundError(f"baseline key file missing: {path}")

    summary = read_json(baseline_dir / "reports/policy-summary.json")
    integrity = read_json(baseline_dir / "reports/candidate-integrity.json")
    publishable = read_jsonl(baseline_dir / "decisions/publishable-candidates.jsonl")
    review = read_jsonl(baseline_dir / "decisions/review-queue.jsonl")
    student_report = read_json(baseline_dir / "ics/student_default/ics_export_report.json")
    job_report = read_json(baseline_dir / "ics/job_application/ics_export_report.json")
    student_ics_events = canonical_ics_events(baseline_dir / "ics/student_default/noticepilot-student-default.ics")
    job_ics_events = canonical_ics_events(baseline_dir / "ics/job_application/noticepilot-job-applications.ics")

    publishable_by_notice: dict[str, list[dict[str, Any]]] = {}
    for candidate in publishable:
        publishable_by_notice.setdefault(str(candidate.get("sourceNoticeId") or ""), []).append(candidate)
    review_by_notice = {str(decision.get("sourceNoticeId") or ""): decision for decision in review}

    cases: list[dict[str, Any]] = []
    used_notice_ids: set[str] = set()
    for notice_id in CRITICAL_NOTICE_IDS:
        if notice_id in publishable_by_notice:
            projected = canonical_publishable(publishable_by_notice[notice_id])
            cases.append({
                "schemaVersion": REGRESSION_CASE_SCHEMA_VERSION,
                "caseId": f"policy15-{notice_id}",
                "sourceNoticeId": notice_id,
                "source": "publishable-candidates",
                "expected": {
                    "candidateCount": len(projected),
                    "candidateProjections": projected,
                },
            })
            used_notice_ids.add(notice_id)
        if notice_id in review_by_notice:
            decision = review_by_notice[notice_id]
            cases.append({
                "schemaVersion": REGRESSION_CASE_SCHEMA_VERSION,
                "caseId": f"policy15-{notice_id}-review",
                "sourceNoticeId": notice_id,
                "source": "review-queue",
                "expected": canonical_review([decision])[0],
            })
            used_notice_ids.add(notice_id)

    for reason_code in REVIEW_REASON_CASES:
        match = next(
            (
                decision for decision in review
                if reason_code in (decision.get("reasonCodes") or [])
                and str(decision.get("sourceNoticeId") or "") not in used_notice_ids
            ),
            None,
        )
        if match is None:
            continue
        notice_id = str(match.get("sourceNoticeId") or "")
        used_notice_ids.add(notice_id)
        cases.append({
            "schemaVersion": REGRESSION_CASE_SCHEMA_VERSION,
            "caseId": f"policy15-review-{reason_code}",
            "sourceNoticeId": notice_id,
            "source": "review-queue",
            "focusReasonCode": reason_code,
            "expected": canonical_review([match])[0],
        })

    cases.sort(key=lambda case: case["caseId"])
    _write_jsonl(baseline_dir / "regression-cases.jsonl", cases)

    files = {}
    for rel in KEY_FILES:
        p = baseline_dir / rel
        files[rel] = {"sizeBytes": p.stat().st_size, "sha256": sha256_file(p)}

    canonical_hashes = {
        "summary": semantic_hash(canonical_summary(summary)),
        "integrity": semantic_hash(integrity),
        "publishableCandidates": semantic_hash(canonical_publishable(publishable)),
        "reviewQueue": semantic_hash(canonical_review(review)),
        "studentIcsReport": semantic_hash(canonical_ics_report(student_report)),
        "studentIcsEvents": semantic_hash(student_ics_events),
        "jobIcsReport": semantic_hash(canonical_ics_report(job_report)),
        "jobIcsEvents": semantic_hash(job_ics_events),
    }

    manifest = {
        "schemaVersion": BASELINE_SCHEMA_VERSION,
        "baselineId": "policy15-corpus-2059-20260712",
        "description": "Immutable Policy.15 behavioral baseline for S20/S21 layered-engine refactoring.",
        "createdAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "sourceDerivedDirName": derived_dir.name,
        "sourceVersions": {
            "pipelineVersion": summary.get("pipelineVersion"),
            "policyVersion": summary.get("policyVersion"),
            "summarySchemaVersion": summary.get("schemaVersion"),
            "candidateSchemaVersion": "noticepilot.calendarCandidates.v0.10",
            "segmentSchemaVersion": "noticepilot.scheduleSegments.v0.3",
            "icsExporterVersion": student_report.get("exporterVersion"),
        },
        "counts": {
            "processedNoticeCount": (summary.get("source") or {}).get("processedNoticeCount"),
            "candidateCount": summary.get("candidateCount"),
            "publishableCandidateCount": len(publishable),
            "reviewDecisionCount": len(review),
            "reviewQueueCandidateEntryCount": sum(len(row.get("candidates") or []) for row in review),
            "reviewQueueNeedsReviewCandidateCount": sum(1 for row in review for candidate in (row.get("candidates") or []) if candidate.get("status") == "needs_review"),
            "reviewQueueAutoConfirmedCandidateCount": sum(1 for row in review for candidate in (row.get("candidates") or []) if candidate.get("status") == "auto_confirmed"),
            "studentIcsEventCount": len(student_ics_events),
            "jobIcsEventCount": len(job_ics_events),
            "regressionCaseCount": len(cases),
        },
        "statusCounts": {
            "publishableByEventType": dict(sorted(Counter(str(row.get("eventType")) for row in publishable).items())),
            "publishableByActionType": dict(sorted(Counter(str(row.get("actionType")) for row in publishable if row.get("actionType")).items())),
        },
        "canonicalHashes": canonical_hashes,
        "files": files,
        "comparisonPolicy": {
            "ignoreGeneratedTimestamps": True,
            "ignoreAbsoluteFilesystemPaths": True,
            "ignoreIcsDtstamp": True,
            "candidateIdentityMustRemainStable": True,
            "defaultAllowlist": "baseline-allowlist.example.json",
        },
    }
    _write_json(baseline_dir / "baseline-manifest.json", manifest)
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--derived", type=Path, required=True, help="Original derived/mvp-policy-v0.1 directory")
    parser.add_argument("--baseline", type=Path, required=True, help="Baseline directory containing copied key artifacts")
    args = parser.parse_args()
    manifest = build(args.derived.resolve(), args.baseline.resolve())
    print(json.dumps(manifest["counts"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
