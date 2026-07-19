#!/usr/bin/env python3
"""CalendarEventSourceLink draft and persisted contracts for S27-B."""
from __future__ import annotations

from copy import deepcopy
from typing import Any

DRAFT_SCHEMA_VERSION = "noticepilot.calendarEventSourceLinkDraft.v0.1"
LINK_SCHEMA_VERSION = "noticepilot.calendarEventSourceLink.v0.1"
RELATION_ROLES = {
    "canonical",
    "duplicate_source",
    "extension_source",
    "revision_source",
    "replacement_source",
}


class CalendarEventSourceLinkError(ValueError):
    pass


def build_source_link_draft(
    view: dict[str, Any],
    *,
    relation_role: str,
    canonical: bool,
    evidence_pair_ids: list[str] | None = None,
    decision_rule_ids: list[str] | None = None,
) -> dict[str, Any]:
    if relation_role not in RELATION_ROLES:
        raise CalendarEventSourceLinkError(f"unsupported relation role: {relation_role}")
    if canonical != (relation_role == "canonical"):
        raise CalendarEventSourceLinkError("canonical flag must match canonical relation role")
    identity = deepcopy(view.get("sourceIdentity") or {})
    draft = {
        "schemaVersion": DRAFT_SCHEMA_VERSION,
        "sourceNoticeId": view.get("sourceNoticeId"),
        "sourceCandidateId": view.get("candidateId"),
        "sourceIdentity": identity,
        "observedSourceUrl": identity.get("observedSourceUrl"),
        "canonicalSourceUrl": identity.get("canonicalSourceUrl"),
        "publishedAt": view.get("publishedAt"),
        "relationRole": relation_role,
        "canonical": canonical,
        "activeSource": True,
        "evidencePairIds": sorted(set(evidence_pair_ids or [])),
        "decisionRuleIds": sorted(set(decision_rule_ids or [])),
    }
    validate_source_link_draft(draft)
    return draft


def persist_source_link(
    draft: dict[str, Any],
    *,
    source_link_id: str,
    calendar_event_id: str,
    first_observed_at: str,
    last_observed_at: str | None = None,
) -> dict[str, Any]:
    validate_source_link_draft(draft)
    if not source_link_id or not calendar_event_id or not first_observed_at:
        raise CalendarEventSourceLinkError("persisted link requires IDs and firstObservedAt")
    result = {
        "schemaVersion": LINK_SCHEMA_VERSION,
        "sourceLinkId": source_link_id,
        "calendarEventId": calendar_event_id,
        **{key: deepcopy(value) for key, value in draft.items() if key != "schemaVersion"},
        "firstObservedAt": first_observed_at,
        "lastObservedAt": last_observed_at or first_observed_at,
    }
    validate_source_link(result)
    return result


def validate_source_link_draft(value: dict[str, Any]) -> None:
    required = {
        "schemaVersion", "sourceNoticeId", "sourceCandidateId", "sourceIdentity",
        "observedSourceUrl", "canonicalSourceUrl", "publishedAt", "relationRole",
        "canonical", "activeSource", "evidencePairIds", "decisionRuleIds",
    }
    if set(value) != required:
        raise CalendarEventSourceLinkError(f"unexpected draft keys: {sorted(set(value) ^ required)}")
    if value["schemaVersion"] != DRAFT_SCHEMA_VERSION:
        raise CalendarEventSourceLinkError("invalid draft schemaVersion")
    if not value["sourceNoticeId"] or not value["sourceCandidateId"]:
        raise CalendarEventSourceLinkError("source notice and candidate IDs are required")
    if value["relationRole"] not in RELATION_ROLES:
        raise CalendarEventSourceLinkError("invalid relationRole")
    if value["canonical"] != (value["relationRole"] == "canonical"):
        raise CalendarEventSourceLinkError("canonical role invariant failed")
    identity = value["sourceIdentity"]
    if value["canonicalSourceUrl"] != identity.get("canonicalSourceUrl"):
        raise CalendarEventSourceLinkError("canonicalSourceUrl must match source identity")
    if value["observedSourceUrl"] != identity.get("observedSourceUrl"):
        raise CalendarEventSourceLinkError("observedSourceUrl must match source identity")
    if len(value["evidencePairIds"]) != len(set(value["evidencePairIds"])):
        raise CalendarEventSourceLinkError("evidencePairIds must be unique")
    if len(value["decisionRuleIds"]) != len(set(value["decisionRuleIds"])):
        raise CalendarEventSourceLinkError("decisionRuleIds must be unique")


def validate_source_link(value: dict[str, Any]) -> None:
    required = {
        "schemaVersion", "sourceLinkId", "calendarEventId", "sourceNoticeId",
        "sourceCandidateId", "sourceIdentity", "observedSourceUrl",
        "canonicalSourceUrl", "publishedAt", "relationRole", "canonical",
        "activeSource", "evidencePairIds", "decisionRuleIds", "firstObservedAt",
        "lastObservedAt",
    }
    if set(value) != required:
        raise CalendarEventSourceLinkError(f"unexpected persisted keys: {sorted(set(value) ^ required)}")
    if value["schemaVersion"] != LINK_SCHEMA_VERSION:
        raise CalendarEventSourceLinkError("invalid link schemaVersion")
    if not value["sourceLinkId"] or not value["calendarEventId"]:
        raise CalendarEventSourceLinkError("persisted link IDs are required")
    draft = {
        "schemaVersion": DRAFT_SCHEMA_VERSION,
        **{
            key: deepcopy(value[key])
            for key in value
            if key not in {"schemaVersion", "sourceLinkId", "calendarEventId", "firstObservedAt", "lastObservedAt"}
        },
    }
    validate_source_link_draft(draft)
    if value["lastObservedAt"] < value["firstObservedAt"]:
        raise CalendarEventSourceLinkError("lastObservedAt must not precede firstObservedAt")
