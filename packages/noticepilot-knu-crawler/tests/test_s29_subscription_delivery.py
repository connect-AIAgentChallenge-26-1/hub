from __future__ import annotations

import unittest
from pathlib import Path

from noticepilot_postgres_persistence import InMemoryPostgresReferenceStore, build_foundation_bootstrap_bundle
from noticepilot_subscription_delivery import (
    SubscriptionAuthenticationError,
    SubscriptionFeedDeliveryService,
    SubscriptionFeedUnavailableError,
    SubscriptionFeedWsgiApp,
)

ROOT = Path(__file__).resolve().parents[1]
NOW = "2026-07-13T20:30:00+09:00"
TOKENS = {
    "student": "S" * 43,
    "job": "J" * 43,
    "rotated": "R" * 43,
}


class S29SubscriptionDeliveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        bundle = build_foundation_bootstrap_bundle(ROOT)
        cls.base_store = InMemoryPostgresReferenceStore()
        cls.base_store.bootstrap(bundle)

    def setUp(self) -> None:
        self.base_store.tables["subscription_feed"].clear()
        self.base_store.tables["subscription_feed_snapshot_history"].clear()

    def make_service(self):
        store = self.base_store
        service = SubscriptionFeedDeliveryService(store)
        profiles = {row["profile_id"]: row for row in store.rows("subscription_profile_head")}
        snapshots = {row["profile_id"]: row for row in store.rows("feed_snapshot")}
        student_profile = next(pid for pid in profiles if snapshots[pid]["event_count"] == 601)
        job_profile = next(pid for pid in profiles if snapshots[pid]["event_count"] == 299)
        student = service.provision_feed(
            profile_id=student_profile,
            snapshot_id=snapshots[student_profile]["snapshot_id"],
            calendar_name="NoticePilot 학생 일정",
            now=NOW,
            feed_id_factory=lambda: "feed_" + "1" * 32,
            token_factory=lambda: TOKENS["student"],
        )
        job = service.provision_feed(
            profile_id=job_profile,
            snapshot_id=snapshots[job_profile]["snapshot_id"],
            calendar_name="NoticePilot 채용 접수 일정",
            now=NOW,
            feed_id_factory=lambda: "feed_" + "2" * 32,
            token_factory=lambda: TOKENS["job"],
        )
        return store, service, student, job

    def test_provisioned_feed_stores_only_token_hash_and_prefix(self) -> None:
        store, _, student, _ = self.make_service()
        row = store.get("subscription_feed", student.feed_id)
        self.assertNotIn("raw_token", row)
        self.assertNotIn(TOKENS["student"], str(row))
        self.assertRegex(row["token_hash_sha256"], r"^[0-9a-f]{64}$")
        self.assertEqual(row["token_prefix"], TOKENS["student"][:12])

    def test_student_and_job_feeds_render_expected_vevent_counts(self) -> None:
        _, service, student, job = self.make_service()
        student_response = service.render_feed(student.feed_id, student.raw_token)
        job_response = service.render_feed(job.feed_id, job.raw_token)
        self.assertEqual(student_response.status_code, 200)
        self.assertEqual(job_response.status_code, 200)
        self.assertEqual(student_response.body.count(b"BEGIN:VEVENT"), 601)
        self.assertEqual(job_response.body.count(b"BEGIN:VEVENT"), 299)
        self.assertIn(b"UID:evt_", student_response.body)

    def test_invalid_token_is_rejected(self) -> None:
        _, service, student, _ = self.make_service()
        with self.assertRaises(SubscriptionAuthenticationError):
            service.render_feed(student.feed_id, "X" * 43)

    def test_etag_conditional_get_returns_304(self) -> None:
        _, service, student, _ = self.make_service()
        first = service.render_feed(student.feed_id, student.raw_token)
        etag = dict(first.headers)["ETag"]
        second = service.render_feed(student.feed_id, student.raw_token, if_none_match=etag)
        self.assertEqual(second.status_code, 304)
        self.assertEqual(second.body, b"")

    def test_token_rotation_invalidates_old_token_and_preserves_feed_id(self) -> None:
        _, service, student, _ = self.make_service()
        rotated = service.rotate_token(student.feed_id, now=NOW, token_factory=lambda: TOKENS["rotated"])
        self.assertEqual(rotated.feed_id, student.feed_id)
        with self.assertRaises(SubscriptionAuthenticationError):
            service.render_feed(student.feed_id, student.raw_token)
        self.assertEqual(service.render_feed(rotated.feed_id, rotated.raw_token).status_code, 200)

    def test_paused_and_revoked_statuses_are_not_served(self) -> None:
        _, service, student, _ = self.make_service()
        service.set_status(student.feed_id, "paused", now=NOW)
        with self.assertRaises(SubscriptionFeedUnavailableError) as paused:
            service.render_feed(student.feed_id, student.raw_token)
        self.assertEqual(paused.exception.status, "paused")
        service.set_status(student.feed_id, "revoked", now=NOW)
        with self.assertRaises(SubscriptionFeedUnavailableError) as revoked:
            service.render_feed(student.feed_id, student.raw_token)
        self.assertEqual(revoked.exception.status, "revoked")

    def test_wsgi_maps_auth_to_404_and_etag_to_304(self) -> None:
        _, service, student, _ = self.make_service()
        app = SubscriptionFeedWsgiApp(service)
        statuses = []
        headers = []
        def start(status, values):
            statuses.append(status); headers.append(dict(values))
        body = app({"REQUEST_METHOD": "GET", "PATH_INFO": student.subscription_path}, start)
        self.assertEqual(statuses[-1], "200 OK")
        self.assertGreater(len(body[0]), 1000)
        etag = headers[-1]["ETag"]
        body2 = app({"REQUEST_METHOD": "GET", "PATH_INFO": student.subscription_path, "HTTP_IF_NONE_MATCH": etag}, start)
        self.assertEqual(statuses[-1], "304 Not Modified")
        self.assertEqual(body2, [b""])
        bad_path = student.subscription_path.replace(TOKENS["student"], "X" * 43)
        app({"REQUEST_METHOD": "GET", "PATH_INFO": bad_path}, start)
        self.assertEqual(statuses[-1], "404 Not Found")

    def test_feed_url_is_opaque_and_contains_no_profile_or_snapshot_id(self) -> None:
        store, _, student, _ = self.make_service()
        row = store.get("subscription_feed", student.feed_id)
        self.assertNotIn(row["profile_id"], student.subscription_path)
        self.assertNotIn(row["current_snapshot_id"], student.subscription_path)


if __name__ == "__main__":
    unittest.main()
