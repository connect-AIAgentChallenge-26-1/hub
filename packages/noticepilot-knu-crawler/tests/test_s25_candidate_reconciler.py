from __future__ import annotations

import copy
import json
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

import noticepilot_mvp_policy_pipeline as policy
from noticepilot_candidate_reconciler import CandidateReconciler, ReconciliationReport

ROOT = Path(__file__).resolve().parents[1]


class S25CandidateReconcilerTests(unittest.TestCase):
    def base(self, **overrides):
        candidate = {
            "id": "candidate",
            "normalizedStart": "2026-07-10",
            "normalizedEnd": "2026-07-10",
            "isAllDay": True,
            "feedScopes": ["student_default"],
            "eventType": "application_period",
            "actionType": None,
            "targetActor": "student",
            "audienceRules": {
                "degreeLevels": [], "studentYears": [], "enrollmentStatuses": [],
                "admissionTypes": [], "matchMode": "all_dimensions",
                "personalizationReady": False, "confidence": "none", "evidence": [],
            },
            "reasonCodes": ["student_audience"],
            "uncertaintyReasons": [],
            "status": "auto_confirmed",
            "includeInCalendarFeed": True,
            "confidence": "high",
            "evidence": "신청기간: 2026. 7. 10.",
            "temporalRole": "user_action_period",
            "temporalMention": {"deterministic": True},
        }
        candidate.update(overrides)
        policy.RUNTIME_JUDGMENT_WIRING.wire_candidate(candidate)
        return candidate

    def test_composition_root_is_standalone_reconciler(self):
        self.assertIsInstance(policy.CANDIDATE_RECONCILER, CandidateReconciler)
        self.assertEqual(policy.CANDIDATE_RECONCILER.version, "0.1.0")

    def test_runtime_extraction_uses_one_canonical_reconcile_call(self):
        config = json.loads((ROOT / "configs" / "noticepilot_mvp_policy.v0.1.json").read_text())
        notice = {
            "noticeId": "test-s25-runtime",
            "title": "수강신청 안내",
            "publishedAt": "2026-07-01",
            "sourceUrl": "https://example.test/s25",
            "contentHash": "hash",
            "board": {"boardId": "720", "category": "academic_notice", "name": "학사공지"},
            "extractedText": "수강신청 기간: 2026. 7. 10. ~ 2026. 7. 12.",
        }
        with patch.object(
            policy.CANDIDATE_RECONCILER,
            "reconcile",
            wraps=policy.CANDIDATE_RECONCILER.reconcile,
        ) as reconciler:
            decision = policy.evaluate_notice(notice, None, config)
        self.assertTrue(decision["candidates"])
        reconciler.assert_called_once()

    def test_reconcile_report_sums_all_phases(self):
        all_day = self.base(id="all-day")
        timed = self.base(
            id="timed", normalizedStart="2026-07-10T18:00:00+09:00",
            normalizedEnd=None, isAllDay=False,
        )
        reconciled, report = policy.CANDIDATE_RECONCILER.reconcile([all_day, timed])
        self.assertEqual([row["id"] for row in reconciled], ["timed"])
        self.assertIsInstance(report, ReconciliationReport)
        self.assertEqual(report.input_count, 2)
        self.assertEqual(report.output_count, 1)
        self.assertEqual(report.removed_count, 1)
        self.assertEqual(report.same_day_precision_removed_count, 1)

    def test_typed_academic_candidate_replaces_generic_duplicate(self):
        generic = self.base(
            id="generic", eventType="academic_period", actionType=None,
            evidence="수강신청 기간: 2026. 7. 10.",
            sourceSegment={"labelText": "수강신청 기간"},
        )
        typed = self.base(
            id="typed", eventType="academic_period", actionType="course_registration",
            evidence="수강신청 기간: 2026. 7. 10.",
            sourceSegment={"labelText": "수강신청 기간"},
        )
        kept, removed = policy.CANDIDATE_RECONCILER.consolidate_same_datetime([generic, typed])
        self.assertEqual(removed, 1)
        self.assertEqual([row["id"] for row in kept], ["typed"])

    def test_distinct_cohorts_are_preserved(self):
        third = self.base(
            id="third", actionType="course_registration",
            audienceRules={
                "degreeLevels": ["undergraduate"], "studentYears": [3],
                "enrollmentStatuses": [], "admissionTypes": [],
                "matchMode": "all_dimensions", "personalizationReady": True,
                "confidence": "high", "evidence": ["3학년"],
            },
        )
        fourth = copy.deepcopy(third)
        fourth["id"] = "fourth"
        fourth["audienceRules"]["studentYears"] = [4]
        fourth["audienceRules"]["evidence"] = ["4학년"]
        policy.RUNTIME_JUDGMENT_WIRING.wire_candidate(fourth)
        kept, removed = policy.CANDIDATE_RECONCILER.consolidate_same_datetime([third, fourth])
        self.assertEqual(removed, 0)
        self.assertEqual({row["id"] for row in kept}, {"third", "fourth"})

    def test_scoped_candidate_replaces_unscoped_same_action(self):
        unscoped = self.base(id="unscoped", actionType="course_registration")
        scoped = copy.deepcopy(unscoped)
        scoped["id"] = "scoped"
        scoped["audienceRules"]["studentYears"] = [4]
        scoped["audienceRules"]["personalizationReady"] = True
        policy.RUNTIME_JUDGMENT_WIRING.wire_candidate(scoped)
        kept, removed = policy.CANDIDATE_RECONCILER.consolidate_same_datetime([unscoped, scoped])
        self.assertEqual(removed, 1)
        self.assertEqual([row["id"] for row in kept], ["scoped"])

    def test_distinct_actions_are_preserved(self):
        leave = self.base(id="leave", actionType="leave_of_absence_application")
        returning = self.base(id="return", actionType="return_from_leave_application")
        kept, removed = policy.CANDIDATE_RECONCILER.consolidate_same_datetime([leave, returning])
        self.assertEqual(removed, 0)
        self.assertEqual({row["id"] for row in kept}, {"leave", "return"})

    def test_timed_precision_reason_refreshes_runtime_judgment(self):
        all_day = self.base(id="all-day")
        timed = self.base(
            id="timed", normalizedStart="2026-07-10T18:00:00+09:00",
            normalizedEnd=None, isAllDay=False,
        )
        kept, removed = policy.CANDIDATE_RECONCILER.consolidate_same_day_precision([all_day, timed])
        self.assertEqual(removed, 1)
        self.assertIn("same_day_precision_candidates_consolidated", kept[0]["reasonCodes"])
        self.assertEqual(
            kept[0]["publishabilityJudgment"]["reasonCodes"], kept[0]["reasonCodes"]
        )

    def test_range_boundary_single_is_removed(self):
        period = self.base(
            id="range", normalizedStart="2026-07-01", normalizedEnd="2026-07-15"
        )
        boundary = self.base(id="boundary", normalizedStart="2026-07-15", normalizedEnd="2026-07-15")
        kept, removed, conflicts = policy.CANDIDATE_RECONCILER.consolidate_same_action_ranges([period, boundary])
        self.assertEqual((removed, conflicts), (1, 0))
        self.assertEqual([row["id"] for row in kept], ["range"])
        self.assertEqual(kept[0]["publishabilityJudgment"]["reasonCodes"], kept[0]["reasonCodes"])

    def test_interior_same_action_date_is_demoted_and_synchronized(self):
        period = self.base(
            id="range", normalizedStart="2026-07-01", normalizedEnd="2026-07-15"
        )
        interior = self.base(id="interior", normalizedStart="2026-07-10", normalizedEnd="2026-07-10")
        kept, removed, conflicts = policy.CANDIDATE_RECONCILER.consolidate_same_action_ranges([period, interior])
        self.assertEqual((removed, conflicts), (0, 1))
        for row in kept:
            self.assertEqual(row["status"], "needs_review")
            self.assertFalse(row["includeInCalendarFeed"])
            self.assertEqual(row["publishabilityJudgment"]["verdict"], "needs_review")
            self.assertIn("conflicting_same_action_dates", row["reasonCodes"])

    def test_second_pass_is_idempotent_for_reconciled_candidates(self):
        period = self.base(
            id="range", normalizedStart="2026-07-01", normalizedEnd="2026-07-15"
        )
        boundary = self.base(id="boundary", normalizedStart="2026-07-15", normalizedEnd="2026-07-15")
        first, _ = policy.CANDIDATE_RECONCILER.reconcile([period, boundary])
        second, report = policy.CANDIDATE_RECONCILER.reconcile(copy.deepcopy(first))
        self.assertEqual(report.removed_count, 0)
        self.assertEqual(first, second)

    def test_roadmap_marks_s25_complete_and_s26_next(self):
        status = json.loads((ROOT / "ROADMAP_STATUS.json").read_text())
        steps = {row["id"]: row for row in status["steps"]}
        self.assertEqual(steps["S25"]["status"], "completed")
        self.assertIn(status["currentStep"], {"S27", "S27-A", "S27-B", "S27-C", "S27-D", "S28", "S29-LIVE-POSTGRES-VERIFY", "S30"})

    def test_full_corpus_reconciler_audit_cli(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "audit.json"
            result = subprocess.run(
                [
                    "python3", str(ROOT / "tools" / "audit_s25_candidate_reconciler.py"),
                    "--baseline", str(ROOT / "baseline" / "policy15"),
                    "--current", str(ROOT / "derived" / "mvp-policy-v0.1"),
                    "--output", str(output),
                ],
                capture_output=True, text=True, check=False,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            report = json.loads(output.read_text())
            self.assertEqual(report["result"], "pass")
            self.assertEqual(report["checks"]["secondPassRemovedCandidateCount"], 0)
            self.assertEqual(report["checks"]["stableProjectionMismatchCount"], 0)


if __name__ == "__main__":
    unittest.main()
