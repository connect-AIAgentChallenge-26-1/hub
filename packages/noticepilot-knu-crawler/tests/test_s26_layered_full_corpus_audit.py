from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class S26LayeredFullCorpusAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._tmp = tempfile.TemporaryDirectory()
        tmp_path = Path(cls._tmp.name)
        output = tmp_path / "audit.json"
        component_dir = tmp_path / "components"
        result = subprocess.run(
            [
                "python3",
                str(ROOT / "tools" / "audit_s26_layered_full_corpus.py"),
                "--baseline",
                str(ROOT / "baseline" / "policy15"),
                "--current",
                str(ROOT / "derived" / "mvp-policy-v0.1"),
                "--output",
                str(output),
                "--component-output-dir",
                str(component_dir),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            cls._tmp.cleanup()
            raise AssertionError(result.stdout + result.stderr)
        cls.output = output
        cls.component_dir = component_dir
        cls.report = json.loads(output.read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls) -> None:
        cls._tmp.cleanup()

    def test_unified_full_corpus_audit_passes(self) -> None:
        report = self.report
        self.assertEqual(report["result"], "pass")
        self.assertTrue(report["checks"]["allComponentAuditsPass"])
        self.assertEqual(report["checks"]["noticeDecisionCount"], 2059)
        self.assertEqual(report["checks"]["candidateCount"], 1304)
        self.assertEqual(report["checks"]["completeTraceCandidateCount"], 1304)
        self.assertEqual(report["checks"]["runtimeApplicabilityJudgmentFieldCount"], 1304)
        self.assertEqual(report["checks"]["runtimePublishabilityJudgmentFieldCount"], 1304)
        self.assertEqual(report["checks"]["reconcilerSecondPassRemovedCandidateCount"], 0)

    def test_component_audits_are_all_included(self) -> None:
        report = self.report
        expected = {
            "s24aBoard716Trace",
            "s24bApplicability",
            "s24cPublishability",
            "s24dRuntimeWiring",
            "s25CandidateReconciler",
        }
        self.assertEqual(set(report["componentAudits"]), expected)
        self.assertTrue(all(row["result"] == "pass" for row in report["componentAudits"].values()))

    def test_report_references_are_portable_relative_paths(self) -> None:
        report = self.report
        self.assertEqual(
            report["pathReferences"],
            {"base": "audit_report_directory", "format": "posix_relative"},
        )
        references = [
            report["baselineDir"],
            report["currentDir"],
            report["scope"]["layeredBaselineDir"],
            report["scope"]["decisionRecord"],
            report["baselineObservation"]["rawDiffReport"],
            *(row["report"] for row in report["componentAudits"].values()),
        ]
        self.assertTrue(all(not Path(value).is_absolute() for value in references))
        self.assertEqual(
            (self.output.parent / report["baselineDir"]).resolve(),
            (ROOT / "baseline" / "policy15").resolve(),
        )
        self.assertEqual(
            (self.output.parent / report["currentDir"]).resolve(),
            (ROOT / "derived" / "mvp-policy-v0.1").resolve(),
        )
        self.assertEqual(
            (self.output.parent / report["baselineObservation"]["rawDiffReport"]).resolve(),
            (self.output.parent / "s26-policy15-observation-diff.json").resolve(),
        )
        self.assertTrue(
            all(
                (self.output.parent / row["report"]).resolve().parent
                == self.component_dir.resolve()
                for row in report["componentAudits"].values()
            )
        )

    def test_baseline_diff_is_observed_without_adjudication(self) -> None:
        observation = self.report["baselineObservation"]
        self.assertEqual(observation["result"], "different")
        self.assertEqual(observation["changeCount"], 304)
        self.assertIsNone(observation["allowlist"])
        self.assertEqual(observation["adjudication"], "accepted_for_separate_layered_baseline")
        self.assertTrue(self.report["scope"]["baselinePromotionDecisionPerformed"])
        self.assertTrue(self.report["scope"]["separateLayeredBaselineCreated"])
        self.assertFalse(self.report["scope"]["baselineReplacementPerformed"])
        self.assertFalse(self.report["scope"]["allowlistDecisionPerformed"])
        self.assertEqual(observation["reviewQueueChanges"], {"added": 0, "removed": 0, "changed": 0})
        self.assertTrue(
            all(
                counts == {"added": 0, "removed": 0, "changed": 0}
                for counts in observation["icsEventChanges"].values()
            )
        )

    def test_roadmap_records_separate_layered_baseline_decision(self) -> None:
        status = json.loads((ROOT / "ROADMAP_STATUS.json").read_text(encoding="utf-8"))
        steps = {row["id"]: row for row in status["steps"]}
        s26 = steps["S26"]
        substeps = {row["id"]: row for row in s26["substeps"]}
        self.assertIn(status["currentStep"], {"S27", "S27-A", "S27-B", "S27-C", "S27-D", "S28", "S29-LIVE-POSTGRES-VERIFY", "S30"})
        self.assertEqual(s26["status"], "completed")
        self.assertEqual(substeps["S26-A"]["status"], "completed")
        self.assertEqual(substeps["S26-B"]["status"], "completed")
        self.assertEqual(substeps["S26-B"]["decision"], "create_separate_layered_baseline")
        self.assertTrue(substeps["S26-B"]["policy15Preserved"])
        self.assertFalse(substeps["S26-B"]["policy15Replaced"])
        self.assertFalse(substeps["S26-B"]["allowlistCreated"])


if __name__ == "__main__":
    unittest.main()
