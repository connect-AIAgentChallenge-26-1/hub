from __future__ import annotations

import copy
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
for entry in (ROOT, TOOLS):
    if str(entry) not in sys.path:
        sys.path.insert(0, str(entry))

import apply_s24_board716_trace_adaptation as migration  # noqa: E402
import noticepilot_mvp_policy_pipeline as policy  # noqa: E402


def base_document() -> dict[str, object]:
    return {
        "schemaVersion": "noticepilot.scheduleSegments.v0.3",
        "sourceNoticeId": "knu-716-s7",
        "extractor": {"version": "0.1.14", "mode": "structured_schedule_segment_v0.2"},
        "segments": [
            {
                "segmentId": "seg-title",
                "segmentType": "title",
                "locallyGrounded": False,
                "text": "채용 공고",
            },
            {
                "segmentId": "seg-paragraph",
                "segmentType": "paragraph",
                "locallyGrounded": False,
                "text": "첨부파일 참고",
            },
        ],
        "summary": {
            "segmentCount": 99,
            "locallyGroundedCount": 99,
            "typeCounts": {"title": 99},
            "futureMetric": "preserve-me",
        },
    }


def board716_candidate() -> dict[str, object]:
    return {
        "sourceNoticeId": "knu-716-s7",
        "dateText": "2026-07-10~2026-07-17",
        "evidence": "채용안내 목록 접수기간: 2026-07-10~2026-07-17",
        "sourceSegment": {
            "segmentId": "seg-board716-s7",
            "segmentType": "label_value",
            "labelText": "접수기간",
            "locallyGrounded": True,
        },
    }


class S24Board716TraceMigrationTests(unittest.TestCase):
    def test_runtime_characterization_is_deterministic_and_pure(self) -> None:
        notice = {
            "noticeId": "knu-716-s7-characterization",
            "title": "소프트웨어중심대학사업단 기간제 계약직 공개채용 공고",
            "publishedAt": "2026-07-12",
            "extractedText": "채용 세부사항은 첨부파일을 참고하시기 바랍니다.",
            "contentHash": "s7-characterization",
        }
        document = policy.schedule_segment_document(copy.deepcopy(notice))
        self.assertEqual(
            document["summary"],
            {
                "segmentCount": 2,
                "locallyGroundedCount": 0,
                "typeCounts": {"paragraph": 1, "title": 1},
            },
        )
        self.assertEqual(
            list(document["summary"]["typeCounts"]),
            ["paragraph", "title"],
        )

        rows = copy.deepcopy(document["segments"])
        rows_before = copy.deepcopy(rows)
        derived = policy.build_schedule_segment_summary(rows)
        self.assertEqual(rows, rows_before)
        self.assertEqual(derived, document["summary"])

    def test_runtime_and_migration_summaries_match(self) -> None:
        document = base_document()
        candidate = board716_candidate()
        runtime_input = copy.deepcopy(document)
        existing_summary = runtime_input["summary"]
        existing_summary_before = copy.deepcopy(existing_summary)
        runtime_document = policy.merge_candidate_source_segments_into_document(
            runtime_input,
            {"candidates": [copy.deepcopy(candidate)]},
        )
        self.assertEqual(existing_summary, existing_summary_before)
        self.assertIsNot(runtime_document["summary"], existing_summary)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "notice.segments.json"
            path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
            self.assertTrue(migration.append_segment_document(path, copy.deepcopy(candidate)))
            migrated_document = json.loads(path.read_text(encoding="utf-8"))

        self.assertEqual(migrated_document["summary"], runtime_document["summary"])
        self.assertEqual(
            migrated_document["summary"],
            {
                "segmentCount": 3,
                "locallyGroundedCount": 1,
                "typeCounts": {"label_value": 1, "paragraph": 1, "title": 1},
                "futureMetric": "preserve-me",
            },
        )

    def test_stale_summary_is_recomputed_from_all_segments(self) -> None:
        document = base_document()
        candidate = board716_candidate()
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "notice.segments.json"
            path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
            self.assertTrue(migration.append_segment_document(path, candidate))
            updated = json.loads(path.read_text(encoding="utf-8"))

        self.assertEqual(updated["summary"]["segmentCount"], len(updated["segments"]))
        self.assertEqual(updated["summary"]["locallyGroundedCount"], 1)
        self.assertEqual(
            updated["summary"]["typeCounts"],
            {"label_value": 1, "paragraph": 1, "title": 1},
        )

    def test_second_application_preserves_file_bytes_and_sha256(self) -> None:
        document = base_document()
        candidate = board716_candidate()
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "notice.segments.json"
            path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
            self.assertTrue(migration.append_segment_document(path, candidate))
            before = path.read_bytes()
            before_sha = hashlib.sha256(before).hexdigest()
            self.assertFalse(migration.append_segment_document(path, candidate))
            after = path.read_bytes()

        self.assertEqual(after, before)
        self.assertEqual(hashlib.sha256(after).hexdigest(), before_sha)

    def test_existing_segment_with_stale_summary_is_not_repaired(self) -> None:
        document = base_document()
        candidate = board716_candidate()
        existing = dict(candidate["sourceSegment"])
        existing["text"] = candidate["evidence"]
        document["segments"].append(existing)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "notice.segments.json"
            path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
            before = path.read_bytes()
            self.assertFalse(migration.append_segment_document(path, candidate))
            after = path.read_bytes()

        self.assertEqual(after, before)
        self.assertEqual(document["summary"]["segmentCount"], 99)
        self.assertEqual(document["summary"]["futureMetric"], "preserve-me")


if __name__ == "__main__":
    unittest.main()
