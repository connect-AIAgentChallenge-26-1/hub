#!/usr/bin/env python3
"""S28-1 SubscriptionProfile strict contract validation.

This module validates only profile shape and cross-field invariants. It does
not read CalendarEvent rows, select feed events, issue subscription tokens, or
serialize ICS. Those responsibilities begin in later S28/S29 stages.
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping

SUBSCRIPTION_PROFILE_VERSION = "0.1.0"
SCHEMA_VERSION = "noticepilot.subscriptionProfile.v0.1"
PROFILE_ID_RE = re.compile(r"^subprof_[0-9a-f]{32}$")

PHYSICAL_CAMPUSES = frozenset({"chuncheon", "samcheok", "dogye", "gangneung_wonju"})
FEED_SCOPES = frozenset({"student_default", "job_application"})
EVENT_TYPES = frozenset({
    "academic_period", "application_period", "deadline", "event",
    "exam_or_interview", "job_application_period", "payment_period",
    "result_announcement", "submission_period",
})
TARGET_ACTORS = frozenset({"student", "job_applicant"})
DEGREE_LEVELS = frozenset({"undergraduate", "graduate"})
ENROLLMENT_STATUSES = frozenset({"enrolled", "on_leave", "returning"})
ADMISSION_TYPES = frozenset({"new_student", "transfer_student", "readmitted_student"})
PROFILE_STATUSES = frozenset({"active", "paused", "revoked"})
UNSCOPED_EVENT_POLICIES = frozenset({"include", "exclude"})

ROOT_KEYS = frozenset({
    "schemaVersion", "profileId", "profileRevision", "institutionId",
    "displayName", "calendarName", "timezone", "status",
    "campusSelection", "sourceSelection", "eventSelection", "audienceFilter",
    "createdAt", "updatedAt",
})
CAMPUS_KEYS = frozenset({
    "selectedCampuses", "includeAllCampusEvents", "includeUnknownCampusEvents", "matchingMode",
})
SOURCE_KEYS = frozenset({
    "selectedBoardIds", "selectedNoticeTypes", "canonicalBoardsOnly", "matchingMode",
})
EVENT_KEYS = frozenset({
    "includedFeedScopes", "includedEventTypes", "includedTargetActors",
    "includeReviewRequiredEvents", "matchingMode",
})
AUDIENCE_KEYS = frozenset({
    "enabled", "degreeLevels", "studentYears", "enrollmentStatuses",
    "admissionTypes", "matchMode", "unscopedEventPolicy",
})


class SubscriptionProfileValidationError(ValueError):
    pass


def _strict_keys(value: Mapping[str, Any], expected: frozenset[str], path: str) -> None:
    actual = set(value)
    missing = sorted(expected - actual)
    unknown = sorted(actual - expected)
    if missing or unknown:
        raise SubscriptionProfileValidationError(
            f"{path} key mismatch: missing={missing}, unknown={unknown}"
        )


def _nonempty_text(value: Any, path: str, max_length: int = 120) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SubscriptionProfileValidationError(f"{path} must be a non-empty string")
    if len(value) > max_length:
        raise SubscriptionProfileValidationError(f"{path} exceeds {max_length} characters")
    return value


def _boolean(value: Any, path: str) -> bool:
    if not isinstance(value, bool):
        raise SubscriptionProfileValidationError(f"{path} must be boolean")
    return value


def _unique_list(value: Any, path: str, *, allowed: frozenset[Any] | None = None, min_items: int = 0) -> list[Any]:
    if not isinstance(value, list):
        raise SubscriptionProfileValidationError(f"{path} must be an array")
    if len(value) < min_items:
        raise SubscriptionProfileValidationError(f"{path} requires at least {min_items} item(s)")
    if len(value) != len({json.dumps(item, ensure_ascii=False, sort_keys=True) for item in value}):
        raise SubscriptionProfileValidationError(f"{path} must contain unique values")
    if allowed is not None:
        invalid = [item for item in value if item not in allowed]
        if invalid:
            raise SubscriptionProfileValidationError(f"{path} contains unsupported values: {invalid}")
    return list(value)


def _iso_datetime(value: Any, path: str) -> datetime:
    if not isinstance(value, str):
        raise SubscriptionProfileValidationError(f"{path} must be an ISO datetime string")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise SubscriptionProfileValidationError(f"{path} is not a valid ISO datetime") from exc
    if parsed.tzinfo is None:
        raise SubscriptionProfileValidationError(f"{path} must include a timezone offset")
    return parsed


def load_canonical_board_map(path: Path) -> dict[str, str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise SubscriptionProfileValidationError("board registry must be an array")
    result: dict[str, str] = {}
    for row in data:
        if row.get("canonical") is not True:
            continue
        board_id = str(row.get("boardId") or "")
        category = str(row.get("category") or "")
        if not board_id or not category or board_id in result:
            raise SubscriptionProfileValidationError("invalid canonical board registry")
        result[board_id] = category
    if not result:
        raise SubscriptionProfileValidationError("canonical board registry is empty")
    return result


def validate_subscription_profile(
    profile: Mapping[str, Any],
    *,
    canonical_board_map: Mapping[str, str],
) -> dict[str, Any]:
    if not isinstance(profile, Mapping):
        raise SubscriptionProfileValidationError("profile must be an object")
    _strict_keys(profile, ROOT_KEYS, "profile")

    if profile["schemaVersion"] != SCHEMA_VERSION:
        raise SubscriptionProfileValidationError("unsupported schemaVersion")
    if not isinstance(profile["profileId"], str) or not PROFILE_ID_RE.fullmatch(profile["profileId"]):
        raise SubscriptionProfileValidationError("profileId must be an opaque subprof_ + 32 lowercase hex ID")
    if not isinstance(profile["profileRevision"], int) or isinstance(profile["profileRevision"], bool) or profile["profileRevision"] < 1:
        raise SubscriptionProfileValidationError("profileRevision must be an integer >= 1")
    if profile["institutionId"] != "kangwon":
        raise SubscriptionProfileValidationError("S28 v0.1 supports institutionId=kangwon only")
    _nonempty_text(profile["displayName"], "displayName")
    _nonempty_text(profile["calendarName"], "calendarName")
    if profile["timezone"] != "Asia/Seoul":
        raise SubscriptionProfileValidationError("timezone must be Asia/Seoul")
    if profile["status"] not in PROFILE_STATUSES:
        raise SubscriptionProfileValidationError("unsupported profile status")

    campus = profile["campusSelection"]
    if not isinstance(campus, Mapping):
        raise SubscriptionProfileValidationError("campusSelection must be an object")
    _strict_keys(campus, CAMPUS_KEYS, "campusSelection")
    campuses = _unique_list(campus["selectedCampuses"], "campusSelection.selectedCampuses", allowed=PHYSICAL_CAMPUSES, min_items=1)
    if len(campuses) > 4:
        raise SubscriptionProfileValidationError("selectedCampuses cannot exceed four physical campuses")
    _boolean(campus["includeAllCampusEvents"], "campusSelection.includeAllCampusEvents")
    _boolean(campus["includeUnknownCampusEvents"], "campusSelection.includeUnknownCampusEvents")
    if campus["matchingMode"] != "intersects":
        raise SubscriptionProfileValidationError("campusSelection.matchingMode must be intersects")

    source = profile["sourceSelection"]
    if not isinstance(source, Mapping):
        raise SubscriptionProfileValidationError("sourceSelection must be an object")
    _strict_keys(source, SOURCE_KEYS, "sourceSelection")
    board_ids = _unique_list(source["selectedBoardIds"], "sourceSelection.selectedBoardIds", min_items=1)
    unknown_boards = sorted(set(board_ids) - set(canonical_board_map))
    if unknown_boards:
        raise SubscriptionProfileValidationError(f"selectedBoardIds must be canonical board IDs: {unknown_boards}")
    notice_types = _unique_list(source["selectedNoticeTypes"], "sourceSelection.selectedNoticeTypes", min_items=1)
    expected_types = {canonical_board_map[board_id] for board_id in board_ids}
    supplied_types = set(notice_types)
    if supplied_types != expected_types:
        raise SubscriptionProfileValidationError(
            f"selectedNoticeTypes must exactly match selectedBoardIds categories: expected={sorted(expected_types)}, actual={sorted(supplied_types)}"
        )
    if source["canonicalBoardsOnly"] is not True:
        raise SubscriptionProfileValidationError("sourceSelection.canonicalBoardsOnly must be true")
    if source["matchingMode"] != "all_dimensions":
        raise SubscriptionProfileValidationError("sourceSelection.matchingMode must be all_dimensions")

    event = profile["eventSelection"]
    if not isinstance(event, Mapping):
        raise SubscriptionProfileValidationError("eventSelection must be an object")
    _strict_keys(event, EVENT_KEYS, "eventSelection")
    feed_scopes = _unique_list(event["includedFeedScopes"], "eventSelection.includedFeedScopes", allowed=FEED_SCOPES, min_items=1)
    event_types = _unique_list(event["includedEventTypes"], "eventSelection.includedEventTypes", allowed=EVENT_TYPES, min_items=1)
    actors = _unique_list(event["includedTargetActors"], "eventSelection.includedTargetActors", allowed=TARGET_ACTORS, min_items=1)
    _boolean(event["includeReviewRequiredEvents"], "eventSelection.includeReviewRequiredEvents")
    if event["matchingMode"] != "all_dimensions":
        raise SubscriptionProfileValidationError("eventSelection.matchingMode must be all_dimensions")
    if "student_default" in feed_scopes and "student" not in actors:
        raise SubscriptionProfileValidationError("student_default requires target actor student")
    if "job_application" in feed_scopes and "job_applicant" not in actors:
        raise SubscriptionProfileValidationError("job_application requires target actor job_applicant")
    if "student" in actors and "student_default" not in feed_scopes:
        raise SubscriptionProfileValidationError("target actor student requires student_default feed scope")
    if "job_applicant" in actors and "job_application" not in feed_scopes:
        raise SubscriptionProfileValidationError("target actor job_applicant requires job_application feed scope")
    if "job_application_period" in event_types and "job_application" not in feed_scopes:
        raise SubscriptionProfileValidationError("job_application_period requires job_application feed scope")

    audience = profile["audienceFilter"]
    if not isinstance(audience, Mapping):
        raise SubscriptionProfileValidationError("audienceFilter must be an object")
    _strict_keys(audience, AUDIENCE_KEYS, "audienceFilter")
    enabled = _boolean(audience["enabled"], "audienceFilter.enabled")
    degree_levels = _unique_list(audience["degreeLevels"], "audienceFilter.degreeLevels", allowed=DEGREE_LEVELS)
    years = _unique_list(audience["studentYears"], "audienceFilter.studentYears")
    if any(not isinstance(year, int) or isinstance(year, bool) or year < 1 or year > 6 for year in years):
        raise SubscriptionProfileValidationError("audienceFilter.studentYears must contain integers from 1 through 6")
    statuses = _unique_list(audience["enrollmentStatuses"], "audienceFilter.enrollmentStatuses", allowed=ENROLLMENT_STATUSES)
    admissions = _unique_list(audience["admissionTypes"], "audienceFilter.admissionTypes", allowed=ADMISSION_TYPES)
    if audience["matchMode"] != "all_dimensions":
        raise SubscriptionProfileValidationError("audienceFilter.matchMode must be all_dimensions")
    if audience["unscopedEventPolicy"] not in UNSCOPED_EVENT_POLICIES:
        raise SubscriptionProfileValidationError("unsupported audienceFilter.unscopedEventPolicy")
    selected_audience_values = degree_levels + years + statuses + admissions
    if enabled and not selected_audience_values:
        raise SubscriptionProfileValidationError("enabled audienceFilter requires at least one selected audience value")
    if not enabled and selected_audience_values:
        raise SubscriptionProfileValidationError("disabled audienceFilter requires empty audience arrays")
    if not enabled and audience["unscopedEventPolicy"] != "include":
        raise SubscriptionProfileValidationError("disabled audienceFilter requires unscopedEventPolicy=include")
    if enabled and ("student_default" not in feed_scopes or "student" not in actors):
        raise SubscriptionProfileValidationError("audienceFilter is supported only for student_default/student profiles in v0.1")

    created = _iso_datetime(profile["createdAt"], "createdAt")
    updated = _iso_datetime(profile["updatedAt"], "updatedAt")
    if updated < created:
        raise SubscriptionProfileValidationError("updatedAt must be on or after createdAt")

    forbidden_root_keys = {"feedToken", "feedTokenHash", "publicSlug", "subscriptionUrl", "icsUrl", "eventIds"}
    leaked = sorted(forbidden_root_keys & set(profile))
    if leaked:
        raise SubscriptionProfileValidationError(f"delivery or projection fields are forbidden in SubscriptionProfile: {leaked}")

    return json.loads(json.dumps(profile, ensure_ascii=False))


def load_profile_examples(path: Path, *, canonical_board_map: Mapping[str, str]) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != "noticepilot.subscriptionProfileExamples.v0.1":
        raise SubscriptionProfileValidationError("unsupported example collection schemaVersion")
    if data.get("authoritativeDefaults") is not False:
        raise SubscriptionProfileValidationError("contract examples must not claim authoritative defaults")
    profiles = data.get("profiles")
    if not isinstance(profiles, list) or not profiles:
        raise SubscriptionProfileValidationError("contract examples require profiles")
    validated = [validate_subscription_profile(row, canonical_board_map=canonical_board_map) for row in profiles]
    if len({row["profileId"] for row in validated}) != len(validated):
        raise SubscriptionProfileValidationError("example profile IDs must be unique")
    return validated


__all__ = [
    "ADMISSION_TYPES",
    "DEGREE_LEVELS",
    "ENROLLMENT_STATUSES",
    "EVENT_TYPES",
    "FEED_SCOPES",
    "PHYSICAL_CAMPUSES",
    "SCHEMA_VERSION",
    "SUBSCRIPTION_PROFILE_VERSION",
    "SubscriptionProfileValidationError",
    "load_canonical_board_map",
    "load_profile_examples",
    "validate_subscription_profile",
]
