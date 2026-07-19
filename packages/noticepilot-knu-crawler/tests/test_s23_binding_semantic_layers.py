import json
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import noticepilot_local_binder as binding  # noqa: E402
import noticepilot_mvp_policy_pipeline as policy  # noqa: E402
import noticepilot_semantic_classifier as semantic  # noqa: E402
from noticepilot_judgment_models import (  # noqa: E402
    BindingKind,
    TemporalRole,
)

CONFIG = json.loads((ROOT / "configs" / "noticepilot_mvp_policy.v0.1.json").read_text(encoding="utf-8"))


def layer_result(title: str, body: str, board_id: str = "720"):
    published = date(2026, 7, 12)
    segments = policy.STRUCTURE_ANALYZER.analyze(title, body, published)
    segment = next(row for row in segments if row.date_spans and row.segment_type != "title")
    resolution = policy.TEMPORAL_PARSER.resolve(segment.text, published)
    assert resolution is not None
    bound = policy.LOCAL_BINDER.bind_resolution("knu-s23-test", segment, published)
    assert bound is not None
    initial = policy.SEMANTIC_CLASSIFIER.initial_event_type(segment, title, CONFIG)
    classified = policy.SEMANTIC_CLASSIFIER.classify_resolution(
        bound_fact=bound.bound_fact,
        source_segment=segment,
        title=title,
        published=published,
        resolution=resolution,
        policy_config=CONFIG,
        board_id=board_id,
        fallback_event_type=initial,
    )
    return segment, bound, classified


class S23LayerTests(unittest.TestCase):
    def test_runtime_is_wired_to_local_binder(self):
        self.assertIsInstance(policy.LOCAL_BINDER, binding.LocalBinder)
        self.assertEqual(policy.LOCAL_BINDER.version, "0.1.0")

    def test_runtime_is_wired_to_semantic_classifier(self):
        self.assertIsInstance(policy.SEMANTIC_CLASSIFIER, semantic.SemanticClassifier)
        self.assertEqual(policy.SEMANTIC_CLASSIFIER.version, "0.1.0")

    def test_same_label_value_binding_is_high_confidence(self):
        _, bound, _ = layer_result(
            "수강신청 안내",
            "수강신청 기간: 2026. 8. 18. ~ 8. 20.",
        )
        self.assertEqual(bound.bound_fact.binding_kind, BindingKind.SAME_SEGMENT)
        self.assertTrue(bound.bound_fact.locally_grounded)
        self.assertEqual(bound.bound_fact.confidence.value, "high")

    def test_title_date_is_not_locally_grounded(self):
        published = date(2026, 7, 12)
        segment = policy.STRUCTURE_ANALYZER.analyze(
            "수강신청 안내(~8.20)", "세부사항은 첨부파일 참고", published
        )[0]
        bound = policy.LOCAL_BINDER.bind_resolution("knu-s23-title", segment, published)
        self.assertIsNotNone(bound)
        self.assertEqual(bound.bound_fact.binding_kind, BindingKind.TITLE_CONTEXT)
        self.assertFalse(bound.bound_fact.locally_grounded)

    def test_application_period_receives_user_action_role(self):
        _, _, classified = layer_result(
            "장학금 신청 안내",
            "신청기간: 2026. 8. 1. ~ 8. 10.",
            board_id="721",
        )
        self.assertEqual(classified.event_type, "application_period")
        self.assertEqual(classified.temporal_role, TemporalRole.USER_ACTION_PERIOD)

    def test_result_announcement_receives_result_role(self):
        _, _, classified = layer_result(
            "프로그램 모집 안내",
            "최종 발표: 2026. 8. 12.",
            board_id="504",
        )
        self.assertEqual(classified.event_type, "result_announcement")
        self.assertEqual(classified.temporal_role, TemporalRole.RESULT_ANNOUNCEMENT)

    def test_refund_date_receives_reference_role(self):
        _, _, classified = layer_result(
            "수강료 환불 일정 안내",
            "환불 예정일: 2026. 8. 12.",
            board_id="720",
        )
        self.assertEqual(classified.temporal_role, TemporalRole.REFERENCE_DATE)

    def test_shared_leave_return_keeps_two_semantic_classifications(self):
        _, _, classified = layer_result(
            "휴·복학 신청 안내",
            "휴·복학 신청기간: 2026. 8. 1. ~ 8. 20.",
        )
        self.assertEqual(
            set(classified.action_types),
            {"leave_of_absence_application", "return_from_leave_application"},
        )
        self.assertEqual(len(classified.classifications), 2)

    def test_runtime_candidate_contains_s23_judgment_fields(self):
        notice = {
            "noticeId": "knu-720-s23",
            "title": "2026학년도 2학기 수강신청 안내",
            "publishedAt": "2026-07-12",
            "extractedText": "수강신청 기간: 2026. 8. 18. 09:00 ~ 8. 20. 18:00",
            "board": {"boardId": "720", "name": "학사공지", "category": "school_notice"},
            "sourceUrl": "https://example.test/s23",
            "contentHash": "s23",
            "campusScope": {
                "campuses": ["chuncheon"],
                "labels": {"chuncheon": "춘천"},
                "scopeType": "campus_specific",
                "confidence": "high",
                "source": "test",
            },
        }
        decision = policy.evaluate_notice(notice, None, CONFIG)
        candidate = decision["candidates"][0]
        self.assertEqual(candidate["temporalRole"], "user_action_period")
        self.assertEqual(candidate["semanticClassification"]["actionType"], "course_registration")
        self.assertEqual(candidate["boundTemporalFact"]["bindingKind"], "same_segment")
        self.assertTrue(candidate["temporalMention"]["deterministic"])

    def test_s23_audit_cli_exports_no_publishability(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source = tmp_path / "notice.json"
            output = tmp_path / "layers.json"
            source.write_text(json.dumps({
                "noticeId": "knu-720-s23-cli",
                "title": "수강신청 안내",
                "publishedAt": "2026-07-12",
                "board": {"boardId": "720"},
                "extractedText": "수강신청 기간: 2026. 8. 18. ~ 8. 20.",
            }, ensure_ascii=False), encoding="utf-8")
            result = subprocess.run([
                sys.executable,
                str(ROOT / "tools" / "export_s23_layer_documents.py"),
                "--input", str(source),
                "--output", str(output),
            ], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            document = json.loads(output.read_text(encoding="utf-8"))
            self.assertGreater(document["summary"]["boundFactCount"], 0)
            self.assertEqual(
                document["summary"]["temporalRoleCounts"].get("user_action_period"), 1
            )
            encoded = json.dumps(document)
            self.assertNotIn("publishability", encoded)
            self.assertNotIn("includeInCalendarFeed", encoded)

    def test_project_roadmap_marks_s20_through_s23_complete(self):
        status = json.loads((ROOT / "ROADMAP_STATUS.json").read_text(encoding="utf-8"))
        rows = {row["id"]: row["status"] for row in status["steps"]}
        self.assertIn(status["currentStep"], {"S27", "S27-A", "S27-B", "S27-C", "S27-D", "S28", "S29-LIVE-POSTGRES-VERIFY", "S30"})
        self.assertTrue(all(rows[step] == "completed" for step in ("S20", "S21", "S22", "S23", "S24")))
        s24 = next(row for row in status["steps"] if row["id"] == "S24")
        substeps = {row["id"]: row["status"] for row in s24["substeps"]}
        self.assertTrue(all(substeps[step] == "completed" for step in ("S24-A", "S24-B", "S24-C", "S24-D")))

    def test_unconfigured_layers_fail_closed(self):
        binder = binding.LocalBinder()
        with self.assertRaisesRegex(RuntimeError, "local binder is not configured"):
            binder.bind_resolution("x", object(), date(2026, 1, 1))
        classifier = semantic.SemanticClassifier()
        with self.assertRaisesRegex(RuntimeError, "semantic classifier is not configured"):
            classifier.initial_event_type(object(), "", {})


if __name__ == "__main__":
    unittest.main()
