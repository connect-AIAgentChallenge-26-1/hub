#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from copy import deepcopy
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from noticepilot_feed_eligibility import (
    FEED_ELIGIBILITY_VERSION,
    build_eligibility_input_views,
    evaluate_views,
    get_approved_modes,
    get_default_profile_policy,
    load_feed_eligibility_policy,
    policy_is_resolved,
)
from noticepilot_subscription_profile import load_canonical_board_map, load_profile_examples

AUDIT_SCHEMA_VERSION = "noticepilot.s28FeedEligibilityPolicyAudit.v0.2"
AUDITOR_VERSION = "0.2.0"
EXPECTED_S27C_MANIFEST_SHA256 = "47fa8e232254df978575f31e06d555c20cf5f50e99862dc8ae0e772a7e4a03dc"
EXPECTED_S27D_MANIFEST_SHA256 = "922eacc5a270f5119d0e86892d961ed742486b35b6a65d7a0d1642119820481f"
POLICY_RELATIVE_PATH = "configs/noticepilot_feed_eligibility_policy.v0.2.json"


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def _count_eligible(decisions: list[dict[str, Any]]) -> int:
    return sum(1 for row in decisions if row["eligible"])


def build_decision_record(policy: dict[str, Any]) -> dict[str, Any]:
    decisions = policy["decisions"]
    provenance = policy["decisionProvenance"]
    return {
        "schemaVersion": "noticepilot.s28FeedEligibilityCreatorDecisionRecord.v0.1",
        "status": "approved",
        "policySchemaVersion": policy["schemaVersion"],
        "policyVersion": policy["policyVersion"],
        "approvedAt": policy["approvedAt"],
        "decisions": [
            {
                "id": "E1",
                "topic": "source_link_match_mode",
                "selected": decisions["sourceLinkMatchMode"],
                "source": provenance["E1"]["source"],
            },
            {
                "id": "E2",
                "topic": "review_state_aggregation",
                "selected": decisions["reviewStateAggregationMode"],
                "source": provenance["E2"]["source"],
            },
            {
                "id": "E3",
                "topic": "default_student_profile_policy",
                "selected": decisions["defaultStudentProfilePolicy"],
                "source": provenance["E3"]["source"],
                "contract": provenance["E3"]["contract"],
            },
            {
                "id": "E4",
                "topic": "default_job_profile_policy",
                "selected": decisions["defaultJobProfilePolicy"],
                "source": provenance["E4"]["source"],
                "contract": provenance["E4"]["contract"],
            },
            {
                "id": "E5",
                "topic": "audience_unscoped_default",
                "selected": decisions["audienceUnscopedDefault"],
                "source": provenance["E5"]["source"],
            },
        ],
        "unresolvedDecisionIds": [],
    }


def build_decision_queue_compatibility() -> dict[str, Any]:
    return {
        "schemaVersion": "noticepilot.s28FeedEligibilityCreatorDecisionQueue.v0.2",
        "status": "completed",
        "unresolvedDecisions": [],
        "supersededBy": "creator-decision-record.json",
    }


def _apply_default_policy(profile: dict[str, Any], default_policy: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(profile)
    result["status"] = "active"
    result["campusSelection"]["includeUnknownCampusEvents"] = default_policy[
        "includeUnknownCampusEvents"
    ]
    result["eventSelection"]["includeReviewRequiredEvents"] = default_policy[
        "includeReviewRequiredEvents"
    ]
    result["audienceFilter"]["unscopedEventPolicy"] = "include"
    return result


def build_report(root: Path, output_dir: Path | None = None) -> dict[str, Any]:
    root = root.resolve()
    errors: list[str] = []
    policy_path = root / POLICY_RELATIVE_PATH
    try:
        policy = load_feed_eligibility_policy(policy_path)
    except Exception as exc:
        policy = {}
        errors.append(f"policy validation failed: {exc}")

    try:
        views = build_eligibility_input_views(root)
    except Exception as exc:
        views = []
        errors.append(f"input view construction failed: {exc}")

    board_map = load_canonical_board_map(root / "configs/knu_board_registry.v0.2.json")
    student_example, job_example = load_profile_examples(
        root / "configs/subscription_profile_contract_examples.v0.1.json",
        canonical_board_map=board_map,
    )

    scenario: dict[str, Any] = {}
    approved_modes: tuple[str, str] | None = None
    if policy:
        try:
            approved_modes = get_approved_modes(policy)
        except Exception as exc:
            errors.append(f"approved modes unavailable: {exc}")

    if views and policy and approved_modes:
        source_mode, review_mode = approved_modes
        student_default = _apply_default_policy(
            student_example, get_default_profile_policy(policy, "student")
        )
        job_default = _apply_default_policy(
            job_example, get_default_profile_policy(policy, "job")
        )

        student_approved = evaluate_views(
            student_default,
            views,
            source_match_mode=source_mode,
            review_aggregation_mode=review_mode,
        )
        job_approved = evaluate_views(
            job_default,
            views,
            source_match_mode=source_mode,
            review_aggregation_mode=review_mode,
        )

        job_unknown_excluded = deepcopy(job_default)
        job_unknown_excluded["campusSelection"]["includeUnknownCampusEvents"] = False
        job_exclude_unknown = evaluate_views(
            job_unknown_excluded,
            views,
            source_match_mode=source_mode,
            review_aggregation_mode=review_mode,
        )

        general = deepcopy(student_default)
        general["campusSelection"]["selectedCampuses"] = [
            "chuncheon", "samcheok", "dogye", "gangneung_wonju"
        ]
        general["sourceSelection"]["selectedBoardIds"] = ["504"]
        general["sourceSelection"]["selectedNoticeTypes"] = ["general_notice"]
        general_canonical = evaluate_views(
            general,
            views,
            source_match_mode="canonical_source_only",
            review_aggregation_mode=review_mode,
        )
        general_any = evaluate_views(
            general,
            views,
            source_match_mode="any_active_source_link",
            review_aggregation_mode=review_mode,
        )

        year3 = deepcopy(student_default)
        year3["campusSelection"]["selectedCampuses"] = [
            "chuncheon", "samcheok", "dogye", "gangneung_wonju"
        ]
        year3["audienceFilter"] = {
            "enabled": True,
            "degreeLevels": [],
            "studentYears": [3],
            "enrollmentStatuses": [],
            "admissionTypes": [],
            "matchMode": "all_dimensions",
            "unscopedEventPolicy": "include",
        }
        year3_include = evaluate_views(
            year3,
            views,
            source_match_mode=source_mode,
            review_aggregation_mode=review_mode,
        )
        year3["audienceFilter"]["unscopedEventPolicy"] = "exclude"
        year3_exclude = evaluate_views(
            year3,
            views,
            source_match_mode=source_mode,
            review_aggregation_mode=review_mode,
        )

        scenario = {
            "approvedContractExamples": {
                "studentIncluded": _count_eligible(student_approved),
                "jobIncluded": _count_eligible(job_approved),
            },
            "jobUnknownCampus": {
                "approvedUnknownIncluded": _count_eligible(job_approved),
                "counterfactualUnknownExcluded": _count_eligible(job_exclude_unknown),
                "delta": _count_eligible(job_approved) - _count_eligible(job_exclude_unknown),
            },
            "generalBoardOnly": {
                "approvedCanonicalSourceOnly": _count_eligible(general_canonical),
                "counterfactualAnyActiveSourceLink": _count_eligible(general_any),
                "delta": _count_eligible(general_any) - _count_eligible(general_canonical),
            },
            "studentYear3": {
                "approvedUnscopedInclude": _count_eligible(year3_include),
                "counterfactualUnscopedExclude": _count_eligible(year3_exclude),
            },
        }

    campus_counts = Counter()
    audience_counts = Counter()
    relation_source_counts = Counter()
    review_counts = Counter()
    temporal_counts = Counter()
    for view in views:
        campus_counts[view["campusScope"].get("scopeType")] += 1
        audience_counts[
            "personalization_ready" if view["audienceRules"].get("personalizationReady") else "unscoped"
        ] += 1
        relation_source_counts[len(view["sourceLinks"])] += 1
        temporal_counts[
            "valid_normalized_date" if view["temporalState"]["hasValidNormalizedDate"] else "invalid_normalized_date"
        ] += 1
        if view["reviewState"]["unknownCandidateIds"]:
            review_counts["unknown"] += 1
        elif view["reviewState"]["anySourceRequiresReview"]:
            review_counts["needs_review"] += 1
        elif view["reviewState"]["allSourcesAutoConfirmed"]:
            review_counts["auto_confirmed"] += 1

    registry_manifest = root / "registry/s27c-v1/manifest.json"
    projection_manifest = root / "projection/s27d-v1/manifest.json"
    registry_hash = file_sha256(registry_manifest)
    projection_hash = file_sha256(projection_manifest)
    if registry_hash != EXPECTED_S27C_MANIFEST_SHA256:
        errors.append("S27-C registry manifest changed from foundation.17/18/19")
    if projection_hash != EXPECTED_S27D_MANIFEST_SHA256:
        errors.append("S27-D projection manifest changed from foundation.17/18/19")
    if len(views) != 900:
        errors.append(f"expected 900 eligibility input views, got {len(views)}")
    if sum(len(view["sourceLinks"]) for view in views) != 909:
        errors.append("expected 909 joined source links")
    if review_counts.get("unknown", 0) != 0:
        errors.append("active event review states must all resolve")
    if temporal_counts.get("valid_normalized_date", 0) != 900:
        errors.append("all 900 active events must have a valid normalized date")
    if policy and not policy_is_resolved(policy):
        errors.append("feed eligibility policy must be fully resolved")

    record = build_decision_record(policy) if policy else {
        "schemaVersion": "noticepilot.s28FeedEligibilityCreatorDecisionRecord.v0.1",
        "status": "invalid",
        "decisions": [],
        "unresolvedDecisionIds": [],
    }
    queue = build_decision_queue_compatibility()
    report = {
        "schemaVersion": AUDIT_SCHEMA_VERSION,
        "auditorVersion": AUDITOR_VERSION,
        "result": "pass" if not errors else "fail",
        "status": "completed",
        "scope": {
            "subscriptionProfileContractImplemented": True,
            "authoritativeEligibilityInputViewImplemented": True,
            "singleEventEligibilityEvaluatorImplemented": True,
            "reasonVocabularyImplemented": True,
            "authoritativeDefaultProfilePoliciesApproved": True,
            "feedBuilderImplemented": False,
            "feedSnapshotImplemented": False,
            "icsMutationPerformed": False,
            "s27RegistryMutationPerformed": False,
        },
        "policy": {
            "path": POLICY_RELATIVE_PATH,
            "schemaVersion": policy.get("schemaVersion") if policy else None,
            "policyVersion": policy.get("policyVersion") if policy else None,
            "policyStatus": policy.get("status") if policy else None,
            "fullyResolved": policy_is_resolved(policy) if policy else False,
            "approvedDecisionCount": len(record["decisions"]),
            "unresolvedDecisionCount": 0,
            "creatorDecisionCount": 3,
            "inheritedAuthoritativeContractDecisionCount": 2,
            "approvedModes": {
                "sourceLinkMatchMode": approved_modes[0] if approved_modes else None,
                "reviewStateAggregationMode": approved_modes[1] if approved_modes else None,
            },
            "defaultStudentProfilePolicy": policy.get("decisions", {}).get("defaultStudentProfilePolicy") if policy else None,
            "defaultJobProfilePolicy": policy.get("decisions", {}).get("defaultJobProfilePolicy") if policy else None,
            "audienceUnscopedDefault": policy.get("decisions", {}).get("audienceUnscopedDefault") if policy else None,
        },
        "counts": {
            "activeCalendarEventCount": len(views),
            "joinedSourceLinkCount": sum(len(view["sourceLinks"]) for view in views),
            "singleSourceEventCount": relation_source_counts.get(1, 0),
            "multiSourceEventCount": sum(count for links, count in relation_source_counts.items() if links > 1),
            "validNormalizedDateEventCount": temporal_counts.get("valid_normalized_date", 0),
            "invalidNormalizedDateEventCount": temporal_counts.get("invalid_normalized_date", 0),
            "campusScopeCounts": dict(sorted(campus_counts.items())),
            "audienceScopeCounts": dict(sorted(audience_counts.items())),
            "reviewStateCounts": dict(sorted(review_counts.items())),
            "upstreamReviewQueueCandidateCount": 395,
        },
        "scenarioDiagnostics": scenario,
        "immutability": {
            "s27cManifestSha256": registry_hash,
            "s27cManifestExpectedSha256": EXPECTED_S27C_MANIFEST_SHA256,
            "s27dManifestSha256": projection_hash,
            "s27dManifestExpectedSha256": EXPECTED_S27D_MANIFEST_SHA256,
        },
        "errors": errors,
    }

    if output_dir is not None:
        output_dir.mkdir(parents=True, exist_ok=True)
        write_jsonl(output_dir / "eligibility-input-views.jsonl", views)
        write_json(output_dir / "creator-decision-record.json", record)
        write_json(output_dir / "creator-decision-queue.json", queue)
        write_json(output_dir / "s28-feed-eligibility-policy-audit.json", report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    output = args.output_dir or args.root / "derived/mvp-policy-v0.1/reports/s28-feed-eligibility"
    report = build_report(args.root, output)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["result"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
