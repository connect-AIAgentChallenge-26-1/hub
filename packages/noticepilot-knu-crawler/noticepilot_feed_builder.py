#!/usr/bin/env python3
"""S28-3 deterministic SubscriptionProfile FeedBuilder.

This module materializes approved default profile templates and deterministically
partitions active CalendarEvent projections into included and excluded event
sets. It deliberately does not issue a snapshot ID/hash, subscription URL/token,
or serialize ICS. Those responsibilities remain in S28-4/S29.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from noticepilot_feed_eligibility import (
    DECISION_SCHEMA_VERSION,
    REASON_PRECEDENCE,
    FeedEligibilityDecision,
    FeedEligibilityError,
    FeedEligibilityEvaluator,
    get_approved_modes,
    get_default_profile_policy,
    load_feed_eligibility_policy,
    validate_eligibility_input_view,
)
from noticepilot_subscription_profile import (
    PHYSICAL_CAMPUSES,
    SCHEMA_VERSION as SUBSCRIPTION_PROFILE_SCHEMA_VERSION,
    load_canonical_board_map,
    validate_subscription_profile,
)

FEED_BUILDER_VERSION = "0.1.0"
FEED_BUILD_RESULT_SCHEMA_VERSION = "noticepilot.feedBuildResult.v0.1"
DEFAULT_PROFILE_COLLECTION_SCHEMA_VERSION = "noticepilot.defaultSubscriptionProfiles.v0.1"

STUDENT_DEFAULT_PROFILE_ID = "subprof_9baaae14deb3460fa31777d362507cbc"
JOB_DEFAULT_PROFILE_ID = "subprof_0887a1e133464366af8d870e1950ca53"

STUDENT_BOARD_IDS = ("504", "715", "717", "719", "720", "721")
STUDENT_EVENT_TYPES = (
    "academic_period",
    "application_period",
    "deadline",
    "event",
    "exam_or_interview",
    "payment_period",
    "result_announcement",
    "submission_period",
)
JOB_BOARD_IDS = ("716",)
JOB_EVENT_TYPES = ("job_application_period",)

SORT_CONTRACT = {
    "included": ["normalizedStart_ascending", "calendarEventId_ascending"],
    "excluded": ["primaryReasonPrecedence_ascending", "calendarEventId_ascending"],
    "decisionLedger": ["calendarEventId_ascending"],
}
_REASON_ORDER = {code: index for index, code in enumerate(REASON_PRECEDENCE)}


class FeedBuilderError(ValueError):
    pass


def _deepcopy_json(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False))


def _profile_source_types(board_ids: Sequence[str], board_map: Mapping[str, str]) -> list[str]:
    try:
        return sorted({board_map[board_id] for board_id in board_ids})
    except KeyError as exc:
        raise FeedBuilderError(f"default profile references unknown canonical board: {exc.args[0]}") from exc


def create_default_subscription_profile(
    profile_kind: str,
    *,
    profile_id: str,
    selected_campuses: Sequence[str],
    created_at: str,
    updated_at: str | None = None,
    canonical_board_map: Mapping[str, str],
    policy: Mapping[str, Any],
    display_name: str | None = None,
    calendar_name: str | None = None,
) -> dict[str, Any]:
    """Materialize approved policy defaults into an explicit profile.

    Campus selection remains caller-owned and must always be supplied. The
    factory only materializes policy defaults already approved in S28-2.
    """
    if profile_kind not in {"student", "job"}:
        raise FeedBuilderError("profile_kind must be student or job")
    if not selected_campuses:
        raise FeedBuilderError("selected_campuses must be explicitly supplied")
    if len(set(selected_campuses)) != len(selected_campuses):
        raise FeedBuilderError("selected_campuses must be unique")
    invalid = sorted(set(selected_campuses) - set(PHYSICAL_CAMPUSES))
    if invalid:
        raise FeedBuilderError(f"unsupported selected campuses: {invalid}")

    default_policy = get_default_profile_policy(policy, profile_kind)
    unscoped_policy = policy["decisions"]["audienceUnscopedDefault"]
    if unscoped_policy != "include":
        raise FeedBuilderError("approved audience-unscoped default must be include")

    if profile_kind == "student":
        board_ids = STUDENT_BOARD_IDS
        event_types = STUDENT_EVENT_TYPES
        feed_scopes = ["student_default"]
        actors = ["student"]
        default_display = "기본 학생 일정"
        default_calendar = "NoticePilot 학생 일정"
    else:
        board_ids = JOB_BOARD_IDS
        event_types = JOB_EVENT_TYPES
        feed_scopes = ["job_application"]
        actors = ["job_applicant"]
        default_display = "기본 채용 일정"
        default_calendar = "NoticePilot 채용 접수 일정"

    profile = {
        "schemaVersion": SUBSCRIPTION_PROFILE_SCHEMA_VERSION,
        "profileId": profile_id,
        "profileRevision": 1,
        "institutionId": "kangwon",
        "displayName": display_name or default_display,
        "calendarName": calendar_name or default_calendar,
        "timezone": "Asia/Seoul",
        "status": "active",
        "campusSelection": {
            "selectedCampuses": list(selected_campuses),
            "includeAllCampusEvents": True,
            "includeUnknownCampusEvents": default_policy["includeUnknownCampusEvents"],
            "matchingMode": "intersects",
        },
        "sourceSelection": {
            "selectedBoardIds": list(board_ids),
            "selectedNoticeTypes": _profile_source_types(board_ids, canonical_board_map),
            "canonicalBoardsOnly": True,
            "matchingMode": "all_dimensions",
        },
        "eventSelection": {
            "includedFeedScopes": feed_scopes,
            "includedEventTypes": list(event_types),
            "includedTargetActors": actors,
            "includeReviewRequiredEvents": default_policy["includeReviewRequiredEvents"],
            "matchingMode": "all_dimensions",
        },
        "audienceFilter": {
            "enabled": False,
            "degreeLevels": [],
            "studentYears": [],
            "enrollmentStatuses": [],
            "admissionTypes": [],
            "matchMode": "all_dimensions",
            "unscopedEventPolicy": unscoped_policy,
        },
        "createdAt": created_at,
        "updatedAt": updated_at or created_at,
    }
    return validate_subscription_profile(profile, canonical_board_map=canonical_board_map)


def materialize_reference_default_profiles(
    *,
    canonical_board_map: Mapping[str, str],
    policy: Mapping[str, Any],
    created_at: str,
) -> dict[str, Any]:
    """Create two all-campus reference profiles for full-corpus parity audits.

    These profiles are authoritative for approved policy defaults but are not a
    claim that a user's campus preference defaults to all campuses.
    """
    campuses = ["chuncheon", "samcheok", "dogye", "gangneung_wonju"]
    profiles = [
        create_default_subscription_profile(
            "student",
            profile_id=STUDENT_DEFAULT_PROFILE_ID,
            selected_campuses=campuses,
            created_at=created_at,
            canonical_board_map=canonical_board_map,
            policy=policy,
            display_name="기준 프로필 — 전체 캠퍼스 학생 일정",
            calendar_name="NoticePilot 학생 일정",
        ),
        create_default_subscription_profile(
            "job",
            profile_id=JOB_DEFAULT_PROFILE_ID,
            selected_campuses=campuses,
            created_at=created_at,
            canonical_board_map=canonical_board_map,
            policy=policy,
            display_name="기준 프로필 — 전체 캠퍼스 채용 일정",
            calendar_name="NoticePilot 채용 접수 일정",
        ),
    ]
    return {
        "schemaVersion": DEFAULT_PROFILE_COLLECTION_SCHEMA_VERSION,
        "authoritativePolicyDefaults": True,
        "userCampusDefaultEstablished": False,
        "purpose": "all_campus_reference_profiles_for_deterministic_feed_builder_audit",
        "profiles": profiles,
    }


def validate_default_profile_collection(
    collection: Mapping[str, Any], *, canonical_board_map: Mapping[str, str]
) -> list[dict[str, Any]]:
    required = {
        "schemaVersion",
        "authoritativePolicyDefaults",
        "userCampusDefaultEstablished",
        "purpose",
        "profiles",
    }
    if not isinstance(collection, Mapping) or set(collection) != required:
        raise FeedBuilderError("default profile collection key mismatch")
    if collection["schemaVersion"] != DEFAULT_PROFILE_COLLECTION_SCHEMA_VERSION:
        raise FeedBuilderError("unsupported default profile collection schemaVersion")
    if collection["authoritativePolicyDefaults"] is not True:
        raise FeedBuilderError("default profile collection must claim approved policy defaults")
    if collection["userCampusDefaultEstablished"] is not False:
        raise FeedBuilderError("S28-3 must not invent a user campus default")
    profiles = collection["profiles"]
    if not isinstance(profiles, list) or len(profiles) != 2:
        raise FeedBuilderError("default profile collection requires exactly student and job profiles")
    validated = [
        validate_subscription_profile(profile, canonical_board_map=canonical_board_map)
        for profile in profiles
    ]
    if {profile["profileId"] for profile in validated} != {
        STUDENT_DEFAULT_PROFILE_ID,
        JOB_DEFAULT_PROFILE_ID,
    }:
        raise FeedBuilderError("default profile IDs do not match the registry-issued reference IDs")
    return validated


def load_default_profile_collection(
    path: Path, *, canonical_board_map: Mapping[str, str]
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    collection = json.loads(path.read_text(encoding="utf-8"))
    profiles = validate_default_profile_collection(
        collection, canonical_board_map=canonical_board_map
    )
    return collection, profiles


def load_feed_source_context(root: Path) -> dict[str, str]:
    registry = json.loads((root / "registry/s27c-v1/manifest.json").read_text(encoding="utf-8"))
    projection = json.loads((root / "projection/s27d-v1/manifest.json").read_text(encoding="utf-8"))
    registry_id = registry.get("registryId")
    projection_id = projection.get("projectionId")
    if not registry_id or not projection_id:
        raise FeedBuilderError("S27 registry/projection manifest lacks stable identity")
    if projection.get("sourceRegistry", {}).get("registryId") != registry_id:
        raise FeedBuilderError("S27-D projection source registry does not match S27-C registry")
    return {
        "registryId": registry_id,
        "projectionId": projection_id,
    }


@dataclass(frozen=True, slots=True)
class FeedBuildOutput:
    result: dict[str, Any]
    decisions: tuple[dict[str, Any], ...]


class DeterministicFeedBuilder:
    version = FEED_BUILDER_VERSION

    def __init__(
        self,
        *,
        policy: Mapping[str, Any],
        canonical_board_map: Mapping[str, str],
        source_context: Mapping[str, str],
    ) -> None:
        source_mode, review_mode = get_approved_modes(policy)
        self.policy = _deepcopy_json(policy)
        self.policy_schema_version = str(policy["schemaVersion"])
        self.policy_version = str(policy["policyVersion"])
        self.canonical_board_map = dict(canonical_board_map)
        self.source_context = dict(source_context)
        if set(self.source_context) != {"registryId", "projectionId"}:
            raise FeedBuilderError("source_context must contain registryId and projectionId")
        if not all(self.source_context.values()):
            raise FeedBuilderError("source_context values must be non-empty")
        self.evaluator = FeedEligibilityEvaluator(
            source_match_mode=source_mode,
            review_aggregation_mode=review_mode,
        )

    def build(
        self,
        profile: Mapping[str, Any],
        views: Iterable[Mapping[str, Any]],
    ) -> FeedBuildOutput:
        validated_profile = validate_subscription_profile(
            profile, canonical_board_map=self.canonical_board_map
        )
        view_rows = list(views)
        event_ids: list[str] = []
        view_by_event: dict[str, Mapping[str, Any]] = {}
        for view in view_rows:
            validate_eligibility_input_view(view)
            event_id = str(view["calendarEventId"])
            if event_id in view_by_event:
                raise FeedBuilderError(f"duplicate eligibility input event: {event_id}")
            event_ids.append(event_id)
            view_by_event[event_id] = view

        raw_decisions: list[dict[str, Any]] = []
        decision_by_event: dict[str, dict[str, Any]] = {}
        for event_id in sorted(event_ids):
            decision = self.evaluator.evaluate(validated_profile, view_by_event[event_id]).to_dict()
            if decision["schemaVersion"] != DECISION_SCHEMA_VERSION:
                raise FeedBuilderError("eligibility evaluator returned unsupported decision schema")
            raw_decisions.append(decision)
            decision_by_event[event_id] = decision

        included_ids = sorted(
            (event_id for event_id, decision in decision_by_event.items() if decision["eligible"]),
            key=lambda event_id: (
                str(view_by_event[event_id]["temporalState"]["normalizedStart"]),
                event_id,
            ),
        )
        excluded_ids = sorted(
            (event_id for event_id, decision in decision_by_event.items() if not decision["eligible"]),
            key=lambda event_id: (
                _REASON_ORDER[decision_by_event[event_id]["primaryReasonCode"]],
                event_id,
            ),
        )
        primary_reason_counts: dict[str, int] = {}
        for decision in raw_decisions:
            code = decision["primaryReasonCode"]
            primary_reason_counts[code] = primary_reason_counts.get(code, 0) + 1
        ordered_reason_counts = {
            code: primary_reason_counts[code]
            for code in REASON_PRECEDENCE
            if code in primary_reason_counts
        }

        result = {
            "schemaVersion": FEED_BUILD_RESULT_SCHEMA_VERSION,
            "builderVersion": self.version,
            "profileId": validated_profile["profileId"],
            "profileRevision": validated_profile["profileRevision"],
            "policySchemaVersion": self.policy_schema_version,
            "policyVersion": self.policy_version,
            "sourceContext": dict(self.source_context),
            "sortContract": _deepcopy_json(SORT_CONTRACT),
            "inputEventCount": len(view_rows),
            "includedEventCount": len(included_ids),
            "excludedEventCount": len(excluded_ids),
            "includedEventIds": included_ids,
            "excludedEventIds": excluded_ids,
            "primaryReasonCounts": ordered_reason_counts,
        }
        validate_feed_build_result(result, input_event_ids=set(event_ids), views=view_by_event)
        return FeedBuildOutput(
            result=result,
            decisions=tuple(sorted(raw_decisions, key=lambda row: row["calendarEventId"])),
        )


def validate_feed_build_result(
    result: Mapping[str, Any],
    *,
    input_event_ids: set[str] | None = None,
    views: Mapping[str, Mapping[str, Any]] | None = None,
) -> None:
    required = {
        "schemaVersion",
        "builderVersion",
        "profileId",
        "profileRevision",
        "policySchemaVersion",
        "policyVersion",
        "sourceContext",
        "sortContract",
        "inputEventCount",
        "includedEventCount",
        "excludedEventCount",
        "includedEventIds",
        "excludedEventIds",
        "primaryReasonCounts",
    }
    if not isinstance(result, Mapping) or set(result) != required:
        raise FeedBuilderError("feed build result key mismatch")
    if result["schemaVersion"] != FEED_BUILD_RESULT_SCHEMA_VERSION:
        raise FeedBuilderError("unsupported feed build result schemaVersion")
    if result["builderVersion"] != FEED_BUILDER_VERSION:
        raise FeedBuilderError("unsupported FeedBuilder version")
    if result["sortContract"] != SORT_CONTRACT:
        raise FeedBuilderError("feed build sort contract mismatch")
    if set(result["sourceContext"]) != {"registryId", "projectionId"}:
        raise FeedBuilderError("feed build source context key mismatch")
    included = list(result["includedEventIds"])
    excluded = list(result["excludedEventIds"])
    if len(included) != len(set(included)) or len(excluded) != len(set(excluded)):
        raise FeedBuilderError("feed build event IDs must be unique")
    if set(included) & set(excluded):
        raise FeedBuilderError("included and excluded event IDs must be disjoint")
    if result["includedEventCount"] != len(included):
        raise FeedBuilderError("includedEventCount mismatch")
    if result["excludedEventCount"] != len(excluded):
        raise FeedBuilderError("excludedEventCount mismatch")
    if result["inputEventCount"] != len(included) + len(excluded):
        raise FeedBuilderError("inputEventCount does not equal included + excluded")
    if sum(result["primaryReasonCounts"].values()) != result["inputEventCount"]:
        raise FeedBuilderError("primaryReasonCounts do not cover every input event")
    invalid_reason_codes = set(result["primaryReasonCounts"]) - set(REASON_PRECEDENCE)
    if invalid_reason_codes:
        raise FeedBuilderError(f"unsupported primary reason codes: {sorted(invalid_reason_codes)}")
    if input_event_ids is not None and set(included) | set(excluded) != input_event_ids:
        raise FeedBuilderError("feed build result does not exactly partition input events")
    if views is not None:
        expected_included = sorted(
            included,
            key=lambda event_id: (
                str(views[event_id]["temporalState"]["normalizedStart"]),
                event_id,
            ),
        )
        if included != expected_included:
            raise FeedBuilderError("included events violate deterministic chronological order")

    forbidden = {
        "snapshotId",
        "snapshotHash",
        "contentDigest",
        "subscriptionUrl",
        "feedToken",
        "feedTokenHash",
        "ics",
        "icsPath",
    }
    leaked = sorted(forbidden & set(result))
    if leaked:
        raise FeedBuilderError(f"S28-4/S29 field leaked into S28-3 result: {leaked}")


def write_feed_build_artifacts(
    output_dir: Path,
    *,
    profile_kind: str,
    output: FeedBuildOutput,
) -> dict[str, str]:
    if profile_kind not in {"student_default", "job_application"}:
        raise FeedBuilderError("unsupported profile_kind for artifact output")
    output_dir.mkdir(parents=True, exist_ok=True)
    result_name = f"{profile_kind}-feed-build-result.json"
    decisions_name = f"{profile_kind}-feed-build-decisions.jsonl"
    result_path = output_dir / result_name
    decisions_path = output_dir / decisions_name
    result_path.write_text(
        json.dumps(output.result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    decisions_path.write_text(
        "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in output.decisions),
        encoding="utf-8",
    )
    return {"result": result_name, "decisions": decisions_name}


__all__ = [
    "DEFAULT_PROFILE_COLLECTION_SCHEMA_VERSION",
    "FEED_BUILDER_VERSION",
    "FEED_BUILD_RESULT_SCHEMA_VERSION",
    "JOB_DEFAULT_PROFILE_ID",
    "STUDENT_DEFAULT_PROFILE_ID",
    "DeterministicFeedBuilder",
    "FeedBuildOutput",
    "FeedBuilderError",
    "create_default_subscription_profile",
    "load_default_profile_collection",
    "load_feed_source_context",
    "materialize_reference_default_profiles",
    "validate_default_profile_collection",
    "validate_feed_build_result",
    "write_feed_build_artifacts",
]
