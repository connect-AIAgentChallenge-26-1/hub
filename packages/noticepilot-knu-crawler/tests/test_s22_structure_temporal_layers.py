import subprocess
import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import noticepilot_mvp_policy_pipeline as policy  # noqa: E402
import noticepilot_structure_analyzer as structure  # noqa: E402
import noticepilot_temporal_parser as temporal  # noqa: E402
from noticepilot_judgment_models import TemporalMention  # noqa: E402


class S22LayerExtractionTests(unittest.TestCase):
    def test_runtime_is_wired_to_extracted_temporal_layer(self):
        self.assertIsInstance(policy.TEMPORAL_PARSER, temporal.TemporalParser)
        self.assertIs(policy.resolve_date, temporal.resolve_date)
        self.assertIs(policy.parse_date_tokens, temporal.parse_date_tokens)
        self.assertEqual(policy.TEMPORAL_PARSER.version, "0.1.0")

    def test_runtime_is_wired_to_extracted_structure_layer(self):
        self.assertIsInstance(policy.STRUCTURE_ANALYZER, structure.StructureAnalyzer)
        self.assertIs(policy.ScheduleSegment, structure.ScheduleSegment)
        self.assertEqual(policy.STRUCTURE_ANALYZER.version, "0.1.0")

    def test_temporal_parser_preserves_policy15_range_semantics(self):
        result = policy.TEMPORAL_PARSER.resolve(
            "신청기간: 2026. 8. 18. 09:00 ~ 8. 20. 18:00",
            date(2026, 7, 12),
        )
        self.assertIsNotNone(result)
        self.assertEqual(result.start, "2026-08-18T09:00:00+09:00")
        self.assertEqual(result.end, "2026-08-20T18:00:00+09:00")
        self.assertEqual(result.kind, "absolute_range")

    def test_temporal_parser_projects_s21_contract_without_policy_decision(self):
        mention = policy.TEMPORAL_PARSER.to_temporal_mention(
            "seg-s22",
            "수강신청 기간: 2026. 8. 18. ~ 8. 20.",
            date(2026, 7, 12),
        )
        self.assertIsInstance(mention, TemporalMention)
        self.assertEqual(mention.segment_id, "seg-s22")
        self.assertEqual(mention.normalized_start, "2026-08-18")
        self.assertEqual(mention.normalized_end, "2026-08-20")
        self.assertTrue(mention.deterministic)

    def test_structure_analyzer_preserves_continuation_ownership(self):
        segments = policy.STRUCTURE_ANALYZER.analyze(
            "휴학 신청 안내",
            "휴학 신청기간:\n2026. 8. 13. ~ 8. 31.",
            date(2026, 7, 12),
        )
        continuation = [row for row in segments if row.segment_type == "continuation"]
        self.assertEqual(len(continuation), 1)
        self.assertTrue(continuation[0].locally_grounded)
        self.assertIn("leave_of_absence_application", continuation[0].action_signals)

    def test_structure_analyzer_preserves_flattened_course_rows(self):
        body = """학년
수강신청 일정
1·4
2.20.(금) 10:00~13:00
2·3
2.20.(금) 14:00~17:00
전체
2.21.(토) 10:00
~
2.25.(수) 18:00"""
        segments = policy.STRUCTURE_ANALYZER.analyze(
            "2026학년도 1학기 수강신청 안내", body, date(2026, 2, 1)
        )
        rows = [row for row in segments if row.segment_type == "table_row"]
        self.assertEqual(len(rows), 3)
        labels = {signal for row in rows for signal in row.audience_signals}
        self.assertTrue({"student_year:1", "student_year:2", "student_year:3", "student_year:4"}.issubset(labels))

    def test_compatibility_wrapper_matches_analyzer_output(self):
        title = "복학 신청 안내"
        body = "복학 신청기간:\n2026. 7. 13. ~ 8. 31."
        direct = policy.STRUCTURE_ANALYZER.analyze(title, body, date(2026, 7, 1))
        wrapped = policy.build_schedule_segments(title, body, date(2026, 7, 1))
        self.assertEqual(
            [row.source_metadata() | {"text": row.text} for row in direct],
            [row.source_metadata() | {"text": row.text} for row in wrapped],
        )


    def test_layer_audit_cli_exports_without_policy_decision(self):
        import json
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source = tmp_path / "notice.json"
            output = tmp_path / "layers.json"
            source.write_text(json.dumps({
                "noticeId": "knu-720-s22",
                "title": "수강신청 안내",
                "publishedAt": "2026-07-12",
                "extractedText": "수강신청 기간: 2026. 8. 18. ~ 8. 20."
            }, ensure_ascii=False), encoding="utf-8")
            result = subprocess.run([
                sys.executable, str(ROOT / "tools" / "export_s22_layer_documents.py"),
                "--input", str(source), "--output", str(output)
            ], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            document = json.loads(output.read_text(encoding="utf-8"))
            self.assertGreater(document["summary"]["segmentCount"], 0)
            self.assertGreater(document["summary"]["temporalMentionCount"], 0)
            self.assertNotIn("publishability", document)
            self.assertNotIn("includeInCalendarFeed", json.dumps(document))

    def test_unconfigured_temporal_module_fails_closed(self):
        code = (
            "from datetime import date; "
            "import noticepilot_temporal_parser as m; "
            "m.TemporalParser().resolve('2026.8.18.', date(2026,7,1))"
        )
        result = subprocess.run(
            [sys.executable, "-c", code],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("temporal parser is not configured", result.stderr)


if __name__ == "__main__":
    unittest.main()
