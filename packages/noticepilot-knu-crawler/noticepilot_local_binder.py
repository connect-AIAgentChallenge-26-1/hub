#!/usr/bin/env python3
"""Local date-to-structure binding layer introduced in S23.

The binder consumes an S22 ScheduleSegment and TemporalMention and emits the
immutable S21 BoundTemporalFact contract.  It does not classify event meaning,
audience, publishability, or feed membership.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import date
from typing import Any

from noticepilot_judgment_models import (
    BindingKind,
    BoundTemporalFact,
    Confidence,
    TemporalMention,
)

LOCAL_BINDER_VERSION = "0.1.0"


@dataclass(frozen=True, slots=True)
class BindingResult:
    temporal_mention: TemporalMention
    bound_fact: BoundTemporalFact

    def to_dict(self) -> dict[str, Any]:
        return {
            "temporalMention": self.temporal_mention.to_dict(),
            "boundFact": self.bound_fact.to_dict(),
        }


class LocalBinder:
    """Bind deterministic date mentions to their structural owner."""

    version = LOCAL_BINDER_VERSION

    def __init__(self, temporal_parser: Any | None = None) -> None:
        self._temporal_parser = temporal_parser

    def _require_configured(self) -> None:
        if self._temporal_parser is None:
            raise RuntimeError("local binder is not configured")

    @staticmethod
    def binding_kind_for_segment(segment: Any) -> BindingKind:
        segment_type = str(getattr(segment, "segment_type", ""))
        locally_grounded = bool(getattr(segment, "locally_grounded", False))
        has_local_label = bool(
            getattr(segment, "label_text", "")
            or getattr(segment, "action_signals", ())
        )
        if segment_type == "table_row":
            return BindingKind.SAME_TABLE_ROW
        if segment_type == "continuation":
            return BindingKind.CONTINUATION_OWNER
        if segment_type == "list_item":
            return BindingKind.SAME_LIST_ITEM if (locally_grounded or has_local_label) else BindingKind.UNRESOLVED
        if segment_type == "paragraph":
            return BindingKind.SAME_PARAGRAPH if (locally_grounded or has_local_label) else BindingKind.UNRESOLVED
        if segment_type == "title":
            return BindingKind.TITLE_CONTEXT
        if segment_type == "label_value" or locally_grounded or has_local_label:
            return BindingKind.SAME_SEGMENT
        return BindingKind.UNRESOLVED

    @staticmethod
    def confidence_for_binding(kind: BindingKind, locally_grounded: bool) -> Confidence:
        if locally_grounded and kind in {
            BindingKind.SAME_SEGMENT,
            BindingKind.SAME_TABLE_ROW,
            BindingKind.CONTINUATION_OWNER,
            BindingKind.SAME_LIST_ITEM,
            BindingKind.SAME_PARAGRAPH,
        }:
            return Confidence.HIGH
        if kind in {BindingKind.SAME_LIST_ITEM, BindingKind.SAME_PARAGRAPH, BindingKind.SAME_SEGMENT}:
            return Confidence.MEDIUM
        if kind is BindingKind.TITLE_CONTEXT:
            return Confidence.LOW
        return Confidence.NONE

    def bind(
        self,
        source_notice_id: str,
        segment: Any,
        temporal_mention: TemporalMention,
    ) -> BoundTemporalFact:
        self._require_configured()
        kind = self.binding_kind_for_segment(segment)
        segment_local = bool(getattr(segment, "locally_grounded", False))
        locally_grounded = segment_local and kind not in {
            BindingKind.TITLE_CONTEXT,
            BindingKind.UNRESOLVED,
        }
        confidence = self.confidence_for_binding(kind, locally_grounded)
        label_text = str(getattr(segment, "label_text", "") or "")
        evidence = str(getattr(segment, "text", "") or temporal_mention.raw_text)
        rule_id = {
            BindingKind.SAME_TABLE_ROW: "binding.same_table_row",
            BindingKind.CONTINUATION_OWNER: "binding.continuation_owner",
            BindingKind.SAME_LIST_ITEM: "binding.same_list_item",
            BindingKind.SAME_PARAGRAPH: "binding.same_paragraph",
            BindingKind.SAME_SEGMENT: "binding.same_segment",
            BindingKind.TITLE_CONTEXT: "binding.title_context",
            BindingKind.UNRESOLVED: "binding.unresolved",
        }[kind]
        digest = hashlib.sha256(
            "|".join([
                str(source_notice_id),
                str(getattr(segment, "segment_id", "")),
                temporal_mention.mention_id,
                kind.value,
            ]).encode("utf-8")
        ).hexdigest()[:16]
        return BoundTemporalFact(
            fact_id=f"btf-{digest}",
            source_notice_id=str(source_notice_id),
            segment_id=str(getattr(segment, "segment_id", "")),
            temporal_mention_ids=(temporal_mention.mention_id,),
            binding_kind=kind,
            confidence=confidence,
            rule_id=rule_id,
            locally_grounded=locally_grounded,
            label_text=label_text,
            evidence=evidence,
        )

    def bind_explicit_resolution(
        self,
        source_notice_id: str,
        segment: Any,
        resolution: Any,
        raw_text: str | None = None,
    ) -> BindingResult:
        """Bind an already resolved local slice such as a cohort table cell."""
        self._require_configured()
        evidence = str(raw_text or getattr(resolution, "evidence", "") or getattr(segment, "text", ""))
        mention_digest = hashlib.sha256(
            "|".join([
                str(getattr(segment, "segment_id", "")),
                str(getattr(resolution, "start", "")),
                str(getattr(resolution, "end", "") or ""),
                str(getattr(resolution, "kind", "")),
                evidence,
            ]).encode("utf-8")
        ).hexdigest()[:16]
        mention = TemporalMention(
            mention_id=f"tm-{mention_digest}",
            segment_id=str(getattr(segment, "segment_id", "")),
            raw_text=str(getattr(resolution, "date_text", "") or evidence),
            normalized_start=str(getattr(resolution, "start", "")) or None,
            normalized_end=getattr(resolution, "end", None),
            resolution_kind=str(getattr(resolution, "kind", "explicit_resolution")),
            deterministic=True,
            inferred_year=bool(getattr(resolution, "inferred_year", False)),
        )
        return BindingResult(
            temporal_mention=mention,
            bound_fact=self.bind(source_notice_id, segment, mention),
        )

    def bind_resolution(
        self,
        source_notice_id: str,
        segment: Any,
        published: date,
    ) -> BindingResult | None:
        self._require_configured()
        mention = self._temporal_parser.to_temporal_mention(
            str(getattr(segment, "segment_id", "")),
            str(getattr(segment, "text", "")),
            published,
        )
        if mention is None:
            return None
        return BindingResult(
            temporal_mention=mention,
            bound_fact=self.bind(source_notice_id, segment, mention),
        )


__all__ = ["LOCAL_BINDER_VERSION", "BindingResult", "LocalBinder"]
