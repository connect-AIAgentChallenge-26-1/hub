from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
import copy
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
for entry in (ROOT, TOOLS):
    if str(entry) not in sys.path:
        sys.path.insert(0, str(entry))

import repair_s24_segment_summaries as repair  # noqa: E402


def document(*, stale: bool, notice_id: str = "knu-716-s8") -> dict[str, object]:
    value = {
        "schemaVersion": "noticepilot.scheduleSegments.v0.3",
        "sourceNoticeId": notice_id,
        "segments": [
            {
                "segmentId": "seg-title",
                "segmentType": "title",
                "locallyGrounded": False,
                "text": "채용 공고",
            },
            {
                "segmentId": "seg-board716",
                "segmentType": "label_value",
                "locallyGrounded": True,
                "text": "접수기간: 2026-07-10~2026-07-17",
            },
            {
                "segmentId": "seg-unknown",
                "segmentType": None,
                "locallyGrounded": False,
                "text": "첨부파일 참고",
            },
        ],
        "summary": {
            "segmentCount": 3,
            "locallyGroundedCount": 1,
            "typeCounts": {"label_value": 0, "title": 1, "unknown": 1},
            "futureMetric": "preserve-me",
        },
    }
    if not stale:
        value["summary"]["typeCounts"]["label_value"] = 1
    return value


class Fixture:
    def __init__(self, base: Path, documents: list[dict[str, object]]) -> None:
        self.root = base / "work"
        self.segment_dir = self.root / repair.SEGMENT_DIRECTORY
        self.segment_dir.mkdir(parents=True)
        self.paths: list[Path] = []
        for index, value in enumerate(documents):
            path = self.segment_dir / f"notice-{index}.segments.json"
            path.write_bytes(repair.serialize_document(value))
            self.paths.append(path)
        self.report = base / "evidence" / "report.json"
        self.staging = base / "staging"
        self.staging.mkdir()

    def args(
        self,
        *,
        apply: bool,
        mismatch_count: int,
        staging: Path | None = None,
    ) -> list[str]:
        result = [
            "--root", str(self.root),
            "--apply" if apply else "--dry-run",
            "--expected-document-count", str(len(self.paths)),
            "--expected-mismatch-count", str(mismatch_count),
            "--report", str(self.report),
        ]
        if apply:
            result.extend(["--staging-dir", str(staging or self.staging)])
        return result


def run_main(args: list[str]) -> int:
    with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
        return repair.main(args)


def hashes(paths: list[Path]) -> dict[Path, str]:
    return {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}


class S24SegmentSummaryRepairTests(unittest.TestCase):
    def test_dry_run_preserves_bytes_and_mtimes_and_reports_counts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = Fixture(Path(tmp), [document(stale=True), document(stale=False)])
            before = [(path.read_bytes(), path.stat().st_mtime_ns) for path in fixture.paths]
            self.assertEqual(run_main(fixture.args(apply=False, mismatch_count=1)), 0)
            after = [(path.read_bytes(), path.stat().st_mtime_ns) for path in fixture.paths]
            report = json.loads(fixture.report.read_text(encoding="utf-8"))
        self.assertEqual(after, before)
        self.assertEqual(report["scannedCount"], 2)
        self.assertEqual(report["matchedCount"], 1)
        self.assertEqual(report["mismatchedCount"], 1)
        self.assertEqual(report["modifiedCount"], 0)
        self.assertEqual(report["mismatchFields"], {
            "segmentCount": 0,
            "locallyGroundedCount": 0,
            "typeCounts": 1,
        })

    def test_apply_changes_summary_only_and_does_not_write_correct_document(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = Fixture(Path(tmp), [document(stale=True), document(stale=False)])
            stale_before = json.loads(fixture.paths[0].read_text(encoding="utf-8"))
            correct_before = fixture.paths[1].read_bytes()
            correct_mtime = fixture.paths[1].stat().st_mtime_ns
            self.assertEqual(run_main(fixture.args(apply=True, mismatch_count=1)), 0)
            repaired = json.loads(fixture.paths[0].read_text(encoding="utf-8"))
            correct_after = fixture.paths[1].read_bytes()
            correct_mtime_after = fixture.paths[1].stat().st_mtime_ns
        self.assertEqual(
            repair.without_derived_summary_fields(repaired),
            repair.without_derived_summary_fields(stale_before),
        )
        self.assertEqual(repaired["summary"]["typeCounts"], {
            "label_value": 1,
            "title": 1,
            "unknown": 1,
        })
        self.assertEqual(repaired["summary"]["futureMetric"], "preserve-me")
        self.assertEqual(correct_after, correct_before)
        self.assertEqual(correct_mtime_after, correct_mtime)

    def test_second_apply_is_byte_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            fixture = Fixture(base, [document(stale=True), document(stale=False)])
            self.assertEqual(run_main(fixture.args(apply=True, mismatch_count=1)), 0)
            before = hashes(fixture.paths)
            second_staging = base / "second-staging"
            second_staging.mkdir()
            self.assertEqual(
                run_main(fixture.args(apply=True, mismatch_count=0, staging=second_staging)),
                0,
            )
            after = hashes(fixture.paths)
            report = json.loads(fixture.report.read_text(encoding="utf-8"))
        self.assertEqual(after, before)
        self.assertEqual(report["modifiedCount"], 0)
        self.assertEqual(report["appliedCount"], 0)

    def test_malformed_document_fails_closed_and_records_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = Fixture(Path(tmp), [document(stale=True), document(stale=False)])
            fixture.paths[1].write_text("{malformed", encoding="utf-8")
            before = [path.read_bytes() for path in fixture.paths]
            self.assertEqual(run_main(fixture.args(apply=True, mismatch_count=1)), 1)
            after = [path.read_bytes() for path in fixture.paths]
            report = json.loads(fixture.report.read_text(encoding="utf-8"))
        self.assertEqual(after, before)
        self.assertEqual(report["failurePhase"], "scan")
        self.assertFalse(report["packagingEligible"])
        self.assertEqual(report["appliedCount"], 0)

    def test_serialization_is_deterministic_without_final_newline(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = Fixture(Path(tmp), [document(stale=True)])
            self.assertEqual(run_main(fixture.args(apply=True, mismatch_count=1)), 0)
            content = fixture.paths[0].read_bytes()
            value = json.loads(content.decode("utf-8"))
        self.assertEqual(content, repair.serialize_document(value))
        self.assertFalse(content.endswith(b"\n"))
        self.assertEqual(list(value["summary"]["typeCounts"]), [
            "label_value", "title", "unknown",
        ])

    def test_staging_inside_root_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = Fixture(Path(tmp), [document(stale=True)])
            internal = fixture.root / "staging"
            self.assertEqual(
                run_main(fixture.args(apply=True, mismatch_count=1, staging=internal)),
                1,
            )
            report = json.loads(fixture.report.read_text(encoding="utf-8"))
        self.assertEqual(report["failurePhase"], "preflight")
        self.assertFalse(internal.exists())

    def test_nonempty_staging_is_rejected_without_cleanup(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = Fixture(Path(tmp), [document(stale=True)])
            marker = fixture.staging / "existing.txt"
            marker.write_text("preserve", encoding="utf-8")
            before = fixture.paths[0].read_bytes()
            self.assertEqual(run_main(fixture.args(apply=True, mismatch_count=1)), 1)
            report = json.loads(fixture.report.read_text(encoding="utf-8"))
            after = fixture.paths[0].read_bytes()
            marker_after = marker.read_text(encoding="utf-8")
        self.assertEqual(after, before)
        self.assertEqual(marker_after, "preserve")
        self.assertEqual(report["failurePhase"], "preflight")

    def test_phase_two_failure_records_partial_state_and_retains_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = Fixture(Path(tmp), [document(stale=True)])
            source_before = fixture.paths[0].read_bytes()
            real_replace = repair.os.replace

            def fail_corpus_replace(source: object, destination: object) -> None:
                if Path(destination).resolve() == fixture.paths[0].resolve():
                    raise OSError("injected replacement failure")
                real_replace(source, destination)

            with mock.patch.object(repair.os, "replace", side_effect=fail_corpus_replace):
                self.assertEqual(run_main(fixture.args(apply=True, mismatch_count=1)), 1)
            report = json.loads(fixture.report.read_text(encoding="utf-8"))
            retained = list(fixture.paths[0].parent.glob(".*.s24a-repair-*.tmp"))
            source_after = fixture.paths[0].read_bytes()
        self.assertEqual(source_after, source_before)
        self.assertEqual(report["plannedCount"], 1)
        self.assertEqual(report["attemptedCount"], 1)
        self.assertEqual(report["appliedCount"], 0)
        self.assertEqual(report["failurePhase"], "apply")
        self.assertFalse(report["partialWritePossible"])
        self.assertFalse(report["packagingEligible"])
        self.assertEqual(len(retained), 1)

    def test_success_leaves_no_sibling_temporary_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = Fixture(Path(tmp), [document(stale=True)])
            self.assertEqual(run_main(fixture.args(apply=True, mismatch_count=1)), 0)
            residue = list(fixture.paths[0].parent.glob(".*.s24a-repair-*.tmp"))
        self.assertEqual(residue, [])


if __name__ == "__main__":
    unittest.main()
