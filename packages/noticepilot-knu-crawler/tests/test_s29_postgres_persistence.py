from __future__ import annotations

import json
import unittest
from copy import deepcopy
from pathlib import Path

from noticepilot_postgres_persistence import (
    BOOTSTRAP_TABLE_ORDER,
    MIGRATION_VERSION,
    InMemoryPostgresReferenceStore,
    PostgresBootstrapBundle,
    PostgresPersistenceError,
    build_foundation_bootstrap_bundle,
    canonical_sha256,
    dbapi_bootstrap,
    execute_migration,
    file_sha256,
    validate_migration_sql,
)

from tools.audit_s29_postgres_runtime import build_report

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations/postgresql/0001_s29_initial.sql"


class RecordingCursor:
    def __init__(
        self,
        fail_after: int | None = None,
        *,
        migration_table_exists: bool = False,
        recorded_checksum: str | None = None,
        untracked_tables_exist: bool = False,
    ) -> None:
        self.calls: list[tuple[str, object]] = []
        self.rowcount = 1
        self.fail_after = fail_after
        self.migration_table_exists = migration_table_exists
        self.recorded_checksum = recorded_checksum
        self.untracked_tables_exist = untracked_tables_exist
        self._next_result = None

    def execute(self, sql: str, params=None) -> None:
        self.calls.append((sql, params))
        if self.fail_after is not None and len(self.calls) > self.fail_after:
            raise RuntimeError("injected dbapi error")
        if "to_regclass" in sql:
            self._next_result = (
                "noticepilot.schema_migration" if self.migration_table_exists else None,
            )
        elif "SELECT checksum_sha256" in sql:
            self._next_result = (self.recorded_checksum,) if self.recorded_checksum else None
        elif "SELECT EXISTS" in sql:
            self._next_result = (self.untracked_tables_exist,)
        else:
            self._next_result = None

    def fetchone(self):
        result = self._next_result
        self._next_result = None
        return result


class RecordingConnection:
    def __init__(
        self,
        fail_after: int | None = None,
        *,
        migration_table_exists: bool = False,
        recorded_checksum: str | None = None,
        untracked_tables_exist: bool = False,
    ) -> None:
        self.cursor_object = RecordingCursor(
            fail_after,
            migration_table_exists=migration_table_exists,
            recorded_checksum=recorded_checksum,
            untracked_tables_exist=untracked_tables_exist,
        )
        self.commits = 0
        self.rollbacks = 0

    def cursor(self) -> RecordingCursor:
        return self.cursor_object

    def commit(self) -> None:
        self.commits += 1

    def rollback(self) -> None:
        self.rollbacks += 1


class S29PostgresPersistenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.bundle = build_foundation_bootstrap_bundle(ROOT)

    def test_migration_has_required_postgres_contract_and_no_raw_token_column(self) -> None:
        sql = MIGRATION.read_text(encoding="utf-8")
        validate_migration_sql(sql)
        self.assertIn("jsonb", sql)
        self.assertIn("DEFERRABLE INITIALLY DEFERRED", sql)
        self.assertNotIn("raw_token", sql.lower())
        self.assertNotIn("token_plaintext", sql.lower())

    def test_bootstrap_counts_match_foundation_23(self) -> None:
        self.assertEqual(
            self.bundle.counts,
            {
                "source_notice": 2059,
                "extraction_run": 2059,
                "calendar_event_candidate": 1304,
                "calendar_event": 900,
                "calendar_event_revision": 901,
                "calendar_event_source_link": 909,
                "candidate_event_assignment": 909,
                "cross_notice_relation_decision": 343,
                "subscription_profile_revision": 2,
                "subscription_profile_head": 2,
                "feed_snapshot": 2,
                "feed_snapshot_event": 900,
            },
        )

    def test_bootstrap_is_atomic_and_relationally_valid(self) -> None:
        store = InMemoryPostgresReferenceStore()
        inserted = store.bootstrap(self.bundle)
        self.assertEqual(inserted, self.bundle.counts)
        store.validate_relational_integrity()
        self.assertEqual(store.count("calendar_event"), 900)
        self.assertEqual(store.count("feed_snapshot_event"), 900)

    def test_bootstrap_is_idempotent(self) -> None:
        store = InMemoryPostgresReferenceStore()
        store.bootstrap(self.bundle)
        second = store.bootstrap(self.bundle)
        self.assertTrue(all(value == 0 for value in second.values()))

    def test_bootstrap_rolls_back_all_tables_on_failure(self) -> None:
        store = InMemoryPostgresReferenceStore()
        with self.assertRaises(PostgresPersistenceError):
            store.bootstrap(self.bundle, fail_after_table="calendar_event")
        self.assertTrue(all(store.count(table) == 0 for table in BOOTSTRAP_TABLE_ORDER))

    def test_immutable_conflict_is_rejected(self) -> None:
        store = InMemoryPostgresReferenceStore()
        row = deepcopy(self.bundle.tables["source_notice"][0])
        store.insert_immutable("source_notice", row)
        row["title"] += " changed"
        with self.assertRaises(PostgresPersistenceError):
            store.insert_immutable("source_notice", row)

    def test_each_event_has_one_active_revision_and_canonical_source(self) -> None:
        store = InMemoryPostgresReferenceStore()
        store.bootstrap(self.bundle)
        active = {}
        for row in store.rows("calendar_event_revision"):
            if row["active"]:
                active[row["calendar_event_id"]] = active.get(row["calendar_event_id"], 0) + 1
        canonical = {}
        for row in store.rows("calendar_event_source_link"):
            if row["canonical"] and row["active_source"]:
                canonical[row["calendar_event_id"]] = canonical.get(row["calendar_event_id"], 0) + 1
        self.assertEqual(set(active.values()), {1})
        self.assertEqual(set(canonical.values()), {1})
        self.assertEqual(len(active), 900)
        self.assertEqual(len(canonical), 900)

    def test_migration_checksum_conflict_is_rejected(self) -> None:
        store = InMemoryPostgresReferenceStore()
        checksum = file_sha256(MIGRATION)
        store.apply_migration(version=MIGRATION_VERSION, checksum_sha256=checksum)
        store.apply_migration(version=MIGRATION_VERSION, checksum_sha256=checksum)
        with self.assertRaises(PostgresPersistenceError):
            store.apply_migration(version=MIGRATION_VERSION, checksum_sha256="0" * 64)

    def test_dbapi_migration_commits_and_records_checksum(self) -> None:
        connection = RecordingConnection()
        checksum = execute_migration(connection, MIGRATION)
        self.assertEqual(checksum, file_sha256(MIGRATION))
        self.assertEqual(connection.commits, 1)
        self.assertEqual(connection.rollbacks, 0)
        sql_calls = [sql for sql, _ in connection.cursor_object.calls]
        self.assertTrue(any("CREATE TABLE noticepilot.source_notice" in sql for sql in sql_calls))
        self.assertTrue(any("INSERT INTO noticepilot.schema_migration" in sql for sql in sql_calls))

    def test_dbapi_migration_identical_rerun_skips_ddl(self) -> None:
        checksum = file_sha256(MIGRATION)
        connection = RecordingConnection(
            migration_table_exists=True,
            recorded_checksum=checksum,
        )
        self.assertEqual(execute_migration(connection, MIGRATION), checksum)
        self.assertEqual(connection.commits, 1)
        self.assertEqual(connection.rollbacks, 0)
        self.assertFalse(
            any("CREATE TABLE noticepilot.source_notice" in sql for sql, _ in connection.cursor_object.calls)
        )

    def test_dbapi_migration_checksum_conflict_rolls_back(self) -> None:
        connection = RecordingConnection(
            migration_table_exists=True,
            recorded_checksum="0" * 64,
        )
        with self.assertRaises(PostgresPersistenceError):
            execute_migration(connection, MIGRATION)
        self.assertEqual(connection.commits, 0)
        self.assertEqual(connection.rollbacks, 1)

    def test_dbapi_migration_rejects_untracked_existing_tables(self) -> None:
        connection = RecordingConnection(untracked_tables_exist=True)
        with self.assertRaises(PostgresPersistenceError):
            execute_migration(connection, MIGRATION)
        self.assertEqual(connection.commits, 0)
        self.assertEqual(connection.rollbacks, 1)

    def test_dbapi_bootstrap_rolls_back_on_driver_error(self) -> None:
        tables = {table: tuple() for table in BOOTSTRAP_TABLE_ORDER}
        tables["source_notice"] = (self.bundle.tables["source_notice"][0],)
        mini = PostgresBootstrapBundle(
            schema_version=self.bundle.schema_version,
            generated_at=self.bundle.generated_at,
            source_context=self.bundle.source_context,
            tables=tables,
            counts={table: len(rows) for table, rows in tables.items()},
            integrity=self.bundle.integrity,
        )
        connection = RecordingConnection(fail_after=0)
        with self.assertRaises(RuntimeError):
            dbapi_bootstrap(connection, mini)
        self.assertEqual(connection.commits, 0)
        self.assertEqual(connection.rollbacks, 1)

    def test_bootstrap_manifest_is_machine_readable(self) -> None:
        manifest = self.bundle.to_manifest()
        self.assertEqual(manifest["schemaVersion"], "noticepilot.postgresBootstrapBundle.v0.1")
        self.assertEqual(manifest["tableOrder"], list(BOOTSTRAP_TABLE_ORDER))
        for value in manifest["integrity"].values():
            self.assertRegex(value, r"^[0-9a-f]{64}$")

    def test_full_s29_audit_passes(self) -> None:
        report = build_report(ROOT)
        self.assertEqual(report["result"], "pass", report["errors"])
        self.assertEqual(report["counts"]["source_notice"], 2059)
        self.assertEqual(report["counts"]["studentRenderedEventCount"], 601)
        self.assertFalse(report["environment"]["liveDatabaseExecutionPerformed"])

    def test_roadmap_records_completed_live_postgres_verification(self) -> None:
        roadmap = json.loads((ROOT / "ROADMAP_STATUS.json").read_text(encoding="utf-8"))
        s29 = next(row for row in roadmap["steps"] if row["id"] == "S29")
        s30 = next(row for row in roadmap["steps"] if row["id"] == "S30")
        self.assertEqual(s29["status"], "completed")
        self.assertEqual(s29["substeps"][-1]["status"], "completed_live_verified")
        self.assertTrue(s29["substeps"][-1]["bootstrapAndRerunVerified"])
        self.assertTrue(s29["substeps"][-1]["constraintAndRollbackVerified"])
        self.assertEqual(s29["completionEvidence"]["path"], "runtime/s29-v1/live-postgres-verification.json")
        self.assertEqual(s29["completionEvidence"]["reportSha256"], "eb66e820ac8885296a4389889519fe78a53a22d7eb814625dafe391f1a3dddbf")
        self.assertFalse(s29["completionEvidence"]["mutationsCommitted"])
        self.assertEqual(s30["status"], "in_progress")
        self.assertEqual(roadmap["activeSubstep"], "S30-B")

    def test_live_postgres_report_is_registered_in_runtime_manifest(self) -> None:
        report_path = ROOT / "runtime/s29-v1/live-postgres-verification.json"
        report = json.loads(report_path.read_text(encoding="utf-8"))
        manifest = json.loads((ROOT / "runtime/s29-v1/manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(report["status"], "pass")
        self.assertTrue(report["livePostgresVerified"])
        self.assertEqual(report["probeResidue"], [])
        self.assertFalse(report["mutationsCommitted"])
        self.assertEqual(report["reportSha256"], "eb66e820ac8885296a4389889519fe78a53a22d7eb814625dafe391f1a3dddbf")
        report_core = {k: v for k, v in report.items() if k not in {"generatedAt", "reportSha256"}}
        self.assertEqual(report["reportSha256"], canonical_sha256(report_core))
        self.assertEqual(manifest["liveVerification"]["reportSha256"], report["reportSha256"])
        self.assertEqual(manifest["artifacts"]["live-postgres-verification.json"]["sha256"], file_sha256(report_path))
        expected_manifest_hash = canonical_sha256({k: v for k, v in manifest.items() if k != "manifestHash"})
        self.assertEqual(manifest["manifestHash"], expected_manifest_hash)


if __name__ == "__main__":
    unittest.main()
