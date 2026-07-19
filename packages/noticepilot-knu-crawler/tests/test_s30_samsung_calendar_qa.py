from __future__ import annotations

import copy
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from noticepilot_s30_qa_server import make_handler
from noticepilot_samsung_calendar_qa import (
    PHYSICAL_REPORT_SCHEMA_VERSION,
    QA_PATH,
    audit_ics_bytes,
    audit_lifecycle_fixtures,
    build_automated_qa,
    build_lifecycle_fixtures,
    physical_report_template,
    validate_physical_report,
)

ROOT = Path(__file__).resolve().parents[1]


class S30SamsungCalendarQaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temp = tempfile.TemporaryDirectory()
        cls.output = Path(cls.temp.name) / "s30-v1"
        cls.report = build_automated_qa(ROOT, cls.output)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.temp.cleanup()

    def test_reference_subscription_feeds_pass_automated_qa(self) -> None:
        self.assertEqual(self.report["automatedStatus"], "pass")
        self.assertEqual(self.report["physicalClientStatus"], "pending")
        self.assertFalse(self.report["s30Completed"])
        self.assertEqual(self.report["referenceFeedAudits"]["student_default"]["icsAudit"]["eventCount"], 601)
        self.assertEqual(self.report["referenceFeedAudits"]["job_application"]["icsAudit"]["eventCount"], 299)

    def test_reference_feed_http_and_conditional_get_contract(self) -> None:
        for scope in ("student_default", "job_application"):
            audit = self.report["referenceFeedAudits"][scope]
            self.assertEqual(audit["status"], "pass")
            self.assertEqual(audit["conditionalGet"], {"status": "pass", "statusCode": 304, "bodyLength": 0})

    def test_lifecycle_fixtures_preserve_uid_and_increment_sequence(self) -> None:
        result = audit_lifecycle_fixtures(build_lifecycle_fixtures())
        self.assertEqual(result["status"], "pass")
        check = {row["checkId"]: row for row in result["checks"]}
        self.assertEqual(check["monotonic_sequence"]["actual"], [0, 1, 2])
        self.assertEqual(check["cancelled_status_same_uid"]["actual"], "CANCELLED")

    def test_ics_audit_detects_bare_lf_mutation(self) -> None:
        fixture = build_lifecycle_fixtures()["initial"].replace(b"\r\n", b"\n")
        result = audit_ics_bytes(fixture, expected_event_count=2)
        self.assertEqual(result["status"], "fail")
        checks = {row["checkId"]: row["status"] for row in result["checks"]}
        self.assertEqual(checks["crlf_line_endings"], "fail")

    def test_physical_report_template_fails_closed(self) -> None:
        template = physical_report_template()
        self.assertEqual(template["schemaVersion"], PHYSICAL_REPORT_SCHEMA_VERSION)
        self.assertTrue(validate_physical_report(template))

    def test_static_import_is_not_accepted_as_subscription(self) -> None:
        report = self._valid_physical_report()
        report["subscription"]["mechanism"] = "static_import"
        report["subscription"]["staticImportOnly"] = True
        errors = validate_physical_report(report)
        self.assertTrue(any("static import" in row for row in errors))

    def test_complete_physical_report_contract_can_pass(self) -> None:
        self.assertEqual(validate_physical_report(self._valid_physical_report()), [])

    def test_local_fixture_server_supports_head_etag_and_stage_change(self) -> None:
        server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(self.output))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f"http://127.0.0.1:{server.server_address[1]}{QA_PATH}"
            with urllib.request.urlopen(base) as response:
                initial_body = response.read()
                initial_etag = response.headers["ETag"]
                self.assertEqual(response.status, 200)
                self.assertEqual(response.headers["X-NoticePilot-QA-Stage"], "initial")
            request = urllib.request.Request(base, headers={"If-None-Match": initial_etag})
            with self.assertRaises(urllib.error.HTTPError) as not_modified:
                urllib.request.urlopen(request)
            self.assertEqual(not_modified.exception.code, 304)
            head = urllib.request.Request(base, method="HEAD")
            with urllib.request.urlopen(head) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.read(), b"")
            (self.output / "active-stage.txt").write_text("updated\n", encoding="utf-8")
            with urllib.request.urlopen(base) as response:
                updated_body = response.read()
                updated_etag = response.headers["ETag"]
                self.assertEqual(response.headers["X-NoticePilot-QA-Stage"], "updated")
            self.assertNotEqual(initial_body, updated_body)
            self.assertNotEqual(initial_etag, updated_etag)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)

    def test_packaged_runtime_manifest_tracks_physical_pending(self) -> None:
        manifest = json.loads((ROOT / "runtime/s30-v1/manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["status"], "automated_pass_physical_pending")
        self.assertFalse(manifest["s30Completed"])
        self.assertTrue(manifest["physicalQaRequired"])

    def test_roadmap_exposes_s30_substep_gate(self) -> None:
        roadmap = json.loads((ROOT / "ROADMAP_STATUS.json").read_text(encoding="utf-8"))
        self.assertEqual(roadmap["currentStep"], "S30")
        self.assertEqual(roadmap["activeSubstep"], "S30-B")
        s30 = next(row for row in roadmap["steps"] if row["id"] == "S30")
        self.assertEqual(s30["status"], "in_progress")
        states = {row["id"]: row["status"] for row in s30["substeps"]}
        self.assertEqual(states["S30-A"], "completed")
        self.assertEqual(states["S30-B"], "awaiting_physical_device")

    def _valid_physical_report(self):
        report = copy.deepcopy(physical_report_template())
        report["resultStatus"] = "pass"
        report["device"].update({"model": "Galaxy Test", "androidVersion": "16", "oneUiVersion": "8"})
        report["calendarApp"]["version"] = "test"
        report["subscription"].update({
            "mechanism": "direct_url",
            "urlAccepted": True,
            "staticImportOnly": False,
            "observedRefreshLatencySeconds": 60,
        })
        for row in report["checks"]:
            row["status"] = "pass"
            row["evidence"] = "observed"
        report["completedAt"] = "2026-07-13T22:00:00+09:00"
        return report


if __name__ == "__main__":
    unittest.main()
