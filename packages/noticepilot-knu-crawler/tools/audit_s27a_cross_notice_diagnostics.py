#!/usr/bin/env python3
"""Generate the S27-A approved-policy, no-mutation cross-notice corpus package."""
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

from noticepilot_cross_notice_diagnostics import (  # noqa: E402
    DIAGNOSTIC_VERSION,
    diagnose_clusters,
    diagnose_pairs,
    diagnostic_counts,
    stable_id_strategy_draft,
)

SCHEMA_VERSION = "noticepilot.s27aCrossNoticeDiagnosis.v0.2"
POLICY_PATH = ROOT / "configs" / "noticepilot_cross_notice_reconciliation_policy.v0.3.json"


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
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
    result: dict[str, dict[str, Any]] = {}
    for path in sorted((derived / "candidates" / "all").glob("*.candidates.json")):
        doc = read_json(path)
        result[str(doc["sourceNoticeId"])] = doc
    return result


def ics_uid_lines(path: Path) -> list[str]:
    return [line[4:].strip() for line in path.read_text(encoding="utf-8").splitlines() if line.startswith("UID:")]


def run_layered_compare(project_root: Path, derived: Path, output: Path) -> tuple[int, dict[str, Any], str]:
    command = [
        "python3",
        str(project_root / "tools" / "compare_layered_baseline.py"),
        "--baseline",
        str(project_root / "baseline" / "layered-s26-v1"),
        "--current",
        str(derived),
        "--output",
        str(output),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    report = read_json(output) if output.exists() else {}
    return result.returncode, report, result.stdout + result.stderr


def creator_decision_record(
    counts: dict[str, Any],
    pairs: list[dict[str, Any]],
    clusters: list[dict[str, Any]],
    id_draft: dict[str, Any],
    policy: dict[str, Any],
) -> dict[str, Any]:
    cross_board = [pair for pair in pairs if not pair["signals"]["sameBoard"]]
    same_title_changed_interval = [
        pair for pair in pairs
        if pair["signals"]["sameNormalizedTitle"] and not pair["signals"]["sameNormalizedInterval"]
    ]
    marker_pairs = [pair for pair in pairs if pair["signals"]["revisionMarkerPresent"]]
    disjoint_campus = [pair for pair in pairs if pair["signals"]["campusRelation"] == "disjoint"]
    exact_title_same_interval = [
        pair for pair in pairs
        if pair["signals"]["sameNormalizedTitle"] and pair["signals"]["sameNormalizedInterval"]
    ]
    tie_pairs = [
        pair for pair in pairs
        if (not pair["signals"]["publicationOrderKnown"])
        or pair["candidates"][0]["publishedAt"] == pair["candidates"][1]["publishedAt"]
    ]

    def sample(rows: list[dict[str, Any]], limit: int = 5) -> list[dict[str, Any]]:
        return [
            {
                "pairId": row["pairId"],
                "candidateIds": [candidate["candidateId"] for candidate in row["candidates"]],
                "noticeIds": [candidate["sourceNoticeId"] for candidate in row["candidates"]],
                "titles": [candidate["sourceTitle"] for candidate in row["candidates"]],
                "intervals": [[candidate["normalizedStart"], candidate["normalizedEnd"]] for candidate in row["candidates"]],
                "boards": [candidate["boardId"] for candidate in row["candidates"]],
                "sourceUrls": [candidate.get("sourceUrl") for candidate in row["candidates"]],
            }
            for row in rows[:limit]
        ]

    affected = {
        "S27A-D1": {"affectedPairCount": len(same_title_changed_interval), "samples": sample(same_title_changed_interval)},
        "S27A-D2": {"affectedPairCount": len(cross_board), "samples": sample(cross_board)},
        "S27A-D3": {"affectedPairCount": len(marker_pairs), "samples": sample(marker_pairs)},
        "S27A-D4": {"affectedPairCount": len(disjoint_campus), "samples": sample(disjoint_campus)},
        "S27A-D5": {"affectedPairCount": counts["diagnosticPairCount"], "options": id_draft["options"]},
        "S27A-D6": {
            "affectedClusterCount": counts["transitiveClusterWarningCount"],
            "sampleClusterIds": [row["clusterId"] for row in clusters if row["transitivityWarning"]][:10],
        },
        "S27A-D7": {"affectedPairCount": len(exact_title_same_interval), "samples": sample(exact_title_same_interval)},
        "S27A-D8": {"affectedPairCount": len(tie_pairs), "samples": sample(tie_pairs)},
    }
    rows = []
    for decision_id, decision in policy["decisions"].items():
        rows.append({"id": decision_id, **affected[decision_id], "approvedPolicy": decision})
    return {
        "schemaVersion": "noticepilot.s27aCreatorDecisionRecord.v0.1",
        "status": "creator_decisions_recorded",
        "policyVersion": policy["schemaVersion"],
        "automaticRelationDecisionsPerformed": False,
        "calendarEventIdAssignmentsPerformed": False,
        "boardPriorityConfigurationPending": not bool(policy["decisions"]["S27A-D8"].get("canonicalRepresentativeBoardPrecedence")),
        "decisions": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()

    derived = args.current.resolve()
    project_root = ROOT
    output_dir = (args.output_dir or (derived / "reports" / "s27a-cross-notice")).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    policy = read_json(POLICY_PATH)

    candidates = read_jsonl(derived / "decisions" / "publishable-candidates.jsonl")
    notices = {row["sourceNoticeId"]: row for row in read_jsonl(derived / "decisions" / "notices.jsonl")}
    documents = candidate_docs(derived)
    content_hashes = {key: str(value.get("sourceContentHash") or "") for key, value in documents.items()}

    pairs = diagnose_pairs(candidates, notices, content_hashes)
    clusters = diagnose_clusters(pairs)
    counts = diagnostic_counts(pairs, clusters, len(candidates))
    identity_draft = stable_id_strategy_draft(candidates)
    decisions = creator_decision_record(counts, pairs, clusters, identity_draft, policy)

    pairs_path = output_dir / "pair-diagnostics.jsonl"
    clusters_path = output_dir / "cluster-diagnostics.jsonl"
    identity_path = output_dir / "stable-calendar-event-id-draft.json"
    decisions_path = output_dir / "creator-decision-record.json"
    compatibility_queue_path = output_dir / "creator-decision-queue.json"
    policy_snapshot_path = output_dir / "approved-reconciliation-policy.json"
    layered_diff_path = output_dir / "layered-baseline-no-change-diff.json"
    report_path = output_dir / "s27a-cross-notice-diagnosis.json"
    write_jsonl(pairs_path, pairs)
    write_jsonl(clusters_path, clusters)
    write_json(identity_path, identity_draft)
    write_json(decisions_path, decisions)
    write_json(compatibility_queue_path, decisions)
    write_json(policy_snapshot_path, policy)

    compare_code, layered_diff, compare_output = run_layered_compare(project_root, derived, layered_diff_path)

    calendar_event_fields = sum("calendarEventId" in row or "calendarEventRecord" in row for row in candidates)
    candidate_uid_hint_count = sum(
        str(row.get("uidHint") or "") == f"noticepilot-{row.get('id')}@noticepilot.local"
        for row in candidates
    )
    student_uids = ics_uid_lines(derived / "ics" / "student_default" / "noticepilot-student-default.ics")
    job_uids = ics_uid_lines(derived / "ics" / "job_application" / "noticepilot-job-applications.ics")
    candidate_uid_set = {str(row.get("uidHint") or "") for row in candidates}
    ics_uid_candidate_match = all(uid in candidate_uid_set for uid in student_uids + job_uids)

    checks = {
        **counts,
        "uniquePublishableCandidateIdCount": len({row["id"] for row in candidates}),
        "pairRelationDecisionCount": sum(pair["relationDecision"]["relation"] is not None for pair in pairs),
        "pairAutomaticMutationAllowedCount": sum(pair["relationDecision"]["automaticMutationAllowed"] for pair in pairs),
        "calendarEventIdRuntimeFieldCount": calendar_event_fields,
        "candidateUidHintCompatibilityCount": candidate_uid_hint_count,
        "studentIcsUidCount": len(student_uids),
        "jobIcsUidCount": len(job_uids),
        "icsUidCandidateCompatibility": ics_uid_candidate_match,
        "layeredBaselineResult": layered_diff.get("result"),
        "layeredBaselineChangeCount": layered_diff.get("changeCount"),
        "creatorDecisionCount": len(decisions["decisions"]),
        "creatorDecisionsApproved": all(row["approvedPolicy"]["status"].startswith("approved") for row in decisions["decisions"]),
        "selectedCalendarEventIdStrategy": policy["decisions"]["S27A-D5"]["selectedStrategy"],
        "boardPriorityConfigured": bool(policy["decisions"]["S27A-D8"].get("canonicalRepresentativeBoardPrecedence")),
        "unresolvedTieAction": policy["decisions"]["S27A-D8"]["unresolvedTieAction"],
    }
    pass_conditions = [
        len(candidates) == 909,
        checks["uniquePublishableCandidateIdCount"] == 909,
        checks["pairRelationDecisionCount"] == 0,
        checks["pairAutomaticMutationAllowedCount"] == 0,
        checks["calendarEventIdRuntimeFieldCount"] == 0,
        checks["candidateUidHintCompatibilityCount"] == 909,
        len(student_uids) == 609,
        len(job_uids) == 300,
        ics_uid_candidate_match,
        compare_code == 0,
        layered_diff.get("result") == "match",
        layered_diff.get("changeCount") == 0,
        checks["creatorDecisionsApproved"],
        checks["selectedCalendarEventIdStrategy"] == "registry_assigned_opaque_v0",
        checks["unresolvedTieAction"] == "needs_review",
    ]
    report = {
        "schemaVersion": SCHEMA_VERSION,
        "result": "pass" if all(pass_conditions) else "fail",
        "diagnosticVersion": DIAGNOSTIC_VERSION,
        "policyVersion": policy["schemaVersion"],
        "currentDir": relative(derived, report_path.parent),
        "pathReferences": {"base": "diagnosis_report_directory", "format": "posix_relative"},
        "scope": {
            "contractPolicyApproved": True,
            "publishablePairDiagnosisPerformed": True,
            "stableCalendarEventIdStrategyApproved": True,
            "relationEvidenceAndFailClosedPolicyDefined": True,
            "runtimeMutationPerformed": False,
            "icsMutationPerformed": False,
            "relationDecisionsPerformed": False,
            "calendarEventIdAssignmentPerformed": False,
            "creatorApprovalRequiredBeforeS27B": False,
            "boardPriorityConfigurationRequiredBeforeAutomaticTieBreak": True,
        },
        "checks": checks,
        "artifacts": {
            "pairDiagnostics": relative(pairs_path, report_path.parent),
            "clusterDiagnostics": relative(clusters_path, report_path.parent),
            "stableCalendarEventIdDraft": relative(identity_path, report_path.parent),
            "creatorDecisionRecord": relative(decisions_path, report_path.parent),
            "creatorDecisionQueueCompatibility": relative(compatibility_queue_path, report_path.parent),
            "approvedReconciliationPolicy": relative(policy_snapshot_path, report_path.parent),
            "layeredBaselineNoChangeDiff": relative(layered_diff_path, report_path.parent),
        },
        "approvedFailClosedPolicy": {
            "repeatedSameTitleDifferentWindowDefaultsDistinct": True,
            "crossBoardDuplicateRequiresAllIdentityConditions": True,
            "markerAloneNeverAuthorizesRelation": True,
            "extensionRequiresLaterMarkerSameStartAndLaterEnd": True,
            "repostDuplicateRequiresExactCalendarEventProjection": True,
            "initialAutomaticRevisionAllowed": False,
            "additionalRecruitmentAndClosedDefaultDistinct": True,
            "replacementOrCancellationWithoutBodyReferenceNeedsReview": True,
            "campusDisjointAlwaysDistinct": True,
            "transitiveClusterMergeAllowed": False,
            "registryAssignedOpaqueIdSelected": True,
            "oneActiveIcsEventPreservesAllSourceLinks": True,
            "missingBoardPriorityUsesImplicitFallback": False,
            "missingBoardPriorityAction": "needs_review",
            "noCandidateOrIcsMutationInS27A": True,
        },
        "executionErrors": [] if compare_code == 0 else [{"layeredComparator": compare_output}],
    }
    write_json(report_path, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["result"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
