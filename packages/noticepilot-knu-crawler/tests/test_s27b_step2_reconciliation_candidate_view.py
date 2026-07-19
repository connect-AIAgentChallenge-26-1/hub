from __future__ import annotations

import json
import unittest
from pathlib import Path

from noticepilot_reconciliation_candidate_view import (
    ReconciliationViewError,
    build_reconciliation_candidate_view,
    load_board_registry,
)

ROOT = Path(__file__).resolve().parents[1]


def read_jsonl(path: Path):
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


class S27BStep2ReconciliationCandidateViewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.candidates = read_jsonl(ROOT / "derived/mvp-policy-v0.1/decisions/publishable-candidates.jsonl")
        cls.notices = {row["sourceNoticeId"]: row for row in read_jsonl(ROOT / "derived/mvp-policy-v0.1/decisions/notices.jsonl")}
        cls.registry = load_board_registry(ROOT / "configs/knu_board_registry.v0.2.json")
        cls.views = [
            build_reconciliation_candidate_view(row, cls.notices[row["sourceNoticeId"]], cls.registry)
            for row in cls.candidates
        ]

    def test_all_909_publishable_candidates_project_without_mutation(self) -> None:
        self.assertEqual(len(self.views), 909)
        self.assertEqual(len({row["candidateId"] for row in self.views}), 909)
        self.assertFalse(any("calendarEventId" in row for row in self.candidates))

    def test_source_identity_uses_category_and_post_id_not_observed_url(self) -> None:
        view = self.views[0]
        identity = view["sourceIdentity"]
        self.assertEqual(
            identity["identityKey"],
            f"kangwon|{identity['canonicalBoardCategory']}|{identity['sourcePostId']}",
        )
        self.assertIn("?pstSn=", identity["canonicalSourceUrl"])
        self.assertNotEqual(identity["observedSourceUrl"], identity["canonicalSourceUrl"])

    def test_view_materializes_campus_audience_action_and_end_boundary(self) -> None:
        projection = self.views[0]["eventProjection"]
        for key in ["actionType", "audienceRules", "campusScope", "normalizedEnd", "endDateInclusive"]:
            self.assertIn(key, projection)

    def test_candidate_notice_mismatch_fails_closed(self) -> None:
        candidate = dict(self.candidates[0])
        other_notice = next(
            notice for notice_id, notice in self.notices.items()
            if notice_id != candidate["sourceNoticeId"]
        )
        with self.assertRaises(ReconciliationViewError):
            build_reconciliation_candidate_view(candidate, other_notice, self.registry)


if __name__ == "__main__":
    unittest.main()
