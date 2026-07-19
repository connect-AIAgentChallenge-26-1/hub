#!/usr/bin/env python3
"""Audit S24-C PublishabilityEvaluator extraction against the packaged corpus."""
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

from baseline_common import canonical_ics_events, canonical_review, read_jsonl  # noqa: E402
from noticepilot_publishability_evaluator import PublishabilityEvaluator  # noqa: E402

SCHEMA_VERSION = "noticepilot.s24PublishabilityEvaluatorAudit.v0.2"
TRACE_FIELDS = {
    "sourceSegment",
    "temporalRole",
    "temporalMention",
    "boundTemporalFact",
    "semanticClassification",
    "applicabilityJudgment",
    "publishabilityJudgment",
}
EXPECTED_VERDICT_COUNTS = {
    "auto_confirmed": 909,
    "needs_review": 395,
}
EXPECTED_ROLE_VERDICT_COUNTS = {
    "conditional_followup|needs_review": 11,
    "event_occurrence|auto_confirmed": 128,
    "event_occurrence|needs_review": 103,
    "internal_process|needs_review": 79,
    "result_announcement|auto_confirmed": 40,
    "result_announcement|needs_review": 19,
    "user_action_period|auto_confirmed": 741,
    "user_action_period|needs_review": 183,
}
EXPECTED_RULE_COUNTS = {
    "publishability.audience.mixed.review": 68,
    "publishability.audience.student.auto_confirm": 720,
    "publishability.audience.unknown.review": 216,
    "publishability.board716.exact_application_period.auto_confirm": 300,
    "publishability.reason.board716_application_period_only": 300,
    "publishability.reason.completed_result_announcement": 11,
    "publishability.reason.conditional_selected_participant_action": 11,
    "publishability.reason.conflicting_same_action_dates": 15,
    "publishability.reason.date_may_change": 3,
    "publishability.reason.exact_list_application_period": 300,
    "publishability.reason.internal_workflow_deadline": 77,
    "publishability.reason.mixed_audience": 68,
    "publishability.reason.non_student_local_action": 2,
    "publishability.reason.post_result_selected_participant_action": 11,
    "publishability.reason.range_boundary_time_requires_review": 3,
    "publishability.reason.unknown_audience": 216,
    "publishability.temporal_role.conditional_followup": 11,
    "publishability.temporal_role.conditional_followup.review": 11,
    "publishability.temporal_role.event_occurrence": 231,
    "publishability.temporal_role.internal_process": 79,
    "publishability.temporal_role.internal_process.review": 79,
    "publishability.temporal_role.result_announcement": 59,
    "publishability.temporal_role.user_action_period": 924,
    "publishability.verdict.auto_confirmed": 909,
    "publishability.verdict.needs_review": 395,
}


def legacy_projection(candidate: dict[str, Any]) -> dict[str, Any]:
    return {key: copy.deepcopy(value) for key, value in candidate.items() if key not in TRACE_FIELDS}


def map_candidates(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(row.get("id")): row for row in rows}


def all_decision_candidates(path: Path) -> list[dict[str, Any]]:
    return [candidate for decision in read_jsonl(path) for candidate in decision.get("candidates") or []]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    baseline = args.baseline.resolve()
    current = args.current.resolve()

    evaluator = PublishabilityEvaluator()
    candidates = all_decision_candidates(current / "decisions" / "notices.jsonl")
    candidate_ids = [str(candidate.get("id") or "") for candidate in candidates]
    projection_errors: list[str] = []
    contract_errors: list[str] = []
    verdict_counts: Counter[str] = Counter()
    role_verdict_counts: Counter[str] = Counter()
    rule_counts: Counter[str] = Counter()
    publication_reason_counts: Counter[str] = Counter()
    deterministic_count = 0
    chronology_valid_count = 0
    guarded_role_count = 0
    runtime_judgment_count = 0

    guarded_roles = {"reference_date", "internal_process", "conditional_followup", "unknown"}

    for candidate in candidates:
        cid = str(candidate.get("id") or "unknown")
        projection = evaluator.evaluate_projection(candidate)
        encoded = projection.judgment.to_dict()
        verdict_counts[encoded["verdict"]] += 1
        role = str(candidate.get("temporalRole") or "unknown")
        role_verdict_counts[f"{role}|{encoded['verdict']}"] += 1
        rule_counts.update(encoded["ruleIds"])
        publication_reason_counts.update(evaluator.publication_reason_codes(encoded["reasonCodes"]))
        deterministic = bool((candidate.get("temporalMention") or {}).get("deterministic", True))
        deterministic_count += int(deterministic)
        chronology_valid = "publishability.chronology.invalid.review" not in encoded["ruleIds"]
        chronology_valid_count += int(chronology_valid)
        guarded_role_count += int(role in guarded_roles)
        runtime = candidate.get("publishabilityJudgment")
        runtime_judgment_count += int(isinstance(runtime, dict))
        if runtime != encoded:
            contract_errors.append(f"{cid}: runtime publishabilityJudgment mismatch")

        if encoded["verdict"] != candidate.get("status"):
            projection_errors.append(f"{cid}: status/verdict mismatch")
        if encoded["includeInCalendarFeed"] != candidate.get("includeInCalendarFeed"):
            projection_errors.append(f"{cid}: includeInCalendarFeed mismatch")
        if encoded["reasonCodes"] != candidate.get("reasonCodes"):
            projection_errors.append(f"{cid}: reasonCodes mismatch")
        if list(projection.feed_scopes) != list(candidate.get("feedScopes") or []):
            projection_errors.append(f"{cid}: feedScopes mismatch")
        if projection.confidence != candidate.get("confidence"):
            projection_errors.append(f"{cid}: confidence mismatch")
        if encoded["verdict"] == "auto_confirmed" and not encoded["includeInCalendarFeed"]:
            contract_errors.append(f"{cid}: auto_confirmed excluded from feed")
        if encoded["verdict"] != "auto_confirmed" and encoded["includeInCalendarFeed"]:
            contract_errors.append(f"{cid}: non-auto verdict included in feed")
        if encoded["includeInCalendarFeed"] and not projection.feed_scopes:
            contract_errors.append(f"{cid}: included candidate missing feed scope")
        if role in guarded_roles and encoded["verdict"] == "auto_confirmed":
            contract_errors.append(f"{cid}: guarded temporal role auto-confirmed")
        if not encoded.get("ruleIds") or not encoded.get("schemaVersion"):
            contract_errors.append(f"{cid}: incomplete publishability judgment")

    baseline_pub = map_candidates(read_jsonl(baseline / "decisions" / "publishable-candidates.jsonl"))
    current_pub = map_candidates(read_jsonl(current / "decisions" / "publishable-candidates.jsonl"))
    publishable_ids_match = set(baseline_pub) == set(current_pub)
    publishable_projection_errors: list[str] = []
    if publishable_ids_match:
        for cid in sorted(baseline_pub):
            if legacy_projection(baseline_pub[cid]) != legacy_projection(current_pub[cid]):
                publishable_projection_errors.append(cid)

    review_matches = canonical_review(read_jsonl(baseline / "decisions" / "review-queue.jsonl")) == canonical_review(
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
        "candidateCount": len(candidates),
        "uniqueCandidateIdCount": len(set(candidate_ids)),
        "publishabilityJudgmentReconstructionCount": sum(verdict_counts.values()),
        "compatibilityProjectionMismatchCount": len(projection_errors),
        "publishabilityContractErrorCount": len(contract_errors),
        "verdictCounts": dict(sorted(verdict_counts.items())),
        "verdictCountsMatchExpected": dict(verdict_counts) == EXPECTED_VERDICT_COUNTS,
        "temporalRoleVerdictCounts": dict(sorted(role_verdict_counts.items())),
        "temporalRoleVerdictCountsMatchExpected": dict(role_verdict_counts) == EXPECTED_ROLE_VERDICT_COUNTS,
        "deterministicTemporalMentionCount": deterministic_count,
        "chronologyValidCandidateCount": chronology_valid_count,
        "temporalRoleGuardCandidateCount": guarded_role_count,
        "runtimePublishabilityJudgmentFieldCount": runtime_judgment_count,
        "runtimeWiringCompletedInS24D": runtime_judgment_count == 1304,
        "runtimeWiringDeferredToS24D": False,
        "publishableIdSetsMatch": publishable_ids_match,
        "publishableLegacyProjectionMismatchCount": len(publishable_projection_errors),
        "reviewQueueMatches": review_matches,
        "icsMatches": ics_matches,
        "ruleCounts": dict(sorted(rule_counts.items())),
        "ruleCountsMatchExpected": dict(rule_counts) == EXPECTED_RULE_COUNTS,
        "publicationReasonCounts": dict(sorted(publication_reason_counts.items())),
    }
    passed = (
        len(candidates) == 1304
        and len(set(candidate_ids)) == 1304
        and sum(verdict_counts.values()) == 1304
        and not projection_errors
        and not contract_errors
        and dict(verdict_counts) == EXPECTED_VERDICT_COUNTS
        and dict(role_verdict_counts) == EXPECTED_ROLE_VERDICT_COUNTS
        and deterministic_count == 1304
        and chronology_valid_count == 1304
        and guarded_role_count == 90
        and runtime_judgment_count == 1304
        and publishable_ids_match
        and not publishable_projection_errors
        and review_matches
        and all(ics_matches.values())
        and dict(rule_counts) == EXPECTED_RULE_COUNTS
    )
    report = {
        "schemaVersion": SCHEMA_VERSION,
        "result": "pass" if passed else "fail",
        "baselineDir": str(baseline),
        "currentDir": str(current),
        "evaluatorVersion": evaluator.version,
        "checks": checks,
        "samples": {
            "compatibilityProjectionMismatches": projection_errors[:20],
            "publishabilityContractErrors": contract_errors[:20],
            "publishableLegacyProjectionMismatches": publishable_projection_errors[:20],
        },
    }
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    output = args.output or current / "reports" / "s24-publishability-evaluator-audit.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(encoded, encoding="utf-8")
    print(encoded, end="")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
