#!/usr/bin/env python3
"""S28-4 immutable Subscription Feed Snapshot contract.

A snapshot is a content-addressed, immutable projection of one validated
SubscriptionProfile and one deterministic FeedBuildOutput. Snapshot identity is
not a CalendarEvent UID and is not a subscription delivery token.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any, Mapping, Sequence

from noticepilot_feed_builder import (
    FEED_BUILDER_VERSION,
    FeedBuildOutput,
    FeedBuilderError,
    validate_feed_build_result,
)
from noticepilot_subscription_profile import validate_subscription_profile

SNAPSHOT_SCHEMA_VERSION = "noticepilot.subscriptionFeedSnapshot.v0.1"
SNAPSHOT_MANIFEST_SCHEMA_VERSION = "noticepilot.subscriptionFeedSnapshotManifest.v0.1"
SNAPSHOT_BUILDER_VERSION = "0.1.0"
SNAPSHOT_ID_STRATEGY = "content_addressed_snapshot_hash_v0"
HASH_CONTRACT = "sha256_canonical_json_utf8_sorted_keys_compact_v0"
SNAPSHOT_ID_RE = re.compile(r"^feedsnap_[0-9a-f]{32}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
ISO_DATETIME_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
)


class FeedSnapshotError(ValueError):
    pass


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def canonical_sha256(value: Any) -> str:
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _validate_datetime(value: Any, field: str) -> str:
    if not isinstance(value, str) or not ISO_DATETIME_RE.fullmatch(value):
        raise FeedSnapshotError(f"{field} must be an ISO datetime with timezone")
    return value


def _semantic_snapshot_payload(snapshot: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": snapshot["schemaVersion"],
        "snapshotBuilderVersion": snapshot["snapshotBuilderVersion"],
        "snapshotIdStrategy": snapshot["snapshotIdStrategy"],
        "hashContract": snapshot["hashContract"],
        "profile": snapshot["profile"],
        "builder": snapshot["builder"],
        "sourceContext": snapshot["sourceContext"],
        "feed": snapshot["feed"],
        "integrity": snapshot["integrity"],
    }


def _decision_rows(decisions: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    rows = [json.loads(json.dumps(row, ensure_ascii=False)) for row in decisions]
    rows.sort(key=lambda row: str(row["calendarEventId"]))
    event_ids = [str(row["calendarEventId"]) for row in rows]
    if len(event_ids) != len(set(event_ids)):
        raise FeedSnapshotError("decision ledger contains duplicate CalendarEventId")
    return rows


def materialize_feed_snapshot(
    *,
    profile: Mapping[str, Any],
    build_output: FeedBuildOutput,
    generated_at: str,
    canonical_board_map: Mapping[str, str],
) -> dict[str, Any]:
    """Materialize one immutable, content-addressed feed snapshot.

    `generatedAt` is audit metadata and is deliberately excluded from semantic
    identity. A persistence layer must retain the first materialization time when
    the same snapshot hash is observed again.
    """
    validated_profile = validate_subscription_profile(
        profile, canonical_board_map=canonical_board_map
    )
    _validate_datetime(generated_at, "generatedAt")
    validate_feed_build_result(build_output.result)

    result = build_output.result
    if result["profileId"] != validated_profile["profileId"]:
        raise FeedSnapshotError("FeedBuildResult profileId mismatch")
    if result["profileRevision"] != validated_profile["profileRevision"]:
        raise FeedSnapshotError("FeedBuildResult profileRevision mismatch")
    if result["builderVersion"] != FEED_BUILDER_VERSION:
        raise FeedSnapshotError("FeedBuildResult builderVersion mismatch")

    decisions = _decision_rows(build_output.decisions)
    if len(decisions) != result["inputEventCount"]:
        raise FeedSnapshotError("decision ledger count does not match inputEventCount")
    decision_ids = {row["calendarEventId"] for row in decisions}
    result_ids = set(result["includedEventIds"]) | set(result["excludedEventIds"])
    if decision_ids != result_ids:
        raise FeedSnapshotError("decision ledger does not cover FeedBuildResult partition")

    included_ids = list(result["includedEventIds"])
    profile_ref = {
        "profileId": validated_profile["profileId"],
        "profileRevision": validated_profile["profileRevision"],
        "profileFingerprintSha256": canonical_sha256(validated_profile),
    }
    builder_ref = {
        "feedBuilderVersion": result["builderVersion"],
        "policySchemaVersion": result["policySchemaVersion"],
        "policyVersion": result["policyVersion"],
    }
    feed = {
        "inputEventCount": result["inputEventCount"],
        "eventCount": result["includedEventCount"],
        "excludedEventCount": result["excludedEventCount"],
        "eventIds": included_ids,
        "primaryReasonCounts": dict(result["primaryReasonCounts"]),
        "sortContract": json.loads(json.dumps(result["sortContract"])),
    }
    integrity = {
        "eventMembershipSha256": canonical_sha256(included_ids),
        "feedBuildResultSha256": canonical_sha256(result),
        "decisionLedgerSha256": canonical_sha256(decisions),
    }
    snapshot: dict[str, Any] = {
        "schemaVersion": SNAPSHOT_SCHEMA_VERSION,
        "snapshotBuilderVersion": SNAPSHOT_BUILDER_VERSION,
        "snapshotId": "",
        "snapshotHash": "",
        "snapshotIdStrategy": SNAPSHOT_ID_STRATEGY,
        "hashContract": HASH_CONTRACT,
        "generatedAt": generated_at,
        "profile": profile_ref,
        "builder": builder_ref,
        "sourceContext": dict(result["sourceContext"]),
        "feed": feed,
        "integrity": integrity,
    }
    snapshot_hash = canonical_sha256(_semantic_snapshot_payload(snapshot))
    snapshot["snapshotHash"] = snapshot_hash
    snapshot["snapshotId"] = f"feedsnap_{snapshot_hash[:32]}"
    validate_feed_snapshot(
        snapshot,
        profile=validated_profile,
        build_output=build_output,
        canonical_board_map=canonical_board_map,
    )
    return snapshot


def validate_feed_snapshot(
    snapshot: Mapping[str, Any],
    *,
    profile: Mapping[str, Any] | None = None,
    build_output: FeedBuildOutput | None = None,
    canonical_board_map: Mapping[str, str] | None = None,
) -> None:
    required = {
        "schemaVersion",
        "snapshotBuilderVersion",
        "snapshotId",
        "snapshotHash",
        "snapshotIdStrategy",
        "hashContract",
        "generatedAt",
        "profile",
        "builder",
        "sourceContext",
        "feed",
        "integrity",
    }
    if not isinstance(snapshot, Mapping) or set(snapshot) != required:
        raise FeedSnapshotError("feed snapshot key mismatch")
    if snapshot["schemaVersion"] != SNAPSHOT_SCHEMA_VERSION:
        raise FeedSnapshotError("unsupported snapshot schemaVersion")
    if snapshot["snapshotBuilderVersion"] != SNAPSHOT_BUILDER_VERSION:
        raise FeedSnapshotError("unsupported snapshot builder version")
    if snapshot["snapshotIdStrategy"] != SNAPSHOT_ID_STRATEGY:
        raise FeedSnapshotError("snapshot identity strategy mismatch")
    if snapshot["hashContract"] != HASH_CONTRACT:
        raise FeedSnapshotError("snapshot hash contract mismatch")
    _validate_datetime(snapshot["generatedAt"], "generatedAt")
    if not isinstance(snapshot["snapshotId"], str) or not SNAPSHOT_ID_RE.fullmatch(snapshot["snapshotId"]):
        raise FeedSnapshotError("invalid snapshotId")
    if not isinstance(snapshot["snapshotHash"], str) or not SHA256_RE.fullmatch(snapshot["snapshotHash"]):
        raise FeedSnapshotError("invalid snapshotHash")

    profile_ref = snapshot["profile"]
    if not isinstance(profile_ref, Mapping) or set(profile_ref) != {
        "profileId", "profileRevision", "profileFingerprintSha256"
    }:
        raise FeedSnapshotError("snapshot profile reference key mismatch")
    if not isinstance(profile_ref["profileId"], str) or not profile_ref["profileId"]:
        raise FeedSnapshotError("snapshot profileId must be non-empty")
    if not isinstance(profile_ref["profileRevision"], int) or profile_ref["profileRevision"] < 1:
        raise FeedSnapshotError("snapshot profileRevision must be positive")
    if not SHA256_RE.fullmatch(str(profile_ref["profileFingerprintSha256"])):
        raise FeedSnapshotError("invalid profile fingerprint")

    builder = snapshot["builder"]
    if not isinstance(builder, Mapping) or set(builder) != {
        "feedBuilderVersion", "policySchemaVersion", "policyVersion"
    }:
        raise FeedSnapshotError("snapshot builder reference key mismatch")
    if not all(isinstance(value, str) and value for value in builder.values()):
        raise FeedSnapshotError("snapshot builder references must be non-empty")
    if builder["feedBuilderVersion"] != FEED_BUILDER_VERSION:
        raise FeedSnapshotError("snapshot references unsupported FeedBuilder version")

    source = snapshot["sourceContext"]
    if not isinstance(source, Mapping) or set(source) != {"registryId", "projectionId"}:
        raise FeedSnapshotError("snapshot source context key mismatch")
    if not all(isinstance(value, str) and value for value in source.values()):
        raise FeedSnapshotError("snapshot source context values must be non-empty")

    feed = snapshot["feed"]
    if not isinstance(feed, Mapping) or set(feed) != {
        "inputEventCount", "eventCount", "excludedEventCount", "eventIds",
        "primaryReasonCounts", "sortContract"
    }:
        raise FeedSnapshotError("snapshot feed key mismatch")
    for field in ("inputEventCount", "eventCount", "excludedEventCount"):
        if not isinstance(feed[field], int) or feed[field] < 0:
            raise FeedSnapshotError(f"{field} must be a nonnegative integer")
    event_ids = feed["eventIds"]
    if not isinstance(event_ids, list) or not all(isinstance(value, str) and value for value in event_ids):
        raise FeedSnapshotError("snapshot eventIds must be non-empty strings")
    if len(event_ids) != len(set(event_ids)):
        raise FeedSnapshotError("snapshot eventIds must be unique")
    if feed["eventCount"] != len(event_ids):
        raise FeedSnapshotError("snapshot eventCount mismatch")
    if feed["inputEventCount"] != feed["eventCount"] + feed["excludedEventCount"]:
        raise FeedSnapshotError("snapshot input partition count mismatch")
    reason_counts = feed["primaryReasonCounts"]
    if not isinstance(reason_counts, Mapping) or not reason_counts:
        raise FeedSnapshotError("snapshot primaryReasonCounts must be non-empty")
    if any(not isinstance(value, int) or value < 0 for value in reason_counts.values()):
        raise FeedSnapshotError("snapshot primaryReasonCounts values must be nonnegative")
    if sum(reason_counts.values()) != feed["inputEventCount"]:
        raise FeedSnapshotError("snapshot reason counts do not cover all input events")

    integrity = snapshot["integrity"]
    if not isinstance(integrity, Mapping) or set(integrity) != {
        "eventMembershipSha256", "feedBuildResultSha256", "decisionLedgerSha256"
    }:
        raise FeedSnapshotError("snapshot integrity key mismatch")
    if any(not SHA256_RE.fullmatch(str(value)) for value in integrity.values()):
        raise FeedSnapshotError("snapshot integrity hashes must be lowercase SHA-256")
    if integrity["eventMembershipSha256"] != canonical_sha256(event_ids):
        raise FeedSnapshotError("event membership hash mismatch")

    expected_hash = canonical_sha256(_semantic_snapshot_payload(snapshot))
    if snapshot["snapshotHash"] != expected_hash:
        raise FeedSnapshotError("snapshotHash mismatch")
    if snapshot["snapshotId"] != f"feedsnap_{expected_hash[:32]}":
        raise FeedSnapshotError("snapshotId does not match snapshotHash")

    forbidden = {
        "subscriptionUrl", "publicSlug", "feedToken", "feedTokenHash",
        "feedTokenPrefix", "ics", "icsPath", "icsPayload"
    }
    leaked = sorted(forbidden & set(snapshot))
    if leaked:
        raise FeedSnapshotError(f"S29/delivery field leaked into snapshot: {leaked}")

    if profile is not None:
        if canonical_board_map is None:
            raise FeedSnapshotError("canonical_board_map is required when validating profile")
        validated_profile = validate_subscription_profile(
            profile, canonical_board_map=canonical_board_map
        )
        if profile_ref["profileId"] != validated_profile["profileId"]:
            raise FeedSnapshotError("snapshot profileId differs from profile")
        if profile_ref["profileRevision"] != validated_profile["profileRevision"]:
            raise FeedSnapshotError("snapshot profileRevision differs from profile")
        if profile_ref["profileFingerprintSha256"] != canonical_sha256(validated_profile):
            raise FeedSnapshotError("snapshot profile fingerprint differs from profile")

    if build_output is not None:
        validate_feed_build_result(build_output.result)
        result = build_output.result
        decisions = _decision_rows(build_output.decisions)
        if feed["eventIds"] != result["includedEventIds"]:
            raise FeedSnapshotError("snapshot membership differs from FeedBuildResult")
        if feed["excludedEventCount"] != result["excludedEventCount"]:
            raise FeedSnapshotError("snapshot excludedEventCount differs from FeedBuildResult")
        if feed["primaryReasonCounts"] != result["primaryReasonCounts"]:
            raise FeedSnapshotError("snapshot reason counts differ from FeedBuildResult")
        if integrity["feedBuildResultSha256"] != canonical_sha256(result):
            raise FeedSnapshotError("FeedBuildResult hash mismatch")
        if integrity["decisionLedgerSha256"] != canonical_sha256(decisions):
            raise FeedSnapshotError("decision ledger hash mismatch")



def validate_snapshot_manifest(
    manifest: Mapping[str, Any],
    *,
    base_dir: Path | None = None,
    root: Path | None = None,
) -> None:
    required = {
        "schemaVersion", "snapshotSetId", "snapshotSetHash", "createdAt",
        "snapshotContract", "snapshotCount", "totalEventCount", "artifacts",
        "upstream", "delivery",
    }
    if not isinstance(manifest, Mapping) or set(manifest) != required:
        raise FeedSnapshotError("snapshot manifest key mismatch")
    if manifest["schemaVersion"] != SNAPSHOT_MANIFEST_SCHEMA_VERSION:
        raise FeedSnapshotError("unsupported snapshot manifest schemaVersion")
    if not re.fullmatch(r"snapset_[0-9a-f]{32}", str(manifest["snapshotSetId"])):
        raise FeedSnapshotError("invalid snapshotSetId")
    if not SHA256_RE.fullmatch(str(manifest["snapshotSetHash"])):
        raise FeedSnapshotError("invalid snapshotSetHash")
    _validate_datetime(manifest["createdAt"], "createdAt")
    contract = manifest["snapshotContract"]
    expected_contract = {
        "schemaVersion": SNAPSHOT_SCHEMA_VERSION,
        "builderVersion": SNAPSHOT_BUILDER_VERSION,
        "idStrategy": SNAPSHOT_ID_STRATEGY,
        "hashContract": HASH_CONTRACT,
    }
    if contract != expected_contract:
        raise FeedSnapshotError("snapshot manifest contract mismatch")
    artifacts = manifest["artifacts"]
    upstream = manifest["upstream"]
    if not isinstance(artifacts, Mapping) or not artifacts:
        raise FeedSnapshotError("snapshot manifest artifacts must be non-empty")
    if not isinstance(upstream, Mapping) or not upstream:
        raise FeedSnapshotError("snapshot manifest upstream must be non-empty")
    if manifest["snapshotCount"] != len(artifacts):
        raise FeedSnapshotError("snapshotCount mismatch")
    if manifest["totalEventCount"] != sum(int(v["eventCount"]) for v in artifacts.values()):
        raise FeedSnapshotError("totalEventCount mismatch")
    for key, entry in artifacts.items():
        if set(entry) != {
            "path", "sha256", "snapshotId", "snapshotHash", "profileId",
            "profileRevision", "eventCount",
        }:
            raise FeedSnapshotError(f"artifact entry key mismatch: {key}")
        if not SHA256_RE.fullmatch(str(entry["sha256"])):
            raise FeedSnapshotError(f"invalid artifact file hash: {key}")
        if not SNAPSHOT_ID_RE.fullmatch(str(entry["snapshotId"])):
            raise FeedSnapshotError(f"invalid artifact snapshotId: {key}")
        if not SHA256_RE.fullmatch(str(entry["snapshotHash"])):
            raise FeedSnapshotError(f"invalid artifact snapshotHash: {key}")
        if entry["snapshotId"] != f"feedsnap_{entry['snapshotHash'][:32]}":
            raise FeedSnapshotError(f"artifact identity mismatch: {key}")
        if not isinstance(entry["profileRevision"], int) or entry["profileRevision"] < 1:
            raise FeedSnapshotError(f"invalid artifact profileRevision: {key}")
        if not isinstance(entry["eventCount"], int) or entry["eventCount"] < 0:
            raise FeedSnapshotError(f"invalid artifact eventCount: {key}")
        if base_dir is not None:
            path = base_dir / entry["path"]
            if not path.exists() or file_sha256(path) != entry["sha256"]:
                raise FeedSnapshotError(f"artifact file hash mismatch: {key}")
            snapshot = json.loads(path.read_text(encoding="utf-8"))
            validate_feed_snapshot(snapshot)
            if snapshot["snapshotId"] != entry["snapshotId"] or snapshot["snapshotHash"] != entry["snapshotHash"]:
                raise FeedSnapshotError(f"artifact snapshot metadata mismatch: {key}")
    for key, entry in upstream.items():
        if set(entry) != {"path", "sha256"}:
            raise FeedSnapshotError(f"upstream entry key mismatch: {key}")
        if not SHA256_RE.fullmatch(str(entry["sha256"])):
            raise FeedSnapshotError(f"invalid upstream hash: {key}")
        if root is not None:
            path = root / entry["path"]
            if not path.exists() or file_sha256(path) != entry["sha256"]:
                raise FeedSnapshotError(f"upstream file hash mismatch: {key}")
    delivery = manifest["delivery"]
    if delivery != {
        "subscriptionUrlIssued": False,
        "feedTokenIssued": False,
        "icsSerialized": False,
    }:
        raise FeedSnapshotError("snapshot manifest must not claim delivery work")
    aggregate_preimage = {
        "snapshotSchemaVersion": SNAPSHOT_SCHEMA_VERSION,
        "snapshotBuilderVersion": SNAPSHOT_BUILDER_VERSION,
        "artifacts": {
            key: {
                "snapshotId": value["snapshotId"],
                "snapshotHash": value["snapshotHash"],
                "profileId": value["profileId"],
                "profileRevision": value["profileRevision"],
                "eventCount": value["eventCount"],
            }
            for key, value in artifacts.items()
        },
        "upstream": dict(upstream),
    }
    expected_hash = canonical_sha256(aggregate_preimage)
    if manifest["snapshotSetHash"] != expected_hash:
        raise FeedSnapshotError("snapshotSetHash mismatch")
    if manifest["snapshotSetId"] != f"snapset_{expected_hash[:32]}":
        raise FeedSnapshotError("snapshotSetId mismatch")

def write_snapshot_set(
    *,
    root: Path,
    output_dir: Path,
    snapshots: Mapping[str, Mapping[str, Any]],
    created_at: str,
    upstream_artifacts: Mapping[str, Path],
) -> dict[str, Any]:
    """Atomically write a named snapshot set and a hash manifest."""
    _validate_datetime(created_at, "createdAt")
    if not snapshots:
        raise FeedSnapshotError("snapshot set must not be empty")
    if output_dir.exists():
        raise FeedSnapshotError("snapshot output directory already exists")

    parent = output_dir.parent
    parent.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix=f".{output_dir.name}.", dir=parent))
    try:
        artifact_entries: dict[str, Any] = {}
        for feed_key in sorted(snapshots):
            snapshot = snapshots[feed_key]
            validate_feed_snapshot(snapshot)
            path = temp_dir / f"{feed_key}.snapshot.json"
            path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            artifact_entries[feed_key] = {
                "path": path.name,
                "sha256": file_sha256(path),
                "snapshotId": snapshot["snapshotId"],
                "snapshotHash": snapshot["snapshotHash"],
                "profileId": snapshot["profile"]["profileId"],
                "profileRevision": snapshot["profile"]["profileRevision"],
                "eventCount": snapshot["feed"]["eventCount"],
            }

        upstream: dict[str, Any] = {}
        for key in sorted(upstream_artifacts):
            source_path = upstream_artifacts[key]
            if not source_path.exists():
                raise FeedSnapshotError(f"upstream artifact missing: {source_path}")
            upstream[key] = {
                "path": source_path.resolve().relative_to(root.resolve()).as_posix(),
                "sha256": file_sha256(source_path),
            }

        aggregate_preimage = {
            "snapshotSchemaVersion": SNAPSHOT_SCHEMA_VERSION,
            "snapshotBuilderVersion": SNAPSHOT_BUILDER_VERSION,
            "artifacts": {
                key: {
                    "snapshotId": value["snapshotId"],
                    "snapshotHash": value["snapshotHash"],
                    "profileId": value["profileId"],
                    "profileRevision": value["profileRevision"],
                    "eventCount": value["eventCount"],
                }
                for key, value in artifact_entries.items()
            },
            "upstream": upstream,
        }
        set_hash = canonical_sha256(aggregate_preimage)
        manifest = {
            "schemaVersion": SNAPSHOT_MANIFEST_SCHEMA_VERSION,
            "snapshotSetId": f"snapset_{set_hash[:32]}",
            "snapshotSetHash": set_hash,
            "createdAt": created_at,
            "snapshotContract": {
                "schemaVersion": SNAPSHOT_SCHEMA_VERSION,
                "builderVersion": SNAPSHOT_BUILDER_VERSION,
                "idStrategy": SNAPSHOT_ID_STRATEGY,
                "hashContract": HASH_CONTRACT,
            },
            "snapshotCount": len(artifact_entries),
            "totalEventCount": sum(entry["eventCount"] for entry in artifact_entries.values()),
            "artifacts": artifact_entries,
            "upstream": upstream,
            "delivery": {
                "subscriptionUrlIssued": False,
                "feedTokenIssued": False,
                "icsSerialized": False,
            },
        }
        manifest_path = temp_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        validate_snapshot_manifest(manifest, base_dir=temp_dir, root=root)
        os.replace(temp_dir, output_dir)
        return manifest
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise


__all__ = [
    "HASH_CONTRACT",
    "SNAPSHOT_BUILDER_VERSION",
    "SNAPSHOT_ID_STRATEGY",
    "SNAPSHOT_MANIFEST_SCHEMA_VERSION",
    "SNAPSHOT_SCHEMA_VERSION",
    "FeedSnapshotError",
    "canonical_json_bytes",
    "canonical_sha256",
    "file_sha256",
    "materialize_feed_snapshot",
    "validate_feed_snapshot",
    "validate_snapshot_manifest",
    "write_snapshot_set",
]
