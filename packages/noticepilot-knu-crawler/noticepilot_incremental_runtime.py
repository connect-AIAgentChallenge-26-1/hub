#!/usr/bin/env python3
"""S29 content-hash incremental crawler/runtime coordination.

The coordinator persists source state and durable outbox intents in one
transaction. Extraction, reconciliation, feed rebuilding, and delivery cache
invalidation are separate idempotent consumers.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any, Iterable, Mapping

from noticepilot_postgres_persistence import (
    InMemoryPostgresReferenceStore,
    PostgresPersistenceError,
    canonical_sha256,
)

INCREMENTAL_PLAN_SCHEMA_VERSION = "noticepilot.incrementalSourcePlan.v0.1"
CRAWLER_BATCH_RESULT_SCHEMA_VERSION = "noticepilot.crawlerBatchResult.v0.1"
RUNTIME_VERSION = "0.1.0"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
ACTIONS = {
    "insert_and_extract",
    "reprocess_content_changed",
    "refresh_metadata_only",
    "skip_unchanged",
    "mark_deleted",
    "retain_last_good_retry",
}


class IncrementalRuntimeError(RuntimeError):
    pass


class IncrementalRuntimeValidationError(ValueError):
    pass


@dataclass(frozen=True)
class IncrementalSourcePlan:
    payload: dict[str, Any]

    @property
    def action(self) -> str:
        return str(self.payload["action"])


def _validate_hash(value: Any, field: str, *, nullable: bool = False) -> str | None:
    if value is None and nullable:
        return None
    if not isinstance(value, str) or not SHA256_RE.fullmatch(value):
        raise IncrementalRuntimeValidationError(f"{field} must be lowercase SHA-256")
    return value


def validate_incoming_source_notice(row: Mapping[str, Any]) -> dict[str, Any]:
    required = {
        "sourceNoticeId",
        "institutionId",
        "canonicalBoardCategory",
        "sourcePostId",
        "sourceIdentityKey",
        "title",
        "sourceUrl",
        "canonicalSourceUrl",
        "publishedAt",
        "fetchedAt",
        "contentHash",
        "status",
        "payload",
    }
    if not isinstance(row, Mapping) or set(row) != required:
        raise IncrementalRuntimeValidationError("incoming source notice key mismatch")
    status = row["status"]
    if status not in {"active", "missing", "deleted", "fetch_failed"}:
        raise IncrementalRuntimeValidationError("invalid source status")
    content_hash = _validate_hash(row["contentHash"], "contentHash", nullable=status != "active")
    if status == "active" and content_hash is None:
        raise IncrementalRuntimeValidationError("active source requires contentHash")
    expected_identity = f"{row['institutionId']}:{row['canonicalBoardCategory']}:{row['sourcePostId']}"
    if row["sourceIdentityKey"] != expected_identity:
        raise IncrementalRuntimeValidationError("sourceIdentityKey mismatch")
    if not isinstance(row["payload"], Mapping):
        raise IncrementalRuntimeValidationError("payload must be object")
    return json.loads(json.dumps(row, ensure_ascii=False))


def _metadata_projection(row: Mapping[str, Any], *, persisted: bool = False) -> dict[str, Any]:
    if persisted:
        return {
            "title": row.get("title"),
            "sourceUrl": row.get("source_url"),
            "canonicalSourceUrl": row.get("canonical_source_url"),
            "publishedAt": row.get("published_at"),
        }
    return {
        "title": row.get("title"),
        "sourceUrl": row.get("sourceUrl"),
        "canonicalSourceUrl": row.get("canonicalSourceUrl"),
        "publishedAt": row.get("publishedAt"),
    }


def plan_source_notice_change(
    existing: Mapping[str, Any] | None,
    incoming: Mapping[str, Any],
) -> IncrementalSourcePlan:
    incoming = validate_incoming_source_notice(incoming)
    status = incoming["status"]
    if existing is not None and existing["source_identity_key"] != incoming["sourceIdentityKey"]:
        raise IncrementalRuntimeValidationError("source identity cannot change for existing notice")

    if status == "fetch_failed":
        action = "retain_last_good_retry"
        persist = existing is None
        extract = reconcile = rebuild = False
        reasons = ["source_fetch_failed", "last_good_state_preserved"]
    elif status in {"missing", "deleted"}:
        action = "mark_deleted"
        persist = True
        extract = False
        reconcile = rebuild = existing is not None and existing.get("status") != "deleted"
        reasons = ["source_deleted_or_missing"]
    elif existing is None:
        action = "insert_and_extract"
        persist = extract = reconcile = rebuild = True
        reasons = ["new_source_identity"]
    elif existing.get("content_hash") != incoming["contentHash"]:
        action = "reprocess_content_changed"
        persist = extract = reconcile = rebuild = True
        reasons = ["content_hash_changed"]
    elif _metadata_projection(existing, persisted=True) != _metadata_projection(incoming):
        action = "refresh_metadata_only"
        persist = True
        extract = reconcile = rebuild = False
        reasons = ["content_hash_unchanged", "metadata_changed"]
    else:
        action = "skip_unchanged"
        persist = extract = reconcile = rebuild = False
        reasons = ["content_hash_unchanged", "metadata_unchanged"]

    payload = {
        "schemaVersion": INCREMENTAL_PLAN_SCHEMA_VERSION,
        "runtimeVersion": RUNTIME_VERSION,
        "sourceNoticeId": incoming["sourceNoticeId"],
        "sourceIdentityKey": incoming["sourceIdentityKey"],
        "previousContentHash": existing.get("content_hash") if existing else None,
        "incomingContentHash": incoming["contentHash"],
        "action": action,
        "persistSourceState": persist,
        "enqueueExtraction": extract,
        "requiresEventReconciliation": reconcile,
        "requiresFeedRebuild": rebuild,
        "reasonCodes": reasons,
    }
    validate_incremental_source_plan(payload)
    return IncrementalSourcePlan(payload=payload)


def validate_incremental_source_plan(plan: Mapping[str, Any]) -> None:
    required = {
        "schemaVersion", "runtimeVersion", "sourceNoticeId", "sourceIdentityKey",
        "previousContentHash", "incomingContentHash", "action", "persistSourceState",
        "enqueueExtraction", "requiresEventReconciliation", "requiresFeedRebuild", "reasonCodes",
    }
    if not isinstance(plan, Mapping) or set(plan) != required:
        raise IncrementalRuntimeValidationError("incremental source plan key mismatch")
    if plan["schemaVersion"] != INCREMENTAL_PLAN_SCHEMA_VERSION or plan["runtimeVersion"] != RUNTIME_VERSION:
        raise IncrementalRuntimeValidationError("incremental plan version mismatch")
    if plan["action"] not in ACTIONS:
        raise IncrementalRuntimeValidationError("invalid incremental action")
    _validate_hash(plan["previousContentHash"], "previousContentHash", nullable=True)
    _validate_hash(plan["incomingContentHash"], "incomingContentHash", nullable=True)
    if not isinstance(plan["reasonCodes"], list) or not plan["reasonCodes"]:
        raise IncrementalRuntimeValidationError("incremental plan requires reason codes")


def _outbox_id(run_id: str, notice_id: str, event_type: str) -> str:
    digest = hashlib.sha256(f"{run_id}:{notice_id}:{event_type}".encode("utf-8")).hexdigest()[:32]
    return f"outbox_{digest}"


def _source_row(incoming: Mapping[str, Any], existing: Mapping[str, Any] | None, now: str) -> dict[str, Any]:
    revision = int(existing.get("source_revision", 0)) + 1 if existing else 1
    if existing and existing.get("content_hash") == incoming.get("contentHash"):
        revision = int(existing["source_revision"])
    content_hash = incoming.get("contentHash") or (existing.get("content_hash") if existing else None)
    if content_hash is None:
        content_hash = "0" * 64
    return {
        "source_notice_id": incoming["sourceNoticeId"],
        "institution_id": incoming["institutionId"],
        "canonical_board_category": incoming["canonicalBoardCategory"],
        "source_post_id": incoming["sourcePostId"],
        "source_identity_key": incoming["sourceIdentityKey"],
        "title": incoming["title"],
        "source_url": incoming["sourceUrl"],
        "canonical_source_url": incoming["canonicalSourceUrl"],
        "published_at": incoming["publishedAt"],
        "fetched_at": incoming["fetchedAt"],
        "content_hash": content_hash,
        "semantic_content_hash": existing.get("semantic_content_hash") if existing else None,
        "status": "deleted" if incoming["status"] in {"deleted", "missing"} else incoming["status"],
        "source_revision": revision,
        "payload": json.loads(json.dumps(incoming, ensure_ascii=False)),
        "created_at": existing.get("created_at", now) if existing else now,
        "updated_at": now,
    }


class IncrementalRuntimeCoordinator:
    def __init__(self, store: InMemoryPostgresReferenceStore) -> None:
        self.store = store

    def apply_crawler_batch(
        self,
        incoming_rows: Iterable[Mapping[str, Any]],
        *,
        run_id: str,
        source_key: str,
        now: str,
        fail_after_index: int | None = None,
    ) -> dict[str, Any]:
        rows = [validate_incoming_source_notice(row) for row in incoming_rows]
        rows.sort(key=lambda row: row["sourceNoticeId"])
        plans: list[dict[str, Any]] = []
        outbox_ids: list[str] = []
        with self.store.transaction():
            for index, incoming in enumerate(rows):
                existing = self.store.get("source_notice", incoming["sourceNoticeId"])
                plan = plan_source_notice_change(existing, incoming)
                plans.append(plan.payload)
                if plan.payload["persistSourceState"]:
                    self.store.upsert_mutable("source_notice", _source_row(incoming, existing, now))
                processing_status = {
                    "insert_and_extract": "pending",
                    "reprocess_content_changed": "pending",
                    "mark_deleted": "deleted",
                    "retain_last_good_retry": "failed",
                }.get(plan.action, "completed")
                if plan.action != "skip_unchanged" or existing is not None:
                    state = self.store.get("source_processing_state", incoming["sourceNoticeId"]) or {
                        "source_notice_id": incoming["sourceNoticeId"],
                        "last_processed_content_hash": existing.get("content_hash") if existing else None,
                        "last_extraction_run_id": None,
                        "retry_count": 0,
                    }
                    state.update({
                        "processing_status": processing_status,
                        "retry_count": int(state.get("retry_count", 0)) + int(plan.action == "retain_last_good_retry"),
                        "last_error": "source_fetch_failed" if plan.action == "retain_last_good_retry" else None,
                        "updated_at": now,
                    })
                    self.store.upsert_mutable("source_processing_state", state)
                event_types: list[str] = []
                if plan.payload["enqueueExtraction"]:
                    event_types.append("extract_source_notice")
                if plan.action == "mark_deleted" and plan.payload["requiresEventReconciliation"]:
                    event_types.append("reconcile_deleted_source_notice")
                if plan.action == "retain_last_good_retry":
                    event_types.append("retry_source_fetch")
                for event_type in event_types:
                    outbox_id = _outbox_id(run_id, incoming["sourceNoticeId"], event_type)
                    self.store.insert_immutable("runtime_outbox", {
                        "outbox_id": outbox_id,
                        "aggregate_type": "source_notice",
                        "aggregate_id": incoming["sourceNoticeId"],
                        "event_type": event_type,
                        "payload": {"plan": plan.payload, "runId": run_id},
                        "status": "pending",
                        "attempt_count": 0,
                        "available_at": now,
                        "claimed_at": None,
                        "delivered_at": None,
                        "last_error": None,
                        "created_at": now,
                        "updated_at": now,
                    })
                    outbox_ids.append(outbox_id)
                if fail_after_index is not None and index == fail_after_index:
                    raise IncrementalRuntimeError("injected crawler batch failure")
            self.store.upsert_mutable("crawler_checkpoint", {
                "source_key": source_key,
                "cursor_value": run_id,
                "last_started_at": now,
                "last_succeeded_at": now,
                "last_failed_at": None,
                "last_error": None,
                "consecutive_failure_count": 0,
                "updated_at": now,
            })
        counts: dict[str, int] = {}
        for plan in plans:
            counts[plan["action"]] = counts.get(plan["action"], 0) + 1
        return {
            "schemaVersion": CRAWLER_BATCH_RESULT_SCHEMA_VERSION,
            "runtimeVersion": RUNTIME_VERSION,
            "runId": run_id,
            "sourceKey": source_key,
            "inputCount": len(rows),
            "actionCounts": dict(sorted(counts.items())),
            "outboxCount": len(outbox_ids),
            "outboxIds": sorted(outbox_ids),
            "plans": plans,
            "resultHash": canonical_sha256(plans),
        }

    def enqueue_event_projection_change(
        self,
        *,
        calendar_event_id: str,
        sequence: int,
        now: str,
    ) -> str:
        outbox_id = _outbox_id(f"event-seq-{sequence}", calendar_event_id, "rebuild_subscription_feeds")
        self.store.insert_immutable("runtime_outbox", {
            "outbox_id": outbox_id,
            "aggregate_type": "calendar_event",
            "aggregate_id": calendar_event_id,
            "event_type": "rebuild_subscription_feeds",
            "payload": {"calendarEventId": calendar_event_id, "sequence": sequence},
            "status": "pending",
            "attempt_count": 0,
            "available_at": now,
            "claimed_at": None,
            "delivered_at": None,
            "last_error": None,
            "created_at": now,
            "updated_at": now,
        })
        return outbox_id
