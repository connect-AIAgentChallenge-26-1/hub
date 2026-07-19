#!/usr/bin/env python3
"""S28-5 profile matrix and full-corpus feed audit primitives.

The matrix is an audit surface, not a source of product defaults. It combines
already-approved SubscriptionProfile dimensions and runs each explicit profile
against the full 900-event S28 eligibility corpus using the S28-3 deterministic
FeedBuilder. It does not issue delivery URLs/tokens, mutate snapshots, or
serialize ICS.
"""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

from noticepilot_feed_builder import (
    DeterministicFeedBuilder,
    FeedBuildOutput,
    load_default_profile_collection,
)
from noticepilot_feed_eligibility import REASON_PRECEDENCE, validate_eligibility_input_view
from noticepilot_subscription_profile import PHYSICAL_CAMPUSES, validate_subscription_profile

PROFILE_MATRIX_VERSION = "0.1.0"
PROFILE_MATRIX_SCHEMA_VERSION = "noticepilot.profileMatrix.v0.1"
PROFILE_MATRIX_RESULT_SCHEMA_VERSION = "noticepilot.profileMatrixResult.v0.1"
PROFILE_MATRIX_PURPOSE = "full_corpus_feed_audit_only"

CASE_PROFILE_IDS = {
    'campus.student.chuncheon': "subprof_cee11b0ba94ab235cbc58aa1ea615852",
    'campus.student.samcheok': "subprof_09a89ec1b5823c1440060c17f01b12a0",
    'campus.student.dogye': "subprof_41252cb3c3016bb9aa016d04a89aac11",
    'campus.student.gangneung_wonju': "subprof_eeb9313dbcb043e516ca73f3cc7bea4b",
    'campus.job.chuncheon': "subprof_1b999c38af0d4e3ba9213fb8a24fd2ca",
    'campus.job.samcheok': "subprof_c70264a1239f0193cc8173572bd2d43f",
    'campus.job.dogye': "subprof_b249ae2cdc3cb462fb8e8a97e8f7750d",
    'campus.job.gangneung_wonju': "subprof_7e6976e72832512e2fe33a210be82942",
    'policy.student.exclude_common': "subprof_e12730413f64048e163c14d1fcde5d60",
    'policy.student.exclude_unknown': "subprof_a7961b3a4adc1099811a60e36d109ea0",
    'policy.student.exclude_review': "subprof_365bff5aaf4547f80179dbe531f8b9d9",
    'policy.job.exclude_common': "subprof_4121e187e4f39fb2e20913e58fdfad15",
    'policy.job.exclude_unknown': "subprof_2d85a3366b5cc3d8cdd3c0329ab9645a",
    'policy.job.exclude_review': "subprof_6a2d81c8f521727dcbd3318e53c46d78",
    'audience.student.graduate.include_unscoped': "subprof_28af3ce1a052cc17ed5f0e534061a29d",
    'audience.student.graduate.exclude_unscoped': "subprof_5d70cfda8b21e4e8ecf5b105e2286a3a",
    'audience.student.year3.include_unscoped': "subprof_ad1017107b7f9c70cef0318794296b37",
    'audience.student.year3.exclude_unscoped': "subprof_8b74ef58ea059e236d12e8995ea14cfc",
    'audience.student.enrolled.include_unscoped': "subprof_e15cf935ba0924a8609252275ab4d1fd",
    'audience.student.enrolled.exclude_unscoped': "subprof_31803d07b688b1d1b233b98a3c66b8c1",
    'audience.student.new_student.include_unscoped': "subprof_b07893e6e9f3e5f780b41a8f66c68eff",
    'audience.student.new_student.exclude_unscoped': "subprof_5502de72f1a49a97339cb920a6d35d94",
    'status.student.paused': "subprof_29f98efba7a18fc4be6c79f150f93310",
    'status.job.revoked': "subprof_b9b8ac94c207fae08c96d9603685a021",
    'source.board.504': "subprof_5e6c7aad2fbfca566b3887eaab9c05be",
    'source.board.715': "subprof_86e41af07e39fc261078d137318943f5",
    'source.board.716': "subprof_b92b2beb03f188d8553a59797d81eed2",
    'source.board.717': "subprof_75c725c0d30710ccc2017c519c076c3d",
    'source.board.719': "subprof_2d5d2a8c92f8e50691ee0d42f0e24a01",
    'source.board.720': "subprof_cb30c7f6a97f33b0ccd0b108e2681e6d",
    'source.board.721': "subprof_5d02b6f0bc205e6f39e02f58ec748d48",
    'source.board.722': "subprof_c3dff8167eae65d53e628edae6119ffe",
    'source.board.723': "subprof_92f28f51b17d96793d4f7056fc34b216",
    'event_type.student.academic_period': "subprof_4a5b80fe2689d4a6a0fe0b2fac522551",
    'event_type.student.application_period': "subprof_20f03716273166f595bb9d229c307449",
    'event_type.student.deadline': "subprof_ae43117d505002dcf87abaf31c6b5f39",
    'event_type.student.event': "subprof_e7c2e2d8cf08f6fc901d433ef9f2b4cc",
    'event_type.student.exam_or_interview': "subprof_0f91e45227a8c65dfeb321bf6868b623",
    'event_type.student.payment_period': "subprof_c3260d82a76029adca34c60feca8ba1e",
    'event_type.student.result_announcement': "subprof_c8d4f89d5b62458d94a6ed8a3f99f49e",
    'event_type.student.submission_period': "subprof_085ca69a9b7bb37e1ae317e60d4bc442",
    'event_type.job.job_application_period': "subprof_18b4eb2ce1331db9ab60f7c2faf0dcb4",
}

STUDENT_EVENT_TYPES = (
    "academic_period", "application_period", "deadline", "event",
    "exam_or_interview", "payment_period", "result_announcement", "submission_period",
)
CANONICAL_BOARD_IDS = ("504", "715", "716", "717", "719", "720", "721", "722", "723")


class ProfileMatrixError(ValueError):
    pass


def canonical_sha256(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _clone(base: Mapping[str, Any], case_id: str, label: str) -> dict[str, Any]:
    profile = deepcopy(dict(base))
    profile["profileId"] = CASE_PROFILE_IDS[case_id]
    profile["profileRevision"] = 1
    profile["displayName"] = f"S28-5 감사 — {label}"
    profile["calendarName"] = f"NoticePilot S28-5 {label}"
    return profile


def _case(case_id: str, category: str, description: str, profile: Mapping[str, Any], *, reference: bool = False) -> dict[str, Any]:
    return {
        "caseId": case_id,
        "category": category,
        "description": description,
        "referenceDefault": reference,
        "profile": deepcopy(dict(profile)),
    }


def build_profile_matrix(
    *,
    student_profile: Mapping[str, Any],
    job_profile: Mapping[str, Any],
    canonical_board_map: Mapping[str, str],
) -> dict[str, Any]:
    cases: list[dict[str, Any]] = [
        _case("reference.student_all", "reference", "전체 캠퍼스 학생 기준 프로필", student_profile, reference=True),
        _case("reference.job_all", "reference", "전체 캠퍼스 채용 기준 프로필", job_profile, reference=True),
    ]

    for kind, base in (("student", student_profile), ("job", job_profile)):
        for campus in ("chuncheon", "samcheok", "dogye", "gangneung_wonju"):
            case_id = f"campus.{kind}.{campus}"
            profile = _clone(base, case_id, f"{kind} {campus}")
            profile["campusSelection"]["selectedCampuses"] = [campus]
            cases.append(_case(case_id, "campus", f"{kind} 단일 캠퍼스 교집합", profile))

        for suffix, field in (
            ("exclude_common", "includeAllCampusEvents"),
            ("exclude_unknown", "includeUnknownCampusEvents"),
            ("exclude_review", "includeReviewRequiredEvents"),
        ):
            case_id = f"policy.{kind}.{suffix}"
            profile = _clone(base, case_id, f"{kind} {suffix}")
            if field in profile["campusSelection"]:
                profile["campusSelection"][field] = False
            else:
                profile["eventSelection"][field] = False
            cases.append(_case(case_id, "policy_toggle", f"{kind} {field}=false", profile))

    audience_cases = (
        ("graduate", "degreeLevels", ["graduate"]),
        ("year3", "studentYears", [3]),
        ("enrolled", "enrollmentStatuses", ["enrolled"]),
        ("new_student", "admissionTypes", ["new_student"]),
    )
    for key, field, values in audience_cases:
        for unscoped in ("include", "exclude"):
            suffix = "include_unscoped" if unscoped == "include" else "exclude_unscoped"
            case_id = f"audience.student.{key}.{suffix}"
            profile = _clone(student_profile, case_id, f"student audience {key} {unscoped}")
            profile["audienceFilter"] = {
                "enabled": True,
                "degreeLevels": [],
                "studentYears": [],
                "enrollmentStatuses": [],
                "admissionTypes": [],
                "matchMode": "all_dimensions",
                "unscopedEventPolicy": unscoped,
            }
            profile["audienceFilter"][field] = list(values)
            cases.append(_case(case_id, "audience", f"student {field}={values}, unscoped={unscoped}", profile))

    for kind, base, status in (("student", student_profile, "paused"), ("job", job_profile, "revoked")):
        case_id = f"status.{kind}.{status}"
        profile = _clone(base, case_id, f"{kind} {status}")
        profile["status"] = status
        cases.append(_case(case_id, "status", f"{kind} profile status={status}", profile))

    for board_id in CANONICAL_BOARD_IDS:
        if board_id not in canonical_board_map:
            raise ProfileMatrixError(f"canonical board registry is missing {board_id}")
        base = job_profile if board_id == "716" else student_profile
        case_id = f"source.board.{board_id}"
        profile = _clone(base, case_id, f"canonical board {board_id}")
        profile["sourceSelection"]["selectedBoardIds"] = [board_id]
        profile["sourceSelection"]["selectedNoticeTypes"] = [canonical_board_map[board_id]]
        cases.append(_case(case_id, "source_board", f"canonical board {board_id} only", profile))

    for event_type in STUDENT_EVENT_TYPES:
        case_id = f"event_type.student.{event_type}"
        profile = _clone(student_profile, case_id, f"student event type {event_type}")
        profile["eventSelection"]["includedEventTypes"] = [event_type]
        cases.append(_case(case_id, "event_type", f"student event type {event_type} only", profile))
    case_id = "event_type.job.job_application_period"
    profile = _clone(job_profile, case_id, "job event type job_application_period")
    profile["eventSelection"]["includedEventTypes"] = ["job_application_period"]
    cases.append(_case(case_id, "event_type", "job event type job_application_period only", profile))

    matrix = {
        "schemaVersion": PROFILE_MATRIX_SCHEMA_VERSION,
        "matrixVersion": PROFILE_MATRIX_VERSION,
        "purpose": PROFILE_MATRIX_PURPOSE,
        "auditOnly": True,
        "authoritativeProductDefaults": False,
        "userCampusDefaultEstablished": False,
        "caseCount": len(cases),
        "cases": cases,
    }
    validate_profile_matrix(matrix, canonical_board_map=canonical_board_map)
    return matrix


def validate_profile_matrix(matrix: Mapping[str, Any], *, canonical_board_map: Mapping[str, str]) -> list[dict[str, Any]]:
    required = {
        "schemaVersion", "matrixVersion", "purpose", "auditOnly",
        "authoritativeProductDefaults", "userCampusDefaultEstablished", "caseCount", "cases",
    }
    if not isinstance(matrix, Mapping) or set(matrix) != required:
        raise ProfileMatrixError("profile matrix key mismatch")
    if matrix["schemaVersion"] != PROFILE_MATRIX_SCHEMA_VERSION or matrix["matrixVersion"] != PROFILE_MATRIX_VERSION:
        raise ProfileMatrixError("unsupported profile matrix version")
    if matrix["purpose"] != PROFILE_MATRIX_PURPOSE or matrix["auditOnly"] is not True:
        raise ProfileMatrixError("profile matrix must be audit-only")
    if matrix["authoritativeProductDefaults"] is not False or matrix["userCampusDefaultEstablished"] is not False:
        raise ProfileMatrixError("matrix must not establish product or campus defaults")
    cases = matrix["cases"]
    if not isinstance(cases, list) or matrix["caseCount"] != len(cases) or len(cases) != 44:
        raise ProfileMatrixError("profile matrix requires exactly 44 cases")
    case_ids: set[str] = set()
    profile_ids: set[str] = set()
    validated_cases: list[dict[str, Any]] = []
    for row in cases:
        if not isinstance(row, Mapping) or set(row) != {"caseId", "category", "description", "referenceDefault", "profile"}:
            raise ProfileMatrixError("profile matrix case key mismatch")
        case_id = row["caseId"]
        if not isinstance(case_id, str) or not case_id or case_id in case_ids:
            raise ProfileMatrixError("profile matrix case IDs must be unique non-empty strings")
        case_ids.add(case_id)
        if row["category"] not in {"reference", "campus", "policy_toggle", "audience", "status", "source_board", "event_type"}:
            raise ProfileMatrixError(f"unsupported matrix category: {row['category']}")
        profile = validate_subscription_profile(row["profile"], canonical_board_map=canonical_board_map)
        if profile["profileId"] in profile_ids:
            raise ProfileMatrixError("matrix profile IDs must be unique")
        profile_ids.add(profile["profileId"])
        validated_cases.append({**dict(row), "profile": profile})
    expected_ids = {"reference.student_all", "reference.job_all"} | set(CASE_PROFILE_IDS)
    if case_ids != expected_ids:
        raise ProfileMatrixError(f"matrix case set mismatch: missing={sorted(expected_ids-case_ids)}, extra={sorted(case_ids-expected_ids)}")
    return validated_cases


@dataclass(frozen=True, slots=True)
class ProfileMatrixRun:
    result: dict[str, Any]
    outputs: Mapping[str, FeedBuildOutput]


def run_profile_matrix(
    *,
    matrix: Mapping[str, Any],
    builder: DeterministicFeedBuilder,
    views: Sequence[Mapping[str, Any]],
    canonical_board_map: Mapping[str, str],
) -> ProfileMatrixRun:
    cases = validate_profile_matrix(matrix, canonical_board_map=canonical_board_map)
    for view in views:
        validate_eligibility_input_view(view)
    event_ids = {str(view["calendarEventId"]) for view in views}
    if len(views) != 900 or len(event_ids) != 900:
        raise ProfileMatrixError("S28-5 matrix requires exactly 900 unique active events")

    outputs: dict[str, FeedBuildOutput] = {}
    reverse_stable = True
    case_results: list[dict[str, Any]] = []
    all_reason_codes: Counter[str] = Counter()
    primary_reason_codes: Counter[str] = Counter()
    for row in cases:
        case_id = row["caseId"]
        output = builder.build(row["profile"], views)
        reverse = builder.build(row["profile"], reversed(views))
        if output.result != reverse.result or output.decisions != reverse.decisions:
            reverse_stable = False
        outputs[case_id] = output
        all_reasons: Counter[str] = Counter()
        for decision in output.decisions:
            all_reasons.update(decision["reasonCodes"])
            all_reason_codes.update(decision["reasonCodes"])
            primary_reason_codes.update([decision["primaryReasonCode"]])
        case_results.append({
            "caseId": case_id,
            "category": row["category"],
            "profileId": row["profile"]["profileId"],
            "includedEventCount": output.result["includedEventCount"],
            "excludedEventCount": output.result["excludedEventCount"],
            "membershipSha256": canonical_sha256(output.result["includedEventIds"]),
            "feedBuildResultSha256": canonical_sha256(output.result),
            "decisionLedgerSha256": canonical_sha256(list(output.decisions)),
            "primaryReasonCounts": output.result["primaryReasonCounts"],
            "allReasonCounts": {code: all_reasons[code] for code in REASON_PRECEDENCE if all_reasons[code]},
        })

    by_id = {row["caseId"]: row for row in case_results}
    invariants: list[dict[str, Any]] = []
    def inv(identifier: str, passed: bool, details: Mapping[str, Any]) -> None:
        invariants.append({"invariantId": identifier, "passed": bool(passed), "details": dict(details)})

    student_ref = set(outputs["reference.student_all"].result["includedEventIds"])
    job_ref = set(outputs["reference.job_all"].result["includedEventIds"])
    inv("reference_partition", len(student_ref) == 601 and len(job_ref) == 299 and not student_ref & job_ref and student_ref | job_ref == event_ids,
        {"student": len(student_ref), "job": len(job_ref), "overlap": len(student_ref & job_ref), "union": len(student_ref | job_ref)})

    campus_subset_ok = True
    for kind, ref in (("student", student_ref), ("job", job_ref)):
        for campus in PHYSICAL_CAMPUSES:
            campus_subset_ok &= set(outputs[f"campus.{kind}.{campus}"].result["includedEventIds"]) <= ref
    inv("campus_profiles_are_reference_subsets", campus_subset_ok, {"checkedProfiles": 8})

    inv("unknown_toggle_delta", by_id["policy.student.exclude_unknown"]["includedEventCount"] == 601 and by_id["policy.job.exclude_unknown"]["includedEventCount"] == 298,
        {"student": by_id["policy.student.exclude_unknown"]["includedEventCount"], "job": by_id["policy.job.exclude_unknown"]["includedEventCount"]})
    inv("review_toggle_current_corpus_no_change", by_id["policy.student.exclude_review"]["includedEventCount"] == 601 and by_id["policy.job.exclude_review"]["includedEventCount"] == 299,
        {"student": by_id["policy.student.exclude_review"]["includedEventCount"], "job": by_id["policy.job.exclude_review"]["includedEventCount"]})
    inv("inactive_profiles_empty", by_id["status.student.paused"]["includedEventCount"] == 0 and by_id["status.job.revoked"]["includedEventCount"] == 0,
        {"pausedStudent": by_id["status.student.paused"]["includedEventCount"], "revokedJob": by_id["status.job.revoked"]["includedEventCount"]})

    board_case_ids = [f"source.board.{board}" for board in CANONICAL_BOARD_IDS]
    board_sets = [set(outputs[case].result["includedEventIds"]) for case in board_case_ids]
    board_union = set().union(*board_sets)
    board_overlap = sum(len(board_sets[i] & board_sets[j]) for i in range(len(board_sets)) for j in range(i + 1, len(board_sets)))
    inv("canonical_board_partition", board_union == event_ids and board_overlap == 0,
        {"union": len(board_union), "pairwiseOverlapTotal": board_overlap, "caseCount": len(board_sets)})

    event_case_ids = [f"event_type.student.{value}" for value in STUDENT_EVENT_TYPES] + ["event_type.job.job_application_period"]
    event_sets = [set(outputs[case].result["includedEventIds"]) for case in event_case_ids]
    event_union = set().union(*event_sets)
    event_overlap = sum(len(event_sets[i] & event_sets[j]) for i in range(len(event_sets)) for j in range(i + 1, len(event_sets)))
    inv("event_type_partition", event_union == event_ids and event_overlap == 0,
        {"union": len(event_union), "pairwiseOverlapTotal": event_overlap, "caseCount": len(event_sets)})

    audience_monotonic = True
    for key in ("graduate", "year3", "enrolled", "new_student"):
        include_case = outputs[f"audience.student.{key}.include_unscoped"].result["includedEventIds"]
        exclude_case = outputs[f"audience.student.{key}.exclude_unscoped"].result["includedEventIds"]
        audience_monotonic &= set(exclude_case) <= set(include_case) <= student_ref
    inv("audience_unscoped_exclusion_monotonic", audience_monotonic, {"checkedPairs": 4})
    inv("reverse_input_determinism", reverse_stable, {"caseCount": len(cases), "decisionCount": len(cases) * len(views)})

    personalization_ready = sorted(view["calendarEventId"] for view in views if view["audienceRules"]["personalizationReady"])
    unknown_campus = sorted(view["calendarEventId"] for view in views if view["campusScope"]["scopeType"] == "unknown")
    result = {
        "schemaVersion": PROFILE_MATRIX_RESULT_SCHEMA_VERSION,
        "matrixVersion": PROFILE_MATRIX_VERSION,
        "matrixSha256": canonical_sha256(matrix),
        "feedBuilderVersion": builder.version,
        "policySchemaVersion": builder.policy_schema_version,
        "policyVersion": builder.policy_version,
        "sourceContext": dict(builder.source_context),
        "inputEventCount": len(views),
        "profileCaseCount": len(cases),
        "decisionCount": len(cases) * len(views),
        "caseResults": case_results,
        "coverage": {
            "categoryCounts": dict(sorted(Counter(row["category"] for row in cases).items())),
            "primaryReasonCodesObserved": [code for code in REASON_PRECEDENCE if primary_reason_codes[code]],
            "allReasonCodesObserved": [code for code in REASON_PRECEDENCE if all_reason_codes[code]],
            "corpusUnreachableReasonCodes": [code for code in REASON_PRECEDENCE if not all_reason_codes[code]],
            "personalizationReadyEventCount": len(personalization_ready),
            "audienceUnscopedEventCount": len(views) - len(personalization_ready),
            "unknownCampusEventCount": len(unknown_campus),
            "canonicalBoardCaseCount": len(board_case_ids),
            "eventTypeCaseCount": len(event_case_ids),
        },
        "boundaryEventIds": {
            "unknownCampus": unknown_campus,
            "personalizationReady": personalization_ready,
        },
        "invariants": invariants,
        "result": "pass" if all(row["passed"] for row in invariants) else "fail",
    }
    validate_profile_matrix_result(result)
    return ProfileMatrixRun(result=result, outputs=outputs)


def validate_profile_matrix_result(result: Mapping[str, Any]) -> None:
    required = {
        "schemaVersion", "matrixVersion", "matrixSha256", "feedBuilderVersion",
        "policySchemaVersion", "policyVersion", "sourceContext", "inputEventCount",
        "profileCaseCount", "decisionCount", "caseResults", "coverage",
        "boundaryEventIds", "invariants", "result",
    }
    if not isinstance(result, Mapping) or set(result) != required:
        raise ProfileMatrixError("profile matrix result key mismatch")
    if result["schemaVersion"] != PROFILE_MATRIX_RESULT_SCHEMA_VERSION or result["matrixVersion"] != PROFILE_MATRIX_VERSION:
        raise ProfileMatrixError("unsupported profile matrix result version")
    if result["inputEventCount"] != 900 or result["profileCaseCount"] != 44 or result["decisionCount"] != 39600:
        raise ProfileMatrixError("profile matrix result count mismatch")
    if len(result["caseResults"]) != 44:
        raise ProfileMatrixError("profile matrix result requires 44 case results")
    if len({row["caseId"] for row in result["caseResults"]}) != 44:
        raise ProfileMatrixError("profile matrix result case IDs must be unique")
    if any(row["includedEventCount"] + row["excludedEventCount"] != 900 for row in result["caseResults"]):
        raise ProfileMatrixError("every matrix case must partition all 900 events")
    if result["result"] not in {"pass", "fail"}:
        raise ProfileMatrixError("profile matrix result must be pass or fail")
    if result["result"] == "pass" and not all(row["passed"] for row in result["invariants"]):
        raise ProfileMatrixError("pass result contains failed invariant")
    forbidden = {"subscriptionUrl", "feedToken", "feedTokenHash", "ics", "icsPath", "snapshotId", "snapshotHash"}
    if forbidden & set(result):
        raise ProfileMatrixError("delivery or snapshot fields leaked into profile matrix result")


def load_profile_matrix(path: Path, *, canonical_board_map: Mapping[str, str]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    matrix = json.loads(path.read_text(encoding="utf-8"))
    cases = validate_profile_matrix(matrix, canonical_board_map=canonical_board_map)
    return matrix, cases


def write_profile_matrix_artifacts(output_dir: Path, *, matrix: Mapping[str, Any], run: ProfileMatrixRun) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    matrix_path = output_dir / "profile-matrix.json"
    result_path = output_dir / "profile-matrix-results.json"
    rows_path = output_dir / "profile-matrix-case-results.jsonl"
    matrix_path.write_text(json.dumps(matrix, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    result_path.write_text(json.dumps(run.result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    rows_path.write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in run.result["caseResults"]), encoding="utf-8")
    return {"matrix": matrix_path.name, "result": result_path.name, "caseResults": rows_path.name}


__all__ = [
    "CANONICAL_BOARD_IDS", "CASE_PROFILE_IDS", "PROFILE_MATRIX_RESULT_SCHEMA_VERSION",
    "PROFILE_MATRIX_SCHEMA_VERSION", "PROFILE_MATRIX_VERSION", "ProfileMatrixError",
    "ProfileMatrixRun", "build_profile_matrix", "canonical_sha256", "load_profile_matrix",
    "run_profile_matrix", "validate_profile_matrix", "validate_profile_matrix_result",
    "write_profile_matrix_artifacts",
]
