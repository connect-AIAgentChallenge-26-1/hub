import json
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path

from noticepilot_mvp_policy_pipeline import (
    build_schedule_segments,
    build_summary,
    candidate_matches_subscription_profile,
    consolidate_same_datetime_candidates,
    consolidate_same_day_precision_candidates,
    consolidate_same_action_range_candidates,
    decision_has_review_work,
    evaluate_notice,
    load_json,
    resolve_date,
    schedule_segment_document,
)
from noticepilot_ics_exporter import build_ics

ROOT = Path(__file__).resolve().parents[1]
CONFIG = load_json(ROOT / "configs" / "noticepilot_mvp_policy.v0.1.json")


def notice(
    notice_id="knu-720-1",
    board_id="720",
    title="테스트 공지",
    body="",
    published="2026-07-01",
    list_metadata=None,
    attachment_required=False,
):
    return {
        "schemaVersion": "noticepilot.normalizedNotice.v0.3",
        "noticeId": notice_id,
        "board": {"boardId": board_id, "name": "테스트", "category": "test"},
        "sourceUrl": f"https://example.test/{notice_id}",
        "title": title,
        "publishedAt": published,
        "timezone": "Asia/Seoul",
        "campusScope": {
            "sourceLabel": "전체",
            "campuses": ["all"],
            "scopeType": "all_campuses",
            "confidence": "high",
            "source": "fixture",
            "labels": {"all": "전체"},
        },
        "listMetadata": list_metadata or {},
        "extractedText": body,
        "attachmentRequiredForFullExtraction": attachment_required,
        "contentHash": "fixture-hash",
    }


class DatePolicyTests(unittest.TestCase):
    def test_explicit_range_is_preserved(self):
        resolved = resolve_date("신청기간: 2026. 7. 1. ~ 7. 15.", date(2026, 7, 1))
        self.assertEqual(resolved.start, "2026-07-01")
        self.assertEqual(resolved.end, "2026-07-15")
        self.assertTrue(resolved.is_all_day)

    def test_publication_relative_deadline_is_computed(self):
        resolved = resolve_date("공고일로부터 10일 이내 제출", date(2026, 7, 1))
        self.assertEqual(resolved.start, "2026-07-11")
        self.assertEqual(resolved.calculation_policy, "publishedAt_plus_n_calendar_days")

    def test_next_day_period_is_computed_inclusively(self):
        resolved = resolve_date("공고일 다음 날부터 10일간 접수", date(2026, 7, 1))
        self.assertEqual((resolved.start, resolved.end), ("2026-07-02", "2026-07-11"))

    def test_invalid_inferred_date_is_rejected_without_crash(self):
        resolved = resolve_date("신청 마감: 2월 31일", date(2026, 2, 1))
        self.assertIsNone(resolved)

    def test_invalid_range_fails_closed_instead_of_becoming_single_date(self):
        resolved = resolve_date("신청기간: 2026. 2. 1. ~ 2. 31.", date(2026, 2, 1))
        self.assertIsNone(resolved)

    def test_valid_leap_day_is_preserved(self):
        resolved = resolve_date("신청 마감: 2028. 2. 29.", date(2028, 2, 1))
        self.assertEqual(resolved.start, "2028-02-29")

    def test_tuition_fraction_is_not_a_date(self):
        resolved = resolve_date("신청학점별 등록금 납부: 해당 학기 등록금의 1/6", date(2026, 1, 1))
        self.assertIsNone(resolved)

    def test_credit_fraction_with_deadline_word_is_not_a_date(self):
        resolved = resolve_date("전체 졸업학점의 1/6까지(소수점 버림)", date(2026, 1, 1))
        self.assertIsNone(resolved)

    def test_real_slash_deadline_is_preserved(self):
        resolved = resolve_date("참가자 모집 마감: ~6/5, 16시", date(2026, 5, 1))
        self.assertEqual(resolved.start, "2026-06-05T16:00:00+09:00")

    def test_range_plus_separate_deadline_fails_closed(self):
        resolved = resolve_date(
            "교육기간: 2026. 8. 3. ~ 8. 7. 모집기간: ~ 2026. 7. 19.",
            date(2026, 7, 1),
        )
        self.assertIsNone(resolved)

    def test_unconnected_event_and_deadline_choose_explicit_deadline(self):
        resolved = resolve_date(
            "설명회 2026. 7. 7. 20시 / 접수 마감 2026. 7. 3. 16시까지",
            date(2026, 7, 1),
        )
        self.assertEqual(resolved.start, "2026-07-03T16:00:00+09:00")

    def test_decimal_score_does_not_extend_date_range(self):
        resolved = resolve_date(
            "교육기간 6/29(월)~7/23(목), IELTS 6.5+ 과정",
            date(2026, 6, 1),
        )
        self.assertEqual((resolved.start, resolved.end), ("2026-06-29", "2026-07-23"))

    def test_numbered_heading_is_not_a_date(self):
        resolved = resolve_date(
            "12. 3. 모집대상: 재학생 4. 1차 선발확정: 2026. 4. 13.",
            date(2026, 3, 1),
        )
        self.assertEqual(resolved.start, "2026-04-13")


    def test_same_day_clock_range_preserves_end_time(self):
        resolved = resolve_date(
            "교육일시: 2026. 8. 20.(목) 14:00~17:00",
            date(2026, 7, 1),
        )
        self.assertEqual(resolved.start, "2026-08-20T14:00:00+09:00")
        self.assertEqual(resolved.end, "2026-08-20T17:00:00+09:00")
        self.assertFalse(resolved.is_all_day)

    def test_korean_hour_clock_range_preserves_end_time(self):
        resolved = resolve_date(
            "특강일시: 2026. 5. 18.(월) 14시~15시",
            date(2026, 5, 1),
        )
        self.assertEqual(resolved.start, "2026-05-18T14:00:00+09:00")
        self.assertEqual(resolved.end, "2026-05-18T15:00:00+09:00")

    def test_single_deadline_24_hour_is_end_of_stated_day(self):
        resolved = resolve_date(
            "신청기한: 2026. 2. 9.(월) 24:00까지",
            date(2026, 2, 1),
        )
        self.assertEqual(resolved.start, "2026-02-09T23:59:00+09:00")
        self.assertIsNone(resolved.end)
        self.assertEqual(resolved.calculation_policy, "end_of_day_24_normalized")

    def test_range_ending_24_hour_remains_all_day_range(self):
        resolved = resolve_date(
            "신청기간: 2026년 4월 1일 ~ 4월 12일 24시까지",
            date(2026, 3, 1),
        )
        self.assertEqual((resolved.start, resolved.end), ("2026-04-01", "2026-04-12"))
        self.assertTrue(resolved.is_all_day)


    def test_range_end_without_year_inherits_start_year(self):
        resolved = resolve_date(
            "신청기간: 2025. 3. 3.(화) ~ 6. 30.(화)",
            date(2026, 2, 20),
        )
        self.assertEqual((resolved.start, resolved.end), ("2025-03-03", "2025-06-30"))

    def test_range_end_without_year_rolls_only_at_new_year(self):
        resolved = resolve_date(
            "운영기간: 2026. 12. 23. ~ 2. 28.",
            date(2026, 12, 1),
        )
        self.assertEqual((resolved.start, resolved.end), ("2026-12-23", "2027-02-28"))

    def test_quoted_short_year_range_is_preserved(self):
        resolved = resolve_date(
            "학생신청: '26. 5. 22. 9시 ~ '26. 6. 22. 18시",
            date(2026, 5, 1),
        )
        self.assertEqual(
            (resolved.start, resolved.end),
            ("2026-05-22T09:00:00+09:00", "2026-06-22T18:00:00+09:00"),
        )

    def test_plain_short_year_cross_year_range_is_preserved(self):
        resolved = resolve_date(
            "교육기간: 2026. 9. 29. ~ 27. 3. 5.",
            date(2026, 7, 1),
        )
        self.assertEqual((resolved.start, resolved.end), ("2026-09-29", "2027-03-05"))

    def test_course_change_label_is_not_revision_metadata(self):
        resolved = resolve_date(
            "수강신청 변경: 2026. 5. 12. 10:00 ~ 5. 14. 18:00",
            date(2026, 5, 1),
        )
        self.assertEqual(
            (resolved.start, resolved.end),
            ("2026-05-12T10:00:00+09:00", "2026-05-14T18:00:00+09:00"),
        )

    def test_compact_weekday_suffix_does_not_break_range(self):
        resolved = resolve_date(
            "접수기간 3.2.월~3.12.목까지",
            date(2026, 3, 1),
        )
        self.assertEqual((resolved.start, resolved.end), ("2026-03-02", "2026-03-12"))

    def test_range_end_time_does_not_leak_to_start_date(self):
        resolved = resolve_date(
            "접수기간: 2026. 2. 13.(금) ~ 3. 8.(일) 23:59까지",
            date(2026, 2, 1),
        )
        self.assertEqual(resolved.start, "2026-02-13T00:00:00+09:00")
        self.assertEqual(resolved.end, "2026-03-08T23:59:00+09:00")
        self.assertEqual(resolved.calculation_policy, "start_of_day_assumed_for_timed_range")

    def test_revision_metadata_date_is_not_calendar_action(self):
        self.assertIsNone(
            resolve_date("1차 변경(2026. 2. 4. 수정)", date(2026, 2, 1))
        )
        self.assertIsNone(
            resolve_date("2026. 3. 1. 기준 재학생만 가능", date(2026, 2, 1))
        )


class MvpPolicyTests(unittest.TestCase):
    def test_student_application_period_is_publishable(self):
        item = notice(
            title="2026학년도 재학생 장학금 신청 안내",
            body="신청기간: 2026. 7. 1. ~ 2026. 7. 15.",
            board_id="721",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "publishable")
        candidate = decision["candidates"][0]
        self.assertEqual(candidate["normalizedEnd"], "2026-07-15")
        self.assertIn("student_default", candidate["feedScopes"])

    def test_future_result_date_is_publishable(self):
        item = notice(
            title="재학생 프로그램 모집 안내",
            body="선정 결과 발표 예정: 2026. 7. 20.",
            published="2026-07-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        candidates = [c for c in decision["candidates"] if c["eventType"] == "result_announcement"]
        self.assertTrue(candidates)
        self.assertTrue(candidates[0]["includeInCalendarFeed"])

    def test_completed_result_notice_is_excluded(self):
        item = notice(
            title="2026년도 자연기술 아이디어 공모전 수상자 발표",
            body="수상자를 다음과 같이 발표합니다. 2026. 7. 10.",
            board_id="504",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "not_calendar_relevant")
        self.assertIn("completed_result_announcement", decision["reasonCodes"])

    def test_board716_application_uses_list_period(self):
        item = notice(
            notice_id="knu-716-1",
            board_id="716",
            title="강원대학교 기간제 직원 채용 공고",
            body="채용 관련 세부사항은 붙임을 확인하세요.",
            list_metadata={
                "application_period_start": "2026-07-01",
                "application_period_end": "2026-07-10",
            },
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "publishable")
        candidate = decision["candidates"][0]
        self.assertEqual(candidate["eventType"], "job_application_period")
        self.assertEqual(candidate["feedScopes"], ["job_application"])

    def test_board716_result_stage_is_excluded(self):
        item = notice(
            notice_id="knu-716-2",
            board_id="716",
            title="강원대학교 기간제 직원 채용 최종합격자 공고",
            body="최종 합격자를 공고합니다.",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "not_calendar_relevant")
        self.assertIn("board716_non_application_stage", decision["reasonCodes"])

    def test_user_specific_relative_date_needs_review(self):
        item = notice(
            title="재학생 장학금 서류 제출 안내",
            body="선정 통보일로부터 7일 이내 서류 제출",
            board_id="721",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertIn("user_specific_relative_date", decision["reasonCodes"])

    def test_ambiguous_date_needs_review(self):
        item = notice(
            title="재학생 프로그램 신청 안내",
            body="신청기간은 7월 중이며 세부 일정은 추후 공지합니다.",
            board_id="504",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertIn("ambiguous_date", decision["reasonCodes"])

    def test_invalid_calendar_date_is_sent_to_review(self):
        item = notice(
            title="재학생 프로그램 신청 안내",
            body="신청기간: 2026. 2. 1. ~ 2. 31.",
            published="2026-02-01",
            board_id="504",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertIn("unresolved_action_date", decision["reasonCodes"])
        self.assertEqual(decision["candidates"], [])

    def test_attachment_number_and_school_year_are_not_a_date(self):
        resolved = resolve_date(
            "붙임 1. 2026학년도 교류수학 안내 1부.",
            date(2026, 7, 1),
        )
        self.assertIsNone(resolved)

    def test_birth_date_range_is_not_actionable_date(self):
        item = notice(
            title="재학생 국제교류 프로그램 참가자 모집",
            body="지원자격: 2001. 9. 1. ~ 2011. 8. 10. 출생자",
            published="2026-04-10",
            board_id="504",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["candidates"], [])

    def test_date_before_publication_is_not_auto_published(self):
        item = notice(
            title="재학생 프로그램 신청 안내",
            body="신청 마감: 2026. 6. 1.",
            published="2026-07-01",
            board_id="504",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertEqual(decision["candidates"], [])
        self.assertIn("date_before_publication", decision["reasonCodes"])

    def test_overlapping_windows_consolidate_same_datetime(self):
        item = notice(
            title="재학생 AI 캠프 참여자 모집",
            body=(
                "사업기간: 2026. 7. 8. ~ 2026. 8. 14.\n"
                "신청기간: 공고 후 ~ 2026. 7. 17.까지"
            ),
            published="2026-07-01",
            board_id="504",
        )
        decision = evaluate_notice(item, None, CONFIG)
        signatures = [
            (c["normalizedStart"], c["normalizedEnd"], c["eventType"])
            for c in decision["candidates"]
        ]
        self.assertIn(("2026-07-08", "2026-08-14", "event"), signatures)
        self.assertIn(("2026-07-17", "2026-07-17", "application_period"), signatures)
        self.assertEqual(len(signatures), 2)

    def test_same_datetime_candidates_are_consolidated(self):
        base = {
            "normalizedStart": "2026-07-15",
            "normalizedEnd": "2026-07-15",
            "isAllDay": True,
            "feedScopes": ["student_default"],
            "reasonCodes": [],
            "evidence": "신청기간: 2026. 7. 15.까지",
        }
        application = dict(base, eventType="application_period", id="a")
        deadline = dict(base, eventType="deadline", id="b", evidence="2026. 7. 15.까지")
        kept, removed = consolidate_same_datetime_candidates([deadline, application])
        self.assertEqual(removed, 1)
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0]["eventType"], "application_period")
        self.assertIn("same_datetime_candidates_consolidated", kept[0]["reasonCodes"])

    def test_typed_academic_candidate_suppresses_generic_deadline_duplicate(self):
        base = {
            "normalizedStart": "2026-06-17T09:00:00+09:00",
            "normalizedEnd": "2026-06-22T18:00:00+09:00",
            "isAllDay": False,
            "feedScopes": ["student_default"],
            "reasonCodes": [],
            "audienceRules": {
                "degreeLevels": [],
                "studentYears": [],
                "enrollmentStatuses": [],
                "admissionTypes": [],
            },
        }
        typed = dict(
            base,
            id="typed",
            eventType="academic_period",
            actionType="course_registration_cancellation",
            evidence="수강신청 취소기간: 2026. 6. 17. ~ 6. 22.",
            sourceSegment={"labelText": "취소기간"},
        )
        generic = dict(
            base,
            id="generic",
            eventType="deadline",
            actionType=None,
            evidence="취소기간: 2026. 6. 17. ~ 6. 22.",
            sourceSegment={"labelText": "취소기간"},
        )
        kept, removed = consolidate_same_datetime_candidates([generic, typed])
        self.assertEqual(removed, 1)
        self.assertEqual([item["id"] for item in kept], ["typed"])


    def test_future_result_label_near_date_overrides_application_context(self):
        item = notice(
            title="재학생 프로그램 모집 안내",
            body="지원 마감: 2026. 3. 29. 합격자 발표: 2026. 4. 1.",
            published="2026-03-01",
            board_id="504",
        )
        decision = evaluate_notice(item, None, CONFIG)
        signatures = {(c["normalizedStart"], c["eventType"]) for c in decision["candidates"]}
        self.assertIn(("2026-04-01", "result_announcement"), signatures)

    def test_event_label_with_spacing_and_dash_overrides_application_context(self):
        item = notice(
            title="카카오테크캠퍼스 수강생 모집",
            body=(
                "온라인 설명회 - 일 시: 2026. 4. 3.(금) 19:00 ~ 20:00\n"
                "신청 마감: 2026. 4. 3.(금) 17:00"
            ),
            published="2026-03-20",
            board_id="504",
        )
        decision = evaluate_notice(item, None, CONFIG)
        event = [c for c in decision["candidates"] if c["normalizedStart"].startswith("2026-04-03T19:00")]
        self.assertTrue(event)
        self.assertEqual(event[0]["eventType"], "event")
        self.assertEqual(event[0]["normalizedEnd"], "2026-04-03T20:00:00+09:00")

    def test_internal_department_forwarding_deadline_is_not_student_feed(self):
        item = notice(
            title="교류수학 신청 안내",
            body=(
                "학생 : 2026. 7. 15.(수) 18:00 까지 소속 학과로 제출\n"
                "학과 : 2026. 7. 16.(목) 16:00 까지 교육지원과로 추천자 서류 제출"
            ),
            published="2026-07-01",
            board_id="720",
        )
        decision = evaluate_notice(item, None, CONFIG)
        student = [c for c in decision["candidates"] if c["normalizedStart"].startswith("2026-07-15")]
        internal = [c for c in decision["candidates"] if c["normalizedStart"].startswith("2026-07-16")]
        self.assertTrue(student and student[0]["includeInCalendarFeed"])
        self.assertTrue(internal and not internal[0]["includeInCalendarFeed"])
        self.assertIn("internal_workflow_deadline", internal[0]["reasonCodes"])
        self.assertIn("internal_workflow_deadline", decision["reasonCodes"])

    def test_publishable_notice_with_review_candidate_enters_review_queue(self):
        decision = {
            "disposition": "publishable",
            "candidates": [
                {"status": "auto_confirmed"},
                {"status": "needs_review"},
            ],
        }
        self.assertTrue(decision_has_review_work(decision))

    def test_precise_timed_candidate_replaces_same_day_all_day_duplicate(self):
        all_day = {
            "normalizedStart": "2026-07-12",
            "normalizedEnd": "2026-07-12",
            "isAllDay": True,
            "feedScopes": ["student_default"],
            "eventType": "application_period",
            "reasonCodes": [],
            "evidence": "모집 마감 7/12",
        }
        timed = {
            "normalizedStart": "2026-07-12T23:59:00+09:00",
            "normalizedEnd": None,
            "isAllDay": False,
            "feedScopes": ["student_default"],
            "eventType": "application_period",
            "reasonCodes": [],
            "evidence": "신청기한 2026.7.12 23:59까지",
        }
        kept, removed = consolidate_same_day_precision_candidates([all_day, timed])
        self.assertEqual(removed, 1)
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0]["normalizedStart"], "2026-07-12T23:59:00+09:00")
        self.assertIn("same_day_precision_candidates_consolidated", kept[0]["reasonCodes"])


    def test_completed_result_followup_is_review_only(self):
        item = notice(
            title="2026학년도 멘토 선발 결과 안내",
            body="사전교육: 2026. 4. 13. 18:00 비대면 실시",
            board_id="721",
            published="2026-04-10",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertEqual(len(decision["candidates"]), 1)
        candidate = decision["candidates"][0]
        self.assertFalse(candidate["includeInCalendarFeed"])
        self.assertIn("post_result_selected_participant_action", candidate["reasonCodes"])

    def test_completed_result_activity_period_is_not_default_feed(self):
        item = notice(
            title="2026학년도 멘토 선발 결과 안내",
            body="활동기간: 2026. 4. 15. ~ 2027. 2. 12.",
            board_id="721",
            published="2026-04-10",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "not_calendar_relevant")
        self.assertEqual(decision["candidates"], [])

    def test_same_action_boundary_single_is_removed_in_favor_of_range(self):
        base = {
            "feedScopes": ["student_default"],
            "reasonCodes": [],
            "uncertaintyReasons": [],
            "status": "auto_confirmed",
            "includeInCalendarFeed": True,
            "confidence": "high",
        }
        period = dict(
            base,
            id="range",
            eventType="application_period",
            normalizedStart="2026-07-01",
            normalizedEnd="2026-07-15",
            isAllDay=True,
        )
        deadline = dict(
            base,
            id="single",
            eventType="application_period",
            normalizedStart="2026-07-15",
            normalizedEnd="2026-07-15",
            isAllDay=True,
        )
        kept, removed, conflicts = consolidate_same_action_range_candidates([period, deadline])
        self.assertEqual((removed, conflicts), (1, 0))
        self.assertEqual([item["id"] for item in kept], ["range"])
        self.assertIn("same_action_boundary_candidates_consolidated", kept[0]["reasonCodes"])

    def test_same_action_interior_date_is_demoted_for_review(self):
        base = {
            "feedScopes": ["student_default"],
            "reasonCodes": [],
            "uncertaintyReasons": [],
            "status": "auto_confirmed",
            "includeInCalendarFeed": True,
            "confidence": "high",
            "isAllDay": True,
        }
        period = dict(
            base,
            id="range",
            eventType="application_period",
            normalizedStart="2026-07-01",
            normalizedEnd="2026-07-15",
        )
        interior = dict(
            base,
            id="single",
            eventType="application_period",
            normalizedStart="2026-07-10",
            normalizedEnd="2026-07-10",
        )
        kept, removed, conflicts = consolidate_same_action_range_candidates([period, interior])
        self.assertEqual((removed, conflicts), (0, 1))
        self.assertTrue(all(item["status"] == "needs_review" for item in kept))
        self.assertTrue(all(not item["includeInCalendarFeed"] for item in kept))

    def test_internal_selection_period_is_not_published(self):
        item = notice(
            title="2026학년도 하계 근로장학생 신청 안내",
            body=(
                "신청기간: 2026. 6. 11. ~ 6. 18.\n"
                "선발 및 후보자 결정기간: 2026. 6. 19. ~ 6. 22."
            ),
            board_id="721",
            published="2026-06-08",
        )
        decision = evaluate_notice(item, None, CONFIG)
        starts = {candidate["normalizedStart"] for candidate in decision["candidates"]}
        self.assertIn("2026-06-11", starts)
        self.assertNotIn("2026-06-19", starts)
        self.assertIn("internal_process_period", decision["reasonCodes"])


    def test_reference_and_revision_metadata_dates_are_not_actions(self):
        self.assertIsNone(resolve_date("공고일('26. 1. 14.) 기준 주소", date(2026, 1, 1)))
        self.assertIsNone(resolve_date("1차 수정(26. 2. 2.)", date(2026, 2, 1)))

    def test_day_only_range_end_is_preserved(self):
        resolved = resolve_date("모집기간: 2026. 1. 23.~27.", date(2026, 1, 1))
        self.assertEqual((resolved.start, resolved.end), ("2026-01-23", "2026-01-27"))

    def test_day_only_range_end_with_deadline_time_is_preserved(self):
        resolved = resolve_date(
            "접수기간: 2026. 2. 10.(화) ~ 11.(수), 17:00",
            date(2026, 2, 1),
        )
        self.assertEqual(resolved.start, "2026-02-10T00:00:00+09:00")
        self.assertEqual(resolved.end, "2026-02-11T17:00:00+09:00")

    def test_fullwidth_weekday_parentheses_preserve_cross_date_time_range(self):
        resolved = resolve_date(
            "일시: 2026. 2. 12.（목） 09:00 ~ 2. 27.（금） 18:00",
            date(2026, 2, 1),
        )
        self.assertEqual(resolved.start, "2026-02-12T09:00:00+09:00")
        self.assertEqual(resolved.end, "2026-02-27T18:00:00+09:00")

    def test_course_credit_notation_is_not_a_date(self):
        self.assertIsNone(resolve_date("교과목 학점 3-3-0", date(2026, 2, 1)))

    def test_multiple_discrete_event_dates_require_review(self):
        item = notice(
            title="재학생 영어 세미나 참가 안내",
            body="세미나는 1/26(월), 1/29(목), 2/2(월) 10:30~12:30 진행됩니다.",
            published="2026-01-10",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertIn("multiple_discrete_event_dates", decision["reasonCodes"])
        self.assertEqual(decision["candidates"], [])

    def test_recurring_daily_time_window_requires_review(self):
        item = notice(
            title="재학생 AI 교육 안내",
            body="교육일정: 2026. 8. 3.(월) ~ 8. 7.(금), 09:30~16:30",
            published="2026-07-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertIn("recurring_time_window_requires_expansion", decision["reasonCodes"])
        self.assertEqual(decision["candidates"], [])

    def test_truncated_date_context_requires_review(self):
        item = notice(
            title="2026학년도 재학생 수강신청 안내",
            body="예비수강신청: 2.12.(",
            published="2026-02-01",
            board_id="720",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertIn("truncated_date_context", decision["reasonCodes"])
        self.assertEqual(decision["candidates"], [])

    def test_general_public_event_is_not_student_feed(self):
        item = notice(
            title="일반시민 대상 무료 기본심폐소생술 교육 안내",
            body="교육일시: 2026. 2. 5. 15:30~17:30",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "not_calendar_relevant")
        self.assertIn("non_student_action_target", decision["reasonCodes"])

    def test_practicum_host_recruitment_is_not_student_feed(self):
        item = notice(
            title="현장실습학기제 실습기관 모집 안내",
            body="실습기관 모집기간: 2026. 1. 15. ~ 1. 30.",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "not_calendar_relevant")
        self.assertIn("non_student_action_target", decision["reasonCodes"])

    def test_completed_approval_list_notice_is_excluded(self):
        item = notice(
            title="2026학년도 전과 승인 명단 알림",
            body="학적 변동 반영일: 2026. 2. 12.",
            board_id="720",
            published="2026-02-10",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "not_calendar_relevant")
        self.assertIn("completed_result_announcement", decision["reasonCodes"])

    def test_explanation_session_near_date_is_classified_as_event(self):
        item = notice(
            title="재학생 장학생 모집 안내",
            body="장학생 모집 설명회는 2026. 1. 12. 오전 10:30 ZOOM으로 진행",
            published="2026-01-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        candidates = [c for c in decision["candidates"] if c["normalizedStart"].startswith("2026-01-12T10:30")]
        self.assertTrue(candidates)
        self.assertEqual(candidates[0]["eventType"], "event")

    def test_truncated_weekday_character_requires_review(self):
        item = notice(
            title="재학생 프로그램 신청 안내",
            body="신청기간: 공고 후 ~ 2026. 7. 17.(금",
            published="2026-07-01",
            board_id="504",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertIn("truncated_date_context", decision["reasonCodes"])
        self.assertEqual(decision["candidates"], [])

    def test_bare_yearless_hyphen_project_code_is_not_date(self):
        resolved = resolve_date(
            "교육생 모집 4-3 강원형 직업·평생 교육체계 구축",
            date(2026, 3, 1),
        )
        self.assertIsNone(resolved)

    def test_open_ended_first_come_period_requires_review(self):
        item = notice(
            title="신입생 어학 특별 프로그램 접수 안내",
            body="접수기간: 1월 9일(금)부터 ~ 선착순 마감",
            published="2026-01-05",
            board_id="504",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertIn("open_ended_application_period", decision["reasonCodes"])
        self.assertEqual(decision["candidates"], [])

    def test_non_student_vendor_recruitment_is_excluded(self):
        item = notice(
            title="2026년 대동제 임시 주류판매자 모집 공고",
            body="제출기한: 2026. 5. 13. 18:00",
            published="2026-05-01",
            board_id="504",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "not_calendar_relevant")
        self.assertIn("non_student_action_target", decision["reasonCodes"])

    def test_recommending_institution_deadline_is_review_only(self):
        item = notice(
            title="장학생 선발 안내",
            body="추천기관 추천 마감일: 2026. 1. 26.(월) 11:00까지 이메일 송부",
            published="2026-01-10",
            board_id="504",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertTrue(decision["candidates"])
        candidate = decision["candidates"][0]
        self.assertFalse(candidate["includeInCalendarFeed"])
        self.assertIn("non_student_local_action", candidate["reasonCodes"])

    def test_selected_participant_followup_is_review_only(self):
        item = notice(
            title="장학생 선발 안내",
            body="추천 대상자로 선정된 지원자는 2026. 2. 5.까지 서류를 추가 제출",
            published="2026-01-10",
            board_id="504",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertTrue(decision["candidates"])
        candidate = decision["candidates"][0]
        self.assertFalse(candidate["includeInCalendarFeed"])
        self.assertIn("conditional_selected_participant_action", candidate["reasonCodes"])

    def test_explicit_job_title_campus_overrides_conflicting_metadata(self):
        item = notice(
            notice_id="knu-716-3065",
            board_id="716",
            title="강원대학교 삼척생활관 기간제계약직 신규채용 공고",
            body="채용 공고",
            published="2026-01-09",
            list_metadata={
                "application_period_start": "2026-01-09",
                "application_period_end": "2026-01-16",
            },
        )
        item["campusScope"] = {
            "sourceLabel": "춘천",
            "campuses": ["chuncheon"],
            "scopeType": "campus_specific",
            "confidence": "medium",
            "source": "listMetadata.campus",
            "labels": {"chuncheon": "춘천"},
        }
        decision = evaluate_notice(item, None, CONFIG)
        candidate = decision["candidates"][0]
        self.assertEqual(candidate["campusScope"]["campuses"], ["samcheok"])
        self.assertEqual(candidate["campusScope"]["source"], "title_explicit_override")


    def test_grade_decimal_is_not_a_date_but_real_deadline_survives(self):
        item = notice(
            title="장학생 모집 안내",
            body=(
                "재학생은 평균 평점이 4.5점 만점 4.0 이상이어야 함\n"
                "신청기간: 2026. 4. 17. 18:00까지"
            ),
            board_id="721",
            published="2026-03-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        starts = [candidate["normalizedStart"] for candidate in decision["candidates"]]
        self.assertEqual(starts, ["2026-04-17T18:00:00+09:00"])

    def test_grade_table_decimal_without_calendar_cue_is_not_a_date(self):
        resolved = resolve_date(
            "0.15 4.15 ※ 현재학기 성적이 당해학기 성적 기준(D) 이상",
            date(2026, 3, 1),
        )
        self.assertIsNone(resolved)

    def test_historical_named_date_is_not_a_schedule(self):
        resolved = resolve_date(
            "촬영 작품: 강릉의 3.1 독립만세운동 교육 영상",
            date(2026, 1, 20),
        )
        self.assertIsNone(resolved)

    def test_slash_separated_discrete_dates_require_review(self):
        item = notice(
            title="재학생 학생증 발급 안내",
            body="배부일: 3.13. / 3.20.(금)",
            published="2026-02-20",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertIn("multiple_discrete_event_dates", decision["reasonCodes"])
        self.assertEqual(decision["candidates"], [])

    def test_result_date_stays_publishable_but_selected_orientation_is_review_only(self):
        item = notice(
            title="재학생 국제도우미 선발 안내",
            body=(
                "합격자 발표: 2026. 4. 1.\n"
                "합격자 오리엔테이션: 2026. 4. 2. 18:00~19:00"
            ),
            published="2026-03-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        by_type = {candidate["eventType"]: candidate for candidate in decision["candidates"]}
        self.assertTrue(by_type["result_announcement"]["includeInCalendarFeed"])
        self.assertFalse(by_type["event"]["includeInCalendarFeed"])
        self.assertIn(
            "conditional_selected_participant_action",
            by_type["event"]["reasonCodes"],
        )

    def test_recommendation_approved_registration_is_review_only(self):
        item = notice(
            title="2026학년도 1학기 교류 수학 안내",
            body=(
                "온라인 등록: 추천 승인받은 학생이 직접 등록 "
                "2026. 1. 19. 10:00~1.30. 23:59"
            ),
            board_id="720",
            published="2026-01-10",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertTrue(decision["candidates"])
        self.assertFalse(decision["candidates"][0]["includeInCalendarFeed"])
        self.assertIn(
            "conditional_selected_participant_action",
            decision["candidates"][0]["reasonCodes"],
        )

    def test_complete_activity_range_is_classified_as_event(self):
        item = notice(
            title="대학생 멘토 모집 안내",
            body="활동기간: 2026. 4. 15. ~ 2027. 2. 12.",
            board_id="721",
            published="2026-03-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        candidate = decision["candidates"][0]
        self.assertEqual(candidate["eventType"], "event")
        self.assertEqual(
            (candidate["normalizedStart"], candidate["normalizedEnd"]),
            ("2026-04-15", "2027-02-12"),
        )

    def test_application_and_activity_periods_are_both_preserved(self):
        item = notice(
            title="대학생 멘토 모집 안내",
            body=(
                "신청기간: 2026. 3. 10. ~ 3. 20.\n"
                "활동기간: 2026. 4. 15. ~ 2027. 2. 12."
            ),
            board_id="721",
            published="2026-03-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        by_type = {candidate["eventType"]: candidate for candidate in decision["candidates"]}
        self.assertIn("application_period", by_type)
        self.assertIn("event", by_type)
        self.assertEqual(
            (by_type["event"]["normalizedStart"], by_type["event"]["normalizedEnd"]),
            ("2026-04-15", "2027-02-12"),
        )

    def test_partial_activity_period_requires_review(self):
        item = notice(
            title="대학생 멘토 모집 안내",
            body="활동기간: 2026. 4월 초 ~ 2027. 2. 12.",
            board_id="721",
            published="2026-03-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertIn(
            "partial_activity_period_requires_review",
            decision["reasonCodes"],
        )
        self.assertEqual(decision["candidates"], [])

    def test_semester_to_exact_date_partial_activity_period_requires_review(self):
        item = notice(
            title="재학생 국제도우미 선발 안내",
            body="활동기간: 2026학년도 1학기 (~2026. 6. 19.까지)",
            published="2026-03-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertIn(
            "partial_activity_period_requires_review",
            decision["reasonCodes"],
        )
        self.assertEqual(decision["candidates"], [])

    def test_reference_date_is_not_published_as_user_action(self):
        item = notice(
            title="재학생 예비군훈련 신청 안내",
            body="종강일(6.19.) 이후 훈련 일정이 순차적으로 개설됩니다.",
            published="2026-06-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertIn("reference_date_not_user_action", decision["reasonCodes"])
        self.assertEqual(decision["candidates"], [])

    def test_grade_distribution_reference_date_does_not_replace_deadline(self):
        item = notice(
            title="신규장학생 신청 안내",
            body=(
                "각 학과에 배포 예정('26.3.9.)인 선발기준 참고\n"
                "신청마감: 2026. 3. 25. 18:00"
            ),
            board_id="721",
            published="2026-03-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        starts = [
            candidate["normalizedStart"]
            for candidate in decision["candidates"]
            if candidate["includeInCalendarFeed"]
        ]
        self.assertEqual(starts, ["2026-03-25T18:00:00+09:00"])
        self.assertIn("reference_date_not_user_action", decision["reasonCodes"])


    def test_leave_and_return_periods_have_distinct_action_types(self):
        item = notice(
            title="2026학년도 2학기 휴학 및 복학 신청 안내",
            body=(
                "휴학 신청기간: 2026. 8. 1. ~ 8. 20.\n"
                "복학 신청기간: 2026. 7. 20. ~ 8. 20."
            ),
            board_id="720",
            published="2026-07-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        by_action = {candidate["actionType"]: candidate for candidate in decision["candidates"]}
        self.assertEqual(set(by_action), {
            "leave_of_absence_application",
            "return_from_leave_application",
        })
        self.assertEqual(by_action["leave_of_absence_application"]["eventType"], "academic_period")
        self.assertEqual(by_action["return_from_leave_application"]["eventType"], "academic_period")
        self.assertEqual(
            by_action["leave_of_absence_application"]["audienceRules"]["enrollmentStatuses"],
            ["enrolled"],
        )
        self.assertEqual(
            by_action["return_from_leave_application"]["audienceRules"]["enrollmentStatuses"],
            ["on_leave"],
        )

    def test_shared_leave_return_period_is_split_without_consolidation(self):
        item = notice(
            title="2026학년도 2학기 휴학 및 복학 신청 안내",
            body="휴학 및 복학 신청기간: 2026. 7. 20. ~ 8. 20.",
            board_id="720",
            published="2026-07-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(len(decision["candidates"]), 2)
        self.assertEqual(
            {candidate["actionType"] for candidate in decision["candidates"]},
            {"leave_of_absence_application", "return_from_leave_application"},
        )
        self.assertEqual(
            {candidate["normalizedStart"] for candidate in decision["candidates"]},
            {"2026-07-20"},
        )

    def test_leave_period_overrides_registration_fee_keyword_classification(self):
        item = notice(
            title="2026학년도 2학기 휴학 신청 안내",
            body=(
                "휴학 1차 - 등록금 납부 관계없이 휴학 신청 가능 "
                "2026. 8. 13. 09:00 ~ 8. 31. 18:00"
            ),
            board_id="720",
            published="2026-07-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        candidate = decision["candidates"][0]
        self.assertEqual(candidate["actionType"], "leave_of_absence_application")
        self.assertEqual(candidate["eventType"], "academic_period")
        self.assertIn("휴학 신청기간", candidate["title"])

    def test_course_registration_year_lines_are_split_into_candidates(self):
        item = notice(
            title="2026학년도 2학기 수강신청 일정 안내（학부）",
            body=(
                "4학년: 2026. 8. 18.\n"
                "3학년: 2026. 8. 19.\n"
                "2학년: 2026. 8. 20.\n"
                "1학년: 2026. 8. 21.\n"
                "전체학년: 2026. 8. 24."
            ),
            board_id="720",
            published="2026-08-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        scoped = {
            tuple(candidate["audienceRules"]["studentYears"]): candidate["normalizedStart"]
            for candidate in decision["candidates"]
        }
        self.assertEqual(scoped[(4,)], "2026-08-18")
        self.assertEqual(scoped[(3,)], "2026-08-19")
        self.assertEqual(scoped[(2,)], "2026-08-20")
        self.assertEqual(scoped[(1,)], "2026-08-21")
        self.assertEqual(scoped[(1, 2, 3, 4)], "2026-08-24")
        self.assertTrue(all(
            candidate["audienceRules"]["degreeLevels"] == ["undergraduate"]
            for candidate in decision["candidates"]
        ))

    def test_same_datetime_different_year_candidates_are_preserved(self):
        item = notice(
            title="2026학년도 2학기 수강신청 일정 안내（학부）",
            body="4학년: 2026. 8. 18.\n3학년: 2026. 8. 18.",
            board_id="720",
            published="2026-08-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(len(decision["candidates"]), 2)
        self.assertEqual(
            {tuple(candidate["audienceRules"]["studentYears"]) for candidate in decision["candidates"]},
            {(3,), (4,)},
        )

    def test_course_registration_change_has_specific_action_type(self):
        item = notice(
            title="2026학년도 2학기 수강신청 변경 안내（학부）",
            body="수강신청 변경기간: 2026. 9. 1. ~ 9. 7.",
            board_id="720",
            published="2026-08-20",
        )
        decision = evaluate_notice(item, None, CONFIG)
        candidate = decision["candidates"][0]
        self.assertEqual(candidate["actionType"], "course_registration_change")
        self.assertEqual(candidate["eventType"], "academic_period")

    def test_preliminary_course_registration_has_specific_action_type(self):
        item = notice(
            title="2026학년도 2학기 예비수강신청 안내（학부）",
            body="예비수강신청 기간: 2026. 8. 3. ~ 8. 5.",
            board_id="720",
            published="2026-07-20",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["candidates"][0]["actionType"], "preliminary_course_registration")

    def test_new_student_registration_preserves_admission_type(self):
        item = notice(
            title="2026학년도 신입생 수강신청 일정 안내（학부）",
            body="수강신청 기간: 2026. 2. 20. 10:00 ~ 2. 23. 17:00",
            board_id="720",
            published="2026-02-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        rules = decision["candidates"][0]["audienceRules"]
        self.assertEqual(rules["admissionTypes"], ["new_student"])
        self.assertEqual(rules["degreeLevels"], ["undergraduate"])

    def test_course_registration_without_year_remains_unrestricted_by_year(self):
        item = notice(
            title="2026학년도 2학기 수강신청 안내",
            body="수강신청 기간: 2026. 8. 18. ~ 8. 24.",
            board_id="720",
            published="2026-08-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        candidate = decision["candidates"][0]
        self.assertEqual(candidate["actionType"], "course_registration")
        self.assertEqual(candidate["audienceRules"]["studentYears"], [])

    def test_subscription_profile_matching_uses_explicit_year_rules(self):
        candidate = {
            "audienceRules": {
                "degreeLevels": ["undergraduate"],
                "studentYears": [3],
                "enrollmentStatuses": [],
                "admissionTypes": [],
            }
        }
        self.assertTrue(candidate_matches_subscription_profile(candidate, {
            "degreeLevel": "undergraduate",
            "studentYear": 3,
        }))
        self.assertFalse(candidate_matches_subscription_profile(candidate, {
            "degreeLevel": "undergraduate",
            "studentYear": 2,
        }))
        self.assertFalse(candidate_matches_subscription_profile(candidate, {
            "degreeLevel": "undergraduate",
        }))

    def test_leave_status_phrase_does_not_create_leave_action(self):
        item = notice(
            title="재학생 프로그램 참가자 모집",
            body="휴학생 지원 불가. 신청기한: 2026. 5. 8. 17:00",
            board_id="504",
            published="2026-05-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(len(decision["candidates"]), 1)
        candidate = decision["candidates"][0]
        self.assertIsNone(candidate["actionType"])
        self.assertEqual(candidate["eventType"], "application_period")
        self.assertFalse(candidate["audienceRules"]["personalizationReady"])

    def test_leave_certificate_phrase_does_not_create_leave_action(self):
        item = notice(
            title="석박사 창업스쿨 모집",
            body="재/휴학 증명서 제출기한: 2026. 4. 12.",
            board_id="504",
            published="2026-04-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(len(decision["candidates"]), 1)
        self.assertIsNone(decision["candidates"][0]["actionType"])
        self.assertEqual(decision["candidates"][0]["eventType"], "submission_period")

    def test_academic_year_suffix_is_not_sixth_year_cohort(self):
        item = notice(
            title="2026학년도 1학기 폐강강좌 안내",
            body=(
                "2026학년도 1학기 수강신청 결과 1차 폐강 확정\n"
                "수강신청 변경기간: 2026. 3. 3. ~ 3. 9."
            ),
            board_id="720",
            published="2026-02-20",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(len(decision["candidates"]), 1)
        candidate = decision["candidates"][0]
        self.assertEqual(candidate["actionType"], "course_registration_change")
        self.assertEqual(candidate["audienceRules"]["studentYears"], [])
        self.assertEqual(candidate["normalizedStart"], "2026-03-03")

    def test_course_title_does_not_relabel_tuition_registration_period(self):
        item = notice(
            title="2026학년도 하계 계절수업 수강신청 및 등록 안내",
            body="등록기간: 2026. 6. 4. ~ 6. 10. 15:30까지",
            board_id="720",
            published="2026-05-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(len(decision["candidates"]), 1)
        self.assertIsNone(decision["candidates"][0]["actionType"])

    def test_course_title_does_not_relabel_class_period(self):
        item = notice(
            title="2026학년도 하계 계절수업 수강신청 안내",
            body="수업기간: 2026. 6. 24. ~ 7. 14.",
            board_id="720",
            published="2026-05-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(len(decision["candidates"]), 1)
        self.assertIsNone(decision["candidates"][0]["actionType"])

    def test_course_title_does_not_relabel_refund_date(self):
        item = notice(
            title="폐강과목 수강신청 안내",
            body="수강료 환불(예정): 2026. 6. 30.",
            board_id="720",
            published="2026-06-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["candidates"], [])
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertIn("reference_date_not_user_action", decision["reasonCodes"])

    def test_course_cancellation_short_label_uses_title_family(self):
        item = notice(
            title="계절수업 수강신청 취소 안내",
            body="취소기간: 2026. 6. 17. 09:00 ~ 6. 22. 18:00",
            board_id="720",
            published="2026-06-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["candidates"][0]["actionType"], "course_registration_cancellation")

    def test_readmission_title_does_not_relabel_later_dates(self):
        item = notice(
            title="2026학년도 2학기 학부생 재입학 모집 안내",
            body=(
                "재입학 지원서 접수 및 서류심사: 2026. 6. 16. ~ 7. 10.\n"
                "재입학 허가 통보: 2026. 7. 21.\n"
                "수강신청: (예비) 2026. 7. 30. ~ 7. 31.\n"
                "등록금 납부: 2026. 8. 25. ~ 8. 28."
            ),
            board_id="720",
            published="2026-06-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        typed = [(c["actionType"], c["normalizedStart"]) for c in decision["candidates"]]
        self.assertIn(("readmission_application", "2026-06-16"), typed)
        self.assertIn(("preliminary_course_registration", "2026-07-30"), typed)
        self.assertNotIn(("readmission_application", "2026-07-21"), typed)
        self.assertNotIn(("readmission_application", "2026-08-25"), typed)


    def test_readmission_title_does_not_relabel_tuition_period(self):
        item = notice(
            title="2026학년도 1학기 재입학 허가자 등록 및 수강신청 안내",
            body=(
                "등록금 납부기간: 2026. 1. 21. ~ 1. 23.\n"
                "수강신청 기간: 2026. 2. 10. ~ 2. 12."
            ),
            board_id="720",
            published="2026-01-10",
        )
        decision = evaluate_notice(item, None, CONFIG)
        tuition = [
            candidate for candidate in decision["candidates"]
            if candidate.get("normalizedStart") == "2026-01-21"
        ]
        self.assertTrue(any(candidate.get("eventType") == "payment_period" for candidate in tuition))
        self.assertFalse(any(candidate.get("actionType") == "readmission_application" for candidate in tuition))
        course = [
            candidate for candidate in decision["candidates"]
            if candidate.get("normalizedStart") == "2026-02-10"
        ]
        self.assertTrue(any(candidate.get("actionType") == "course_registration" for candidate in course))

    def test_readmitted_student_eligibility_is_not_readmission_action(self):
        item = notice(
            title="국가장학금 2차 신청 안내",
            body=(
                "신청기간: 2026. 2. 3. 09:00 ~ 3. 24. 18:00\n"
                "신청대상: 신입생, 편입생, 재입학생, 복학생 및 재학생"
            ),
            board_id="721",
            published="2026-02-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertTrue(decision["candidates"])
        self.assertTrue(all(c["actionType"] is None for c in decision["candidates"]))

    def test_generic_year_priority_does_not_scope_candidate(self):
        item = notice(
            title="재학생 취업캠프 모집",
            body="모집기간: ~ 2026. 1. 20. ※ 4학년 우선 선발",
            board_id="504",
            published="2026-01-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        candidate = decision["candidates"][0]
        self.assertEqual(candidate["audienceRules"]["studentYears"], [])
        self.assertFalse(candidate["audienceRules"]["personalizationReady"])

    def test_nearest_leave_return_marker_owns_each_period(self):
        item = notice(
            title="2026학년도 2학기 휴학 및 복학 신청 안내",
            body=(
                "복학 1차: 2026. 7. 13. ~ 8. 31.\n"
                "휴학 1차: 2026. 8. 13. ~ 8. 31.\n"
                "2차: 2026. 9. 1. ~ 9. 28. 복학 희망자\n"
                "2차: 2026. 9. 1. ~ 10. 8. 휴학 또는 휴학연장 희망자"
            ),
            board_id="720",
            published="2026-07-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        signatures = {
            (c["actionType"], c["normalizedStart"], c["normalizedEnd"])
            for c in decision["candidates"]
        }
        self.assertEqual(signatures, {
            ("return_from_leave_application", "2026-07-13", "2026-08-31"),
            ("leave_of_absence_application", "2026-08-13", "2026-08-31"),
            ("return_from_leave_application", "2026-09-01", "2026-09-28"),
            ("leave_of_absence_application", "2026-09-01", "2026-10-08"),
        })

    def test_scoped_course_candidate_replaces_unscoped_duplicate(self):
        base = {
            "normalizedStart": "2026-08-18",
            "normalizedEnd": "2026-08-18",
            "isAllDay": True,
            "feedScopes": ["student_default"],
            "eventType": "academic_period",
            "reasonCodes": [],
            "evidence": "4학년: 2026. 8. 18.",
        }
        unscoped = dict(
            base,
            id="unscoped",
            actionType="course_registration",
            audienceRules={
                "degreeLevels": [],
                "studentYears": [],
                "enrollmentStatuses": [],
                "admissionTypes": [],
            },
        )
        scoped = dict(
            base,
            id="scoped",
            actionType="course_registration",
            audienceRules={
                "degreeLevels": ["undergraduate"],
                "studentYears": [4],
                "enrollmentStatuses": [],
                "admissionTypes": [],
            },
        )
        kept, removed = consolidate_same_datetime_candidates([unscoped, scoped])
        self.assertEqual(removed, 1)
        self.assertEqual([item["id"] for item in kept], ["scoped"])

    def test_summary_reports_action_and_personalization_counts(self):
        leave_item = notice(
            notice_id="knu-720-leave",
            title="휴학 신청 안내",
            body="휴학 신청기간: 2026. 8. 1. ~ 8. 20.",
            board_id="720",
            published="2026-07-01",
        )
        course_item = notice(
            notice_id="knu-720-course",
            title="학부 수강신청 안내",
            body="3학년: 2026. 8. 19.",
            board_id="720",
            published="2026-08-01",
        )
        decisions = [
            evaluate_notice(leave_item, None, CONFIG),
            evaluate_notice(course_item, None, CONFIG),
        ]
        summary = build_summary(decisions, {"fixture": True})
        self.assertEqual(summary["actionTypeCounts"]["leave_of_absence_application"], 1)
        self.assertEqual(summary["actionTypeCounts"]["course_registration"], 1)
        self.assertEqual(summary["studentYearScopedCandidateCount"], 1)
        self.assertGreaterEqual(summary["personalizationReadyCandidateCount"], 2)


class IcsProjectionTests(unittest.TestCase):
    def test_all_day_inclusive_end_becomes_exclusive_dtend(self):
        candidate = {
            "id": "cand-test",
            "uidHint": "cand-test@noticepilot.local",
            "sourceNoticeId": "knu-721-1",
            "sourceTitle": "장학금 신청",
            "sourceUrl": "https://example.test/1",
            "title": "장학금 신청기간",
            "normalizedStart": "2026-07-01",
            "normalizedEnd": "2026-07-15",
            "endDateInclusive": True,
            "isAllDay": True,
            "status": "auto_confirmed",
            "includeInCalendarFeed": True,
            "evidence": "신청기간 2026.7.1~7.15",
            "targetActor": "student",
            "confidence": "high",
            "campusScope": {"campuses": ["all"], "scopeType": "all_campuses"},
        }
        text = build_ics([candidate], "테스트", 30)
        self.assertIn("DTSTART;VALUE=DATE:20260701", text)
        self.assertIn("DTEND;VALUE=DATE:20260716", text)



class StructuredScheduleSegmentTests(unittest.TestCase):
    def test_dotted_date_is_not_split_as_numbered_list_item(self):
        segments = build_schedule_segments(
            "프로그램 신청 안내",
            "신청기간: 공고 후 ~ 2026. 7. 17.까지",
            date(2026, 7, 1),
        )
        body = [segment for segment in segments if segment.segment_type != "title"]
        self.assertEqual(len(body), 1)
        self.assertEqual(body[0].date_spans[0][0], "2026-07-17")

    def test_multiple_labeled_schedules_on_one_line_are_split(self):
        segments = build_schedule_segments(
            "프로그램 모집 안내",
            "지원 마감: 2026. 3. 29. 합격자 발표: 2026. 4. 1.",
            date(2026, 3, 1),
        )
        body = [segment for segment in segments if segment.segment_type != "title"]
        self.assertEqual([segment.label_text for segment in body], ["지원 마감", "합격자 발표"])
        self.assertEqual([segment.date_spans[0][0] for segment in body], ["2026-03-29", "2026-04-01"])

    def test_action_label_and_next_line_date_form_single_continuation(self):
        segments = build_schedule_segments(
            "휴학 신청 안내",
            "휴학 신청기간:\n2026. 8. 1. ~ 8. 20.",
            date(2026, 7, 1),
        )
        continuation = [segment for segment in segments if segment.segment_type == "continuation"]
        self.assertEqual(len(continuation), 1)
        self.assertIn("leave_of_absence_application", continuation[0].action_signals)
        self.assertTrue(continuation[0].locally_grounded)

    def test_unrelated_adjacent_lines_are_not_combined(self):
        segments = build_schedule_segments(
            "수강신청 안내",
            "문의처: 학사지원과\n2026. 6. 30.",
            date(2026, 6, 1),
        )
        self.assertFalse(any(segment.segment_type == "continuation" for segment in segments))

    def test_table_row_preserves_label_and_date_relation(self):
        segments = build_schedule_segments(
            "수강신청 안내",
            "구분\t일정\t대상\n수강신청\t2026. 8. 18.\t4학년",
            date(2026, 7, 1),
        )
        rows = [segment for segment in segments if segment.segment_type in {"table_row", "label_value"}]
        self.assertTrue(any("2026-08-18" in [span[0] for span in row.date_spans] for row in rows))

    def test_flattened_leave_return_table_reconstructs_both_actions(self):
        item = notice(
            title="2026학년도 2학기 휴학 및 복학 신청 안내",
            body=(
                "휴학\n《1차》\n2026. 8. 13. 09:00 ~ 8. 31. 18:00\n"
                "《2차》\n2026. 9. 1. 09:00 ~ 10. 8. 18:00\n"
                "복학\n《1차》\n2026. 7. 13. 09:00 ~ 8. 31. 18:00\n"
                "《2차》\n2026. 9. 1. 09:00 ~ 9. 28. 18:00"
            ),
            board_id="720",
            published="2026-07-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        signatures = {
            (candidate["actionType"], candidate["normalizedStart"], candidate["normalizedEnd"])
            for candidate in decision["candidates"]
        }
        self.assertEqual(signatures, {
            ("leave_of_absence_application", "2026-08-13T09:00:00+09:00", "2026-08-31T18:00:00+09:00"),
            ("leave_of_absence_application", "2026-09-01T09:00:00+09:00", "2026-10-08T18:00:00+09:00"),
            ("return_from_leave_application", "2026-07-13T09:00:00+09:00", "2026-08-31T18:00:00+09:00"),
            ("return_from_leave_application", "2026-09-01T09:00:00+09:00", "2026-09-28T18:00:00+09:00"),
        })
        self.assertTrue(all(
            candidate["sourceSegment"]["segmentType"] == "table_row"
            for candidate in decision["candidates"]
        ))

    def test_flattened_course_table_reconstructs_year_scoped_rows(self):
        item = notice(
            title="2026학년도 1학기 수강신청 안내",
            body=(
                "교과목 학년별 일정\n학년\n수강신청 일정\n"
                "1·4\n2.20.(\n금\n) 10:00~13:00\n"
                "2·3\n2.20.(\n금\n) 14:00~17:00\n"
                "전체\n2.21.(\n토\n) 10:00\n~ 2.25.(\n수\n) 18:00"
            ),
            board_id="720",
            published="2026-02-09",
        )
        decision = evaluate_notice(item, None, CONFIG)
        scoped = {
            tuple(candidate["audienceRules"]["studentYears"]): (
                candidate["normalizedStart"], candidate["normalizedEnd"]
            )
            for candidate in decision["candidates"]
        }
        self.assertEqual(
            scoped[(1, 4)],
            ("2026-02-20T10:00:00+09:00", "2026-02-20T13:00:00+09:00"),
        )
        self.assertEqual(
            scoped[(2, 3)],
            ("2026-02-20T14:00:00+09:00", "2026-02-20T17:00:00+09:00"),
        )
        self.assertEqual(
            scoped[(1, 2, 3, 4)],
            ("2026-02-21T10:00:00+09:00", "2026-02-25T18:00:00+09:00"),
        )

    def test_flattened_course_range_stops_before_new_transfer_student_row(self):
        item = notice(
            title="2026학년도 1학기 학부 수강신청 일정 안내",
            body=(
                "학년\n수강신청 일정\n"
                "전체\n2.21.(토)10:00\n~\n2.25.(수)18:00\n"
                "신(편)입생\n2.26.(목)10:00~18:00"
            ),
            board_id="720",
            published="2026-02-09",
        )
        decision = evaluate_notice(item, None, CONFIG)
        scoped = [
            candidate for candidate in decision["candidates"]
            if candidate.get("audienceRules", {}).get("studentYears") == [1, 2, 3, 4]
        ]
        self.assertEqual(len(scoped), 1)
        self.assertEqual(
            (scoped[0]["normalizedStart"], scoped[0]["normalizedEnd"]),
            ("2026-02-21T10:00:00+09:00", "2026-02-25T18:00:00+09:00"),
        )

    def test_orientation_cohort_does_not_become_course_registration(self):
        item = notice(
            title="2026학년도 편입생 오리엔테이션 안내",
            body=(
                "2026학년도 편입생을 대상으로 오리엔테이션을 실시합니다. 1. 일시:\n"
                "2026. 2. 23. 14:00 ~ 16:00\n"
                "학점인정 내역서 배부 및 수강신청 지도는 각 학과별 일정에 따라 진행"
            ),
            board_id="720",
            published="2026-02-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(len(decision["candidates"]), 1)
        self.assertEqual(decision["candidates"][0]["eventType"], "event")
        self.assertIsNone(decision["candidates"][0]["actionType"])

    def test_candidate_contains_auditable_source_segment(self):
        item = notice(
            title="휴학 신청 안내",
            body="휴학 신청기간: 2026. 8. 1. ~ 8. 20.",
            board_id="720",
            published="2026-07-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        candidate = decision["candidates"][0]
        self.assertEqual(candidate["sourceSegment"]["schemaVersion"], "noticepilot.scheduleSegments.v0.3")
        self.assertEqual(candidate["sourceSegment"]["labelText"], "휴학 신청기간")
        self.assertTrue(candidate["sourceSegment"]["locallyGrounded"])

    def test_unlabelled_date_under_action_title_requires_review(self):
        item = notice(
            title="수강신청 안내",
            body="2026. 8. 18.",
            board_id="720",
            published="2026-07-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertIn("action_label_not_locally_grounded", decision["reasonCodes"])
        self.assertEqual(decision["candidates"], [])

    def test_unlabelled_date_exposes_bounded_semantic_review_payload(self):
        item = notice(
            title="수강신청 안내",
            body="2026. 8. 18.",
            board_id="720",
            published="2026-07-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        payload = decision["semanticReviewPayloads"][0]
        self.assertEqual(payload["schemaVersion"], "noticepilot.semanticReviewPayload.v0.1")
        self.assertEqual(payload["reviewReason"], "action_label_not_locally_grounded")
        self.assertIn("course_registration", payload["candidateActionTypes"])
        self.assertEqual(payload["promotionConstraint"], "deterministic_date_required")

    def test_segment_document_exposes_structure_summary(self):
        item = notice(
            title="휴학 신청 안내",
            body="휴학 신청기간: 2026. 8. 1. ~ 8. 20.",
            board_id="720",
            published="2026-07-01",
        )
        document = schedule_segment_document(item)
        self.assertEqual(document["schemaVersion"], "noticepilot.scheduleSegments.v0.3")
        self.assertGreaterEqual(document["summary"]["segmentCount"], 2)
        self.assertGreaterEqual(document["summary"]["locallyGroundedCount"], 1)

    def test_summary_reports_structured_segment_counts(self):
        item = notice(
            title="복학 신청 안내",
            body="복학 신청기간: 2026. 7. 20. ~ 8. 20.",
            board_id="720",
            published="2026-07-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        summary = build_summary([decision], {"fixture": True})
        self.assertEqual(summary["structuredSegmentCandidateCount"], 1)
        self.assertEqual(summary["locallyGroundedCandidateCount"], 1)
        self.assertEqual(summary["sourceSegmentTypeCounts"]["label_value"], 1)

    def test_new_numbered_result_item_does_not_inherit_application_action(self):
        item = notice(
            title="희망근로지 신청 안내",
            body=(
                "3. 신청 방법: [붙임파일] 참고\n"
                "4. 우선추천대상자 안내: 2026. 6. 9.(화)"
            ),
            board_id="721",
            published="2026-05-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(len(decision["candidates"]), 1)
        candidate = decision["candidates"][0]
        self.assertEqual(candidate["eventType"], "result_announcement")
        self.assertEqual(candidate["normalizedStart"], "2026-06-09")

    def test_new_numbered_payment_reference_does_not_inherit_submission_action(self):
        item = notice(
            title="주거안정장학금 지급요청서 제출 안내",
            body=(
                "4. 수정방법: 지급요청서 제출취소 클릭 후 수정\n"
                "5. 지급일자: 2026. 7. 31.(금)(예정)"
            ),
            board_id="721",
            published="2026-07-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["candidates"], [])
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertIn("reference_date_not_user_action", decision["reasonCodes"])

    def test_new_numbered_exam_and_result_keep_their_local_labels(self):
        item = notice(
            title="카카오테크캠퍼스 모집",
            body=(
                "- 지원서 및 자기소개서 제출\n"
                "2. 코딩테스트: 2026. 4. 25.(토) 11:00~13:00\n"
                "※ 점수 제출 시 테스트 면제\n"
                "3. 최종발표: 2026. 5. 1.(금)"
            ),
            board_id="720",
            published="2026-03-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        typed = {candidate["eventType"] for candidate in decision["candidates"]}
        self.assertEqual(typed, {"exam_or_interview", "result_announcement"})

    def test_activity_period_and_application_period_remain_separate(self):
        item = notice(
            title="현장실습 참여학생 모집",
            body=(
                "2. 모집대상: 3,4학년 재학생\n"
                "3. 실습기간: 2026. 7. 1. ~ 12. 31.\n"
                "4. 신청기간: 2026. 5. 11. ~ 5. 15."
            ),
            board_id="504",
            published="2026-05-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        typed = {(candidate["eventType"], candidate["normalizedStart"]) for candidate in decision["candidates"]}
        self.assertIn(("event", "2026-07-01"), typed)
        self.assertIn(("application_period", "2026-05-11"), typed)

    def test_recruitment_headcount_does_not_relabel_trip_schedule(self):
        item = notice(
            title="해외탐방 참가자 모집",
            body=(
                "탐방일정 및 모집인원\n"
                "11기(미국): 2026. 8. 4. ~ 8. 13.\n"
                "접수기간: 2026. 6. 4. ~ 6. 17."
            ),
            board_id="721",
            published="2026-05-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        typed = {(candidate["eventType"], candidate["normalizedStart"]) for candidate in decision["candidates"]}
        self.assertIn(("event", "2026-08-04"), typed)
        self.assertIn(("application_period", "2026-06-04"), typed)

    def test_course_closure_confirmation_is_not_payment_period(self):
        item = notice(
            title="계절수업 수강신청 안내",
            body=(
                "수강료 납부 학생 기준 / 30명 미만 시 폐강\n"
                "폐강과목 확정: 2026. 6. 10."
            ),
            board_id="720",
            published="2026-05-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(len(decision["candidates"]), 1)
        self.assertEqual(decision["candidates"][0]["eventType"], "result_announcement")

    def test_explicit_readmission_admittee_followups_require_review(self):
        item = notice(
            title="재입학 허가자 등록 및 수강신청 안내",
            body=(
                "3. 등록기간: 2026. 1. 21. ~ 1. 23.\n"
                "6. 수강신청: 2026. 2. 19. ~ 2. 25."
            ),
            board_id="720",
            published="2026-01-10",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertTrue(decision["candidates"])
        self.assertTrue(all(candidate["status"] == "needs_review" for candidate in decision["candidates"]))
        self.assertIn("conditional_selected_participant_action", decision["reasonCodes"])


class Policy15SemanticTests(unittest.TestCase):
    def test_exam_target_announcement_is_result_not_exam(self):
        item = notice(
            title="장학생 선발 안내",
            body="시험 대상자 발표: 2026. 1. 28.(수) 예정",
            board_id="720",
            published="2026-01-10",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(len(decision["candidates"]), 1)
        self.assertEqual(decision["candidates"][0]["eventType"], "result_announcement")

    def test_readmission_permission_notice_is_result(self):
        item = notice(
            title="재입학 모집 안내",
            body="재입학 허가 통보: 2026. 7. 21.(화) 예정",
            board_id="720",
            published="2026-06-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["candidates"][0]["eventType"], "result_announcement")
        self.assertIsNone(decision["candidates"][0]["actionType"])

    def test_support_target_confirmation_is_result(self):
        item = notice(
            title="장학생 선발 공고",
            body="지원대상자 확정통보: 2026. 5. 28.(목)",
            board_id="721",
            published="2026-05-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["candidates"][0]["eventType"], "result_announcement")

    def test_course_evaluation_period_has_academic_action_type(self):
        item = notice(
            title="계절수업 안내",
            body="계절수업 수업평가: 2026. 7. 6.(월) ~ 7. 10.(금)",
            board_id="720",
            published="2026-06-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        candidate = decision["candidates"][0]
        self.assertEqual(candidate["eventType"], "academic_period")
        self.assertEqual(candidate["actionType"], "course_evaluation")

    def test_learning_period_is_activity_not_deadline(self):
        item = notice(
            title="온라인 교육 모집 안내",
            body="수강기간: 2026. 7. 1.(수) ~ 7. 24.(금)",
            board_id="717",
            published="2026-06-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["candidates"][0]["eventType"], "event")

    def test_exact_start_vague_activity_end_requires_review(self):
        item = notice(
            title="양성과정 추가모집",
            body="현장실습기간: 2026. 6. 8.(월) ~ 2026. 7월말까지 완료",
            board_id="504",
            published="2026-05-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["candidates"], [])
        self.assertIn("partial_activity_period_requires_review", decision["reasonCodes"])

    def test_course_evaluation_period_word_is_not_internal_process(self):
        item = notice(
            title="2026학년도 1학기 수업평가 안내",
            body="수업평가 기간: 2026. 6. 1.(월) ~ 6. 12.(금)",
            board_id="720",
            published="2026-03-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        candidate = decision["candidates"][0]
        self.assertEqual(candidate["eventType"], "academic_period")
        self.assertEqual(candidate["actionType"], "course_evaluation")

    def test_refund_expected_date_is_reference_date(self):
        item = notice(
            title="수강료 환불 안내",
            body="환불 예정일: 2026. 6. 30.(화)",
            board_id="720",
            published="2026-03-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["candidates"], [])
        self.assertIn("reference_date_not_user_action", decision["reasonCodes"])

    def test_refund_schedule_is_reference_date(self):
        item = notice(
            title="수강신청 취소 안내",
            body="수강료 반환일정: 2026. 6. 30.(화)(예정)",
            board_id="720",
            published="2026-06-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["candidates"], [])
        self.assertIn("reference_date_not_user_action", decision["reasonCodes"])


    def test_cancellation_period_with_refund_outcome_remains_actionable(self):
        item = notice(
            title="계절수업 수강신청 취소 안내",
            body="개강 전 수강취소: 2026. 6. 17. 09:00 ~ 6. 22. 18:00 (수강료 전액 반환)",
            board_id="720",
            published="2026-06-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(len(decision["candidates"]), 1)
        self.assertEqual(decision["candidates"][0]["actionType"], "course_registration_cancellation")

    def test_scholarship_deposit_date_is_reference(self):
        item = notice(
            title="국가장학금 선발 계획 안내",
            body="2026. 6. 30.(화) 이내 (한국장학재단에 등록된 계좌로 입금 처리)",
            board_id="721",
            published="2026-06-20",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["candidates"], [])
        self.assertIn("reference_date_not_user_action", decision["reasonCodes"])

    def test_confirmed_participant_cancellation_requires_review(self):
        item = notice(
            title="영어회화 특별강좌 안내",
            body="추가 확정자가 접수 취소를 희망하는 경우 2026. 6. 25.(목)까지 취소 의사를 밝혀야 함",
            board_id="504",
            published="2026-06-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertIn("conditional_selected_participant_action", decision["reasonCodes"])

    def test_registered_orientation_row_requires_review(self):
        item = notice(
            title="편입생 오리엔테이션 안내",
            body="- 2026. 2. 21.(토) 9시 이후: 충원등록생",
            board_id="720",
            published="2026-02-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["disposition"], "needs_review")
        self.assertTrue(all(c["status"] == "needs_review" for c in decision["candidates"]))

    def test_timetable_parenthetical_date_is_reference(self):
        item = notice(
            title="2026학년도 1학기 학부 수업시간표 공고(춘천캠퍼스)(2026.3.12.)",
            body="",
            board_id="720",
            published="2026-01-26",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["candidates"], [])
        self.assertIn("reference_date_not_user_action", decision["reasonCodes"])

    def test_title_deadline_boundary_is_consolidated_into_body_range(self):
        item = notice(
            title="장학생 선발(~5/20)",
            body="모집기간: 2026. 5. 4. ~ 5. 20.",
            board_id="504",
            published="2026-05-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(len(decision["candidates"]), 1)
        candidate = decision["candidates"][0]
        self.assertEqual(candidate["eventType"], "application_period")
        self.assertEqual((candidate["normalizedStart"], candidate["normalizedEnd"]), ("2026-05-04", "2026-05-20"))

    def test_exam_context_does_not_override_cafe_operation_period(self):
        item = notice(
            title="중간고사 응원 이벤트 안내",
            body="중간고사 기간을 맞아 카페 운영시간이 연장됩니다. 기간: 2026. 4. 21. ~ 4. 23.",
            board_id="504",
            published="2026-04-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["candidates"][0]["eventType"], "event")

    def test_document_evaluation_date_is_internal_process(self):
        item = notice(
            title="창업경진대회 모집",
            body="서류 평가: 2026. 2. 2.",
            board_id="504",
            published="2026-01-01",
        )
        decision = evaluate_notice(item, None, CONFIG)
        self.assertEqual(decision["candidates"], [])
        self.assertIn("internal_process_period", decision["reasonCodes"])

if __name__ == "__main__":
    unittest.main()
