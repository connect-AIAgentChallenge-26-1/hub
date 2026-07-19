from __future__ import annotations

import json
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

from noticepilot_feed_builder import (
    FEED_BUILD_RESULT_SCHEMA_VERSION,
    DeterministicFeedBuilder,
    FeedBuilderError,
    create_default_subscription_profile,
    load_default_profile_collection,
    load_feed_source_context,
    validate_feed_build_result,
)
from noticepilot_feed_eligibility import build_eligibility_input_views, load_feed_eligibility_policy
from noticepilot_subscription_profile import load_canonical_board_map
from tools.audit_s28_feed_builder import build_report, parse_ics_event_ids

ROOT = Path(__file__).resolve().parents[1]


class S28DeterministicFeedBuilderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.policy = load_feed_eligibility_policy(
            ROOT / "configs/noticepilot_feed_eligibility_policy.v0.2.json"
        )
        cls.board_map = load_canonical_board_map(
            ROOT / "configs/knu_board_registry.v0.2.json"
        )
        cls.collection, cls.profiles = load_default_profile_collection(
            ROOT / "configs/noticepilot_default_subscription_profiles.v0.1.json",
            canonical_board_map=cls.board_map,
        )
        cls.student = next(
            profile for profile in cls.profiles
            if profile["eventSelection"]["includedFeedScopes"] == ["student_default"]
        )
        cls.job = next(
            profile for profile in cls.profiles
            if profile["eventSelection"]["includedFeedScopes"] == ["job_application"]
        )
        cls.views = build_eligibility_input_views(ROOT)
        cls.views_by_id = {view["calendarEventId"]: view for view in cls.views}
        cls.builder = DeterministicFeedBuilder(
            policy=cls.policy,
            canonical_board_map=cls.board_map,
            source_context=load_feed_source_context(ROOT),
        )
        cls.student_output = cls.builder.build(cls.student, cls.views)
        cls.job_output = cls.builder.build(cls.job, cls.views)

    def test_reference_profile_collection_materializes_approved_defaults(self) -> None:
        self.assertTrue(self.collection["authoritativePolicyDefaults"])
        self.assertFalse(self.collection["userCampusDefaultEstablished"])
        self.assertEqual(len(self.profiles), 2)
        for profile in self.profiles:
            self.assertEqual(
                profile["campusSelection"]["selectedCampuses"],
                ["chuncheon", "samcheok", "dogye", "gangneung_wonju"],
            )
            self.assertTrue(profile["campusSelection"]["includeUnknownCampusEvents"])
            self.assertTrue(profile["eventSelection"]["includeReviewRequiredEvents"])
            self.assertEqual(profile["audienceFilter"]["unscopedEventPolicy"], "include")

    def test_profile_factory_requires_explicit_campus_selection(self) -> None:
        with self.assertRaises(FeedBuilderError):
            create_default_subscription_profile(
                "student",
                profile_id="subprof_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                selected_campuses=[],
                created_at="2026-07-13T16:30:00+09:00",
                canonical_board_map=self.board_map,
                policy=self.policy,
            )

    def test_feed_builder_partitions_every_active_event(self) -> None:
        for output in (self.student_output, self.job_output):
            result = output.result
            self.assertEqual(result["schemaVersion"], FEED_BUILD_RESULT_SCHEMA_VERSION)
            self.assertEqual(result["inputEventCount"], 900)
            self.assertEqual(
                result["includedEventCount"] + result["excludedEventCount"], 900
            )
            self.assertEqual(
                set(result["includedEventIds"]) | set(result["excludedEventIds"]),
                set(self.views_by_id),
            )
            self.assertFalse(
                set(result["includedEventIds"]) & set(result["excludedEventIds"])
            )

    def test_reference_build_counts_match_persistent_feed_counts(self) -> None:
        self.assertEqual(self.student_output.result["includedEventCount"], 601)
        self.assertEqual(self.job_output.result["includedEventCount"], 299)
        self.assertEqual(self.student_output.result["excludedEventCount"], 299)
        self.assertEqual(self.job_output.result["excludedEventCount"], 601)

    def test_student_and_job_reference_feeds_partition_all_active_events(self) -> None:
        student_ids = set(self.student_output.result["includedEventIds"])
        job_ids = set(self.job_output.result["includedEventIds"])
        self.assertFalse(student_ids & job_ids)
        self.assertEqual(student_ids | job_ids, set(self.views_by_id))

    def test_build_is_stable_under_reversed_input_order(self) -> None:
        student_reverse = self.builder.build(self.student, reversed(self.views))
        job_reverse = self.builder.build(self.job, reversed(self.views))
        self.assertEqual(self.student_output.result, student_reverse.result)
        self.assertEqual(self.student_output.decisions, student_reverse.decisions)
        self.assertEqual(self.job_output.result, job_reverse.result)
        self.assertEqual(self.job_output.decisions, job_reverse.decisions)

    def test_included_events_follow_chronological_then_event_id_order(self) -> None:
        for output in (self.student_output, self.job_output):
            expected = sorted(
                output.result["includedEventIds"],
                key=lambda event_id: (
                    self.views_by_id[event_id]["temporalState"]["normalizedStart"],
                    event_id,
                ),
            )
            self.assertEqual(output.result["includedEventIds"], expected)

    def test_decision_ledger_is_event_id_sorted_and_complete(self) -> None:
        for output in (self.student_output, self.job_output):
            ids = [decision["calendarEventId"] for decision in output.decisions]
            self.assertEqual(len(ids), 900)
            self.assertEqual(ids, sorted(ids))
            self.assertEqual(set(ids), set(self.views_by_id))

    def test_primary_reason_counts_cover_all_inputs(self) -> None:
        self.assertEqual(
            self.student_output.result["primaryReasonCounts"],
            {
                "source_board_or_notice_type_mismatch": 299,
                "eligible_all_dimensions_matched": 601,
            },
        )
        self.assertEqual(
            self.job_output.result["primaryReasonCounts"],
            {
                "source_board_or_notice_type_mismatch": 601,
                "eligible_all_dimensions_matched": 299,
            },
        )

    def test_duplicate_input_event_is_rejected(self) -> None:
        with self.assertRaises(FeedBuilderError):
            self.builder.build(self.student, [self.views[0], self.views[0]])

    def test_paused_profile_deterministically_excludes_all_events(self) -> None:
        profile = deepcopy(self.student)
        profile["status"] = "paused"
        output = self.builder.build(profile, self.views)
        self.assertEqual(output.result["includedEventCount"], 0)
        self.assertEqual(output.result["excludedEventCount"], 900)
        self.assertEqual(output.result["primaryReasonCounts"]["profile_not_active"], 900)

    def test_result_does_not_claim_snapshot_or_delivery_fields(self) -> None:
        forbidden = {
            "snapshotId", "snapshotHash", "contentDigest", "subscriptionUrl",
            "feedToken", "feedTokenHash", "ics", "icsPath",
        }
        for output in (self.student_output, self.job_output):
            self.assertFalse(forbidden & set(output.result))
            validate_feed_build_result(
                output.result,
                input_event_ids=set(self.views_by_id),
                views=self.views_by_id,
            )

    def test_reference_membership_matches_s27d_persistent_ics(self) -> None:
        student_ics_ids = set(parse_ics_event_ids(
            ROOT / "projection/s27d-v1/feeds/student_default/noticepilot-student-default.ics"
        ))
        job_ics_ids = set(parse_ics_event_ids(
            ROOT / "projection/s27d-v1/feeds/job_application/noticepilot-job-applications.ics"
        ))
        self.assertEqual(
            set(self.student_output.result["includedEventIds"]), student_ics_ids
        )
        self.assertEqual(set(self.job_output.result["includedEventIds"]), job_ics_ids)

    def test_audit_passes_and_writes_deterministic_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp)
            report = build_report(ROOT, output_dir)
            student_result = json.loads(
                (output_dir / "student_default-feed-build-result.json").read_text(encoding="utf-8")
            )
            student_decisions = (
                output_dir / "student_default-feed-build-decisions.jsonl"
            ).read_text(encoding="utf-8").splitlines()
        self.assertEqual(report["result"], "pass")
        self.assertEqual(report["counts"]["inputEventCount"], 900)
        self.assertEqual(report["counts"]["studentIncludedEventCount"], 601)
        self.assertEqual(report["counts"]["jobIncludedEventCount"], 299)
        self.assertEqual(student_result, self.student_output.result)
        self.assertEqual(len(student_decisions), 900)
        self.assertFalse(report["scope"]["feedSnapshotImplemented"])
        self.assertFalse(report["scope"]["icsSerializationPerformed"])

    def test_s27_manifests_remain_unchanged(self) -> None:
        from tools.audit_s28_feed_builder import (
            EXPECTED_S27C_MANIFEST_SHA256,
            EXPECTED_S27D_MANIFEST_SHA256,
            file_sha256,
        )
        self.assertEqual(
            file_sha256(ROOT / "registry/s27c-v1/manifest.json"),
            EXPECTED_S27C_MANIFEST_SHA256,
        )
        self.assertEqual(
            file_sha256(ROOT / "projection/s27d-v1/manifest.json"),
            EXPECTED_S27D_MANIFEST_SHA256,
        )

    def test_roadmap_marks_s28_3_completed_and_s28_4_ready(self) -> None:
        roadmap = json.loads((ROOT / "ROADMAP_STATUS.json").read_text(encoding="utf-8"))
        s28 = next(row for row in roadmap["steps"] if row["id"] == "S28")
        substeps = {row["id"]: row for row in s28["substeps"]}
        self.assertEqual(substeps["S28-1"]["status"], "completed")
        self.assertEqual(substeps["S28-2"]["status"], "completed")
        self.assertEqual(substeps["S28-3"]["status"], "completed")
        self.assertIn(substeps["S28-4"]["status"], {"ready", "completed"})
        self.assertIn(substeps["S28-5"]["status"], {"planned", "ready", "completed"})


if __name__ == "__main__":
    unittest.main()
