from __future__ import annotations

import json
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

from noticepilot_subscription_profile import (
    SubscriptionProfileValidationError,
    load_canonical_board_map,
    load_profile_examples,
    validate_subscription_profile,
)

ROOT = Path(__file__).resolve().parents[1]
BOARD_REGISTRY = ROOT / "configs" / "knu_board_registry.v0.2.json"
EXAMPLES = ROOT / "configs" / "subscription_profile_contract_examples.v0.1.json"


class S28SubscriptionProfileContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.board_map = load_canonical_board_map(BOARD_REGISTRY)
        cls.examples = load_profile_examples(EXAMPLES, canonical_board_map=cls.board_map)
        cls.student = deepcopy(cls.examples[0])
        cls.job = deepcopy(cls.examples[1])

    def test_contract_examples_are_valid_and_non_authoritative(self) -> None:
        raw = json.loads(EXAMPLES.read_text(encoding="utf-8"))
        self.assertFalse(raw["authoritativeDefaults"])
        self.assertEqual(len(self.examples), 2)
        self.assertEqual(len({row["profileId"] for row in self.examples}), 2)

    def test_profile_is_strict_and_rejects_unknown_keys(self) -> None:
        profile = deepcopy(self.student)
        profile["subscriptionUrl"] = "https://example.invalid/feed.ics"
        with self.assertRaises(SubscriptionProfileValidationError):
            validate_subscription_profile(profile, canonical_board_map=self.board_map)

    def test_unknown_and_review_policy_booleans_are_explicit_not_defaulted(self) -> None:
        profile = deepcopy(self.student)
        del profile["campusSelection"]["includeUnknownCampusEvents"]
        with self.assertRaises(SubscriptionProfileValidationError):
            validate_subscription_profile(profile, canonical_board_map=self.board_map)
        profile = deepcopy(self.student)
        del profile["eventSelection"]["includeReviewRequiredEvents"]
        with self.assertRaises(SubscriptionProfileValidationError):
            validate_subscription_profile(profile, canonical_board_map=self.board_map)

    def test_alias_or_unknown_board_ids_are_rejected(self) -> None:
        profile = deepcopy(self.student)
        profile["sourceSelection"]["selectedBoardIds"] = ["718"]
        profile["sourceSelection"]["selectedNoticeTypes"] = ["school_notice"]
        with self.assertRaises(SubscriptionProfileValidationError):
            validate_subscription_profile(profile, canonical_board_map=self.board_map)

    def test_selected_notice_types_must_match_selected_board_categories(self) -> None:
        profile = deepcopy(self.student)
        profile["sourceSelection"]["selectedNoticeTypes"] = ["school_notice"]
        with self.assertRaises(SubscriptionProfileValidationError):
            validate_subscription_profile(profile, canonical_board_map=self.board_map)

    def test_feed_scope_and_target_actor_are_consistent(self) -> None:
        profile = deepcopy(self.job)
        profile["eventSelection"]["includedTargetActors"] = ["student"]
        with self.assertRaises(SubscriptionProfileValidationError):
            validate_subscription_profile(profile, canonical_board_map=self.board_map)

    def test_disabled_audience_filter_requires_empty_dimensions_and_include_unscoped(self) -> None:
        profile = deepcopy(self.student)
        profile["audienceFilter"]["studentYears"] = [3]
        with self.assertRaises(SubscriptionProfileValidationError):
            validate_subscription_profile(profile, canonical_board_map=self.board_map)
        profile = deepcopy(self.student)
        profile["audienceFilter"]["unscopedEventPolicy"] = "exclude"
        with self.assertRaises(SubscriptionProfileValidationError):
            validate_subscription_profile(profile, canonical_board_map=self.board_map)

    def test_enabled_audience_filter_requires_student_scope_and_selected_dimension(self) -> None:
        profile = deepcopy(self.student)
        profile["audienceFilter"]["enabled"] = True
        profile["audienceFilter"]["studentYears"] = [3]
        profile["audienceFilter"]["unscopedEventPolicy"] = "exclude"
        validated = validate_subscription_profile(profile, canonical_board_map=self.board_map)
        self.assertEqual(validated["audienceFilter"]["studentYears"], [3])

        profile = deepcopy(self.student)
        profile["audienceFilter"]["enabled"] = True
        with self.assertRaises(SubscriptionProfileValidationError):
            validate_subscription_profile(profile, canonical_board_map=self.board_map)

        profile = deepcopy(self.job)
        profile["audienceFilter"]["enabled"] = True
        profile["audienceFilter"]["degreeLevels"] = ["undergraduate"]
        with self.assertRaises(SubscriptionProfileValidationError):
            validate_subscription_profile(profile, canonical_board_map=self.board_map)

    def test_updated_at_cannot_precede_created_at(self) -> None:
        profile = deepcopy(self.student)
        profile["updatedAt"] = "2026-07-12T13:00:00+09:00"
        with self.assertRaises(SubscriptionProfileValidationError):
            validate_subscription_profile(profile, canonical_board_map=self.board_map)

    def test_contract_does_not_contain_delivery_identity_or_event_projection_state(self) -> None:
        forbidden = {
            "feedToken", "feedTokenHash", "publicSlug", "subscriptionUrl",
            "icsUrl", "eventIds", "calendarEventIds", "snapshotHash",
        }
        for profile in self.examples:
            self.assertFalse(forbidden & set(profile))

    def test_s27_registry_and_projection_remain_immutable(self) -> None:
        registry = json.loads((ROOT / "registry/s27c-v1/manifest.json").read_text(encoding="utf-8"))
        projection = json.loads((ROOT / "projection/s27d-v1/manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(registry["counts"]["calendarEventCount"], 900)
        self.assertEqual(projection["counts"]["calendarEventCount"], 900)
        self.assertEqual(projection["counts"]["persistentUidCount"], 900)

    def test_audit_tool_passes(self) -> None:
        from tools.audit_s28_subscription_profile_contract import build_report

        with tempfile.TemporaryDirectory() as tmp:
            report = build_report(ROOT, Path(tmp))
        self.assertEqual(report["result"], "pass")
        self.assertEqual(report["checks"]["validContractExampleCount"], 2)
        self.assertEqual(report["checks"]["s27CalendarEventCount"], 900)
        self.assertFalse(report["scope"]["feedEligibilityRulesImplemented"])
        self.assertFalse(report["scope"]["feedBuilderImplemented"])

    def test_roadmap_preserves_s28_1_completion_as_later_steps_advance(self) -> None:
        roadmap = json.loads((ROOT / "ROADMAP_STATUS.json").read_text(encoding="utf-8"))
        s28 = next(row for row in roadmap["steps"] if row["id"] == "S28")
        substeps = {row["id"]: row for row in s28["substeps"]}
        self.assertIn(s28["status"], {"in_progress", "completed"})
        self.assertEqual(substeps["S28-1"]["status"], "completed")
        self.assertEqual(substeps["S28-2"]["status"], "completed")
        self.assertIn(substeps["S28-3"]["status"], {"ready", "completed"})
        self.assertIn(substeps["S28-4"]["status"], {"planned", "ready", "completed"})
        self.assertIn(substeps["S28-5"]["status"], {"planned", "ready", "completed"})
        self.assertIn(roadmap["currentStep"], {"S28", "S29-LIVE-POSTGRES-VERIFY", "S30"})


if __name__ == "__main__":
    unittest.main()
