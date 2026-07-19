#!/usr/bin/env python3
"""Build the immutable S26 layered baseline beside Policy.15.

This command never replaces baseline/policy15. By default it refuses to write
into a non-empty destination. Use --force only while intentionally rebuilding
an uncommitted baseline fixture.
"""
from __future__ import annotations

import argparse
import json
import shutil
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from layered_baseline_common import (
    BASELINE_ID,
    LAYERED_BASELINE_DECISION_SCHEMA_VERSION,
    LAYERED_BASELINE_SCHEMA_VERSION,
    current_snapshot,
    semantic_hash,
    sha256_file,
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


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path: Path, values: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for value in values:
            f.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n")


def build(derived_dir: Path, baseline_dir: Path, *, force: bool = False) -> dict[str, Any]:
    derived_dir = derived_dir.resolve()
    baseline_dir = baseline_dir.resolve()
    policy15_dir = baseline_dir.parent / "policy15"
    if baseline_dir.name == "policy15" or baseline_dir == policy15_dir:
        raise ValueError("refusing to replace baseline/policy15")
    if baseline_dir.exists() and any(baseline_dir.iterdir()):
        if not force:
            raise FileExistsError(f"baseline destination is not empty: {baseline_dir}")
        shutil.rmtree(baseline_dir)
    baseline_dir.mkdir(parents=True, exist_ok=True)

    snapshot = current_snapshot(derived_dir)
    write_json(baseline_dir / ARTIFACT_PATHS["summary"], snapshot["summary"])
    write_json(baseline_dir / ARTIFACT_PATHS["integrity"], snapshot["integrity"])
    write_jsonl(baseline_dir / ARTIFACT_PATHS["noticeDocuments"], snapshot["noticeDocuments"])
    write_jsonl(baseline_dir / ARTIFACT_PATHS["studentCandidateDocuments"], snapshot["studentCandidateDocuments"])
    write_jsonl(baseline_dir / ARTIFACT_PATHS["jobCandidateDocuments"], snapshot["jobCandidateDocuments"])
    write_jsonl(baseline_dir / ARTIFACT_PATHS["allCandidates"], snapshot["allCandidates"])
    write_jsonl(baseline_dir / ARTIFACT_PATHS["publishableCandidates"], snapshot["publishableCandidates"])
    write_jsonl(baseline_dir / ARTIFACT_PATHS["reviewQueue"], snapshot["reviewQueue"])
    write_json(baseline_dir / ARTIFACT_PATHS["studentIcsReport"], snapshot["studentIcsReport"])
    write_json(baseline_dir / ARTIFACT_PATHS["jobIcsReport"], snapshot["jobIcsReport"])
    shutil.copy2(
        derived_dir / "ics" / "student_default" / "noticepilot-student-default.ics",
        baseline_dir / ARTIFACT_PATHS["studentIcsEvents"],
    )
    shutil.copy2(
        derived_dir / "ics" / "job_application" / "noticepilot-job-applications.ics",
        baseline_dir / ARTIFACT_PATHS["jobIcsEvents"],
    )
    write_json(baseline_dir / ARTIFACT_PATHS["layeredAudit"], snapshot["layeredAudit"])
    write_json(baseline_dir / ARTIFACT_PATHS["runtimeWiringAudit"], snapshot["runtimeWiringAudit"])
    write_json(baseline_dir / ARTIFACT_PATHS["candidateReconcilerAudit"], snapshot["candidateReconcilerAudit"])

    policy15_manifest = json.loads((policy15_dir / "baseline-manifest.json").read_text(encoding="utf-8"))
    decision = {
        "schemaVersion": LAYERED_BASELINE_DECISION_SCHEMA_VERSION,
        "decisionId": "s26-separate-layered-baseline-20260712",
        "decidedAt": "2026-07-12",
        "decision": "create_separate_layered_baseline",
        "baselineId": BASELINE_ID,
        "predecessorBaselineId": policy15_manifest.get("baselineId"),
        "policy15ReplacementPerformed": False,
        "allowlistCreated": False,
        "acceptedPolicy15Differences": {
            "totalChangeCount": 304,
            "summaryChanges": 4,
            "board716TraceEnrichmentCandidateChanges": 300,
            "candidateIntegrityChanges": 0,
            "reviewQueueChanges": 0,
            "icsEventChanges": 0,
        },
        "rationale": [
            "Preserve the immutable Policy.15 behavioral baseline as rollback evidence.",
            "Freeze the complete layered trace, runtime judgments, and reconciliation state independently.",
            "Avoid a broad allowlist that would weaken future semantic regression detection.",
        ],
        "approvalSource": "explicit_user_direction",
    }
    write_json(baseline_dir / "decision-record.json", decision)

    readme = f"""# S26 layered baseline v1

This is an immutable layered baseline created from the verified 2,059-notice
S26 corpus run. It exists **beside** `baseline/policy15`; Policy.15 was not
replaced and no allowlist was created.

Baseline ID: `{BASELINE_ID}`

It freezes:

- all 1,304 unique candidate objects with complete layered traces;
- all 2,059 canonical notice candidate documents;
- canonical student-default and job-application feed candidate documents;
- runtime applicability and publishability judgments;
- S25 reconciliation state;
- publishable and review outputs;
- student and job-application ICS semantics;
- the S26 unified audit evidence.

Verify this baseline:

```bash
python3 tools/compare_layered_baseline.py \\
  --baseline baseline/layered-s26-v1 \\
  --current derived/mvp-policy-v0.1
```

Do not regenerate this directory during normal tests. The build command refuses
to overwrite a non-empty destination unless `--force` is explicitly supplied.
"""
    (baseline_dir / "README.md").write_text(readme, encoding="utf-8")

    file_paths = [
        *ARTIFACT_PATHS.values(),
        "decision-record.json",
        "README.md",
    ]
    files: dict[str, dict[str, Any]] = {}
    for rel in sorted(file_paths):
        path = baseline_dir / rel
        files[rel] = {"sizeBytes": path.stat().st_size, "sha256": sha256_file(path)}

    all_candidates = snapshot["allCandidates"]
    publishable = snapshot["publishableCandidates"]
    review = snapshot["reviewQueue"]
    manifest = {
        "schemaVersion": LAYERED_BASELINE_SCHEMA_VERSION,
        "baselineId": BASELINE_ID,
        "description": "Immutable S26 layered baseline preserving full trace, runtime judgment, reconciliation, decision, and ICS semantics.",
        "createdAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "sourceDerivedDirName": derived_dir.name,
        "relationship": {
            "predecessorBaselineId": policy15_manifest.get("baselineId"),
            "predecessorDirectory": "../policy15",
            "policy15Preserved": True,
            "policy15Replaced": False,
            "allowlistUsed": False,
            "decisionRecord": "decision-record.json",
        },
        "sourceVersions": {
            "pipelineVersion": snapshot["summary"].get("pipelineVersion"),
            "policyVersion": snapshot["summary"].get("policyVersion"),
            "candidateSchemaVersion": "noticepilot.calendarCandidates.v0.11",
            "scheduleSegmentSchemaVersion": "noticepilot.scheduleSegments.v0.3",
            "applicabilityJudgmentSchemaVersion": "noticepilot.applicabilityJudgment.v0.1",
            "publishabilityJudgmentSchemaVersion": "noticepilot.publishabilityJudgment.v0.1",
            "candidateReconcilerVersion": snapshot["candidateReconcilerAudit"].get("reconcilerVersion"),
            "s26AuditVersion": snapshot["layeredAudit"].get("auditVersion"),
        },
        "counts": {
            "processedNoticeCount": snapshot["summary"].get("noticeCount"),
            "noticeCandidateDocumentCount": len(snapshot["noticeDocuments"]),
            "studentCandidateDocumentCount": len(snapshot["studentCandidateDocuments"]),
            "jobCandidateDocumentCount": len(snapshot["jobCandidateDocuments"]),
            "canonicalCandidateOccurrenceCount": sum(len(row.get("candidates") or []) for row in snapshot["noticeDocuments"]),
            "crossArtifactCandidateOccurrenceCount": sum(
                len(row.get("candidates") or [])
                for collection in (
                    snapshot["noticeDocuments"],
                    snapshot["studentCandidateDocuments"],
                    snapshot["jobCandidateDocuments"],
                )
                for row in collection
            ),
            "uniqueCandidateCount": len(all_candidates),
            "publishableCandidateCount": len(publishable),
            "reviewDecisionCount": len(review),
            "reviewQueueCandidateEntryCount": sum(len(row.get("candidates") or []) for row in review),
            "runtimeApplicabilityJudgmentCount": sum(1 for row in all_candidates if isinstance(row.get("applicabilityJudgment"), dict)),
            "runtimePublishabilityJudgmentCount": sum(1 for row in all_candidates if isinstance(row.get("publishabilityJudgment"), dict)),
            "completeTraceCandidateCount": sum(
                1 for row in all_candidates
                if all(isinstance(row.get(key), dict) for key in ("sourceSegment", "temporalMention", "boundTemporalFact", "semanticClassification"))
            ),
            "studentIcsEventCount": len(snapshot["studentIcsEvents"]),
            "jobIcsEventCount": len(snapshot["jobIcsEvents"]),
        },
        "statusCounts": {
            "candidateVerdicts": dict(sorted(Counter(str(row.get("status")) for row in all_candidates).items())),
            "applicabilityScopes": dict(sorted(Counter(str((row.get("applicabilityJudgment") or {}).get("scope")) for row in all_candidates).items())),
            "temporalRoles": dict(sorted(Counter(str(row.get("temporalRole")) for row in all_candidates).items())),
        },
        "canonicalHashes": {name: semantic_hash(value) for name, value in snapshot.items()},
        "files": files,
        "comparisonPolicy": {
            "strictFullCandidateObjects": True,
            "strictNoticeCandidateDocuments": True,
            "ignoreNoticeDocumentExtractorCreatedAt": True,
            "ignoreGeneratedFilesystemPaths": True,
            "ignoreIcsDtstamp": True,
            "allowlistSupported": False,
            "candidateIdentityMustRemainStable": True,
            "policy15ComparisonRemainsSeparate": True,
        },
    }
    write_json(baseline_dir / "baseline-manifest.json", manifest)
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--derived", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    manifest = build(args.derived, args.baseline, force=args.force)
    print(json.dumps({
        "baselineId": manifest["baselineId"],
        "counts": manifest["counts"],
        "relationship": manifest["relationship"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
