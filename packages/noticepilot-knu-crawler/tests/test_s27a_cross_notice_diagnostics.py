from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class S27ACrossNoticeDiagnosticTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._tmp = tempfile.TemporaryDirectory()
        cls.output_dir = Path(cls._tmp.name) / "s27a"
        result = subprocess.run(
            [
                "python3",
                str(ROOT / "tools" / "audit_s27a_cross_notice_diagnostics.py"),
                "--current",
                str(ROOT / "derived" / "mvp-policy-v0.1"),
                "--output-dir",
                str(cls.output_dir),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            cls._tmp.cleanup()
            raise AssertionError(result.stdout + result.stderr)
        cls.report = json.loads((cls.output_dir / "s27a-cross-notice-diagnosis.json").read_text(encoding="utf-8"))
        cls.pairs = [
            json.loads(line)
            for line in (cls.output_dir / "pair-diagnostics.jsonl").read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        cls.clusters = [
            json.loads(line)
            for line in (cls.output_dir / "cluster-diagnostics.jsonl").read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        cls.decisions = json.loads((cls.output_dir / "creator-decision-record.json").read_text(encoding="utf-8"))
        cls.policy = json.loads((ROOT / "configs" / "noticepilot_cross_notice_reconciliation_policy.v0.3.json").read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls) -> None:
        cls._tmp.cleanup()

    def test_diagnosis_covers_all_publishable_candidates_without_relation_execution(self) -> None:
        checks = self.report["checks"]
        self.assertEqual(self.report["result"], "pass")
        self.assertEqual(checks["publishableCandidateCount"], 909)
        self.assertEqual(checks["uniquePublishableCandidateIdCount"], 909)
        self.assertEqual(checks["diagnosticPairCount"], 343)
        self.assertEqual(checks["highSignalPairCount"], 166)
        self.assertEqual(checks["mediumSignalPairCount"], 177)
        self.assertEqual(checks["diagnosticClusterCount"], 110)
        self.assertEqual(checks["pairRelationDecisionCount"], 0)
        self.assertEqual(checks["pairAutomaticMutationAllowedCount"], 0)

    def test_every_pair_is_policy_approved_but_execution_deferred(self) -> None:
        self.assertEqual(len(self.pairs), 343)
        for pair in self.pairs:
            decision = pair["relationDecision"]
            self.assertEqual(decision["status"], "policy_approved_execution_deferred")
            self.assertEqual(decision["policyVersion"], "noticepilot.crossNoticeReconciliationPolicy.v0.3")
            self.assertIsNone(decision["relation"])
            self.assertFalse(decision["automaticMutationAllowed"])
            self.assertEqual(len(pair["candidates"]), 2)
            self.assertNotEqual(pair["candidates"][0]["sourceNoticeId"], pair["candidates"][1]["sourceNoticeId"])
            self.assertIn("sourceUrl", pair["candidates"][0])

    def test_cluster_policy_requires_direct_pairwise_evidence(self) -> None:
        self.assertEqual(len(self.clusters), 110)
        self.assertTrue(all(not row["automaticMergeAllowed"] for row in self.clusters))
        self.assertEqual(sum(bool(row["transitivityWarning"]) for row in self.clusters), 15)
        self.assertFalse(self.policy["decisions"]["S27A-D6"]["transitiveMergeAllowed"])
        self.assertEqual(self.policy["decisions"]["S27A-D6"]["requiredGraph"], "complete_pairwise_evidence")

    def test_registry_assigned_opaque_strategy_is_selected_without_assignment(self) -> None:
        draft = json.loads((self.output_dir / "stable-calendar-event-id-draft.json").read_text(encoding="utf-8"))
        self.assertEqual(draft["status"], "strategy_approved_registry_not_created")
        self.assertEqual(draft["selectedStrategy"], "registry_assigned_opaque_v0")
        self.assertFalse(draft["calendarEventIdAssigned"])
        self.assertEqual(self.policy["decisions"]["S27A-D5"]["selectedStrategy"], "registry_assigned_opaque_v0")

    def test_runtime_and_ics_are_unchanged(self) -> None:
        checks = self.report["checks"]
        self.assertEqual(checks["calendarEventIdRuntimeFieldCount"], 0)
        self.assertEqual(checks["candidateUidHintCompatibilityCount"], 909)
        self.assertEqual(checks["studentIcsUidCount"], 609)
        self.assertEqual(checks["jobIcsUidCount"], 300)
        self.assertTrue(checks["icsUidCandidateCompatibility"])
        self.assertEqual(checks["layeredBaselineResult"], "match")
        self.assertEqual(checks["layeredBaselineChangeCount"], 0)

    def test_creator_decision_record_contains_all_approved_decisions(self) -> None:
        self.assertEqual(self.decisions["status"], "creator_decisions_recorded")
        self.assertFalse(self.decisions["automaticRelationDecisionsPerformed"])
        self.assertFalse(self.decisions["calendarEventIdAssignmentsPerformed"])
        self.assertEqual(len(self.decisions["decisions"]), 8)
        self.assertTrue(all(row["approvedPolicy"]["status"].startswith("approved") for row in self.decisions["decisions"]))

    def test_d1_d2_and_d4_are_exactly_recorded(self) -> None:
        d = self.policy["decisions"]
        self.assertEqual(d["S27A-D1"]["defaultRelation"], "distinct")
        self.assertEqual(d["S27A-D2"]["automaticRelation"], "duplicate")
        self.assertEqual(len(d["S27A-D2"]["allOf"]), 6)
        self.assertEqual(d["S27A-D4"]["defaultRelation"], "distinct")
        self.assertFalse(d["S27A-D4"]["parentChildIdentityAllowed"])

    def test_d3_marker_policy_is_fail_closed(self) -> None:
        d3 = self.policy["decisions"]["S27A-D3"]
        self.assertTrue(d3["markerAloneNeverAuthorizesRelation"])
        self.assertEqual(d3["rules"]["extension"]["automaticRelation"], "extension")
        self.assertEqual(d3["rules"]["repost_or_reannouncement"]["automaticRelation"], "duplicate")
        self.assertFalse(d3["rules"]["revision"]["initialS27AutomaticRevisionAllowed"])
        self.assertEqual(d3["rules"]["revision"]["result"], "needs_review")
        self.assertEqual(d3["rules"]["additional_recruitment_or_closed"]["defaultRelation"], "distinct")
        self.assertEqual(d3["rules"]["replacement_or_cancellation"]["withoutBodyOriginalNoticeReference"], "needs_review")

    def test_d7_preserves_all_sources_with_one_active_ics_projection(self) -> None:
        d7 = self.policy["decisions"]["S27A-D7"]
        self.assertEqual(d7["activeIcsProjectionCountPerApprovedIdentity"], 1)
        self.assertTrue(d7["preserveAllSourceLinks"])
        self.assertTrue(d7["preserveAllSourceCandidateIds"])

    def test_d8_uses_explicit_specialized_board_partial_precedence(self) -> None:
        d8 = self.policy["decisions"]["S27A-D8"]
        self.assertEqual(d8["rule"], "canonical_source_identity_then_authoritative_source_then_configured_board_precedence")
        self.assertEqual(
            {(row["higherBoardId"], row["lowerBoardId"]) for row in d8["canonicalRepresentativeBoardPrecedence"]},
            {("715", "504"), ("721", "504")},
        )
        self.assertEqual(d8["boardPriorityConfigurationStatus"], "configured_partial_order")
        self.assertFalse(d8["partialOrderTransitiveClosureAllowed"])
        self.assertFalse(d8["noticeSequenceFallbackAllowed"])
        self.assertFalse(d8["candidateIdFallbackAllowed"])
        self.assertFalse(d8["sourceUrlPolicy"]["lexicalUrlOrderingAllowed"])
        self.assertEqual(d8["unresolvedTieAction"], "needs_review")
        self.assertTrue(self.report["checks"]["boardPriorityConfigured"])

    def test_report_references_are_relative(self) -> None:
        self.assertEqual(
            self.report["pathReferences"],
            {"base": "diagnosis_report_directory", "format": "posix_relative"},
        )
        refs = [self.report["currentDir"], *self.report["artifacts"].values()]
        self.assertTrue(all(not Path(ref).is_absolute() for ref in refs))

    def test_contract_schemas_and_relation_enum_are_valid(self) -> None:
        schema_dir = ROOT / "schemas" / "calendar-event-reconciliation"
        schemas = [json.loads(path.read_text(encoding="utf-8")) for path in schema_dir.glob("*.schema.json")]
        self.assertGreaterEqual(len(schemas), 3)
        record = json.loads((schema_dir / "calendar-event-reconciliation.schema.json").read_text(encoding="utf-8"))
        relation_enum = record["properties"]["relation"]["enum"]
        self.assertEqual(
            set(relation_enum),
            {"distinct", "duplicate", "revision", "extension", "replacement", "needs_review", None},
        )
        self.assertEqual(record["properties"]["idStrategy"]["const"], "registry_assigned_opaque_v0")
        self.assertEqual(record["properties"]["activeIcsProjectionCount"]["maximum"], 1)

    def test_roadmap_marks_s27a_complete_and_s27b_ready(self) -> None:
        status = json.loads((ROOT / "ROADMAP_STATUS.json").read_text(encoding="utf-8"))
        s27 = next(row for row in status["steps"] if row["id"] == "S27")
        self.assertIn(status["currentStep"], {"S27-C", "S27-D", "S28", "S29-LIVE-POSTGRES-VERIFY", "S30"})
        self.assertIn(s27["status"], {"in_progress", "completed"})
        substeps = {row["id"]: row for row in s27["substeps"]}
        self.assertEqual(substeps["S27-A"]["status"], "completed")
        self.assertTrue(substeps["S27-A"]["creatorDecisionsApproved"])
        self.assertFalse(substeps["S27-A"]["relationDecisionsPerformed"])
        self.assertFalse(substeps["S27-A"]["calendarEventIdAssigned"])
        self.assertIn(substeps["S27-B"]["status"], {"completed"})


if __name__ == "__main__":
    unittest.main()
