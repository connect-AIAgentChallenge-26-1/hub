from __future__ import annotations

import unittest
from copy import deepcopy

from noticepilot_incremental_runtime import (
    IncrementalRuntimeCoordinator,
    IncrementalRuntimeError,
    plan_source_notice_change,
)
from noticepilot_postgres_persistence import InMemoryPostgresReferenceStore

NOW = "2026-07-13T20:00:00+09:00"
HASH_A = "a" * 64
HASH_B = "b" * 64


def incoming(**overrides):
    row = {
        "sourceNoticeId": "knu-720-9999",
        "institutionId": "kangwon",
        "canonicalBoardCategory": "school_notice",
        "sourcePostId": "9999",
        "sourceIdentityKey": "kangwon:school_notice:9999",
        "title": "Test notice",
        "sourceUrl": "https://example.test/observed",
        "canonicalSourceUrl": "https://example.test/canonical",
        "publishedAt": "2026-07-13",
        "fetchedAt": NOW,
        "contentHash": HASH_A,
        "status": "active",
        "payload": {"body": "A"},
    }
    row.update(overrides)
    return row


def existing_row():
    row = incoming()
    return {
        "source_notice_id": row["sourceNoticeId"],
        "institution_id": row["institutionId"],
        "canonical_board_category": row["canonicalBoardCategory"],
        "source_post_id": row["sourcePostId"],
        "source_identity_key": row["sourceIdentityKey"],
        "title": row["title"],
        "source_url": row["sourceUrl"],
        "canonical_source_url": row["canonicalSourceUrl"],
        "published_at": row["publishedAt"],
        "fetched_at": row["fetchedAt"],
        "content_hash": row["contentHash"],
        "semantic_content_hash": None,
        "status": "active",
        "source_revision": 1,
        "payload": row,
        "created_at": NOW,
        "updated_at": NOW,
    }


class S29IncrementalRuntimeTests(unittest.TestCase):
    def test_new_notice_enqueues_extraction(self) -> None:
        plan = plan_source_notice_change(None, incoming()).payload
        self.assertEqual(plan["action"], "insert_and_extract")
        self.assertTrue(plan["enqueueExtraction"])
        self.assertTrue(plan["requiresEventReconciliation"])

    def test_unchanged_notice_is_skipped(self) -> None:
        plan = plan_source_notice_change(existing_row(), incoming()).payload
        self.assertEqual(plan["action"], "skip_unchanged")
        self.assertFalse(plan["persistSourceState"])

    def test_content_hash_change_reprocesses(self) -> None:
        plan = plan_source_notice_change(existing_row(), incoming(contentHash=HASH_B)).payload
        self.assertEqual(plan["action"], "reprocess_content_changed")
        self.assertTrue(plan["enqueueExtraction"])
        self.assertTrue(plan["requiresFeedRebuild"])

    def test_metadata_only_change_does_not_extract(self) -> None:
        plan = plan_source_notice_change(existing_row(), incoming(title="Renamed")).payload
        self.assertEqual(plan["action"], "refresh_metadata_only")
        self.assertFalse(plan["enqueueExtraction"])

    def test_deleted_notice_reconciles_without_extracting(self) -> None:
        plan = plan_source_notice_change(existing_row(), incoming(status="deleted", contentHash=None)).payload
        self.assertEqual(plan["action"], "mark_deleted")
        self.assertFalse(plan["enqueueExtraction"])
        self.assertTrue(plan["requiresEventReconciliation"])

    def test_fetch_failure_preserves_last_good_and_retries(self) -> None:
        plan = plan_source_notice_change(existing_row(), incoming(status="fetch_failed", contentHash=None)).payload
        self.assertEqual(plan["action"], "retain_last_good_retry")
        self.assertFalse(plan["requiresFeedRebuild"])

    def test_crawler_batch_persists_source_checkpoint_and_outbox_atomically(self) -> None:
        store = InMemoryPostgresReferenceStore()
        coordinator = IncrementalRuntimeCoordinator(store)
        result = coordinator.apply_crawler_batch(
            [incoming()], run_id="run-1", source_key="knu:720", now=NOW
        )
        self.assertEqual(result["actionCounts"], {"insert_and_extract": 1})
        self.assertEqual(store.count("source_notice"), 1)
        self.assertEqual(store.count("runtime_outbox"), 1)
        self.assertIsNotNone(store.get("crawler_checkpoint", "knu:720"))

    def test_crawler_batch_rolls_back_on_failure(self) -> None:
        store = InMemoryPostgresReferenceStore()
        coordinator = IncrementalRuntimeCoordinator(store)
        with self.assertRaises(IncrementalRuntimeError):
            coordinator.apply_crawler_batch(
                [incoming(), incoming(sourceNoticeId="knu-720-9998", sourcePostId="9998", sourceIdentityKey="kangwon:school_notice:9998")],
                run_id="run-2", source_key="knu:720", now=NOW, fail_after_index=0,
            )
        self.assertEqual(store.count("source_notice"), 0)
        self.assertEqual(store.count("runtime_outbox"), 0)
        self.assertEqual(store.count("crawler_checkpoint"), 0)

    def test_replaying_same_crawler_batch_does_not_duplicate_outbox(self) -> None:
        store = InMemoryPostgresReferenceStore()
        coordinator = IncrementalRuntimeCoordinator(store)
        first = coordinator.apply_crawler_batch([incoming()], run_id="run-3", source_key="knu:720", now=NOW)
        second = coordinator.apply_crawler_batch([incoming()], run_id="run-3", source_key="knu:720", now=NOW)
        self.assertEqual(first["outboxCount"], 1)
        self.assertEqual(second["outboxCount"], 0)
        self.assertEqual(store.count("runtime_outbox"), 1)

    def test_event_projection_outbox_is_idempotent(self) -> None:
        store = InMemoryPostgresReferenceStore()
        coordinator = IncrementalRuntimeCoordinator(store)
        first = coordinator.enqueue_event_projection_change(calendar_event_id="evt_" + "1" * 32, sequence=2, now=NOW)
        second = coordinator.enqueue_event_projection_change(calendar_event_id="evt_" + "1" * 32, sequence=2, now=NOW)
        self.assertEqual(first, second)
        self.assertEqual(store.count("runtime_outbox"), 1)


if __name__ == "__main__":
    unittest.main()
