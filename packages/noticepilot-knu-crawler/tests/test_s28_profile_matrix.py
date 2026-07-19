from __future__ import annotations

import json
import unittest
from copy import deepcopy
from pathlib import Path

from noticepilot_feed_builder import DeterministicFeedBuilder, load_default_profile_collection, load_feed_source_context
from noticepilot_feed_eligibility import build_eligibility_input_views, load_feed_eligibility_policy
from noticepilot_profile_matrix import (
    ProfileMatrixError,
    build_profile_matrix,
    load_profile_matrix,
    run_profile_matrix,
    validate_profile_matrix,
    validate_profile_matrix_result,
)
from noticepilot_subscription_profile import load_canonical_board_map
from tools.audit_s28_profile_matrix import build_report

ROOT = Path(__file__).resolve().parents[1]
MATRIX_PATH = ROOT / "configs/noticepilot_profile_matrix.v0.1.json"


class S28ProfileMatrixTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.board_map = load_canonical_board_map(ROOT / "configs/knu_board_registry.v0.2.json")
        cls.policy = load_feed_eligibility_policy(ROOT / "configs/noticepilot_feed_eligibility_policy.v0.2.json")
        _, profiles = load_default_profile_collection(
            ROOT / "configs/noticepilot_default_subscription_profiles.v0.1.json",
            canonical_board_map=cls.board_map,
        )
        cls.student = next(row for row in profiles if row["eventSelection"]["includedFeedScopes"] == ["student_default"])
        cls.job = next(row for row in profiles if row["eventSelection"]["includedFeedScopes"] == ["job_application"])
        cls.matrix, cls.cases = load_profile_matrix(MATRIX_PATH, canonical_board_map=cls.board_map)
        cls.views = build_eligibility_input_views(ROOT)
        cls.builder = DeterministicFeedBuilder(
            policy=cls.policy,
            canonical_board_map=cls.board_map,
            source_context=load_feed_source_context(ROOT),
        )
        cls.matrix_run = run_profile_matrix(
            matrix=cls.matrix,
            builder=cls.builder,
            views=cls.views,
            canonical_board_map=cls.board_map,
        )
        cls.results = {row["caseId"]: row for row in cls.matrix_run.result["caseResults"]}

    def test_matrix_has_44_unique_audit_only_profiles(self) -> None:
        self.assertEqual(self.matrix["caseCount"], 44)
        self.assertTrue(self.matrix["auditOnly"])
        self.assertFalse(self.matrix["authoritativeProductDefaults"])
        self.assertFalse(self.matrix["userCampusDefaultEstablished"])
        self.assertEqual(len({row["profile"]["profileId"] for row in self.cases}), 44)

    def test_generated_matrix_matches_stored_matrix(self) -> None:
        generated = build_profile_matrix(
            student_profile=self.student,
            job_profile=self.job,
            canonical_board_map=self.board_map,
        )
        self.assertEqual(generated, self.matrix)

    def test_every_case_partitions_all_900_events(self) -> None:
        self.assertEqual(self.matrix_run.result["decisionCount"], 39600)
        for row in self.matrix_run.result["caseResults"]:
            self.assertEqual(row["includedEventCount"] + row["excludedEventCount"], 900)

    def test_reference_profiles_partition_the_active_corpus(self) -> None:
        student = set(self.matrix_run.outputs["reference.student_all"].result["includedEventIds"])
        job = set(self.matrix_run.outputs["reference.job_all"].result["includedEventIds"])
        self.assertEqual(len(student), 601)
        self.assertEqual(len(job), 299)
        self.assertFalse(student & job)
        self.assertEqual(len(student | job), 900)

    def test_campus_profile_counts_are_stable(self) -> None:
        expected = {
            "campus.student.chuncheon": 334,
            "campus.student.samcheok": 299,
            "campus.student.dogye": 120,
            "campus.student.gangneung_wonju": 270,
            "campus.job.chuncheon": 219,
            "campus.job.samcheok": 67,
            "campus.job.dogye": 18,
            "campus.job.gangneung_wonju": 44,
        }
        self.assertEqual({key: self.results[key]["includedEventCount"] for key in expected}, expected)

    def test_common_unknown_and_review_toggles_are_stable(self) -> None:
        expected = {
            "policy.student.exclude_common": 487,
            "policy.student.exclude_unknown": 601,
            "policy.student.exclude_review": 601,
            "policy.job.exclude_common": 296,
            "policy.job.exclude_unknown": 298,
            "policy.job.exclude_review": 299,
        }
        self.assertEqual({key: self.results[key]["includedEventCount"] for key in expected}, expected)

    def test_audience_profiles_cover_scoped_and_unscoped_paths(self) -> None:
        expected = {
            "audience.student.graduate.include_unscoped": 597,
            "audience.student.graduate.exclude_unscoped": 8,
            "audience.student.year3.include_unscoped": 600,
            "audience.student.year3.exclude_unscoped": 11,
            "audience.student.enrolled.include_unscoped": 599,
            "audience.student.enrolled.exclude_unscoped": 10,
            "audience.student.new_student.include_unscoped": 601,
            "audience.student.new_student.exclude_unscoped": 12,
        }
        self.assertEqual({key: self.results[key]["includedEventCount"] for key in expected}, expected)

    def test_inactive_profiles_exclude_every_event(self) -> None:
        self.assertEqual(self.results["status.student.paused"]["includedEventCount"], 0)
        self.assertEqual(self.results["status.job.revoked"]["includedEventCount"], 0)
        self.assertEqual(self.results["status.student.paused"]["primaryReasonCounts"], {"profile_not_active": 900})

    def test_canonical_board_cases_form_an_exact_partition(self) -> None:
        board_ids = ["504", "715", "716", "717", "719", "720", "721", "722", "723"]
        sets = [set(self.matrix_run.outputs[f"source.board.{board}"].result["includedEventIds"]) for board in board_ids]
        self.assertEqual(len(set().union(*sets)), 900)
        self.assertEqual(sum(len(sets[i] & sets[j]) for i in range(len(sets)) for j in range(i + 1, len(sets))), 0)

    def test_event_type_cases_form_an_exact_partition(self) -> None:
        case_ids = [key for key in self.matrix_run.outputs if key.startswith("event_type.")]
        sets = [set(self.matrix_run.outputs[key].result["includedEventIds"]) for key in case_ids]
        self.assertEqual(len(set().union(*sets)), 900)
        self.assertEqual(sum(len(sets[i] & sets[j]) for i in range(len(sets)) for j in range(i + 1, len(sets))), 0)

    def test_matrix_is_stable_under_reversed_input(self) -> None:
        invariant = next(row for row in self.matrix_run.result["invariants"] if row["invariantId"] == "reverse_input_determinism")
        self.assertTrue(invariant["passed"])
        self.assertEqual(invariant["details"]["decisionCount"], 39600)

    def test_result_rejects_tampered_case_count(self) -> None:
        value = deepcopy(self.matrix_run.result)
        value["profileCaseCount"] = 43
        with self.assertRaises(ProfileMatrixError):
            validate_profile_matrix_result(value)

    def test_matrix_rejects_delivery_fields_in_profile(self) -> None:
        value = deepcopy(self.matrix)
        value["cases"][0]["profile"]["subscriptionUrl"] = "https://example.com/feed"
        with self.assertRaises(Exception):
            validate_profile_matrix(value, canonical_board_map=self.board_map)

    def test_full_corpus_audit_passes(self) -> None:
        report = build_report(ROOT)
        self.assertEqual(report["result"], "pass", report["errors"])
        self.assertEqual(report["counts"]["profileCaseCount"], 44)
        self.assertEqual(report["counts"]["decisionCount"], 39600)
        self.assertTrue(report["referenceParity"]["studentSnapshotMembershipMatch"])
        self.assertTrue(report["referenceParity"]["jobSnapshotMembershipMatch"])

    def test_roadmap_marks_s28_completed_and_s29_advanced(self) -> None:
        roadmap = json.loads((ROOT / "ROADMAP_STATUS.json").read_text(encoding="utf-8"))
        s28 = next(row for row in roadmap["steps"] if row["id"] == "S28")
        substeps = {row["id"]: row for row in s28["substeps"]}
        self.assertEqual(s28["status"], "completed")
        self.assertEqual(substeps["S28-5"]["status"], "completed")
        s29 = next(row for row in roadmap["steps"] if row["id"] == "S29")
        self.assertIn(s29["status"], {"ready", "implemented_pending_live_postgres_verification", "completed"})


if __name__ == "__main__":
    unittest.main()
