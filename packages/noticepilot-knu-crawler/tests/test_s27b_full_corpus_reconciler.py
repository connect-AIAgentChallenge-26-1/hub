from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class S27BFullCorpusReconcilerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.output = Path(cls.tmp.name) / "s27b"
        result = subprocess.run(
            [
                "python3", str(ROOT / "tools/audit_s27b_cross_notice_reconciler.py"),
                "--current", str(ROOT / "derived/mvp-policy-v0.1"),
                "--output-dir", str(cls.output),
            ], capture_output=True, text=True, check=False,
        )
        if result.returncode != 0:
            cls.tmp.cleanup()
            raise AssertionError(result.stdout + result.stderr)
        cls.report = json.loads((cls.output / "s27b-cross-notice-reconciler-audit.json").read_text(encoding="utf-8"))
        cls.decisions = [json.loads(line) for line in (cls.output / "relation-decisions.jsonl").read_text(encoding="utf-8").splitlines() if line]
        cls.plans = [json.loads(line) for line in (cls.output / "merge-plans.jsonl").read_text(encoding="utf-8").splitlines() if line]

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_all_diagnostic_pairs_receive_a_deterministic_relation(self):
        self.assertEqual(self.report["result"], "pass")
        self.assertEqual(self.report["checks"]["publishableCandidateCount"], 909)
        self.assertEqual(self.report["checks"]["relationDecisionCount"], 343)
        self.assertTrue(all(row["relation"] for row in self.decisions))

    def test_s27b_does_not_issue_event_ids_or_change_runtime_or_ics(self):
        checks = self.report["checks"]
        self.assertEqual(checks["calendarEventIdAssignmentCount"], 0)
        self.assertEqual(checks["runtimeMutationCount"], 0)
        self.assertEqual(checks["icsMutationCount"], 0)
        self.assertEqual(checks["layeredBaselineResult"], "match")
        self.assertEqual(checks["layeredBaselineChangeCount"], 0)

    def test_automatic_merge_plans_require_complete_pairwise_evidence(self):
        self.assertTrue(all(row["pairwiseComplete"] for row in self.plans if row["status"] == "approved"))

    def test_all_corpus_duplicate_representatives_are_resolved_to_specialized_boards(self):
        duplicate_rows = [row for row in self.decisions if row["relation"] == "duplicate"]
        self.assertEqual(len(duplicate_rows), 8)
        self.assertTrue(all(row["canonicalSelection"]["status"] == "resolved" for row in duplicate_rows))
        self.assertTrue(all(row["mergeAllowed"] for row in duplicate_rows))
        selected = {row["canonicalSelection"]["candidateId"] for row in duplicate_rows}
        self.assertTrue(all("-715-" in candidate_id or "-721-" in candidate_id for candidate_id in selected))
        self.assertEqual(self.report["checks"]["unresolvedDuplicateCanonicalSelectionCount"], 0)
        self.assertFalse(self.report["creatorDecisionStatus"]["nextDecisionRequiredBeforePersistence"])


if __name__ == "__main__":
    unittest.main()
