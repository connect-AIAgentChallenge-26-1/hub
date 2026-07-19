from __future__ import annotations

import unittest

from noticepilot_calendar_event_atomic_boundary import (
    AtomicBoundaryError,
    AtomicBoundaryValidationError,
    InMemoryAtomicCalendarEventRepository,
)


class IdFactory:
    def __init__(self):
        self.counts = {}

    def __call__(self, kind: str) -> str:
        self.counts[kind] = self.counts.get(kind, 0) + 1
        return f"{kind}-{self.counts[kind]}"


def create_plan():
    return {
        "schemaVersion": "noticepilot.atomicCalendarEventPersistencePlan.v0.1",
        "operation": "create_distinct_event",
        "relationDecision": {"status": "approved", "relation": "distinct", "ruleIds": ["D1"]},
        "targetCalendarEventId": None,
        "expectedEventVersion": None,
        "eventMutation": {"kind": "create", "projection": {"title": "Event", "normalizedStart": "2026-08-01"}},
        "sourceLinkDrafts": [{"schemaVersion": "noticepilot.calendarEventSourceLinkDraft.v0.1", "sourceCandidateId": "cand-1"}],
        "revisionRecord": None,
        "outboxIntent": {"kind": "calendar_event_projection_changed", "reason": "created"},
        "idStrategy": "registry_assigned_opaque_v0",
    }


class S27BStep4AtomicBoundaryTests(unittest.TestCase):
    def test_success_commits_decision_event_link_and_outbox_together(self) -> None:
        repo = InMemoryAtomicCalendarEventRepository()
        result = repo.apply(create_plan(), id_factory=IdFactory(), now="2026-07-13T09:00:00+09:00")
        self.assertEqual(result["status"], "committed")
        self.assertEqual(len(repo.relation_decisions), 1)
        self.assertEqual(len(repo.events), 1)
        self.assertEqual(len(repo.source_links), 1)
        self.assertEqual(len(repo.outbox), 1)

    def test_failure_rolls_back_every_record_and_opaque_id_is_not_committed(self) -> None:
        repo = InMemoryAtomicCalendarEventRepository()
        with self.assertRaises(AtomicBoundaryError):
            repo.apply(
                create_plan(),
                id_factory=IdFactory(),
                now="2026-07-13T09:00:00+09:00",
                fail_after="source_links",
            )
        self.assertEqual(repo.relation_decisions, {})
        self.assertEqual(repo.events, {})
        self.assertEqual(repo.source_links, {})
        self.assertEqual(repo.outbox, [])

    def test_needs_review_cannot_mutate_event_or_emit_outbox(self) -> None:
        plan = create_plan()
        plan.update({
            "operation": "record_needs_review",
            "relationDecision": {"status": "needs_review", "relation": "needs_review"},
            "eventMutation": None,
            "sourceLinkDrafts": [],
            "outboxIntent": None,
        })
        repo = InMemoryAtomicCalendarEventRepository()
        result = repo.apply(plan, id_factory=IdFactory(), now="2026-07-13T09:00:00+09:00")
        self.assertIsNone(result["calendarEventId"])
        self.assertEqual(len(repo.relation_decisions), 1)
        self.assertEqual(repo.events, {})

    def test_review_plan_with_mutation_is_rejected(self) -> None:
        plan = create_plan()
        plan["operation"] = "record_needs_review"
        plan["relationDecision"] = {"status": "needs_review", "relation": "needs_review"}
        with self.assertRaises(AtomicBoundaryValidationError):
            InMemoryAtomicCalendarEventRepository().apply(
                plan, id_factory=IdFactory(), now="2026-07-13T09:00:00+09:00"
            )


if __name__ == "__main__":
    unittest.main()
