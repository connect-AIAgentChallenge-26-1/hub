#!/usr/bin/env python3
"""Atomic persistence boundary contract for event promotion and reconciliation."""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Callable

PLAN_SCHEMA_VERSION = "noticepilot.atomicCalendarEventPersistencePlan.v0.1"
RESULT_SCHEMA_VERSION = "noticepilot.atomicCalendarEventPersistenceResult.v0.1"
OPERATIONS = {
    "create_distinct_event",
    "attach_duplicate_source",
    "apply_extension",
    "record_needs_review",
}


class AtomicBoundaryError(RuntimeError):
    pass


class AtomicBoundaryValidationError(ValueError):
    pass


def validate_atomic_plan(plan: dict[str, Any]) -> None:
    required = {
        "schemaVersion", "operation", "relationDecision", "targetCalendarEventId",
        "expectedEventVersion", "eventMutation", "sourceLinkDrafts",
        "revisionRecord", "outboxIntent", "idStrategy",
    }
    if set(plan) != required:
        raise AtomicBoundaryValidationError(f"unexpected plan keys: {sorted(set(plan) ^ required)}")
    if plan["schemaVersion"] != PLAN_SCHEMA_VERSION:
        raise AtomicBoundaryValidationError("invalid plan schemaVersion")
    if plan["operation"] not in OPERATIONS:
        raise AtomicBoundaryValidationError("invalid operation")
    if plan["idStrategy"] != "registry_assigned_opaque_v0":
        raise AtomicBoundaryValidationError("unsupported ID strategy")
    decision = plan["relationDecision"]
    if decision.get("status") not in {"approved", "needs_review"}:
        raise AtomicBoundaryValidationError("relation decision must be approved or needs_review")
    if plan["operation"] == "record_needs_review":
        if decision.get("status") != "needs_review":
            raise AtomicBoundaryValidationError("review operation requires needs_review decision")
        if plan["eventMutation"] is not None or plan["sourceLinkDrafts"]:
            raise AtomicBoundaryValidationError("review-only plan cannot mutate event or source links")
        if plan["outboxIntent"] is not None:
            raise AtomicBoundaryValidationError("review-only plan cannot emit projection intent")
        return
    if decision.get("status") != "approved":
        raise AtomicBoundaryValidationError("mutating operation requires approved decision")
    if not plan["sourceLinkDrafts"]:
        raise AtomicBoundaryValidationError("mutating plan requires source link drafts")
    if plan["operation"] == "create_distinct_event":
        if plan["targetCalendarEventId"] is not None:
            raise AtomicBoundaryValidationError("new event plan cannot provide target ID")
        if not plan["eventMutation"] or plan["eventMutation"].get("kind") != "create":
            raise AtomicBoundaryValidationError("new event plan requires create mutation")
        if plan["expectedEventVersion"] is not None:
            raise AtomicBoundaryValidationError("new event plan cannot require prior version")
    else:
        if not plan["targetCalendarEventId"]:
            raise AtomicBoundaryValidationError("existing-event operation requires target ID")
        if not isinstance(plan["expectedEventVersion"], int) or plan["expectedEventVersion"] < 0:
            raise AtomicBoundaryValidationError("existing-event operation requires expected version")
    if not plan["outboxIntent"] or plan["outboxIntent"].get("kind") != "calendar_event_projection_changed":
        raise AtomicBoundaryValidationError("mutating plan requires outbox projection intent")


@dataclass
class InMemoryAtomicCalendarEventRepository:
    events: dict[str, dict[str, Any]] = field(default_factory=dict)
    source_links: dict[str, dict[str, Any]] = field(default_factory=dict)
    relation_decisions: dict[str, dict[str, Any]] = field(default_factory=dict)
    revisions: dict[str, dict[str, Any]] = field(default_factory=dict)
    outbox: list[dict[str, Any]] = field(default_factory=list)

    def apply(
        self,
        plan: dict[str, Any],
        *,
        id_factory: Callable[[str], str],
        now: str,
        fail_after: str | None = None,
    ) -> dict[str, Any]:
        validate_atomic_plan(plan)
        snapshot = deepcopy(
            (self.events, self.source_links, self.relation_decisions, self.revisions, self.outbox)
        )
        try:
            decision_id = id_factory("relation_decision")
            decision = {"decisionId": decision_id, "persistedAt": now, **deepcopy(plan["relationDecision"])}
            self.relation_decisions[decision_id] = decision
            if fail_after == "relation_decision":
                raise AtomicBoundaryError("injected failure after relation decision")

            if plan["operation"] == "record_needs_review":
                return {
                    "schemaVersion": RESULT_SCHEMA_VERSION,
                    "status": "committed",
                    "operation": plan["operation"],
                    "relationDecisionId": decision_id,
                    "calendarEventId": None,
                    "sourceLinkIds": [],
                    "revisionId": None,
                    "outboxId": None,
                }

            event_id = plan["targetCalendarEventId"]
            mutation = deepcopy(plan["eventMutation"])
            if plan["operation"] == "create_distinct_event":
                event_id = id_factory("calendar_event")
                if event_id in self.events:
                    raise AtomicBoundaryError("event ID collision")
                self.events[event_id] = {
                    "calendarEventId": event_id,
                    "version": 0,
                    "sequence": 0,
                    "status": "published",
                    "projection": mutation["projection"],
                    "createdAt": now,
                    "updatedAt": now,
                }
            else:
                event = self.events.get(str(event_id))
                if event is None:
                    raise AtomicBoundaryError("target event not found")
                if event["version"] != plan["expectedEventVersion"]:
                    raise AtomicBoundaryError("optimistic version conflict")
                if plan["operation"] == "apply_extension":
                    event["projection"] = mutation["projection"]
                    event["sequence"] += 1
                event["version"] += 1
                event["updatedAt"] = now
            if fail_after == "event":
                raise AtomicBoundaryError("injected failure after event mutation")

            source_link_ids: list[str] = []
            for draft in plan["sourceLinkDrafts"]:
                link_id = id_factory("calendar_event_source_link")
                self.source_links[link_id] = {
                    "sourceLinkId": link_id,
                    "calendarEventId": event_id,
                    "firstObservedAt": now,
                    "lastObservedAt": now,
                    **deepcopy(draft),
                }
                source_link_ids.append(link_id)
            if fail_after == "source_links":
                raise AtomicBoundaryError("injected failure after source links")

            revision_id = None
            if plan["revisionRecord"] is not None:
                revision_id = id_factory("calendar_event_revision")
                self.revisions[revision_id] = {
                    "revisionId": revision_id,
                    "calendarEventId": event_id,
                    "recordedAt": now,
                    **deepcopy(plan["revisionRecord"]),
                }
            if fail_after == "revision":
                raise AtomicBoundaryError("injected failure after revision")

            outbox_id = id_factory("outbox")
            self.outbox.append(
                {
                    "outboxId": outbox_id,
                    "calendarEventId": event_id,
                    "createdAt": now,
                    **deepcopy(plan["outboxIntent"]),
                }
            )
            if fail_after == "outbox":
                raise AtomicBoundaryError("injected failure after outbox")

            return {
                "schemaVersion": RESULT_SCHEMA_VERSION,
                "status": "committed",
                "operation": plan["operation"],
                "relationDecisionId": decision_id,
                "calendarEventId": event_id,
                "sourceLinkIds": source_link_ids,
                "revisionId": revision_id,
                "outboxId": outbox_id,
            }
        except Exception:
            (
                self.events,
                self.source_links,
                self.relation_decisions,
                self.revisions,
                self.outbox,
            ) = snapshot
            raise
