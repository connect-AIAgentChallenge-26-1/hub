import unittest

from noticepilot_live_postgres_verifier import (
    EXPECTED_SQLSTATES,
    LivePostgresVerificationError,
    REPORT_SCHEMA_VERSION,
    validate_live_verification_report,
)


class S29LivePostgresVerifierContractTest(unittest.TestCase):
    def _report(self):
        return {
            "schemaVersion": REPORT_SCHEMA_VERSION,
            "verifierVersion": "0.1.0",
            "status": "pass",
            "livePostgresVerified": True,
            "database": {"name": "test", "user": "test", "serverVersion": "PostgreSQL"},
            "migration": {"version": "0001_s29_initial", "path": "migration.sql", "sha256": "0" * 64},
            "bootstrap": {"expectedCounts": {}, "actualCounts": {}},
            "checks": [
                {
                    "checkId": "migration_checksum",
                    "status": "pass",
                    "expected": "0" * 64,
                    "actual": "0" * 64,
                    "detail": "ok",
                }
            ],
            "probeResidue": [],
            "mutationsCommitted": False,
            "generatedAt": "2026-07-13T00:00:00Z",
            "reportSha256": "1" * 64,
        }

    def test_sqlstate_contract(self):
        self.assertEqual(EXPECTED_SQLSTATES["check_constraint"], "23514")
        self.assertEqual(EXPECTED_SQLSTATES["unique_constraint"], "23505")
        self.assertEqual(EXPECTED_SQLSTATES["foreign_key_constraint"], "23503")

    def test_valid_report(self):
        validate_live_verification_report(self._report())

    def test_duplicate_check_ids_rejected(self):
        report = self._report()
        report["checks"].append(dict(report["checks"][0]))
        with self.assertRaises(LivePostgresVerificationError):
            validate_live_verification_report(report)

    def test_status_must_match_checks(self):
        report = self._report()
        report["checks"][0]["status"] = "fail"
        with self.assertRaises(LivePostgresVerificationError):
            validate_live_verification_report(report)

    def test_probe_mutations_must_not_commit(self):
        report = self._report()
        report["mutationsCommitted"] = True
        with self.assertRaises(LivePostgresVerificationError):
            validate_live_verification_report(report)

    def test_empty_checks_rejected(self):
        report = self._report()
        report["checks"] = []
        with self.assertRaises(LivePostgresVerificationError):
            validate_live_verification_report(report)


if __name__ == "__main__":
    unittest.main()
