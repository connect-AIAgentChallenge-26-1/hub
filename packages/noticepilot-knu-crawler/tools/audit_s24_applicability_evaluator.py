#!/usr/bin/env python3
"""Audit S24-B applicability extraction against the packaged full corpus."""
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
from noticepilot_applicability_evaluator import ApplicabilityEvaluator  # noqa: E402

SCHEMA_VERSION = "noticepilot.s24ApplicabilityEvaluatorAudit.v0.2"
TRACE_FIELDS = {
    "sourceSegment",
    "temporalRole",
    "temporalMention",
    "boundTemporalFact",
    "semanticClassification",
    "applicabilityJudgment",
    "publishabilityJudgment",
}
EXPECTED_SCOPE_COUNTS = {
    "unrestricted": 990,
    "profile_scoped": 12,
    "conditional": 20,
    "unknown": 282,
}
EXPECTED_ACTOR_COUNTS = {
    "student": 720,
    "job_applicant": 300,
    "unknown": 216,
    "mixed": 68,
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

    evaluator = ApplicabilityEvaluator()
    candidates = all_decision_candidates(current / "decisions" / "notices.jsonl")
    candidate_ids = [str(candidate.get("id") or "") for candidate in candidates]
    compatibility_errors: list[str] = []
    contract_errors: list[str] = []
    scope_counts: Counter[str] = Counter()
    actor_counts: Counter[str] = Counter()
    rule_counts: Counter[str] = Counter()
    conditional_count = 0
    profile_ready_count = 0
    runtime_judgment_count = 0

    for candidate in candidates:
        cid = str(candidate.get("id") or "unknown")
        judgment = evaluator.evaluate_projection(
            target_actor=str(candidate.get("targetActor") or "unknown"),
            audience_rules=candidate.get("audienceRules") or {},
            reason_codes=candidate.get("reasonCodes") or (),
            actor_confidence=(candidate.get("audienceRules") or {}).get("confidence"),
        )
        encoded = judgment.to_dict()
        scope_counts[encoded["scope"]] += 1
        actor_counts[encoded["targetActor"]] += 1
        rule_counts[encoded["ruleId"]] += 1
        reason_set = set(candidate.get("reasonCodes") or [])
        conditional = bool({
            "conditional_selected_participant_action",
            "post_result_selected_participant_action",
        } & reason_set)
        profile_ready = bool((candidate.get("audienceRules") or {}).get("personalizationReady"))
        conditional_count += int(conditional)
        profile_ready_count += int(profile_ready)
        runtime = candidate.get("applicabilityJudgment")
        runtime_judgment_count += int(isinstance(runtime, dict))
        if runtime != encoded:
            contract_errors.append(f"{cid}: runtime applicabilityJudgment mismatch")

        if encoded["targetActor"] != candidate.get("targetActor"):
            compatibility_errors.append(f"{cid}: targetActor mismatch")
        if encoded["audienceRules"] != candidate.get("audienceRules"):
            compatibility_errors.append(f"{cid}: audienceRules mismatch")
        if conditional and encoded["scope"] != "conditional":
            contract_errors.append(f"{cid}: conditional reason not classified conditional")
        if profile_ready and not conditional and encoded["scope"] != "profile_scoped":
            contract_errors.append(f"{cid}: personalizationReady not classified profile_scoped")
        if not encoded.get("ruleId") or not encoded.get("schemaVersion"):
            contract_errors.append(f"{cid}: incomplete applicability judgment")

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
        "applicabilityJudgmentReconstructionCount": sum(scope_counts.values()),
        "compatibilityProjectionMismatchCount": len(compatibility_errors),
        "applicabilityContractErrorCount": len(contract_errors),
        "scopeCounts": dict(sorted(scope_counts.items())),
        "scopeCountsMatchExpected": dict(scope_counts) == EXPECTED_SCOPE_COUNTS,
        "targetActorCounts": dict(sorted(actor_counts.items())),
        "targetActorCountsMatchExpected": dict(actor_counts) == EXPECTED_ACTOR_COUNTS,
        "conditionalCandidateCount": conditional_count,
        "profileReadyCandidateCount": profile_ready_count,
        "runtimeApplicabilityJudgmentFieldCount": runtime_judgment_count,
        "runtimeWiringCompletedInS24D": runtime_judgment_count == 1304,
        "runtimeWiringDeferredToS24D": False,
        "publishableIdSetsMatch": publishable_ids_match,
        "publishableLegacyProjectionMismatchCount": len(publishable_projection_errors),
        "reviewQueueMatches": review_matches,
        "icsMatches": ics_matches,
        "ruleCounts": dict(sorted(rule_counts.items())),
    }
    passed = (
        len(candidates) == 1304
        and len(set(candidate_ids)) == 1304
        and sum(scope_counts.values()) == 1304
        and not compatibility_errors
        and not contract_errors
        and dict(scope_counts) == EXPECTED_SCOPE_COUNTS
        and dict(actor_counts) == EXPECTED_ACTOR_COUNTS
        and conditional_count == 20
        and profile_ready_count == 12
        and runtime_judgment_count == 1304
        and publishable_ids_match
        and not publishable_projection_errors
        and review_matches
        and all(ics_matches.values())
    )
    report = {
        "schemaVersion": SCHEMA_VERSION,
        "result": "pass" if passed else "fail",
        "baselineDir": str(baseline),
        "currentDir": str(current),
        "evaluatorVersion": evaluator.version,
        "checks": checks,
        "samples": {
            "compatibilityProjectionMismatches": compatibility_errors[:20],
            "applicabilityContractErrors": contract_errors[:20],
            "publishableLegacyProjectionMismatches": publishable_projection_errors[:20],
        },
    }
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    output = args.output or current / "reports" / "s24-applicability-evaluator-audit.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(encoded, encoding="utf-8")
    print(encoded, end="")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
