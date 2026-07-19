#!/usr/bin/env python3
"""Audit S25 intra-notice CandidateReconciler against the full derived corpus."""
from __future__ import annotations

import argparse
import copy
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(ROOT / "tools"))

from baseline_common import (  # noqa: E402
    canonical_ics_events,
    canonical_review,
    read_jsonl,
)
import noticepilot_mvp_policy_pipeline as policy  # noqa: E402

SCHEMA_VERSION = "noticepilot.s25CandidateReconcilerAudit.v0.1"


LAYER_FIELDS = {
    "sourceSegment", "temporalRole", "temporalMention", "boundTemporalFact",
    "semanticClassification", "applicabilityJudgment", "publishabilityJudgment",
}

def legacy_projection(candidate: dict[str, Any]) -> dict[str, Any]:
    return {key: copy.deepcopy(value) for key, value in candidate.items() if key not in LAYER_FIELDS}


EXPECTED_RECONCILIATION_REASON_COUNTS = {
    "same_datetime_candidates_consolidated": {"candidate": 45, "notice": 49},
    "same_day_precision_candidates_consolidated": {"candidate": 15, "notice": 14},
    "same_action_boundary_candidates_consolidated": {"candidate": 43, "notice": 43},
    "conflicting_same_action_dates": {"candidate": 15, "notice": 9},
    "range_boundary_time_requires_review": {"candidate": 3, "notice": 0},
}


def stable_projection(candidate: dict[str, Any]) -> dict[str, Any]:
    """Projection that must remain unchanged by a reconciler no-op pass."""
    return {
        "id": candidate.get("id"),
        "eventType": candidate.get("eventType"),
        "actionType": candidate.get("actionType"),
        "normalizedStart": candidate.get("normalizedStart"),
        "normalizedEnd": candidate.get("normalizedEnd"),
        "isAllDay": candidate.get("isAllDay"),
        "targetActor": candidate.get("targetActor"),
        "audienceRules": candidate.get("audienceRules"),
        "feedScopes": candidate.get("feedScopes"),
        "status": candidate.get("status"),
        "includeInCalendarFeed": candidate.get("includeInCalendarFeed"),
        "reasonCodes": candidate.get("reasonCodes"),
        "applicabilityJudgment": candidate.get("applicabilityJudgment"),
        "publishabilityJudgment": candidate.get("publishabilityJudgment"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    baseline = args.baseline.resolve()
    current = args.current.resolve()
    decisions = read_jsonl(current / "decisions" / "notices.jsonl")

    candidate_ids: list[str] = []
    second_pass_input = 0
    second_pass_output = 0
    second_pass_removed = 0
    second_pass_conflicts = 0
    candidate_id_order_mismatches: list[str] = []
    projection_mismatches: list[str] = []
    object_mismatches: list[str] = []
    report_contract_errors: list[str] = []

    reason_candidate_counts: Counter[str] = Counter()
    reason_notice_counts: Counter[str] = Counter()

    for decision in decisions:
        notice_id = str(decision.get("sourceNoticeId") or "unknown")
        original = decision.get("candidates") or []
        candidate_ids.extend(str(row.get("id")) for row in original)
        for reason in EXPECTED_RECONCILIATION_REASON_COUNTS:
            reason_notice_counts[reason] += int(reason in (decision.get("reasonCodes") or []))
            reason_candidate_counts[reason] += sum(
                reason in (candidate.get("reasonCodes") or []) for candidate in original
            )

        cloned = copy.deepcopy(original)
        reconciled, reconciliation_report = policy.CANDIDATE_RECONCILER.reconcile(cloned)
        report_data = reconciliation_report.to_dict()
        if report_data.get("inputCount") != len(original):
            report_contract_errors.append(f"{notice_id}: inputCount mismatch")
        if report_data.get("outputCount") != len(reconciled):
            report_contract_errors.append(f"{notice_id}: outputCount mismatch")
        if report_data.get("removedCount") != len(original) - len(reconciled):
            report_contract_errors.append(f"{notice_id}: removedCount mismatch")

        second_pass_input += reconciliation_report.input_count
        second_pass_output += reconciliation_report.output_count
        second_pass_removed += reconciliation_report.removed_count
        second_pass_conflicts += reconciliation_report.conflict_count

        before_ids = [str(row.get("id")) for row in original]
        after_ids = [str(row.get("id")) for row in reconciled]
        if before_ids != after_ids:
            candidate_id_order_mismatches.append(notice_id)
        if [stable_projection(row) for row in original] != [stable_projection(row) for row in reconciled]:
            projection_mismatches.append(notice_id)
        if original != reconciled:
            object_mismatches.append(notice_id)

    actual_reason_counts = {
        reason: {
            "candidate": reason_candidate_counts[reason],
            "notice": reason_notice_counts[reason],
        }
        for reason in EXPECTED_RECONCILIATION_REASON_COUNTS
    }

    baseline_publishable = {
        str(row.get("id")): row
        for row in read_jsonl(baseline / "decisions" / "publishable-candidates.jsonl")
    }
    current_publishable = {
        str(row.get("id")): row
        for row in read_jsonl(current / "decisions" / "publishable-candidates.jsonl")
    }
    publishable_match = (
        set(baseline_publishable) == set(current_publishable)
        and all(
            legacy_projection(baseline_publishable[cid]) == legacy_projection(current_publishable[cid])
            for cid in baseline_publishable
        )
    )
    review_match = canonical_review(read_jsonl(baseline / "decisions" / "review-queue.jsonl")) == canonical_review(
        read_jsonl(current / "decisions" / "review-queue.jsonl")
    )
    ics_matches: dict[str, bool] = {}
    for feed, filename in (
        ("student_default", "noticepilot-student-default.ics"),
        ("job_application", "noticepilot-job-applications.ics"),
    ):
        ics_matches[feed] = canonical_ics_events(baseline / "ics" / feed / filename) == canonical_ics_events(
            current / "ics" / feed / filename
        )

    checks = {
        "noticeDecisionCount": len(decisions),
        "candidateCount": len(candidate_ids),
        "uniqueCandidateIdCount": len(set(candidate_ids)),
        "secondPassInputCandidateCount": second_pass_input,
        "secondPassOutputCandidateCount": second_pass_output,
        "secondPassRemovedCandidateCount": second_pass_removed,
        "secondPassConflictDetectionCount": second_pass_conflicts,
        "candidateIdOrderMismatchCount": len(candidate_id_order_mismatches),
        "stableProjectionMismatchCount": len(projection_mismatches),
        "candidateObjectMismatchCount": len(object_mismatches),
        "reconciliationReportContractErrorCount": len(report_contract_errors),
        "reconciliationReasonCounts": actual_reason_counts,
        "reconciliationReasonCountsMatchExpected": actual_reason_counts == EXPECTED_RECONCILIATION_REASON_COUNTS,
        "publishableSemanticsMatch": publishable_match,
        "reviewQueueMatches": review_match,
        "icsMatches": ics_matches,
    }

    passed = (
        len(decisions) == 2059
        and len(candidate_ids) == 1304
        and len(set(candidate_ids)) == 1304
        and second_pass_input == 1304
        and second_pass_output == 1304
        and second_pass_removed == 0
        and second_pass_conflicts == 9
        and not candidate_id_order_mismatches
        and not projection_mismatches
        and not object_mismatches
        and not report_contract_errors
        and actual_reason_counts == EXPECTED_RECONCILIATION_REASON_COUNTS
        and publishable_match
        and review_match
        and all(ics_matches.values())
    )

    report = {
        "schemaVersion": SCHEMA_VERSION,
        "result": "pass" if passed else "fail",
        "baselineDir": str(baseline),
        "currentDir": str(current),
        "reconcilerVersion": policy.CANDIDATE_RECONCILER.version,
        "checks": checks,
        "samples": {
            "candidateIdOrderMismatches": candidate_id_order_mismatches[:20],
            "stableProjectionMismatches": projection_mismatches[:20],
            "candidateObjectMismatches": object_mismatches[:20],
            "reconciliationReportContractErrors": report_contract_errors[:20],
        },
    }
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    output = args.output or current / "reports" / "s25-candidate-reconciler-audit.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(encoded, encoding="utf-8")
    print(encoded, end="")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
