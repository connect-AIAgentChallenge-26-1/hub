#!/usr/bin/env python3
"""Persistent single-feed bridge for the opt-in S-Lite calendar slice."""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sqlite3
import stat
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


REFERENCE_PROFILE_ID = "subprof_9baaae14deb3460fa31777d362507cbc"
SCHEMA_VERSION = "noticepilot.sliteSubscriptionFeed.v0.1"
DATABASE_SCHEMA_VERSION = "noticepilot.sliteSqlite.v1"
FEED_ID_RE = re.compile(r"^feed_[0-9a-f]{32}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
FINGERPRINT_RE = re.compile(r"^[0-9a-f]{12}$")


class BridgeRequestError(ValueError):
    pass


class FeedConflictError(RuntimeError):
    pass


class FeedNotFoundError(RuntimeError):
    pass


def _parse_args() -> argparse.Namespace:
    repository_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument(
        "--foundation-root",
        type=Path,
        default=repository_root / "packages" / "noticepilot-knu-crawler",
    )
    parser.add_argument("--database-path", type=Path, required=True)
    return parser.parse_args()


def _load_foundation(foundation_root: Path) -> tuple[Any, Any]:
    root = foundation_root.resolve()
    if not root.is_dir():
        raise RuntimeError("Foundation package is unavailable")

    sys.path.insert(0, str(root))
    from noticepilot_postgres_persistence import (  # pylint: disable=import-outside-toplevel
        InMemoryPostgresReferenceStore,
        build_foundation_bootstrap_bundle,
    )
    from noticepilot_subscription_delivery import (  # pylint: disable=import-outside-toplevel
        SubscriptionFeedDeliveryService,
    )

    store = InMemoryPostgresReferenceStore()
    store.bootstrap(build_foundation_bootstrap_bundle(root))
    return store, SubscriptionFeedDeliveryService(store)


def _require_exact_object(
    value: Any,
    *,
    keys: set[str],
    label: str,
) -> Mapping[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise BridgeRequestError(f"invalid {label}")
    return value


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SliteSqliteStore:
    COLUMNS = (
        "feed_id",
        "profile_id",
        "current_snapshot_id",
        "calendar_name",
        "status",
        "token_hash_sha256",
        "token_fingerprint",
        "token_rotated_at",
        "etag",
        "created_at",
        "updated_at",
    )

    def __init__(self, database_path: Path) -> None:
        if not database_path.is_absolute():
            raise RuntimeError("S-Lite database path must be absolute")
        parent = database_path.parent
        parent_created = not parent.exists()
        parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if parent_created:
            parent.chmod(0o700)
        if database_path.is_symlink():
            raise RuntimeError("S-Lite database path must not be a symlink")
        if database_path.exists():
            mode = database_path.stat().st_mode
            if not stat.S_ISREG(mode) or mode & 0o077:
                raise RuntimeError("S-Lite database must be a private regular file")
        else:
            descriptor = os.open(
                database_path,
                os.O_CREAT | os.O_EXCL | os.O_WRONLY,
                0o600,
            )
            os.close(descriptor)

        self.connection = sqlite3.connect(database_path, timeout=5)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA busy_timeout = 5000")
        self.connection.execute("PRAGMA journal_mode = DELETE")
        self.connection.execute("PRAGMA synchronous = FULL")
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        tables = {
            row[0]
            for row in self.connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
            if not row[0].startswith("sqlite_")
        }
        if not tables:
            with self.connection:
                self.connection.execute(
                    "CREATE TABLE slite_metadata (schema_version TEXT PRIMARY KEY)"
                )
                self.connection.execute(
                    """
                    CREATE TABLE slite_feed (
                      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                      feed_id TEXT NOT NULL UNIQUE
                        CHECK (length(feed_id) = 37 AND feed_id GLOB 'feed_[0-9a-f]*'),
                      profile_id TEXT NOT NULL,
                      current_snapshot_id TEXT NOT NULL,
                      calendar_name TEXT NOT NULL,
                      status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
                      token_hash_sha256 TEXT NOT NULL
                        CHECK (length(token_hash_sha256) = 64
                          AND token_hash_sha256 NOT GLOB '*[^0-9a-f]*'),
                      token_fingerprint TEXT NOT NULL
                        CHECK (length(token_fingerprint) = 12
                          AND token_fingerprint NOT GLOB '*[^0-9a-f]*'),
                      token_rotated_at TEXT NOT NULL,
                      etag TEXT NOT NULL,
                      created_at TEXT NOT NULL,
                      updated_at TEXT NOT NULL
                    )
                    """
                )
                self.connection.execute(
                    "INSERT INTO slite_metadata(schema_version) VALUES (?)",
                    (DATABASE_SCHEMA_VERSION,),
                )
            return
        if tables != {"slite_metadata", "slite_feed"}:
            raise RuntimeError("S-Lite database has an unknown schema")
        versions = list(
            self.connection.execute("SELECT schema_version FROM slite_metadata")
        )
        if len(versions) != 1 or versions[0][0] != DATABASE_SCHEMA_VERSION:
            raise RuntimeError("S-Lite database schema version is unsupported")

    def read(self) -> dict[str, Any] | None:
        columns = ", ".join(self.COLUMNS)
        rows = list(
            self.connection.execute(
                f"SELECT {columns} FROM slite_feed WHERE singleton = 1"
            )
        )
        if not rows:
            return None
        if len(rows) != 1:
            raise RuntimeError("S-Lite database singleton invariant failed")
        return dict(rows[0])

    def insert(self, row: Mapping[str, Any]) -> None:
        columns = ", ".join(self.COLUMNS)
        placeholders = ", ".join("?" for _ in self.COLUMNS)
        try:
            self.connection.execute("BEGIN IMMEDIATE")
            self.connection.execute(
                f"INSERT INTO slite_feed(singleton, {columns}) VALUES (1, {placeholders})",
                tuple(row[column] for column in self.COLUMNS),
            )
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            raise

    def update(self, row: Mapping[str, Any]) -> None:
        assignments = ", ".join(f"{column} = ?" for column in self.COLUMNS)
        try:
            self.connection.execute("BEGIN IMMEDIATE")
            cursor = self.connection.execute(
                f"UPDATE slite_feed SET {assignments} WHERE singleton = 1",
                tuple(row[column] for column in self.COLUMNS),
            )
            if cursor.rowcount != 1:
                raise FeedNotFoundError("S-Lite feed not found")
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            raise

    def close(self) -> None:
        self.connection.close()


class SliteFeedBridge:
    def __init__(self, foundation_root: Path, database_path: Path) -> None:
        self.store, self.service = _load_foundation(foundation_root)
        snapshot = next(
            (
                row
                for row in self.store.rows("feed_snapshot")
                if row["profile_id"] == REFERENCE_PROFILE_ID
            ),
            None,
        )
        profile = self.store.get("subscription_profile_head", REFERENCE_PROFILE_ID)
        revision = self.store.get(
            "subscription_profile_revision",
            REFERENCE_PROFILE_ID,
            profile["current_revision"] if profile else None,
        )
        if snapshot is None or profile is None or revision is None:
            raise RuntimeError("Foundation reference profile is unavailable")
        if snapshot["profile_revision"] != profile["current_revision"]:
            raise RuntimeError("Foundation reference snapshot is stale")
        self.snapshot = snapshot
        self.calendar_name = revision["payload"]["calendarName"]
        self.sqlite = SliteSqliteStore(database_path)
        persisted = self.sqlite.read()
        if persisted is not None:
            self._validate_persisted_row(persisted)
            self._hydrate(persisted)

    @staticmethod
    def _parse_timestamp(value: Any) -> datetime:
        if not isinstance(value, str):
            raise RuntimeError("S-Lite persisted timestamp is invalid")
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as error:
            raise RuntimeError("S-Lite persisted timestamp is invalid") from error
        if parsed.tzinfo is None:
            raise RuntimeError("S-Lite persisted timestamp has no timezone")
        return parsed

    def _validate_persisted_row(self, row: Mapping[str, Any]) -> None:
        if set(row) != set(SliteSqliteStore.COLUMNS):
            raise RuntimeError("S-Lite persisted feed shape is invalid")
        if not FEED_ID_RE.fullmatch(str(row["feed_id"])):
            raise RuntimeError("S-Lite persisted feed ID is invalid")
        if (
            row["profile_id"] != REFERENCE_PROFILE_ID
            or row["current_snapshot_id"] != self.snapshot["snapshot_id"]
            or row["etag"] != self.snapshot["snapshot_hash"]
            or row["calendar_name"] != self.calendar_name
        ):
            raise RuntimeError("S-Lite persisted feed is incompatible with Foundation")
        digest = row["token_hash_sha256"]
        fingerprint = row["token_fingerprint"]
        if (
            not isinstance(digest, str)
            or not SHA256_RE.fullmatch(digest)
            or not isinstance(fingerprint, str)
            or not FINGERPRINT_RE.fullmatch(fingerprint)
            or fingerprint != digest[:12]
        ):
            raise RuntimeError("S-Lite persisted token identity is invalid")
        if row["status"] not in {"active", "revoked"}:
            raise RuntimeError("S-Lite persisted status is invalid")
        created_at = self._parse_timestamp(row["created_at"])
        updated_at = self._parse_timestamp(row["updated_at"])
        rotated_at = self._parse_timestamp(row["token_rotated_at"])
        if created_at > updated_at or created_at > rotated_at:
            raise RuntimeError("S-Lite persisted timestamp order is invalid")

    def _hydrate(self, row: Mapping[str, Any]) -> None:
        with self.store.transaction():
            self.store.tables["subscription_feed"].clear()
            self.store.upsert_mutable("subscription_feed", row)

    def _row(self) -> dict[str, Any]:
        row = self.sqlite.read()
        if row is None:
            raise FeedNotFoundError("S-Lite feed not found")
        self._validate_persisted_row(row)
        self._hydrate(row)
        return row

    def _status_dto(self, row: Mapping[str, Any]) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "feedId": row["feed_id"],
            "calendarName": row["calendar_name"],
            "eventCount": self.snapshot["event_count"],
            "status": row["status"],
            "tokenFingerprint": row["token_fingerprint"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "subscriptionPathRecoverable": False,
        }

    def _issue_dto(self, provisioned: Any) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "feedId": provisioned.feed_id,
            "calendarName": self.calendar_name,
            "eventCount": self.snapshot["event_count"],
            "status": "active",
            "tokenFingerprint": hashlib.sha256(
                provisioned.raw_token.encode("utf-8")
            ).hexdigest()[:12],
            "subscriptionPath": f"/calendar/{provisioned.raw_token}.ics",
            "persistsAcrossRestart": True,
        }

    def status(self, params: Any) -> dict[str, Any]:
        _require_exact_object(params, keys=set(), label="status parameters")
        return self._status_dto(self._row())

    def provision(self, params: Any) -> dict[str, Any]:
        _require_exact_object(params, keys=set(), label="provision parameters")
        if self.sqlite.read() is not None:
            raise FeedConflictError("S-Lite feed already exists")
        with self.store.transaction():
            provisioned = self.service.provision_feed(
                profile_id=REFERENCE_PROFILE_ID,
                snapshot_id=self.snapshot["snapshot_id"],
                calendar_name=self.calendar_name,
                now=_now(),
            )
            row = self.store.get("subscription_feed", provisioned.feed_id)
            if row is None:
                raise RuntimeError("Foundation failed to provision S-Lite feed")
            row["token_fingerprint"] = row["token_hash_sha256"][:12]
            row.pop("token_prefix", None)
            self.store.upsert_mutable("subscription_feed", row)
            self._validate_persisted_row(row)
            self.sqlite.insert(row)
        return self._issue_dto(provisioned)

    def rotate(self, params: Any) -> dict[str, Any]:
        _require_exact_object(params, keys=set(), label="rotate parameters")
        persisted = self._row()
        feed_id = persisted["feed_id"]
        with self.store.transaction():
            if persisted["status"] == "revoked":
                self.service.set_status(feed_id, "active", now=_now())
            provisioned = self.service.rotate_token(feed_id, now=_now())
            row = self.store.get("subscription_feed", feed_id)
            if row is None:
                raise RuntimeError("Foundation failed to rotate S-Lite feed")
            row["token_fingerprint"] = row["token_hash_sha256"][:12]
            row.pop("token_prefix", None)
            self.store.upsert_mutable("subscription_feed", row)
            self._validate_persisted_row(row)
            self.sqlite.update(row)
        return self._issue_dto(provisioned)

    def revoke(self, params: Any) -> dict[str, Any]:
        _require_exact_object(params, keys=set(), label="revoke parameters")
        persisted = self._row()
        feed_id = persisted["feed_id"]
        with self.store.transaction():
            if persisted["status"] != "revoked":
                self.service.set_status(feed_id, "revoked", now=_now())
            row = self.store.get("subscription_feed", feed_id)
            if row is None:
                raise RuntimeError("Foundation failed to revoke S-Lite feed")
            self._validate_persisted_row(row)
            self.sqlite.update(row)
        return self._status_dto(row)

    def render(self, params: Any) -> dict[str, Any]:
        values = _require_exact_object(
            params,
            keys={"token", "ifNoneMatch"},
            label="render parameters",
        )
        token = values["token"]
        if_none_match = values["ifNoneMatch"]
        if not isinstance(token, str):
            raise BridgeRequestError("invalid feed capability")
        if if_none_match is not None and not isinstance(if_none_match, str):
            raise BridgeRequestError("invalid conditional request")
        row = self._row()
        response = self.service.render_feed(
            row["feed_id"], token, if_none_match=if_none_match
        )
        return {
            "statusCode": response.status_code,
            "headers": dict(response.headers),
            "bodyBase64": base64.b64encode(response.body).decode("ascii"),
        }

    def dispatch(self, request: Any) -> tuple[Any, dict[str, Any]]:
        values = _require_exact_object(
            request,
            keys={"id", "method", "params"},
            label="bridge request",
        )
        request_id = values["id"]
        method = values["method"]
        if not isinstance(request_id, str) or not request_id:
            raise BridgeRequestError("invalid request id")
        handlers = {
            "get_status": self.status,
            "provision_slite": self.provision,
            "rotate_slite": self.rotate,
            "revoke_slite": self.revoke,
            "render_slite": self.render,
        }
        handler = handlers.get(method)
        if handler is None:
            raise BridgeRequestError("unsupported bridge method")
        return request_id, handler(values["params"])

    def close(self) -> None:
        self.sqlite.close()


def _error_code(error: Exception) -> str:
    from noticepilot_subscription_delivery import (  # pylint: disable=import-outside-toplevel
        SubscriptionAuthenticationError,
        SubscriptionFeedUnavailableError,
    )

    if isinstance(error, (SubscriptionAuthenticationError, FeedNotFoundError)):
        return "not_found"
    if isinstance(error, SubscriptionFeedUnavailableError):
        return "not_found" if error.status == "revoked" else "temporarily_unavailable"
    if isinstance(error, FeedConflictError):
        return "conflict"
    if isinstance(error, BridgeRequestError):
        return "invalid_request"
    return "unavailable"


def _write_response(payload: Mapping[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def main() -> int:
    args = _parse_args()
    bridge = SliteFeedBridge(args.foundation_root, args.database_path)
    try:
        for line in sys.stdin:
            request_id: Any = None
            try:
                request = json.loads(line)
                if isinstance(request, dict):
                    request_id = request.get("id")
                request_id, result = bridge.dispatch(request)
                _write_response({"id": request_id, "ok": True, "result": result})
            except Exception as error:  # Keep the protocol alive after bad requests.
                _write_response(
                    {
                        "id": request_id if isinstance(request_id, str) else None,
                        "ok": False,
                        "error": {"code": _error_code(error)},
                    }
                )
    finally:
        bridge.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
