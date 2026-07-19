from __future__ import annotations

import json
import unittest
from copy import deepcopy
from pathlib import Path

from noticepilot_cross_notice_reconciler import CrossNoticeReconciler, build_merge_plans

ROOT = Path(__file__).resolve().parents[1]
POLICY = json.loads((ROOT / "configs/noticepilot_cross_notice_reconciliation_policy.v0.3.json").read_text(encoding="utf-8"))


def view(candidate_id: str, *, board="504", title="행사 안내", start="2026-08-01", end="2026-08-02", campus="chuncheon", marker=None, published="2026-07-01"):
    source_title = f"{title}({marker})" if marker else title
    return {
        "schemaVersion": "noticepilot.reconciliationCandidateView.v0.1",
        "candidateId": candidate_id,
        "sourceNoticeId": f"knu-{board}-{candidate_id[-1]}",
        "sourceIdentity": {
            "identityKey": f"kangwon|general_notice|{candidate_id[-1]}",
            "canonicalBoardCategory": "general_notice",
            "sourcePostId": candidate_id[-1],
            "observedBoardId": board,
            "canonicalBoardId": board,
            "boardCanonical": True,
            "canonicalSourceUrl": f"https://example/{board}/{candidate_id[-1]}",
            "observedSourceUrl": f"https://example/{board}/{candidate_id[-1]}?x=1",
        },
        "publishedAt": published,
        "sourceTitle": source_title,
        "titleAnalysis": {
            "relationBaseTitle": title.lower(),
            "decorativeMarkers": [marker] if marker else [],
        },
        "eventProjection": {
            "title": "행사 기간",
            "eventType": "event",
            "actionType": None,
            "temporalRole": "event_occurrence",
            "targetActor": "student",
            "audienceRules": {},
            "campusScope": {"campuses": [campus]},
            "normalizedStart": start,
            "normalizedEnd": end,
            "endDateInclusive": True,
            "isAllDay": True,
            "timezone": "Asia/Seoul",
            "feedScopes": ["student_default"],
        },
    }


class S27BStep5CrossNoticeReconcilerTests(unittest.TestCase):
    def setUp(self):
        self.reconciler = CrossNoticeReconciler(POLICY)

    def test_campus_disjoint_is_always_distinct(self):
        decision = self.reconciler.reconcile_pair(view("cand-1"), view("cand-2", campus="samcheok"), pair_id="p1")
        self.assertEqual(decision["relation"], "distinct")
        self.assertIn("D4.campus_disjoint_distinct", decision["ruleIds"])

    def test_strict_extension_keeps_identity_and_selects_later_notice(self):
        earlier = view("cand-1", end="2026-08-02", published="2026-07-01")
        later = view("cand-2", end="2026-08-05", marker="연장", published="2026-07-02")
        decision = self.reconciler.reconcile_pair(earlier, later, pair_id="p2")
        self.assertEqual(decision["relation"], "extension")
        self.assertTrue(decision["mergeAllowed"])
        self.assertEqual(decision["canonicalSelection"]["candidateId"], "cand-2")

    def test_revision_marker_fails_closed(self):
        decision = self.reconciler.reconcile_pair(view("cand-1"), view("cand-2", marker="수정", published="2026-07-02"), pair_id="p3")
        self.assertEqual(decision["relation"], "needs_review")
        self.assertFalse(decision["mergeAllowed"])

    def test_cross_board_exact_duplicate_prefers_specialized_event_board(self):
        left = view("cand-1", board="504")
        right = view("cand-2", board="715")
        right["sourceIdentity"]["canonicalBoardCategory"] = "event"
        decision = self.reconciler.reconcile_pair(left, right, pair_id="p4")
        self.assertEqual(decision["relation"], "duplicate")
        self.assertEqual(decision["canonicalSelection"]["status"], "resolved")
        self.assertEqual(decision["canonicalSelection"]["candidateId"], "cand-2")
        self.assertTrue(decision["mergeAllowed"])

    def test_unconfigured_specialized_board_pair_remains_review_blocked(self):
        left = view("cand-1", board="715")
        right = view("cand-2", board="721")
        right["sourceIdentity"]["canonicalBoardCategory"] = "scholarship"
        decision = self.reconciler.reconcile_pair(left, right, pair_id="p4b")
        self.assertEqual(decision["relation"], "duplicate")
        self.assertEqual(decision["canonicalSelection"]["status"], "needs_review")
        self.assertFalse(decision["mergeAllowed"])

    def test_incomplete_transitive_graph_never_merges(self):
        views = [view("cand-1"), view("cand-2"), view("cand-3")]
        decisions = []
        for pair_id, a, b in [("p1", views[0], views[1]), ("p2", views[1], views[2])]:
            decision = self.reconciler.reconcile_pair(a, b, pair_id=pair_id)
            decision["relation"] = "extension"
            decision["mergeAllowed"] = True
            decision["canonicalSelection"] = {"status": "resolved", "candidateId": "cand-2", "ruleIds": []}
            decisions.append(decision)
        plans = build_merge_plans(views, decisions)
        self.assertEqual(plans[0]["status"], "needs_review")
        self.assertFalse(plans[0]["pairwiseComplete"])


if __name__ == "__main__":
    unittest.main()
