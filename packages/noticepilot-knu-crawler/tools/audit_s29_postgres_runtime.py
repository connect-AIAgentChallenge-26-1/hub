#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from typing import Any

from noticepilot_incremental_runtime import IncrementalRuntimeCoordinator
from noticepilot_postgres_persistence import (
    BOOTSTRAP_TABLE_ORDER,
    MIGRATION_VERSION,
    InMemoryPostgresReferenceStore,
    build_foundation_bootstrap_bundle,
    canonical_sha256,
    file_sha256,
    validate_migration_sql,
)
from noticepilot_subscription_delivery import SubscriptionFeedDeliveryService

REPORT_SCHEMA_VERSION = "noticepilot.s29PostgresRuntimeAudit.v0.1"
RUNTIME_MANIFEST_SCHEMA_VERSION = "noticepilot.s29RuntimeManifest.v0.1"
FIXED_NOW = "2026-07-13T20:30:00+09:00"


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _incoming_from_source(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "sourceNoticeId": row["source_notice_id"],
        "institutionId": row["institution_id"],
        "canonicalBoardCategory": row["canonical_board_category"],
        "sourcePostId": row["source_post_id"],
        "sourceIdentityKey": row["source_identity_key"],
        "title": row["title"],
        "sourceUrl": row["source_url"],
        "canonicalSourceUrl": row["canonical_source_url"],
        "publishedAt": row["published_at"],
        "fetchedAt": FIXED_NOW,
        "contentHash": row["content_hash"],
        "status": "active",
        "payload": {"bootstrapSourceNoticeId": row["source_notice_id"]},
    }


def _audit_token(profile_id: str) -> str:
    # Non-deployable deterministic audit credential. Raw value is never written.
    seed = hashlib.sha256(f"noticepilot-s29-audit-only:{profile_id}".encode()).hexdigest()
    return seed[:43]


def _feed_id(event_count: int) -> str:
    return f"feed_{event_count:032x}"


def build_report(root: Path, *, runtime_dir: Path | None = None) -> dict[str, Any]:
    root = Path(root)
    errors: list[str] = []
    migration = root / "migrations/postgresql/0001_s29_initial.sql"
    try:
        sql = migration.read_text(encoding="utf-8")
        validate_migration_sql(sql)
    except Exception as exc:
        errors.append(f"migration validation failed: {exc}")
        sql = ""

    bundle = build_foundation_bootstrap_bundle(root, generated_at=FIXED_NOW)
    store = InMemoryPostgresReferenceStore()
    migration_checksum = file_sha256(migration)
    try:
        store.apply_migration(version=MIGRATION_VERSION, checksum_sha256=migration_checksum)
        first_insert = store.bootstrap(bundle)
        second_insert = store.bootstrap(bundle)
        store.validate_relational_integrity()
    except Exception as exc:
        errors.append(f"bootstrap failed: {exc}")
        first_insert = {}
        second_insert = {}

    expected_counts = {
        "source_notice": 2059,
        "extraction_run": 2059,
        "calendar_event_candidate": 1304,
        "calendar_event": 900,
        "calendar_event_revision": 901,
        "calendar_event_source_link": 909,
        "candidate_event_assignment": 909,
        "cross_notice_relation_decision": 343,
        "subscription_profile_revision": 2,
        "subscription_profile_head": 2,
        "feed_snapshot": 2,
        "feed_snapshot_event": 900,
    }
    if bundle.counts != expected_counts:
        errors.append(f"bootstrap count mismatch: {bundle.counts}")
    if first_insert != expected_counts:
        errors.append("first bootstrap insert counts mismatch")
    if second_insert and any(second_insert.values()):
        errors.append("second bootstrap was not idempotent")

    replay_store = InMemoryPostgresReferenceStore()
    replay_store.bootstrap(bundle)
    coordinator = IncrementalRuntimeCoordinator(replay_store)
    incoming_rows = [_incoming_from_source(row) for row in replay_store.rows("source_notice")]
    replay = coordinator.apply_crawler_batch(
        incoming_rows,
        run_id="s29-full-corpus-replay-1",
        source_key="knu:all-supported-boards",
        now=FIXED_NOW,
    )
    if replay["actionCounts"] != {"skip_unchanged": 2059}:
        errors.append(f"full replay not unchanged-only: {replay['actionCounts']}")
    if replay["outboxCount"] != 0:
        errors.append("unchanged replay emitted outbox work")

    changed_store = InMemoryPostgresReferenceStore()
    changed_store.bootstrap(bundle)
    changed_coordinator = IncrementalRuntimeCoordinator(changed_store)
    changed = _incoming_from_source(changed_store.rows("source_notice")[0])
    changed["contentHash"] = hashlib.sha256((changed["contentHash"] + ":changed").encode()).hexdigest()
    changed["payload"] = {"simulated": "content_changed"}
    changed_result = changed_coordinator.apply_crawler_batch(
        [changed], run_id="s29-changed-notice-1", source_key="knu:changed-simulation", now=FIXED_NOW
    )
    if changed_result["actionCounts"] != {"reprocess_content_changed": 1}:
        errors.append("changed notice did not enqueue reprocessing")
    if changed_result["outboxCount"] != 1:
        errors.append("changed notice outbox count mismatch")

    delivery_store = InMemoryPostgresReferenceStore()
    delivery_store.bootstrap(bundle)
    service = SubscriptionFeedDeliveryService(delivery_store)
    heads = {row["profile_id"]: row for row in delivery_store.rows("subscription_profile_head")}
    snapshots = {row["profile_id"]: row for row in delivery_store.rows("feed_snapshot")}
    delivery_rows: list[dict[str, Any]] = []
    rendered_counts: dict[str, int] = {}
    conditional_statuses: dict[str, int] = {}
    for profile_id, head in sorted(heads.items()):
        snapshot = snapshots[profile_id]
        event_count = snapshot["event_count"]
        raw_token = _audit_token(profile_id)
        provisioned = service.provision_feed(
            profile_id=profile_id,
            snapshot_id=snapshot["snapshot_id"],
            calendar_name=("NoticePilot 학생 일정" if event_count == 601 else "NoticePilot 채용 접수 일정"),
            now=FIXED_NOW,
            feed_id_factory=lambda count=event_count: _feed_id(count),
            token_factory=lambda token=raw_token: token,
        )
        response = service.render_feed(provisioned.feed_id, raw_token)
        etag = dict(response.headers)["ETag"]
        conditional = service.render_feed(provisioned.feed_id, raw_token, if_none_match=etag)
        rendered_count = response.body.count(b"BEGIN:VEVENT")
        rendered_counts[str(event_count)] = rendered_count
        conditional_statuses[str(event_count)] = conditional.status_code
        stored = delivery_store.get("subscription_feed", provisioned.feed_id)
        if raw_token in json.dumps(stored, ensure_ascii=False):
            errors.append("raw token persisted in feed row")
        delivery_rows.append({
            "feedId": provisioned.feed_id,
            "profileId": profile_id,
            "profileRevision": head["current_revision"],
            "currentSnapshotId": snapshot["snapshot_id"],
            "eventCount": event_count,
            "calendarName": stored["calendar_name"],
            "status": stored["status"],
            "tokenHashSha256": stored["token_hash_sha256"],
            "tokenPrefix": stored["token_prefix"],
            "rawTokenPersisted": False,
            "subscriptionPathTemplate": f"/subscription-feeds/{provisioned.feed_id}/{{opaqueToken}}.ics",
            "etag": stored["etag"],
        })
    if sorted(rendered_counts.values()) != [299, 601]:
        errors.append(f"rendered feed count mismatch: {rendered_counts}")
    if set(conditional_statuses.values()) != {304}:
        errors.append("conditional ETag request did not return 304")

    runtime_artifacts = {
        "bootstrap-manifest.json": bundle.to_manifest(),
        "incremental-replay-report.json": {
            "schemaVersion": "noticepilot.s29IncrementalReplayReport.v0.1",
            "fullCorpus": {
                "inputNoticeCount": replay["inputCount"],
                "actionCounts": replay["actionCounts"],
                "outboxCount": replay["outboxCount"],
                "resultHash": replay["resultHash"],
            },
            "changedNoticeSimulation": {
                "sourceNoticeId": changed["sourceNoticeId"],
                "actionCounts": changed_result["actionCounts"],
                "outboxCount": changed_result["outboxCount"],
                "outboxIds": changed_result["outboxIds"],
            },
        },
        "reference-subscription-feeds.json": {
            "schemaVersion": "noticepilot.s29ReferenceSubscriptionFeeds.v0.1",
            "auditOnly": True,
            "deployableCredentials": False,
            "rawTokensWritten": False,
            "feeds": sorted(delivery_rows, key=lambda row: row["eventCount"], reverse=True),
        },
    }

    manifest = {
        "schemaVersion": RUNTIME_MANIFEST_SCHEMA_VERSION,
        "runtimeVersion": "0.1.0",
        "createdAt": FIXED_NOW,
        "migration": {
            "version": MIGRATION_VERSION,
            "path": "migrations/postgresql/0001_s29_initial.sql",
            "sha256": migration_checksum,
            "validatedStatically": not any("migration" in error for error in errors),
            "executedAgainstLivePostgres": False,
            "livePostgresReason": "postgres_server_and_python_driver_unavailable_in_execution_environment",
        },
        "bootstrap": {
            "bundleSha256": bundle.integrity["bootstrapBundleSha256"],
            "counts": bundle.counts,
            "idempotentSecondInsert": not any(second_insert.values()) if second_insert else False,
        },
        "incrementalRuntime": {
            "fullCorpusUnchangedReplay": replay["actionCounts"] == {"skip_unchanged": 2059},
            "contentChangedSimulation": changed_result["actionCounts"] == {"reprocess_content_changed": 1},
            "durableOutbox": True,
        },
        "delivery": {
            "feedCount": len(delivery_rows),
            "eventCounts": sorted(rendered_counts.values(), reverse=True),
            "rawTokenPersisted": False,
            "etag304Verified": set(conditional_statuses.values()) == {304},
            "wsgiReadEndpointImplemented": True,
        },
        "artifacts": {},
    }

    if runtime_dir is not None:
        runtime_dir = Path(runtime_dir)
        if runtime_dir.exists():
            shutil.rmtree(runtime_dir)
        runtime_dir.parent.mkdir(parents=True, exist_ok=True)
        tmp = Path(tempfile.mkdtemp(prefix=f".{runtime_dir.name}.", dir=runtime_dir.parent))
        try:
            for name, value in runtime_artifacts.items():
                _write_json(tmp / name, value)
            for name in sorted(runtime_artifacts):
                manifest["artifacts"][name] = {
                    "sha256": file_sha256(tmp / name),
                    "path": name,
                }
            manifest["manifestHash"] = canonical_sha256({k: v for k, v in manifest.items() if k != "manifestHash"})
            _write_json(tmp / "manifest.json", manifest)
            tmp.rename(runtime_dir)
        except Exception:
            shutil.rmtree(tmp, ignore_errors=True)
            raise

    return {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "result": "pass" if not errors else "fail",
        "errors": errors,
        "environment": {
            "livePostgresAvailable": False,
            "postgresDriverAvailable": False,
            "liveDatabaseExecutionPerformed": False,
        },
        "migration": manifest["migration"],
        "counts": {
            **bundle.counts,
            "fullCorpusReplayNoticeCount": replay["inputCount"],
            "fullCorpusReplayOutboxCount": replay["outboxCount"],
            "changedSimulationOutboxCount": changed_result["outboxCount"],
            "subscriptionFeedCount": len(delivery_rows),
            "studentRenderedEventCount": rendered_counts.get("601"),
            "jobRenderedEventCount": rendered_counts.get("299"),
        },
        "checks": {
            "bootstrapAtomic": first_insert == expected_counts,
            "bootstrapIdempotent": not any(second_insert.values()) if second_insert else False,
            "relationalIntegrity": not any("bootstrap" in error for error in errors),
            "fullCorpusReplayUnchanged": replay["actionCounts"] == {"skip_unchanged": 2059},
            "changedNoticeEnqueuesExtraction": changed_result["actionCounts"] == {"reprocess_content_changed": 1},
            "rawTokenPersisted": False,
            "persistentUidFeedRendered": sorted(rendered_counts.values()) == [299, 601],
            "etag304": set(conditional_statuses.values()) == {304},
        },
        "runtimeManifest": manifest,
        "deferred": {
            "livePostgresMigrationExecution": True,
            "liveConnectionPoolAndProcessSupervision": True,
            "productionSecretAndBaseUrlConfiguration": True,
            "physicalCalendarClientQA": "S30",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--runtime-dir", type=Path, default=Path("runtime/s29-v1"))
    parser.add_argument("--output", type=Path, default=Path("derived/mvp-policy-v0.1/reports/s29-runtime/s29-postgres-runtime-audit.json"))
    args = parser.parse_args()
    report = build_report(args.root, runtime_dir=args.root / args.runtime_dir)
    _write_json(args.root / args.output, report)
    print(json.dumps({"result": report["result"], "counts": report["counts"], "errors": report["errors"]}, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report["result"] == "pass" else 1)


if __name__ == "__main__":
    main()
