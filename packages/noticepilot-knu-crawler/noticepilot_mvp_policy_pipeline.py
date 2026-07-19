#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""NoticePilot deterministic MVP policy pipeline v0.1.

Input:
  observation dataset directory containing:
    - index/notices.jsonl
    - normalized/notices/*.json

Output:
  derived policy decisions, review queue, feed-scoped candidate JSON files,
  and machine-readable summary reports.

This module intentionally does not call an LLM and does not mutate the source
observation snapshot.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import noticepilot_applicability_evaluator as _applicability_layer
import noticepilot_publishability_evaluator as _publishability_layer
import noticepilot_runtime_judgment_wiring as _runtime_judgment_layer
import noticepilot_candidate_reconciler as _reconciliation_layer

PIPELINE_VERSION = "0.1.18"
DECISION_SCHEMA_VERSION = "noticepilot.mvpPolicyDecision.v0.2"
CANDIDATE_SCHEMA_VERSION = "noticepilot.calendarCandidates.v0.11"
SCHEDULE_SEGMENT_SCHEMA_VERSION = "noticepilot.scheduleSegments.v0.3"
SEMANTIC_REVIEW_SCHEMA_VERSION = "noticepilot.semanticReviewPayload.v0.1"
SUMMARY_SCHEMA_VERSION = "noticepilot.mvpPolicySummary.v0.5"
TIMEZONE = "Asia/Seoul"

# S24-B applicability composition root. The standalone evaluator owns actor,
# audience-rule, profile-scope, and conditional-applicability decisions while
# this module keeps the Policy.15 compatibility projection.
APPLICABILITY_EVALUATOR = _applicability_layer.ApplicabilityEvaluator()

# S24-C publishability composition root. Candidate verdict, calendar inclusion,
# publication reason ownership, and temporal/chronology guards are evaluated
# here. S24-D runtime judgment serialization is handled by the wiring root below.
PUBLISHABILITY_EVALUATOR = _publishability_layer.PublishabilityEvaluator()

# S24-D runtime serialization composition root. The legacy candidate fields
# remain public compatibility projections while these judgment objects become
# first-class, synchronized audit fields.
RUNTIME_JUDGMENT_WIRING = _runtime_judgment_layer.RuntimeJudgmentWiring(
    APPLICABILITY_EVALUATOR, PUBLISHABILITY_EVALUATOR
)

SPACE_RE = re.compile(r"\s+")
DATE_TOKEN_RE = re.compile(
    r"(?<!\d)"
    r"(?:"
    r"(?P<year>20\d{2})\s*(?:[.\-/년]\s*)"
    r"|(?P<short_year_quoted>['’`]\s*\d{2})\s*[.\-/년]\s*"
    r"|(?P<short_year_plain>(?:1[3-9]|[2-9]\d))\s*[.\-/년]\s*"
    r")?"
    r"(?P<month>1[0-2]|0?[1-9])\s*(?P<md_sep>[.\-/월])\s*"
    r"(?P<day>3[01]|[12]\d|0?[1-9])(?!\d)\s*(?:일)?"
    r"(?:\s*[.]?\s*[\(（][^）)]{0,10}[\)）])?"
)
TIME_TOKEN_RE = re.compile(
    r"(?<!\d)"
    r"(?:(?P<ampm>오전|오후)\s*)?"
    r"(?P<hour>[01]?\d|2[0-3])\s*(?::|시)\s*"
    r"(?P<minute>[0-5]\d)?\s*(?:분)?"
    r"(?!\d)"
)
TIME_RANGE_RE = re.compile(
    r"(?<!\d)"
    r"(?:(?P<start_ampm>오전|오후)\s*)?"
    r"(?P<start_hour>[01]?\d|2[0-3])\s*"
    r"(?::\s*(?P<start_minute>[0-5]\d)|시\s*(?P<start_minute_word>[0-5]?\d)?\s*분?)"
    r"\s*(?:~|∼|～|[-–—]|부터)\s*"
    r"(?:(?P<end_ampm>오전|오후)\s*)?"
    r"(?P<end_hour>[01]?\d|2[0-4])\s*"
    r"(?::\s*(?P<end_minute>[0-5]\d)|시\s*(?P<end_minute_word>[0-5]?\d)?\s*분?)"
    r"(?!\d)"
)
END_OF_DAY_24_RE = re.compile(
    r"(?<!\d)24\s*(?::\s*00|시(?:\s*00\s*분?)?)(?!\d)"
)
RELATIVE_WITHIN_RE = re.compile(
    r"(?P<ref>공고일|게시일|등록일)\s*(?:로부터|부터|기준)\s*(?P<days>\d{1,3})\s*일\s*(?:이내|후|까지)"
)
RELATIVE_FOR_RE = re.compile(
    r"(?P<ref>공고일|게시일|등록일)\s*(?:로부터|부터)\s*(?P<days>\d{1,3})\s*일간"
)
RELATIVE_NEXT_DAY_FOR_RE = re.compile(
    r"(?P<ref>공고일|게시일|등록일)\s*(?:의\s*)?다음\s*날부터\s*(?P<days>\d{1,3})\s*일간"
)
USER_SPECIFIC_RELATIVE_RE = re.compile(
    r"(?:통보일|선정일|합격일|접수일|신청일|수령일|개별\s*연락일)\s*(?:로부터|부터|기준)\s*\d{1,3}\s*일"
)
RANGE_MARKER_RE = re.compile(r"(~|∼|～|부터|까지|\s[-–—]\s)")
LOCAL_RANGE_CONNECTOR_RE = re.compile(r"^\s*(?:~|∼|～|[-–—]|부터)\s*$")
FRACTION_CONTEXT_RE = re.compile(
    r"(?:등록금|수업료|학점|졸업학점|금액|총액|지원금|장학금|비율|지분|분담금)"
    r"\s*(?:의)?\s*$"
)

NON_ACTION_DATE_CONTEXT_RE = re.compile(
    r"(?:생년월일|출생자|출생일|출생|연령|만\s*\d{1,2}\s*세|산정\s*기간|인정\s*기간)"
)

RESULT_STATUS_ANNOUNCEMENT_RE = re.compile(
    r"(?:시험|지원|추천|우선추천|선발)\s*대상자.{0,14}(?:발표|안내|확정|통보)"
    r"|재입학\s*허가(?:자)?\s*(?:통보|발표|안내|예정)"
    r"|지원\s*대상자\s*확정\s*통보"
)
COURSE_EVALUATION_RE = re.compile(
    r"(?:수업|강의|교과)\s*평가(?:\s*(?:기간|일시|일정|일자))?"
)
ACTIVITY_PERIOD_LABEL_RE = re.compile(
    r"(?:수강(?!\s*신청)|현장\s*실습|실습|이용|운영)\s*기간"
)
TITLE_REFERENCE_DATE_RE = re.compile(
    r"(?:수업시간표|강의시간표|일정표)\s*(?:공고|안내).*[\(（]\s*20\d{2}[.\-/년]"
    r"\s*\d{1,2}[.\-/월]\s*\d{1,2}[^)）]{0,10}[\)）]\s*$"
)
PAYMENT_REFERENCE_TITLE_RE = re.compile(
    r"(?:장학금|지원금|근로장학금)?.{0,30}(?:지급|입금|환불|반환)\s*일정\s*(?:안내|공지)"
)
OPERATIONAL_EVENT_CONTEXT_RE = re.compile(
    r"(?:운영|이용)\s*시간(?:이|을|은|는)?\s*(?:연장|변경|조정)"
)
INTERNAL_SELECTION_POINT_RE = re.compile(
    r"^\s*(?:(?:[가-하]|\d{1,2})[.)]\s*)?(?:서류|내부)\s*(?:평가|심사)\s*[:：]"
)

NEAREST_EVENT_LABEL_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("result_announcement", re.compile(
        r"(?:최종\s*발표|선정\s*발표|(?:최종\s*)?(?:합격자|수상자|선정\s*결과|선발\s*결과|결과|선정여부)"
        r"\s*(?:발표|안내|확인|통보|공고|예정)?"
        r"|(?:시험|지원|추천|우선추천|선발)\s*대상자.{0,14}(?:발표|안내|확정|통보)"
        r"|재입학\s*허가(?:자)?\s*(?:통보|발표|안내|예정))"
        r"\s*(?:[-–—]\s*)?[:：]?\s*$"
    )),
    ("exam_or_interview", re.compile(
        r"(?:면접(?:심사)?|시험|고사|평가)\s*(?:[-–—]\s*)?"
        r"(?:일\s*시|일정|기간|일자|예정)?\s*[:：]?\s*$"
    )),
    ("payment_period", re.compile(
        r"(?:등록금|수업료|분담금|납부)\s*(?:납부)?\s*(?:[-–—]\s*)?"
        r"(?:기간|기한|마감|일정|일\s*시)?\s*[:：]?\s*$"
    )),
    ("academic_period", re.compile(
        r"(?:수강신청|휴학|복학|재입학|전과|학점인정|등록)"
        r"\s*(?:신청)?\s*(?:[-–—]\s*)?"
        r"(?:기간|기한|마감|일정|일\s*시)?\s*[:：]?\s*$"
    )),
    ("submission_period", re.compile(
        r"(?:서류|과제|자료|신청서)?\s*제출\s*(?:[-–—]\s*)?"
        r"(?:기간|기한|마감|일정|일자)?\s*[:：]?\s*$"
    )),
    ("application_period", re.compile(
        r"(?:신청|접수|지원|모집|응모)\s*(?:[-–—]\s*)?"
        r"(?:기간|기한|마감|일정|일자)?\s*[:：]?\s*$"
    )),
    ("event", re.compile(
        r"(?:사업|운영|활동|교육|행사|설명회|특강|캠프|대회|세미나|워크숍|오리엔테이션|본선|견학)(?:은|는)?"
        r"\s*(?:[-–—]\s*)?(?:기간|일\s*시|일정|일자|개최)?\s*[:：]?\s*$"
    )),
)

INTERNAL_WORKFLOW_LABEL_RE = re.compile(
    r"(?:학과|부서|단과대학|대학|행정실)\s*[:：]\s*$"
)
STUDENT_WORKFLOW_LABEL_RE = re.compile(
    r"(?:학생|신청자|지원자)"
    r"(?:\s*➜\s*소속\s*학과\s*제출\s*기준)?\s*[:：]\s*$"
)
INTERNAL_WORKFLOW_CONTEXT_RE = re.compile(
    r"(?:교육지원과|학사지원과|학생과|장학과|교무과|본부|행정실)"
    r"\s*(?:도착\s*기준|제출|추천|송부|공문)"
    r"|(?:추천자|추천\s*명단)\s*(?:서류)?\s*(?:제출|송부)"
    r"|공문\s*(?:제출|발송|송부)"
)

STRONG_EVENT_TYPE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("result_announcement", re.compile(r"(?:결과|합격자|선정)\s*발표\s*(?:예정|일|일정|기간)")),
    ("exam_or_interview", re.compile(r"(?:시험|면접|평가|고사)\s*(?:일시|일정|기간|일자|예정)")),
    ("payment_period", re.compile(r"(?:등록금|수업료|분담금|납부)\s*(?:납부)?\s*(?:기간|기한|마감|일정)")),
    ("academic_period", re.compile(r"(?:수강신청|휴학|복학|재입학|전과|학점인정|등록)\s*(?:신청)?\s*(?:기간|기한|마감|일정)")),
    ("submission_period", re.compile(r"(?:서류|과제|자료|신청서)?\s*제출\s*(?:기간|기한|마감|일정|일자)")),
    ("application_period", re.compile(r"(?:신청|접수|지원|모집|응모)\s*(?:기간|기한|마감|일정|일자)")),
    ("event", re.compile(r"(?:사업|운영|활동|교육|행사|설명회|특강|캠프|대회|세미나|워크숍|오리엔테이션)\s*(?:기간|일시|일정|일자|개최)")),
)

EVENT_TYPE_PRIORITY = {
    "result_announcement": 90,
    "exam_or_interview": 80,
    "payment_period": 70,
    "academic_period": 65,
    "application_period": 60,
    "submission_period": 55,
    "event": 50,
    "deadline": 10,
}

RESULT_COMPLETED_HINTS = (
    "최종합격자", "최종 합격자", "합격자 발표", "합격자 공고", "수상자 발표",
    "선정결과 발표", "선정 결과 발표", "서류전형 합격자", "서류 전형 합격자",
    "1차 전형 합격자", "면접 대상자", "채용 결과",
)


REVISION_METADATA_AFTER_RE = re.compile(
    r"^\s*[.)）\]}`'\"“”‘’,.]*\s*(?:기준|현재|수정(?:함)?|정정|변경|업데이트|재업로드|반영)"
)
REVISION_METADATA_BEFORE_RE = re.compile(
    r"(?:공고일|게시일|등록일|작성일|기준일|수정(?:일)?|정정(?:일)?|변경(?:일)?|"
    r"업데이트(?:일)?|재업로드(?:일)?|반영일)\s*[:：]?\s*[\(（\[`'\"“”‘’]*\s*"
    r"(?:\d{2}\s*[.\-/년]\s*)?$"
)
DAY_ONLY_RANGE_TAIL_RE = re.compile(
    r"^\s*[.]?\s*"
    r"(?:(?:(?:오전|오후)\s*)?(?:[01]?\d|2[0-3])\s*(?::\s*[0-5]\d|시(?:\s*[0-5]?\d\s*분?)?)\s*)?"
    r"(?P<connector>~|∼|～|[-–—]|부터)\s*"
    r"(?P<day>3[01]|[12]\d|0?[1-9])(?!\d|\s*[.\-/월]\s*\d)\s*(?:일)?"
    r"(?:\s*[.]?\s*[\(（][^）)]{0,10}[\)）])?"
)
MULTIPLE_DISCRETE_DATE_CONNECTOR_RE = re.compile(r"[,，]|(?:\s+/\s+)|(?:\s+[·ㆍ]\s+)|(?:\s+및\s+)|(?:\s+또는\s+)")
TRUNCATED_DATE_CONTEXT_RE = re.compile(r"\d{1,2}\s*[.]?\s*[\(（]\s*[월화수목금토일]?\s*$")
OPEN_ENDED_APPLICATION_RE = re.compile(
    r"(?:부터\s*)?(?:~|∼|～)?\s*(?:선착순|정원\s*충족\s*시|모집인원\s*충족\s*시)\s*마감"
)
CONDITIONAL_SELECTED_PARTICIPANT_RE = _applicability_layer.CONDITIONAL_SELECTED_PARTICIPANT_RE
NON_STUDENT_LOCAL_ACTION_RE = re.compile(
    r"추천기관\s*추천\s*마감일|기관\s*추천\s*마감일|"
    r"담당자.{0,35}(?:사전요청|추가방역\s*요청|보건실로\s*요청)"
)
COMPLETED_STATUS_TITLE_RE = re.compile(
    r"(?:승인|선발)\s*(?:자\s*)?명단\s*(?:알림|안내|공고)"
    r"|승인\s*결과\s*(?:알림|안내|공고)"
)

COURSE_REGISTRATION_CONTEXT_RE = re.compile(
    r"(?:예비\s*)?수강\s*신청|수강신청\s*(?:변경|취소|정정|일정|기간)"
)
COURSE_ACTION_TYPES = set(_applicability_layer.COURSE_ACTION_TYPES)
ACADEMIC_ACTION_TYPES = set(_applicability_layer.ACADEMIC_ACTION_TYPES)
# Academic actions must be tied to a nearby action label.  Audience/status
# phrases such as ``휴학생 제외`` or ``재/휴학 증명서`` are not actions.
LEAVE_ACTION_RE = re.compile(r"(?<![/재])휴학(?!\s*생|\s*증명)")
RETURN_ACTION_RE = re.compile(r"복학(?!\s*생)")
SHARED_LEAVE_RETURN_RE = re.compile(
    r"휴학\s*(?:및|·|ㆍ|/|\&|과|와)\s*복학|복학\s*(?:및|·|ㆍ|/|\&|과|와)\s*휴학|휴[·ㆍ]복학"
)
LEAVE_RETURN_EXCLUSION_RE = re.compile(
    r"(?:휴학|복학)\s*(?:생|자)?\s*(?:제외|불가|포함|대상)"
    r"|(?:제외|불가|포함|대상).{0,12}(?:휴학|복학)"
    r"|재\s*/\s*휴학\s*증명서"
)
COURSE_REGISTRATION_CHANGE_RE = re.compile(r"수강\s*신청\s*(?:변경|정정)|수강변경")
COURSE_REGISTRATION_CANCEL_RE = re.compile(r"수강\s*신청\s*(?:취소|철회)|수강취소")
PRELIMINARY_COURSE_REGISTRATION_RE = re.compile(
    r"예비\s*수강\s*신청|수강\s*신청\s*[:：]?\s*[\(（]?\s*예비"
)
COURSE_REGISTRATION_BASE_RE = re.compile(
    r"(?<!예비\s)수강\s*신청(?!\s*(?:변경|정정|취소|철회|가능학점|결과))"
)
COURSE_COHORT_LABEL_RE = re.compile(
    r"(?<!\d)(?:[1-6]\s*(?:~|∼|～|[-–—])\s*[1-6]\s*학년(?!도)"
    r"|(?:[1-6]\s*[,，·ㆍ/]\s*)+[1-6]\s*학년(?!도)"
    r"|[1-6]\s*학년(?!도)"
    r"|(?:전|전체|모든)\s*학년(?!도)"
    r"|신입생|편입생|재학생|대학원생|학부생)"
)

NON_ACTION_PROCESS_PERIOD_RE = re.compile(
    r"(?:선발|심사|평가|검토|후보자\s*결정|내부\s*검토)"
    r"(?:\s*및\s*(?:선발|심사|평가|검토|후보자\s*결정))*\s*(?:기간|일정)"
)
PARTIAL_ACTIVITY_PERIOD_RE = re.compile(
    r"활동\s*기간\s*[:：]?\s*[\(（]?\s*"
    r"(?:(?:20\d{2})\s*[.\-/년]\s*)?"
    r"(?:\d{1,2}\s*(?:[.월])\s*(?:초|중|말)?"
    r"|20\d{2}학년도\s*\d학기|선발일|선정일|합격일)"
    r"\s*[\(（]?[\)）]?\s*(?:~|∼|～|[-–—]|부터)"
)
POST_RESULT_FOLLOWUP_RE = re.compile(
    r"(?:서류|서약서|동의서|신청서)?\s*제출|서명|등록|납부|"
    r"오리엔테이션|사전교육|교육\s*(?:일시|일정|진행)|면접|"
    r"근로\s*종료|활동\s*시작|포기\s*(?:연락|신청)"
)

COMPLETED_RESULT_TITLE_RE = re.compile(
    r"(?:선발|선정|심사|공모|모집|과제|장학생|멘토)?\s*결과\s*(?:안내|발표|공고|확인)"
    r"|(?:합격자|수상자|선정자)\s*(?:안내|발표|공고)"
)
FUTURE_RESULT_TITLE_RE = re.compile(
    r"(?:결과|합격자|수상자|선정자)?\s*발표\s*(?:예정|일정|일자|일)"
)


STRUCTURAL_LIST_PREFIX_RE = re.compile(
    r"^\s*(?P<marker>(?:[가-하]\.|[①-⑳]|(?:\d{1,2}[.)])|[-•▪▶※]))\s*"
)
STRONG_STRUCTURAL_ITEM_RE = re.compile(
    r"^\s*(?P<marker>(?:[가-하]\.|[①-⑳]|(?:\d{1,2}[.)])))\s*"
)
GENERIC_TEMPORAL_ITEM_RE = re.compile(
    r"^\s*(?:[가-하]\.|[①-⑳]|(?:\d{1,2}[.)]))\s*"
    r"(?:일\s*시|일정|기간|기한)\s*[:：]?"
)
STRUCTURAL_LIST_SPLIT_RE = re.compile(
    r"\s+(?=(?:[가-하]\.|[①-⑳])\s*(?=[가-힣A-Za-z\[]))"
)
STRUCTURAL_LABEL_CLAUSE_RE = re.compile(
    r"(?P<label>(?:합격자|선정|선발|결과|최종\s*발표|추천\s*대상자|폐강|신청|접수|지원|모집|제출|납부|지급|등록금|"
    r"수강\s*신청|휴학|복학|재입학|시험|면접|코딩\s*테스트|활동|교육|실습|탐방|행사|설명회|사업|운영|수업|환불)"
    r"[^:：]{0,28}?(?:기간|기한|마감|일정|일시|일자|발표|예정)?)\s*[:：]"
)
STRUCTURAL_LABEL_HINT_RE = re.compile(
    r"(?:기간|기한|마감|일정|일시|일자|발표|확정|결과|선발|선정|추천|시험|면접|코딩\s*테스트|"
    r"납부|지급|등록금|제출|접수|신청|모집|지원|수강|휴학|복학|재입학|전과|학점\s*인정|"
    r"활동|교육|실습|탐방|폐강|행사|운영)"
)
LOCAL_ACTION_SIGNAL_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("leave_of_absence_application", re.compile(
        r"(?:휴학(?!\s*생|\s*증명).{0,18}(?:신청|기간|희망자|연장|1차|2차)"
        r"|(?:신청|기간|희망자|1차|2차).{0,18}휴학(?!\s*생|\s*증명))"
    )),
    ("return_from_leave_application", re.compile(
        r"(?:복학(?!\s*생).{0,18}(?:신청|기간|희망자|1차|2차)"
        r"|(?:신청|기간|희망자|1차|2차).{0,18}복학(?!\s*생))"
    )),
    ("readmission_application", re.compile(
        r"재입학(?!생|자).{0,18}(?:신청|지원서\s*접수|원서\s*접수)"
        r"|(?:지원서|원서)\s*접수.{0,12}재입학(?!생|자)"
    )),
    ("major_transfer_application", re.compile(r"전과.{0,18}(?:신청|접수)|(?:신청|접수).{0,15}전과")),
    ("credit_recognition_application", re.compile(r"학점\s*인정.{0,18}(?:신청|접수)|(?:신청|접수).{0,15}학점\s*인정")),
    ("course_evaluation", COURSE_EVALUATION_RE),
    ("payment_period", re.compile(r"(?:등록금|수업료|수강료|분담금|납부|환불).{0,14}(?:기간|기한|마감|일정|납부|예정)?")),
    ("submission_period", re.compile(r"(?:서류|과제|자료|신청서)?\s*제출.{0,12}(?:기간|기한|마감|일정|일자)?")),
    ("application_period", re.compile(r"(?:신청|접수|지원(?!과|부|팀|센터|실)|모집(?!\s*(?:대상|인원|정원))|응모).{0,12}(?:기간|기한|마감|일정|일자)?")),
    ("result_announcement", re.compile(
        r"(?:결과|합격자|선정|선발).{0,12}(?:발표|안내|확인|예정|확정)"
        r"|최종\s*발표|추천\s*대상자.{0,10}(?:안내|발표|확정)"
        r"|(?:시험|지원|추천|우선추천|선발)\s*대상자.{0,14}(?:발표|안내|확정|통보)"
        r"|재입학\s*허가(?:자)?\s*(?:통보|발표|안내|예정)"
        r"|폐강(?:과목|강좌)?.{0,10}확정"
    )),
    ("exam_or_interview", re.compile(r"(?:시험|면접|평가|고사|코딩\s*테스트).{0,12}(?:일시|일정|기간|일자|예정)?")),
    ("event", re.compile(r"(?:사업|수업|활동|교육|실습|탐방|행사|설명회|특강|캠프|대회|세미나|워크숍|오리엔테이션|운영|이용|수강(?!\s*신청)).{0,12}(?:기간|일시|일정|일자|개최|진행)?")),
)

ACTION_FAMILY = {
    "application_period": "application",
    "deadline": "application",
    "submission_period": "submission",
    "payment_period": "payment",
    "academic_period": "academic",
    "event": "event",
    "exam_or_interview": "exam",
    "result_announcement": "result",
    "job_application_period": "job_application",
}


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def contains_any(text: str, words: Iterable[str]) -> bool:
    return any(word and word in text for word in words)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


# S22 composition root: the deterministic temporal implementation now lives
# in a separately testable module.  These aliases preserve the established
# Policy.15 API and semantic output while downstream layers are migrated.
import noticepilot_temporal_parser as _temporal_layer

_temporal_layer.configure_temporal_parser(
    SPACE_RE=SPACE_RE,
    DATE_TOKEN_RE=DATE_TOKEN_RE,
    TIME_TOKEN_RE=TIME_TOKEN_RE,
    TIME_RANGE_RE=TIME_RANGE_RE,
    END_OF_DAY_24_RE=END_OF_DAY_24_RE,
    RELATIVE_WITHIN_RE=RELATIVE_WITHIN_RE,
    RELATIVE_FOR_RE=RELATIVE_FOR_RE,
    RELATIVE_NEXT_DAY_FOR_RE=RELATIVE_NEXT_DAY_FOR_RE,
    LOCAL_RANGE_CONNECTOR_RE=LOCAL_RANGE_CONNECTOR_RE,
    FRACTION_CONTEXT_RE=FRACTION_CONTEXT_RE,
    NON_ACTION_DATE_CONTEXT_RE=NON_ACTION_DATE_CONTEXT_RE,
    REVISION_METADATA_AFTER_RE=REVISION_METADATA_AFTER_RE,
    REVISION_METADATA_BEFORE_RE=REVISION_METADATA_BEFORE_RE,
    DAY_ONLY_RANGE_TAIL_RE=DAY_ONLY_RANGE_TAIL_RE,
    MULTIPLE_DISCRETE_DATE_CONNECTOR_RE=MULTIPLE_DISCRETE_DATE_CONNECTOR_RE,
    TRUNCATED_DATE_CONTEXT_RE=TRUNCATED_DATE_CONTEXT_RE,
)
TEMPORAL_PARSER = _temporal_layer.TemporalParser()
ParsedDateToken = _temporal_layer.ParsedDateToken
DateResolution = _temporal_layer.DateResolution
normalize_space = _temporal_layer.normalize_space
parse_iso_date = _temporal_layer.parse_iso_date
format_datetime = _temporal_layer.format_datetime
infer_year = _temporal_layer.infer_year
matched_year = _temporal_layer.matched_year
is_non_date_numeric_match = _temporal_layer.is_non_date_numeric_match
is_local_range_connector = _temporal_layer.is_local_range_connector
resolution_is_chronological = _temporal_layer.resolution_is_chronological
contains_invalid_date_token = _temporal_layer.contains_invalid_date_token
normalize_clock = _temporal_layer.normalize_clock
parse_time_after = _temporal_layer.parse_time_after
parse_time_range_after = _temporal_layer.parse_time_range_after
has_end_of_day_24_after = _temporal_layer.has_end_of_day_24_after
parse_date_tokens = _temporal_layer.parse_date_tokens
resolve_day_only_range = _temporal_layer.resolve_day_only_range
has_multiple_discrete_dates = _temporal_layer.has_multiple_discrete_dates
has_recurring_time_window_after_date_range = _temporal_layer.has_recurring_time_window_after_date_range
has_truncated_date_context = _temporal_layer.has_truncated_date_context
resolve_relative_date = _temporal_layer.resolve_relative_date
resolve_absolute_date = _temporal_layer.resolve_absolute_date
resolve_date = _temporal_layer.resolve_date


def build_segments(title: str, body: str, published: date | None = None) -> list[str]:
    """Compatibility wrapper for callers that still expect plain text.

    Policy.12 no longer creates overlapping 2–3 line windows.
    """
    return [
        segment.text
        for segment in build_schedule_segments(title, body, published or date.today())
    ]


def infer_audience(notice: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """Compatibility wrapper delegated to the S24-B evaluator."""
    return APPLICABILITY_EVALUATOR.infer_notice_audience(notice, config)


def classify_event_type(segment: str, config: dict[str, Any]) -> str | None:
    k = config["keywords"]
    if RESULT_STATUS_ANNOUNCEMENT_RE.search(segment):
        return "result_announcement"
    if OPERATIONAL_EVENT_CONTEXT_RE.search(segment):
        return "event"
    if COURSE_EVALUATION_RE.search(segment):
        return "academic_period"
    if ACTIVITY_PERIOD_LABEL_RE.search(segment):
        return "event"
    if contains_any(segment, k["futureResult"]):
        return "result_announcement"
    if contains_any(segment, k["payment"]):
        return "payment_period"
    if contains_any(segment, k["submission"]):
        return "submission_period"
    if contains_any(segment, k["registration"]):
        return "academic_period"
    if re.search(
        r"(?:모집(?!\s*(?:대상|인원|정원))|신청|지원|선발)[^()（）\n]{0,28}[\(（]\s*(?:~|∼|～)",
        segment,
    ):
        return "application_period"
    if re.search(r"활동\s*(?:기간|일정|일시|일자)", segment):
        return "event"
    application_segment = re.sub(
        r"모집\s*(?:대상|인원|정원)", "", segment
    )
    if contains_any(application_segment, k["application"]):
        return "application_period"
    if contains_any(segment, k["exam"]):
        return "exam_or_interview"
    if contains_any(segment, k["event"]):
        return "event"
    if any(word in segment for word in ("마감", "기한", "까지")):
        return "deadline"
    return None


def token_for_resolution(segment: str, published: date, resolution: DateResolution) -> ParsedDateToken | None:
    target = parse_iso_date(resolution.start)
    tokens = parse_date_tokens(segment, published)
    if not tokens:
        return None
    matches = [item for item in tokens if item.value == target]
    if not matches:
        return tokens[0]
    if "T" in resolution.start:
        target_time = resolution.start[11:16]
        timed = next((item for item in matches if item.time_value == target_time), None)
        if timed is not None:
            return timed
    return matches[0]


def local_context_for_resolution(segment: str, published: date, resolution: DateResolution) -> str:
    token = token_for_resolution(segment, published, resolution)
    if token is None:
        return segment
    return segment[max(0, token.span_start - 110) : min(len(segment), token.span_end + 70)]


def is_non_action_reference_date(
    segment: str,
    published: date,
    resolution: DateResolution,
) -> bool:
    """Detect exact dates that describe a reference fact, not a user action."""
    token = token_for_resolution(segment, published, resolution)
    if token is None:
        return False
    before = segment[max(0, token.span_start - 120) : token.span_start]
    after = segment[token.span_end : min(len(segment), token.span_end + 90)]
    local = segment[max(0, token.span_start - 150) : min(len(segment), token.span_end + 120)]

    if re.search(r"종강일\s*[\(（]?\s*$", before) and re.match(r"^\s*[.)）]*\s*이후", after):
        return True
    if re.search(r"(?:성적\s*)?송부일(?:이|은|는)?\s*[:：]?\s*$", before):
        return True
    if re.search(
        r"(?:배포|공유|게시|업로드|공개)\s*예정(?:일|이오니)?\s*"
        r"[\(（'\"“”‘’]*\s*(?:\d{2}\s*[.\-/년]\s*)?$",
        before,
    ):
        return True
    if re.search(
        r"(?:졸업예정자|신청\s*불가|지원\s*불가|대상\s*제외).{0,80}학위수여식"
        r"|학위수여식.{0,80}(?:졸업예정자|신청\s*불가|지원\s*불가|대상\s*제외)",
        local,
    ):
        return True
    if re.search(r"(?:장학금|지원금|근로장학금)?\s*지급\s*일자\s*[:：]?\s*$", before):
        return True
    if re.search(r"(?:환불|반환)\s*(?:일정|일자|예정일?|예정\s*일자)?\s*[:：]?\s*$", before):
        return True
    if re.search(
        r"(?:수강료|수업료|등록금).{0,35}(?:환불|반환)\s*"
        r"(?:[\(（]\s*예정\s*[\)）]|일정|일자)\s*[:：]?",
        local,
    ):
        return True
    if re.search(r"(?:한국장학재단에\s*등록된\s*계좌로\s*)?입금\s*처리", local):
        return True
    if re.search(r"(?:장학금|지원금|근로장학금).{0,35}지급\s*(?:예정|일정)", local):
        return True
    return False


def is_partial_activity_period(
    segment: str,
    published: date,
    resolution: DateResolution,
) -> bool:
    """Return True when the matched date is the sole exact end of an activity period."""
    if resolution.kind != "absolute_single":
        return False
    token = token_for_resolution(segment, published, resolution)
    if token is None:
        return False
    tokens = parse_date_tokens(segment, published)
    for match in PARTIAL_ACTIVITY_PERIOD_RE.finditer(segment):
        following = [item for item in tokens if item.span_start >= match.end()]
        if following and following[0].span_start == token.span_start:
            return True
    before = segment[max(0, token.span_start - 90):token.span_start]
    after = segment[token.span_end:min(len(segment), token.span_end + 90)]
    if ACTIVITY_PERIOD_LABEL_RE.search(before) and re.search(
        r"^\s*[.)）]*\s*(?:~|∼|～|[-–—]|부터)\s*"
        r"(?:(?:20\d{2})\s*[.\-/년]\s*)?\d{1,2}\s*월?\s*(?:초|중|말)(?:까지)?",
        after,
    ):
        return True
    return False


def nearest_event_label_type(segment: str, published: date, resolution: DateResolution) -> str | None:
    token = token_for_resolution(segment, published, resolution)
    if token is None:
        return None
    before = segment[max(0, token.span_start - 120) : token.span_start]
    matches: list[tuple[int, int, str]] = []
    for event_type, pattern in NEAREST_EVENT_LABEL_PATTERNS:
        match = pattern.search(before)
        if match:
            matches.append((match.start(), EVENT_TYPE_PRIORITY.get(event_type, 0), event_type))
    if not matches:
        return None
    return max(matches)[2]


def is_internal_student_workflow(
    segment: str,
    published: date,
    resolution: DateResolution,
    board_id: str,
) -> bool:
    """Detect administrative forwarding deadlines inside student notices.

    Board 720/721 notices often publish both the student's deadline to their
    department and a later department-to-central-office deadline.  The latter
    must not enter the student default feed.
    """
    if board_id not in {"720", "721"}:
        return False
    token = token_for_resolution(segment, published, resolution)
    if token is None:
        return False
    before = segment[max(0, token.span_start - 130) : token.span_start]
    if STUDENT_WORKFLOW_LABEL_RE.search(before):
        return False
    if INTERNAL_WORKFLOW_LABEL_RE.search(before):
        return True
    local = segment[max(0, token.span_start - 95) : min(len(segment), token.span_end + 45)]
    return bool(INTERNAL_WORKFLOW_CONTEXT_RE.search(local))


def refine_event_type(segment: str, published: date, resolution: DateResolution, fallback: str, config: dict[str, Any]) -> str:
    local = local_context_for_resolution(segment, published, resolution)
    if RESULT_STATUS_ANNOUNCEMENT_RE.search(local):
        return "result_announcement"
    if OPERATIONAL_EVENT_CONTEXT_RE.search(local):
        return "event"
    if COURSE_EVALUATION_RE.search(local):
        return "academic_period"
    if ACTIVITY_PERIOD_LABEL_RE.search(local):
        return "event"
    nearest = nearest_event_label_type(segment, published, resolution)
    if nearest:
        return nearest
    for event_type, pattern in STRONG_EVENT_TYPE_PATTERNS:
        if pattern.search(local):
            return event_type
    local_fallback = classify_event_type(local, config)
    return local_fallback or fallback


def resolution_end_date(resolution: DateResolution) -> date | None:
    return parse_iso_date(resolution.end or resolution.start)


def infer_student_years(text: str) -> list[int]:
    return _applicability_layer.infer_student_years(text)


def infer_degree_levels(text: str) -> list[str]:
    return _applicability_layer.infer_degree_levels(text)


def infer_admission_types(text: str) -> list[str]:
    return _applicability_layer.infer_admission_types(text)


def infer_enrollment_statuses(text: str) -> list[str]:
    return _applicability_layer.infer_enrollment_statuses(text)


def audience_rules_key(rules: dict[str, Any] | None) -> tuple[Any, ...]:
    return _applicability_layer.audience_rules_key(rules)


def _match_distance(match: re.Match[str], token: ParsedDateToken) -> int:
    if match.end() <= token.span_start:
        return token.span_start - match.end()
    if match.start() >= token.span_end:
        return match.start() - token.span_end
    return 0


def _course_action_type_from_text(text: str) -> str | None:
    if PRELIMINARY_COURSE_REGISTRATION_RE.search(text):
        return "preliminary_course_registration"
    if COURSE_REGISTRATION_CANCEL_RE.search(text):
        return "course_registration_cancellation"
    if COURSE_REGISTRATION_CHANGE_RE.search(text):
        return "course_registration_change"
    if COURSE_REGISTRATION_BASE_RE.search(text):
        return "course_registration"
    return None


def _event_type_from_segment_signals(
    source_segment: ScheduleSegment,
    title: str,
) -> str | None:
    signals = set(source_segment.action_signals)
    if "result_announcement" in signals:
        return "result_announcement"
    if "course_evaluation" in signals:
        return "academic_period"
    if "exam_or_interview" in signals:
        return "exam_or_interview"
    if "payment_period" in signals:
        return "payment_period"
    if signals.intersection(ACADEMIC_ACTION_TYPES):
        return "academic_period"
    if "submission_period" in signals:
        return "submission_period"
    local = normalize_space(f"{source_segment.label_text} {source_segment.text}")
    if "application_period" in signals and re.search(
        r"(?:신청|접수|지원|모집|응모)\s*(?:기간|기한|마감|일정|일자)",
        local,
    ):
        return "application_period"
    if "event" in signals:
        return "event"
    if "application_period" in signals:
        return "application_period"
    # Short body labels may inherit only the action family, never a date, from
    # an explicit title such as ``수강신청 취소 안내``.
    if re.search(r"(?:취소|변경|정정)\s*(?:기간|기한|일정|일시)", local):
        if _course_action_type_from_text(title):
            return "academic_period"
    return None


DATE_FRAGMENT_PIECE_RE = re.compile(
    r"^[\s\d.:'’`()（）\[\]{}~∼～\-–—,/월화수목금토일오전후시분까지부터]+$"
)
COMPACT_COHORT_CELL_RE = re.compile(
    r"^(?:[1-6](?:\s*[·ㆍ,/]\s*[1-6])+|[1-6]\s*(?:~|∼|～|[-–—])\s*[1-6]|전체|전학년|전체학년)$"
)
COURSE_COHORT_BOUNDARY_RE = re.compile(
    r"^(?:신입생|편입생|신\s*[\(（]?\s*편\s*[\)）]?\s*입생|신·편입생|신/편입생)$"
)


# S22 composition root for structural analysis.  Policy-specific signal
# vocabularies are injected here; structural ordering and ownership are owned
# by noticepilot_structure_analyzer.
import noticepilot_structure_analyzer as _structure_layer

_structure_layer.configure_structure_analyzer(
    SCHEDULE_SEGMENT_SCHEMA_VERSION=SCHEDULE_SEGMENT_SCHEMA_VERSION,
    STRUCTURAL_LABEL_CLAUSE_RE=STRUCTURAL_LABEL_CLAUSE_RE,
    STRUCTURAL_LIST_SPLIT_RE=STRUCTURAL_LIST_SPLIT_RE,
    STRUCTURAL_LABEL_HINT_RE=STRUCTURAL_LABEL_HINT_RE,
    STRUCTURAL_LIST_PREFIX_RE=STRUCTURAL_LIST_PREFIX_RE,
    STRONG_STRUCTURAL_ITEM_RE=STRONG_STRUCTURAL_ITEM_RE,
    GENERIC_TEMPORAL_ITEM_RE=GENERIC_TEMPORAL_ITEM_RE,
    LOCAL_ACTION_SIGNAL_PATTERNS=LOCAL_ACTION_SIGNAL_PATTERNS,
    SHARED_LEAVE_RETURN_RE=SHARED_LEAVE_RETURN_RE,
    DATE_FRAGMENT_PIECE_RE=DATE_FRAGMENT_PIECE_RE,
    COMPACT_COHORT_CELL_RE=COMPACT_COHORT_CELL_RE,
    COURSE_COHORT_BOUNDARY_RE=COURSE_COHORT_BOUNDARY_RE,
    COURSE_REGISTRATION_CONTEXT_RE=COURSE_REGISTRATION_CONTEXT_RE,
    normalize_space=normalize_space,
    sha256_text=sha256_text,
    parse_iso_date=parse_iso_date,
    parse_date_tokens=parse_date_tokens,
    resolve_date=resolve_date,
    _course_action_type_from_text=_course_action_type_from_text,
    infer_student_years=infer_student_years,
    infer_degree_levels=infer_degree_levels,
    infer_enrollment_statuses=infer_enrollment_statuses,
    infer_admission_types=infer_admission_types,
)
STRUCTURE_ANALYZER = _structure_layer.StructureAnalyzer()
ScheduleSegment = _structure_layer.ScheduleSegment
build_schedule_segments = STRUCTURE_ANALYZER.analyze

# S23 composition root for local date-to-structure binding.
import noticepilot_local_binder as _binding_layer

LOCAL_BINDER = _binding_layer.LocalBinder(TEMPORAL_PARSER)

# S24-A adapter for exact KNU board 716 list-metadata application periods.
# It supplies the same layered trace shape as body-derived candidates without
# making applicability or publishability decisions.
import noticepilot_board716_trace_adapter as _board716_trace_layer

BOARD716_TRACE_ADAPTER = _board716_trace_layer.Board716ListMetadataTraceAdapter(
    segment_factory=ScheduleSegment,
    local_binder=LOCAL_BINDER,
)


def build_schedule_segment_summary(
    segment_rows: Sequence[Mapping[str, object]],
) -> dict[str, object]:
    """Derive deterministic document summary fields without mutating input rows."""
    type_counts = Counter(
        str(row.get("segmentType") or "unknown") for row in segment_rows
    )
    return {
        "segmentCount": len(segment_rows),
        "locallyGroundedCount": sum(
            1 for row in segment_rows if row.get("locallyGrounded")
        ),
        "typeCounts": {
            key: type_counts[key]
            for key in sorted(type_counts)
        },
    }


def schedule_segment_document(notice: dict[str, Any]) -> dict[str, Any]:
    published = parse_iso_date(notice.get("publishedAt"))
    segments = build_schedule_segments(
        normalize_space(notice.get("title")),
        str(notice.get("extractedText") or ""),
        published or date.today(),
    )
    segment_rows = [
        segment.source_metadata() | {"text": segment.text}
        for segment in segments
    ]
    return {
        "schemaVersion": SCHEDULE_SEGMENT_SCHEMA_VERSION,
        "sourceNoticeId": notice.get("noticeId"),
        "sourceContentHash": notice.get("contentHash"),
        "sourceTitle": notice.get("title"),
        "publishedAt": notice.get("publishedAt"),
        "extractor": {
            "version": PIPELINE_VERSION,
            "mode": "structured_schedule_segment_v0.2",
        },
        "segments": segment_rows,
        "summary": build_schedule_segment_summary(segment_rows),
    }


def merge_candidate_source_segments_into_document(
    document: dict[str, Any],
    decision: dict[str, Any],
) -> dict[str, Any]:
    """Include candidate-only metadata segments in the segment audit document."""
    segments = document.setdefault("segments", [])
    known_ids = {str(row.get("segmentId") or "") for row in segments}
    for candidate in decision.get("candidates") or []:
        source_segment = candidate.get("sourceSegment") or {}
        segment_id = str(source_segment.get("segmentId") or "")
        if not segment_id or segment_id in known_ids:
            continue
        row = dict(source_segment)
        row["text"] = candidate.get("evidence") or candidate.get("dateText") or ""
        segments.append(row)
        known_ids.add(segment_id)
    existing_summary = document.get("summary") or {}
    document["summary"] = {
        **existing_summary,
        **build_schedule_segment_summary(segments),
    }
    return document


def build_semantic_review_payloads(
    schedule_segments: list[ScheduleSegment],
    title: str,
    config: dict[str, Any],
    reason_codes: Iterable[str],
) -> list[dict[str, Any]]:
    """Create bounded review/AI handoff payloads for ungrounded dates."""
    if "action_label_not_locally_grounded" not in set(reason_codes):
        return []
    title_segment = next(
        (segment for segment in schedule_segments if segment.segment_type == "title"),
        None,
    )
    candidate_action_types = sorted({
        signal for signal in (title_segment.action_signals if title_segment else ())
        if signal in ACADEMIC_ACTION_TYPES
    })
    candidate_event_types: list[str] = []
    title_event = classify_event_type(title, config)
    if title_event:
        candidate_event_types.append(title_event)
    if title_segment:
        signal_event = _event_type_from_segment_signals(title_segment, title)
        if signal_event and signal_event not in candidate_event_types:
            candidate_event_types.append(signal_event)

    payloads: list[dict[str, Any]] = []
    for segment in schedule_segments:
        if segment.segment_type == "title" or not segment.date_spans or segment.locally_grounded:
            continue
        payloads.append({
            "schemaVersion": SEMANTIC_REVIEW_SCHEMA_VERSION,
            "reviewReason": "action_label_not_locally_grounded",
            "sourceSegment": segment.source_metadata() | {"text": segment.text},
            "candidateEventTypes": candidate_event_types,
            "candidateActionTypes": candidate_action_types,
            "allowedOutcomes": ["select_label", "reject_candidate", "keep_needs_review"],
            "promotionConstraint": "deterministic_date_required",
        })
    return payloads


def _course_match_is_temporal(
    segment: str,
    match: re.Match[str],
    token: ParsedDateToken,
) -> bool:
    distance = _match_distance(match, token)
    if match.end() <= token.span_start:
        if distance > 55:
            return False
        between = segment[match.end():token.span_start]
        # A nearer non-course label owns the date.  A course-registration
        # phrase in the notice title must not relabel tuition, class, activity,
        # result, refund, or generic recruitment periods in the body.
        competing_tail = between[-70:]
        if re.search(
            r"(?:모집|접수|지원|제출|등록|등록금|납부|수업|운영|활동|교육|"
            r"성적\s*확정|(?:수강료\s*)?환불(?:\s*[\(（]?예정[\)）]?)?|"
            r"결과|발표|공고|오리엔테이션)"
            r"\s*(?:기간|일시|일정|기한|마감|예정)?",
            competing_tail,
        ):
            return False
        # Mere mentions such as ``수강신청 방법과 동일`` are not actions.
        if re.search(r"(?:과\s*동일|방법|시스템|가능학점|결과|대상자\s*예외)", between):
            return False
        return bool(
            distance <= 12
            or re.search(r"(?:기간|일시|일정|기한|마감|[:：]|부터|~|∼|～)", between)
        )

    if match.start() >= token.span_end:
        if distance > 28:
            return False
        after = segment[match.start(): min(len(segment), match.end() + 22)]
        return bool(re.search(r"수강\s*신청(?:이)?\s*(?:가능|시작)", after))
    return True


def _valid_leave_return_match(
    segment: str,
    match: re.Match[str],
    title: str,
) -> bool:
    local = segment[max(0, match.start() - 24): min(len(segment), match.end() + 34)]
    if LEAVE_RETURN_EXCLUSION_RE.search(local):
        return False
    if re.search(r"(?:증명서|지원\s*불가|신청\s*불가|대상\s*제외)", local):
        return False
    title_is_action_notice = bool(
        re.search(r"(?:휴학|복학|휴[·ㆍ]복학).{0,28}(?:신청|안내)", title)
    )
    return bool(
        title_is_action_notice
        or re.search(
            r"(?:휴학|복학).{0,20}(?:신청|기간|희망자|연장|1차|2차)"
            r"|(?:신청|기간|희망자|1차|2차).{0,20}(?:휴학|복학)",
            local,
        )
    )


def infer_academic_action_types(
    segment: str,
    title: str,
    published: date,
    resolution: DateResolution,
    event_type: str,
) -> list[str]:
    """Return stable academic action identifiers only from nearby action labels.

    The title can confirm an action family, but it may not relabel every date
    in the notice.  This prevents a course-registration title from turning a
    tuition period, class period, refund date, or result date into a
    ``course_registration`` candidate.
    """
    token = token_for_resolution(segment, published, resolution)
    if token is None:
        return []
    window_start = max(0, token.span_start - 115)
    window_end = min(len(segment), token.span_end + 80)
    window = segment[window_start:window_end]

    # Leave and return markers are allowed to override payment vocabulary, but
    # only when they describe the action itself—not an eligibility status.
    # A shared title does not split every date: only a shared phrase that
    # directly labels the date produces two candidates.
    for shared in SHARED_LEAVE_RETURN_RE.finditer(segment, window_start, window_end):
        if not _valid_leave_return_match(segment, shared, title):
            continue
        if shared.end() > token.span_start:
            continue
        between = segment[shared.end():token.span_start]
        if (
            _match_distance(shared, token) <= 55
            and re.fullmatch(
                r"\s*(?:신청\s*)?(?:기간|일정|일시|기한|마감)?\s*[:：]?\s*",
                between,
            )
        ):
            return ["leave_of_absence_application", "return_from_leave_application"]

    leave_matches = [
        match for match in LEAVE_ACTION_RE.finditer(segment, window_start, window_end)
        if _valid_leave_return_match(segment, match, title)
    ]
    return_matches = [
        match for match in RETURN_ACTION_RE.finditer(segment, window_start, window_end)
        if _valid_leave_return_match(segment, match, title)
    ]
    leave_nearest = min(leave_matches, key=lambda item: _match_distance(item, token), default=None)
    return_nearest = min(return_matches, key=lambda item: _match_distance(item, token), default=None)
    if leave_nearest is not None or return_nearest is not None:
        leave_distance = _match_distance(leave_nearest, token) if leave_nearest else 10**9
        return_distance = _match_distance(return_nearest, token) if return_nearest else 10**9
        if min(leave_distance, return_distance) <= 75:
            return [
                "leave_of_absence_application"
                if leave_distance <= return_distance
                else "return_from_leave_application"
            ]

    local = segment[window_start:window_end]

    if COURSE_EVALUATION_RE.search(local):
        return ["course_evaluation"]

    # Course-registration actions require an explicit temporal phrase.
    # Cohort-only lines are handled separately.  A strong nearby phrase may
    # correct a generic ``application_period`` classification, but a title
    # alone may not relabel unrelated dates.
    course_patterns: tuple[tuple[str, re.Pattern[str]], ...] = (
        ("preliminary_course_registration", PRELIMINARY_COURSE_REGISTRATION_RE),
        ("course_registration_cancellation", COURSE_REGISTRATION_CANCEL_RE),
        ("course_registration_change", COURSE_REGISTRATION_CHANGE_RE),
        ("course_registration", COURSE_REGISTRATION_BASE_RE),
    )
    course_matches: list[tuple[int, int, str]] = []
    for priority, (action_type, pattern) in enumerate(course_patterns):
        for match in pattern.finditer(segment, window_start, window_end):
            if not _course_match_is_temporal(segment, match, token):
                continue
            course_matches.append((_match_distance(match, token), priority, action_type))
    if course_matches:
        course_matches.sort()
        return [course_matches[0][2]]

    # Some notices shorten the body label to ``취소기간`` while the title
    # supplies the full action family.
    if event_type == "academic_period":
        title_action = _course_action_type_from_text(title)
        before = segment[max(0, token.span_start - 52):token.span_start]
        if (
            title_action == "course_registration_cancellation"
            and re.search(r"취소\s*(?:기간|일시|기한)\s*[:：]?\s*$", before)
        ):
            return [title_action]
        if (
            title_action == "course_registration_change"
            and re.search(r"변경\s*(?:기간|일시|기한)\s*[:：]?\s*$", before)
        ):
            return [title_action]

    # Application-type academic actions require an explicit local application
    # label.  A title mentioning 재입학 must not relabel permission, tuition,
    # or later course-registration dates.
    if "재입학" in title or "재입학" in local:
        # Keep the action phrase syntactically tight.  A broad pattern such
        # as ``재입학 ... 신청`` incorrectly captures ``재입학 허가자 등록
        # 및 수강신청`` and relabels the tuition period as readmission.
        if re.search(
            r"재입학(?!생|자)\s*(?:희망자\s*)?(?:(?:지원서|원서)\s*)?(?:신청|접수)"
            r"|(?:(?:지원서|원서)\s*접수).{0,12}재입학(?!생|자)",
            local,
        ):
            return ["readmission_application"]
        if (
            event_type == "application_period"
            and "재입학" in title
            and re.search(r"(?:지원서\s*)?접수\s*(?:및\s*서류심사)?\s*[:：]?\s*$", segment[max(0, token.span_start - 55):token.span_start])
        ):
            return ["readmission_application"]

    if re.search(r"전과.{0,24}(?:신청|접수)|(?:신청|접수).{0,18}전과", local):
        return ["major_transfer_application"]
    if re.search(r"학점\s*인정.{0,24}(?:신청|접수)|(?:신청|접수).{0,18}학점\s*인정", local):
        return ["credit_recognition_application"]
    return []


# S23 composition root for semantic classification.  Policy.15 lexical rules
# remain injected to preserve the immutable baseline; extraction now consumes
# only the classifier facade and explicit temporalRole output.
import noticepilot_semantic_classifier as _semantic_layer

SEMANTIC_CLASSIFIER = _semantic_layer.SemanticClassifier(
    classify_event_type=classify_event_type,
    refine_event_type=refine_event_type,
    infer_academic_action_types=infer_academic_action_types,
    event_type_from_segment_signals=_event_type_from_segment_signals,
    local_context_for_resolution=local_context_for_resolution,
    course_action_type_from_text=_course_action_type_from_text,
    is_non_action_reference_date=is_non_action_reference_date,
    is_internal_student_workflow=is_internal_student_workflow,
    non_action_process_pattern=NON_ACTION_PROCESS_PERIOD_RE,
    course_evaluation_pattern=COURSE_EVALUATION_RE,
    non_student_local_action_pattern=NON_STUDENT_LOCAL_ACTION_RE,
    conditional_selected_participant_pattern=CONDITIONAL_SELECTED_PARTICIPANT_RE,
    academic_action_types=ACADEMIC_ACTION_TYPES,
)


def _empty_audience_rules() -> dict[str, Any]:
    return APPLICABILITY_EVALUATOR.build_audience_rules("", "", None)


def build_audience_rules(
    segment: str,
    title: str,
    action_type: str | None,
    explicit_label: str | None = None,
) -> dict[str, Any]:
    """Compatibility wrapper delegated to the S24-B evaluator."""
    return APPLICABILITY_EVALUATOR.build_audience_rules(
        segment, title, action_type, explicit_label
    )


def candidate_matches_subscription_profile(
    candidate: dict[str, Any],
    profile: dict[str, Any],
) -> bool:
    """Compatibility wrapper delegated to the S24-B evaluator."""
    return APPLICABILITY_EVALUATOR.matches_subscription_profile(candidate, profile)


def _reconciler_demote_candidate(candidate: dict[str, Any], reason: str) -> None:
    PUBLISHABILITY_EVALUATOR.demote_candidate(candidate, reason, confidence="medium")
    RUNTIME_JUDGMENT_WIRING.wire_candidate(candidate)


# S25 composition root. Intra-notice comparison and conflict ownership is
# delegated to the standalone reconciler. The wrappers below preserve the
# Policy.15 public API for focused tests and downstream callers.
CANDIDATE_RECONCILER = _reconciliation_layer.CandidateReconciler(
    normalize_space=normalize_space,
    audience_rules_key=audience_rules_key,
    strong_event_type_patterns=STRONG_EVENT_TYPE_PATTERNS,
    event_type_priority=EVENT_TYPE_PRIORITY,
    academic_action_types=ACADEMIC_ACTION_TYPES,
    action_family=ACTION_FAMILY,
    demote_candidate=_reconciler_demote_candidate,
    synchronize_candidate=RUNTIME_JUDGMENT_WIRING.wire_candidate,
)


def candidate_semantic_scope_key(candidate: dict[str, Any]) -> tuple[Any, ...]:
    return CANDIDATE_RECONCILER.semantic_scope_key(candidate)


def candidate_context_score(candidate: dict[str, Any]) -> tuple[int, int, int]:
    return CANDIDATE_RECONCILER.context_score(candidate)


def consolidate_same_datetime_candidates(
    candidates: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int]:
    return CANDIDATE_RECONCILER.consolidate_same_datetime(candidates)


def consolidate_same_day_precision_candidates(
    candidates: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int]:
    return CANDIDATE_RECONCILER.consolidate_same_day_precision(candidates)


def candidate_action_family(candidate: dict[str, Any]) -> str:
    return CANDIDATE_RECONCILER.action_family_key(candidate)


def candidate_date_bounds(candidate: dict[str, Any]) -> tuple[datetime, datetime] | None:
    return CANDIDATE_RECONCILER.date_bounds(candidate)


def demote_candidate_for_review(candidate: dict[str, Any], reason: str) -> None:
    _reconciler_demote_candidate(candidate, reason)


def consolidate_same_action_range_candidates(
    candidates: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int, int]:
    return CANDIDATE_RECONCILER.consolidate_same_action_ranges(candidates)


def make_candidate_title(
    source_title: str,
    event_type: str,
    is_range: bool,
    action_type: str | None = None,
    audience_rules: dict[str, Any] | None = None,
) -> str:
    base = normalize_space(source_title)
    action_suffixes = {
        "leave_of_absence_application": "휴학 신청기간" if is_range else "휴학 신청일",
        "return_from_leave_application": "복학 신청기간" if is_range else "복학 신청일",
        "course_registration": "수강신청 기간" if is_range else "수강신청일",
        "preliminary_course_registration": "예비수강신청 기간" if is_range else "예비수강신청일",
        "course_registration_change": "수강신청 변경기간" if is_range else "수강신청 변경일",
        "course_registration_cancellation": "수강신청 취소기간" if is_range else "수강신청 취소일",
        "readmission_application": "재입학 신청기간" if is_range else "재입학 신청일",
        "major_transfer_application": "전과 신청기간" if is_range else "전과 신청일",
        "credit_recognition_application": "학점인정 신청기간" if is_range else "학점인정 신청일",
        "course_evaluation": "수업평가 기간" if is_range else "수업평가일",
    }
    suffixes = {
        "application_period": "신청기간" if is_range else "신청 마감",
        "job_application_period": "채용 접수기간" if is_range else "채용 접수 마감",
        "submission_period": "제출기간" if is_range else "제출 마감",
        "payment_period": "납부기간" if is_range else "납부 마감",
        "academic_period": "진행 기간" if is_range else "일정",
        "event": "행사 기간" if is_range else "행사 일정",
        "exam_or_interview": "시험·면접 일정",
        "result_announcement": "결과 발표 예정",
        "deadline": "마감",
    }
    suffix = action_suffixes.get(action_type or "") or suffixes.get(event_type, "일정")
    years = list((audience_rules or {}).get("studentYears") or [])
    qualifier = f" ({','.join(str(year) for year in years)}학년)" if years else ""
    if suffix in base and not qualifier:
        return base
    return f"{base}{qualifier} {suffix}".strip()


def candidate_id(
    notice_id: str,
    event_type: str,
    resolution: DateResolution,
    evidence: str,
    action_type: str | None = None,
    audience_rules: dict[str, Any] | None = None,
) -> str:
    rule_key = json.dumps(audience_rules or {}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = sha256_text(
        "|".join([
            notice_id, event_type, action_type or "", resolution.start,
            resolution.end or "", evidence, rule_key,
        ])
    )[:14]
    return f"cand-{notice_id}-{digest}"


def campus_scope(notice: dict[str, Any]) -> dict[str, Any]:
    scope = notice.get("campusScope")
    if isinstance(scope, dict) and scope.get("campuses"):
        resolved = dict(scope)
        resolved["campuses"] = list(scope.get("campuses") or [])
        resolved["labels"] = dict(scope.get("labels") or {})
    else:
        resolved = {
            "sourceLabel": None,
            "campuses": ["unknown"],
            "scopeType": "unknown",
            "confidence": "low",
            "source": "missing",
            "labels": {"unknown": "불명확"},
        }

    # Explicit KNU campus wording in the title is stronger than a conflicting
    # list-cell label.  This guard corrects cases such as a title naming
    # ``삼척생활관`` while list metadata says ``춘천``.  Generic city names
    # are intentionally not used because they may describe an external host.
    title = normalize_space(notice.get("title"))
    explicit: list[str] = []
    patterns = (
        ("chuncheon", r"(?:강원대학교\s*)?춘천캠퍼스|춘천생활관"),
        ("samcheok", r"(?:강원대학교\s*)?삼척캠퍼스|삼척생활관"),
        ("dogye", r"(?:강원대학교\s*)?도계캠퍼스|도계생활관"),
        ("gangneung_wonju", r"(?:강릉|원주)캠퍼스|강릉원주대학교"),
    )
    for campus, pattern in patterns:
        if re.search(pattern, title):
            explicit.append(campus)
    if explicit and set(explicit) != set(resolved.get("campuses") or []):
        label_map = {
            "chuncheon": "춘천",
            "samcheok": "삼척",
            "dogye": "도계",
            "gangneung_wonju": "강릉원주",
        }
        resolved = {
            "sourceLabel": "title_explicit",
            "campuses": explicit,
            "scopeType": "campus_specific" if len(explicit) == 1 else "multi_campus",
            "confidence": "high",
            "source": "title_explicit_override",
            "labels": {campus: label_map[campus] for campus in explicit},
        }
    return resolved


def make_candidate(
    notice: dict[str, Any],
    event_type: str,
    resolution: DateResolution,
    target_actor: str,
    feed_scope: str | None,
    status: str,
    reason_codes: list[str],
    confidence: str,
    action_type: str | None = None,
    audience_rules: dict[str, Any] | None = None,
    source_segment: ScheduleSegment | None = None,
    temporal_role: str | None = None,
    semantic_classification: Any | None = None,
    binding_result: Any | None = None,
    created_by: str | None = None,
) -> dict[str, Any]:
    notice_id = str(notice.get("noticeId"))
    is_range = bool(resolution.end and resolution.end != resolution.start)
    normalized_rules = audience_rules or build_audience_rules(
        resolution.evidence, str(notice.get("title") or ""), action_type
    )
    applicability = APPLICABILITY_EVALUATOR.evaluate_projection(
        target_actor=target_actor,
        audience_rules=normalized_rules,
        reason_codes=reason_codes,
    )
    applicability_projection = applicability.to_dict()
    normalized_rules = applicability_projection["audienceRules"]
    target_actor = applicability_projection["targetActor"]
    cid = candidate_id(
        notice_id, event_type, resolution, resolution.evidence, action_type, normalized_rules
    )
    temporal_role_value = temporal_role or SEMANTIC_CLASSIFIER.default_role_for_event_type(event_type).value
    deterministic = (
        bool(binding_result.temporal_mention.deterministic)
        if binding_result is not None else True
    )
    publication = PUBLISHABILITY_EVALUATOR.evaluate_candidate(
        target_actor=target_actor,
        event_type=event_type,
        board_id=str((notice.get("board") or {}).get("boardId") or ""),
        temporal_role=temporal_role_value,
        requested_status=status,
        requested_feed_scopes=([feed_scope] if feed_scope else []),
        reason_codes=reason_codes,
        confidence=confidence,
        deterministic=deterministic,
        chronology_valid=resolution_is_chronological(resolution),
    )
    candidate = {
        "id": cid,
        "uidHint": f"noticepilot-{cid}@noticepilot.local",
        "sourceNoticeId": notice_id,
        "sourceTitle": notice.get("title"),
        "sourceUrl": notice.get("sourceUrl"),
        "noticeType": (notice.get("board") or {}).get("category"),
        "campusScope": campus_scope(notice),
        "eventType": event_type,
        "actionType": action_type,
        "audienceRules": normalized_rules,
        "sourceSegment": source_segment.source_metadata() if source_segment else None,
        "temporalRole": temporal_role_value,
        "semanticClassification": (
            semantic_classification.to_dict()
            if semantic_classification is not None and hasattr(semantic_classification, "to_dict")
            else semantic_classification
        ),
        "temporalMention": (
            binding_result.temporal_mention.to_dict()
            if binding_result is not None else None
        ),
        "boundTemporalFact": (
            binding_result.bound_fact.to_dict()
            if binding_result is not None else None
        ),
        "targetActor": target_actor,
        "feedScopes": list(publication.feed_scopes),
        "title": make_candidate_title(
            str(notice.get("title") or ""), event_type, is_range, action_type, normalized_rules
        ),
        "dateText": resolution.date_text,
        "normalizedStart": resolution.start,
        "normalizedEnd": resolution.end,
        "endDateInclusive": bool(resolution.is_all_day and resolution.end),
        "isAllDay": resolution.is_all_day,
        "evidence": resolution.evidence,
        "confidence": publication.confidence,
        "uncertaintyReasons": list(publication.reason_codes) if publication.candidate_status == "needs_review" else [],
        "reasonCodes": list(publication.reason_codes),
        "dateResolution": {
            "kind": resolution.kind,
            "inferredYear": resolution.inferred_year,
            "calculationPolicy": resolution.calculation_policy,
        },
        "status": publication.candidate_status,
        "includeInCalendarFeed": publication.include_in_calendar_feed,
        "createdBy": created_by or ("structured_rule" if source_segment else "rule"),
        "reviewedByUser": False,
    }
    return RUNTIME_JUDGMENT_WIRING.wire_candidate(candidate)


def job_stage(title: str, config: dict[str, Any]) -> str:
    k = config["keywords"]
    if contains_any(title, k["jobNonApplicationStage"]):
        return "non_application_stage"
    if contains_any(title, k["jobApplicationTitle"]):
        return "application_stage"
    return "unknown_stage"


def list_application_resolution(notice: dict[str, Any]) -> DateResolution | None:
    meta = notice.get("listMetadata") or {}
    start = meta.get("application_period_start")
    end = meta.get("application_period_end")
    if not start and not end:
        return None
    start = start or end
    end = end or start
    if not parse_iso_date(str(start)) or not parse_iso_date(str(end)):
        return None
    resolution = DateResolution(
        start=str(start),
        end=str(end),
        is_all_day=True,
        date_text=f"접수기간 {start}~{end}",
        kind="list_application_period",
        evidence=f"채용안내 목록 접수기간: {start}~{end}",
    )
    return resolution if resolution_is_chronological(resolution) else None


def attachment_schedule_needed(index_row: dict[str, Any] | None, notice: dict[str, Any]) -> bool:
    if notice.get("attachmentRequiredForFullExtraction"):
        return True
    rule = (index_row or {}).get("ruleDecision") or {}
    decision = rule.get("attachmentFetchDecision")
    return decision in {"required_for_schedule", "required_for_revision"}


def is_completed_result_title(title: str, config: dict[str, Any]) -> bool:
    if FUTURE_RESULT_TITLE_RE.search(title):
        return False
    return (
        contains_any(title, config["keywords"]["completedResultTitle"])
        or contains_any(title, RESULT_COMPLETED_HINTS)
        or bool(COMPLETED_RESULT_TITLE_RE.search(title))
        or bool(COMPLETED_STATUS_TITLE_RE.search(title))
    )


def completed_result_followup_candidates(
    candidates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Keep only explicit post-result actions, always behind review.

    A result notice targets a selected subset of students.  Its activity
    period must not enter the broad student feed automatically.  Explicit
    follow-up actions such as a signed document submission or orientation are
    retained for human review.
    """
    kept: list[dict[str, Any]] = []
    for candidate in candidates:
        evidence = normalize_space(candidate.get("evidence"))
        if candidate.get("eventType") == "result_announcement":
            continue
        if not POST_RESULT_FOLLOWUP_RE.search(evidence):
            continue
        demote_candidate_for_review(candidate, "post_result_selected_participant_action")
        candidate["reasonCodes"] = sorted(
            set((candidate.get("reasonCodes") or []) + ["completed_result_announcement"])
        )
        kept.append(candidate)
    return kept


def relevant_action_hint(text: str, config: dict[str, Any]) -> bool:
    k = config["keywords"]
    groups = ("application", "submission", "registration", "payment", "event", "exam", "futureResult")
    return any(contains_any(text, k[group]) for group in groups)


def ambiguous_date_hint(text: str, config: dict[str, Any]) -> bool:
    if contains_any(text, config["keywords"]["ambiguousDate"]):
        return True
    return bool(re.search(r"\d{1,2}\s*월\s*(?:중|말|초)", text))


def temporal_intent_hint(text: str) -> bool:
    return any(
        token in text
        for token in (
            "기간", "마감", "기한", "일시", "일정", "예정", "발표일", "시험일",
            "부터", "까지", "이내", "일간", "오전", "오후", ":00"
        )
    )


def candidate_disposition_for_audience(audience: str, event_type: str, board_id: str) -> tuple[str, str | None, list[str], str]:
    """Policy.15 compatibility wrapper around the publishability base rule."""
    projection = PUBLISHABILITY_EVALUATOR.base_projection(
        target_actor=audience,
        event_type=event_type,
        board_id=board_id,
    )
    feed_scope = projection.feed_scopes[0] if projection.feed_scopes else None
    return (
        projection.pipeline_status,
        feed_scope,
        list(projection.reason_codes),
        projection.confidence,
    )


def extract_course_registration_cohort_candidates(
    notice: dict[str, Any],
    audience: dict[str, Any],
    config: dict[str, Any],
    published: date,
    schedule_segments: list[ScheduleSegment] | None = None,
) -> tuple[list[dict[str, Any]], list[str], bool]:
    """Split explicit course-registration cohort schedules into candidates.

    The cohort label and date must coexist in one structured segment.  The
    title may identify the course-registration family, but it may not supply a
    missing cohort/date relation.
    """
    title = normalize_space(notice.get("title"))
    body_raw = str(notice.get("extractedText") or "")
    title_course_action = _course_action_type_from_text(title)
    joined = normalize_space(f"{title} {body_raw}")
    if not COURSE_REGISTRATION_CONTEXT_RE.search(joined):
        return [], [], False

    segments = schedule_segments or build_schedule_segments(title, body_raw, published)
    candidates: list[dict[str, Any]] = []
    reasons: list[str] = []
    handled = False
    seen: set[tuple[Any, ...]] = set()

    for source_segment in segments:
        if source_segment.segment_type == "title":
            continue
        line = source_segment.text
        local_course_actions = [
            signal for signal in source_segment.action_signals
            if signal in COURSE_ACTION_TYPES
        ]
        # A cohort token such as 편입생 is not itself a course-registration
        # schedule.  The course family must be owned by the title or the same
        # structured segment; a distant mention elsewhere in the notice may
        # not relabel an orientation/event date.
        if title_course_action is None and not local_course_actions:
            continue
        labels = list(COURSE_COHORT_LABEL_RE.finditer(line))
        if not labels or not source_segment.date_spans:
            continue

        for label_index, label_match in enumerate(labels):
            label = normalize_space(label_match.group(0))
            end_pos = labels[label_index + 1].start() if label_index + 1 < len(labels) else len(line)
            schedule_text = normalize_space(line[label_match.end():end_pos])
            if not schedule_text:
                continue
            schedule_tokens = parse_date_tokens(schedule_text, published)
            if not schedule_tokens:
                continue
            if schedule_tokens[0].span_start > 70:
                continue
            if has_multiple_discrete_dates(schedule_text, published):
                reasons.append("course_registration_cohort_schedule_requires_review")
                handled = True
                continue
            resolution = resolve_date(schedule_text, published)
            if resolution is None or has_truncated_date_context(schedule_text):
                reasons.append("course_registration_cohort_schedule_requires_review")
                handled = True
                continue

            action_type = (
                local_course_actions[0]
                if local_course_actions
                else title_course_action
            ) or "course_registration"
            rules = build_audience_rules(line, title, action_type, explicit_label=label)
            if not rules["personalizationReady"]:
                continue

            evidence = normalize_space(f"{label} {schedule_text}")
            resolution = DateResolution(
                start=resolution.start,
                end=resolution.end,
                is_all_day=resolution.is_all_day,
                date_text=resolution.date_text,
                kind=resolution.kind,
                evidence=evidence,
                inferred_year=resolution.inferred_year,
                calculation_policy=resolution.calculation_policy,
            )
            disposition, feed_scope, base_reasons, confidence = candidate_disposition_for_audience(
                audience["primary"], "academic_period",
                str((notice.get("board") or {}).get("boardId") or ""),
            )
            if disposition == "not_calendar_relevant":
                continue
            candidate_reasons = list(base_reasons) + [
                "structured_segment_grounded",
                "audience_rules_extracted",
            ]
            if rules["studentYears"]:
                candidate_reasons.append("student_year_scope_explicit")
            if rules["degreeLevels"]:
                candidate_reasons.append("degree_level_scope_explicit")
            if rules["admissionTypes"]:
                candidate_reasons.append("admission_type_scope_explicit")
            key = (
                action_type, resolution.start, resolution.end, audience_rules_key(rules),
            )
            if key in seen:
                continue
            seen.add(key)
            binding_result = LOCAL_BINDER.bind_explicit_resolution(
                str(notice.get("noticeId") or "unknown"),
                source_segment,
                resolution,
                raw_text=evidence,
            )
            semantic_classification = SEMANTIC_CLASSIFIER.classify_explicit(
                event_type="academic_period",
                action_type=action_type,
                evidence=(label, evidence),
            )
            candidates.append(
                make_candidate(
                    notice=notice,
                    event_type="academic_period",
                    resolution=resolution,
                    target_actor=audience["primary"],
                    feed_scope=feed_scope,
                    status=disposition,
                    reason_codes=candidate_reasons,
                    confidence=confidence,
                    action_type=action_type,
                    audience_rules=rules,
                    source_segment=source_segment,
                    temporal_role=semantic_classification.temporal_role.value,
                    semantic_classification=semantic_classification,
                    binding_result=binding_result,
                )
            )
            handled = True

    return candidates, sorted(set(reasons)), handled


def extract_non_job_candidates(
    notice: dict[str, Any],
    audience: dict[str, Any],
    config: dict[str, Any],
    schedule_segments: list[ScheduleSegment] | None = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    published = parse_iso_date(notice.get("publishedAt"))
    if not published:
        return [], ["missing_published_at"]
    title = normalize_space(notice.get("title"))
    body = str(notice.get("extractedText") or "")
    board_id = str((notice.get("board") or {}).get("boardId") or "")
    segments = schedule_segments or build_schedule_segments(title, body, published)
    candidates, cohort_reasons, cohort_schedule_handled = extract_course_registration_cohort_candidates(
        notice, audience, config, published, segments
    )
    review_reasons: list[str] = list(cohort_reasons)
    seen: set[tuple[Any, ...]] = {
        (
            candidate.get("eventType"), candidate.get("actionType"),
            candidate.get("normalizedStart"), candidate.get("normalizedEnd"),
            audience_rules_key(candidate.get("audienceRules")),
        )
        for candidate in candidates
    }

    for source_segment in segments:
        segment = source_segment.text
        if source_segment.segment_type == "title" and TITLE_REFERENCE_DATE_RE.search(title):
            review_reasons.append("reference_date_not_user_action")
            continue
        if (
            source_segment.date_spans
            and PAYMENT_REFERENCE_TITLE_RE.search(title)
            and not re.search(r"(?:제출|신청|접수|해소|상환|등록|수정|입력|연락)", segment)
        ):
            review_reasons.append("reference_date_not_user_action")
            continue
        if (
            source_segment.date_spans
            and INTERNAL_SELECTION_POINT_RE.search(segment)
            and not re.search(r"면접|시험|코딩\s*테스트", segment)
        ):
            review_reasons.append("internal_process_period")
            continue
        if (
            cohort_schedule_handled
            and COURSE_REGISTRATION_CONTEXT_RE.search(normalize_space(f"{title} {segment}"))
            and COURSE_COHORT_LABEL_RE.search(segment)
            and source_segment.date_spans
        ):
            continue
        if NON_ACTION_PROCESS_PERIOD_RE.search(segment) and not COURSE_EVALUATION_RE.search(segment):
            review_reasons.append("internal_process_period")
            continue
        if has_multiple_discrete_dates(segment, published):
            if (
                cohort_schedule_handled
                and COURSE_REGISTRATION_CONTEXT_RE.search(normalize_space(f"{title} {segment}"))
                and COURSE_COHORT_LABEL_RE.search(segment)
            ):
                continue
            review_reasons.append("multiple_discrete_event_dates")
            continue
        if has_recurring_time_window_after_date_range(segment, published):
            review_reasons.append("recurring_time_window_requires_expansion")
            continue
        if OPEN_ENDED_APPLICATION_RE.search(segment) and len(parse_date_tokens(segment, published)) <= 1:
            review_reasons.append("open_ended_application_period")
            continue

        # S23 semantic layer owns label-first classification orchestration.
        # The title is not injected into unrelated body dates.
        event_type = SEMANTIC_CLASSIFIER.initial_event_type(source_segment, title, config)
        if not event_type:
            # Reference and partial-period guards run even when no user action
            # label is present.  They explain why a visible date is withheld.
            untyped_resolution = resolve_date(segment, published) if source_segment.date_spans else None
            if untyped_resolution and is_non_action_reference_date(segment, published, untyped_resolution):
                review_reasons.append("reference_date_not_user_action")
                continue
            if untyped_resolution and is_partial_activity_period(segment, published, untyped_resolution):
                review_reasons.append("partial_activity_period_requires_review")
                continue
            if (
                source_segment.date_spans
                and source_segment.segment_type != "title"
                and relevant_action_hint(title, config)
            ):
                already_grounded = bool(
                    untyped_resolution
                    and any(
                        candidate.get("normalizedStart") == untyped_resolution.start
                        and candidate.get("normalizedEnd") == untyped_resolution.end
                        for candidate in candidates
                    )
                )
                if not already_grounded:
                    review_reasons.append("action_label_not_locally_grounded")
            continue
        if event_type == "result_announcement" and is_completed_result_title(title, config):
            if not contains_any(segment, config["keywords"]["futureResult"]):
                continue
        if USER_SPECIFIC_RELATIVE_RE.search(segment):
            review_reasons.append("user_specific_relative_date")
            continue
        resolution = resolve_date(segment, published)
        if not resolution:
            if ambiguous_date_hint(segment, config):
                review_reasons.append("ambiguous_date")
            elif relevant_action_hint(segment, config) and temporal_intent_hint(segment):
                academic_actions_already_extracted = any(
                    candidate.get("actionType") in {
                        "leave_of_absence_application",
                        "return_from_leave_application",
                    }
                    for candidate in candidates
                )
                if not (
                    (cohort_schedule_handled and COURSE_REGISTRATION_CONTEXT_RE.search(normalize_space(f"{title} {segment}")))
                    or (source_segment.segment_type == "title" and re.search(r"수강\s*신청|휴학|복학", title))
                    or (academic_actions_already_extracted and "휴학" in segment and "복학" in segment)
                ):
                    review_reasons.append("unresolved_action_date")
            continue
        if has_truncated_date_context(segment):
            review_reasons.append("truncated_date_context")
            continue
        binding_result = LOCAL_BINDER.bind_resolution(
            str(notice.get("noticeId") or "unknown"), source_segment, published
        )
        if binding_result is None:
            review_reasons.append("unresolved_action_date")
            continue
        semantic_batch = SEMANTIC_CLASSIFIER.classify_resolution(
            bound_fact=binding_result.bound_fact,
            source_segment=source_segment,
            title=title,
            published=published,
            resolution=resolution,
            policy_config=config,
            board_id=board_id,
            fallback_event_type=event_type,
        )
        event_type = semantic_batch.event_type or event_type
        action_types = list(semantic_batch.action_types)
        action_label_grounded = semantic_batch.action_label_grounded
        local_context = semantic_batch.local_context
        if is_non_action_reference_date(segment, published, resolution):
            review_reasons.append("reference_date_not_user_action")
            continue
        if is_partial_activity_period(segment, published, resolution):
            review_reasons.append("partial_activity_period_requires_review")
            continue
        if NON_ACTION_PROCESS_PERIOD_RE.search(local_context) and not COURSE_EVALUATION_RE.search(local_context):
            review_reasons.append("internal_process_period")
            continue
        resolved_end = resolution_end_date(resolution)
        if resolved_end and resolved_end < published:
            review_reasons.append("date_before_publication")
            continue
        if event_type == "result_announcement":
            start_date = parse_iso_date(resolution.start)
            if start_date and start_date < published:
                continue
        base_disposition, base_feed_scope, base_reasons, base_confidence = candidate_disposition_for_audience(
            audience["primary"], event_type, board_id
        )
        if base_disposition == "not_calendar_relevant":
            continue

        for action_type in (action_types or [None]):
            disposition = base_disposition
            feed_scope = base_feed_scope
            reasons = list(base_reasons)
            confidence = base_confidence
            audience_rules = build_audience_rules(
                segment,
                title,
                action_type,
                explicit_label=source_segment.label_text or None,
            )
            if source_segment.locally_grounded or source_segment.label_text:
                reasons.append("structured_segment_grounded")
            if action_type:
                reasons.append("academic_action_type_extracted")
            if action_type and not action_label_grounded:
                disposition = "needs_review"
                feed_scope = None
                reasons.append("action_label_not_locally_grounded")
                review_reasons.append("action_label_not_locally_grounded")
                confidence = "medium"
            if audience_rules["personalizationReady"]:
                reasons.append("audience_rules_extracted")
            if audience_rules["studentYears"]:
                reasons.append("student_year_scope_explicit")
            if audience_rules["degreeLevels"]:
                reasons.append("degree_level_scope_explicit")
            if audience_rules["admissionTypes"]:
                reasons.append("admission_type_scope_explicit")
            if resolution.inferred_year:
                reasons.append("year_inferred_from_published_at")
                confidence = "medium" if confidence == "high" else confidence
            if resolution.calculation_policy:
                if resolution.calculation_policy.startswith("publishedAt") or "publishedAt" in resolution.calculation_policy:
                    reasons.append("relative_date_computed_from_published_at")
                elif resolution.calculation_policy == "end_of_day_24_normalized":
                    reasons.append("end_of_day_24_normalized")
                elif resolution.calculation_policy == "start_boundary_24_normalized":
                    reasons.append("start_boundary_24_normalized")
                elif resolution.calculation_policy == "start_of_day_assumed_for_timed_range":
                    reasons.append("start_of_day_assumed_for_timed_range")
                elif resolution.calculation_policy == "end_of_day_assumed_for_timed_range":
                    reasons.append("end_of_day_assumed_for_timed_range")
            if is_internal_student_workflow(segment, published, resolution, board_id):
                disposition = "needs_review"
                feed_scope = None
                reasons.append("internal_workflow_deadline")
                review_reasons.append("internal_workflow_deadline")
                confidence = "medium"
            if NON_STUDENT_LOCAL_ACTION_RE.search(local_context):
                disposition = "needs_review"
                feed_scope = None
                reasons.append("non_student_local_action")
                review_reasons.append("non_student_local_action")
                confidence = "medium"
            if (
                APPLICABILITY_EVALUATOR.is_conditional_participant_action(
                    local_context, title, event_type
                )
            ):
                disposition = "needs_review"
                feed_scope = None
                reasons.append("conditional_selected_participant_action")
                review_reasons.append("conditional_selected_participant_action")
                confidence = "medium"
            if "변동 가능" in segment or "추후 변경" in segment:
                disposition = "needs_review"
                feed_scope = None
                reasons.append("date_may_change")
                confidence = "medium"
            key = (
                event_type, action_type, resolution.start, resolution.end,
                audience_rules_key(audience_rules),
            )
            if key in seen:
                continue
            seen.add(key)
            candidates.append(
                make_candidate(
                    notice=notice,
                    event_type=event_type,
                    resolution=resolution,
                    target_actor=audience["primary"],
                    feed_scope=feed_scope,
                    status=disposition,
                    reason_codes=reasons,
                    confidence=confidence,
                    action_type=action_type,
                    audience_rules=audience_rules,
                    source_segment=source_segment,
                    temporal_role=semantic_batch.temporal_role.value,
                    semantic_classification=(
                        next(
                            (row for row in semantic_batch.classifications if row.action_type == action_type),
                            semantic_batch.classifications[0],
                        )
                    ),
                    binding_result=binding_result,
                )
            )
    candidates, reconciliation_report = CANDIDATE_RECONCILER.reconcile(candidates)
    if reconciliation_report.same_datetime_removed_count:
        review_reasons.append("same_datetime_candidates_consolidated")
    if reconciliation_report.same_day_precision_removed_count:
        review_reasons.append("same_day_precision_candidates_consolidated")
    if reconciliation_report.range_boundary_removed_count:
        review_reasons.append("same_action_boundary_candidates_consolidated")
    if reconciliation_report.conflict_count:
        review_reasons.append("conflicting_same_action_dates")
    return candidates, sorted(set(review_reasons))


def evaluate_notice(
    notice: dict[str, Any],
    index_row: dict[str, Any] | None,
    config: dict[str, Any],
) -> dict[str, Any]:
    notice_id = str(notice.get("noticeId") or "unknown")
    board_id = str((notice.get("board") or {}).get("boardId") or "")
    title = normalize_space(notice.get("title"))
    body_raw = str(notice.get("extractedText") or "")
    body = normalize_space(body_raw)
    joined = f"{title}\n{body}"
    published = parse_iso_date(notice.get("publishedAt"))
    schedule_segments = build_schedule_segments(title, body_raw, published) if published else []
    audience = infer_audience(notice, config)
    reason_codes: list[str] = []
    candidates: list[dict[str, Any]] = []
    stage: str | None = None

    if board_id == "716":
        stage = job_stage(title, config)
        if stage == "non_application_stage":
            disposition = "not_calendar_relevant"
            reason_codes.append("board716_non_application_stage")
        elif stage == "application_stage":
            resolution = list_application_resolution(notice)
            if resolution:
                metadata_trace = BOARD716_TRACE_ADAPTER.adapt(
                    source_notice_id=notice_id,
                    resolution=resolution,
                )
                schedule_segments.append(metadata_trace.source_segment)
                candidates.append(
                    make_candidate(
                        notice=notice,
                        event_type="job_application_period",
                        resolution=resolution,
                        target_actor="job_applicant",
                        feed_scope="job_application",
                        status="publishable",
                        reason_codes=["board716_application_period_only", "exact_list_application_period"],
                        confidence="high",
                        source_segment=metadata_trace.source_segment,
                        temporal_role=metadata_trace.semantic_classification.temporal_role.value,
                        semantic_classification=metadata_trace.semantic_classification,
                        binding_result=metadata_trace.binding_result,
                        created_by="rule",
                    )
                )
                disposition = "publishable"
            else:
                disposition = "needs_review"
                reason_codes.extend(["board716_application_stage", "missing_application_period"])
        else:
            disposition = "needs_review"
            reason_codes.append("board716_unknown_stage")
    else:
        if APPLICABILITY_EVALUATOR.is_non_student_action_target(title):
            disposition = "not_calendar_relevant"
            reason_codes.append("non_student_action_target")
        elif audience["primary"] == "internal_staff":
            disposition = "not_calendar_relevant"
            reason_codes.append("non_student_audience")
        elif is_completed_result_title(title, config):
            extracted, extraction_reasons = extract_non_job_candidates(
                notice, audience, config, schedule_segments
            )
            candidates = completed_result_followup_candidates(extracted)
            reason_codes.extend(extraction_reasons)
            reason_codes.append("completed_result_announcement")
            if candidates:
                disposition = "needs_review"
            else:
                disposition = "not_calendar_relevant"
        else:
            candidates, extraction_reasons = extract_non_job_candidates(
                notice, audience, config, schedule_segments
            )
            reason_codes.extend(extraction_reasons)
            if any(c["includeInCalendarFeed"] for c in candidates):
                disposition = "publishable"
            elif candidates:
                disposition = "needs_review"
            elif reason_codes:
                disposition = "needs_review"
            elif attachment_schedule_needed(index_row, notice) and relevant_action_hint(joined, config):
                disposition = "needs_review"
                reason_codes.append("attachment_required_for_schedule")
            elif ambiguous_date_hint(joined, config) and relevant_action_hint(joined, config):
                disposition = "needs_review"
                reason_codes.append("ambiguous_date")
            elif audience["primary"] in {"unknown", "mixed"} and relevant_action_hint(joined, config):
                disposition = "needs_review"
                reason_codes.append("audience_requires_review")
            else:
                disposition = "not_calendar_relevant"
                reason_codes.append("no_publishable_calendar_action")

    if disposition == "needs_review" and attachment_schedule_needed(index_row, notice):
        reason_codes.append("attachment_may_contain_required_schedule")

    # Reconcile runtime judgment objects after all consolidation and review
    # mutations. This is deliberately the last candidate-layer operation.
    for candidate in candidates:
        RUNTIME_JUDGMENT_WIRING.wire_candidate(candidate)

    return {
        "schemaVersion": DECISION_SCHEMA_VERSION,
        "policyVersion": config["policyVersion"],
        "pipelineVersion": PIPELINE_VERSION,
        "sourceNoticeId": notice_id,
        "sourceContentHash": notice.get("contentHash"),
        "boardId": board_id,
        "boardName": (notice.get("board") or {}).get("name"),
        "title": notice.get("title"),
        "publishedAt": notice.get("publishedAt"),
        "sourceUrl": notice.get("sourceUrl"),
        "campusScope": campus_scope(notice),
        "audience": audience,
        "noticeStage": stage,
        "scheduleSegmentSummary": {
            "schemaVersion": SCHEDULE_SEGMENT_SCHEMA_VERSION,
            **build_schedule_segment_summary([
                segment.source_metadata() for segment in schedule_segments
            ]),
        },
        "semanticReviewPayloads": build_semantic_review_payloads(
            schedule_segments, title, config, reason_codes
        ),
        "disposition": disposition,
        "reasonCodes": sorted(set(reason_codes)),
        "candidates": candidates,
    }


def load_index(index_path: Path) -> dict[str, dict[str, Any]]:
    rows: dict[str, dict[str, Any]] = {}
    with index_path.open(encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            if not line.strip():
                continue
            row = json.loads(line)
            notice_id = row.get("noticeId")
            if not notice_id:
                raise ValueError(f"index row {line_no} missing noticeId")
            rows[str(notice_id)] = row
    return rows


def candidate_document(decision: dict[str, Any], candidates: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    selected = list(decision["candidates"] if candidates is None else candidates)
    return {
        "schemaVersion": CANDIDATE_SCHEMA_VERSION,
        "sourceNoticeId": decision["sourceNoticeId"],
        "sourceContentHash": decision.get("sourceContentHash"),
        "sourceTitle": decision.get("title"),
        "sourceUrl": decision.get("sourceUrl"),
        "timezone": TIMEZONE,
        "sourceCampusScope": decision.get("campusScope"),
        "extractor": {
            "version": PIPELINE_VERSION,
            "createdAt": now_utc_iso(),
            "mode": "structured_schedule_segment_v0.2",
            "policyVersion": decision["policyVersion"],
        },
        "candidates": selected,
        "summary": {
            "candidateCount": len(selected),
            "autoConfirmedCount": sum(1 for c in selected if c["status"] == "auto_confirmed"),
            "needsReviewCount": sum(1 for c in selected if c["status"] == "needs_review"),
            "calendarFeedIncludedCount": sum(1 for c in selected if c["includeInCalendarFeed"]),
        },
    }


def candidate_has_valid_chronology(candidate: dict[str, Any]) -> bool:
    start = candidate.get("normalizedStart")
    end = candidate.get("normalizedEnd")
    if not start or not end:
        return True
    try:
        if candidate.get("isAllDay"):
            return date.fromisoformat(str(end)[:10]) >= date.fromisoformat(str(start)[:10])
        start_dt = datetime.fromisoformat(str(start).replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(str(end).replace("Z", "+00:00"))
        return end_dt >= start_dt
    except ValueError:
        return False


def enforce_candidate_integrity(decisions: list[dict[str, Any]]) -> dict[str, Any]:
    """Demote malformed producer output before any feed document is written."""
    demoted: list[dict[str, Any]] = []
    for decision in decisions:
        decision_demoted = False
        for candidate in decision.get("candidates") or []:
            if candidate_has_valid_chronology(candidate):
                continue
            PUBLISHABILITY_EVALUATOR.demote_candidate(
                candidate, "invalid_date_order", confidence="low"
            )
            demoted.append(
                {
                    "candidateId": candidate.get("id"),
                    "sourceNoticeId": candidate.get("sourceNoticeId"),
                    "normalizedStart": candidate.get("normalizedStart"),
                    "normalizedEnd": candidate.get("normalizedEnd"),
                    "dateText": candidate.get("dateText"),
                }
            )
            decision_demoted = True
        if decision_demoted:
            decision["reasonCodes"] = sorted(set((decision.get("reasonCodes") or []) + ["invalid_date_order"]))
            if not any(c.get("includeInCalendarFeed") for c in decision.get("candidates") or []):
                decision["disposition"] = "needs_review"
    return {
        "invalidDateOrderDemotedCount": len(demoted),
        "invalidDateOrderDemoted": demoted,
    }


def decision_has_review_work(decision: dict[str, Any]) -> bool:
    return (
        decision.get("disposition") == "needs_review"
        or any(c.get("status") == "needs_review" for c in decision.get("candidates") or [])
    )


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def build_summary(decisions: list[dict[str, Any]], source: dict[str, Any]) -> dict[str, Any]:
    disposition_counts = Counter(d["disposition"] for d in decisions)
    board_dispositions: dict[str, Counter[str]] = defaultdict(Counter)
    reason_counts: Counter[str] = Counter()
    event_counts: Counter[str] = Counter()
    action_counts: Counter[str] = Counter()
    feed_counts: Counter[str] = Counter()
    candidate_status_counts: Counter[str] = Counter()
    range_count = 0
    relative_count = 0
    personalization_ready_count = 0
    student_year_scoped_count = 0
    structured_segment_candidate_count = 0
    locally_grounded_candidate_count = 0
    source_segment_type_counts: Counter[str] = Counter()
    for decision in decisions:
        board_dispositions[decision["boardId"]][decision["disposition"]] += 1
        reason_counts.update(decision["reasonCodes"])
        for candidate in decision["candidates"]:
            event_counts[candidate["eventType"]] += 1
            action_type = candidate.get("actionType")
            if action_type:
                action_counts[str(action_type)] += 1
            rules = candidate.get("audienceRules") or {}
            source_segment = candidate.get("sourceSegment") or {}
            if source_segment:
                structured_segment_candidate_count += 1
                source_segment_type_counts[str(source_segment.get("segmentType") or "unknown")] += 1
                if source_segment.get("locallyGrounded"):
                    locally_grounded_candidate_count += 1
            if rules.get("personalizationReady"):
                personalization_ready_count += 1
            if rules.get("studentYears"):
                student_year_scoped_count += 1
            candidate_status_counts[candidate["status"]] += 1
            feed_counts.update(candidate.get("feedScopes") or [])
            if candidate.get("normalizedEnd") and candidate.get("normalizedEnd") != candidate.get("normalizedStart"):
                range_count += 1
            calculation_policy = (candidate.get("dateResolution") or {}).get("calculationPolicy")
            if calculation_policy and "publishedAt" in calculation_policy:
                relative_count += 1
    return {
        "schemaVersion": SUMMARY_SCHEMA_VERSION,
        "pipelineVersion": PIPELINE_VERSION,
        "policyVersion": decisions[0]["policyVersion"] if decisions else None,
        "generatedAt": now_utc_iso(),
        "source": source,
        "noticeCount": len(decisions),
        "dispositionCounts": dict(sorted(disposition_counts.items())),
        "candidateCount": sum(len(d["candidates"]) for d in decisions),
        "candidateStatusCounts": dict(sorted(candidate_status_counts.items())),
        "feedCandidateCounts": dict(sorted(feed_counts.items())),
        "eventTypeCounts": dict(sorted(event_counts.items())),
        "actionTypeCounts": dict(sorted(action_counts.items())),
        "personalizationReadyCandidateCount": personalization_ready_count,
        "studentYearScopedCandidateCount": student_year_scoped_count,
        "structuredSegmentCandidateCount": structured_segment_candidate_count,
        "locallyGroundedCandidateCount": locally_grounded_candidate_count,
        "sourceSegmentTypeCounts": dict(sorted(source_segment_type_counts.items())),
        "rangeCandidateCount": range_count,
        "relativeDateCandidateCount": relative_count,
        "boardDispositionCounts": {
            board: dict(sorted(counts.items())) for board, counts in sorted(board_dispositions.items())
        },
        "reasonCodeCounts": dict(reason_counts.most_common()),
    }


def write_summary_tsv(path: Path, summary: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = ["boardId", "publishable", "needs_review", "not_calendar_relevant", "total"]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, delimiter="\t", fieldnames=fields)
        writer.writeheader()
        for board_id, counts in summary["boardDispositionCounts"].items():
            row = {
                "boardId": board_id,
                "publishable": counts.get("publishable", 0),
                "needs_review": counts.get("needs_review", 0),
                "not_calendar_relevant": counts.get("not_calendar_relevant", 0),
            }
            row["total"] = sum(row[key] for key in ("publishable", "needs_review", "not_calendar_relevant"))
            writer.writerow(row)


def run_pipeline(args: argparse.Namespace) -> int:
    dataset_dir = Path(args.dataset_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    config = load_json(Path(args.policy_config))
    index_path = dataset_dir / "index" / "notices.jsonl"
    normalized_dir = dataset_dir / "normalized" / "notices"
    if not index_path.exists():
        print(f"ERROR: missing index: {index_path}", file=sys.stderr)
        return 2
    if not normalized_dir.exists():
        print(f"ERROR: missing normalized notices: {normalized_dir}", file=sys.stderr)
        return 2

    index_rows = load_index(index_path)
    boards = {x.strip() for x in args.boards.split(",") if x.strip()}
    decisions: list[dict[str, Any]] = []
    segment_documents: list[dict[str, Any]] = []
    missing_normalized: list[str] = []
    for position, (notice_id, index_row) in enumerate(index_rows.items()):
        if boards and str(index_row.get("boardId")) not in boards:
            continue
        if args.limit is not None and len(decisions) >= args.limit:
            break
        normalized_path = normalized_dir / f"{notice_id}.json"
        if not normalized_path.exists():
            missing_normalized.append(notice_id)
            continue
        notice = load_json(normalized_path)
        decision = evaluate_notice(notice, index_row, config)
        segment_document = schedule_segment_document(notice)
        segment_documents.append(
            merge_candidate_source_segments_into_document(segment_document, decision)
        )
        decisions.append(decision)

    integrity_report = enforce_candidate_integrity(decisions)

    output_dir.mkdir(parents=True, exist_ok=True)
    decisions_dir = output_dir / "decisions"
    reports_dir = output_dir / "reports"
    candidate_root = output_dir / "candidates"
    segments_dir = output_dir / "segments"
    for path in (decisions_dir, reports_dir, candidate_root, segments_dir):
        path.mkdir(parents=True, exist_ok=True)

    write_jsonl(decisions_dir / "notices.jsonl", decisions)
    write_jsonl(
        decisions_dir / "review-queue.jsonl",
        (
            d for d in decisions
            if decision_has_review_work(d)
        ),
    )
    write_jsonl(decisions_dir / "not-calendar-relevant.jsonl", (d for d in decisions if d["disposition"] == "not_calendar_relevant"))
    write_jsonl(
        decisions_dir / "publishable-candidates.jsonl",
        (c for d in decisions for c in d["candidates"] if c["includeInCalendarFeed"]),
    )

    for decision in decisions:
        all_doc = candidate_document(decision)
        all_dir = candidate_root / "all"
        all_dir.mkdir(parents=True, exist_ok=True)
        (all_dir / f"{decision['sourceNoticeId']}.candidates.json").write_text(
            json.dumps(all_doc, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        for feed_scope in config["feeds"]:
            scoped = [
                candidate for candidate in decision["candidates"]
                if feed_scope in (candidate.get("feedScopes") or []) and candidate.get("includeInCalendarFeed")
            ]
            if not scoped:
                continue
            feed_dir = candidate_root / feed_scope
            feed_dir.mkdir(parents=True, exist_ok=True)
            (feed_dir / f"{decision['sourceNoticeId']}.candidates.json").write_text(
                json.dumps(candidate_document(decision, scoped), ensure_ascii=False, indent=2), encoding="utf-8"
            )

    for document in segment_documents:
        notice_id = str(document.get("sourceNoticeId") or "unknown")
        (segments_dir / f"{notice_id}.segments.json").write_text(
            json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    source = {
        "datasetDir": str(dataset_dir),
        "indexPath": str(index_path),
        "indexNoticeCount": len(index_rows),
        "processedNoticeCount": len(decisions),
        "missingNormalizedCount": len(missing_normalized),
        "missingNormalizedNoticeIds": missing_normalized[:100],
        "boardsFilter": sorted(boards),
        "limit": args.limit,
    }
    summary = build_summary(decisions, source)
    (reports_dir / "policy-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    write_summary_tsv(reports_dir / "board-disposition-summary.tsv", summary)
    (reports_dir / "candidate-integrity.json").write_text(
        json.dumps(integrity_report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (reports_dir / "run-manifest.json").write_text(
        json.dumps(
            {
                "pipelineVersion": PIPELINE_VERSION,
                "policyConfig": str(Path(args.policy_config).resolve()),
                "datasetDir": str(dataset_dir),
                "outputDir": str(output_dir),
                "generatedAt": now_utc_iso(),
                "outputs": {
                    "decisions": "decisions/notices.jsonl",
                    "reviewQueue": "decisions/review-queue.jsonl",
                    "publishableCandidates": "decisions/publishable-candidates.jsonl",
                    "allCandidateDir": "candidates/all",
                    "structuredSegmentDir": "segments",
                    "studentCandidateDir": "candidates/student_default",
                    "jobCandidateDir": "candidates/job_application",
                    "summary": "reports/policy-summary.json",
                    "boardSummary": "reports/board-disposition-summary.tsv",
                    "candidateIntegrity": "reports/candidate-integrity.json"
                },
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if missing_normalized and args.strict:
        print(f"ERROR: {len(missing_normalized)} normalized notices missing", file=sys.stderr)
        return 3
    print(f"\nSaved: {reports_dir / 'policy-summary.json'}")
    return 0


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="NoticePilot observation dataset -> MVP policy decisions and candidates")
    parser.add_argument("--dataset-dir", required=True, help="observation dataset directory containing index/ and normalized/")
    parser.add_argument("--output-dir", default="derived/mvp-policy-v0.1", help="derived output directory")
    parser.add_argument("--policy-config", default="configs/noticepilot_mvp_policy.v0.1.json", help="MVP policy JSON")
    parser.add_argument("--boards", default="", help="optional comma-separated board IDs")
    parser.add_argument("--limit", type=int, default=None, help="optional notice limit for smoke tests")
    parser.add_argument("--strict", action="store_true", help="fail when any normalized notice is missing")
    return parser


def main() -> int:
    return run_pipeline(build_arg_parser().parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
