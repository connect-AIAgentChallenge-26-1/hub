from __future__ import annotations

import json
import unittest
from pathlib import Path

from noticepilot_calendar_event_source_link import (
    CalendarEventSourceLinkError,
    build_source_link_draft,
    persist_source_link,
)
from noticepilot_reconciliation_candidate_view import build_reconciliation_candidate_view, load_board_registry

ROOT = Path(__file__).resolve().parents[1]


def read_jsonl(path: Path):
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


class S27BStep3CalendarEventSourceLinkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        candidates = read_jsonl(ROOT / "derived/mvp-policy-v0.1/decisions/publishable-candidates.jsonl")
        notices = {row["sourceNoticeId"]: row for row in read_jsonl(ROOT / "derived/mvp-policy-v0.1/decisions/notices.jsonl")}
        registry = load_board_registry(ROOT / "configs/knu_board_registry.v0.2.json")
        cls.view = build_reconciliation_candidate_view(candidates[0], notices[candidates[0]["sourceNoticeId"]], registry)

    def test_draft_and_persisted_link_preserve_both_urls_and_source_ids(self) -> None:
        draft = build_source_link_draft(self.view, relation_role="canonical", canonical=True)
        link = persist_source_link(
            draft,
            source_link_id="src-link-1",
            calendar_event_id="evt-1",
            first_observed_at="2026-07-13T09:00:00+09:00",
        )
        self.assertEqual(link["sourceNoticeId"], self.view["sourceNoticeId"])
        self.assertEqual(link["sourceCandidateId"], self.view["candidateId"])
        self.assertEqual(link["observedSourceUrl"], self.view["sourceIdentity"]["observedSourceUrl"])
        self.assertEqual(link["canonicalSourceUrl"], self.view["sourceIdentity"]["canonicalSourceUrl"])

    def test_noncanonical_relation_cannot_claim_canonical_flag(self) -> None:
        with self.assertRaises(CalendarEventSourceLinkError):
            build_source_link_draft(self.view, relation_role="duplicate_source", canonical=True)

    def test_observation_time_cannot_move_backward(self) -> None:
        draft = build_source_link_draft(self.view, relation_role="canonical", canonical=True)
        with self.assertRaises(CalendarEventSourceLinkError):
            persist_source_link(
                draft,
                source_link_id="src-link-1",
                calendar_event_id="evt-1",
                first_observed_at="2026-07-13T10:00:00+09:00",
                last_observed_at="2026-07-13T09:00:00+09:00",
            )


if __name__ == "__main__":
    unittest.main()
