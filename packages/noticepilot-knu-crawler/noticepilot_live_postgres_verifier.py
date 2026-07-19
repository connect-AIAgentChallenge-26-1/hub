"""Live PostgreSQL verification for the S29 NoticePilot persistence contract.

The verifier is deliberately non-destructive. Constraint probes run inside
transactions that are rolled back, and temporary identifiers are checked for
residue before the report can pass.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import secrets
from typing import Any, Iterable, Sequence

from noticepilot_postgres_persistence import (
    MIGRATION_VERSION,
    execute_migration,
    file_sha256,
)

VERIFIER_VERSION = "0.1.0"
REPORT_SCHEMA_VERSION = "noticepilot.s29LivePostgresVerification.v0.1"
ADVISORY_LOCK_KEY = "noticepilot.schema_migration"

EXPECTED_SQLSTATES = {
    "check_constraint": "23514",
    "unique_constraint": "23505",
    "foreign_key_constraint": "23503",
}


class LivePostgresVerificationError(RuntimeError):
    """Raised when a live PostgreSQL verification cannot be completed."""


@dataclass(frozen=True)
class VerificationCheck:
    checkId: str
    status: str
    expected: Any
    actual: Any
    detail: str


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _token(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(16)}"


def _sha256_json(value: Any) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _query_one(connection: Any, sql: str, params: Sequence[Any] = ()) -> tuple[Any, ...]:
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        row = cursor.fetchone()
    if row is None:
        raise LivePostgresVerificationError("expected one row but query returned none")
    return tuple(row)


def _query_scalar(connection: Any, sql: str, params: Sequence[Any] = ()) -> Any:
    return _query_one(connection, sql, params)[0]


def _query_count(connection: Any, table_name: str) -> int:
    allowed = {
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
    }
    if table_name not in allowed:
        raise LivePostgresVerificationError(f"unsupported count table: {table_name}")
    return int(_query_scalar(connection, f"SELECT count(*) FROM noticepilot.{table_name}"))


def _expect_sqlstate(
    psycopg: Any,
    dsn: str,
    *,
    check_id: str,
    setup_statements: Iterable[tuple[str, Sequence[Any]]],
    failing_statement: tuple[str, Sequence[Any]],
    expected_sqlstate: str,
) -> VerificationCheck:
    connection = psycopg.connect(dsn)
    actual_sqlstate: str | None = None
    error_name: str | None = None
    try:
        with connection.cursor() as cursor:
            for sql, params in setup_statements:
                cursor.execute(sql, params)
            try:
                cursor.execute(failing_statement[0], failing_statement[1])
            except psycopg.Error as exc:  # type: ignore[attr-defined]
                actual_sqlstate = exc.sqlstate
                error_name = exc.__class__.__name__
            else:
                actual_sqlstate = "no_error"
        connection.rollback()
    finally:
        connection.close()

    passed = actual_sqlstate == expected_sqlstate
    return VerificationCheck(
        checkId=check_id,
        status="pass" if passed else "fail",
        expected=expected_sqlstate,
        actual=actual_sqlstate,
        detail=(
            f"observed {error_name or 'no exception'}; probe transaction rolled back"
        ),
    )


def _source_notice_insert_sql() -> str:
    return """
        INSERT INTO noticepilot.source_notice (
          source_notice_id, institution_id, canonical_board_category,
          source_post_id, source_identity_key, title, source_url,
          canonical_source_url, published_at, fetched_at, content_hash,
          semantic_content_hash, status, source_revision, payload,
          created_at, updated_at
        ) VALUES (
          %s, 'kangwon', 'live_verification', %s, %s,
          'S29 live verification probe', NULL, NULL, NULL, now(),
          %s, NULL, %s, 1, '{}'::jsonb, now(), now()
        )
    """


def verify_live_postgres(*, dsn: str, root: Path) -> dict[str, Any]:
    """Run the non-destructive S29 live PostgreSQL verification suite."""
    if not dsn or not dsn.strip():
        raise LivePostgresVerificationError("dsn is required")
    root = root.resolve()
    migration_path = root / "migrations/postgresql/0001_s29_initial.sql"
    bootstrap_manifest_path = root / "runtime/s29-v1/bootstrap-manifest.json"
    if not migration_path.is_file():
        raise LivePostgresVerificationError(f"migration not found: {migration_path}")
    if not bootstrap_manifest_path.is_file():
        raise LivePostgresVerificationError(
            f"bootstrap manifest not found: {bootstrap_manifest_path}"
        )

    try:
        import psycopg  # type: ignore
    except ImportError as exc:  # pragma: no cover - exercised by CLI environment
        raise LivePostgresVerificationError(
            "psycopg is not installed in this environment"
        ) from exc

    expected_checksum = file_sha256(migration_path)
    bootstrap_manifest = json.loads(bootstrap_manifest_path.read_text(encoding="utf-8"))
    expected_counts = dict(bootstrap_manifest["counts"])
    checks: list[VerificationCheck] = []
    temp_ids: list[tuple[str, str, str]] = []

    with psycopg.connect(dsn) as connection:
        server_version, database_name, database_user = _query_one(
            connection,
            "SELECT version(), current_database(), current_user",
        )
        actual_checksum_row = _query_one(
            connection,
            "SELECT checksum_sha256 FROM noticepilot.schema_migration WHERE version = %s",
            (MIGRATION_VERSION,),
        )
        actual_checksum = str(actual_checksum_row[0]).strip()
        checks.append(
            VerificationCheck(
                checkId="migration_checksum",
                status="pass" if actual_checksum == expected_checksum else "fail",
                expected=expected_checksum,
                actual=actual_checksum,
                detail=f"tracked migration {MIGRATION_VERSION}",
            )
        )

        live_counts = {table: _query_count(connection, table) for table in expected_counts}
        count_mismatches = {
            table: {"expected": expected_counts[table], "actual": live_counts[table]}
            for table in expected_counts
            if int(expected_counts[table]) != live_counts[table]
        }
        checks.append(
            VerificationCheck(
                checkId="bootstrap_row_counts",
                status="pass" if not count_mismatches else "fail",
                expected=expected_counts,
                actual=live_counts,
                detail=(
                    "all bootstrap table counts match"
                    if not count_mismatches
                    else f"count mismatches: {count_mismatches}"
                ),
            )
        )

        columns = {
            str(row[0])
            for row in connection.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='noticepilot' AND table_name='subscription_feed'"
            ).fetchall()
        }
        token_schema_ok = (
            "token_hash_sha256" in columns
            and "token_prefix" in columns
            and not any("raw_token" in column or column == "token" for column in columns)
        )
        checks.append(
            VerificationCheck(
                checkId="token_hash_only_schema",
                status="pass" if token_schema_ok else "fail",
                expected="hash and prefix columns only; no raw token column",
                actual=sorted(columns),
                detail="information_schema inspection",
            )
        )

    # Identical migration rerun must skip DDL and preserve the checksum.
    with psycopg.connect(dsn) as connection:
        rerun_checksum = execute_migration(connection, migration_path)
    checks.append(
        VerificationCheck(
            checkId="migration_identical_rerun",
            status="pass" if rerun_checksum == expected_checksum else "fail",
            expected=expected_checksum,
            actual=rerun_checksum,
            detail="execute_migration returned without reapplying DDL",
        )
    )

    # CHECK violation.
    source_id = _token("livecheck_source")
    temp_ids.append(("source_notice", "source_notice_id", source_id))
    checks.append(
        _expect_sqlstate(
            psycopg,
            dsn,
            check_id="check_constraint_source_notice_status",
            setup_statements=(),
            failing_statement=(
                _source_notice_insert_sql(),
                (
                    source_id,
                    _token("post"),
                    _token("identity"),
                    "0" * 64,
                    "invalid_status",
                ),
            ),
            expected_sqlstate=EXPECTED_SQLSTATES["check_constraint"],
        )
    )

    # UNIQUE violation on source identity.
    identity = _token("identity")
    first_source = _token("liveunique_source")
    second_source = _token("liveunique_source")
    temp_ids.extend(
        [
            ("source_notice", "source_notice_id", first_source),
            ("source_notice", "source_notice_id", second_source),
        ]
    )
    checks.append(
        _expect_sqlstate(
            psycopg,
            dsn,
            check_id="unique_constraint_source_identity",
            setup_statements=(
                (
                    _source_notice_insert_sql(),
                    (first_source, _token("post"), identity, "1" * 64, "active"),
                ),
            ),
            failing_statement=(
                _source_notice_insert_sql(),
                (second_source, _token("post"), identity, "2" * 64, "active"),
            ),
            expected_sqlstate=EXPECTED_SQLSTATES["unique_constraint"],
        )
    )

    # FOREIGN KEY violation.
    extraction_id = _token("livefk_extraction")
    temp_ids.append(("extraction_run", "extraction_run_id", extraction_id))
    checks.append(
        _expect_sqlstate(
            psycopg,
            dsn,
            check_id="foreign_key_extraction_source_notice",
            setup_statements=(),
            failing_statement=(
                """
                INSERT INTO noticepilot.extraction_run (
                  extraction_run_id, source_notice_id, source_content_hash,
                  extractor_version, policy_version, status, result_hash,
                  payload, started_at, completed_at, created_at
                ) VALUES (
                  %s, %s, %s, 'live-verifier', 's29', 'pending', %s,
                  '{}'::jsonb, NULL, NULL, now()
                )
                """,
                (
                    extraction_id,
                    _token("missing_source"),
                    "3" * 64,
                    "4" * 64,
                ),
            ),
            expected_sqlstate=EXPECTED_SQLSTATES["foreign_key_constraint"],
        )
    )

    # Partial UNIQUE index: only one active revision per event.
    with psycopg.connect(dsn) as connection:
        event_id, candidate_id, revision_number = _query_one(
            connection,
            """
            SELECT e.calendar_event_id,
                   e.canonical_candidate_id,
                   COALESCE(MAX(r.revision_number), 0) + 100000
            FROM noticepilot.calendar_event e
            JOIN noticepilot.calendar_event_revision ar
              ON ar.calendar_event_id = e.calendar_event_id AND ar.active
            LEFT JOIN noticepilot.calendar_event_revision r
              ON r.calendar_event_id = e.calendar_event_id
            GROUP BY e.calendar_event_id, e.canonical_candidate_id
            ORDER BY e.calendar_event_id
            LIMIT 1
            """,
        )
    revision_id = _token("liverevision")
    temp_ids.append(("calendar_event_revision", "revision_id", revision_id))
    checks.append(
        _expect_sqlstate(
            psycopg,
            dsn,
            check_id="partial_unique_active_revision",
            setup_statements=(),
            failing_statement=(
                """
                INSERT INTO noticepilot.calendar_event_revision (
                  revision_id, calendar_event_id, source_candidate_id,
                  previous_revision_id, revision_number, sequence, kind, active,
                  projection, evidence_pair_ids, recorded_at
                ) VALUES (
                  %s, %s, %s, NULL, %s, 0, 'updated', true,
                  '{}'::jsonb, '[]'::jsonb, now()
                )
                """,
                (revision_id, event_id, candidate_id, int(revision_number)),
            ),
            expected_sqlstate=EXPECTED_SQLSTATES["unique_constraint"],
        )
    )

    # Partial UNIQUE index: only one active canonical source per event.
    with psycopg.connect(dsn) as connection:
        canonical_event_id, alternate_candidate_id, alternate_notice_id = _query_one(
            connection,
            """
            SELECT e.calendar_event_id, c.candidate_id, c.source_notice_id
            FROM noticepilot.calendar_event e
            JOIN noticepilot.calendar_event_source_link existing
              ON existing.calendar_event_id = e.calendar_event_id
             AND existing.canonical
             AND existing.active_source
            CROSS JOIN LATERAL (
              SELECT candidate_id, source_notice_id
              FROM noticepilot.calendar_event_candidate c
              WHERE NOT EXISTS (
                SELECT 1
                FROM noticepilot.calendar_event_source_link sl
                WHERE sl.calendar_event_id = e.calendar_event_id
                  AND sl.source_candidate_id = c.candidate_id
              )
              ORDER BY candidate_id
              LIMIT 1
            ) c
            ORDER BY e.calendar_event_id
            LIMIT 1
            """,
        )
    temp_ids.append(
        (
            "calendar_event_source_link",
            "calendar_event_id/source_candidate_id",
            f"{canonical_event_id}/{alternate_candidate_id}",
        )
    )
    checks.append(
        _expect_sqlstate(
            psycopg,
            dsn,
            check_id="partial_unique_canonical_source",
            setup_statements=(),
            failing_statement=(
                """
                INSERT INTO noticepilot.calendar_event_source_link (
                  calendar_event_id, source_candidate_id, source_notice_id,
                  canonical, active_source, relation_role, source_identity,
                  observed_source_url, canonical_source_url, published_at,
                  decision_rule_ids, evidence_pair_ids, first_observed_at,
                  last_observed_at, payload
                ) VALUES (
                  %s, %s, %s, true, true, 'canonical', '{}'::jsonb,
                  NULL, NULL, NULL, '[]'::jsonb, '[]'::jsonb,
                  now(), now(), '{}'::jsonb
                )
                """,
                (canonical_event_id, alternate_candidate_id, alternate_notice_id),
            ),
            expected_sqlstate=EXPECTED_SQLSTATES["unique_constraint"],
        )
    )

    # Subscription feed token/status CHECK.
    with psycopg.connect(dsn) as connection:
        profile_id = _query_scalar(
            connection,
            "SELECT profile_id FROM noticepilot.subscription_profile_head ORDER BY profile_id LIMIT 1",
        )
    feed_id = _token("livefeed")
    temp_ids.append(("subscription_feed", "feed_id", feed_id))
    checks.append(
        _expect_sqlstate(
            psycopg,
            dsn,
            check_id="check_constraint_subscription_feed_token_state",
            setup_statements=(),
            failing_statement=(
                """
                INSERT INTO noticepilot.subscription_feed (
                  feed_id, profile_id, current_snapshot_id, calendar_name,
                  status, token_hash_sha256, token_prefix, token_rotated_at,
                  etag, created_at, updated_at
                ) VALUES (
                  %s, %s, NULL, 'S29 live verification', 'active',
                  NULL, NULL, NULL, NULL, now(), now()
                )
                """,
                (feed_id, profile_id),
            ),
            expected_sqlstate=EXPECTED_SQLSTATES["check_constraint"],
        )
    )

    # A multi-statement transaction must fully roll back after a later failure.
    rollback_source_id = _token("liverollback_source")
    rollback_outbox_id = _token("liverollback_outbox")
    temp_ids.extend(
        [
            ("source_notice", "source_notice_id", rollback_source_id),
            ("runtime_outbox", "outbox_id", rollback_outbox_id),
        ]
    )
    connection = psycopg.connect(dsn)
    rollback_error_sqlstate: str | None = None
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                _source_notice_insert_sql(),
                (
                    rollback_source_id,
                    _token("post"),
                    _token("identity"),
                    "5" * 64,
                    "active",
                ),
            )
            cursor.execute(
                """
                INSERT INTO noticepilot.runtime_outbox (
                  outbox_id, aggregate_type, aggregate_id, event_type, payload,
                  status, attempt_count, available_at, claimed_at, delivered_at,
                  last_error, created_at, updated_at
                ) VALUES (
                  %s, 'source_notice', %s, 'live_verification', '{}'::jsonb,
                  'pending', 0, now(), NULL, NULL, NULL, now(), now()
                )
                """,
                (rollback_outbox_id, rollback_source_id),
            )
            try:
                cursor.execute(
                    """
                    INSERT INTO noticepilot.extraction_run (
                      extraction_run_id, source_notice_id, source_content_hash,
                      extractor_version, policy_version, status, result_hash,
                      payload, started_at, completed_at, created_at
                    ) VALUES (
                      %s, %s, %s, 'live-verifier', 's29', 'pending', %s,
                      '{}'::jsonb, NULL, NULL, now()
                    )
                    """,
                    (
                        _token("rollback_extraction"),
                        _token("missing_source"),
                        "6" * 64,
                        "7" * 64,
                    ),
                )
            except psycopg.Error as exc:  # type: ignore[attr-defined]
                rollback_error_sqlstate = exc.sqlstate
        connection.rollback()
    finally:
        connection.close()

    with psycopg.connect(dsn) as connection:
        rollback_source_count = int(
            _query_scalar(
                connection,
                "SELECT count(*) FROM noticepilot.source_notice WHERE source_notice_id = %s",
                (rollback_source_id,),
            )
        )
        rollback_outbox_count = int(
            _query_scalar(
                connection,
                "SELECT count(*) FROM noticepilot.runtime_outbox WHERE outbox_id = %s",
                (rollback_outbox_id,),
            )
        )
    rollback_passed = (
        rollback_error_sqlstate == EXPECTED_SQLSTATES["foreign_key_constraint"]
        and rollback_source_count == 0
        and rollback_outbox_count == 0
    )
    checks.append(
        VerificationCheck(
            checkId="transaction_atomic_rollback",
            status="pass" if rollback_passed else "fail",
            expected={
                "failureSqlstate": EXPECTED_SQLSTATES["foreign_key_constraint"],
                "sourceResidue": 0,
                "outboxResidue": 0,
            },
            actual={
                "failureSqlstate": rollback_error_sqlstate,
                "sourceResidue": rollback_source_count,
                "outboxResidue": rollback_outbox_count,
            },
            detail="source row and outbox row were inserted before forced FK failure",
        )
    )

    # Advisory lock must exclude a competing transaction and release on rollback.
    lock_connection = psycopg.connect(dsn)
    contender_connection = psycopg.connect(dsn)
    first_try: bool | None = None
    second_try: bool | None = None
    try:
        _query_scalar(
            lock_connection,
            "SELECT pg_advisory_xact_lock(hashtext(%s))",
            (ADVISORY_LOCK_KEY,),
        )
        first_try = bool(
            _query_scalar(
                contender_connection,
                "SELECT pg_try_advisory_xact_lock(hashtext(%s))",
                (ADVISORY_LOCK_KEY,),
            )
        )
        lock_connection.rollback()
        second_try = bool(
            _query_scalar(
                contender_connection,
                "SELECT pg_try_advisory_xact_lock(hashtext(%s))",
                (ADVISORY_LOCK_KEY,),
            )
        )
        contender_connection.rollback()
    finally:
        try:
            lock_connection.rollback()
        finally:
            lock_connection.close()
        try:
            contender_connection.rollback()
        finally:
            contender_connection.close()
    advisory_passed = first_try is False and second_try is True
    checks.append(
        VerificationCheck(
            checkId="migration_advisory_lock",
            status="pass" if advisory_passed else "fail",
            expected={"whileHeld": False, "afterRelease": True},
            actual={"whileHeld": first_try, "afterRelease": second_try},
            detail="transaction-scoped advisory lock contention probe",
        )
    )

    # Final residue scan for every generated key.
    residue: list[dict[str, Any]] = []
    with psycopg.connect(dsn) as connection:
        for table, key_spec, value in temp_ids:
            if table == "calendar_event_source_link":
                event_value, candidate_value = value.split("/", 1)
                count = int(
                    _query_scalar(
                        connection,
                        "SELECT count(*) FROM noticepilot.calendar_event_source_link "
                        "WHERE calendar_event_id=%s AND source_candidate_id=%s",
                        (event_value, candidate_value),
                    )
                )
            else:
                allowed_keys = {
                    ("source_notice", "source_notice_id"),
                    ("extraction_run", "extraction_run_id"),
                    ("calendar_event_revision", "revision_id"),
                    ("subscription_feed", "feed_id"),
                    ("runtime_outbox", "outbox_id"),
                }
                if (table, key_spec) not in allowed_keys:
                    raise LivePostgresVerificationError(
                        f"unsupported residue probe: {table}.{key_spec}"
                    )
                count = int(
                    _query_scalar(
                        connection,
                        f"SELECT count(*) FROM noticepilot.{table} WHERE {key_spec}=%s",
                        (value,),
                    )
                )
            if count:
                residue.append(
                    {"table": table, "key": key_spec, "value": value, "count": count}
                )
    checks.append(
        VerificationCheck(
            checkId="verification_probe_residue",
            status="pass" if not residue else "fail",
            expected=[],
            actual=residue,
            detail="all live verification writes must be rolled back",
        )
    )

    status = "pass" if all(check.status == "pass" for check in checks) else "fail"
    report_core = {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "verifierVersion": VERIFIER_VERSION,
        "status": status,
        "livePostgresVerified": status == "pass",
        "database": {
            "name": database_name,
            "user": database_user,
            "serverVersion": server_version,
        },
        "migration": {
            "version": MIGRATION_VERSION,
            "path": str(migration_path.relative_to(root)),
            "sha256": expected_checksum,
        },
        "bootstrap": {
            "expectedCounts": expected_counts,
            "actualCounts": live_counts,
        },
        "checks": [asdict(check) for check in checks],
        "probeResidue": residue,
        "mutationsCommitted": False,
    }
    report = {
        **report_core,
        "generatedAt": _utc_now(),
        "reportSha256": _sha256_json(report_core),
    }
    return report


def validate_live_verification_report(report: dict[str, Any]) -> None:
    if report.get("schemaVersion") != REPORT_SCHEMA_VERSION:
        raise LivePostgresVerificationError("unexpected report schemaVersion")
    checks = report.get("checks")
    if not isinstance(checks, list) or not checks:
        raise LivePostgresVerificationError("report checks must be a non-empty list")
    check_ids = [check.get("checkId") for check in checks]
    if len(check_ids) != len(set(check_ids)):
        raise LivePostgresVerificationError("duplicate verification checkId")
    expected_status = "pass" if all(check.get("status") == "pass" for check in checks) else "fail"
    if report.get("status") != expected_status:
        raise LivePostgresVerificationError("report status does not match checks")
    if bool(report.get("livePostgresVerified")) != (expected_status == "pass"):
        raise LivePostgresVerificationError("livePostgresVerified does not match status")
    if report.get("mutationsCommitted") is not False:
        raise LivePostgresVerificationError("live verification must not commit probe mutations")


__all__ = [
    "ADVISORY_LOCK_KEY",
    "EXPECTED_SQLSTATES",
    "LivePostgresVerificationError",
    "REPORT_SCHEMA_VERSION",
    "VERIFIER_VERSION",
    "VerificationCheck",
    "validate_live_verification_report",
    "verify_live_postgres",
]
