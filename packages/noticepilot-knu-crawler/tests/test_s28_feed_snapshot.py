from __future__ import annotations

import json
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

from noticepilot_feed_builder import DeterministicFeedBuilder, FeedBuildOutput, load_default_profile_collection, load_feed_source_context
from noticepilot_feed_eligibility import build_eligibility_input_views, load_feed_eligibility_policy
from noticepilot_feed_snapshot import (
    FeedSnapshotError,
    materialize_feed_snapshot,
    validate_feed_snapshot,
    validate_snapshot_manifest,
    write_snapshot_set,
)
from noticepilot_subscription_profile import load_canonical_board_map
from tools.audit_s28_feed_snapshot import build_report

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_DIR = ROOT / "snapshots/s28-v1"


class S28FeedSnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.policy = load_feed_eligibility_policy(ROOT / "configs/noticepilot_feed_eligibility_policy.v0.2.json")
        cls.board_map = load_canonical_board_map(ROOT / "configs/knu_board_registry.v0.2.json")
        _, cls.profiles = load_default_profile_collection(
            ROOT / "configs/noticepilot_default_subscription_profiles.v0.1.json",
            canonical_board_map=cls.board_map,
        )
        cls.views = build_eligibility_input_views(ROOT)
        cls.builder = DeterministicFeedBuilder(
            policy=cls.policy,
            canonical_board_map=cls.board_map,
            source_context=load_feed_source_context(ROOT),
        )
        cls.profile_by_key = {}
        cls.output_by_key = {}
        for profile in cls.profiles:
            key = "student_default" if profile["eventSelection"]["includedFeedScopes"] == ["student_default"] else "job_application"
            cls.profile_by_key[key] = profile
            cls.output_by_key[key] = cls.builder.build(profile, cls.views)
        cls.snapshots = {
            key: materialize_feed_snapshot(
                profile=cls.profile_by_key[key], build_output=cls.output_by_key[key],
                generated_at="2026-07-13T17:30:00+09:00", canonical_board_map=cls.board_map,
            )
            for key in cls.profile_by_key
        }

    def test_snapshot_counts_and_identity_format(self) -> None:
        self.assertEqual(self.snapshots["student_default"]["feed"]["eventCount"], 601)
        self.assertEqual(self.snapshots["job_application"]["feed"]["eventCount"], 299)
        for snapshot in self.snapshots.values():
            self.assertRegex(snapshot["snapshotId"], r"^feedsnap_[0-9a-f]{32}$")
            self.assertRegex(snapshot["snapshotHash"], r"^[0-9a-f]{64}$")
            self.assertEqual(snapshot["snapshotId"][9:], snapshot["snapshotHash"][:32])

    def test_reverse_input_produces_identical_snapshot(self) -> None:
        for key, profile in self.profile_by_key.items():
            reverse_output = self.builder.build(profile, reversed(self.views))
            reverse_snapshot = materialize_feed_snapshot(
                profile=profile, build_output=reverse_output,
                generated_at="2026-07-13T17:30:00+09:00", canonical_board_map=self.board_map,
            )
            self.assertEqual(reverse_snapshot, self.snapshots[key])

    def test_generated_at_is_excluded_from_semantic_identity(self) -> None:
        other = materialize_feed_snapshot(
            profile=self.profile_by_key["student_default"],
            build_output=self.output_by_key["student_default"],
            generated_at="2026-07-14T09:00:00+09:00",
            canonical_board_map=self.board_map,
        )
        self.assertNotEqual(other["generatedAt"], self.snapshots["student_default"]["generatedAt"])
        self.assertEqual(other["snapshotId"], self.snapshots["student_default"]["snapshotId"])
        self.assertEqual(other["snapshotHash"], self.snapshots["student_default"]["snapshotHash"])

    def test_membership_change_changes_snapshot_identity(self) -> None:
        original = self.output_by_key["student_default"]
        result = deepcopy(original.result)
        moved = result["includedEventIds"].pop()
        result["excludedEventIds"].append(moved)
        result["includedEventCount"] -= 1
        result["excludedEventCount"] += 1
        # Keep counts and ledger consistent enough to reach semantic materialization by changing the decision.
        decisions = [deepcopy(row) for row in original.decisions]
        row = next(item for item in decisions if item["calendarEventId"] == moved)
        row["eligible"] = False
        row["primaryReasonCode"] = "source_board_or_notice_type_mismatch"
        row["reasonCodes"] = ["source_board_or_notice_type_mismatch"]
        result["primaryReasonCounts"]["eligible_all_dimensions_matched"] -= 1
        result["primaryReasonCounts"]["source_board_or_notice_type_mismatch"] += 1
        changed = materialize_feed_snapshot(
            profile=self.profile_by_key["student_default"],
            build_output=FeedBuildOutput(result=result, decisions=tuple(decisions)),
            generated_at="2026-07-13T17:30:00+09:00",
            canonical_board_map=self.board_map,
        )
        self.assertNotEqual(changed["snapshotId"], self.snapshots["student_default"]["snapshotId"])

    def test_tampered_membership_hash_is_rejected(self) -> None:
        snapshot = deepcopy(self.snapshots["student_default"])
        snapshot["integrity"]["eventMembershipSha256"] = "0" * 64
        with self.assertRaises(FeedSnapshotError):
            validate_feed_snapshot(snapshot)

    def test_tampered_snapshot_hash_is_rejected(self) -> None:
        snapshot = deepcopy(self.snapshots["student_default"])
        snapshot["snapshotHash"] = "0" * 64
        with self.assertRaises(FeedSnapshotError):
            validate_feed_snapshot(snapshot)

    def test_unknown_top_level_key_is_rejected(self) -> None:
        snapshot = deepcopy(self.snapshots["student_default"])
        snapshot["unexpected"] = True
        with self.assertRaises(FeedSnapshotError):
            validate_feed_snapshot(snapshot)

    def test_snapshot_contains_no_delivery_fields(self) -> None:
        forbidden = {"subscriptionUrl", "feedToken", "feedTokenHash", "ics", "icsPath", "icsPayload"}
        for snapshot in self.snapshots.values():
            self.assertFalse(forbidden & set(snapshot))

    def test_stored_snapshot_set_validates(self) -> None:
        manifest = json.loads((SNAPSHOT_DIR / "manifest.json").read_text(encoding="utf-8"))
        validate_snapshot_manifest(manifest, base_dir=SNAPSHOT_DIR, root=ROOT)
        self.assertEqual(manifest["snapshotCount"], 2)
        self.assertEqual(manifest["totalEventCount"], 900)

    def test_snapshot_manifest_refuses_delivery_claims(self) -> None:
        manifest = json.loads((SNAPSHOT_DIR / "manifest.json").read_text(encoding="utf-8"))
        manifest["delivery"]["icsSerialized"] = True
        with self.assertRaises(FeedSnapshotError):
            validate_snapshot_manifest(manifest)

    def test_atomic_writer_refuses_overwrite(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "snapshots"
            output.mkdir()
            with self.assertRaises(FeedSnapshotError):
                write_snapshot_set(
                    root=ROOT, output_dir=output, snapshots=self.snapshots,
                    created_at="2026-07-13T17:30:00+09:00",
                    upstream_artifacts={"policy": ROOT / "configs/noticepilot_feed_eligibility_policy.v0.2.json"},
                )

    def test_atomic_writer_rolls_back_on_missing_upstream(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "snapshots"
            with self.assertRaises(FeedSnapshotError):
                write_snapshot_set(
                    root=ROOT, output_dir=output, snapshots=self.snapshots,
                    created_at="2026-07-13T17:30:00+09:00",
                    upstream_artifacts={"missing": ROOT / "does-not-exist"},
                )
            self.assertFalse(output.exists())

    def test_full_audit_passes(self) -> None:
        report = build_report(ROOT)
        self.assertEqual(report["result"], "pass", report["errors"])
        self.assertEqual(report["counts"]["studentJobUnionCount"], 900)

    def test_roadmap_marks_s28_4_completed_and_s28_5_ready(self) -> None:
        roadmap = json.loads((ROOT / "ROADMAP_STATUS.json").read_text(encoding="utf-8"))
        s28 = next(item for item in roadmap["steps"] if item["id"] == "S28")
        status = {item["id"]: item["status"] for item in s28["substeps"]}
        self.assertEqual(status["S28-4"], "completed")
        self.assertIn(status["S28-5"], {"ready", "completed"})


if __name__ == "__main__":
    unittest.main()
