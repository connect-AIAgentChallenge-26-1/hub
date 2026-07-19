from __future__ import annotations

import copy
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

import noticepilot_mvp_policy_pipeline as policy
from noticepilot_runtime_judgment_wiring import RuntimeJudgmentWiring

ROOT = Path(__file__).resolve().parents[1]


class S24RuntimeJudgmentWiringTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = json.loads((ROOT / "configs" / "noticepilot_mvp_policy.v0.1.json").read_text())

    def test_runtime_candidate_serializes_both_judgments(self) -> None:
        notice = {
            "noticeId": "test-s24d-runtime",
            "title": "3학년 수강신청 안내",
            "publishedAt": "2026-07-01",
            "sourceUrl": "https://example.test/notice",
            "contentHash": "hash",
            "board": {"boardId": "720", "category": "academic_notice", "name": "학사공지"},
            "extractedText": "3학년 수강신청 기간: 2026. 7. 10. ~ 2026. 7. 12.",
        }
        decision = policy.evaluate_notice(notice, None, self.config)
        candidate = decision["candidates"][0]
        self.assertEqual(candidate["applicabilityJudgment"]["targetActor"], candidate["targetActor"])
        self.assertEqual(candidate["applicabilityJudgment"]["audienceRules"], candidate["audienceRules"])
        self.assertEqual(candidate["publishabilityJudgment"]["verdict"], candidate["status"])
        self.assertEqual(
            candidate["publishabilityJudgment"]["includeInCalendarFeed"],
            candidate["includeInCalendarFeed"],
        )
        self.assertEqual(candidate["publishabilityJudgment"]["reasonCodes"], candidate["reasonCodes"])

    def test_runtime_wiring_is_idempotent_and_projection_safe(self) -> None:
        candidate = {
            "id": "cand-idempotent",
            "targetActor": "student",
            "audienceRules": {
                "degreeLevels": [], "studentYears": [], "enrollmentStatuses": [],
                "admissionTypes": [], "matchMode": "all_dimensions",
                "personalizationReady": False, "confidence": "none", "evidence": [],
            },
            "reasonCodes": ["student_audience"],
            "eventType": "application_period",
            "temporalRole": "user_action_period",
            "status": "auto_confirmed",
            "includeInCalendarFeed": True,
            "feedScopes": ["student_default"],
            "confidence": "high",
            "normalizedStart": "2026-07-10",
            "normalizedEnd": "2026-07-12",
            "isAllDay": True,
            "temporalMention": {"deterministic": True},
        }
        wiring = RuntimeJudgmentWiring()
        wiring.wire_candidate(candidate)
        first = copy.deepcopy(candidate)
        wiring.wire_candidate(candidate)
        self.assertEqual(candidate, first)

    def test_review_demotion_refreshes_publishability_judgment(self) -> None:
        candidate = {
            "id": "cand-demotion",
            "targetActor": "student",
            "audienceRules": {"confidence": "none"},
            "reasonCodes": ["student_audience"],
            "eventType": "application_period",
            "temporalRole": "user_action_period",
            "status": "auto_confirmed",
            "includeInCalendarFeed": True,
            "feedScopes": ["student_default"],
            "confidence": "high",
            "normalizedStart": "2026-07-10",
            "normalizedEnd": "2026-07-12",
            "isAllDay": True,
            "temporalMention": {"deterministic": True},
        }
        RuntimeJudgmentWiring().wire_candidate(candidate)
        policy.demote_candidate_for_review(candidate, "date_may_change")
        self.assertEqual(candidate["status"], "needs_review")
        self.assertEqual(candidate["publishabilityJudgment"]["verdict"], "needs_review")
        self.assertIn("date_may_change", candidate["publishabilityJudgment"]["reasonCodes"])

    def test_post_result_reason_refreshes_conditional_applicability(self) -> None:
        notice = {
            "noticeId": "test-s24d-result",
            "title": "합격자 발표 및 합격자 서류 제출 안내",
            "publishedAt": "2026-07-01",
            "sourceUrl": "https://example.test/result",
            "contentHash": "hash",
            "board": {"boardId": "720", "category": "academic_notice", "name": "학사공지"},
            "extractedText": "합격자는 2026. 7. 15.까지 서류를 제출해야 합니다.",
        }
        decision = policy.evaluate_notice(notice, None, self.config)
        for candidate in decision["candidates"]:
            self.assertEqual(candidate["applicabilityJudgment"]["scope"], "conditional")
            self.assertEqual(candidate["publishabilityJudgment"]["verdict"], "needs_review")

    def test_roadmap_marks_s24_complete_after_s25(self) -> None:
        status = json.loads((ROOT / "ROADMAP_STATUS.json").read_text())
        steps = {row["id"]: row for row in status["steps"]}
        self.assertEqual(steps["S24"]["status"], "completed")
        substeps = {row["id"]: row for row in steps["S24"]["substeps"]}
        self.assertEqual(substeps["S24-D"]["status"], "completed")
        self.assertIn(status["currentStep"], {"S27", "S27-A", "S27-B", "S27-C", "S27-D", "S28", "S29-LIVE-POSTGRES-VERIFY", "S30"})

    def test_s24d_full_corpus_audit_cli(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "audit.json"
            result = subprocess.run(
                [
                    "python3", str(ROOT / "tools" / "audit_s24_runtime_judgment_wiring.py"),
                    "--baseline", str(ROOT / "baseline" / "policy15"),
                    "--current", str(ROOT / "derived" / "mvp-policy-v0.1"),
                    "--output", str(output),
                ],
                capture_output=True, text=True, check=False,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            report = json.loads(output.read_text())
            self.assertEqual(report["result"], "pass")
            self.assertEqual(report["checks"]["runtimeApplicabilityJudgmentFieldCount"], 1304)
            self.assertEqual(report["checks"]["runtimePublishabilityJudgmentFieldCount"], 1304)
            self.assertEqual(report["checks"]["crossArtifactJudgmentMismatchCount"], 0)


if __name__ == "__main__":
    unittest.main()
