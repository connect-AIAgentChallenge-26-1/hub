#!/usr/bin/env python3
"""S29 opaque subscription-feed identity, token, and read endpoint contract."""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import format_datetime
from typing import Any, Callable, Mapping
from urllib.parse import unquote

from noticepilot_postgres_persistence import InMemoryPostgresReferenceStore
from noticepilot_registry_ics_projector import build_ics

DELIVERY_SCHEMA_VERSION = "noticepilot.subscriptionFeedDelivery.v0.1"
DELIVERY_SERVICE_VERSION = "0.1.0"
FEED_ID_RE = re.compile(r"^feed_[0-9a-f]{32}$")
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{32,256}$")
CACHE_CONTROL = "private, max-age=300, must-revalidate"


class SubscriptionDeliveryError(RuntimeError):
    pass


class SubscriptionAuthenticationError(SubscriptionDeliveryError):
    pass


class SubscriptionFeedUnavailableError(SubscriptionDeliveryError):
    def __init__(self, status: str) -> None:
        super().__init__(status)
        self.status = status


@dataclass(frozen=True)
class ProvisionedFeed:
    feed_id: str
    raw_token: str
    token_prefix: str
    subscription_path: str


@dataclass(frozen=True)
class FeedHttpResponse:
    status_code: int
    headers: tuple[tuple[str, str], ...]
    body: bytes


def token_hash(raw_token: str) -> str:
    if not isinstance(raw_token, str) or not TOKEN_RE.fullmatch(raw_token):
        raise SubscriptionDeliveryError("invalid opaque feed token")
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _default_feed_id() -> str:
    return f"feed_{secrets.token_hex(16)}"


def _default_token() -> str:
    return secrets.token_urlsafe(32)


def subscription_path(feed_id: str, raw_token: str) -> str:
    if not FEED_ID_RE.fullmatch(feed_id or ""):
        raise SubscriptionDeliveryError("invalid feed ID")
    token_hash(raw_token)
    return f"/subscription-feeds/{feed_id}/{raw_token}.ics"


def _http_date(value: str) -> str:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise SubscriptionDeliveryError("timestamp has no timezone")
    return format_datetime(parsed.astimezone(timezone.utc), usegmt=True)


class SubscriptionFeedDeliveryService:
    def __init__(self, store: InMemoryPostgresReferenceStore) -> None:
        self.store = store

    def provision_feed(
        self,
        *,
        profile_id: str,
        snapshot_id: str,
        calendar_name: str,
        now: str,
        feed_id_factory: Callable[[], str] = _default_feed_id,
        token_factory: Callable[[], str] = _default_token,
    ) -> ProvisionedFeed:
        head = self.store.get("subscription_profile_head", profile_id)
        snapshot = self.store.get("feed_snapshot", snapshot_id)
        if head is None or snapshot is None:
            raise SubscriptionDeliveryError("profile or snapshot not found")
        if snapshot["profile_id"] != profile_id or snapshot["profile_revision"] != head["current_revision"]:
            raise SubscriptionDeliveryError("snapshot/profile revision mismatch")
        feed_id = feed_id_factory()
        if not FEED_ID_RE.fullmatch(feed_id or ""):
            raise SubscriptionDeliveryError("feed ID factory returned invalid ID")
        raw_token = token_factory()
        digest = token_hash(raw_token)
        row = {
            "feed_id": feed_id,
            "profile_id": profile_id,
            "current_snapshot_id": snapshot_id,
            "calendar_name": calendar_name,
            "status": "active",
            "token_hash_sha256": digest,
            "token_prefix": raw_token[:12],
            "token_rotated_at": now,
            "etag": snapshot["snapshot_hash"],
            "created_at": now,
            "updated_at": now,
        }
        history = {
            "feed_id": feed_id,
            "snapshot_id": snapshot_id,
            "activated_at": now,
            "superseded_at": None,
        }
        with self.store.transaction():
            self.store.insert_immutable("subscription_feed", row)
            self.store.insert_immutable("subscription_feed_snapshot_history", history)
        return ProvisionedFeed(
            feed_id=feed_id,
            raw_token=raw_token,
            token_prefix=raw_token[:12],
            subscription_path=subscription_path(feed_id, raw_token),
        )

    def rotate_token(
        self,
        feed_id: str,
        *,
        now: str,
        token_factory: Callable[[], str] = _default_token,
    ) -> ProvisionedFeed:
        feed = self.store.get("subscription_feed", feed_id)
        if feed is None:
            raise SubscriptionDeliveryError("feed not found")
        raw_token = token_factory()
        feed.update({
            "token_hash_sha256": token_hash(raw_token),
            "token_prefix": raw_token[:12],
            "token_rotated_at": now,
            "updated_at": now,
        })
        self.store.upsert_mutable("subscription_feed", feed)
        return ProvisionedFeed(feed_id, raw_token, raw_token[:12], subscription_path(feed_id, raw_token))

    def activate_snapshot(self, feed_id: str, snapshot_id: str, *, now: str) -> None:
        feed = self.store.get("subscription_feed", feed_id)
        snapshot = self.store.get("feed_snapshot", snapshot_id)
        if feed is None or snapshot is None:
            raise SubscriptionDeliveryError("feed or snapshot not found")
        if snapshot["profile_id"] != feed["profile_id"]:
            raise SubscriptionDeliveryError("snapshot belongs to another profile")
        if feed["current_snapshot_id"] == snapshot_id:
            return
        with self.store.transaction():
            for history in self.store.rows("subscription_feed_snapshot_history"):
                if history["feed_id"] == feed_id and history["superseded_at"] is None:
                    history["superseded_at"] = now
                    self.store.upsert_mutable("subscription_feed_snapshot_history", history)
            feed.update({
                "current_snapshot_id": snapshot_id,
                "etag": snapshot["snapshot_hash"],
                "updated_at": now,
            })
            self.store.upsert_mutable("subscription_feed", feed)
            self.store.insert_immutable("subscription_feed_snapshot_history", {
                "feed_id": feed_id,
                "snapshot_id": snapshot_id,
                "activated_at": now,
                "superseded_at": None,
            })

    def set_status(self, feed_id: str, status: str, *, now: str) -> None:
        if status not in {"active", "paused", "revoked"}:
            raise SubscriptionDeliveryError("invalid feed status")
        feed = self.store.get("subscription_feed", feed_id)
        if feed is None:
            raise SubscriptionDeliveryError("feed not found")
        feed["status"] = status
        feed["updated_at"] = now
        self.store.upsert_mutable("subscription_feed", feed)

    def authenticate(self, feed_id: str, raw_token: str) -> dict[str, Any]:
        feed = self.store.get("subscription_feed", feed_id)
        if feed is None or feed.get("token_hash_sha256") is None:
            raise SubscriptionAuthenticationError("feed not found")
        try:
            digest = token_hash(raw_token)
        except SubscriptionDeliveryError as exc:
            raise SubscriptionAuthenticationError("invalid feed token") from exc
        if not hmac.compare_digest(digest, str(feed["token_hash_sha256"])):
            raise SubscriptionAuthenticationError("invalid feed token")
        status = feed["status"]
        if status != "active":
            raise SubscriptionFeedUnavailableError(status)
        return feed

    def _event_for_ics(
        self,
        event: Mapping[str, Any],
        snapshot: Mapping[str, Any],
        revision: Mapping[str, Any],
    ) -> dict[str, Any]:
        return {
            "calendarEventId": event["calendar_event_id"],
            "canonicalCandidateId": event["canonical_candidate_id"],
            "canonicalSourceNoticeId": event["canonical_source_notice_id"],
            "createdAt": event["created_at"],
            "updatedAt": event["updated_at"],
            "projection": json.loads(json.dumps(event["projection"], ensure_ascii=False)),
            "registryId": snapshot["registry_id"],
            "relationBasis": event["relation_basis"],
            "revisionNumber": revision["revision_number"],
            "sequence": event["sequence"],
            "status": event["status"],
        }

    def render_feed(
        self,
        feed_id: str,
        raw_token: str,
        *,
        if_none_match: str | None = None,
    ) -> FeedHttpResponse:
        feed = self.authenticate(feed_id, raw_token)
        snapshot = self.store.get("feed_snapshot", feed["current_snapshot_id"])
        if snapshot is None:
            raise SubscriptionDeliveryError("current snapshot not found")
        etag = f'"{snapshot["snapshot_hash"]}"'
        common_headers = (
            ("ETag", etag),
            ("Cache-Control", CACHE_CONTROL),
            ("Last-Modified", _http_date(snapshot["first_materialized_at"])),
            ("X-NoticePilot-Snapshot-ID", snapshot["snapshot_id"]),
        )
        if if_none_match == etag:
            return FeedHttpResponse(304, common_headers, b"")
        membership = [
            row for row in self.store.rows("feed_snapshot_event")
            if row["snapshot_id"] == snapshot["snapshot_id"]
        ]
        membership.sort(key=lambda row: row["position"])
        event_by_id = {
            row["calendar_event_id"]: row for row in self.store.rows("calendar_event")
        }
        active_revision_by_event: dict[str, dict[str, Any]] = {}
        for row in self.store.rows("calendar_event_revision"):
            if row["active"]:
                event_id = row["calendar_event_id"]
                if event_id in active_revision_by_event:
                    raise SubscriptionDeliveryError("event has multiple active revisions")
                active_revision_by_event[event_id] = row
        all_links_by_event: dict[str, list[dict[str, Any]]] = {}
        for row in self.store.rows("calendar_event_source_link"):
            all_links_by_event.setdefault(row["calendar_event_id"], []).append(row["payload"])
        events: list[dict[str, Any]] = []
        links_by_event: dict[str, list[dict[str, Any]]] = {}
        for member in membership:
            event_id = member["calendar_event_id"]
            event = event_by_id.get(event_id)
            revision = active_revision_by_event.get(event_id)
            if event is None or revision is None:
                raise SubscriptionDeliveryError("snapshot references missing event/revision")
            events.append(self._event_for_ics(event, snapshot, revision))
            link_rows = all_links_by_event.get(event_id, [])
            if not link_rows:
                raise SubscriptionDeliveryError("event has no source links")
            links_by_event[event_id] = link_rows
        ics = build_ics(events, links_by_event, feed["calendar_name"])
        headers = (
            ("Content-Type", "text/calendar; charset=utf-8"),
            ("Content-Disposition", f'inline; filename="{feed_id}.ics"'),
            *common_headers,
        )
        return FeedHttpResponse(200, headers, ics.encode("utf-8"))


class SubscriptionFeedWsgiApp:
    """Small read-only WSGI adapter for calendar subscription clients."""

    PATH_RE = re.compile(r"^/subscription-feeds/(feed_[0-9a-f]{32})/([^/]+)\.ics$")

    def __init__(self, service: SubscriptionFeedDeliveryService) -> None:
        self.service = service

    def __call__(self, environ: Mapping[str, Any], start_response: Callable[..., Any]) -> list[bytes]:
        method = str(environ.get("REQUEST_METHOD") or "GET").upper()
        match = self.PATH_RE.fullmatch(str(environ.get("PATH_INFO") or ""))
        if method not in {"GET", "HEAD"} or match is None:
            start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
            return [b"not found"]
        feed_id, encoded_token = match.groups()
        raw_token = unquote(encoded_token)
        try:
            response = self.service.render_feed(
                feed_id,
                raw_token,
                if_none_match=environ.get("HTTP_IF_NONE_MATCH"),
            )
        except SubscriptionAuthenticationError:
            start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
            return [b"not found"]
        except SubscriptionFeedUnavailableError as exc:
            if exc.status == "revoked":
                start_response("410 Gone", [("Content-Type", "text/plain; charset=utf-8")])
                return [b"gone"]
            start_response("503 Service Unavailable", [("Content-Type", "text/plain; charset=utf-8"), ("Retry-After", "300")])
            return [b"temporarily unavailable"]
        status_text = {200: "200 OK", 304: "304 Not Modified"}[response.status_code]
        start_response(status_text, list(response.headers))
        return [b"" if method == "HEAD" else response.body]
