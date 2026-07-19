import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import noticepilot_applicability_evaluator as applicability  # noqa: E402
import noticepilot_mvp_policy_pipeline as policy  # noqa: E402

CONFIG = json.loads((ROOT / "configs" / "noticepilot_mvp_policy.v0.1.json").read_text(encoding="utf-8"))


def notice(*, board_id="720", title="테스트 공지", body=""):
    return {
        "noticeId": "knu-s24b-test",
        "title": title,
        "publishedAt": "2026-07-12",
        "extractedText": body,
        "board": {"boardId": board_id, "name": "테스트", "category": "test"},
        "sourceUrl": "https://example.test/s24b",
        "contentHash": "s24b",
        "listMetadata": {},
        "campusScope": {
            "campuses": ["all"],
            "labels": {"all": "전체"},
            "scopeType": "all_campuses",
            "confidence": "high",
            "source": "test",
        },
    }


class S24ApplicabilityEvaluatorTests(unittest.TestCase):
    def test_evaluator_is_wired_as_composition_root(self):
        self.assertIsInstance(policy.APPLICABILITY_EVALUATOR, applicability.ApplicabilityEvaluator)
        self.assertEqual(policy.APPLICABILITY_EVALUATOR.version, "0.1.0")

    def test_board_actor_inference_preserves_policy15_projection(self):
        student = policy.infer_audience(notice(board_id="720"), CONFIG)
        job = policy.infer_audience(notice(board_id="716"), CONFIG)
        self.assertEqual(student, {"primary": "student", "confidence": "high", "evidence": ["board:720"]})
        self.assertEqual(job, {"primary": "job_applicant", "confidence": "high", "evidence": ["board:716"]})

    def test_mixed_actor_is_unknown_scope(self):
        item = notice(
            board_id="504",
            title="학생 및 교직원 참여 안내",
            body="학생과 교직원이 함께 참여합니다.",
        )
        audience = policy.infer_audience(item, CONFIG)
        judgment = policy.APPLICABILITY_EVALUATOR.evaluate_projection(
            target_actor=audience["primary"],
            audience_rules=policy.build_audience_rules("", item["title"], None),
            actor_confidence=audience["confidence"],
        )
        self.assertEqual(audience["primary"], "mixed")
        self.assertEqual(judgment.to_dict()["scope"], "unknown")

    def test_explicit_course_dimensions_are_profile_scoped(self):
        judgment = policy.APPLICABILITY_EVALUATOR.evaluate_candidate(
            target_actor="student",
            segment="3학년 학부생 수강신청 기간",
            title="2026학년도 2학기 학부 수강신청 안내",
            action_type="course_registration",
            explicit_label="3학년 학부생",
            event_type="academic_period",
        )
        encoded = judgment.to_dict()
        self.assertEqual(encoded["scope"], "profile_scoped")
        self.assertEqual(encoded["audienceRules"]["studentYears"], [3])
        self.assertEqual(encoded["audienceRules"]["degreeLevels"], ["undergraduate"])
        self.assertEqual(encoded["ruleId"], "applicability.profile.explicit_dimensions")

    def test_non_academic_eligibility_does_not_over_scope_candidate(self):
        judgment = policy.APPLICABILITY_EVALUATOR.evaluate_candidate(
            target_actor="student",
            segment="4학년 우선 선발, 신청기한 2026. 7. 20.",
            title="재학생 프로그램 모집",
            action_type=None,
            event_type="application_period",
        )
        encoded = judgment.to_dict()
        self.assertEqual(encoded["scope"], "unrestricted")
        self.assertFalse(encoded["audienceRules"]["personalizationReady"])
        self.assertEqual(encoded["audienceRules"]["studentYears"], [])

    def test_leave_and_return_actions_own_enrollment_status(self):
        leave = policy.build_audience_rules("휴학 신청기간", "휴학 신청 안내", "leave_of_absence_application")
        returning = policy.build_audience_rules("복학 신청기간", "복학 신청 안내", "return_from_leave_application")
        self.assertEqual(leave["enrollmentStatuses"], ["enrolled"])
        self.assertEqual(returning["enrollmentStatuses"], ["on_leave"])

    def test_selected_participant_action_is_conditional_scope(self):
        judgment = policy.APPLICABILITY_EVALUATOR.evaluate_candidate(
            target_actor="student",
            segment="추천 대상자로 선정된 지원자는 서류를 추가 제출",
            title="장학생 선발 안내",
            action_type=None,
            local_context="추천 대상자로 선정된 지원자는 서류를 추가 제출",
            event_type="submission_period",
        )
        encoded = judgment.to_dict()
        self.assertEqual(encoded["scope"], "conditional")
        self.assertIn("conditional_selected_participant_action", encoded["reasonCodes"])
        self.assertEqual(encoded["ruleId"], "applicability.conditional.selected_participant")

    def test_post_result_followup_projection_is_conditional_scope(self):
        rules = policy.build_audience_rules("서류 추가 제출", "선발 결과 안내", None)
        judgment = policy.APPLICABILITY_EVALUATOR.evaluate_projection(
            target_actor="student",
            audience_rules=rules,
            reason_codes=["post_result_selected_participant_action"],
        )
        encoded = judgment.to_dict()
        self.assertEqual(encoded["scope"], "conditional")
        self.assertIn("post_result_selected_participant_action", encoded["reasonCodes"])

    def test_result_announcement_is_not_reclassified_as_conditional(self):
        judgment = policy.APPLICABILITY_EVALUATOR.evaluate_candidate(
            target_actor="student",
            segment="최종 합격자 발표",
            title="최종 합격자 발표 안내",
            action_type=None,
            local_context="최종 합격자 발표",
            event_type="result_announcement",
        )
        self.assertEqual(judgment.to_dict()["scope"], "unrestricted")

    def test_pipeline_keeps_compatibility_fields_without_s24d_runtime_object(self):
        item = notice(
            board_id="720",
            title="2026학년도 2학기 학부 수강신청 안내",
            body="3학년 수강신청 기간: 2026. 8. 19.",
        )
        candidate = policy.evaluate_notice(item, None, CONFIG)["candidates"][0]
        self.assertEqual(candidate["targetActor"], "student")
        self.assertEqual(candidate["audienceRules"]["studentYears"], [3])
        self.assertEqual(candidate["applicabilityJudgment"]["targetActor"], "student")
        self.assertEqual(candidate["applicabilityJudgment"]["scope"], "profile_scoped")

    def test_full_corpus_applicability_audit_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "audit.json"
            result = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "tools" / "audit_s24_applicability_evaluator.py"),
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
            self.assertEqual(report["checks"]["applicabilityJudgmentReconstructionCount"], 1304)
            self.assertTrue(report["checks"]["runtimeWiringCompletedInS24D"])
            self.assertEqual(report["checks"]["runtimeApplicabilityJudgmentFieldCount"], 1304)


if __name__ == "__main__":
    unittest.main()
