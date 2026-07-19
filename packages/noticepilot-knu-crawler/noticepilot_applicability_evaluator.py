#!/usr/bin/env python3
"""Applicability evaluation layer extracted in S24-B.

This module owns actor inference, explicit academic profile scope, conditional
participant scope, and future subscription-profile matching.  It deliberately
returns the existing Policy.15 ``targetActor`` and ``audienceRules`` projection
so callers can migrate without changing candidate IDs or publication behavior.
Publishability is consumed by the standalone downstream S24-C evaluator.
"""
from __future__ import annotations

import re
from typing import Any, Mapping, Sequence

from noticepilot_judgment_models import (
    ApplicabilityJudgment,
    ApplicabilityScope,
    Confidence,
)

APPLICABILITY_EVALUATOR_VERSION = "0.1.0"

SPACE_RE = re.compile(r"\s+")

COURSE_ACTION_TYPES = frozenset({
    "course_registration",
    "preliminary_course_registration",
    "course_registration_change",
    "course_registration_cancellation",
})
ACADEMIC_ACTION_TYPES = COURSE_ACTION_TYPES | frozenset({
    "leave_of_absence_application",
    "return_from_leave_application",
    "readmission_application",
    "major_transfer_application",
    "credit_recognition_application",
    "course_evaluation",
})

STUDENT_YEAR_RANGE_RE = re.compile(
    r"(?<!\d)(?P<start>[1-6])\s*(?:~|∼|～|[-–—])\s*(?P<end>[1-6])\s*학년(?!도)"
)
STUDENT_YEAR_GROUP_RE = re.compile(
    r"(?<!\d)(?P<group>(?:[1-6]\s*[,，·ㆍ/]\s*)+[1-6])\s*학년(?!도)"
)
STUDENT_YEAR_SINGLE_RE = re.compile(r"(?<!\d)(?P<year>[1-6])\s*학년(?!도)")
ALL_STUDENT_YEARS_RE = re.compile(r"(?:전|전체|모든)\s*학년(?!도)")

NON_STUDENT_ACTION_TITLE_RE = re.compile(
    r"일반\s*시민\s*대상|실습기관\s*(?:\([^)]*\))?\s*모집|참여기업\s*모집|"
    r"임시\s*주류판매자\s*모집|입점업체\s*모집|용역업체\s*모집"
)
CONDITIONAL_SELECTED_PARTICIPANT_RE = re.compile(
    r"(?:추천\s*대상자로\s*선정된|선정된|선발된|합격한)\s*(?:지원자|학생|대상자)"
    r"|(?:최종\s*)?(?:합격자|선발자|선정자|추천\s*대상자|추천\s*승인받은\s*학생)"
    r".{0,45}(?:오리엔테이션|OT|교육|등록|추가\s*제출|서약|참석|활동|발대식)"
    r"|(?:추가\s*확정자).{0,45}(?:취소|일시|참석|교육|등록|오리엔테이션|OT)"
    r"|(?:최초\s*등록생|충원\s*등록생)"
    r"|지급\s*보류자"
)

_APPLICABILITY_REASON_CODES = frozenset({
    "student_audience",
    "mixed_audience",
    "unknown_audience",
    "non_student_audience",
    "audience_rules_extracted",
    "student_year_scope_explicit",
    "degree_level_scope_explicit",
    "admission_type_scope_explicit",
    "conditional_selected_participant_action",
    "post_result_selected_participant_action",
    "non_student_local_action",
})


def normalize_space(value: Any) -> str:
    return SPACE_RE.sub(" ", str(value or "")).strip()


def _confidence(value: Any, fallback: Confidence = Confidence.NONE) -> Confidence:
    if isinstance(value, Confidence):
        return value
    try:
        return Confidence(str(value or fallback.value))
    except ValueError:
        return fallback


def _empty_audience_rules() -> dict[str, Any]:
    return {
        "degreeLevels": [],
        "studentYears": [],
        "enrollmentStatuses": [],
        "admissionTypes": [],
        "matchMode": "all_dimensions",
        "personalizationReady": False,
        "confidence": "none",
        "evidence": [],
    }


def infer_student_years(text: str) -> list[int]:
    """Extract explicit student-year applicability without reading dates as years."""
    years: set[int] = set()
    if ALL_STUDENT_YEARS_RE.search(text):
        years.update({1, 2, 3, 4})
    for match in STUDENT_YEAR_RANGE_RE.finditer(text):
        start = int(match.group("start"))
        end = int(match.group("end"))
        if start <= end:
            years.update(range(start, end + 1))
    for match in STUDENT_YEAR_GROUP_RE.finditer(text):
        years.update(int(value) for value in re.findall(r"[1-6]", match.group("group")))
    for match in STUDENT_YEAR_SINGLE_RE.finditer(text):
        years.add(int(match.group("year")))
    return sorted(years)


def _positive_audience_term(text: str, pattern: str) -> bool:
    for match in re.finditer(pattern, text):
        local = text[max(0, match.start() - 16): min(len(text), match.end() + 18)]
        if re.search(r"(?:제외|불가|아닌|미포함|해당\s*없음)", local):
            continue
        return True
    return False


def infer_degree_levels(text: str) -> list[str]:
    values: list[str] = []
    if _positive_audience_term(text, r"학부(?:생)?|학사과정"):
        values.append("undergraduate")
    if _positive_audience_term(text, r"대학원생|대학원\s*(?:과정|수강|신입)|석사|박사"):
        values.append("graduate")
    return values


def infer_admission_types(text: str) -> list[str]:
    values: list[str] = []
    if _positive_audience_term(text, r"신입생"):
        values.append("new_student")
    if _positive_audience_term(text, r"편입생"):
        values.append("transfer_student")
    if _positive_audience_term(text, r"재입학생|재입학자"):
        values.append("readmitted_student")
    return values


def infer_enrollment_statuses(text: str) -> list[str]:
    values: list[str] = []
    if _positive_audience_term(text, r"재학생"):
        values.append("enrolled")
    if _positive_audience_term(text, r"휴학생"):
        values.append("on_leave")
    if _positive_audience_term(text, r"복학생"):
        values.append("returning")
    return values


def audience_rules_key(rules: Mapping[str, Any] | None) -> tuple[Any, ...]:
    rules = rules or {}
    return (
        tuple(rules.get("degreeLevels") or []),
        tuple(rules.get("studentYears") or []),
        tuple(rules.get("enrollmentStatuses") or []),
        tuple(rules.get("admissionTypes") or []),
    )


class ApplicabilityEvaluator:
    """Policy.15-compatible applicability engine.

    The evaluator may be used in two modes:

    * extraction mode, where it derives notice actor and academic profile rules;
    * projection mode, where it classifies an existing compatibility projection
      into the immutable ``ApplicabilityJudgment`` contract.

    S24-D persists the resulting ``applicabilityJudgment`` on every runtime
    candidate while retaining the compatibility projection.
    """

    version = APPLICABILITY_EVALUATOR_VERSION

    def infer_notice_audience(
        self,
        notice: Mapping[str, Any],
        policy_config: Mapping[str, Any],
    ) -> dict[str, Any]:
        board = notice.get("board") or {}
        board_id = str(board.get("boardId") or notice.get("boardId") or "")
        title = normalize_space(notice.get("title"))
        body = normalize_space(notice.get("extractedText"))
        joined = f"{title}\n{body}"
        keywords = policy_config["keywords"]
        if board_id == "716":
            return {"primary": "job_applicant", "confidence": "high", "evidence": ["board:716"]}
        if board_id in {"720", "721"}:
            return {"primary": "student", "confidence": "high", "evidence": [f"board:{board_id}"]}
        student_hits = [word for word in keywords["studentAudience"] if word in joined]
        internal_hits = [word for word in keywords["internalAudience"] if word in joined]
        if student_hits and not internal_hits:
            return {"primary": "student", "confidence": "high", "evidence": student_hits[:5]}
        if internal_hits and not student_hits:
            return {"primary": "internal_staff", "confidence": "high", "evidence": internal_hits[:5]}
        if student_hits and internal_hits:
            return {
                "primary": "mixed",
                "confidence": "medium",
                "evidence": (student_hits + internal_hits)[:8],
            }
        return {"primary": "unknown", "confidence": "low", "evidence": []}

    def build_audience_rules(
        self,
        segment: str,
        title: str,
        action_type: str | None,
        explicit_label: str | None = None,
    ) -> dict[str, Any]:
        """Build stable academic profile dimensions only.

        Generic programs, scholarships, and notices remain unscoped.  This is
        the Policy.15 compatibility boundary that prevents nearby eligibility
        prose from over-restricting a calendar action.
        """
        if action_type not in ACADEMIC_ACTION_TYPES:
            return _empty_audience_rules()

        local = normalize_space(explicit_label or segment)
        combined = normalize_space(f"{title} {local}")
        years = infer_student_years(local) if action_type in COURSE_ACTION_TYPES else []
        if (
            action_type in COURSE_ACTION_TYPES
            and not years
            and re.search(r"(?:수강\s*신청|학년별)", title)
        ):
            years = infer_student_years(title)

        degree_levels = infer_degree_levels(combined)
        admission_types = (
            infer_admission_types(combined)
            if action_type in COURSE_ACTION_TYPES | {"credit_recognition_application"}
            else []
        )
        statuses: list[str] = []
        evidence: list[str] = []

        if years:
            evidence.append("student_year_explicit")
        if degree_levels:
            evidence.append("degree_level_explicit")
        if admission_types:
            evidence.append("admission_type_explicit")

        if action_type == "leave_of_absence_application":
            statuses = ["enrolled"]
            evidence.append("status_from_action_semantics")
        elif action_type == "return_from_leave_application":
            statuses = ["on_leave"]
            evidence.append("status_from_action_semantics")
        elif action_type in COURSE_ACTION_TYPES and _positive_audience_term(local, r"재학생"):
            statuses = ["enrolled"]
            evidence.append("enrollment_status_explicit")

        personalized = bool(years or degree_levels or statuses or admission_types)
        return {
            "degreeLevels": degree_levels,
            "studentYears": years,
            "enrollmentStatuses": statuses,
            "admissionTypes": admission_types,
            "matchMode": "all_dimensions",
            "personalizationReady": personalized,
            "confidence": "high" if explicit_label and personalized else ("medium" if personalized else "none"),
            "evidence": sorted(set(evidence)),
        }

    @staticmethod
    def is_non_student_action_target(title: str) -> bool:
        return bool(NON_STUDENT_ACTION_TITLE_RE.search(normalize_space(title)))

    @staticmethod
    def is_conditional_participant_action(
        local_context: str,
        title: str,
        event_type: str | None,
    ) -> bool:
        if event_type == "result_announcement":
            return False
        return bool(
            CONDITIONAL_SELECTED_PARTICIPANT_RE.search(normalize_space(local_context))
            or re.search(r"재입학\s*허가자", normalize_space(title))
        )

    def evaluate_projection(
        self,
        *,
        target_actor: str,
        audience_rules: Mapping[str, Any] | None,
        reason_codes: Sequence[str] = (),
        actor_confidence: str | Confidence | None = None,
    ) -> ApplicabilityJudgment:
        """Classify a Policy.15 projection without altering it."""
        actor = normalize_space(target_actor) or "unknown"
        rules = dict(audience_rules or _empty_audience_rules())
        reasons = tuple(sorted({str(code) for code in reason_codes if str(code) in _APPLICABILITY_REASON_CODES}))
        conditional = bool({"conditional_selected_participant_action", "post_result_selected_participant_action"} & set(reasons))
        personalized = bool(rules.get("personalizationReady") or any(audience_rules_key(rules)))

        if conditional:
            scope = ApplicabilityScope.CONDITIONAL
            confidence = Confidence.MEDIUM
            rule_id = "applicability.conditional.selected_participant"
        elif personalized:
            scope = ApplicabilityScope.PROFILE_SCOPED
            confidence = _confidence(rules.get("confidence"), Confidence.MEDIUM)
            if confidence is Confidence.NONE:
                confidence = Confidence.MEDIUM
            rule_id = "applicability.profile.explicit_dimensions"
        elif actor in {"unknown", "mixed"}:
            scope = ApplicabilityScope.UNKNOWN
            confidence = _confidence(actor_confidence, Confidence.LOW)
            rule_id = f"applicability.actor.{actor}"
        else:
            scope = ApplicabilityScope.UNRESTRICTED
            confidence = _confidence(actor_confidence, Confidence.HIGH)
            if confidence is Confidence.NONE:
                confidence = Confidence.HIGH
            rule_id = f"applicability.actor.{actor}"

        return ApplicabilityJudgment(
            target_actor=actor,
            scope=scope,
            audience_rules=rules,
            confidence=confidence,
            rule_id=rule_id,
            reason_codes=reasons,
        )

    def evaluate_candidate(
        self,
        *,
        target_actor: str,
        segment: str,
        title: str,
        action_type: str | None,
        explicit_label: str | None = None,
        local_context: str = "",
        event_type: str | None = None,
        reason_codes: Sequence[str] = (),
        actor_confidence: str | Confidence | None = None,
    ) -> ApplicabilityJudgment:
        rules = self.build_audience_rules(segment, title, action_type, explicit_label)
        reasons = list(reason_codes)
        if self.is_conditional_participant_action(local_context, title, event_type):
            reasons.append("conditional_selected_participant_action")
        return self.evaluate_projection(
            target_actor=target_actor,
            audience_rules=rules,
            reason_codes=reasons,
            actor_confidence=actor_confidence,
        )

    @staticmethod
    def matches_subscription_profile(
        candidate_or_judgment: Mapping[str, Any],
        profile: Mapping[str, Any],
    ) -> bool:
        """Match explicit dimensions; empty dimensions remain unrestricted."""
        rules = candidate_or_judgment.get("audienceRules") or {}
        checks = (
            ("degreeLevels", "degreeLevel"),
            ("studentYears", "studentYear"),
            ("enrollmentStatuses", "enrollmentStatus"),
            ("admissionTypes", "admissionType"),
        )
        for rule_key, profile_key in checks:
            allowed = list(rules.get(rule_key) or [])
            if not allowed:
                continue
            value = profile.get(profile_key)
            if value is None or value not in allowed:
                return False
        return True


__all__ = [
    "ACADEMIC_ACTION_TYPES",
    "APPLICABILITY_EVALUATOR_VERSION",
    "ApplicabilityEvaluator",
    "CONDITIONAL_SELECTED_PARTICIPANT_RE",
    "COURSE_ACTION_TYPES",
    "NON_STUDENT_ACTION_TITLE_RE",
    "audience_rules_key",
    "infer_admission_types",
    "infer_degree_levels",
    "infer_enrollment_statuses",
    "infer_student_years",
]
