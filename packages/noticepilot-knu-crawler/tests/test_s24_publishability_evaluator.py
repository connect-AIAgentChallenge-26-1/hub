import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import noticepilot_mvp_policy_pipeline as policy  # noqa: E402
import noticepilot_publishability_evaluator as publishability  # noqa: E402

CONFIG = json.loads((ROOT / "configs" / "noticepilot_mvp_policy.v0.1.json").read_text(encoding="utf-8"))


def notice(*, board_id="720", title="테스트 공지", body=""):
    return {
        "noticeId": "knu-s24c-test",
        "title": title,
        "publishedAt": "2026-07-12",
        "extractedText": body,
        "board": {"boardId": board_id, "name": "테스트", "category": "test"},
        "sourceUrl": "https://example.test/s24c",
        "contentHash": "s24c",
        "listMetadata": {},
        "campusScope": {
            "campuses": ["all"],
            "labels": {"all": "전체"},
            "scopeType": "all_campuses",
            "confidence": "high",
            "source": "test",
        },
    }


class S24PublishabilityEvaluatorTests(unittest.TestCase):
    def test_evaluator_is_wired_as_composition_root(self):
        self.assertIsInstance(policy.PUBLISHABILITY_EVALUATOR, publishability.PublishabilityEvaluator)
        self.assertEqual(policy.PUBLISHABILITY_EVALUATOR.version, "0.1.0")

    def test_student_base_projection_preserves_policy15(self):
        projection = policy.PUBLISHABILITY_EVALUATOR.base_projection(
            target_actor="student", event_type="application_period", board_id="720"
        )
        self.assertEqual(projection.pipeline_status, "publishable")
        self.assertEqual(projection.feed_scopes, ("student_default",))
        self.assertEqual(projection.reason_codes, ("student_audience",))

    def test_board716_base_projection_uses_job_feed(self):
        projection = policy.PUBLISHABILITY_EVALUATOR.base_projection(
            target_actor="job_applicant", event_type="job_application_period", board_id="716"
        )
        self.assertEqual(projection.candidate_status, "auto_confirmed")
        self.assertEqual(projection.feed_scopes, ("job_application",))
        self.assertIn("publishability.board716.exact_application_period.auto_confirm", projection.rule_ids)

    def test_mixed_and_unknown_actors_require_review(self):
        for actor, reason in (("mixed", "mixed_audience"), ("unknown", "unknown_audience")):
            projection = policy.PUBLISHABILITY_EVALUATOR.base_projection(
                target_actor=actor, event_type="event", board_id="504"
            )
            self.assertEqual(projection.candidate_status, "needs_review")
            self.assertFalse(projection.include_in_calendar_feed)
            self.assertIn(reason, projection.reason_codes)

    def test_reference_role_demotes_auto_confirmed_candidate(self):
        projection = policy.PUBLISHABILITY_EVALUATOR.evaluate_candidate(
            target_actor="student",
            event_type="event",
            board_id="720",
            temporal_role="reference_date",
            requested_status="publishable",
            requested_feed_scopes=["student_default"],
            reason_codes=["student_audience"],
            confidence="high",
        )
        self.assertEqual(projection.candidate_status, "needs_review")
        self.assertFalse(projection.include_in_calendar_feed)
        self.assertIn("reference_date_not_user_action", projection.reason_codes)
        self.assertIn("publishability.temporal_role.reference_date.review", projection.rule_ids)

    def test_internal_and_conditional_roles_are_explicit_guards(self):
        for role in ("internal_process", "conditional_followup"):
            projection = policy.PUBLISHABILITY_EVALUATOR.evaluate_candidate(
                target_actor="student",
                event_type="submission_period",
                board_id="720",
                temporal_role=role,
                requested_status="publishable",
                requested_feed_scopes=["student_default"],
                reason_codes=["student_audience"],
            )
            self.assertEqual(projection.candidate_status, "needs_review")
            self.assertEqual(projection.feed_scopes, ())

    def test_non_deterministic_temporal_fact_requires_review(self):
        projection = policy.PUBLISHABILITY_EVALUATOR.evaluate_candidate(
            target_actor="student",
            event_type="application_period",
            board_id="720",
            temporal_role="user_action_period",
            requested_status="publishable",
            requested_feed_scopes=["student_default"],
            reason_codes=["student_audience"],
            deterministic=False,
        )
        self.assertEqual(projection.candidate_status, "needs_review")
        self.assertIn("non_deterministic_temporal_fact", projection.reason_codes)
        self.assertIn("publishability.temporal.determinism.review", projection.rule_ids)

    def test_invalid_chronology_requires_review(self):
        projection = policy.PUBLISHABILITY_EVALUATOR.evaluate_candidate(
            target_actor="student",
            event_type="application_period",
            board_id="720",
            temporal_role="user_action_period",
            requested_status="publishable",
            requested_feed_scopes=["student_default"],
            reason_codes=["student_audience"],
            chronology_valid=False,
        )
        self.assertEqual(projection.candidate_status, "needs_review")
        self.assertEqual(projection.confidence, "low")
        self.assertIn("invalid_date_order", projection.reason_codes)

    def test_existing_review_projection_is_not_rewritten_by_role_guard(self):
        projection = policy.PUBLISHABILITY_EVALUATOR.evaluate_candidate(
            target_actor="student",
            event_type="submission_period",
            board_id="720",
            temporal_role="internal_process",
            requested_status="needs_review",
            requested_feed_scopes=[],
            reason_codes=["student_audience", "internal_workflow_deadline"],
            confidence="medium",
        )
        self.assertEqual(
            list(projection.reason_codes),
            ["internal_workflow_deadline", "student_audience"],
        )

    def test_pipeline_keeps_compatibility_fields_without_s24d_runtime_object(self):
        item = notice(
            board_id="720",
            title="장학금 신청 안내",
            body="신청기간: 2026. 7. 12. ~ 2026. 7. 20.",
        )
        candidate = policy.evaluate_notice(item, None, CONFIG)["candidates"][0]
        self.assertEqual(candidate["status"], "auto_confirmed")
        self.assertTrue(candidate["includeInCalendarFeed"])
        self.assertEqual(candidate["feedScopes"], ["student_default"])
        self.assertEqual(candidate["publishabilityJudgment"]["verdict"], "auto_confirmed")
        self.assertTrue(candidate["publishabilityJudgment"]["includeInCalendarFeed"])

    def test_demote_wrapper_routes_through_evaluator(self):
        candidate = {
            "id": "cand-test",
            "sourceNoticeId": "knu-720-test",
            "targetActor": "student",
            "eventType": "application_period",
            "temporalRole": "user_action_period",
            "normalizedStart": "2026-07-12",
            "normalizedEnd": "2026-07-20",
            "isAllDay": True,
            "temporalMention": {"deterministic": True},
            "status": "auto_confirmed",
            "includeInCalendarFeed": True,
            "feedScopes": ["student_default"],
            "confidence": "high",
            "reasonCodes": ["student_audience"],
            "uncertaintyReasons": [],
        }
        policy.demote_candidate_for_review(candidate, "date_may_change")
        self.assertEqual(candidate["status"], "needs_review")
        self.assertFalse(candidate["includeInCalendarFeed"])
        self.assertEqual(candidate["feedScopes"], [])
        self.assertIn("date_may_change", candidate["reasonCodes"])

    def test_full_corpus_publishability_audit_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "audit.json"
            result = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "tools" / "audit_s24_publishability_evaluator.py"),
                    "--baseline", str(ROOT / "baseline" / "policy15"),
                    "--current", str(ROOT / "derived" / "mvp-policy-v0.1"),
                    "--output", str(output),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(report["result"], "pass")
            self.assertEqual(report["checks"]["publishabilityJudgmentReconstructionCount"], 1304)
            self.assertTrue(report["checks"]["runtimeWiringCompletedInS24D"])
            self.assertEqual(report["checks"]["runtimePublishabilityJudgmentFieldCount"], 1304)


if __name__ == "__main__":
    unittest.main()
