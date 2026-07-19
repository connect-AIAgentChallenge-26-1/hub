#!/usr/bin/env python3
"""Semantic classification facade introduced in S23.

This layer owns the orchestration that converts a bound temporal fact into
``eventType``, ``actionType`` and ``temporalRole`` judgments.  Existing
Policy.15 lexical rules are injected by the composition root to preserve the
immutable baseline while removing direct classification calls from extraction.
Applicability and publishability remain downstream S24 responsibilities.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Iterable

from noticepilot_judgment_models import (
    Confidence,
    SemanticClassification,
    TemporalRole,
)

SEMANTIC_CLASSIFIER_VERSION = "0.1.0"


@dataclass(frozen=True, slots=True)
class SemanticClassificationBatch:
    event_type: str | None
    action_types: tuple[str, ...]
    temporal_role: TemporalRole
    confidence: Confidence
    rule_id: str
    local_context: str
    action_label_grounded: bool
    classifications: tuple[SemanticClassification, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "eventType": self.event_type,
            "actionTypes": list(self.action_types),
            "temporalRole": self.temporal_role.value,
            "confidence": self.confidence.value,
            "ruleId": self.rule_id,
            "localContext": self.local_context,
            "actionLabelGrounded": self.action_label_grounded,
            "classifications": [row.to_dict() for row in self.classifications],
        }


class SemanticClassifier:
    """Policy.15-compatible semantic classifier with explicit temporal roles."""

    version = SEMANTIC_CLASSIFIER_VERSION

    def __init__(
        self,
        *,
        classify_event_type: Callable[[str, dict[str, Any]], str | None] | None = None,
        refine_event_type: Callable[..., str] | None = None,
        infer_academic_action_types: Callable[..., list[str]] | None = None,
        event_type_from_segment_signals: Callable[[Any, str], str | None] | None = None,
        local_context_for_resolution: Callable[..., str] | None = None,
        course_action_type_from_text: Callable[[str], str | None] | None = None,
        is_non_action_reference_date: Callable[..., bool] | None = None,
        is_internal_student_workflow: Callable[..., bool] | None = None,
        non_action_process_pattern: Any | None = None,
        course_evaluation_pattern: Any | None = None,
        non_student_local_action_pattern: Any | None = None,
        conditional_selected_participant_pattern: Any | None = None,
        academic_action_types: Iterable[str] = (),
    ) -> None:
        self._classify_event_type = classify_event_type
        self._refine_event_type = refine_event_type
        self._infer_academic_action_types = infer_academic_action_types
        self._event_type_from_segment_signals = event_type_from_segment_signals
        self._local_context_for_resolution = local_context_for_resolution
        self._course_action_type_from_text = course_action_type_from_text
        self._is_non_action_reference_date = is_non_action_reference_date
        self._is_internal_student_workflow = is_internal_student_workflow
        self._non_action_process_pattern = non_action_process_pattern
        self._course_evaluation_pattern = course_evaluation_pattern
        self._non_student_local_action_pattern = non_student_local_action_pattern
        self._conditional_selected_participant_pattern = conditional_selected_participant_pattern
        self._academic_action_types = frozenset(str(value) for value in academic_action_types)

    def _require_configured(self) -> None:
        required = (
            self._classify_event_type,
            self._refine_event_type,
            self._infer_academic_action_types,
            self._event_type_from_segment_signals,
            self._local_context_for_resolution,
            self._course_action_type_from_text,
            self._is_non_action_reference_date,
            self._is_internal_student_workflow,
        )
        if any(value is None for value in required):
            raise RuntimeError("semantic classifier is not configured")

    def initial_event_type(
        self,
        source_segment: Any,
        title: str,
        policy_config: dict[str, Any],
    ) -> str | None:
        self._require_configured()
        label_text = str(getattr(source_segment, "label_text", "") or "")
        segment_text = str(getattr(source_segment, "text", "") or "")
        event_type = self._classify_event_type(label_text, policy_config) if label_text else None
        event_type = event_type or self._classify_event_type(segment_text, policy_config)
        return event_type or self._event_type_from_segment_signals(source_segment, title)

    @staticmethod
    def default_role_for_event_type(event_type: str | None) -> TemporalRole:
        if event_type == "result_announcement":
            return TemporalRole.RESULT_ANNOUNCEMENT
        if event_type in {"event", "exam_or_interview"}:
            return TemporalRole.EVENT_OCCURRENCE
        if event_type in {
            "academic_period",
            "application_period",
            "submission_period",
            "payment_period",
            "deadline",
            "job_application_period",
        }:
            return TemporalRole.USER_ACTION_PERIOD
        return TemporalRole.UNKNOWN

    def _temporal_role(
        self,
        *,
        segment_text: str,
        title: str,
        published: Any,
        resolution: Any,
        event_type: str | None,
        board_id: str,
        local_context: str,
    ) -> tuple[TemporalRole, str]:
        if self._is_non_action_reference_date(segment_text, published, resolution):
            return TemporalRole.REFERENCE_DATE, "semantic.temporal_role.reference_date"
        if (
            self._non_action_process_pattern is not None
            and self._non_action_process_pattern.search(local_context)
            and not (
                self._course_evaluation_pattern is not None
                and self._course_evaluation_pattern.search(local_context)
            )
        ):
            return TemporalRole.INTERNAL_PROCESS, "semantic.temporal_role.internal_process"
        if self._is_internal_student_workflow(segment_text, published, resolution, board_id):
            return TemporalRole.INTERNAL_PROCESS, "semantic.temporal_role.internal_workflow"
        if (
            event_type != "result_announcement"
            and (
                (
                    self._conditional_selected_participant_pattern is not None
                    and self._conditional_selected_participant_pattern.search(local_context)
                )
                or "재입학 허가자" in title
            )
        ):
            return TemporalRole.CONDITIONAL_FOLLOWUP, "semantic.temporal_role.conditional_followup"
        if (
            self._non_student_local_action_pattern is not None
            and self._non_student_local_action_pattern.search(local_context)
        ):
            return TemporalRole.INTERNAL_PROCESS, "semantic.temporal_role.non_student_local_action"
        role = self.default_role_for_event_type(event_type)
        return role, f"semantic.temporal_role.{role.value}"

    def classify_resolution(
        self,
        *,
        bound_fact: Any,
        source_segment: Any,
        title: str,
        published: Any,
        resolution: Any,
        policy_config: dict[str, Any],
        board_id: str,
        fallback_event_type: str | None = None,
    ) -> SemanticClassificationBatch:
        self._require_configured()
        segment_text = str(getattr(source_segment, "text", "") or "")
        initial_event = fallback_event_type or self.initial_event_type(source_segment, title, policy_config)
        event_type = (
            self._refine_event_type(segment_text, published, resolution, initial_event, policy_config)
            if initial_event
            else None
        )
        action_types = tuple(
            self._infer_academic_action_types(
                segment_text, title, published, resolution, event_type or ""
            )
        )
        local_academic_signals = {
            signal
            for signal in getattr(source_segment, "action_signals", ())
            if signal in self._academic_action_types
        }
        action_label_grounded = True
        if action_types:
            event_type = "academic_period"
            short_course_label = bool(
                __import__("re").search(
                    r"(?:취소|변경|정정)\s*(?:기간|기한|일정|일시)",
                    str(getattr(source_segment, "label_text", "") or segment_text),
                )
                and self._course_action_type_from_text(title) in action_types
            )
            if (
                str(getattr(source_segment, "segment_type", "")) != "title"
                and not short_course_label
                and not any(action_type in local_academic_signals for action_type in action_types)
            ):
                action_label_grounded = False

        local_context = self._local_context_for_resolution(segment_text, published, resolution)
        temporal_role, role_rule = self._temporal_role(
            segment_text=segment_text,
            title=title,
            published=published,
            resolution=resolution,
            event_type=event_type,
            board_id=board_id,
            local_context=local_context,
        )
        confidence = getattr(bound_fact, "confidence", Confidence.NONE)
        if not isinstance(confidence, Confidence):
            confidence = Confidence(str(confidence))
        rule_id = "semantic.policy15.compatible_classification"
        actions = action_types or (None,)
        classifications = tuple(
            SemanticClassification(
                event_type=event_type,
                action_type=action_type,
                temporal_role=temporal_role,
                confidence=confidence,
                rule_id=rule_id,
                evidence=tuple(
                    value for value in (
                        str(getattr(source_segment, "label_text", "") or ""),
                        local_context,
                        role_rule,
                    ) if value
                ),
            )
            for action_type in actions
        )
        return SemanticClassificationBatch(
            event_type=event_type,
            action_types=action_types,
            temporal_role=temporal_role,
            confidence=confidence,
            rule_id=rule_id,
            local_context=local_context,
            action_label_grounded=action_label_grounded,
            classifications=classifications,
        )

    def classify_explicit(
        self,
        *,
        event_type: str,
        action_type: str | None,
        confidence: Confidence = Confidence.HIGH,
        evidence: Iterable[str] = (),
    ) -> SemanticClassification:
        self._require_configured()
        return SemanticClassification(
            event_type=event_type,
            action_type=action_type,
            temporal_role=self.default_role_for_event_type(event_type),
            confidence=confidence,
            rule_id="semantic.explicit_structured_candidate",
            evidence=tuple(str(value) for value in evidence if value),
        )


__all__ = [
    "SEMANTIC_CLASSIFIER_VERSION",
    "SemanticClassificationBatch",
    "SemanticClassifier",
]
