#!/usr/bin/env python3
"""Run S27-B deterministic CrossNoticeReconciler over the 909 publishable corpus."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from noticepilot_cross_notice_diagnostics import diagnose_clusters, diagnose_pairs
from noticepilot_cross_notice_reconciler import (
    RECONCILER_VERSION,
    CrossNoticeReconciler,
    build_merge_plans,
    decision_counts,
)
from noticepilot_reconciliation_candidate_view import (
    build_reconciliation_candidate_view,
    load_board_registry,
)

SCHEMA_VERSION = "noticepilot.s27bCrossNoticeReconcilerAudit.v0.2"


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def relative(path: Path, base: Path) -> str:
    return Path(os.path.relpath(path.resolve(), start=base.resolve())).as_posix()


def candidate_docs(derived: Path) -> dict[str, dict[str, Any]]:
    result = {}
    for path in sorted((derived / "candidates" / "all").glob("*.candidates.json")):
        value = read_json(path)
        result[value["sourceNoticeId"]] = value
    return result


def run_layered_compare(derived: Path, output: Path) -> tuple[int, dict[str, Any]]:
    result = subprocess.run(
        [
            "python3", str(ROOT / "tools" / "compare_layered_baseline.py"),
            "--baseline", str(ROOT / "baseline" / "layered-s26-v1"),
            "--current", str(derived),
            "--output", str(output),
        ],
        capture_output=True, text=True, check=False,
    )
    return result.returncode, read_json(output) if output.exists() else {}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()

    derived = args.current.resolve()
    output_dir = (args.output_dir or derived / "reports" / "s27b-cross-notice").resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    policy = read_json(ROOT / "configs" / "noticepilot_cross_notice_reconciliation_policy.v0.3.json")
    registry = load_board_registry(ROOT / "configs" / "knu_board_registry.v0.2.json")
    candidates = read_jsonl(derived / "decisions" / "publishable-candidates.jsonl")
    notices = {row["sourceNoticeId"]: row for row in read_jsonl(derived / "decisions" / "notices.jsonl")}
    documents = candidate_docs(derived)
    content_hashes = {key: str(value.get("sourceContentHash") or "") for key, value in documents.items()}

    views = [build_reconciliation_candidate_view(row, notices[row["sourceNoticeId"]], registry) for row in candidates]
    view_by_id = {row["candidateId"]: row for row in views}
    diagnostic_pairs = diagnose_pairs(candidates, notices, content_hashes)
    diagnostic_clusters = diagnose_clusters(diagnostic_pairs)
    reconciler = CrossNoticeReconciler(policy)
    decisions = []
    for pair in diagnostic_pairs:
        left_id, right_id = [row["candidateId"] for row in pair["candidates"]]
        decision = reconciler.reconcile_pair(view_by_id[left_id], view_by_id[right_id], pair_id=pair["pairId"])
        decision["diagnosticTier"] = pair["diagnosticTier"]
        decision["retrievalReasons"] = pair["retrievalReasons"]
        decisions.append(decision)
    decisions.sort(key=lambda row: row["pairId"])
    merge_plans = build_merge_plans(views, decisions)

    relation_counts = decision_counts(decisions)
    candidate_ids_in_pairs = {candidate_id for row in decisions for candidate_id in row["candidateIds"]}
    unresolved_duplicate_rows = [
        row for row in decisions
        if row["relation"] == "duplicate" and row["canonicalSelection"]["status"] == "needs_review"
    ]
    auto_merge_plans = [row for row in merge_plans if row["status"] == "approved"]
    blocked_merge_plans = [row for row in merge_plans if row["status"] == "needs_review"]

    views_path = output_dir / "reconciliation-candidate-views.jsonl"
    decisions_path = output_dir / "relation-decisions.jsonl"
    plans_path = output_dir / "merge-plans.jsonl"
    canonical_review_path = output_dir / "canonical-selection-review.jsonl"
    layered_path = output_dir / "layered-baseline-no-change-diff.json"
    report_path = output_dir / "s27b-cross-notice-reconciler-audit.json"
    write_jsonl(views_path, views)
    write_jsonl(decisions_path, decisions)
    write_jsonl(plans_path, merge_plans)
    write_jsonl(canonical_review_path, unresolved_duplicate_rows)
    compare_code, layered = run_layered_compare(derived, layered_path)

    checks = {
        "publishableCandidateCount": len(candidates),
        "viewCount": len(views),
        "uniqueViewCandidateIdCount": len(view_by_id),
        "diagnosticPairCount": len(diagnostic_pairs),
        "diagnosticClusterCount": len(diagnostic_clusters),
        "relationDecisionCount": len(decisions),
        **relation_counts,
        "candidateInDiagnosticPairCount": len(candidate_ids_in_pairs),
        "isolatedCandidateCount": len(candidates) - len(candidate_ids_in_pairs),
        "mergePlanCount": len(merge_plans),
        "automaticMergePlanCount": len(auto_merge_plans),
        "blockedMergePlanCount": len(blocked_merge_plans),
        "unresolvedDuplicateCanonicalSelectionCount": len(unresolved_duplicate_rows),
        "calendarEventIdAssignmentCount": 0,
        "runtimeMutationCount": 0,
        "icsMutationCount": 0,
        "layeredBaselineResult": layered.get("result"),
        "layeredBaselineChangeCount": layered.get("changeCount"),
    }
    pass_conditions = [
        len(candidates) == 909,
        len(views) == 909,
        len(view_by_id) == 909,
        len(diagnostic_pairs) == 343,
        len(decisions) == 343,
        all(row["relation"] is not None for row in decisions),
        all(not row["runtimeMutationPerformed"] for row in decisions),
        all(not row["calendarEventIdAssigned"] for row in decisions),
        all(not row["icsMutationPerformed"] for row in decisions),
        all(row["pairwiseComplete"] for row in auto_merge_plans),
        compare_code == 0,
        layered.get("result") == "match",
        layered.get("changeCount") == 0,
    ]
    report = {
        "schemaVersion": SCHEMA_VERSION,
        "result": "pass" if all(pass_conditions) else "fail",
        "reconcilerVersion": RECONCILER_VERSION,
        "policyVersion": policy["schemaVersion"],
        "currentDir": relative(derived, report_path.parent),
        "pathReferences": {"base": "audit_report_directory", "format": "posix_relative"},
        "scope": {
            "d8CanonicalSourceIdentityApplied": True,
            "reconciliationCandidateViewApplied": True,
            "calendarEventSourceLinkContractDefined": True,
            "atomicPersistenceBoundaryDefined": True,
            "crossNoticeReconcilerExecuted": True,
            "relationPersistenceExecuted": False,
            "calendarEventIdAssignmentExecuted": False,
            "runtimeMutationExecuted": False,
            "icsMutationExecuted": False,
        },
        "checks": checks,
        "artifacts": {
            "reconciliationCandidateViews": relative(views_path, report_path.parent),
            "relationDecisions": relative(decisions_path, report_path.parent),
            "mergePlans": relative(plans_path, report_path.parent),
            "canonicalSelectionReview": relative(canonical_review_path, report_path.parent),
            "layeredBaselineNoChangeDiff": relative(layered_path, report_path.parent),
        },
        "creatorDecisionStatus": {
            "representativeBoardPriorityConfigured": bool(
                policy["decisions"]["S27A-D8"].get("canonicalRepresentativeBoardPrecedence")
            ),
            "unresolvedDuplicateCanonicalSelectionCount": len(unresolved_duplicate_rows),
            "nextDecisionRequiredBeforePersistence": len(unresolved_duplicate_rows) > 0,
            "approvedRepresentativePolicy": policy["decisions"]["S27A-D8"].get("approvedRepresentativePolicy"),
            "unresolvedAction": "needs_review",
        },
        "samples": {
            "unresolvedDuplicateCanonicalSelections": [
                {
                    "pairId": row["pairId"],
                    "candidateIds": row["candidateIds"],
                    "sourceNoticeIds": row["sourceNoticeIds"],
                    "ruleIds": row["ruleIds"],
                }
                for row in unresolved_duplicate_rows[:10]
            ],
            "automaticMergePlans": auto_merge_plans[:10],
            "blockedMergePlans": blocked_merge_plans[:10],
        },
    }
    write_json(report_path, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["result"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
