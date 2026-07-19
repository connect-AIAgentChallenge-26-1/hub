#!/usr/bin/env python3
"""S28-2 feed eligibility policy primitives.

This module owns the authoritative per-event eligibility view and deterministic
reason evaluation. It does not iterate a corpus into a feed, persist a snapshot,
issue a delivery token, or serialize ICS. Those responsibilities begin in
S28-3/S28-4/S29.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

FEED_ELIGIBILITY_VERSION = "0.2.0"
POLICY_SCHEMA_VERSION = "noticepilot.feedEligibilityPolicy.v0.2"
INPUT_VIEW_SCHEMA_VERSION = "noticepilot.feedEligibilityInputView.v0.2"
DECISION_SCHEMA_VERSION = "noticepilot.feedEligibilityDecision.v0.2"

SOURCE_MATCH_MODES = frozenset({"canonical_source_only", "any_active_source_link"})
REVIEW_AGGREGATION_MODES = frozenset({"canonical_candidate_only", "any_source_requires_review"})
POLICY_STATUSES = frozenset({"approved"})

REASON_PRECEDENCE = (
    "profile_not_active",
    "institution_mismatch",
    "unsupported_event_status",
    "invalid_normalized_date",
    "review_state_unknown",
    "campus_unknown_excluded",
    "campus_all_excluded",
    "campus_no_intersection",
    "source_board_or_notice_type_mismatch",
    "feed_scope_mismatch",
    "event_type_mismatch",
    "target_actor_mismatch",
    "review_required_excluded",
    "audience_unscoped_excluded",
    "audience_degree_level_mismatch",
    "audience_student_year_mismatch",
    "audience_enrollment_status_mismatch",
    "audience_admission_type_mismatch",
    "eligible_all_dimensions_matched",
)
_REASON_ORDER = {code: index for index, code in enumerate(REASON_PRECEDENCE)}


class FeedEligibilityError(ValueError):
    pass


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                raise FeedEligibilityError(f"invalid JSONL at {path}:{line_number}") from exc
            if not isinstance(value, dict):
                raise FeedEligibilityError(f"expected object at {path}:{line_number}")
            rows.append(value)
    return rows


def load_candidate_publishability_map(notices_path: Path) -> dict[str, dict[str, Any]]:
    """Load every runtime candidate's immutable publishability judgment."""
    result: dict[str, dict[str, Any]] = {}
    for notice in _read_jsonl(notices_path):
        for candidate in notice.get("candidates") or []:
            candidate_id = str(candidate.get("id") or "")
            judgment = candidate.get("publishabilityJudgment")
            if not candidate_id or not isinstance(judgment, Mapping):
                raise FeedEligibilityError("runtime candidate lacks publishability judgment")
            if candidate_id in result:
                raise FeedEligibilityError(f"duplicate candidate judgment: {candidate_id}")
            result[candidate_id] = json.loads(json.dumps(judgment, ensure_ascii=False))
    return result


def _validate_source_link(link: Mapping[str, Any]) -> None:
    required = {
        "sourceLinkId", "calendarEventId", "sourceCandidateId", "sourceNoticeId",
        "canonical", "activeSource", "sourceIdentity",
    }
    if not required <= set(link):
        raise FeedEligibilityError(f"source link missing keys: {sorted(required - set(link))}")
    identity = link["sourceIdentity"]
    if not isinstance(identity, Mapping):
        raise FeedEligibilityError("sourceIdentity must be an object")
    for field in ("institutionId", "canonicalBoardId", "canonicalBoardCategory"):
        if not str(identity.get(field) or ""):
            raise FeedEligibilityError(f"sourceIdentity.{field} is required")


def build_eligibility_input_views(root: Path) -> list[dict[str, Any]]:
    """Join S27-D active events, S27-C source links, and S24 judgments."""
    root = root.resolve()
    active_rows = _read_jsonl(root / "projection/s27d-v1/active-calendar-event-projections.jsonl")
    source_links = _read_jsonl(root / "registry/s27c-v1/calendar-event-source-links.jsonl")
    judgments = load_candidate_publishability_map(
        root / "derived/mvp-policy-v0.1/decisions/notices.jsonl"
    )

    links_by_event: dict[str, list[dict[str, Any]]] = {}
    for link in source_links:
        _validate_source_link(link)
        links_by_event.setdefault(link["calendarEventId"], []).append(link)

    views: list[dict[str, Any]] = []
    seen_events: set[str] = set()
    for row in active_rows:
        event_id = str(row.get("calendarEventId") or "")
        if not event_id or event_id in seen_events:
            raise FeedEligibilityError("active projection requires unique calendarEventId")
        seen_events.add(event_id)
        links = sorted(links_by_event.get(event_id, []), key=lambda item: item["sourceLinkId"])
        if not links:
            raise FeedEligibilityError(f"event has no source links: {event_id}")
        canonical_links = [link for link in links if link.get("canonical") is True]
        if len(canonical_links) != 1:
            raise FeedEligibilityError(f"event requires exactly one canonical source link: {event_id}")
        active_links = [link for link in links if link.get("activeSource") is True]
        if not active_links:
            raise FeedEligibilityError(f"event requires at least one active source link: {event_id}")
        institutions = {link["sourceIdentity"]["institutionId"] for link in links}
        if len(institutions) != 1:
            raise FeedEligibilityError(f"event source links disagree on institution: {event_id}")

        source_candidate_ids = list(row.get("sourceCandidateIds") or [])
        link_candidate_ids = [link["sourceCandidateId"] for link in links]
        if sorted(source_candidate_ids) != sorted(link_candidate_ids):
            raise FeedEligibilityError(f"projection/source-link candidate mismatch: {event_id}")

        verdict_rows: list[dict[str, Any]] = []
        unknown_candidate_ids: list[str] = []
        for candidate_id in source_candidate_ids:
            judgment = judgments.get(candidate_id)
            if judgment is None:
                unknown_candidate_ids.append(candidate_id)
                continue
            verdict_rows.append({
                "candidateId": candidate_id,
                "verdict": judgment.get("verdict"),
                "includeInCalendarFeed": judgment.get("includeInCalendarFeed"),
                "reasonCodes": list(judgment.get("reasonCodes") or []),
                "ruleIds": list(judgment.get("ruleIds") or []),
            })
        canonical_candidate_id = row.get("canonicalCandidateId")
        canonical_rows = [item for item in verdict_rows if item["candidateId"] == canonical_candidate_id]
        if len(canonical_rows) != 1 and not unknown_candidate_ids:
            raise FeedEligibilityError(f"canonical candidate judgment missing: {event_id}")
        any_review = any(item["verdict"] == "needs_review" for item in verdict_rows)
        all_auto = bool(verdict_rows) and all(item["verdict"] == "auto_confirmed" for item in verdict_rows)

        projection = row.get("projection") or {}
        view = {
            "schemaVersion": INPUT_VIEW_SCHEMA_VERSION,
            "calendarEventId": event_id,
            "institutionId": next(iter(institutions)),
            "eventStatus": row.get("status"),
            "canonicalCandidateId": canonical_candidate_id,
            "sourceCandidateIds": source_candidate_ids,
            "feedScopes": list(row.get("feedScopes") or []),
            "eventType": projection.get("eventType"),
            "targetActor": projection.get("targetActor"),
            "temporalState": {
                "normalizedStart": projection.get("normalizedStart"),
                "normalizedEnd": projection.get("normalizedEnd"),
                "hasValidNormalizedDate": bool(projection.get("normalizedStart")),
                "source": "s27d_active_projection",
            },
            "campusScope": json.loads(json.dumps(projection.get("campusScope") or {}, ensure_ascii=False)),
            "audienceRules": json.loads(json.dumps(projection.get("audienceRules") or {}, ensure_ascii=False)),
            "sourceLinks": [
                {
                    "sourceLinkId": link["sourceLinkId"],
                    "sourceNoticeId": link["sourceNoticeId"],
                    "sourceCandidateId": link["sourceCandidateId"],
                    "canonical": bool(link["canonical"]),
                    "activeSource": bool(link["activeSource"]),
                    "canonicalBoardId": str(link["sourceIdentity"]["canonicalBoardId"]),
                    "noticeType": str(link["sourceIdentity"]["canonicalBoardCategory"]),
                }
                for link in links
            ],
            "reviewState": {
                "canonicalVerdict": canonical_rows[0]["verdict"] if canonical_rows else "unknown",
                "sourceVerdicts": sorted(verdict_rows, key=lambda item: item["candidateId"]),
                "anySourceRequiresReview": any_review,
                "allSourcesAutoConfirmed": all_auto,
                "unknownCandidateIds": sorted(unknown_candidate_ids),
            },
        }
        validate_eligibility_input_view(view)
        views.append(view)

    orphan_links = sorted(set(links_by_event) - seen_events)
    if orphan_links:
        raise FeedEligibilityError(f"source links reference non-active events: {orphan_links[:5]}")
    return sorted(views, key=lambda item: item["calendarEventId"])


def validate_eligibility_input_view(view: Mapping[str, Any]) -> None:
    required = {
        "schemaVersion", "calendarEventId", "institutionId", "eventStatus",
        "canonicalCandidateId", "sourceCandidateIds", "feedScopes", "eventType",
        "targetActor", "temporalState", "campusScope", "audienceRules", "sourceLinks", "reviewState",
    }
    if set(view) != required:
        raise FeedEligibilityError(
            f"eligibility input view key mismatch: missing={sorted(required-set(view))}, unknown={sorted(set(view)-required)}"
        )
    if view["schemaVersion"] != INPUT_VIEW_SCHEMA_VERSION:
        raise FeedEligibilityError("unsupported input view schemaVersion")
    if not str(view["calendarEventId"]).startswith("evt_"):
        raise FeedEligibilityError("calendarEventId must be an opaque event ID")
    if not view["sourceLinks"]:
        raise FeedEligibilityError("sourceLinks must be non-empty")
    canonical = [link for link in view["sourceLinks"] if link["canonical"]]
    if len(canonical) != 1:
        raise FeedEligibilityError("input view requires exactly one canonical source link")
    temporal = view["temporalState"]
    temporal_required = {"normalizedStart", "normalizedEnd", "hasValidNormalizedDate", "source"}
    if not isinstance(temporal, Mapping) or set(temporal) != temporal_required:
        raise FeedEligibilityError("temporalState key mismatch")
    if temporal["source"] != "s27d_active_projection":
        raise FeedEligibilityError("unsupported temporalState source")
    if not isinstance(temporal["hasValidNormalizedDate"], bool):
        raise FeedEligibilityError("hasValidNormalizedDate must be boolean")
    review = view["reviewState"]
    if review["unknownCandidateIds"] and review["allSourcesAutoConfirmed"]:
        raise FeedEligibilityError("unknown review state cannot be all-auto-confirmed")


def _validate_default_profile_policy(value: Any, name: str) -> None:
    required = {
        "includeUnknownCampusEvents",
        "includeReviewRequiredEvents",
        "reviewRequiredInclusionRule",
    }
    if not isinstance(value, Mapping) or set(value) != required:
        raise FeedEligibilityError(f"{name} must contain the approved default policy keys")
    if value["includeUnknownCampusEvents"] is not True:
        raise FeedEligibilityError(f"{name}.includeUnknownCampusEvents must be true")
    if value["includeReviewRequiredEvents"] is not True:
        raise FeedEligibilityError(f"{name}.includeReviewRequiredEvents must be true")
    if value["reviewRequiredInclusionRule"] != "include_if_valid_normalized_date":
        raise FeedEligibilityError(f"{name} review rule must require a valid normalized date")


def load_feed_eligibility_policy(path: Path) -> dict[str, Any]:
    policy = json.loads(path.read_text(encoding="utf-8"))
    if policy.get("schemaVersion") != POLICY_SCHEMA_VERSION:
        raise FeedEligibilityError("unsupported feed eligibility policy schemaVersion")
    if policy.get("status") != "approved":
        raise FeedEligibilityError("feed eligibility policy must be approved")
    if tuple(policy.get("reasonPrecedence") or ()) != REASON_PRECEDENCE:
        raise FeedEligibilityError("reasonPrecedence does not match evaluator contract")
    decisions = policy.get("decisions")
    if not isinstance(decisions, Mapping):
        raise FeedEligibilityError("decisions must be an object")
    if decisions.get("sourceLinkMatchMode") != "canonical_source_only":
        raise FeedEligibilityError("approved sourceLinkMatchMode must be canonical_source_only")
    if decisions.get("reviewStateAggregationMode") != "canonical_candidate_only":
        raise FeedEligibilityError("approved reviewStateAggregationMode must be canonical_candidate_only")
    _validate_default_profile_policy(decisions.get("defaultStudentProfilePolicy"), "defaultStudentProfilePolicy")
    _validate_default_profile_policy(decisions.get("defaultJobProfilePolicy"), "defaultJobProfilePolicy")
    if decisions.get("audienceUnscopedDefault") != "include":
        raise FeedEligibilityError("approved audienceUnscopedDefault must be include")
    if policy.get("unresolvedDecisionIds") != []:
        raise FeedEligibilityError("approved policy cannot have unresolved decisions")
    return policy


def policy_is_resolved(policy: Mapping[str, Any]) -> bool:
    try:
        if policy.get("schemaVersion") != POLICY_SCHEMA_VERSION or policy.get("status") != "approved":
            return False
        decisions = policy.get("decisions") or {}
        if decisions.get("sourceLinkMatchMode") != "canonical_source_only":
            return False
        if decisions.get("reviewStateAggregationMode") != "canonical_candidate_only":
            return False
        _validate_default_profile_policy(decisions.get("defaultStudentProfilePolicy"), "defaultStudentProfilePolicy")
        _validate_default_profile_policy(decisions.get("defaultJobProfilePolicy"), "defaultJobProfilePolicy")
        return decisions.get("audienceUnscopedDefault") == "include" and policy.get("unresolvedDecisionIds") == []
    except FeedEligibilityError:
        return False


def get_approved_modes(policy: Mapping[str, Any]) -> tuple[str, str]:
    if not policy_is_resolved(policy):
        raise FeedEligibilityError("feed eligibility policy is unresolved")
    decisions = policy["decisions"]
    return decisions["sourceLinkMatchMode"], decisions["reviewStateAggregationMode"]


def get_default_profile_policy(policy: Mapping[str, Any], profile_kind: str) -> dict[str, Any]:
    if not policy_is_resolved(policy):
        raise FeedEligibilityError("feed eligibility policy is unresolved")
    key = {
        "student": "defaultStudentProfilePolicy",
        "job": "defaultJobProfilePolicy",
    }.get(profile_kind)
    if key is None:
        raise FeedEligibilityError("profile_kind must be student or job")
    return json.loads(json.dumps(policy["decisions"][key], ensure_ascii=False))


def _effective_review_required(view: Mapping[str, Any], mode: str) -> bool | None:
    review = view["reviewState"]
    if review.get("unknownCandidateIds"):
        return None
    if mode == "canonical_candidate_only":
        verdict = review.get("canonicalVerdict")
        if verdict == "needs_review":
            return True
        if verdict == "auto_confirmed":
            return False
        return None
    if mode == "any_source_requires_review":
        if review.get("anySourceRequiresReview"):
            return True
        if review.get("allSourcesAutoConfirmed"):
            return False
        return None
    raise FeedEligibilityError(f"unsupported review aggregation mode: {mode}")


def _source_matches(profile: Mapping[str, Any], view: Mapping[str, Any], mode: str) -> tuple[bool, list[str]]:
    selected_boards = set(profile["sourceSelection"]["selectedBoardIds"])
    selected_types = set(profile["sourceSelection"]["selectedNoticeTypes"])
    links = view["sourceLinks"]
    if mode == "canonical_source_only":
        links = [link for link in links if link["canonical"]]
    elif mode == "any_active_source_link":
        links = [link for link in links if link["activeSource"]]
    else:
        raise FeedEligibilityError(f"unsupported source match mode: {mode}")
    matched = [
        link["sourceLinkId"]
        for link in links
        if link["canonicalBoardId"] in selected_boards and link["noticeType"] in selected_types
    ]
    return bool(matched), sorted(matched)


def _dimension_mismatch(profile_values: Sequence[Any], event_values: Sequence[Any]) -> bool:
    """Empty profile or event dimensions are unrestricted; otherwise intersect."""
    if not profile_values or not event_values:
        return False
    return not bool(set(profile_values) & set(event_values))


@dataclass(frozen=True, slots=True)
class FeedEligibilityDecision:
    profile_id: str
    calendar_event_id: str
    eligible: bool
    primary_reason_code: str
    reason_codes: tuple[str, ...]
    matched_source_link_ids: tuple[str, ...]
    effective_review_required: bool | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": DECISION_SCHEMA_VERSION,
            "profileId": self.profile_id,
            "calendarEventId": self.calendar_event_id,
            "eligible": self.eligible,
            "primaryReasonCode": self.primary_reason_code,
            "reasonCodes": list(self.reason_codes),
            "matchedSourceLinkIds": list(self.matched_source_link_ids),
            "effectiveReviewRequired": self.effective_review_required,
        }


class FeedEligibilityEvaluator:
    """Evaluate one active CalendarEvent against one explicit profile.

    This is deliberately not a FeedBuilder: it does not enumerate inputs,
    sort events, create a snapshot hash, or serialize a calendar.
    """

    version = FEED_ELIGIBILITY_VERSION

    def __init__(self, *, source_match_mode: str, review_aggregation_mode: str):
        if source_match_mode not in SOURCE_MATCH_MODES:
            raise FeedEligibilityError("source_match_mode is unresolved or unsupported")
        if review_aggregation_mode not in REVIEW_AGGREGATION_MODES:
            raise FeedEligibilityError("review_aggregation_mode is unresolved or unsupported")
        self.source_match_mode = source_match_mode
        self.review_aggregation_mode = review_aggregation_mode

    def evaluate(self, profile: Mapping[str, Any], view: Mapping[str, Any]) -> FeedEligibilityDecision:
        validate_eligibility_input_view(view)
        reasons: list[str] = []
        matched_links: list[str] = []

        if profile["status"] != "active":
            reasons.append("profile_not_active")
        if profile["institutionId"] != view["institutionId"]:
            reasons.append("institution_mismatch")
        if view["eventStatus"] != "CONFIRMED":
            reasons.append("unsupported_event_status")
        if not view["temporalState"]["hasValidNormalizedDate"]:
            reasons.append("invalid_normalized_date")

        review_required = _effective_review_required(view, self.review_aggregation_mode)
        if review_required is None:
            reasons.append("review_state_unknown")

        campus_profile = profile["campusSelection"]
        campus = view["campusScope"]
        scope_type = campus.get("scopeType")
        event_campuses = set(campus.get("campuses") or [])
        if scope_type == "unknown":
            if not campus_profile["includeUnknownCampusEvents"]:
                reasons.append("campus_unknown_excluded")
        elif scope_type == "all_campuses":
            if not campus_profile["includeAllCampusEvents"]:
                reasons.append("campus_all_excluded")
        elif scope_type == "campus_specific":
            if not (set(campus_profile["selectedCampuses"]) & event_campuses):
                reasons.append("campus_no_intersection")
        else:
            reasons.append("campus_unknown_excluded")

        source_match, matched_links = _source_matches(profile, view, self.source_match_mode)
        if not source_match:
            reasons.append("source_board_or_notice_type_mismatch")

        event_selection = profile["eventSelection"]
        if not (set(event_selection["includedFeedScopes"]) & set(view["feedScopes"])):
            reasons.append("feed_scope_mismatch")
        if view["eventType"] not in set(event_selection["includedEventTypes"]):
            reasons.append("event_type_mismatch")
        if view["targetActor"] not in set(event_selection["includedTargetActors"]):
            reasons.append("target_actor_mismatch")
        if review_required is True and not event_selection["includeReviewRequiredEvents"]:
            reasons.append("review_required_excluded")

        audience_profile = profile["audienceFilter"]
        audience_rules = view["audienceRules"]
        if audience_profile["enabled"]:
            if not audience_rules.get("personalizationReady"):
                if audience_profile["unscopedEventPolicy"] == "exclude":
                    reasons.append("audience_unscoped_excluded")
            else:
                checks = (
                    ("degreeLevels", "audience_degree_level_mismatch"),
                    ("studentYears", "audience_student_year_mismatch"),
                    ("enrollmentStatuses", "audience_enrollment_status_mismatch"),
                    ("admissionTypes", "audience_admission_type_mismatch"),
                )
                for field, reason in checks:
                    if _dimension_mismatch(audience_profile[field], audience_rules.get(field) or []):
                        reasons.append(reason)

        exclusion_reasons = sorted(set(reasons), key=lambda code: _REASON_ORDER[code])
        eligible = not exclusion_reasons
        if eligible:
            exclusion_reasons = ["eligible_all_dimensions_matched"]
        primary = exclusion_reasons[0]
        return FeedEligibilityDecision(
            profile_id=profile["profileId"],
            calendar_event_id=view["calendarEventId"],
            eligible=eligible,
            primary_reason_code=primary,
            reason_codes=tuple(exclusion_reasons),
            matched_source_link_ids=tuple(matched_links),
            effective_review_required=review_required,
        )


def evaluate_views(
    profile: Mapping[str, Any],
    views: Iterable[Mapping[str, Any]],
    *,
    source_match_mode: str,
    review_aggregation_mode: str,
) -> list[dict[str, Any]]:
    """Diagnostic helper only; S28-3 owns production corpus iteration."""
    evaluator = FeedEligibilityEvaluator(
        source_match_mode=source_match_mode,
        review_aggregation_mode=review_aggregation_mode,
    )
    return [evaluator.evaluate(profile, view).to_dict() for view in views]


__all__ = [
    "DECISION_SCHEMA_VERSION",
    "FEED_ELIGIBILITY_VERSION",
    "INPUT_VIEW_SCHEMA_VERSION",
    "POLICY_SCHEMA_VERSION",
    "REASON_PRECEDENCE",
    "REVIEW_AGGREGATION_MODES",
    "SOURCE_MATCH_MODES",
    "FeedEligibilityDecision",
    "FeedEligibilityError",
    "FeedEligibilityEvaluator",
    "build_eligibility_input_views",
    "evaluate_views",
    "get_approved_modes",
    "get_default_profile_policy",
    "load_feed_eligibility_policy",
    "policy_is_resolved",
    "validate_eligibility_input_view",
]
