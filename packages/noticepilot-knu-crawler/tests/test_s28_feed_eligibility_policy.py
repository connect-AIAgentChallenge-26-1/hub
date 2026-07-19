from __future__ import annotations

import json
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

from noticepilot_feed_eligibility import (
    FeedEligibilityError,
    FeedEligibilityEvaluator,
    REASON_PRECEDENCE,
    build_eligibility_input_views,
    evaluate_views,
    get_approved_modes,
    get_default_profile_policy,
    load_feed_eligibility_policy,
    policy_is_resolved,
)
from noticepilot_subscription_profile import load_canonical_board_map, load_profile_examples

ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "configs/noticepilot_feed_eligibility_policy.v0.2.json"


class S28FeedEligibilityPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.views = build_eligibility_input_views(ROOT)
        cls.by_event = {row["calendarEventId"]: row for row in cls.views}
        board_map = load_canonical_board_map(ROOT / "configs/knu_board_registry.v0.2.json")
        cls.student, cls.job = load_profile_examples(
            ROOT / "configs/subscription_profile_contract_examples.v0.1.json",
            canonical_board_map=board_map,
        )

    def test_builds_one_authoritative_input_view_per_active_event(self) -> None:
        self.assertEqual(len(self.views), 900)
        self.assertEqual(len(self.by_event), 900)
        self.assertEqual(sum(len(row["sourceLinks"]) for row in self.views), 909)
        self.assertTrue(all(row["temporalState"]["hasValidNormalizedDate"] for row in self.views))

    def test_input_views_preserve_campus_and_audience_counts(self) -> None:
        unknown = [row for row in self.views if row["campusScope"]["scopeType"] == "unknown"]
        ready = [row for row in self.views if row["audienceRules"]["personalizationReady"]]
        self.assertEqual(len(unknown), 1)
        self.assertEqual(unknown[0]["feedScopes"], ["job_application"])
        self.assertEqual(len(ready), 12)

    def test_all_active_review_states_resolve_to_auto_confirmed(self) -> None:
        self.assertTrue(all(not row["reviewState"]["unknownCandidateIds"] for row in self.views))
        self.assertTrue(all(row["reviewState"]["allSourcesAutoConfirmed"] for row in self.views))
        self.assertTrue(all(not row["reviewState"]["anySourceRequiresReview"] for row in self.views))

    def test_policy_is_approved_and_resolved(self) -> None:
        policy = load_feed_eligibility_policy(POLICY)
        self.assertEqual(policy["status"], "approved")
        self.assertTrue(policy_is_resolved(policy))
        self.assertEqual(get_approved_modes(policy), ("canonical_source_only", "canonical_candidate_only"))
        self.assertEqual(get_default_profile_policy(policy, "student"), {
            "includeUnknownCampusEvents": True,
            "includeReviewRequiredEvents": True,
            "reviewRequiredInclusionRule": "include_if_valid_normalized_date",
        })
        self.assertEqual(get_default_profile_policy(policy, "job"), get_default_profile_policy(policy, "student"))
        self.assertEqual(policy["decisions"]["audienceUnscopedDefault"], "include")
        self.assertEqual(policy["unresolvedDecisionIds"], [])

    def test_evaluator_rejects_unresolved_modes(self) -> None:
        with self.assertRaises(FeedEligibilityError):
            FeedEligibilityEvaluator(
                source_match_mode="creator_decision_required",
                review_aggregation_mode="any_source_requires_review",
            )

    def test_profile_status_has_highest_exclusion_precedence(self) -> None:
        profile = deepcopy(self.student)
        profile["status"] = "paused"
        evaluator = FeedEligibilityEvaluator(
            source_match_mode="any_active_source_link",
            review_aggregation_mode="any_source_requires_review",
        )
        decision = evaluator.evaluate(profile, self.views[0]).to_dict()
        self.assertFalse(decision["eligible"])
        self.assertEqual(decision["primaryReasonCode"], "profile_not_active")
        self.assertEqual(REASON_PRECEDENCE[0], "profile_not_active")

    def test_unknown_campus_is_controlled_only_by_explicit_profile_boolean(self) -> None:
        unknown = next(row for row in self.views if row["campusScope"]["scopeType"] == "unknown")
        profile = deepcopy(self.job)
        profile["status"] = "active"
        evaluator = FeedEligibilityEvaluator(
            source_match_mode="any_active_source_link",
            review_aggregation_mode="any_source_requires_review",
        )
        profile["campusSelection"]["includeUnknownCampusEvents"] = False
        excluded = evaluator.evaluate(profile, unknown).to_dict()
        self.assertIn("campus_unknown_excluded", excluded["reasonCodes"])
        profile["campusSelection"]["includeUnknownCampusEvents"] = True
        included = evaluator.evaluate(profile, unknown).to_dict()
        self.assertTrue(included["eligible"])

    def test_cross_post_source_mode_changes_general_board_selection_by_eight(self) -> None:
        profile = deepcopy(self.student)
        profile["campusSelection"]["selectedCampuses"] = [
            "chuncheon", "samcheok", "dogye", "gangneung_wonju"
        ]
        profile["sourceSelection"]["selectedBoardIds"] = ["504"]
        profile["sourceSelection"]["selectedNoticeTypes"] = ["general_notice"]
        canonical = evaluate_views(
            profile,
            self.views,
            source_match_mode="canonical_source_only",
            review_aggregation_mode="any_source_requires_review",
        )
        any_link = evaluate_views(
            profile,
            self.views,
            source_match_mode="any_active_source_link",
            review_aggregation_mode="any_source_requires_review",
        )
        self.assertEqual(sum(row["eligible"] for row in canonical), 260)
        self.assertEqual(sum(row["eligible"] for row in any_link), 268)

    def test_source_board_and_notice_type_must_match_same_link(self) -> None:
        cross_post = next(
            row for row in self.views
            if {link["canonicalBoardId"] for link in row["sourceLinks"]} == {"504", "721"}
        )
        profile = deepcopy(self.student)
        profile["campusSelection"]["selectedCampuses"] = [
            "chuncheon", "samcheok", "dogye", "gangneung_wonju"
        ]
        profile["sourceSelection"]["selectedBoardIds"] = ["504"]
        profile["sourceSelection"]["selectedNoticeTypes"] = ["scholarship"]
        evaluator = FeedEligibilityEvaluator(
            source_match_mode="any_active_source_link",
            review_aggregation_mode="any_source_requires_review",
        )
        decision = evaluator.evaluate(profile, cross_post).to_dict()
        self.assertIn("source_board_or_notice_type_mismatch", decision["reasonCodes"])

    def test_audience_unscoped_policy_has_large_explicit_effect(self) -> None:
        profile = deepcopy(self.student)
        profile["campusSelection"]["selectedCampuses"] = [
            "chuncheon", "samcheok", "dogye", "gangneung_wonju"
        ]
        profile["audienceFilter"] = {
            "enabled": True,
            "degreeLevels": [],
            "studentYears": [3],
            "enrollmentStatuses": [],
            "admissionTypes": [],
            "matchMode": "all_dimensions",
            "unscopedEventPolicy": "include",
        }
        include = evaluate_views(
            profile,
            self.views,
            source_match_mode="any_active_source_link",
            review_aggregation_mode="any_source_requires_review",
        )
        profile["audienceFilter"]["unscopedEventPolicy"] = "exclude"
        exclude = evaluate_views(
            profile,
            self.views,
            source_match_mode="any_active_source_link",
            review_aggregation_mode="any_source_requires_review",
        )
        self.assertEqual(sum(row["eligible"] for row in include), 600)
        self.assertEqual(sum(row["eligible"] for row in exclude), 11)

    def test_empty_event_audience_dimension_is_unrestricted(self) -> None:
        ready = next(
            row for row in self.views
            if row["audienceRules"]["personalizationReady"]
            and row["audienceRules"]["degreeLevels"] == ["undergraduate"]
            and not row["audienceRules"]["studentYears"]
        )
        profile = deepcopy(self.student)
        profile["campusSelection"]["selectedCampuses"] = [
            "chuncheon", "samcheok", "dogye", "gangneung_wonju"
        ]
        profile["audienceFilter"] = {
            "enabled": True,
            "degreeLevels": ["undergraduate"],
            "studentYears": [6],
            "enrollmentStatuses": [],
            "admissionTypes": [],
            "matchMode": "all_dimensions",
            "unscopedEventPolicy": "exclude",
        }
        evaluator = FeedEligibilityEvaluator(
            source_match_mode="any_active_source_link",
            review_aggregation_mode="any_source_requires_review",
        )
        decision = evaluator.evaluate(profile, ready).to_dict()
        self.assertNotIn("audience_student_year_mismatch", decision["reasonCodes"])

    def test_invalid_normalized_date_is_excluded_even_when_review_is_allowed(self) -> None:
        view = deepcopy(self.views[0])
        view["temporalState"]["normalizedStart"] = None
        view["temporalState"]["hasValidNormalizedDate"] = False
        profile = deepcopy(self.student)
        profile["campusSelection"]["selectedCampuses"] = [
            "chuncheon", "samcheok", "dogye", "gangneung_wonju"
        ]
        profile["sourceSelection"]["selectedBoardIds"] = [view["sourceLinks"][0]["canonicalBoardId"]]
        profile["sourceSelection"]["selectedNoticeTypes"] = [view["sourceLinks"][0]["noticeType"]
        ]
        profile["eventSelection"]["includedFeedScopes"] = list(view["feedScopes"])
        profile["eventSelection"]["includedEventTypes"] = [view["eventType"]]
        profile["eventSelection"]["includedTargetActors"] = [view["targetActor"]]
        profile["eventSelection"]["includeReviewRequiredEvents"] = True
        decision = FeedEligibilityEvaluator(
            source_match_mode="canonical_source_only",
            review_aggregation_mode="canonical_candidate_only",
        ).evaluate(profile, view).to_dict()
        self.assertFalse(decision["eligible"])
        self.assertIn("invalid_normalized_date", decision["reasonCodes"])

    def test_review_aggregation_modes_are_explicit_and_fail_closed(self) -> None:
        view = deepcopy(self.views[0])
        view["reviewState"] = {
            "canonicalVerdict": "auto_confirmed",
            "sourceVerdicts": [
                {"candidateId": view["canonicalCandidateId"], "verdict": "auto_confirmed", "includeInCalendarFeed": True, "reasonCodes": [], "ruleIds": []},
                {"candidateId": "cand-synthetic-review", "verdict": "needs_review", "includeInCalendarFeed": False, "reasonCodes": [], "ruleIds": []},
            ],
            "anySourceRequiresReview": True,
            "allSourcesAutoConfirmed": False,
            "unknownCandidateIds": [],
        }
        profile = deepcopy(self.student)
        profile["campusSelection"]["selectedCampuses"] = [
            "chuncheon", "samcheok", "dogye", "gangneung_wonju"
        ]
        # Make unrelated dimensions match this synthetic view.
        profile["sourceSelection"]["selectedBoardIds"] = [view["sourceLinks"][0]["canonicalBoardId"]]
        profile["sourceSelection"]["selectedNoticeTypes"] = [view["sourceLinks"][0]["noticeType"]]
        profile["eventSelection"]["includedFeedScopes"] = list(view["feedScopes"])
        profile["eventSelection"]["includedEventTypes"] = [view["eventType"]]
        profile["eventSelection"]["includedTargetActors"] = [view["targetActor"]]
        canonical = FeedEligibilityEvaluator(
            source_match_mode="any_active_source_link",
            review_aggregation_mode="canonical_candidate_only",
        ).evaluate(profile, view).to_dict()
        any_source = FeedEligibilityEvaluator(
            source_match_mode="any_active_source_link",
            review_aggregation_mode="any_source_requires_review",
        ).evaluate(profile, view).to_dict()
        self.assertNotIn("review_required_excluded", canonical["reasonCodes"])
        self.assertIn("review_required_excluded", any_source["reasonCodes"])

    def test_audit_passes_and_emits_decision_queue(self) -> None:
        from tools.audit_s28_feed_eligibility_policy import build_report

        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            report = build_report(ROOT, output)
            record = json.loads((output / "creator-decision-record.json").read_text(encoding="utf-8"))
            queue = json.loads((output / "creator-decision-queue.json").read_text(encoding="utf-8"))
            views = (output / "eligibility-input-views.jsonl").read_text(encoding="utf-8").splitlines()
        self.assertEqual(report["result"], "pass")
        self.assertEqual(report["status"], "completed")
        self.assertEqual(report["counts"]["activeCalendarEventCount"], 900)
        self.assertEqual(report["counts"]["validNormalizedDateEventCount"], 900)
        self.assertEqual(record["status"], "approved")
        self.assertEqual(len(record["decisions"]), 5)
        self.assertEqual(queue["status"], "completed")
        self.assertEqual(queue["unresolvedDecisions"], [])
        self.assertEqual(len(views), 900)
        self.assertFalse(report["scope"]["feedBuilderImplemented"])

    def test_s27_manifests_remain_unchanged(self) -> None:
        from tools.audit_s28_feed_eligibility_policy import (
            EXPECTED_S27C_MANIFEST_SHA256,
            EXPECTED_S27D_MANIFEST_SHA256,
            file_sha256,
        )
        self.assertEqual(file_sha256(ROOT / "registry/s27c-v1/manifest.json"), EXPECTED_S27C_MANIFEST_SHA256)
        self.assertEqual(file_sha256(ROOT / "projection/s27d-v1/manifest.json"), EXPECTED_S27D_MANIFEST_SHA256)

    def test_roadmap_marks_s28_2_completed_and_s28_3_ready(self) -> None:
        roadmap = json.loads((ROOT / "ROADMAP_STATUS.json").read_text(encoding="utf-8"))
        s28 = next(row for row in roadmap["steps"] if row["id"] == "S28")
        substeps = {row["id"]: row for row in s28["substeps"]}
        self.assertEqual(substeps["S28-1"]["status"], "completed")
        self.assertEqual(substeps["S28-2"]["status"], "completed")
        self.assertIn(substeps["S28-3"]["status"], {"ready", "completed"})
        self.assertIn(substeps["S28-4"]["status"], {"planned", "ready", "completed"})
        self.assertIn(substeps["S28-5"]["status"], {"planned", "ready", "completed"})


if __name__ == "__main__":
    unittest.main()
