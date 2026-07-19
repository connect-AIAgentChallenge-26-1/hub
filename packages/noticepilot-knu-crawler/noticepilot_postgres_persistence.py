#!/usr/bin/env python3
"""S29 PostgreSQL persistence contract and foundation bootstrap loader.

The module has no hard dependency on a PostgreSQL driver. Production callers
supply a PEP-249 compatible connection. Tests and audits use the in-memory
reference store, which enforces the same primary-key, immutable-row, and atomic
transaction invariants.
"""
from __future__ import annotations

import hashlib
import json
import re
from contextlib import contextmanager
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Iterator, Mapping, MutableMapping, Sequence

PERSISTENCE_SCHEMA_VERSION = "noticepilot.postgresPersistence.v0.1"
BOOTSTRAP_SCHEMA_VERSION = "noticepilot.postgresBootstrapBundle.v0.1"
MIGRATION_VERSION = "0001_s29_initial"
MIGRATION_RELATIVE_PATH = "migrations/postgresql/0001_s29_initial.sql"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
SOURCE_NOTICE_ID_RE = re.compile(r"^knu-(\d+)-(\d+)$")


class PostgresPersistenceError(RuntimeError):
    pass


class PostgresPersistenceValidationError(ValueError):
    pass


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def canonical_sha256(value: Any) -> str:
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _copy(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False))


def _require_sha256(value: str, field: str) -> str:
    if not isinstance(value, str) or not SHA256_RE.fullmatch(value):
        raise PostgresPersistenceValidationError(f"{field} must be lowercase SHA-256")
    return value


def _parse_source_notice_id(source_notice_id: str) -> tuple[str, str]:
    match = SOURCE_NOTICE_ID_RE.fullmatch(source_notice_id or "")
    if not match:
        raise PostgresPersistenceValidationError(f"unsupported sourceNoticeId: {source_notice_id}")
    return match.group(1), match.group(2)


def validate_migration_sql(sql: str) -> None:
    required_fragments = {
        "CREATE SCHEMA IF NOT EXISTS noticepilot",
        "CREATE TABLE noticepilot.source_notice",
        "CREATE TABLE noticepilot.extraction_run",
        "CREATE TABLE noticepilot.calendar_event_candidate",
        "CREATE TABLE noticepilot.calendar_event",
        "CREATE TABLE noticepilot.calendar_event_revision",
        "CREATE TABLE noticepilot.calendar_event_source_link",
        "CREATE TABLE noticepilot.subscription_profile_revision",
        "CREATE TABLE noticepilot.feed_snapshot",
        "CREATE TABLE noticepilot.subscription_feed",
        "CREATE TABLE noticepilot.runtime_outbox",
        "CREATE TABLE noticepilot.crawler_checkpoint",
        "DEFERRABLE INITIALLY DEFERRED",
        "jsonb",
        "timestamptz",
    }
    missing = sorted(fragment for fragment in required_fragments if fragment not in sql)
    if missing:
        raise PostgresPersistenceValidationError(f"migration missing fragments: {missing}")
    forbidden = {"raw_token", "feed_token text", "token_plaintext", "CREATE EXTENSION"}
    leaked = sorted(fragment for fragment in forbidden if fragment.lower() in sql.lower())
    if leaked:
        raise PostgresPersistenceValidationError(f"migration contains forbidden token/extension fragment: {leaked}")
    if not sql.lstrip().startswith("BEGIN;") or not sql.rstrip().endswith("COMMIT;"):
        raise PostgresPersistenceValidationError("migration must be transaction wrapped")


@dataclass(frozen=True)
class PostgresBootstrapBundle:
    schema_version: str
    generated_at: str
    source_context: dict[str, str]
    tables: dict[str, tuple[dict[str, Any], ...]]
    counts: dict[str, int]
    integrity: dict[str, str]

    def to_manifest(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "generatedAt": self.generated_at,
            "sourceContext": _copy(self.source_context),
            "counts": dict(self.counts),
            "integrity": dict(self.integrity),
            "tableOrder": list(BOOTSTRAP_TABLE_ORDER),
        }


BOOTSTRAP_TABLE_ORDER = (
    "source_notice",
    "extraction_run",
    "calendar_event_candidate",
    "calendar_event",
    "calendar_event_revision",
    "calendar_event_source_link",
    "candidate_event_assignment",
    "cross_notice_relation_decision",
    "subscription_profile_revision",
    "subscription_profile_head",
    "feed_snapshot",
    "feed_snapshot_event",
)

PRIMARY_KEYS: dict[str, tuple[str, ...]] = {
    "source_notice": ("source_notice_id",),
    "extraction_run": ("extraction_run_id",),
    "calendar_event_candidate": ("candidate_id",),
    "calendar_event": ("calendar_event_id",),
    "calendar_event_revision": ("revision_id",),
    "calendar_event_source_link": ("calendar_event_id", "source_candidate_id"),
    "candidate_event_assignment": ("candidate_id",),
    "cross_notice_relation_decision": ("relation_decision_id",),
    "subscription_profile_revision": ("profile_id", "profile_revision"),
    "subscription_profile_head": ("profile_id",),
    "feed_snapshot": ("snapshot_id",),
    "feed_snapshot_event": ("snapshot_id", "calendar_event_id"),
    "subscription_feed": ("feed_id",),
    "subscription_feed_snapshot_history": ("feed_id", "snapshot_id", "activated_at"),
    "runtime_outbox": ("outbox_id",),
    "crawler_checkpoint": ("source_key",),
    "source_processing_state": ("source_notice_id",),
}


def _key_for(table: str, row: Mapping[str, Any]) -> tuple[Any, ...]:
    try:
        return tuple(row[field] for field in PRIMARY_KEYS[table])
    except KeyError as exc:
        raise PostgresPersistenceValidationError(f"{table} missing primary key field {exc.args[0]}") from exc


def _load_board_map(root: Path) -> dict[str, dict[str, Any]]:
    rows = json.loads((root / "configs/knu_board_registry.v0.2.json").read_text(encoding="utf-8"))
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        result[str(row["boardId"])] = row
        for alias in row.get("aliasBoardIds", []):
            result[str(alias)] = row
    return result


def _notice_rows(root: Path, *, generated_at: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    documents = read_jsonl(root / "baseline/layered-s26-v1/candidates/notice-candidate-documents.jsonl")
    board_map = _load_board_map(root)
    notices: list[dict[str, Any]] = []
    runs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for doc in documents:
        notice_id = str(doc["sourceNoticeId"])
        if notice_id in seen:
            raise PostgresPersistenceValidationError(f"duplicate source notice document: {notice_id}")
        seen.add(notice_id)
        board_id, post_id = _parse_source_notice_id(notice_id)
        board = board_map.get(board_id)
        if board is None:
            raise PostgresPersistenceValidationError(f"board {board_id} missing from registry")
        content_hash = _require_sha256(str(doc["sourceContentHash"]), "sourceContentHash")
        canonical_board = str(board["boardId"])
        canonical_category = str(board["category"])
        canonical_url = f"https://www.kangwon.ac.kr/ko/bbs/{canonical_board}/detail.do?pstSn={post_id}"
        notice = {
            "source_notice_id": notice_id,
            "institution_id": "kangwon",
            "canonical_board_category": canonical_category,
            "source_post_id": post_id,
            "source_identity_key": f"kangwon:{canonical_category}:{post_id}",
            "title": str(doc.get("sourceTitle") or ""),
            "source_url": doc.get("sourceUrl"),
            "canonical_source_url": canonical_url,
            "published_at": None,
            "fetched_at": None,
            "content_hash": content_hash,
            "semantic_content_hash": None,
            "status": "active",
            "source_revision": 1,
            "payload": _copy(doc),
            "created_at": generated_at,
            "updated_at": generated_at,
        }
        result_hash = canonical_sha256(doc)
        extraction_run_id = f"extrun_{hashlib.sha256((notice_id + ':' + content_hash).encode('utf-8')).hexdigest()[:32]}"
        run = {
            "extraction_run_id": extraction_run_id,
            "source_notice_id": notice_id,
            "source_content_hash": content_hash,
            "extractor_version": str((doc.get("extractor") or {}).get("version") or "unknown"),
            "policy_version": str((doc.get("extractor") or {}).get("policyVersion") or "unknown"),
            "status": "completed",
            "result_hash": result_hash,
            "payload": _copy(doc),
            "started_at": generated_at,
            "completed_at": generated_at,
            "created_at": generated_at,
        }
        notices.append(notice)
        runs.append(run)
    notices.sort(key=lambda row: row["source_notice_id"])
    runs.sort(key=lambda row: row["extraction_run_id"])
    return notices, runs


def _candidate_rows(root: Path, runs: Sequence[Mapping[str, Any]], *, generated_at: str) -> list[dict[str, Any]]:
    run_by_notice = {str(row["source_notice_id"]): str(row["extraction_run_id"]) for row in runs}
    rows: list[dict[str, Any]] = []
    for candidate in read_jsonl(root / "baseline/layered-s26-v1/candidates/layered-candidates.jsonl"):
        notice_id = str(candidate["sourceNoticeId"])
        status = str(candidate.get("status") or "needs_review")
        if status not in {"auto_confirmed", "needs_review", "suppressed"}:
            raise PostgresPersistenceValidationError(f"unsupported candidate status: {status}")
        rows.append({
            "candidate_id": str(candidate["id"]),
            "source_notice_id": notice_id,
            "extraction_run_id": run_by_notice[notice_id],
            "candidate_hash": canonical_sha256(candidate),
            "publishability_status": status,
            "include_in_calendar_feed": bool(candidate.get("includeInCalendarFeed")),
            "payload": _copy(candidate),
            "created_at": generated_at,
            "updated_at": generated_at,
        })
    rows.sort(key=lambda row: row["candidate_id"])
    return rows


def _registry_rows(root: Path) -> dict[str, list[dict[str, Any]]]:
    registry = root / "registry/s27c-v1"
    event_rows = []
    for row in read_jsonl(registry / "calendar-events.jsonl"):
        event_rows.append({
            "calendar_event_id": row["calendarEventId"],
            "canonical_candidate_id": row["canonicalCandidateId"],
            "canonical_source_notice_id": row["canonicalSourceNoticeId"],
            "active_revision_id": row["activeRevisionId"],
            "status": row["status"],
            "sequence": row["sequence"],
            "version": row["version"],
            "relation_basis": row["relationBasis"],
            "projection": _copy(row["projection"]),
            "created_at": row["createdAt"],
            "updated_at": row["updatedAt"],
        })
    revision_rows = []
    kind_map = {"created": "created", "extension": "extended", "extended": "extended", "updated": "updated", "cancelled": "cancelled", "replaced": "replaced"}
    for row in read_jsonl(registry / "calendar-event-revisions.jsonl"):
        raw_kind = str(row["kind"])
        revision_rows.append({
            "revision_id": row["revisionId"],
            "calendar_event_id": row["calendarEventId"],
            "source_candidate_id": row["sourceCandidateId"],
            "previous_revision_id": row["previousRevisionId"],
            "revision_number": row["revisionNumber"],
            "sequence": row["sequence"],
            "kind": kind_map.get(raw_kind, "updated"),
            "active": row["active"],
            "projection": _copy(row["projection"]),
            "evidence_pair_ids": _copy(row.get("evidencePairIds", [])),
            "recorded_at": row["recordedAt"],
        })
    link_rows = []
    for row in read_jsonl(registry / "calendar-event-source-links.jsonl"):
        link_rows.append({
            "calendar_event_id": row["calendarEventId"],
            "source_candidate_id": row["sourceCandidateId"],
            "source_notice_id": row["sourceNoticeId"],
            "canonical": row["canonical"],
            "active_source": row["activeSource"],
            "relation_role": row["relationRole"],
            "source_identity": _copy(row["sourceIdentity"]),
            "observed_source_url": row.get("observedSourceUrl"),
            "canonical_source_url": row.get("canonicalSourceUrl"),
            "published_at": row.get("publishedAt"),
            "decision_rule_ids": _copy(row.get("decisionRuleIds", [])),
            "evidence_pair_ids": _copy(row.get("evidencePairIds", [])),
            "first_observed_at": row["firstObservedAt"],
            "last_observed_at": row["lastObservedAt"],
            "payload": _copy(row),
        })
    assignment_rows = []
    for row in read_jsonl(registry / "candidate-event-assignments.jsonl"):
        assignment_rows.append({
            "candidate_id": row["candidateId"],
            "calendar_event_id": row["calendarEventId"],
            "assignment_kind": row["assignmentRole"],
            "payload": _copy(row),
            "assigned_at": row["assignedAt"],
        })
    relation_rows = []
    for row in read_jsonl(registry / "relation-decisions.jsonl"):
        relation_rows.append({
            "relation_decision_id": row["relationDecisionId"],
            "pair_id": row["pairId"],
            "relation": row["relation"],
            "decision_status": row["decisionStatus"],
            "merge_allowed": row["mergeAllowed"],
            "merge_applied": row["mergeApplied"],
            "canonical_candidate_id": row.get("canonicalCandidateId"),
            "candidate_ids": _copy(row["candidateIds"]),
            "calendar_event_ids": _copy(row["calendarEventIds"]),
            "rule_ids": _copy(row["ruleIds"]),
            "evidence": _copy(row["evidence"]),
            "payload": _copy(row),
            "persisted_at": row["persistedAt"],
        })
    for rows in (event_rows, revision_rows, link_rows, assignment_rows, relation_rows):
        rows.sort(key=lambda item: canonical_json_bytes(item))
    return {
        "calendar_event": event_rows,
        "calendar_event_revision": revision_rows,
        "calendar_event_source_link": link_rows,
        "candidate_event_assignment": assignment_rows,
        "cross_notice_relation_decision": relation_rows,
    }


def _profile_and_snapshot_rows(root: Path) -> dict[str, list[dict[str, Any]]]:
    profiles_doc = json.loads((root / "configs/noticepilot_default_subscription_profiles.v0.1.json").read_text(encoding="utf-8"))
    profile_rows: list[dict[str, Any]] = []
    head_rows: list[dict[str, Any]] = []
    for profile in profiles_doc["profiles"]:
        fingerprint = canonical_sha256(profile)
        profile_rows.append({
            "profile_id": profile["profileId"],
            "profile_revision": profile["profileRevision"],
            "institution_id": profile["institutionId"],
            "status": profile["status"],
            "profile_fingerprint_sha256": fingerprint,
            "payload": _copy(profile),
            "created_at": profile["createdAt"],
            "updated_at": profile["updatedAt"],
        })
        head_rows.append({
            "profile_id": profile["profileId"],
            "current_revision": profile["profileRevision"],
            "status": profile["status"],
            "updated_at": profile["updatedAt"],
        })
    snapshot_rows: list[dict[str, Any]] = []
    membership_rows: list[dict[str, Any]] = []
    for path in sorted((root / "snapshots/s28-v1").glob("*.snapshot.json")):
        snapshot = json.loads(path.read_text(encoding="utf-8"))
        snapshot_rows.append({
            "snapshot_id": snapshot["snapshotId"],
            "snapshot_hash": snapshot["snapshotHash"],
            "profile_id": snapshot["profile"]["profileId"],
            "profile_revision": snapshot["profile"]["profileRevision"],
            "registry_id": snapshot["sourceContext"]["registryId"],
            "projection_id": snapshot["sourceContext"]["projectionId"],
            "event_count": snapshot["feed"]["eventCount"],
            "excluded_event_count": snapshot["feed"]["excludedEventCount"],
            "payload": _copy(snapshot),
            "first_materialized_at": snapshot["generatedAt"],
        })
        for position, event_id in enumerate(snapshot["feed"]["eventIds"]):
            membership_rows.append({
                "snapshot_id": snapshot["snapshotId"],
                "calendar_event_id": event_id,
                "position": position,
            })
    profile_rows.sort(key=lambda row: (row["profile_id"], row["profile_revision"]))
    head_rows.sort(key=lambda row: row["profile_id"])
    snapshot_rows.sort(key=lambda row: row["snapshot_id"])
    membership_rows.sort(key=lambda row: (row["snapshot_id"], row["position"]))
    return {
        "subscription_profile_revision": profile_rows,
        "subscription_profile_head": head_rows,
        "feed_snapshot": snapshot_rows,
        "feed_snapshot_event": membership_rows,
    }


def build_foundation_bootstrap_bundle(
    root: Path,
    *,
    generated_at: str = "2026-07-13T20:30:00+09:00",
) -> PostgresBootstrapBundle:
    root = Path(root)
    notices, runs = _notice_rows(root, generated_at=generated_at)
    candidates = _candidate_rows(root, runs, generated_at=generated_at)
    tables: dict[str, list[dict[str, Any]]] = {
        "source_notice": notices,
        "extraction_run": runs,
        "calendar_event_candidate": candidates,
        **_registry_rows(root),
        **_profile_and_snapshot_rows(root),
    }
    ordered: dict[str, tuple[dict[str, Any], ...]] = {}
    for table in BOOTSTRAP_TABLE_ORDER:
        rows = tables.get(table)
        if rows is None:
            raise PostgresPersistenceValidationError(f"bootstrap table missing: {table}")
        keys = [_key_for(table, row) for row in rows]
        if len(keys) != len(set(keys)):
            raise PostgresPersistenceValidationError(f"duplicate primary key in bootstrap table {table}")
        ordered[table] = tuple(_copy(row) for row in rows)
    counts = {table: len(rows) for table, rows in ordered.items()}
    registry_manifest = json.loads((root / "registry/s27c-v1/manifest.json").read_text(encoding="utf-8"))
    projection_manifest = json.loads((root / "projection/s27d-v1/manifest.json").read_text(encoding="utf-8"))
    snapshot_manifest = json.loads((root / "snapshots/s28-v1/manifest.json").read_text(encoding="utf-8"))
    integrity = {
        "bootstrapBundleSha256": canonical_sha256({table: list(rows) for table, rows in ordered.items()}),
        "registryManifestFileSha256": file_sha256(root / "registry/s27c-v1/manifest.json"),
        "projectionManifestFileSha256": file_sha256(root / "projection/s27d-v1/manifest.json"),
        "snapshotManifestFileSha256": file_sha256(root / "snapshots/s28-v1/manifest.json"),
        "registryIdSha256": hashlib.sha256(str(registry_manifest["registryId"]).encode()).hexdigest(),
        "projectionIdSha256": hashlib.sha256(str(projection_manifest["projectionId"]).encode()).hexdigest(),
        "snapshotSetIdSha256": hashlib.sha256(str(snapshot_manifest["snapshotSetId"]).encode()).hexdigest(),
    }
    return PostgresBootstrapBundle(
        schema_version=BOOTSTRAP_SCHEMA_VERSION,
        generated_at=generated_at,
        source_context={
            "registryId": registry_manifest["registryId"],
            "projectionId": projection_manifest["projectionId"],
            "snapshotSetId": snapshot_manifest["snapshotSetId"],
        },
        tables=ordered,
        counts=counts,
        integrity=integrity,
    )


class InMemoryPostgresReferenceStore:
    """Atomic, idempotent reference store for the PostgreSQL contract."""

    def __init__(self) -> None:
        self.tables: dict[str, dict[tuple[Any, ...], dict[str, Any]]] = {
            table: {} for table in PRIMARY_KEYS
        }
        self.applied_migrations: dict[str, str] = {}

    @contextmanager
    def transaction(self) -> Iterator["InMemoryPostgresReferenceStore"]:
        snapshot = deepcopy((self.tables, self.applied_migrations))
        try:
            yield self
        except Exception:
            self.tables, self.applied_migrations = snapshot
            raise

    def apply_migration(self, *, version: str, checksum_sha256: str) -> None:
        _require_sha256(checksum_sha256, "migration checksum")
        existing = self.applied_migrations.get(version)
        if existing is not None and existing != checksum_sha256:
            raise PostgresPersistenceError("migration checksum conflict")
        self.applied_migrations[version] = checksum_sha256

    def insert_immutable(self, table: str, row: Mapping[str, Any]) -> bool:
        if table not in self.tables:
            raise PostgresPersistenceValidationError(f"unknown table: {table}")
        key = _key_for(table, row)
        stored = self.tables[table].get(key)
        normalized = _copy(row)
        if stored is None:
            self.tables[table][key] = normalized
            return True
        if stored != normalized:
            raise PostgresPersistenceError(f"immutable row conflict in {table}: {key}")
        return False

    def upsert_mutable(self, table: str, row: Mapping[str, Any]) -> None:
        if table not in self.tables:
            raise PostgresPersistenceValidationError(f"unknown table: {table}")
        self.tables[table][_key_for(table, row)] = _copy(row)

    def get(self, table: str, *key: Any) -> dict[str, Any] | None:
        row = self.tables[table].get(tuple(key))
        return _copy(row) if row is not None else None

    def rows(self, table: str) -> list[dict[str, Any]]:
        return [_copy(row) for _, row in sorted(self.tables[table].items(), key=lambda item: repr(item[0]))]

    def count(self, table: str) -> int:
        return len(self.tables[table])

    def bootstrap(self, bundle: PostgresBootstrapBundle, *, fail_after_table: str | None = None) -> dict[str, int]:
        inserted: dict[str, int] = {}
        with self.transaction():
            for table in BOOTSTRAP_TABLE_ORDER:
                count = 0
                for row in bundle.tables[table]:
                    count += int(self.insert_immutable(table, row))
                inserted[table] = count
                if fail_after_table == table:
                    raise PostgresPersistenceError(f"injected bootstrap failure after {table}")
            self.validate_relational_integrity()
        return inserted

    def validate_relational_integrity(self) -> None:
        notices = {key[0] for key in self.tables["source_notice"]}
        runs = {key[0] for key in self.tables["extraction_run"]}
        candidates = {key[0] for key in self.tables["calendar_event_candidate"]}
        events = {key[0] for key in self.tables["calendar_event"]}
        revisions = {key[0] for key in self.tables["calendar_event_revision"]}
        profiles = {(key[0], key[1]) for key in self.tables["subscription_profile_revision"]}
        snapshots = {key[0] for key in self.tables["feed_snapshot"]}
        for row in self.tables["extraction_run"].values():
            if row["source_notice_id"] not in notices:
                raise PostgresPersistenceError("extraction run references missing notice")
        for row in self.tables["calendar_event_candidate"].values():
            if row["source_notice_id"] not in notices or row["extraction_run_id"] not in runs:
                raise PostgresPersistenceError("candidate references missing source/extraction")
        for row in self.tables["calendar_event"].values():
            if row["canonical_candidate_id"] not in candidates or row["canonical_source_notice_id"] not in notices:
                raise PostgresPersistenceError("event references missing canonical source")
            if row["active_revision_id"] not in revisions:
                raise PostgresPersistenceError("event active revision missing")
        active_by_event: dict[str, int] = {}
        for row in self.tables["calendar_event_revision"].values():
            if row["calendar_event_id"] not in events or row["source_candidate_id"] not in candidates:
                raise PostgresPersistenceError("revision references missing event/candidate")
            if row["active"]:
                active_by_event[row["calendar_event_id"]] = active_by_event.get(row["calendar_event_id"], 0) + 1
        if any(active_by_event.get(event_id) != 1 for event_id in events):
            raise PostgresPersistenceError("each event must have exactly one active revision")
        canonical_by_event: dict[str, int] = {}
        for row in self.tables["calendar_event_source_link"].values():
            if row["calendar_event_id"] not in events or row["source_candidate_id"] not in candidates:
                raise PostgresPersistenceError("source link references missing event/candidate")
            if row["canonical"] and row["active_source"]:
                canonical_by_event[row["calendar_event_id"]] = canonical_by_event.get(row["calendar_event_id"], 0) + 1
        if any(canonical_by_event.get(event_id) != 1 for event_id in events):
            raise PostgresPersistenceError("each event must have exactly one active canonical source")
        for row in self.tables["subscription_profile_head"].values():
            if (row["profile_id"], row["current_revision"]) not in profiles:
                raise PostgresPersistenceError("profile head references missing revision")
        for row in self.tables["feed_snapshot"].values():
            if (row["profile_id"], row["profile_revision"]) not in profiles:
                raise PostgresPersistenceError("snapshot references missing profile revision")
        positions: dict[str, set[int]] = {}
        membership_counts: dict[str, int] = {}
        for row in self.tables["feed_snapshot_event"].values():
            if row["snapshot_id"] not in snapshots or row["calendar_event_id"] not in events:
                raise PostgresPersistenceError("snapshot membership references missing row")
            positions.setdefault(row["snapshot_id"], set()).add(row["position"])
            membership_counts[row["snapshot_id"]] = membership_counts.get(row["snapshot_id"], 0) + 1
        for row in self.tables["feed_snapshot"].values():
            snapshot_id = row["snapshot_id"]
            if membership_counts.get(snapshot_id, 0) != row["event_count"]:
                raise PostgresPersistenceError("snapshot event_count mismatch")
            if positions.get(snapshot_id, set()) != set(range(row["event_count"])):
                raise PostgresPersistenceError("snapshot positions are not contiguous")



def _columns_for_rows(rows: Sequence[Mapping[str, Any]]) -> tuple[str, ...]:
    if not rows:
        raise PostgresPersistenceValidationError("cannot derive columns from empty row set")
    columns = tuple(rows[0].keys())
    expected = set(columns)
    for row in rows:
        if set(row) != expected:
            raise PostgresPersistenceValidationError("inconsistent bootstrap row keys")
    return columns


def dbapi_bootstrap(connection: Any, bundle: PostgresBootstrapBundle) -> dict[str, int]:
    """Insert a bootstrap bundle through a PEP-249 PostgreSQL connection.

    JSON values are serialized explicitly. The function uses immutable
    `ON CONFLICT DO NOTHING`; callers should run a subsequent audit to detect
    pre-existing conflicts. The in-memory store provides strict conflict tests.
    """
    inserted: dict[str, int] = {}
    try:
        cursor = connection.cursor()
        for table in BOOTSTRAP_TABLE_ORDER:
            rows = bundle.tables[table]
            if not rows:
                inserted[table] = 0
                continue
            columns = _columns_for_rows(rows)
            placeholders = ",".join(["%s"] * len(columns))
            sql = (
                f"INSERT INTO noticepilot.{table} ({','.join(columns)}) "
                f"VALUES ({placeholders}) ON CONFLICT DO NOTHING"
            )
            count = 0
            for row in rows:
                values = []
                for column in columns:
                    value = row[column]
                    if isinstance(value, (dict, list)):
                        value = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                    values.append(value)
                cursor.execute(sql, tuple(values))
                count += max(int(getattr(cursor, "rowcount", 0) or 0), 0)
            inserted[table] = count
        connection.commit()
        return inserted
    except Exception:
        connection.rollback()
        raise


def _strip_outer_transaction(sql: str) -> str:
    """Remove the migration file's outer BEGIN/COMMIT for runner-owned atomicity."""
    stripped = sql.strip()
    begin_match = re.match(r"^BEGIN\s*;", stripped, flags=re.IGNORECASE)
    commit_match = re.search(r"COMMIT\s*;\s*$", stripped, flags=re.IGNORECASE)
    if not begin_match or not commit_match:
        raise PostgresPersistenceValidationError(
            "migration must contain one outer BEGIN/COMMIT transaction"
        )
    return stripped[begin_match.end():commit_match.start()].strip()


def execute_migration(connection: Any, migration_path: Path) -> str:
    """Apply one tracked migration atomically and skip an identical rerun.

    The runner owns the transaction even though the checked-in SQL retains an
    outer BEGIN/COMMIT for direct psql use.  This prevents DDL from committing
    before the schema_migration row is recorded.
    """
    sql = migration_path.read_text(encoding="utf-8")
    validate_migration_sql(sql)
    migration_body = _strip_outer_transaction(sql)
    checksum = file_sha256(migration_path)
    try:
        cursor = connection.cursor()
        cursor.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))",
            ("noticepilot.schema_migration",),
        )
        cursor.execute(
            "SELECT to_regclass(%s)",
            ("noticepilot.schema_migration",),
        )
        migration_table_row = cursor.fetchone()
        migration_table_exists = bool(migration_table_row and migration_table_row[0])

        if migration_table_exists:
            cursor.execute(
                "SELECT checksum_sha256 FROM noticepilot.schema_migration WHERE version = %s",
                (MIGRATION_VERSION,),
            )
            recorded = cursor.fetchone()
            if recorded is not None:
                recorded_checksum = str(recorded[0]).strip()
                if recorded_checksum != checksum:
                    raise PostgresPersistenceError(
                        f"migration checksum conflict for {MIGRATION_VERSION}: "
                        f"database={recorded_checksum} file={checksum}"
                    )
                connection.commit()
                return checksum

        cursor.execute(
            "SELECT EXISTS ("
            "SELECT 1 FROM pg_class c "
            "JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'noticepilot' "
            "AND c.relkind IN ('r','p') "
            "AND c.relname <> 'schema_migration'"
            ")"
        )
        existing_rows = cursor.fetchone()
        has_untracked_tables = bool(existing_rows and existing_rows[0])
        if has_untracked_tables:
            raise PostgresPersistenceError(
                "noticepilot tables exist without a tracked migration row; "
                "use a fresh test database or explicitly repair schema_migration "
                "after verifying the live schema"
            )

        cursor.execute(migration_body)
        cursor.execute(
            "INSERT INTO noticepilot.schema_migration(version, checksum_sha256) VALUES (%s,%s)",
            (MIGRATION_VERSION, checksum),
        )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    return checksum
