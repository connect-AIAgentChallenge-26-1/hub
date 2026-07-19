#!/usr/bin/env python3
"""NoticePilot layered judgment-domain contracts (S21).

This module provides immutable data contracts for the layered judgment engine.
S22 wires structure and temporal contracts into runtime; S23 additionally wires
local binding and semantic classification. S24-B/S24-C extract standalone
applicability and publishability evaluators; S24-D serializes both judgment
objects on runtime candidates. S25 extracts intra-notice reconciliation into a standalone composition root.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from types import MappingProxyType
from typing import Any, Mapping, Sequence

JUDGMENT_CONTRACT_VERSION = "0.1.0"
SCHEDULE_SEGMENT_CONTRACT_VERSION = "noticepilot.scheduleSegmentContract.v0.1"
TEMPORAL_MENTION_SCHEMA_VERSION = "noticepilot.temporalMention.v0.1"
BOUND_TEMPORAL_FACT_SCHEMA_VERSION = "noticepilot.boundTemporalFact.v0.1"
SEMANTIC_CANDIDATE_SCHEMA_VERSION = "noticepilot.semanticScheduleCandidate.v0.1"
APPLICABILITY_JUDGMENT_SCHEMA_VERSION = "noticepilot.applicabilityJudgment.v0.1"
PUBLISHABILITY_JUDGMENT_SCHEMA_VERSION = "noticepilot.publishabilityJudgment.v0.1"
JUDGMENT_TRACE_SCHEMA_VERSION = "noticepilot.judgmentTrace.v0.1"


class ContractError(ValueError):
    """Raised when a judgment-domain contract is constructed with invalid data."""


class Confidence(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    NONE = "none"


class JudgmentLayer(str, Enum):
    STRUCTURE = "structure"
    TEMPORAL = "temporal"
    LOCAL_BINDING = "local_binding"
    SEMANTIC_CLASSIFICATION = "semantic_classification"
    APPLICABILITY = "applicability"
    PUBLISHABILITY = "publishability"
    RECONCILIATION = "reconciliation"
    SUBSCRIPTION_PROJECTION = "subscription_projection"
    SERIALIZATION = "serialization"


class JudgmentVerdict(str, Enum):
    OBSERVED = "observed"
    PASS = "pass"
    CLASSIFIED = "classified"
    AUTO_CONFIRMED = "auto_confirmed"
    NEEDS_REVIEW = "needs_review"
    NOT_CALENDAR_RELEVANT = "not_calendar_relevant"
    FILTERED = "filtered"
    CONFLICT = "conflict"
    ERROR = "error"


class TemporalRole(str, Enum):
    USER_ACTION_PERIOD = "user_action_period"
    EVENT_OCCURRENCE = "event_occurrence"
    RESULT_ANNOUNCEMENT = "result_announcement"
    REFERENCE_DATE = "reference_date"
    INTERNAL_PROCESS = "internal_process"
    CONDITIONAL_FOLLOWUP = "conditional_followup"
    UNKNOWN = "unknown"


class ApplicabilityScope(str, Enum):
    UNRESTRICTED = "unrestricted"
    PROFILE_SCOPED = "profile_scoped"
    CONDITIONAL = "conditional"
    UNKNOWN = "unknown"


class BindingKind(str, Enum):
    SAME_SEGMENT = "same_segment"
    SAME_TABLE_ROW = "same_table_row"
    CONTINUATION_OWNER = "continuation_owner"
    SAME_LIST_ITEM = "same_list_item"
    SAME_PARAGRAPH = "same_paragraph"
    TITLE_CONTEXT = "title_context"
    UNRESOLVED = "unresolved"


def _non_empty(value: str, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ContractError(f"{field_name} must be a non-empty string")
    return value


def _tuple_strings(values: Sequence[str] | None, field_name: str) -> tuple[str, ...]:
    result = tuple(str(value) for value in (values or ()))
    if any(not value for value in result):
        raise ContractError(f"{field_name} cannot contain empty values")
    return result


def _freeze(value: Any) -> Any:
    if isinstance(value, Mapping):
        return MappingProxyType({str(key): _freeze(child) for key, child in value.items()})
    if isinstance(value, (list, tuple)):
        return tuple(_freeze(child) for child in value)
    return value


def _thaw(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): _thaw(child) for key, child in value.items()}
    if isinstance(value, tuple):
        return [_thaw(child) for child in value]
    return value


def _dict(value: Mapping[str, Any] | None) -> Mapping[str, Any]:
    return _freeze(value or {})


@dataclass(frozen=True, slots=True)
class SourceLocation:
    line_index: int | None = None
    clause_index: int | None = None
    parent_segment_id: str | None = None

    def __post_init__(self) -> None:
        if self.line_index is not None and self.line_index < 0:
            raise ContractError("line_index must be >= 0")
        if self.clause_index is not None and self.clause_index < 0:
            raise ContractError("clause_index must be >= 0")

    def to_dict(self) -> dict[str, Any]:
        return {
            "lineIndex": self.line_index,
            "clauseIndex": self.clause_index,
            "parentSegmentId": self.parent_segment_id,
        }


@dataclass(frozen=True, slots=True)
class ScheduleSegment:
    segment_id: str
    segment_type: str
    label_text: str
    body_text: str
    source_location: SourceLocation
    ownership_confidence: Confidence = Confidence.NONE
    action_signals: tuple[str, ...] = field(default_factory=tuple)
    audience_signals: tuple[str, ...] = field(default_factory=tuple)
    schema_version: str = SCHEDULE_SEGMENT_CONTRACT_VERSION

    def __post_init__(self) -> None:
        _non_empty(self.segment_id, "segment_id")
        _non_empty(self.segment_type, "segment_type")
        if not self.label_text and not self.body_text:
            raise ContractError("a segment must preserve label_text or body_text")
        object.__setattr__(self, "action_signals", _tuple_strings(self.action_signals, "action_signals"))
        object.__setattr__(self, "audience_signals", _tuple_strings(self.audience_signals, "audience_signals"))

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "segmentId": self.segment_id,
            "segmentType": self.segment_type,
            "labelText": self.label_text,
            "bodyText": self.body_text,
            "sourceLocation": self.source_location.to_dict(),
            "ownershipConfidence": self.ownership_confidence.value,
            "actionSignals": list(self.action_signals),
            "audienceSignals": list(self.audience_signals),
        }


@dataclass(frozen=True, slots=True)
class TemporalMention:
    mention_id: str
    segment_id: str
    raw_text: str
    normalized_start: str | None
    normalized_end: str | None
    resolution_kind: str
    deterministic: bool
    timezone: str | None = "Asia/Seoul"
    inferred_year: bool = False
    span_start: int | None = None
    span_end: int | None = None
    schema_version: str = TEMPORAL_MENTION_SCHEMA_VERSION

    def __post_init__(self) -> None:
        _non_empty(self.mention_id, "mention_id")
        _non_empty(self.segment_id, "segment_id")
        _non_empty(self.raw_text, "raw_text")
        _non_empty(self.resolution_kind, "resolution_kind")
        if self.deterministic and not self.normalized_start:
            raise ContractError("deterministic temporal mention requires normalized_start")
        if (self.span_start is None) != (self.span_end is None):
            raise ContractError("span_start and span_end must be provided together")
        if self.span_start is not None and (self.span_start < 0 or self.span_end is None or self.span_end < self.span_start):
            raise ContractError("invalid temporal mention span")

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "mentionId": self.mention_id,
            "segmentId": self.segment_id,
            "rawText": self.raw_text,
            "normalizedStart": self.normalized_start,
            "normalizedEnd": self.normalized_end,
            "resolutionKind": self.resolution_kind,
            "deterministic": self.deterministic,
            "timezone": self.timezone,
            "inferredYear": self.inferred_year,
            "span": None if self.span_start is None else {"start": self.span_start, "end": self.span_end},
        }


@dataclass(frozen=True, slots=True)
class BoundTemporalFact:
    fact_id: str
    source_notice_id: str
    segment_id: str
    temporal_mention_ids: tuple[str, ...]
    binding_kind: BindingKind
    confidence: Confidence
    rule_id: str
    locally_grounded: bool
    label_text: str = ""
    evidence: str = ""
    schema_version: str = BOUND_TEMPORAL_FACT_SCHEMA_VERSION

    def __post_init__(self) -> None:
        _non_empty(self.fact_id, "fact_id")
        _non_empty(self.source_notice_id, "source_notice_id")
        _non_empty(self.segment_id, "segment_id")
        _non_empty(self.rule_id, "rule_id")
        object.__setattr__(self, "temporal_mention_ids", _tuple_strings(self.temporal_mention_ids, "temporal_mention_ids"))
        if not self.temporal_mention_ids:
            raise ContractError("bound temporal fact requires at least one temporal mention")
        if self.locally_grounded and self.binding_kind in {BindingKind.TITLE_CONTEXT, BindingKind.UNRESOLVED}:
            raise ContractError("locally grounded fact cannot use title_context or unresolved binding")

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "factId": self.fact_id,
            "sourceNoticeId": self.source_notice_id,
            "segmentId": self.segment_id,
            "temporalMentionIds": list(self.temporal_mention_ids),
            "bindingKind": self.binding_kind.value,
            "confidence": self.confidence.value,
            "ruleId": self.rule_id,
            "locallyGrounded": self.locally_grounded,
            "labelText": self.label_text,
            "evidence": self.evidence,
        }


@dataclass(frozen=True, slots=True)
class SemanticClassification:
    event_type: str | None
    action_type: str | None
    temporal_role: TemporalRole
    confidence: Confidence
    rule_id: str
    evidence: tuple[str, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        _non_empty(self.rule_id, "rule_id")
        object.__setattr__(self, "evidence", _tuple_strings(self.evidence, "evidence"))
        if not self.event_type and not self.action_type and self.temporal_role is not TemporalRole.UNKNOWN:
            raise ContractError("classified temporal role requires event_type or action_type")

    def to_dict(self) -> dict[str, Any]:
        return {
            "eventType": self.event_type,
            "actionType": self.action_type,
            "temporalRole": self.temporal_role.value,
            "confidence": self.confidence.value,
            "ruleId": self.rule_id,
            "evidence": list(self.evidence),
        }


@dataclass(frozen=True, slots=True)
class ApplicabilityJudgment:
    target_actor: str
    scope: ApplicabilityScope
    audience_rules: Mapping[str, Any]
    confidence: Confidence
    rule_id: str
    reason_codes: tuple[str, ...] = field(default_factory=tuple)
    schema_version: str = APPLICABILITY_JUDGMENT_SCHEMA_VERSION

    def __post_init__(self) -> None:
        _non_empty(self.target_actor, "target_actor")
        _non_empty(self.rule_id, "rule_id")
        object.__setattr__(self, "audience_rules", _dict(self.audience_rules))
        object.__setattr__(self, "reason_codes", _tuple_strings(self.reason_codes, "reason_codes"))

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "targetActor": self.target_actor,
            "scope": self.scope.value,
            "audienceRules": _thaw(self.audience_rules),
            "confidence": self.confidence.value,
            "ruleId": self.rule_id,
            "reasonCodes": list(self.reason_codes),
        }


@dataclass(frozen=True, slots=True)
class PublishabilityJudgment:
    verdict: JudgmentVerdict
    include_in_calendar_feed: bool
    reason_codes: tuple[str, ...]
    rule_ids: tuple[str, ...]
    schema_version: str = PUBLISHABILITY_JUDGMENT_SCHEMA_VERSION

    def __post_init__(self) -> None:
        object.__setattr__(self, "reason_codes", _tuple_strings(self.reason_codes, "reason_codes"))
        object.__setattr__(self, "rule_ids", _tuple_strings(self.rule_ids, "rule_ids"))
        if self.include_in_calendar_feed and self.verdict is not JudgmentVerdict.AUTO_CONFIRMED:
            raise ContractError("only auto_confirmed publishability may enter a calendar feed")
        if self.verdict is JudgmentVerdict.AUTO_CONFIRMED and not self.include_in_calendar_feed:
            raise ContractError("auto_confirmed publishability must enter a calendar feed")

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "verdict": self.verdict.value,
            "includeInCalendarFeed": self.include_in_calendar_feed,
            "reasonCodes": list(self.reason_codes),
            "ruleIds": list(self.rule_ids),
        }


@dataclass(frozen=True, slots=True)
class SemanticScheduleCandidate:
    candidate_id: str
    source_notice_id: str
    bound_fact_ids: tuple[str, ...]
    normalized_start: str | None
    normalized_end: str | None
    semantic: SemanticClassification
    applicability: ApplicabilityJudgment
    schema_version: str = SEMANTIC_CANDIDATE_SCHEMA_VERSION

    def __post_init__(self) -> None:
        _non_empty(self.candidate_id, "candidate_id")
        _non_empty(self.source_notice_id, "source_notice_id")
        object.__setattr__(self, "bound_fact_ids", _tuple_strings(self.bound_fact_ids, "bound_fact_ids"))
        if not self.bound_fact_ids:
            raise ContractError("semantic candidate requires at least one bound fact")

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "candidateId": self.candidate_id,
            "sourceNoticeId": self.source_notice_id,
            "boundFactIds": list(self.bound_fact_ids),
            "normalizedStart": self.normalized_start,
            "normalizedEnd": self.normalized_end,
            "semantic": self.semantic.to_dict(),
            "applicability": self.applicability.to_dict(),
        }


@dataclass(frozen=True, slots=True)
class JudgmentRecord:
    layer: JudgmentLayer
    verdict: JudgmentVerdict
    rule_id: str
    confidence: Confidence
    input_refs: tuple[str, ...] = field(default_factory=tuple)
    output: Mapping[str, Any] = field(default_factory=dict)
    reason_codes: tuple[str, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        _non_empty(self.rule_id, "rule_id")
        object.__setattr__(self, "input_refs", _tuple_strings(self.input_refs, "input_refs"))
        object.__setattr__(self, "reason_codes", _tuple_strings(self.reason_codes, "reason_codes"))
        object.__setattr__(self, "output", _dict(self.output))

    def to_dict(self) -> dict[str, Any]:
        return {
            "layer": self.layer.value,
            "verdict": self.verdict.value,
            "ruleId": self.rule_id,
            "confidence": self.confidence.value,
            "inputRefs": list(self.input_refs),
            "output": _thaw(self.output),
            "reasonCodes": list(self.reason_codes),
        }


@dataclass(frozen=True, slots=True)
class JudgmentTrace:
    trace_id: str
    source_notice_id: str
    candidate_id: str | None
    engine_versions: Mapping[str, str]
    judgments: tuple[JudgmentRecord, ...]
    final_decision: Mapping[str, Any]
    metadata: Mapping[str, Any] = field(default_factory=dict)
    schema_version: str = JUDGMENT_TRACE_SCHEMA_VERSION

    def __post_init__(self) -> None:
        _non_empty(self.trace_id, "trace_id")
        _non_empty(self.source_notice_id, "source_notice_id")
        object.__setattr__(self, "engine_versions", _freeze({str(k): str(v) for k, v in self.engine_versions.items()}))
        object.__setattr__(self, "judgments", tuple(self.judgments))
        object.__setattr__(self, "final_decision", _dict(self.final_decision))
        object.__setattr__(self, "metadata", _dict(self.metadata))
        if not self.judgments:
            raise ContractError("judgment trace requires at least one judgment")
        layer_order = [list(JudgmentLayer).index(record.layer) for record in self.judgments]
        if layer_order != sorted(layer_order):
            raise ContractError("judgment records must follow layer order")

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "traceId": self.trace_id,
            "sourceNoticeId": self.source_notice_id,
            "candidateId": self.candidate_id,
            "engineVersions": _thaw(self.engine_versions),
            "judgments": [record.to_dict() for record in self.judgments],
            "finalDecision": _thaw(self.final_decision),
            "metadata": _thaw(self.metadata),
        }


def _legacy_confidence(value: Any) -> Confidence:
    try:
        return Confidence(str(value or "none"))
    except ValueError:
        return Confidence.NONE


def _legacy_verdict(status: Any) -> JudgmentVerdict:
    mapping = {
        "auto_confirmed": JudgmentVerdict.AUTO_CONFIRMED,
        "needs_review": JudgmentVerdict.NEEDS_REVIEW,
        "not_calendar_relevant": JudgmentVerdict.NOT_CALENDAR_RELEVANT,
    }
    return mapping.get(str(status or ""), JudgmentVerdict.NEEDS_REVIEW)


def legacy_candidate_to_judgment_trace(
    candidate: Mapping[str, Any],
    *,
    pipeline_version: str = "0.1.14",
    policy_version: str = "noticepilot.studentFirstMvp.v0.1",
) -> JudgmentTrace:
    """Wrap a Policy.15 candidate in the S21 trace contract without reclassifying it.

    The adapter deliberately sets ``temporalRole`` to ``unknown``. Assigning a
    semantic temporal role is S23 work and must not be guessed during S21.
    """
    candidate_id = _non_empty(str(candidate.get("id") or ""), "candidate.id")
    notice_id = _non_empty(str(candidate.get("sourceNoticeId") or ""), "candidate.sourceNoticeId")
    source_segment = _dict(candidate.get("sourceSegment"))
    segment_id = str(source_segment.get("segmentId") or f"legacy-segment:{candidate_id}")
    confidence = _legacy_confidence(candidate.get("confidence"))
    audience_rules = _dict(candidate.get("audienceRules"))
    target_actor = str(candidate.get("targetActor") or "unknown")
    status_verdict = _legacy_verdict(candidate.get("status"))
    include = bool(candidate.get("includeInCalendarFeed"))

    judgments = (
        JudgmentRecord(
            layer=JudgmentLayer.STRUCTURE,
            verdict=JudgmentVerdict.OBSERVED,
            rule_id="legacy.policy15.source-segment",
            confidence=Confidence.HIGH if source_segment else Confidence.NONE,
            input_refs=(notice_id,),
            output={"segmentId": segment_id, "segmentType": source_segment.get("segmentType")},
        ),
        JudgmentRecord(
            layer=JudgmentLayer.TEMPORAL,
            verdict=JudgmentVerdict.OBSERVED,
            rule_id="legacy.policy15.normalized-interval",
            confidence=confidence,
            input_refs=(segment_id,),
            output={
                "normalizedStart": candidate.get("normalizedStart"),
                "normalizedEnd": candidate.get("normalizedEnd"),
                "isAllDay": candidate.get("isAllDay"),
                "endDateInclusive": candidate.get("endDateInclusive"),
            },
        ),
        JudgmentRecord(
            layer=JudgmentLayer.LOCAL_BINDING,
            verdict=JudgmentVerdict.PASS if source_segment.get("locallyGrounded") else JudgmentVerdict.NEEDS_REVIEW,
            rule_id="legacy.policy15.local-binding",
            confidence=Confidence.HIGH if source_segment.get("locallyGrounded") else Confidence.LOW,
            input_refs=(segment_id,),
            output={"locallyGrounded": bool(source_segment.get("locallyGrounded"))},
        ),
        JudgmentRecord(
            layer=JudgmentLayer.SEMANTIC_CLASSIFICATION,
            verdict=JudgmentVerdict.CLASSIFIED,
            rule_id="legacy.policy15.semantic-fields",
            confidence=confidence,
            input_refs=(candidate_id,),
            output={
                "eventType": candidate.get("eventType"),
                "actionType": candidate.get("actionType"),
                "temporalRole": TemporalRole.UNKNOWN.value,
            },
            reason_codes=("temporal_role_not_yet_migrated",),
        ),
        JudgmentRecord(
            layer=JudgmentLayer.APPLICABILITY,
            verdict=JudgmentVerdict.CLASSIFIED,
            rule_id="legacy.policy15.applicability-fields",
            confidence=_legacy_confidence(audience_rules.get("confidence")),
            input_refs=(candidate_id,),
            output={"targetActor": target_actor, "audienceRules": audience_rules},
        ),
        JudgmentRecord(
            layer=JudgmentLayer.PUBLISHABILITY,
            verdict=status_verdict,
            rule_id="legacy.policy15.status",
            confidence=confidence,
            input_refs=(candidate_id,),
            output={"includeInCalendarFeed": include, "feedScopes": list(candidate.get("feedScopes") or [])},
            reason_codes=tuple(str(code) for code in (candidate.get("reasonCodes") or [])),
        ),
    )
    return JudgmentTrace(
        trace_id=f"trace:{candidate_id}",
        source_notice_id=notice_id,
        candidate_id=candidate_id,
        engine_versions={
            "pipeline": pipeline_version,
            "policy": policy_version,
            "judgmentContract": JUDGMENT_CONTRACT_VERSION,
        },
        judgments=judgments,
        final_decision={
            "status": candidate.get("status"),
            "includeInCalendarFeed": include,
            "feedScopes": list(candidate.get("feedScopes") or []),
        },
        metadata={
            "compatibilityMode": "policy15_read_only_adapter",
            "sourceCandidateSchemaVersion": "noticepilot.calendarCandidates.v0.10",
            "semanticMigrationComplete": False,
        },
    )


__all__ = [
    "APPLICABILITY_JUDGMENT_SCHEMA_VERSION",
    "BOUND_TEMPORAL_FACT_SCHEMA_VERSION",
    "JUDGMENT_CONTRACT_VERSION",
    "JUDGMENT_TRACE_SCHEMA_VERSION",
    "PUBLISHABILITY_JUDGMENT_SCHEMA_VERSION",
    "SCHEDULE_SEGMENT_CONTRACT_VERSION",
    "SEMANTIC_CANDIDATE_SCHEMA_VERSION",
    "TEMPORAL_MENTION_SCHEMA_VERSION",
    "ApplicabilityJudgment",
    "ApplicabilityScope",
    "BindingKind",
    "BoundTemporalFact",
    "Confidence",
    "ContractError",
    "JudgmentLayer",
    "JudgmentRecord",
    "JudgmentTrace",
    "JudgmentVerdict",
    "PublishabilityJudgment",
    "ScheduleSegment",
    "SemanticClassification",
    "SemanticScheduleCandidate",
    "SourceLocation",
    "TemporalMention",
    "TemporalRole",
    "legacy_candidate_to_judgment_trace",
]
