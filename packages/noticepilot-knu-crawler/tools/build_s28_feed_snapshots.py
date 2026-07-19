#!/usr/bin/env python3
"""Build the immutable S28-4 reference feed snapshot set."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from noticepilot_feed_builder import (
    DeterministicFeedBuilder,
    load_default_profile_collection,
    load_feed_source_context,
)
from noticepilot_feed_eligibility import build_eligibility_input_views, load_feed_eligibility_policy
from noticepilot_feed_snapshot import materialize_feed_snapshot, write_snapshot_set
from noticepilot_subscription_profile import load_canonical_board_map

DEFAULT_CREATED_AT = "2026-07-13T17:30:00+09:00"


def profile_key(profile: dict) -> str:
    scopes = profile["eventSelection"]["includedFeedScopes"]
    if scopes == ["student_default"]:
        return "student_default"
    if scopes == ["job_application"]:
        return "job_application"
    raise ValueError(f"unsupported reference profile scope: {scopes}")


def build(root: Path, output_dir: Path, created_at: str) -> dict:
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
    snapshots = {}
    for profile in profiles:
        output = builder.build(profile, views)
        snapshots[profile_key(profile)] = materialize_feed_snapshot(
            profile=profile,
            build_output=output,
            generated_at=created_at,
            canonical_board_map=board_map,
        )
    report_dir = root / "derived/mvp-policy-v0.1/reports/s28-feed-builder"
    upstream = {
        "s27cRegistryManifest": root / "registry/s27c-v1/manifest.json",
        "s27dProjectionManifest": root / "projection/s27d-v1/manifest.json",
        "feedEligibilityPolicy": root / "configs/noticepilot_feed_eligibility_policy.v0.2.json",
        "defaultSubscriptionProfiles": root / "configs/noticepilot_default_subscription_profiles.v0.1.json",
        "studentFeedBuildResult": report_dir / "student_default-feed-build-result.json",
        "studentDecisionLedger": report_dir / "student_default-feed-build-decisions.jsonl",
        "jobFeedBuildResult": report_dir / "job_application-feed-build-result.json",
        "jobDecisionLedger": report_dir / "job_application-feed-build-decisions.jsonl",
    }
    return write_snapshot_set(
        root=root,
        output_dir=output_dir,
        snapshots=snapshots,
        created_at=created_at,
        upstream_artifacts=upstream,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--created-at", default=DEFAULT_CREATED_AT)
    args = parser.parse_args()
    root = args.root.resolve()
    output = args.output_dir or (root / "snapshots/s28-v1")
    manifest = build(root, output, args.created_at)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
