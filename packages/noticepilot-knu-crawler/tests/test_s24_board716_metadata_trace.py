import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import noticepilot_board716_trace_adapter as adapter  # noqa: E402
import noticepilot_mvp_policy_pipeline as policy  # noqa: E402

CONFIG = json.loads((ROOT / "configs" / "noticepilot_mvp_policy.v0.1.json").read_text(encoding="utf-8"))


def board716_notice(*, start="2026-07-10", end="2026-07-17"):
    return {
        "noticeId": "knu-716-s24a",
        "title": "소프트웨어중심대학사업단 기간제 계약직 공개채용 공고",
        "publishedAt": "2026-07-12",
        "extractedText": "채용 세부사항은 첨부파일을 참고하시기 바랍니다.",
        "board": {"boardId": "716", "name": "채용안내", "category": "job_posting"},
        "sourceUrl": "https://www.kangwon.ac.kr/ko/bbs/716/detail.do?pstSn=s24a",
        "contentHash": "s24a",
        "listMetadata": {
            "application_period_start": start,
            "application_period_end": end,
        },
        "campusScope": {
            "campuses": ["chuncheon"],
            "labels": {"chuncheon": "춘천"},
            "scopeType": "campus_specific",
            "confidence": "high",
            "source": "test",
        },
    }


class S24Board716MetadataTraceTests(unittest.TestCase):
    def test_adapter_is_wired(self):
        self.assertIsInstance(
            policy.BOARD716_TRACE_ADAPTER,
            adapter.Board716ListMetadataTraceAdapter,
        )
        self.assertEqual(policy.BOARD716_TRACE_ADAPTER.version, "0.1.0")

    def test_board716_candidate_has_complete_layered_trace(self):
        decision = policy.evaluate_notice(board716_notice(), None, CONFIG)
        candidate = decision["candidates"][0]
        self.assertIsInstance(candidate["sourceSegment"], dict)
        self.assertIsInstance(candidate["temporalMention"], dict)
        self.assertIsInstance(candidate["boundTemporalFact"], dict)
        self.assertIsInstance(candidate["semanticClassification"], dict)
        self.assertEqual(candidate["temporalRole"], "user_action_period")

    def test_board716_trace_has_exact_metadata_rules(self):
        candidate = policy.evaluate_notice(board716_notice(), None, CONFIG)["candidates"][0]
        self.assertEqual(candidate["sourceSegment"]["segmentType"], "label_value")
        self.assertEqual(candidate["sourceSegment"]["labelText"], "접수기간")
        self.assertTrue(candidate["sourceSegment"]["locallyGrounded"])
        self.assertEqual(
            candidate["boundTemporalFact"]["ruleId"],
            "binding.board716.list_metadata.application_period",
        )
        self.assertEqual(
            candidate["semanticClassification"]["ruleId"],
            "semantic.board716.exact_application_period",
        )
        self.assertEqual(candidate["createdBy"], "rule")

    def test_board716_trace_links_are_integral(self):
        candidate = policy.evaluate_notice(board716_notice(), None, CONFIG)["candidates"][0]
        segment_id = candidate["sourceSegment"]["segmentId"]
        mention_id = candidate["temporalMention"]["mentionId"]
        self.assertEqual(candidate["temporalMention"]["segmentId"], segment_id)
        self.assertEqual(candidate["boundTemporalFact"]["segmentId"], segment_id)
        self.assertEqual(candidate["boundTemporalFact"]["sourceNoticeId"], candidate["sourceNoticeId"])
        self.assertIn(mention_id, candidate["boundTemporalFact"]["temporalMentionIds"])
        for key in ("eventType", "actionType", "temporalRole"):
            self.assertEqual(candidate["semanticClassification"][key], candidate[key])

    def test_candidate_identity_and_publication_projection_are_preserved(self):
        notice = board716_notice()
        resolution = policy.list_application_resolution(notice)
        self.assertIsNotNone(resolution)
        legacy = policy.make_candidate(
            notice=notice,
            event_type="job_application_period",
            resolution=resolution,
            target_actor="job_applicant",
            feed_scope="job_application",
            status="publishable",
            reason_codes=["board716_application_period_only", "exact_list_application_period"],
            confidence="high",
        )
        current = policy.evaluate_notice(notice, None, CONFIG)["candidates"][0]
        keys = (
            "id", "uidHint", "eventType", "actionType", "targetActor", "feedScopes",
            "normalizedStart", "normalizedEnd", "status", "includeInCalendarFeed",
            "reasonCodes", "campusScope", "audienceRules", "createdBy",
        )
        for key in keys:
            self.assertEqual(current[key], legacy[key], key)

    def test_metadata_segment_is_counted_in_decision_summary(self):
        decision = policy.evaluate_notice(board716_notice(), None, CONFIG)
        summary = decision["scheduleSegmentSummary"]
        self.assertEqual(summary["typeCounts"].get("label_value"), 1)
        self.assertGreaterEqual(summary["locallyGroundedCount"], 1)

    def test_metadata_segment_is_merged_into_segment_document(self):
        notice = board716_notice()
        decision = policy.evaluate_notice(notice, None, CONFIG)
        document = policy.merge_candidate_source_segments_into_document(
            policy.schedule_segment_document(notice), decision
        )
        candidate_segment_id = decision["candidates"][0]["sourceSegment"]["segmentId"]
        rows = [row for row in document["segments"] if row["segmentId"] == candidate_segment_id]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["labelText"], "접수기간")
        self.assertIn("채용안내 목록 접수기간", rows[0]["text"])

    def test_missing_or_invalid_list_period_does_not_create_trace(self):
        missing = board716_notice(start=None, end=None)
        decision = policy.evaluate_notice(missing, None, CONFIG)
        self.assertEqual(decision["candidates"], [])
        self.assertEqual(decision["disposition"], "needs_review")
        invalid = board716_notice(start="2026-07-20", end="2026-07-10")
        decision = policy.evaluate_notice(invalid, None, CONFIG)
        self.assertEqual(decision["candidates"], [])
        self.assertEqual(decision["disposition"], "needs_review")


if __name__ == "__main__":
    unittest.main()
