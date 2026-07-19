from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from compare_layered_baseline import compare  # noqa: E402
from layered_baseline_common import read_json, read_jsonl, sha256_file  # noqa: E402

LAYERED = ROOT / "baseline" / "layered-s26-v1"
POLICY15 = ROOT / "baseline" / "policy15"
CURRENT = ROOT / "derived" / "mvp-policy-v0.1"


class S26LayeredBaselineTests(unittest.TestCase):
    def test_manifest_hashes_and_counts_match_embedded_artifacts(self) -> None:
        manifest = read_json(LAYERED / "baseline-manifest.json")
        self.assertEqual(manifest["baselineId"], "layered-s26-corpus-2059-20260712-v1")
        self.assertEqual(manifest["counts"]["processedNoticeCount"], 2059)
        self.assertEqual(manifest["counts"]["noticeCandidateDocumentCount"], 2059)
        self.assertEqual(manifest["counts"]["uniqueCandidateCount"], 1304)
        self.assertEqual(manifest["counts"]["completeTraceCandidateCount"], 1304)
        self.assertEqual(manifest["counts"]["runtimeApplicabilityJudgmentCount"], 1304)
        self.assertEqual(manifest["counts"]["runtimePublishabilityJudgmentCount"], 1304)
        self.assertEqual(manifest["counts"]["publishableCandidateCount"], 909)
        self.assertEqual(manifest["counts"]["reviewDecisionCount"], 796)
        self.assertTrue(manifest["relationship"]["policy15Preserved"])
        self.assertFalse(manifest["relationship"]["policy15Replaced"])
        self.assertFalse(manifest["relationship"]["allowlistUsed"])
        for rel, metadata in manifest["files"].items():
            path = LAYERED / rel
            self.assertTrue(path.exists(), rel)
            self.assertEqual(path.stat().st_size, metadata["sizeBytes"], rel)
            self.assertEqual(sha256_file(path), metadata["sha256"], rel)

    def test_layered_baseline_semantically_matches_current_corpus(self) -> None:
        report = compare(LAYERED, CURRENT)
        self.assertEqual(report["result"], "match")
        self.assertEqual(report["changeCount"], 0)
        self.assertFalse(report["comparisonPolicy"]["allowlistUsed"])

    def test_full_candidate_mutation_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            current = Path(tmp) / "current"
            shutil.copytree(CURRENT, current)
            path = current / "candidates" / "all" / "knu-716-3054.candidates.json"
            document = json.loads(path.read_text(encoding="utf-8"))
            document["candidates"][0]["semanticClassification"]["ruleId"] = "mutated.rule"
            path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            report = compare(LAYERED, current)
            self.assertEqual(report["result"], "different")
            self.assertGreater(report["changeCount"], 0)
            changed = report["sections"]["allCandidates"]["changed"]
            self.assertTrue(any(row["key"] == "cand-knu-716-3054-4182a892bfdaed" for row in changed))

    def test_build_refuses_nonempty_destination_and_policy15_target(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            destination = Path(tmp) / "baseline"
            destination.mkdir()
            (destination / "sentinel").write_text("keep", encoding="utf-8")
            result = subprocess.run(
                [
                    "python3",
                    str(TOOLS / "build_layered_baseline.py"),
                    "--derived",
                    str(CURRENT),
                    "--baseline",
                    str(destination),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertTrue((destination / "sentinel").exists())
        result = subprocess.run(
            [
                "python3",
                str(TOOLS / "build_layered_baseline.py"),
                "--derived",
                str(CURRENT),
                "--baseline",
                str(POLICY15),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)

    def test_policy15_manifest_artifacts_remain_valid(self) -> None:
        manifest = read_json(POLICY15 / "baseline-manifest.json")
        self.assertEqual(manifest["baselineId"], "policy15-corpus-2059-20260712")
        for rel, metadata in manifest["files"].items():
            path = POLICY15 / rel
            self.assertEqual(sha256_file(path), metadata["sha256"], rel)

    def test_decision_record_preserves_dual_baseline_policy(self) -> None:
        decision = read_json(LAYERED / "decision-record.json")
        self.assertEqual(decision["decision"], "create_separate_layered_baseline")
        self.assertFalse(decision["policy15ReplacementPerformed"])
        self.assertFalse(decision["allowlistCreated"])
        self.assertEqual(decision["acceptedPolicy15Differences"]["totalChangeCount"], 304)
        candidates = read_jsonl(LAYERED / "candidates" / "layered-candidates.jsonl")
        self.assertEqual(len(candidates), 1304)
        self.assertTrue(all(isinstance(row.get("applicabilityJudgment"), dict) for row in candidates))
        self.assertTrue(all(isinstance(row.get("publishabilityJudgment"), dict) for row in candidates))


if __name__ == "__main__":
    unittest.main()
