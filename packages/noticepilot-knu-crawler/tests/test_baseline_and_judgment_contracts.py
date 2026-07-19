import copy
import json
import shutil
import sys
import tempfile
import unittest
from dataclasses import FrozenInstanceError
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from baseline_common import read_json, read_jsonl, sha256_file  # noqa: E402
from compare_policy_baseline import compare  # noqa: E402
from noticepilot_judgment_models import (  # noqa: E402
    ApplicabilityJudgment,
    ApplicabilityScope,
    BindingKind,
    BoundTemporalFact,
    Confidence,
    ContractError,
    JudgmentLayer,
    JudgmentRecord,
    JudgmentTrace,
    JudgmentVerdict,
    PublishabilityJudgment,
    SourceLocation,
    ScheduleSegment,
    SemanticClassification,
    TemporalMention,
    TemporalRole,
    legacy_candidate_to_judgment_trace,
)


BASELINE = ROOT / "baseline" / "policy15"


class Policy15BaselineTests(unittest.TestCase):
    def test_manifest_hashes_match_embedded_artifacts(self):
        manifest = read_json(BASELINE / "baseline-manifest.json")
        self.assertEqual(manifest["counts"]["processedNoticeCount"], 2059)
        self.assertEqual(manifest["counts"]["publishableCandidateCount"], 909)
        self.assertEqual(manifest["counts"]["studentIcsEventCount"], 609)
        self.assertEqual(manifest["counts"]["jobIcsEventCount"], 300)
        for rel, metadata in manifest["files"].items():
            path = BASELINE / rel
            self.assertTrue(path.exists(), rel)
            self.assertEqual(path.stat().st_size, metadata["sizeBytes"], rel)
            self.assertEqual(sha256_file(path), metadata["sha256"], rel)

    def test_baseline_semantically_matches_itself(self):
        report = compare(BASELINE, BASELINE, None)
        self.assertEqual(report["result"], "match")
        self.assertEqual(report["changeCount"], 0)

    def test_candidate_mutation_is_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            current = Path(tmp) / "current"
            shutil.copytree(BASELINE, current)
            path = current / "decisions" / "publishable-candidates.jsonl"
            rows = read_jsonl(path)
            rows[0]["eventType"] = "mutated_event_type"
            with path.open("w", encoding="utf-8") as f:
                for row in rows:
                    f.write(json.dumps(row, ensure_ascii=False) + "\n")
            report = compare(BASELINE, current, None)
            self.assertEqual(report["result"], "different")
            self.assertGreater(report["changeCount"], 0)
            changes = report["sections"]["publishableCandidates"]["changed"]
            self.assertTrue(changes)

    def test_regression_cases_cover_critical_academic_notices(self):
        cases = read_jsonl(BASELINE / "regression-cases.jsonl")
        ids = {row["sourceNoticeId"] for row in cases}
        self.assertTrue({"knu-720-2465", "knu-720-2352", "knu-720-2423", "knu-720-2343"}.issubset(ids))


class JudgmentContractTests(unittest.TestCase):
    def test_structure_temporal_and_binding_contracts(self):
        segment = ScheduleSegment(
            segment_id="seg-1",
            segment_type="label_value",
            label_text="수강신청 기간",
            body_text="2026. 8. 18. ~ 8. 20.",
            source_location=SourceLocation(line_index=2, clause_index=0),
            ownership_confidence=Confidence.HIGH,
            action_signals=("course_registration",),
        )
        mention = TemporalMention(
            mention_id="tm-1",
            segment_id=segment.segment_id,
            raw_text="2026. 8. 18. ~ 8. 20.",
            normalized_start="2026-08-18",
            normalized_end="2026-08-20",
            resolution_kind="absolute_range",
            deterministic=True,
        )
        fact = BoundTemporalFact(
            fact_id="fact-1",
            source_notice_id="knu-720-1",
            segment_id=segment.segment_id,
            temporal_mention_ids=(mention.mention_id,),
            binding_kind=BindingKind.SAME_SEGMENT,
            confidence=Confidence.HIGH,
            rule_id="same-label-value",
            locally_grounded=True,
            label_text=segment.label_text,
        )
        self.assertEqual(segment.to_dict()["segmentId"], "seg-1")
        self.assertEqual(mention.to_dict()["normalizedStart"], "2026-08-18")
        self.assertEqual(fact.to_dict()["bindingKind"], "same_segment")

    def test_deterministic_mention_requires_start(self):
        with self.assertRaises(ContractError):
            TemporalMention(
                mention_id="tm-1",
                segment_id="seg-1",
                raw_text="8월 중",
                normalized_start=None,
                normalized_end=None,
                resolution_kind="vague",
                deterministic=True,
            )

    def test_publishability_invariant(self):
        ok = PublishabilityJudgment(
            verdict=JudgmentVerdict.AUTO_CONFIRMED,
            include_in_calendar_feed=True,
            reason_codes=("student_action",),
            rule_ids=("publish.user-action",),
        )
        self.assertTrue(ok.to_dict()["includeInCalendarFeed"])
        with self.assertRaises(ContractError):
            PublishabilityJudgment(
                verdict=JudgmentVerdict.NEEDS_REVIEW,
                include_in_calendar_feed=True,
                reason_codes=(),
                rule_ids=("invalid",),
            )

    def test_trace_layer_order_is_enforced(self):
        semantic = JudgmentRecord(
            layer=JudgmentLayer.SEMANTIC_CLASSIFICATION,
            verdict=JudgmentVerdict.CLASSIFIED,
            rule_id="semantic",
            confidence=Confidence.HIGH,
        )
        structure = JudgmentRecord(
            layer=JudgmentLayer.STRUCTURE,
            verdict=JudgmentVerdict.OBSERVED,
            rule_id="structure",
            confidence=Confidence.HIGH,
        )
        with self.assertRaises(ContractError):
            JudgmentTrace(
                trace_id="trace-1",
                source_notice_id="knu-1",
                candidate_id="cand-1",
                engine_versions={"contract": "0.1.0"},
                judgments=(semantic, structure),
                final_decision={},
            )

    def test_contract_objects_are_immutable(self):
        classification = SemanticClassification(
            event_type="academic_period",
            action_type="course_evaluation",
            temporal_role=TemporalRole.USER_ACTION_PERIOD,
            confidence=Confidence.HIGH,
            rule_id="course-evaluation.explicit",
        )
        with self.assertRaises(FrozenInstanceError):
            classification.event_type = "event"  # type: ignore[misc]

    def test_nested_judgment_payloads_are_immutable(self):
        applicability = ApplicabilityJudgment(
            target_actor="student",
            scope=ApplicabilityScope.PROFILE_SCOPED,
            audience_rules={"studentYears": [1, 4]},
            confidence=Confidence.HIGH,
            rule_id="year-scope",
        )
        with self.assertRaises(TypeError):
            applicability.audience_rules["studentYears"] = [2]  # type: ignore[index]
        with self.assertRaises(TypeError):
            applicability.audience_rules["studentYears"][0] = 2  # type: ignore[index]
        self.assertEqual(applicability.to_dict()["audienceRules"]["studentYears"], [1, 4])

    def test_legacy_adapter_preserves_policy15_decision_without_role_guess(self):
        candidate = read_jsonl(BASELINE / "decisions" / "publishable-candidates.jsonl")[0]
        trace = legacy_candidate_to_judgment_trace(candidate)
        encoded = trace.to_dict()
        self.assertEqual(encoded["candidateId"], candidate["id"])
        self.assertEqual(encoded["finalDecision"]["status"], candidate["status"])
        self.assertEqual(encoded["finalDecision"]["includeInCalendarFeed"], candidate["includeInCalendarFeed"])
        semantic = next(row for row in encoded["judgments"] if row["layer"] == "semantic_classification")
        self.assertEqual(semantic["output"]["temporalRole"], "unknown")
        self.assertFalse(encoded["metadata"]["semanticMigrationComplete"])

    def test_all_publishable_candidates_adapt_to_traces(self):
        candidates = read_jsonl(BASELINE / "decisions" / "publishable-candidates.jsonl")
        traces = [legacy_candidate_to_judgment_trace(candidate) for candidate in candidates]
        self.assertEqual(len(traces), 909)
        self.assertEqual(len({trace.trace_id for trace in traces}), 909)

    def test_json_schema_documents_are_valid_json(self):
        schema_dir = ROOT / "schemas" / "judgment"
        schemas = sorted(schema_dir.glob("*.schema.json"))
        self.assertGreaterEqual(len(schemas), 7)
        for path in schemas:
            value = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(value["$schema"], "https://json-schema.org/draft/2020-12/schema")
            self.assertIn("$id", value)


if __name__ == "__main__":
    unittest.main()
