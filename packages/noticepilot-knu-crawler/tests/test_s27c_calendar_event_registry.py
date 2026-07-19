from __future__ import annotations

import json
import re
import subprocess
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

from noticepilot_calendar_event_registry import (
    CalendarEventRegistryConflictError,
    DeterministicTestIdIssuer,
    file_sha256,
    materialize_registry,
    registry_content_digest,
    validate_registry_artifacts,
)

ROOT = Path(__file__).resolve().parents[1]
CURRENT = ROOT / "derived" / "mvp-policy-v0.1"
REGISTRY = ROOT / "registry" / "s27c-v1"
S27B = CURRENT / "reports" / "s27b-cross-notice"
OPAQUE = re.compile(r"^(?:evt|evsrc|evrev|evasn|reldec|prom|outbox)_[0-9a-f]{32}$")


def read_jsonl(path: Path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


class S27CCalendarEventRegistryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((REGISTRY / "manifest.json").read_text(encoding="utf-8"))
        cls.artifacts = {
            "events": read_jsonl(REGISTRY / "calendar-events.jsonl"),
            "sourceLinks": read_jsonl(REGISTRY / "calendar-event-source-links.jsonl"),
            "revisions": read_jsonl(REGISTRY / "calendar-event-revisions.jsonl"),
            "assignments": read_jsonl(REGISTRY / "candidate-event-assignments.jsonl"),
            "relationDecisions": read_jsonl(REGISTRY / "relation-decisions.jsonl"),
            "promotionDecisions": read_jsonl(REGISTRY / "promotion-decisions.jsonl"),
            "outbox": read_jsonl(REGISTRY / "projection-outbox-intents.jsonl"),
        }
        cls.views = read_jsonl(S27B / "reconciliation-candidate-views.jsonl")
        cls.decisions = read_jsonl(S27B / "relation-decisions.jsonl")
        cls.plans = read_jsonl(S27B / "merge-plans.jsonl")

    def test_registry_counts_cover_all_publishable_candidates(self):
        counts = self.manifest["counts"]
        self.assertEqual(counts["publishableCandidateCount"], 909)
        self.assertEqual(counts["calendarEventCount"], 900)
        self.assertEqual(counts["candidateAssignmentCount"], 909)
        self.assertEqual(counts["sourceLinkCount"], 909)
        self.assertEqual(counts["revisionCount"], 901)
        self.assertEqual(counts["activeRevisionCount"], 900)

    def test_approved_merge_plans_share_one_event_id(self):
        assignment = {row["candidateId"]: row["calendarEventId"] for row in self.artifacts["assignments"]}
        approved = [row for row in self.plans if row["status"] == "approved"]
        self.assertEqual(len(approved), 9)
        for plan in approved:
            self.assertEqual(len({assignment[candidate_id] for candidate_id in plan["memberCandidateIds"]}), 1)

    def test_nonmerge_candidates_keep_one_to_one_identity(self):
        event_counts = {}
        for row in self.artifacts["assignments"]:
            event_counts[row["calendarEventId"]] = event_counts.get(row["calendarEventId"], 0) + 1
        self.assertEqual(sum(value == 2 for value in event_counts.values()), 9)
        self.assertEqual(sum(value == 1 for value in event_counts.values()), 891)

    def test_duplicate_events_use_specialized_board_canonical_source(self):
        duplicate_events = [row for row in self.artifacts["events"] if row["relationBasis"] == "duplicate"]
        self.assertEqual(len(duplicate_events), 8)
        self.assertTrue(all("-715-" in row["canonicalCandidateId"] or "-721-" in row["canonicalCandidateId"] for row in duplicate_events))
        links_by_event = {}
        for row in self.artifacts["sourceLinks"]:
            links_by_event.setdefault(row["calendarEventId"], []).append(row)
        for event in duplicate_events:
            links = links_by_event[event["calendarEventId"]]
            self.assertEqual(len(links), 2)
            self.assertEqual(sum(row["canonical"] for row in links), 1)
            self.assertEqual({row["relationRole"] for row in links}, {"canonical", "duplicate_source"})

    def test_extension_preserves_event_id_and_revision_history(self):
        extension = [row for row in self.artifacts["events"] if row["relationBasis"] == "extension"]
        self.assertEqual(len(extension), 1)
        event = extension[0]
        history = sorted(
            [row for row in self.artifacts["revisions"] if row["calendarEventId"] == event["calendarEventId"]],
            key=lambda row: row["revisionNumber"],
        )
        self.assertEqual([row["revisionNumber"] for row in history], [1, 2])
        self.assertEqual([row["sequence"] for row in history], [0, 1])
        self.assertFalse(history[0]["active"])
        self.assertTrue(history[1]["active"])
        self.assertEqual(history[1]["previousRevisionId"], history[0]["revisionId"])
        self.assertEqual(history[0]["projection"]["normalizedEnd"], "2026-02-13")
        self.assertEqual(history[1]["projection"]["normalizedEnd"], "2026-02-19")
        self.assertEqual(event["sequence"], 1)

    def test_needs_review_relations_are_persisted_without_merge(self):
        rows = [row for row in self.artifacts["relationDecisions"] if row["relation"] == "needs_review"]
        self.assertEqual(len(rows), 234)
        self.assertTrue(all(not row["mergeApplied"] for row in rows))
        self.assertTrue(all(len(row["calendarEventIds"]) == 2 for row in rows))

    def test_registry_ids_are_opaque_and_do_not_embed_candidate_ids(self):
        candidates = [row["candidateId"] for row in self.views]
        checked = []
        for rows in self.artifacts.values():
            for row in rows:
                for key, value in row.items():
                    if key in {
                        "calendarEventId", "sourceLinkId", "revisionId", "assignmentId",
                        "relationDecisionId", "promotionDecisionId", "outboxId", "activeRevisionId",
                    } and isinstance(value, str):
                        self.assertRegex(value, OPAQUE)
                        checked.append(value)
        self.assertTrue(checked)
        for value in checked:
            self.assertFalse(any(candidate in value for candidate in candidates))

    def test_manifest_hashes_and_content_digest_match(self):
        for entry in self.manifest["artifacts"].values():
            self.assertEqual(file_sha256(REGISTRY / entry["path"]), entry["sha256"])
        self.assertEqual(registry_content_digest(self.artifacts), self.manifest["contentDigest"])

    def test_materialization_is_deterministic_with_injected_opaque_issuer(self):
        first = materialize_registry(
            views=self.views,
            relation_decisions=self.decisions,
            merge_plans=self.plans,
            issuer=DeterministicTestIdIssuer("same-seed"),
            now="2026-07-13T11:30:00+09:00",
        )
        second = materialize_registry(
            views=self.views,
            relation_decisions=self.decisions,
            merge_plans=self.plans,
            issuer=DeterministicTestIdIssuer("same-seed"),
            now="2026-07-13T11:30:00+09:00",
        )
        self.assertEqual(first, second)

    def test_internal_projection_mutation_is_detected(self):
        mutated = deepcopy(self.artifacts)
        mutated["events"][0]["projection"]["title"] += " mutated"
        with self.assertRaises(CalendarEventRegistryConflictError):
            validate_registry_artifacts(mutated, expected_candidate_count=909)

    def test_build_tool_refuses_overwrite(self):
        result = subprocess.run(
            [
                "python3", str(ROOT / "tools" / "build_s27c_calendar_event_registry.py"),
                "--current", str(CURRENT),
                "--registry", str(REGISTRY),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("refusing to overwrite", result.stderr + result.stdout)

    def test_s27c_audit_passes_without_ics_migration(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run(
                [
                    "python3", str(ROOT / "tools" / "audit_s27c_calendar_event_registry.py"),
                    "--current", str(CURRENT),
                    "--registry", str(REGISTRY),
                    "--output-dir", tmp,
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            report = json.loads((Path(tmp) / "s27c-calendar-event-registry-audit.json").read_text(encoding="utf-8"))
            self.assertEqual(report["result"], "pass")
            self.assertEqual(report["checks"]["icsUidMigrationCount"], 0)
            self.assertEqual(report["checks"]["outboxConsumedCount"], 0)
            self.assertEqual(report["checks"]["layeredBaselineResult"], "match")

    def test_roadmap_marks_s27c_complete_and_s27d_ready(self):
        roadmap = json.loads((ROOT / "ROADMAP_STATUS.json").read_text(encoding="utf-8"))
        s27 = next(row for row in roadmap["steps"] if row["id"] == "S27")
        s27c = next(row for row in s27["substeps"] if row["id"] == "S27-C")
        s27d = next(row for row in s27["substeps"] if row["id"] == "S27-D")
        self.assertEqual(s27c["status"], "completed")
        self.assertIn(s27d["status"], {"ready", "completed"})
        self.assertIn(roadmap["currentStep"], {"S27-D", "S28", "S29-LIVE-POSTGRES-VERIFY", "S30"})


if __name__ == "__main__":
    unittest.main()
