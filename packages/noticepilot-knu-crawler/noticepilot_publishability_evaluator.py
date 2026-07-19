#!/usr/bin/env python3
"""NoticePilot standalone PublishabilityEvaluator (S24-C).

The evaluator owns candidate publication verdicts and their rule trace while
preserving the Policy.15 compatibility projection. S24-D serializes ``publishabilityJudgment`` on every runtime candidate.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Mapping, Sequence

from noticepilot_judgment_models import (
    JudgmentVerdict,
    PublishabilityJudgment,
    TemporalRole,
)

PUBLISHABILITY_EVALUATOR_VERSION = "0.1.0"

_STATUS_TO_VERDICT = {
    "publishable": JudgmentVerdict.AUTO_CONFIRMED,
    "auto_confirmed": JudgmentVerdict.AUTO_CONFIRMED,
    "needs_review": JudgmentVerdict.NEEDS_REVIEW,
    "not_calendar_relevant": JudgmentVerdict.NOT_CALENDAR_RELEVANT,
}

_VERDICT_TO_PIPELINE_STATUS = {
    JudgmentVerdict.AUTO_CONFIRMED: "publishable",
    JudgmentVerdict.NEEDS_REVIEW: "needs_review",
    JudgmentVerdict.NOT_CALENDAR_RELEVANT: "not_calendar_relevant",
}

_ROLE_GUARDS: dict[TemporalRole, tuple[str, str]] = {
    TemporalRole.REFERENCE_DATE: (
        "reference_date_not_user_action",
        "publishability.temporal_role.reference_date.review",
    ),
    TemporalRole.INTERNAL_PROCESS: (
        "internal_process_period",
        "publishability.temporal_role.internal_process.review",
    ),
    TemporalRole.CONDITIONAL_FOLLOWUP: (
        "conditional_selected_participant_action",
        "publishability.temporal_role.conditional_followup.review",
    ),
    TemporalRole.UNKNOWN: (
        "unknown_temporal_role",
        "publishability.temporal_role.unknown.review",
    ),
}

# These reason codes directly affect whether a candidate may be automatically
# published. Structural, semantic, and applicability evidence remains in the
# compatibility reasonCodes array but does not acquire a publishability rule.
_PUBLISHABILITY_REASON_CODES = frozenset({
    "action_label_not_locally_grounded",
    "ambiguous_date",
    "attachment_may_contain_required_schedule",
    "attachment_required_for_schedule",
    "audience_requires_review",
    "board716_application_period_only",
    "board716_application_stage",
    "board716_non_application_stage",
    "board716_unknown_stage",
    "completed_result_announcement",
    "conditional_selected_participant_action",
    "conflicting_same_action_dates",
    "date_before_publication",
    "date_may_change",
    "exact_list_application_period",
    "internal_process_period",
    "internal_workflow_deadline",
    "invalid_date_order",
    "missing_application_period",
    "mixed_audience",
    "multiple_discrete_event_dates",
    "no_publishable_calendar_action",
    "non_deterministic_temporal_fact",
    "non_student_action_target",
    "non_student_audience",
    "non_student_local_action",
    "open_ended_application_period",
    "partial_activity_period_requires_review",
    "post_result_selected_participant_action",
    "range_boundary_time_requires_review",
    "recurring_time_window_requires_expansion",
    "reference_date_not_user_action",
    "truncated_date_context",
    "unknown_audience",
    "unknown_temporal_role",
    "unresolved_action_date",
    "user_specific_relative_date",
})


def _normalize_status(value: str | JudgmentVerdict) -> JudgmentVerdict:
    if isinstance(value, JudgmentVerdict):
        if value not in {
            JudgmentVerdict.AUTO_CONFIRMED,
            JudgmentVerdict.NEEDS_REVIEW,
            JudgmentVerdict.NOT_CALENDAR_RELEVANT,
        }:
            raise ValueError(f"unsupported publishability verdict: {value.value}")
        return value
    try:
        return _STATUS_TO_VERDICT[str(value)]
    except KeyError as exc:
        raise ValueError(f"unsupported publishability status: {value}") from exc


def _normalize_role(value: str | TemporalRole | None) -> TemporalRole:
    if isinstance(value, TemporalRole):
        return value
    try:
        return TemporalRole(str(value or TemporalRole.UNKNOWN.value))
    except ValueError:
        return TemporalRole.UNKNOWN


def _sorted_strings(values: Sequence[str] | None) -> tuple[str, ...]:
    return tuple(sorted({str(value) for value in (values or ()) if str(value)}))


def _candidate_has_valid_chronology(candidate: Mapping[str, Any]) -> bool:
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


@dataclass(frozen=True, slots=True)
class PublishabilityProjection:
    """Compatibility projection plus immutable publishability judgment."""

    judgment: PublishabilityJudgment
    feed_scopes: tuple[str, ...]
    confidence: str

    @property
    def pipeline_status(self) -> str:
        return _VERDICT_TO_PIPELINE_STATUS[self.judgment.verdict]

    @property
    def candidate_status(self) -> str:
        return self.judgment.verdict.value

    @property
    def include_in_calendar_feed(self) -> bool:
        return self.judgment.include_in_calendar_feed

    @property
    def reason_codes(self) -> tuple[str, ...]:
        return self.judgment.reason_codes

    @property
    def rule_ids(self) -> tuple[str, ...]:
        return self.judgment.rule_ids


class PublishabilityEvaluator:
    """Policy.15-compatible candidate publication engine.

    S24-C routes candidate publication decisions through this evaluator while
    retaining the existing candidate fields and serializing the judgment object.
    """

    version = PUBLISHABILITY_EVALUATOR_VERSION

    def base_projection(
        self,
        *,
        target_actor: str,
        event_type: str,
        board_id: str,
    ) -> PublishabilityProjection:
        actor = str(target_actor or "unknown")
        if event_type == "job_application_period" and (board_id == "716" or actor == "job_applicant"):
            return self._projection(
                verdict=JudgmentVerdict.AUTO_CONFIRMED,
                feed_scopes=("job_application",),
                reason_codes=("board716_application_period_only",),
                rule_ids=("publishability.board716.exact_application_period.auto_confirm",),
                confidence="high",
            )
        if actor == "student":
            return self._projection(
                verdict=JudgmentVerdict.AUTO_CONFIRMED,
                feed_scopes=("student_default",),
                reason_codes=("student_audience",),
                rule_ids=("publishability.audience.student.auto_confirm",),
                confidence="high",
            )
        if actor == "mixed":
            return self._projection(
                verdict=JudgmentVerdict.NEEDS_REVIEW,
                feed_scopes=(),
                reason_codes=("mixed_audience",),
                rule_ids=("publishability.audience.mixed.review",),
                confidence="medium",
            )
        if actor == "unknown":
            return self._projection(
                verdict=JudgmentVerdict.NEEDS_REVIEW,
                feed_scopes=(),
                reason_codes=("unknown_audience",),
                rule_ids=("publishability.audience.unknown.review",),
                confidence="medium",
            )
        return self._projection(
            verdict=JudgmentVerdict.NOT_CALENDAR_RELEVANT,
            feed_scopes=(),
            reason_codes=("non_student_audience",),
            rule_ids=("publishability.audience.non_student.exclude",),
            confidence="high",
        )

    def evaluate_candidate(
        self,
        *,
        target_actor: str,
        event_type: str,
        board_id: str,
        temporal_role: str | TemporalRole | None,
        requested_status: str | JudgmentVerdict | None = None,
        requested_feed_scopes: Sequence[str] | None = None,
        reason_codes: Sequence[str] = (),
        confidence: str = "high",
        deterministic: bool = True,
        chronology_valid: bool = True,
    ) -> PublishabilityProjection:
        """Return the final candidate projection from explicit layered inputs."""
        base = self.base_projection(
            target_actor=target_actor,
            event_type=event_type,
            board_id=board_id,
        )
        verdict = _normalize_status(requested_status or base.judgment.verdict)
        reasons = set(str(code) for code in reason_codes if str(code))
        if not reasons:
            reasons.update(base.reason_codes)
        feeds = tuple(requested_feed_scopes or ())
        if requested_feed_scopes is None:
            feeds = base.feed_scopes
        rule_ids = set(base.rule_ids)
        role = _normalize_role(temporal_role)
        rule_ids.add(f"publishability.temporal_role.{role.value}")

        # Guards only introduce a new compatibility reason when they actively
        # demote an otherwise auto-confirmed candidate. Existing review outputs
        # remain byte-for-byte compatible.
        if not chronology_valid:
            rule_ids.add("publishability.chronology.invalid.review")
            if verdict is JudgmentVerdict.AUTO_CONFIRMED:
                verdict = JudgmentVerdict.NEEDS_REVIEW
                reasons.add("invalid_date_order")
                feeds = ()
                confidence = "low"
        if not deterministic:
            rule_ids.add("publishability.temporal.determinism.review")
            if verdict is JudgmentVerdict.AUTO_CONFIRMED:
                verdict = JudgmentVerdict.NEEDS_REVIEW
                reasons.add("non_deterministic_temporal_fact")
                feeds = ()
                confidence = "medium"
        if role in _ROLE_GUARDS:
            reason, rule_id = _ROLE_GUARDS[role]
            rule_ids.add(rule_id)
            if verdict is JudgmentVerdict.AUTO_CONFIRMED:
                verdict = JudgmentVerdict.NEEDS_REVIEW
                reasons.add(reason)
                feeds = ()
                confidence = "medium"

        if verdict is not JudgmentVerdict.AUTO_CONFIRMED:
            feeds = ()
        for reason in reasons:
            if reason in _PUBLISHABILITY_REASON_CODES:
                rule_ids.add(f"publishability.reason.{reason}")
        rule_ids.add(f"publishability.verdict.{verdict.value}")
        return self._projection(
            verdict=verdict,
            feed_scopes=feeds,
            reason_codes=tuple(reasons),
            rule_ids=tuple(rule_ids),
            confidence=confidence,
        )

    def evaluate_projection(self, candidate: Mapping[str, Any]) -> PublishabilityProjection:
        """Reconstruct a judgment from an existing Policy.15 candidate."""
        mention = candidate.get("temporalMention") or {}
        deterministic = bool(mention.get("deterministic", True))
        return self.evaluate_candidate(
            target_actor=str(candidate.get("targetActor") or "unknown"),
            event_type=str(candidate.get("eventType") or ""),
            board_id=str(candidate.get("boardId") or ""),
            temporal_role=candidate.get("temporalRole"),
            requested_status=str(candidate.get("status") or "needs_review"),
            requested_feed_scopes=tuple(candidate.get("feedScopes") or ()),
            reason_codes=tuple(candidate.get("reasonCodes") or ()),
            confidence=str(candidate.get("confidence") or "medium"),
            deterministic=deterministic,
            chronology_valid=_candidate_has_valid_chronology(candidate),
        )

    def demote_candidate(
        self,
        candidate: dict[str, Any],
        reason: str,
        *,
        confidence: str = "medium",
    ) -> PublishabilityProjection:
        """Apply a review demotion through the publishability compatibility layer."""
        projection = self.evaluate_candidate(
            target_actor=str(candidate.get("targetActor") or "unknown"),
            event_type=str(candidate.get("eventType") or ""),
            board_id=str(candidate.get("boardId") or ""),
            temporal_role=candidate.get("temporalRole"),
            requested_status="needs_review",
            requested_feed_scopes=(),
            reason_codes=tuple(candidate.get("reasonCodes") or ()) + (reason,),
            confidence=confidence,
            deterministic=bool((candidate.get("temporalMention") or {}).get("deterministic", True)),
            chronology_valid=_candidate_has_valid_chronology(candidate),
        )
        candidate["status"] = projection.candidate_status
        candidate["includeInCalendarFeed"] = projection.include_in_calendar_feed
        candidate["feedScopes"] = list(projection.feed_scopes)
        candidate["confidence"] = projection.confidence
        candidate["reasonCodes"] = list(projection.reason_codes)
        candidate["publishabilityJudgment"] = projection.judgment.to_dict()
        candidate["uncertaintyReasons"] = sorted(
            set((candidate.get("uncertaintyReasons") or []) + [reason])
        )
        return projection

    @staticmethod
    def publication_reason_codes(reason_codes: Sequence[str]) -> tuple[str, ...]:
        return tuple(sorted({str(code) for code in reason_codes if str(code) in _PUBLISHABILITY_REASON_CODES}))

    @staticmethod
    def _projection(
        *,
        verdict: JudgmentVerdict,
        feed_scopes: Sequence[str],
        reason_codes: Sequence[str],
        rule_ids: Sequence[str],
        confidence: str,
    ) -> PublishabilityProjection:
        feeds = _sorted_strings(feed_scopes)
        include = verdict is JudgmentVerdict.AUTO_CONFIRMED
        if not include:
            feeds = ()
        judgment = PublishabilityJudgment(
            verdict=verdict,
            include_in_calendar_feed=include,
            reason_codes=_sorted_strings(reason_codes),
            rule_ids=_sorted_strings(rule_ids),
        )
        return PublishabilityProjection(
            judgment=judgment,
            feed_scopes=feeds,
            confidence=str(confidence),
        )
