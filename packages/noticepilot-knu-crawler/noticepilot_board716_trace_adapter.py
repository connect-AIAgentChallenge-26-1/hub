#!/usr/bin/env python3
"""Board 716 list-metadata trace adapter introduced in S24-A.

The KNU recruitment board exposes an exact application period in list metadata.
That period is not parsed from the detail body, but it still needs the same
ScheduleSegment -> TemporalMention -> BoundTemporalFact ->
SemanticClassification audit chain as body-derived candidates.

This adapter creates that chain without making applicability, publishability,
feed, campus, or reconciliation decisions.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, replace
from typing import Any, Callable

from noticepilot_judgment_models import Confidence, SemanticClassification, TemporalRole
from noticepilot_local_binder import BindingResult

BOARD716_TRACE_ADAPTER_VERSION = "0.1.0"


@dataclass(frozen=True, slots=True)
class Board716MetadataTrace:
    source_segment: Any
    binding_result: BindingResult
    semantic_classification: SemanticClassification


class Board716ListMetadataTraceAdapter:
    """Adapt exact board 716 list application periods into layered traces."""

    version = BOARD716_TRACE_ADAPTER_VERSION

    def __init__(self, *, segment_factory: Callable[..., Any], local_binder: Any) -> None:
        self._segment_factory = segment_factory
        self._local_binder = local_binder

    @staticmethod
    def _date_spans(text: str, start: str, end: str) -> tuple[tuple[str, int, int], ...]:
        spans: list[tuple[str, int, int]] = []
        cursor = 0
        for value in (start, end):
            if any(existing[0] == value for existing in spans):
                continue
            index = text.find(value, cursor)
            if index < 0:
                index = text.find(value)
            if index >= 0:
                spans.append((value, index, index + len(value)))
                cursor = index + len(value)
        return tuple(spans)

    def adapt(self, *, source_notice_id: str, resolution: Any) -> Board716MetadataTrace:
        start = str(getattr(resolution, "start", "") or "")
        end = str(getattr(resolution, "end", "") or start)
        if not source_notice_id:
            raise ValueError("source_notice_id is required")
        if not start:
            raise ValueError("board 716 metadata trace requires normalized start")

        evidence = str(
            getattr(resolution, "evidence", "")
            or f"채용안내 목록 접수기간: {start}~{end}"
        )
        date_text = str(
            getattr(resolution, "date_text", "")
            or f"접수기간 {start}~{end}"
        )
        segment_digest = hashlib.sha256(
            f"board716-list-metadata|{source_notice_id}|{start}|{end}|{evidence}".encode("utf-8")
        ).hexdigest()[:16]
        segment = self._segment_factory(
            segment_id=f"seg-board716-{segment_digest}",
            segment_type="label_value",
            text=evidence,
            label_text="접수기간",
            body_text=f"{start}~{end}",
            line_index=0,
            clause_index=0,
            parent_segment_id=None,
            action_signals=("application_period",),
            audience_signals=(),
            date_spans=self._date_spans(evidence, start, end),
            locally_grounded=True,
        )
        bound = self._local_binder.bind_explicit_resolution(
            source_notice_id,
            segment,
            resolution,
            raw_text=evidence,
        )
        bound = BindingResult(
            temporal_mention=bound.temporal_mention,
            bound_fact=replace(
                bound.bound_fact,
                rule_id="binding.board716.list_metadata.application_period",
                label_text="접수기간",
                evidence=evidence,
            ),
        )
        classification = SemanticClassification(
            event_type="job_application_period",
            action_type=None,
            temporal_role=TemporalRole.USER_ACTION_PERIOD,
            confidence=Confidence.HIGH,
            rule_id="semantic.board716.exact_application_period",
            evidence=(
                "listMetadata.application_period_start",
                "listMetadata.application_period_end",
                date_text,
            ),
        )
        return Board716MetadataTrace(
            source_segment=segment,
            binding_result=bound,
            semantic_classification=classification,
        )


__all__ = [
    "BOARD716_TRACE_ADAPTER_VERSION",
    "Board716MetadataTrace",
    "Board716ListMetadataTraceAdapter",
]
