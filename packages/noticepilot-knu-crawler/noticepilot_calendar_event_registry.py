#!/usr/bin/env python3
"""S27-C stable opaque CalendarEvent identity registry and revision history.

This module materializes a consumer-owned registry snapshot from the approved
S27-B merge plans. It does not serialize ICS and does not mutate producer
candidate artifacts.
"""
from __future__ import annotations

import hashlib
import json
import re
import secrets
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

from noticepilot_calendar_event_source_link import (
    build_source_link_draft,
    persist_source_link,
    validate_source_link,
)

REGISTRY_VERSION = "0.1.0"
MANIFEST_SCHEMA_VERSION = "noticepilot.calendarEventRegistryManifest.v0.1"
EVENT_SCHEMA_VERSION = "noticepilot.calendarEventRegistryEvent.v0.1"
REVISION_SCHEMA_VERSION = "noticepilot.calendarEventRevision.v0.1"
ASSIGNMENT_SCHEMA_VERSION = "noticepilot.calendarEventIdentityAssignment.v0.1"
RELATION_SCHEMA_VERSION = "noticepilot.persistedCrossNoticeRelation.v0.1"
PROMOTION_SCHEMA_VERSION = "noticepilot.calendarEventPromotionDecision.v0.1"
OUTBOX_SCHEMA_VERSION = "noticepilot.calendarEventProjectionOutboxIntent.v0.1"
REGISTRY_ID = "s27c-publishable-corpus-20260713-v1"
ID_STRATEGY = "registry_assigned_opaque_v0"

ID_PREFIXES = {
    "calendar_event": "evt_",
    "calendar_event_source_link": "evsrc_",
    "calendar_event_revision": "evrev_",
    "calendar_event_assignment": "evasn_",
    "relation_decision": "reldec_",
    "promotion_decision": "prom_",
    "outbox": "outbox_",
}
_OPAQUE_ID = re.compile(r"^(?:evt|evsrc|evrev|evasn|reldec|prom|outbox)_[0-9a-f]{32}$")


class CalendarEventRegistryError(ValueError):
    pass


class CalendarEventRegistryConflictError(CalendarEventRegistryError):
    pass


@dataclass
class OpaqueIdIssuer:
    token_factory: Callable[[], str] = lambda: secrets.token_hex(16)

    def issue(self, kind: str) -> str:
        try:
            prefix = ID_PREFIXES[kind]
        except KeyError as exc:
            raise CalendarEventRegistryError(f"unsupported opaque ID kind: {kind}") from exc
        token = str(self.token_factory()).lower()
        if not re.fullmatch(r"[0-9a-f]{32}", token):
            raise CalendarEventRegistryError("opaque token factory must return 32 lowercase hex characters")
        return prefix + token


class DeterministicTestIdIssuer(OpaqueIdIssuer):
    """Counter-based opaque IDs for tests only; IDs never include domain material."""

    def __init__(self, seed: str = "noticepilot-s27c-test") -> None:
        self.seed = seed
        self.counter = 0
        super().__init__(self._next)

    def _next(self) -> str:
        self.counter += 1
        return hashlib.sha256(f"{self.seed}:{self.counter}".encode("utf-8")).hexdigest()[:32]


def _json_hash(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def registry_content_digest(artifacts: dict[str, list[dict[str, Any]] | dict[str, Any]]) -> str:
    return _json_hash({
        "events": list(artifacts["events"]),
        "sourceLinks": list(artifacts["sourceLinks"]),
        "revisions": list(artifacts["revisions"]),
        "assignments": list(artifacts["assignments"]),
        "relationDecisions": list(artifacts["relationDecisions"]),
    })


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _unique_by_id(rows: Iterable[dict[str, Any]], key: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for raw in rows:
        row = deepcopy(raw)
        value = str(row.get(key) or "")
        if not value:
            raise CalendarEventRegistryError(f"missing {key}")
        if value in result:
            raise CalendarEventRegistryConflictError(f"duplicate {key}: {value}")
        result[value] = row
    return result


def _projection(view: dict[str, Any]) -> dict[str, Any]:
    projection = deepcopy(view.get("eventProjection") or {})
    required = {
        "title", "eventType", "targetActor", "normalizedStart", "normalizedEnd",
        "isAllDay", "timezone", "campusScope", "audienceRules", "feedScopes",
    }
    missing = sorted(required - set(projection))
    if missing:
        raise CalendarEventRegistryError(f"candidate projection missing fields: {missing}")
    return projection


def _publication_key(view: dict[str, Any]) -> tuple[str, str]:
    return (str(view.get("publishedAt") or ""), str(view["candidateId"]))


def _build_groups(
    views_by_id: dict[str, dict[str, Any]],
    merge_plans: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    assigned: set[str] = set()
    groups: list[dict[str, Any]] = []
    for plan in sorted(merge_plans, key=lambda row: tuple(row.get("memberCandidateIds") or [])):
        if plan.get("status") != "approved":
            continue
        members = sorted(str(item) for item in plan.get("memberCandidateIds") or [])
        if len(members) < 2:
            raise CalendarEventRegistryError("approved merge plan requires at least two members")
        if not plan.get("pairwiseComplete"):
            raise CalendarEventRegistryError("approved merge plan must be pairwise complete")
        canonical = str(plan.get("canonicalCandidateId") or "")
        if canonical not in members:
            raise CalendarEventRegistryError("canonical candidate must belong to merge plan")
        unknown = [member for member in members if member not in views_by_id]
        if unknown:
            raise CalendarEventRegistryError(f"merge plan references unknown candidates: {unknown}")
        overlap = assigned.intersection(members)
        if overlap:
            raise CalendarEventRegistryConflictError(f"candidate belongs to multiple merge plans: {sorted(overlap)}")
        assigned.update(members)
        groups.append({
            "kind": "reconciled",
            "memberCandidateIds": members,
            "canonicalCandidateId": canonical,
            "decisionPairIds": sorted(set(plan.get("decisionPairIds") or [])),
            "mergePlan": deepcopy(plan),
        })
    for candidate_id in sorted(set(views_by_id) - assigned):
        groups.append({
            "kind": "singleton",
            "memberCandidateIds": [candidate_id],
            "canonicalCandidateId": candidate_id,
            "decisionPairIds": [],
            "mergePlan": None,
        })
    return groups


def _relation_for_group(group: dict[str, Any], decisions_by_pair: dict[str, dict[str, Any]]) -> str:
    if group["kind"] == "singleton":
        return "singleton"
    relations = {
        decisions_by_pair[pair_id]["relation"]
        for pair_id in group["decisionPairIds"]
        if pair_id in decisions_by_pair
    }
    if not relations:
        raise CalendarEventRegistryError("reconciled group requires persisted pair decisions")
    if len(relations) != 1:
        raise CalendarEventRegistryConflictError(f"merge group has mixed relations: {sorted(relations)}")
    relation = next(iter(relations))
    if relation not in {"duplicate", "extension"}:
        raise CalendarEventRegistryError(f"unsupported approved merge relation: {relation}")
    return relation


def _decision_rule_ids(group: dict[str, Any], decisions_by_pair: dict[str, dict[str, Any]]) -> list[str]:
    values: set[str] = set(group.get("mergePlan", {}).get("ruleIds") or []) if group.get("mergePlan") else set()
    for pair_id in group["decisionPairIds"]:
        values.update(decisions_by_pair[pair_id].get("ruleIds") or [])
        values.update((decisions_by_pair[pair_id].get("canonicalSelection") or {}).get("ruleIds") or [])
    return sorted(values)


def _build_revisions(
    *,
    event_id: str,
    relation: str,
    group: dict[str, Any],
    views_by_id: dict[str, dict[str, Any]],
    issuer: OpaqueIdIssuer,
    now: str,
) -> tuple[list[dict[str, Any]], str, int, int]:
    members = [views_by_id[candidate_id] for candidate_id in group["memberCandidateIds"]]
    canonical_id = group["canonicalCandidateId"]
    if relation != "extension":
        revision_id = issuer.issue("calendar_event_revision")
        revision = {
            "schemaVersion": REVISION_SCHEMA_VERSION,
            "revisionId": revision_id,
            "calendarEventId": event_id,
            "revisionNumber": 1,
            "sequence": 0,
            "kind": "created" if relation == "singleton" else "created_from_duplicate_sources",
            "sourceCandidateId": canonical_id,
            "previousRevisionId": None,
            "projection": _projection(views_by_id[canonical_id]),
            "active": True,
            "recordedAt": now,
            "evidencePairIds": sorted(group["decisionPairIds"]),
        }
        return [revision], revision_id, 1, 0

    if len(members) != 2:
        raise CalendarEventRegistryError("initial extension registry supports exactly two directly proven revisions")
    ordered = sorted(members, key=_publication_key)
    earlier, later = ordered
    if later["candidateId"] != canonical_id:
        raise CalendarEventRegistryConflictError("extension canonical candidate must be the later source")
    first_id = issuer.issue("calendar_event_revision")
    second_id = issuer.issue("calendar_event_revision")
    revisions = [
        {
            "schemaVersion": REVISION_SCHEMA_VERSION,
            "revisionId": first_id,
            "calendarEventId": event_id,
            "revisionNumber": 1,
            "sequence": 0,
            "kind": "created",
            "sourceCandidateId": earlier["candidateId"],
            "previousRevisionId": None,
            "projection": _projection(earlier),
            "active": False,
            "recordedAt": now,
            "evidencePairIds": sorted(group["decisionPairIds"]),
        },
        {
            "schemaVersion": REVISION_SCHEMA_VERSION,
            "revisionId": second_id,
            "calendarEventId": event_id,
            "revisionNumber": 2,
            "sequence": 1,
            "kind": "extension",
            "sourceCandidateId": later["candidateId"],
            "previousRevisionId": first_id,
            "projection": _projection(later),
            "active": True,
            "recordedAt": now,
            "evidencePairIds": sorted(group["decisionPairIds"]),
        },
    ]
    return revisions, second_id, 2, 1


def materialize_registry(
    *,
    views: Iterable[dict[str, Any]],
    relation_decisions: Iterable[dict[str, Any]],
    merge_plans: Iterable[dict[str, Any]],
    issuer: OpaqueIdIssuer,
    now: str,
    registry_id: str = REGISTRY_ID,
) -> dict[str, list[dict[str, Any]] | dict[str, Any]]:
    """Build a complete in-memory registry snapshot atomically.

    Every publishable candidate receives one assignment. Approved merge plans
    share one event ID. All other candidates retain one-to-one event identity,
    preserving pre-S27 ICS semantics without asserting unresolved relations.
    """
    views_by_id = _unique_by_id(views, "candidateId")
    decisions = [deepcopy(row) for row in relation_decisions]
    decisions_by_pair = _unique_by_id(decisions, "pairId")
    plans = [deepcopy(row) for row in merge_plans]
    groups = _build_groups(views_by_id, plans)

    events: list[dict[str, Any]] = []
    source_links: list[dict[str, Any]] = []
    revisions: list[dict[str, Any]] = []
    assignments: list[dict[str, Any]] = []
    promotion_decisions: list[dict[str, Any]] = []
    outbox: list[dict[str, Any]] = []
    candidate_to_event: dict[str, str] = {}

    for group in sorted(groups, key=lambda row: tuple(row["memberCandidateIds"])):
        event_id = issuer.issue("calendar_event")
        relation = _relation_for_group(group, decisions_by_pair)
        canonical_id = group["canonicalCandidateId"]
        canonical_view = views_by_id[canonical_id]
        rule_ids = _decision_rule_ids(group, decisions_by_pair)
        if relation == "singleton":
            rule_ids = ["S27C.unmerged_publishable_candidate_preserves_existing_projection"]

        event_revisions, active_revision_id, revision_number, sequence = _build_revisions(
            event_id=event_id,
            relation=relation,
            group=group,
            views_by_id=views_by_id,
            issuer=issuer,
            now=now,
        )
        revisions.extend(event_revisions)

        event = {
            "schemaVersion": EVENT_SCHEMA_VERSION,
            "calendarEventId": event_id,
            "idStrategy": ID_STRATEGY,
            "registryId": registry_id,
            "canonicalCandidateId": canonical_id,
            "canonicalSourceNoticeId": canonical_view["sourceNoticeId"],
            "sourceCandidateIds": sorted(group["memberCandidateIds"]),
            "sourceNoticeIds": sorted({views_by_id[candidate_id]["sourceNoticeId"] for candidate_id in group["memberCandidateIds"]}),
            "relationBasis": relation,
            "projection": _projection(canonical_view),
            "status": "published",
            "revisionNumber": revision_number,
            "sequence": sequence,
            "activeRevisionId": active_revision_id,
            "version": 0,
            "createdAt": now,
            "updatedAt": now,
            "icsUidMigrationPerformed": False,
        }
        events.append(event)

        for candidate_id in group["memberCandidateIds"]:
            if candidate_id in candidate_to_event:
                raise CalendarEventRegistryConflictError(f"candidate assigned twice: {candidate_id}")
            candidate_to_event[candidate_id] = event_id
            view = views_by_id[candidate_id]
            if candidate_id == canonical_id:
                role = "canonical"
                active_source = True
            elif relation == "duplicate":
                role = "duplicate_source"
                active_source = True
            elif relation == "extension":
                role = "extension_source"
                active_source = False
            else:
                raise CalendarEventRegistryError("noncanonical singleton source is impossible")
            draft = build_source_link_draft(
                view,
                relation_role=role,
                canonical=(candidate_id == canonical_id),
                evidence_pair_ids=group["decisionPairIds"],
                decision_rule_ids=rule_ids,
            )
            draft["activeSource"] = active_source
            link_id = issuer.issue("calendar_event_source_link")
            link = persist_source_link(
                draft,
                source_link_id=link_id,
                calendar_event_id=event_id,
                first_observed_at=now,
            )
            source_links.append(link)
            assignment_id = issuer.issue("calendar_event_assignment")
            assignments.append({
                "schemaVersion": ASSIGNMENT_SCHEMA_VERSION,
                "assignmentId": assignment_id,
                "registryId": registry_id,
                "candidateId": candidate_id,
                "sourceNoticeId": view["sourceNoticeId"],
                "calendarEventId": event_id,
                "assignmentRole": role,
                "canonical": candidate_id == canonical_id,
                "assignedAt": now,
                "decisionPairIds": sorted(group["decisionPairIds"]),
            })

        promotion_decisions.append({
            "schemaVersion": PROMOTION_SCHEMA_VERSION,
            "promotionDecisionId": issuer.issue("promotion_decision"),
            "registryId": registry_id,
            "calendarEventId": event_id,
            "candidateIds": sorted(group["memberCandidateIds"]),
            "canonicalCandidateId": canonical_id,
            "decisionStatus": "approved",
            "promotionKind": "reconciled_identity" if relation in {"duplicate", "extension"} else "unmerged_publishable_identity",
            "relationBasis": relation,
            "ruleIds": rule_ids,
            "persistedAt": now,
        })
        outbox.append({
            "schemaVersion": OUTBOX_SCHEMA_VERSION,
            "outboxId": issuer.issue("outbox"),
            "registryId": registry_id,
            "calendarEventId": event_id,
            "kind": "calendar_event_projection_changed",
            "reason": "registry_identity_created",
            "status": "pending_s27d_projection",
            "createdAt": now,
            "icsSerialized": False,
        })

    if set(candidate_to_event) != set(views_by_id):
        missing = sorted(set(views_by_id) - set(candidate_to_event))
        raise CalendarEventRegistryConflictError(f"unassigned candidates: {missing[:10]}")

    persisted_relations: list[dict[str, Any]] = []
    for decision in sorted(decisions, key=lambda row: row["pairId"]):
        candidate_ids = list(decision["candidateIds"])
        event_ids = sorted({candidate_to_event[candidate_id] for candidate_id in candidate_ids})
        merge_applied = bool(decision.get("mergeAllowed")) and len(event_ids) == 1
        if decision["relation"] in {"duplicate", "extension"} and decision.get("mergeAllowed") and not merge_applied:
            raise CalendarEventRegistryConflictError(f"approved merge relation did not converge: {decision['pairId']}")
        if decision["relation"] in {"distinct", "needs_review"} and len(event_ids) == 1:
            raise CalendarEventRegistryConflictError(f"nonmerge relation unexpectedly converged: {decision['pairId']}")
        persisted_relations.append({
            "schemaVersion": RELATION_SCHEMA_VERSION,
            "relationDecisionId": issuer.issue("relation_decision"),
            "registryId": registry_id,
            "pairId": decision["pairId"],
            "candidateIds": candidate_ids,
            "calendarEventIds": event_ids,
            "relation": decision["relation"],
            "decisionStatus": decision["decisionStatus"],
            "mergeAllowed": bool(decision.get("mergeAllowed")),
            "mergeApplied": merge_applied,
            "canonicalCandidateId": (decision.get("canonicalSelection") or {}).get("candidateId"),
            "ruleIds": sorted(set(decision.get("ruleIds") or [])),
            "evidence": deepcopy(decision.get("evidence") or {}),
            "persistedAt": now,
        })

    artifacts: dict[str, list[dict[str, Any]] | dict[str, Any]] = {
        "events": sorted(events, key=lambda row: row["calendarEventId"]),
        "sourceLinks": sorted(source_links, key=lambda row: row["sourceLinkId"]),
        "revisions": sorted(revisions, key=lambda row: (row["calendarEventId"], row["revisionNumber"])),
        "assignments": sorted(assignments, key=lambda row: row["candidateId"]),
        "relationDecisions": persisted_relations,
        "promotionDecisions": sorted(promotion_decisions, key=lambda row: row["calendarEventId"]),
        "outbox": sorted(outbox, key=lambda row: row["calendarEventId"]),
    }
    validate_registry_artifacts(artifacts, expected_candidate_count=len(views_by_id))
    return artifacts


def validate_registry_artifacts(
    artifacts: dict[str, list[dict[str, Any]] | dict[str, Any]],
    *,
    expected_candidate_count: int | None = None,
) -> None:
    required = {"events", "sourceLinks", "revisions", "assignments", "relationDecisions", "promotionDecisions", "outbox"}
    if set(artifacts) != required:
        raise CalendarEventRegistryError(f"unexpected registry artifact keys: {sorted(set(artifacts) ^ required)}")
    events = list(artifacts["events"])  # type: ignore[arg-type]
    links = list(artifacts["sourceLinks"])  # type: ignore[arg-type]
    revisions = list(artifacts["revisions"])  # type: ignore[arg-type]
    assignments = list(artifacts["assignments"])  # type: ignore[arg-type]
    promotions = list(artifacts["promotionDecisions"])  # type: ignore[arg-type]
    outbox = list(artifacts["outbox"])  # type: ignore[arg-type]

    events_by_id = _unique_by_id(events, "calendarEventId")
    _unique_by_id(links, "sourceLinkId")
    assignments_by_candidate = _unique_by_id(assignments, "candidateId")
    _unique_by_id(assignments, "assignmentId")
    _unique_by_id(revisions, "revisionId")
    _unique_by_id(promotions, "promotionDecisionId")
    _unique_by_id(outbox, "outboxId")

    if expected_candidate_count is not None and len(assignments_by_candidate) != expected_candidate_count:
        raise CalendarEventRegistryConflictError("candidate assignment count mismatch")
    if len(links) != len(assignments):
        raise CalendarEventRegistryConflictError("every candidate assignment requires one source link")
    if len(promotions) != len(events) or len(outbox) != len(events):
        raise CalendarEventRegistryConflictError("every event requires one promotion decision and outbox intent")

    for value in [*events, *links, *assignments, *revisions, *promotions, *outbox]:
        for key, field in value.items():
            domain_reference = (
                "CandidateId" in key
                or "NoticeId" in key
                or key in {"candidateId", "sourceNoticeId", "pairId", "registryId"}
            )
            if key.endswith("Id") and isinstance(field, str) and not domain_reference:
                if not _OPAQUE_ID.fullmatch(field):
                    raise CalendarEventRegistryError(f"nonopaque registry ID in {key}: {field}")

    links_by_event: dict[str, list[dict[str, Any]]] = {}
    revisions_by_event: dict[str, list[dict[str, Any]]] = {}
    assignments_by_event: dict[str, list[dict[str, Any]]] = {}
    for link in links:
        validate_source_link(link)
        links_by_event.setdefault(link["calendarEventId"], []).append(link)
    for revision in revisions:
        revisions_by_event.setdefault(revision["calendarEventId"], []).append(revision)
    for assignment in assignments:
        assignments_by_event.setdefault(assignment["calendarEventId"], []).append(assignment)

    for event_id, event in events_by_id.items():
        event_links = links_by_event.get(event_id, [])
        event_revisions = sorted(revisions_by_event.get(event_id, []), key=lambda row: row["revisionNumber"])
        event_assignments = assignments_by_event.get(event_id, [])
        if len([row for row in event_links if row["canonical"]]) != 1:
            raise CalendarEventRegistryConflictError(f"event must have exactly one canonical source link: {event_id}")
        if len([row for row in event_revisions if row["active"]]) != 1:
            raise CalendarEventRegistryConflictError(f"event must have exactly one active revision: {event_id}")
        if [row["revisionNumber"] for row in event_revisions] != list(range(1, len(event_revisions) + 1)):
            raise CalendarEventRegistryConflictError(f"revision numbers must be contiguous: {event_id}")
        if event["activeRevisionId"] != [row["revisionId"] for row in event_revisions if row["active"]][0]:
            raise CalendarEventRegistryConflictError(f"active revision mismatch: {event_id}")
        if event["revisionNumber"] != len(event_revisions):
            raise CalendarEventRegistryConflictError(f"event revision count mismatch: {event_id}")
        if event["sequence"] != event_revisions[-1]["sequence"]:
            raise CalendarEventRegistryConflictError(f"event sequence mismatch: {event_id}")
        if event["projection"] != event_revisions[-1]["projection"]:
            raise CalendarEventRegistryConflictError(f"event projection mismatch: {event_id}")
        if set(event["sourceCandidateIds"]) != {row["candidateId"] for row in event_assignments}:
            raise CalendarEventRegistryConflictError(f"event candidate assignments mismatch: {event_id}")
        if set(event["sourceCandidateIds"]) != {row["sourceCandidateId"] for row in event_links}:
            raise CalendarEventRegistryConflictError(f"event source link candidates mismatch: {event_id}")
        if event["canonicalCandidateId"] != [row["sourceCandidateId"] for row in event_links if row["canonical"]][0]:
            raise CalendarEventRegistryConflictError(f"canonical candidate mismatch: {event_id}")


def build_manifest(
    *,
    registry_id: str,
    created_at: str,
    artifacts: dict[str, list[dict[str, Any]] | dict[str, Any]],
    artifact_files: dict[str, Path],
    publishable_candidate_count: int,
    s27b_merge_plan_count: int,
) -> dict[str, Any]:
    events = list(artifacts["events"])  # type: ignore[arg-type]
    links = list(artifacts["sourceLinks"])  # type: ignore[arg-type]
    revisions = list(artifacts["revisions"])  # type: ignore[arg-type]
    assignments = list(artifacts["assignments"])  # type: ignore[arg-type]
    relations = list(artifacts["relationDecisions"])  # type: ignore[arg-type]
    promotions = list(artifacts["promotionDecisions"])  # type: ignore[arg-type]
    outbox = list(artifacts["outbox"])  # type: ignore[arg-type]
    duplicate_events = sum(row["relationBasis"] == "duplicate" for row in events)
    extension_events = sum(row["relationBasis"] == "extension" for row in events)
    singleton_events = sum(row["relationBasis"] == "singleton" for row in events)
    return {
        "schemaVersion": MANIFEST_SCHEMA_VERSION,
        "registryId": registry_id,
        "registryVersion": REGISTRY_VERSION,
        "createdAt": created_at,
        "idStrategy": ID_STRATEGY,
        "scope": "all_publishable_candidates_with_approved_s27b_merges",
        "counts": {
            "publishableCandidateCount": publishable_candidate_count,
            "calendarEventCount": len(events),
            "candidateAssignmentCount": len(assignments),
            "sourceLinkCount": len(links),
            "revisionCount": len(revisions),
            "relationDecisionCount": len(relations),
            "promotionDecisionCount": len(promotions),
            "outboxIntentCount": len(outbox),
            "singletonEventCount": singleton_events,
            "duplicateEventCount": duplicate_events,
            "extensionEventCount": extension_events,
            "approvedMergePlanCount": s27b_merge_plan_count,
            "activeRevisionCount": sum(row["active"] for row in revisions),
            "icsUidMigrationCount": 0,
        },
        "invariants": {
            "oneAssignmentPerPublishableCandidate": True,
            "oneCanonicalSourceLinkPerEvent": True,
            "oneActiveRevisionPerEvent": True,
            "approvedMergeMembersShareEventId": True,
            "needsReviewRelationsNotMerged": True,
            "opaqueIdsExcludeTitleDateAndCandidateMaterial": True,
            "icsMutationPerformed": False,
        },
        "artifacts": {
            name: {
                "path": path.name,
                "sha256": file_sha256(path),
            }
            for name, path in sorted(artifact_files.items())
        },
        "contentDigest": registry_content_digest(artifacts),
    }
