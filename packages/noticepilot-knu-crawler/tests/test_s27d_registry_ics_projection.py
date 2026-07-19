from __future__ import annotations

import json
import re
import subprocess
import tempfile
import unittest
from collections import Counter, defaultdict
from pathlib import Path

from noticepilot_registry_ics_projector import (
    FEEDS,
    MIGRATION_MODE,
    PROJECTION_ID,
    file_sha256,
    materialize_projection,
    persistent_uid,
    projection_content_digest,
    read_jsonl,
    unfold_ical_lines,
    write_projection_snapshot,
)

ROOT = Path(__file__).resolve().parents[1]
CURRENT = ROOT / "derived" / "mvp-policy-v0.1"
REGISTRY = ROOT / "registry" / "s27c-v1"
PROJECTION = ROOT / "projection" / "s27d-v1"
OPAQUE_UID = re.compile(r"^evt_[0-9a-f]{32}@noticepilot\.local$")


def parse_events(text: str):
    events = []
    current = None
    for line in unfold_ical_lines(text):
        if line == "BEGIN:VEVENT":
            current = []
        elif line == "END:VEVENT":
            events.append(current)
            current = None
        elif current is not None:
            current.append(line)
    return events


def event_props(lines):
    result = defaultdict(list)
    for line in lines:
        if ":" in line:
            key, value = line.split(":", 1)
            result[key].append(value)
    return result


class S27DRegistryIcsProjectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((PROJECTION / "manifest.json").read_text(encoding="utf-8"))
        cls.active = read_jsonl(PROJECTION / "active-calendar-event-projections.jsonl")
        cls.uid_map = read_jsonl(PROJECTION / "legacy-candidate-uid-cutover-map.jsonl")
        cls.receipts = read_jsonl(PROJECTION / "outbox-consumption-receipts.jsonl")
        cls.events = read_jsonl(REGISTRY / "calendar-events.jsonl")
        cls.links = read_jsonl(REGISTRY / "calendar-event-source-links.jsonl")
        cls.outbox = read_jsonl(REGISTRY / "projection-outbox-intents.jsonl")

    def test_projection_counts_and_pre_subscription_mode(self):
        self.assertEqual(self.manifest["projectionId"], PROJECTION_ID)
        self.assertEqual(self.manifest["migrationMode"], MIGRATION_MODE)
        self.assertEqual(self.manifest["counts"]["calendarEventCount"], 900)
        self.assertEqual(self.manifest["counts"]["legacyCandidateUidCount"], 909)
        self.assertEqual(self.manifest["counts"]["persistentUidCount"], 900)
        self.assertEqual(self.manifest["counts"]["legacyCancellationTombstoneCount"], 0)

    def test_persistent_uid_is_opaque_and_event_owned(self):
        self.assertEqual(len(self.active), 900)
        self.assertEqual(len({row["uid"] for row in self.active}), 900)
        for row in self.active:
            self.assertRegex(row["uid"], OPAQUE_UID)
            self.assertEqual(row["uid"], persistent_uid(row["calendarEventId"]))
            self.assertNotIn(row["canonicalCandidateId"], row["uid"])

    def test_all_legacy_candidate_uids_have_cutover_records(self):
        self.assertEqual(len(self.uid_map), 909)
        self.assertEqual(len({row["candidateId"] for row in self.uid_map}), 909)
        self.assertEqual(len({row["legacyUid"] for row in self.uid_map}), 909)
        self.assertTrue(all(not row["legacyCancellationTombstoneEmitted"] for row in self.uid_map))
        dispositions = Counter(row["disposition"] for row in self.uid_map)
        self.assertEqual(dispositions["same_event_uid_rekeyed"], 900)
        self.assertEqual(dispositions["duplicate_source_collapsed_into_canonical_event"], 8)
        self.assertEqual(dispositions["superseded_revision_collapsed_into_active_event"], 1)

    def test_all_outbox_intents_are_consumed_once_by_receipt(self):
        self.assertEqual(len(self.outbox), 900)
        self.assertEqual(len(self.receipts), 900)
        self.assertEqual({row["outboxId"] for row in self.outbox}, {row["outboxId"] for row in self.receipts})
        self.assertTrue(all(row["status"] == "consumed" and row["icsSerialized"] for row in self.receipts))

    def test_student_and_job_feed_counts_reflect_only_approved_merges(self):
        expected = {"student_default": (601, 609, -8), "job_application": (299, 300, -1)}
        for feed_scope, values in expected.items():
            report = json.loads((PROJECTION / "feeds" / feed_scope / "ics-projection-report.json").read_text(encoding="utf-8"))
            self.assertEqual((report["eventCount"], report["legacyEventCount"], report["eventCountDelta"]), values)
            self.assertEqual(report["eventCount"], report["uniqueUidCount"])

    def test_extension_preserves_uid_and_serializes_sequence_one(self):
        extension = next(row for row in self.active if row["relationBasis"] == "extension")
        self.assertEqual(extension["sequence"], 1)
        job_text = (PROJECTION / "feeds" / "job_application" / FEEDS["job_application"]["filename"]).read_text(encoding="utf-8")
        props = [event_props(lines) for lines in parse_events(job_text)]
        match = next(p for p in props if p["UID"] == [extension["uid"]])
        self.assertEqual(match["SEQUENCE"], ["1"])
        self.assertEqual(match["STATUS"], ["CONFIRMED"])
        self.assertEqual(match["DTEND;VALUE=DATE"], ["20260220"])

    def test_duplicate_events_have_one_vevent_and_all_source_links(self):
        links_by_event = defaultdict(list)
        for row in self.links:
            links_by_event[row["calendarEventId"]].append(row)
        duplicate = [row for row in self.active if row["relationBasis"] == "duplicate"]
        self.assertEqual(len(duplicate), 8)
        student_text = (PROJECTION / "feeds" / "student_default" / FEEDS["student_default"]["filename"]).read_text(encoding="utf-8")
        props = {p["UID"][0]: p for p in map(event_props, parse_events(student_text))}
        for row in duplicate:
            self.assertEqual(len(links_by_event[row["calendarEventId"]]), 2)
            self.assertEqual(len(props[row["uid"]]["X-NOTICEPILOT-SOURCE-URL"]), 2)

    def test_timed_events_without_end_do_not_invent_duration(self):
        student_text = (PROJECTION / "feeds" / "student_default" / FEEDS["student_default"]["filename"]).read_text(encoding="utf-8")
        count = 0
        for p in map(event_props, parse_events(student_text)):
            if p.get("DTSTART;TZID=Asia/Seoul") and not p.get("DTEND;TZID=Asia/Seoul"):
                count += 1
        self.assertEqual(count, 155)

    def test_all_day_end_is_exclusive(self):
        for feed_scope in FEEDS:
            text = (PROJECTION / "feeds" / feed_scope / FEEDS[feed_scope]["filename"]).read_text(encoding="utf-8")
            for p in map(event_props, parse_events(text)):
                if p.get("DTSTART;VALUE=DATE"):
                    self.assertTrue(p.get("DTEND;VALUE=DATE"))
                    self.assertGreater(p["DTEND;VALUE=DATE"][0], p["DTSTART;VALUE=DATE"][0])

    def test_ics_uses_crlf_and_utf8_octet_folding(self):
        for feed_scope in FEEDS:
            raw = (PROJECTION / "feeds" / feed_scope / FEEDS[feed_scope]["filename"]).read_bytes()
            self.assertTrue(raw.startswith(b"BEGIN:VCALENDAR\r\n"))
            self.assertTrue(raw.endswith(b"END:VCALENDAR\r\n"))
            self.assertTrue(all(len(line) <= 75 for line in raw.split(b"\r\n")))

    def test_manifest_hashes_and_legacy_artifacts_are_stable(self):
        for entry in self.manifest["artifacts"].values():
            self.assertEqual(file_sha256(PROJECTION / entry["path"]), entry["sha256"])
        for feed in self.manifest["feeds"].values():
            self.assertEqual(file_sha256(PROJECTION / feed["ics"]["path"]), feed["ics"]["sha256"])
            self.assertEqual(file_sha256(PROJECTION / feed["report"]["path"]), feed["report"]["sha256"])
        for artifacts in self.manifest["legacyArtifacts"].values():
            for entry in artifacts.values():
                self.assertEqual(file_sha256((PROJECTION / entry["path"]).resolve()), entry["sha256"])
        self.assertEqual(projection_content_digest(PROJECTION), self.manifest["contentDigest"])

    def test_projection_materialization_is_deterministic(self):
        first = materialize_projection(root=ROOT, registry_dir=REGISTRY)
        second = materialize_projection(root=ROOT, registry_dir=REGISTRY)
        self.assertEqual(first["activeRows"], second["activeRows"])
        self.assertEqual(first["uidMap"], second["uidMap"])
        self.assertEqual(first["receipts"], second["receipts"])
        self.assertEqual({k: v["icsText"] for k, v in first["feeds"].items()}, {k: v["icsText"] for k, v in second["feeds"].items()})

    def test_projection_builder_refuses_overwrite(self):
        result = subprocess.run(
            ["python3", str(ROOT / "tools" / "project_s27d_registry_ics.py"), "--root", str(ROOT), "--registry", str(REGISTRY), "--output", str(PROJECTION)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("refusing to overwrite", result.stdout + result.stderr)

    def test_s27d_full_corpus_audit_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run(
                ["python3", str(ROOT / "tools" / "audit_s27d_ics_projection.py"), "--current", str(CURRENT), "--registry", str(REGISTRY), "--projection", str(PROJECTION), "--output-dir", tmp],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            report = json.loads((Path(tmp) / "s27d-ics-projection-audit.json").read_text(encoding="utf-8"))
            self.assertEqual(report["result"], "pass")
            self.assertEqual(report["checks"]["uniquePersistentUidCount"], 900)
            self.assertEqual(report["checks"]["feedErrorCount"], 0)
            self.assertEqual(report["checks"]["layeredBaselineResult"], "match")

    def test_roadmap_marks_s27_complete_and_s28_ready(self):
        roadmap = json.loads((ROOT / "ROADMAP_STATUS.json").read_text(encoding="utf-8"))
        s27 = next(row for row in roadmap["steps"] if row["id"] == "S27")
        s27d = next(row for row in s27["substeps"] if row["id"] == "S27-D")
        s28 = next(row for row in roadmap["steps"] if row["id"] == "S28")
        self.assertEqual(s27["status"], "completed")
        self.assertEqual(s27d["status"], "completed")
        self.assertIn(s28["status"], {"ready", "in_progress", "completed"})
        self.assertIn(roadmap["currentStep"], {"S28", "S29-LIVE-POSTGRES-VERIFY", "S30"})


if __name__ == "__main__":
    unittest.main()
