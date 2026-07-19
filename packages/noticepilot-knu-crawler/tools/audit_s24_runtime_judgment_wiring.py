#!/usr/bin/env python3
"""Audit S24-D runtime judgment serialization across the full derived corpus."""
from __future__ import annotations

import argparse
import copy
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(ROOT / "tools"))

from baseline_common import canonical_ics_events, canonical_review, read_jsonl  # noqa: E402
from noticepilot_applicability_evaluator import ApplicabilityEvaluator  # noqa: E402
from noticepilot_publishability_evaluator import PublishabilityEvaluator  # noqa: E402
from noticepilot_runtime_judgment_wiring import RuntimeJudgmentWiring  # noqa: E402

SCHEMA_VERSION = "noticepilot.s24RuntimeJudgmentWiringAudit.v0.1"
JUDGMENT_FIELDS = {"applicabilityJudgment", "publishabilityJudgment"}
APPLICABILITY_KEYS = {
    "schemaVersion", "targetActor", "scope", "audienceRules", "confidence", "ruleId", "reasonCodes"
}
PUBLISHABILITY_KEYS = {
    "schemaVersion", "verdict", "includeInCalendarFeed", "reasonCodes", "ruleIds"
}
EXPECTED_SCOPE_COUNTS = {
    "unrestricted": 990,
    "unknown": 282,
    "profile_scoped": 12,
    "conditional": 20,
}
EXPECTED_VERDICT_COUNTS = {"auto_confirmed": 909, "needs_review": 395}


def legacy_projection(candidate: dict[str, Any]) -> dict[str, Any]:
    ignored = JUDGMENT_FIELDS | {
        "sourceSegment", "temporalRole", "temporalMention", "boundTemporalFact", "semanticClassification"
    }
    return {key: copy.deepcopy(value) for key, value in candidate.items() if key not in ignored}


def all_decision_candidates(path: Path) -> list[dict[str, Any]]:
    return [candidate for decision in read_jsonl(path) for candidate in decision.get("candidates") or []]


def candidate_document_occurrences(root: Path) -> Iterable[tuple[Path, dict[str, Any]]]:
    for path in sorted(root.glob("*/*.candidates.json")):
        document = json.loads(path.read_text(encoding="utf-8"))
        for candidate in document.get("candidates") or []:
            yield path, candidate


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    baseline = args.baseline.resolve()
    current = args.current.resolve()

    applicability = ApplicabilityEvaluator()
    publishability = PublishabilityEvaluator()
    wiring = RuntimeJudgmentWiring(applicability, publishability)
    candidates = all_decision_candidates(current / "decisions" / "notices.jsonl")
    candidate_map = {str(candidate.get("id")): candidate for candidate in candidates}

    contract_errors: list[str] = []
    runtime_mismatches: list[str] = []
    legacy_projection_errors: list[str] = []
    artifact_mismatches: list[str] = []
    scope_counts: Counter[str] = Counter()
    verdict_counts: Counter[str] = Counter()
    app_rule_counts: Counter[str] = Counter()
    pub_rule_counts: Counter[str] = Counter()

    for candidate in candidates:
        cid = str(candidate.get("id") or "unknown")
        app = candidate.get("applicabilityJudgment")
        pub = candidate.get("publishabilityJudgment")
        if not isinstance(app, dict):
            contract_errors.append(f"{cid}: applicabilityJudgment is not an object")
            continue
        if not isinstance(pub, dict):
            contract_errors.append(f"{cid}: publishabilityJudgment is not an object")
            continue
        if set(app) != APPLICABILITY_KEYS:
            contract_errors.append(f"{cid}: applicabilityJudgment keys mismatch")
        if set(pub) != PUBLISHABILITY_KEYS:
            contract_errors.append(f"{cid}: publishabilityJudgment keys mismatch")
        if app.get("schemaVersion") != "noticepilot.applicabilityJudgment.v0.1":
            contract_errors.append(f"{cid}: applicability schemaVersion mismatch")
        if pub.get("schemaVersion") != "noticepilot.publishabilityJudgment.v0.1":
            contract_errors.append(f"{cid}: publishability schemaVersion mismatch")
        if app.get("targetActor") != candidate.get("targetActor"):
            contract_errors.append(f"{cid}: applicability targetActor mismatch")
        if app.get("audienceRules") != candidate.get("audienceRules"):
            contract_errors.append(f"{cid}: applicability audienceRules mismatch")
        if pub.get("verdict") != candidate.get("status"):
            contract_errors.append(f"{cid}: publishability verdict mismatch")
        if pub.get("includeInCalendarFeed") != candidate.get("includeInCalendarFeed"):
            contract_errors.append(f"{cid}: publishability feed inclusion mismatch")
        if pub.get("reasonCodes") != candidate.get("reasonCodes"):
            contract_errors.append(f"{cid}: publishability reasonCodes mismatch")
        if not app.get("ruleId") or not pub.get("ruleIds"):
            contract_errors.append(f"{cid}: missing judgment rule ownership")

        projected_app = applicability.evaluate_projection(
            target_actor=str(candidate.get("targetActor") or "unknown"),
            audience_rules=candidate.get("audienceRules") or {},
            reason_codes=candidate.get("reasonCodes") or (),
            actor_confidence=(candidate.get("audienceRules") or {}).get("confidence"),
        ).to_dict()
        projected_pub = publishability.evaluate_projection(candidate).judgment.to_dict()
        if app != projected_app:
            runtime_mismatches.append(f"{cid}: applicability reconstruction mismatch")
        if pub != projected_pub:
            runtime_mismatches.append(f"{cid}: publishability reconstruction mismatch")

        clone = copy.deepcopy(candidate)
        before = copy.deepcopy((clone["applicabilityJudgment"], clone["publishabilityJudgment"]))
        wiring.wire_candidate(clone)
        after = (clone["applicabilityJudgment"], clone["publishabilityJudgment"])
        if before != after:
            runtime_mismatches.append(f"{cid}: runtime wiring is not idempotent")
        if legacy_projection(clone) != legacy_projection(candidate):
            runtime_mismatches.append(f"{cid}: runtime wiring changed legacy projection")

        scope_counts[str(app.get("scope"))] += 1
        verdict_counts[str(pub.get("verdict"))] += 1
        app_rule_counts[str(app.get("ruleId"))] += 1
        pub_rule_counts.update(pub.get("ruleIds") or [])

    baseline_pub = {str(row.get("id")): row for row in read_jsonl(baseline / "decisions" / "publishable-candidates.jsonl")}
    current_pub_rows = read_jsonl(current / "decisions" / "publishable-candidates.jsonl")
    current_pub = {str(row.get("id")): row for row in current_pub_rows}
    publishable_ids_match = set(baseline_pub) == set(current_pub)
    if publishable_ids_match:
        for cid in sorted(baseline_pub):
            if legacy_projection(baseline_pub[cid]) != legacy_projection(current_pub[cid]):
                legacy_projection_errors.append(cid)
            if current_pub[cid].get("applicabilityJudgment") != candidate_map[cid].get("applicabilityJudgment"):
                artifact_mismatches.append(f"{cid}: publishable applicability mismatch")
            if current_pub[cid].get("publishabilityJudgment") != candidate_map[cid].get("publishabilityJudgment"):
                artifact_mismatches.append(f"{cid}: publishable publishability mismatch")

    review_rows = read_jsonl(current / "decisions" / "review-queue.jsonl")
    review_candidates = [candidate for row in review_rows for candidate in row.get("candidates") or []]
    for candidate in review_candidates:
        cid = str(candidate.get("id") or "unknown")
        canonical = candidate_map.get(cid)
        if canonical is None:
            artifact_mismatches.append(f"{cid}: review candidate missing from decisions")
            continue
        for field in JUDGMENT_FIELDS:
            if candidate.get(field) != canonical.get(field):
                artifact_mismatches.append(f"{cid}: review {field} mismatch")

    document_occurrence_count = 0
    document_wired_count = 0
    for path, candidate in candidate_document_occurrences(current / "candidates"):
        document_occurrence_count += 1
        cid = str(candidate.get("id") or "unknown")
        canonical = candidate_map.get(cid)
        if all(isinstance(candidate.get(field), dict) for field in JUDGMENT_FIELDS):
            document_wired_count += 1
        if canonical is None:
            artifact_mismatches.append(f"{cid}: candidate document missing canonical decision")
            continue
        for field in JUDGMENT_FIELDS:
            if candidate.get(field) != canonical.get(field):
                artifact_mismatches.append(f"{cid}: {path.name} {field} mismatch")

    review_matches = canonical_review(read_jsonl(baseline / "decisions" / "review-queue.jsonl")) == canonical_review(review_rows)
    publishable_semantics_match = publishable_ids_match and not legacy_projection_errors
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
        "uniqueCandidateIdCount": len(candidate_map),
        "runtimeApplicabilityJudgmentFieldCount": sum(isinstance(c.get("applicabilityJudgment"), dict) for c in candidates),
        "runtimePublishabilityJudgmentFieldCount": sum(isinstance(c.get("publishabilityJudgment"), dict) for c in candidates),
        "runtimeJudgmentContractErrorCount": len(contract_errors),
        "runtimeJudgmentReconstructionMismatchCount": len(runtime_mismatches),
        "scopeCounts": dict(sorted(scope_counts.items())),
        "scopeCountsMatchExpected": dict(scope_counts) == EXPECTED_SCOPE_COUNTS,
        "verdictCounts": dict(sorted(verdict_counts.items())),
        "verdictCountsMatchExpected": dict(verdict_counts) == EXPECTED_VERDICT_COUNTS,
        "applicabilityRuleCounts": dict(sorted(app_rule_counts.items())),
        "publishabilityRuleCount": sum(pub_rule_counts.values()),
        "publishableIdSetsMatch": publishable_ids_match,
        "publishableSemanticsMatch": publishable_semantics_match,
        "publishableLegacyProjectionMismatchCount": len(legacy_projection_errors),
        "reviewQueueMatches": review_matches,
        "reviewCandidateCount": len(review_candidates),
        "candidateDocumentOccurrenceCount": document_occurrence_count,
        "candidateDocumentWiredCount": document_wired_count,
        "crossArtifactJudgmentMismatchCount": len(artifact_mismatches),
        "icsMatches": ics_matches,
    }
    passed = (
        len(candidates) == 1304
        and len(candidate_map) == 1304
        and checks["runtimeApplicabilityJudgmentFieldCount"] == 1304
        and checks["runtimePublishabilityJudgmentFieldCount"] == 1304
        and not contract_errors
        and not runtime_mismatches
        and dict(scope_counts) == EXPECTED_SCOPE_COUNTS
        and dict(verdict_counts) == EXPECTED_VERDICT_COUNTS
        and publishable_ids_match
        and publishable_semantics_match
        and not legacy_projection_errors
        and review_matches
        and len(review_candidates) == 498
        and document_occurrence_count == 2213
        and document_wired_count == 2213
        and not artifact_mismatches
        and all(ics_matches.values())
    )
    report = {
        "schemaVersion": SCHEMA_VERSION,
        "result": "pass" if passed else "fail",
        "baselineDir": str(baseline),
        "currentDir": str(current),
        "wiringVersion": wiring.version,
        "checks": checks,
        "samples": {
            "runtimeJudgmentContractErrors": contract_errors[:20],
            "runtimeJudgmentReconstructionMismatches": runtime_mismatches[:20],
            "publishableLegacyProjectionMismatches": legacy_projection_errors[:20],
            "crossArtifactJudgmentMismatches": artifact_mismatches[:20],
        },
    }
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    output = args.output or current / "reports" / "s24-runtime-judgment-wiring-audit.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(encoded, encoding="utf-8")
    print(encoded, end="")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
