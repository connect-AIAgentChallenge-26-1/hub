#!/usr/bin/env python3
"""Audit S28-4 immutable Subscription Feed Snapshots."""
from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from noticepilot_feed_builder import DeterministicFeedBuilder, load_default_profile_collection, load_feed_source_context
from noticepilot_feed_eligibility import build_eligibility_input_views, load_feed_eligibility_policy
from noticepilot_feed_snapshot import (
    HASH_CONTRACT,
    SNAPSHOT_BUILDER_VERSION,
    SNAPSHOT_ID_STRATEGY,
    SNAPSHOT_SCHEMA_VERSION,
    file_sha256,
    materialize_feed_snapshot,
    validate_feed_snapshot,
    validate_snapshot_manifest,
)
from noticepilot_subscription_profile import load_canonical_board_map

AUDIT_SCHEMA_VERSION = "noticepilot.s28FeedSnapshotAudit.v0.1"
AUDITOR_VERSION = "0.1.0"
EXPECTED_S27C_MANIFEST_SHA256 = "47fa8e232254df978575f31e06d555c20cf5f50e99862dc8ae0e772a7e4a03dc"
EXPECTED_S27D_MANIFEST_SHA256 = "922eacc5a270f5119d0e86892d961ed742486b35b6a65d7a0d1642119820481f"


def profile_key(profile: dict[str, Any]) -> str:
    scopes = profile["eventSelection"]["includedFeedScopes"]
    return "student_default" if scopes == ["student_default"] else "job_application"


def build_report(root: Path, snapshot_dir: Path | None = None, output_dir: Path | None = None) -> dict[str, Any]:
    root = root.resolve()
    snapshot_dir = (snapshot_dir or (root / "snapshots/s28-v1")).resolve()
    errors: list[str] = []
    try:
        policy = load_feed_eligibility_policy(root / "configs/noticepilot_feed_eligibility_policy.v0.2.json")
        board_map = load_canonical_board_map(root / "configs/knu_board_registry.v0.2.json")
        _, profiles = load_default_profile_collection(
            root / "configs/noticepilot_default_subscription_profiles.v0.1.json",
            canonical_board_map=board_map,
        )
        views = build_eligibility_input_views(root)
        builder = DeterministicFeedBuilder(
            policy=policy,
            canonical_board_map=board_map,
            source_context=load_feed_source_context(root),
        )
        outputs = {profile_key(profile): builder.build(profile, views) for profile in profiles}
        reverse_outputs = {profile_key(profile): builder.build(profile, reversed(views)) for profile in profiles}
        profile_by_key = {profile_key(profile): profile for profile in profiles}
        manifest = json.loads((snapshot_dir / "manifest.json").read_text(encoding="utf-8"))
        validate_snapshot_manifest(manifest, base_dir=snapshot_dir, root=root)
        snapshots = {
            key: json.loads((snapshot_dir / entry["path"]).read_text(encoding="utf-8"))
            for key, entry in manifest["artifacts"].items()
        }
        for key, snapshot in snapshots.items():
            validate_feed_snapshot(
                snapshot,
                profile=profile_by_key[key],
                build_output=outputs[key],
                canonical_board_map=board_map,
            )
    except Exception as exc:
        policy = {}; profiles = []; views = []; outputs = {}; reverse_outputs = {}; profile_by_key = {}; manifest = {}; snapshots = {}
        errors.append(f"snapshot construction or validation failed: {exc}")

    deterministic: dict[str, Any] = {}
    if snapshots:
        for key in sorted(snapshots):
            stored = snapshots[key]
            same_time = materialize_feed_snapshot(
                profile=profile_by_key[key], build_output=reverse_outputs[key],
                generated_at=stored["generatedAt"], canonical_board_map=board_map,
            )
            other_time = materialize_feed_snapshot(
                profile=profile_by_key[key], build_output=outputs[key],
                generated_at="2026-07-14T09:00:00+09:00", canonical_board_map=board_map,
            )
            deterministic[key] = {
                "reverseInputSnapshotExactMatch": same_time == stored,
                "generatedAtExcludedFromIdentity": (
                    other_time["snapshotId"] == stored["snapshotId"]
                    and other_time["snapshotHash"] == stored["snapshotHash"]
                ),
                "eventCount": stored["feed"]["eventCount"],
            }
            if not deterministic[key]["reverseInputSnapshotExactMatch"]:
                errors.append(f"{key} snapshot differs under reversed input")
            if not deterministic[key]["generatedAtExcludedFromIdentity"]:
                errors.append(f"{key} snapshot identity depends on generatedAt")

        student_ids = set(snapshots["student_default"]["feed"]["eventIds"])
        job_ids = set(snapshots["job_application"]["feed"]["eventIds"])
        all_ids = {view["calendarEventId"] for view in views}
        if len(student_ids) != 601: errors.append("student snapshot event count must be 601")
        if len(job_ids) != 299: errors.append("job snapshot event count must be 299")
        if student_ids & job_ids: errors.append("student/job snapshots overlap")
        if student_ids | job_ids != all_ids: errors.append("student/job snapshots do not cover 900 active events")
    else:
        student_ids = job_ids = all_ids = set()

    s27c_hash = file_sha256(root / "registry/s27c-v1/manifest.json")
    s27d_hash = file_sha256(root / "projection/s27d-v1/manifest.json")
    if s27c_hash != EXPECTED_S27C_MANIFEST_SHA256: errors.append("S27-C manifest hash changed")
    if s27d_hash != EXPECTED_S27D_MANIFEST_SHA256: errors.append("S27-D manifest hash changed")

    forbidden = {"subscriptionUrl", "feedToken", "feedTokenHash", "ics", "icsPath", "icsPayload"}
    leaked = []
    for key, snapshot in snapshots.items():
        leaked.extend(f"{key}.{field}" for field in sorted(forbidden & set(snapshot)))
    errors.extend(f"delivery field leaked into snapshot: {item}" for item in leaked)

    report = {
        "schemaVersion": AUDIT_SCHEMA_VERSION,
        "auditorVersion": AUDITOR_VERSION,
        "result": "pass" if not errors else "fail",
        "status": "completed" if not errors else "failed",
        "scope": {
            "snapshotContractImplemented": True,
            "contentAddressedIdentityImplemented": True,
            "snapshotManifestImplemented": True,
            "atomicSnapshotSetWritten": True,
            "profileMatrixAuditPerformed": False,
            "subscriptionUrlOrTokenIssued": False,
            "icsSerializationPerformed": False,
            "s27RegistryMutationPerformed": False,
            "s27ProjectionMutationPerformed": False,
        },
        "contract": {
            "snapshotSchemaVersion": SNAPSHOT_SCHEMA_VERSION,
            "snapshotBuilderVersion": SNAPSHOT_BUILDER_VERSION,
            "snapshotIdStrategy": SNAPSHOT_ID_STRATEGY,
            "hashContract": HASH_CONTRACT,
            "generatedAtIncludedInIdentity": False,
        },
        "manifest": {
            "path": "snapshots/s28-v1/manifest.json",
            "snapshotSetId": manifest.get("snapshotSetId"),
            "snapshotSetHash": manifest.get("snapshotSetHash"),
            "snapshotCount": manifest.get("snapshotCount", 0),
            "totalEventCount": manifest.get("totalEventCount", 0),
        },
        "counts": {
            "inputEventCount": len(views),
            "studentSnapshotEventCount": len(student_ids),
            "jobSnapshotEventCount": len(job_ids),
            "studentJobOverlapCount": len(student_ids & job_ids),
            "studentJobUnionCount": len(student_ids | job_ids),
        },
        "snapshots": {
            key: {
                "snapshotId": snapshot["snapshotId"],
                "snapshotHash": snapshot["snapshotHash"],
                "profileId": snapshot["profile"]["profileId"],
                "profileRevision": snapshot["profile"]["profileRevision"],
                "eventCount": snapshot["feed"]["eventCount"],
                "excludedEventCount": snapshot["feed"]["excludedEventCount"],
                "eventMembershipSha256": snapshot["integrity"]["eventMembershipSha256"],
                "feedBuildResultSha256": snapshot["integrity"]["feedBuildResultSha256"],
                "decisionLedgerSha256": snapshot["integrity"]["decisionLedgerSha256"],
            }
            for key, snapshot in sorted(snapshots.items())
        },
        "determinism": deterministic,
        "immutability": {
            "s27cManifestSha256": s27c_hash,
            "s27cManifestExpectedSha256": EXPECTED_S27C_MANIFEST_SHA256,
            "s27dManifestSha256": s27d_hash,
            "s27dManifestExpectedSha256": EXPECTED_S27D_MANIFEST_SHA256,
        },
        "deferred": {
            "profileMatrixAndFullCorpusFeedAudit": "S28-5",
            "snapshotPersistenceAndDelivery": "S29",
            "subscriptionUrlAndToken": "S29",
            "calendarClientPhysicalQa": "S30",
        },
        "errors": errors,
    }
    if output_dir is not None:
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "s28-feed-snapshot-audit.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--snapshot-dir", type=Path)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    report = build_report(args.root, args.snapshot_dir, args.output_dir)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["result"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
