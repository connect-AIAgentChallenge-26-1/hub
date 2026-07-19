#!/usr/bin/env python3
"""Audit S24-A board 716 trace completion against the immutable Policy.15 baseline."""
from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(ROOT / "tools"))

from baseline_common import canonical_ics_events, canonical_review, read_json, read_jsonl  # noqa: E402

SCHEMA_VERSION = "noticepilot.s24Board716TraceAudit.v0.1"
TRACE_FIELDS = {
    "sourceSegment",
    "temporalRole",
    "temporalMention",
    "boundTemporalFact",
    "semanticClassification",
    "applicabilityJudgment",
    "publishabilityJudgment",
}


def legacy_projection(candidate: dict[str, Any]) -> dict[str, Any]:
    return {key: copy.deepcopy(value) for key, value in candidate.items() if key not in TRACE_FIELDS}


def map_candidates(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(row.get("id")): row for row in rows}


def all_decision_candidates(path: Path) -> list[dict[str, Any]]:
    return [candidate for decision in read_jsonl(path) for candidate in decision.get("candidates") or []]


def validate_trace(candidate: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    cid = str(candidate.get("id") or "unknown")
    segment = candidate.get("sourceSegment")
    mention = candidate.get("temporalMention")
    fact = candidate.get("boundTemporalFact")
    semantic = candidate.get("semanticClassification")
    role = candidate.get("temporalRole")
    if not isinstance(segment, dict):
        return [f"{cid}: sourceSegment is not an object"]
    if not isinstance(mention, dict):
        errors.append(f"{cid}: temporalMention is not an object")
    if not isinstance(fact, dict):
        errors.append(f"{cid}: boundTemporalFact is not an object")
    if not isinstance(semantic, dict):
        errors.append(f"{cid}: semanticClassification is not an object")
    if not isinstance(role, str) or not role:
        errors.append(f"{cid}: temporalRole is not a string")
    if errors:
        return errors
    segment_id = segment.get("segmentId")
    if mention.get("segmentId") != segment_id:
        errors.append(f"{cid}: temporalMention.segmentId mismatch")
    if fact.get("segmentId") != segment_id:
        errors.append(f"{cid}: boundTemporalFact.segmentId mismatch")
    if fact.get("sourceNoticeId") != candidate.get("sourceNoticeId"):
        errors.append(f"{cid}: boundTemporalFact.sourceNoticeId mismatch")
    if mention.get("mentionId") not in (fact.get("temporalMentionIds") or []):
        errors.append(f"{cid}: mentionId is not bound")
    for field in ("eventType", "actionType", "temporalRole"):
        expected = candidate.get(field)
        if semantic.get(field) != expected:
            errors.append(f"{cid}: semanticClassification.{field} mismatch")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    baseline = args.baseline.resolve()
    current = args.current.resolve()

    baseline_pub = read_jsonl(baseline / "decisions" / "publishable-candidates.jsonl")
    current_pub = read_jsonl(current / "decisions" / "publishable-candidates.jsonl")
    baseline_map = map_candidates(baseline_pub)
    current_map = map_candidates(current_pub)
    id_sets_match = set(baseline_map) == set(current_map)

    legacy_mismatches: list[str] = []
    if id_sets_match:
        for cid in sorted(baseline_map):
            if legacy_projection(baseline_map[cid]) != legacy_projection(current_map[cid]):
                legacy_mismatches.append(cid)

    baseline_review = canonical_review(read_jsonl(baseline / "decisions" / "review-queue.jsonl"))
    current_review = canonical_review(read_jsonl(current / "decisions" / "review-queue.jsonl"))
    review_match = baseline_review == current_review

    all_candidates = all_decision_candidates(current / "decisions" / "notices.jsonl")
    trace_errors: list[str] = []
    for candidate in all_candidates:
        trace_errors.extend(validate_trace(candidate))

    board716 = [
        candidate for candidate in all_candidates
        if candidate.get("eventType") == "job_application_period"
        and str(candidate.get("sourceNoticeId") or "").startswith("knu-716-")
    ]
    board716_contract_errors: list[str] = []
    for candidate in board716:
        cid = str(candidate.get("id") or "unknown")
        segment = candidate.get("sourceSegment") or {}
        fact = candidate.get("boundTemporalFact") or {}
        semantic = candidate.get("semanticClassification") or {}
        if segment.get("segmentType") != "label_value" or segment.get("labelText") != "접수기간":
            board716_contract_errors.append(f"{cid}: invalid metadata segment")
        if not segment.get("locallyGrounded"):
            board716_contract_errors.append(f"{cid}: metadata segment not locally grounded")
        if fact.get("bindingKind") != "same_segment":
            board716_contract_errors.append(f"{cid}: invalid bindingKind")
        if fact.get("ruleId") != "binding.board716.list_metadata.application_period":
            board716_contract_errors.append(f"{cid}: invalid binding ruleId")
        if semantic.get("ruleId") != "semantic.board716.exact_application_period":
            board716_contract_errors.append(f"{cid}: invalid semantic ruleId")
        if candidate.get("createdBy") != "rule":
            board716_contract_errors.append(f"{cid}: createdBy changed")

    ics_match: dict[str, bool] = {}
    for feed, filename in (
        ("student_default", "noticepilot-student-default.ics"),
        ("job_application", "noticepilot-job-applications.ics"),
    ):
        ics_match[feed] = canonical_ics_events(baseline / "ics" / feed / filename) == canonical_ics_events(
            current / "ics" / feed / filename
        )

    summary = read_json(current / "reports" / "policy-summary.json")
    expected_summary = {
        "candidateCount": 1304,
        "structuredSegmentCandidateCount": 1304,
        "locallyGroundedCandidateCount": 1238,
        "labelValueCandidateCount": 853,
    }
    summary_match = (
        summary.get("candidateCount") == expected_summary["candidateCount"]
        and summary.get("structuredSegmentCandidateCount") == expected_summary["structuredSegmentCandidateCount"]
        and summary.get("locallyGroundedCandidateCount") == expected_summary["locallyGroundedCandidateCount"]
        and (summary.get("sourceSegmentTypeCounts") or {}).get("label_value") == expected_summary["labelValueCandidateCount"]
    )

    checks = {
        "publishableIdSetsMatch": id_sets_match,
        "legacyCandidateProjectionMismatchCount": len(legacy_mismatches),
        "reviewQueueMatches": review_match,
        "candidateCount": len(all_candidates),
        "uniqueCandidateIdCount": len({str(candidate.get('id')) for candidate in all_candidates}),
        "completeTraceCandidateCount": sum(
            1 for candidate in all_candidates
            if all(isinstance(candidate.get(field), dict) for field in (
                "sourceSegment", "temporalMention", "boundTemporalFact", "semanticClassification"
            )) and isinstance(candidate.get("temporalRole"), str)
        ),
        "traceErrorCount": len(trace_errors),
        "board716CandidateCount": len(board716),
        "board716ContractErrorCount": len(board716_contract_errors),
        "summaryMatchesExpectedS24A": summary_match,
        "icsMatches": ics_match,
    }
    passed = (
        id_sets_match
        and not legacy_mismatches
        and review_match
        and len(all_candidates) == 1304
        and len({str(candidate.get('id')) for candidate in all_candidates}) == 1304
        and not trace_errors
        and len(board716) == 300
        and not board716_contract_errors
        and summary_match
        and all(ics_match.values())
    )
    report = {
        "schemaVersion": SCHEMA_VERSION,
        "result": "pass" if passed else "fail",
        "baselineDir": str(baseline),
        "currentDir": str(current),
        "checks": checks,
        "samples": {
            "legacyCandidateProjectionMismatches": legacy_mismatches[:20],
            "traceErrors": trace_errors[:20],
            "board716ContractErrors": board716_contract_errors[:20],
        },
    }
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    output = args.output or current / "reports" / "s24-board716-trace-audit.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(encoded, encoding="utf-8")
    print(encoded, end="")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
