from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class S27BStep1D8SourceIdentityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.policy = json.loads(
            (ROOT / "configs" / "noticepilot_cross_notice_reconciliation_policy.v0.3.json").read_text(encoding="utf-8")
        )
        cls.d8 = cls.policy["decisions"]["S27A-D8"]

    def test_policy_version_and_source_identity_components(self) -> None:
        self.assertEqual(self.policy["schemaVersion"], "noticepilot.crossNoticeReconciliationPolicy.v0.3")
        self.assertEqual(self.policy["policyVersion"], "0.3.0")
        self.assertEqual(
            self.d8["canonicalSourceIdentity"]["components"],
            ["institution_id", "canonical_board_category", "source_post_id"],
        )

    def test_observed_url_and_crawler_priority_are_not_identity_fallbacks(self) -> None:
        self.assertFalse(self.d8["canonicalSourceIdentity"]["observed_source_url_is_identity"])
        self.assertFalse(self.d8["sourceUrlPolicy"]["lexicalUrlOrderingAllowed"])
        self.assertFalse(self.d8["sourceUrlPolicy"]["observedSourceUrlAuthorityAllowed"])
        self.assertFalse(
            self.d8["boardAuthorityPolicy"]["crawlerPriorityFieldAutomaticallyUsedAsRepresentativePriority"]
        )

    def test_specialized_board_partial_precedence_is_configured(self) -> None:
        self.assertEqual(
            self.d8["canonicalRepresentativeBoardPrecedence"],
            [
                {"higherBoardId": "715", "lowerBoardId": "504", "rationale": "event_notice_over_general_notice"},
                {"higherBoardId": "721", "lowerBoardId": "504", "rationale": "scholarship_notice_over_general_notice"},
            ],
        )
        self.assertEqual(self.d8["boardPriorityConfigurationStatus"], "configured_partial_order")
        self.assertFalse(self.d8["partialOrderTransitiveClosureAllowed"])
        self.assertEqual(self.d8["unconfiguredBoardPairAction"], "needs_review")
        self.assertFalse(self.d8["noticeSequenceFallbackAllowed"])
        self.assertFalse(self.d8["candidateIdFallbackAllowed"])
        self.assertFalse(self.d8["lexicalUrlFallbackAllowed"])


if __name__ == "__main__":
    unittest.main()
