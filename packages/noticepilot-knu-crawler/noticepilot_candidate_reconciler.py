#!/usr/bin/env python3
"""Intra-notice candidate reconciliation for NoticePilot S25.

The reconciler owns only candidate-to-candidate comparisons inside one notice:

- exact timestamp duplicate consolidation,
- generic-vs-typed semantic preference,
- scoped-vs-unscoped applicability preference,
- timed-vs-all-day precision preference,
- same-action range boundary consolidation,
- true same-action date conflict demotion.

It does not classify source text, decide campus/feed applicability, reconcile
across notices, or serialize calendar events.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, Mapping, Sequence

CANDIDATE_RECONCILER_VERSION = "0.1.0"

Candidate = dict[str, Any]
NormalizeSpace = Callable[[Any], str]
AudienceKey = Callable[[Mapping[str, Any] | None], tuple[Any, ...]]
DemoteCandidate = Callable[[Candidate, str], None]
SynchronizeCandidate = Callable[[Candidate], Any]


@dataclass(frozen=True, slots=True)
class ReconciliationReport:
    """Observable, non-serialized summary of one reconciliation pass."""

    input_count: int
    output_count: int
    same_datetime_removed_count: int = 0
    same_day_precision_removed_count: int = 0
    range_boundary_removed_count: int = 0
    conflict_count: int = 0

    @property
    def removed_count(self) -> int:
        return self.input_count - self.output_count

    def to_dict(self) -> dict[str, int | str]:
        return {
            "reconcilerVersion": CANDIDATE_RECONCILER_VERSION,
            "inputCount": self.input_count,
            "outputCount": self.output_count,
            "removedCount": self.removed_count,
            "sameDatetimeRemovedCount": self.same_datetime_removed_count,
            "sameDayPrecisionRemovedCount": self.same_day_precision_removed_count,
            "rangeBoundaryRemovedCount": self.range_boundary_removed_count,
            "conflictCount": self.conflict_count,
        }


class CandidateReconciler:
    """Reconcile candidate duplicates and conflicts within a single notice."""

    version = CANDIDATE_RECONCILER_VERSION

    def __init__(
        self,
        *,
        normalize_space: NormalizeSpace,
        audience_rules_key: AudienceKey,
        strong_event_type_patterns: Sequence[tuple[str, Any]],
        event_type_priority: Mapping[str, int],
        academic_action_types: Sequence[str] | set[str],
        action_family: Mapping[str, str],
        demote_candidate: DemoteCandidate,
        synchronize_candidate: SynchronizeCandidate | None = None,
    ) -> None:
        self.normalize_space = normalize_space
        self.audience_rules_key = audience_rules_key
        self.strong_event_type_patterns = tuple(strong_event_type_patterns)
        self.event_type_priority = dict(event_type_priority)
        self.academic_action_types = frozenset(str(value) for value in academic_action_types)
        self.action_family = dict(action_family)
        self.demote_candidate = demote_candidate
        self.synchronize_candidate = synchronize_candidate

    def semantic_scope_key(self, candidate: Candidate) -> tuple[Any, ...]:
        return (
            str(candidate.get("actionType") or ""),
            self.audience_rules_key(candidate.get("audienceRules")),
        )

    def context_score(self, candidate: Candidate) -> tuple[int, int, int]:
        event_type = str(candidate.get("eventType") or "")
        evidence = self.normalize_space(candidate.get("evidence"))
        strong = int(any(
            pattern_type == event_type and pattern.search(evidence)
            for pattern_type, pattern in self.strong_event_type_patterns
        ))
        # More local evidence wins when semantic strength otherwise ties.
        return (strong, self.event_type_priority.get(event_type, 0), -len(evidence))

    def action_family_key(self, candidate: Candidate) -> str:
        action_type = str(candidate.get("actionType") or "")
        if action_type:
            return action_type
        event_type = str(candidate.get("eventType") or "")
        return self.action_family.get(event_type, event_type)

    @staticmethod
    def date_bounds(candidate: Candidate) -> tuple[datetime, datetime] | None:
        start_raw = str(candidate.get("normalizedStart") or "")
        end_raw = str(candidate.get("normalizedEnd") or start_raw)
        if not start_raw:
            return None

        def parse_boundary(value: str, *, end: bool = False) -> datetime:
            if "T" in value:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            suffix = "T23:59:59+09:00" if end else "T00:00:00+09:00"
            return datetime.fromisoformat(value[:10] + suffix)

        try:
            return parse_boundary(start_raw), parse_boundary(end_raw, end=True)
        except ValueError:
            return None

    def _append_reason(self, candidate: Candidate, reason: str) -> None:
        candidate["reasonCodes"] = sorted(
            set((candidate.get("reasonCodes") or []) + [reason])
        )
        if self.synchronize_candidate is not None:
            self.synchronize_candidate(candidate)

    def consolidate_same_datetime(
        self,
        candidates: list[Candidate],
    ) -> tuple[list[Candidate], int]:
        """Remove exact-timestamp duplicates while preserving distinct cohorts."""
        grouped: dict[
            tuple[str, str | None, bool, tuple[str, ...]],
            list[Candidate],
        ] = defaultdict(list)
        for candidate in candidates:
            key = (
                str(candidate.get("normalizedStart")),
                candidate.get("normalizedEnd"),
                bool(candidate.get("isAllDay")),
                tuple(candidate.get("feedScopes") or []),
            )
            grouped[key].append(candidate)

        kept: list[Candidate] = []
        removed = 0
        for group in grouped.values():
            working = list(group)

            typed_academic = [
                item for item in working
                if item.get("actionType") in self.academic_action_types
            ]
            if typed_academic:
                filtered: list[Candidate] = []
                for item in working:
                    if item in typed_academic or item.get("actionType"):
                        filtered.append(item)
                        continue
                    if str(item.get("eventType") or "") not in {
                        "deadline", "academic_period", "application_period"
                    }:
                        filtered.append(item)
                        continue
                    item_evidence = self.normalize_space(item.get("evidence"))
                    item_label = self.normalize_space(
                        (item.get("sourceSegment") or {}).get("labelText")
                    )
                    redundant = any(
                        (
                            item_label
                            and self.normalize_space(
                                (typed.get("sourceSegment") or {}).get("labelText")
                            )
                            and item_label == self.normalize_space(
                                (typed.get("sourceSegment") or {}).get("labelText")
                            )
                        )
                        or (
                            item_evidence
                            and item_evidence in self.normalize_space(typed.get("evidence"))
                        )
                        or (
                            self.normalize_space(typed.get("evidence"))
                            and self.normalize_space(typed.get("evidence")) in item_evidence
                        )
                        for typed in typed_academic
                    )
                    if redundant:
                        removed += 1
                    else:
                        filtered.append(item)
                working = filtered

            if any(item.get("actionType") for item in working):
                filtered = []
                for item in working:
                    if (
                        not item.get("actionType")
                        and str(item.get("eventType") or "") == "academic_period"
                        and not any(self.audience_rules_key(item.get("audienceRules")))
                    ):
                        removed += 1
                    else:
                        filtered.append(item)
                working = filtered

            by_action: dict[str, list[Candidate]] = defaultdict(list)
            passthrough: list[Candidate] = []
            for item in working:
                action_type = str(item.get("actionType") or "")
                if action_type:
                    by_action[action_type].append(item)
                else:
                    passthrough.append(item)

            normalized: list[Candidate] = list(passthrough)
            for action_group in by_action.values():
                scoped = [
                    item for item in action_group
                    if any(self.audience_rules_key(item.get("audienceRules")))
                ]
                if not scoped:
                    normalized.extend(action_group)
                    continue
                for item in action_group:
                    if any(self.audience_rules_key(item.get("audienceRules"))):
                        normalized.append(item)
                    else:
                        removed += 1

            semantic_groups: dict[tuple[Any, ...], list[Candidate]] = defaultdict(list)
            for item in normalized:
                semantic_groups[self.semantic_scope_key(item)].append(item)

            for semantic_group in semantic_groups.values():
                if len(semantic_group) == 1:
                    kept.append(semantic_group[0])
                    continue
                chosen = max(semantic_group, key=self.context_score)
                removed += len(semantic_group) - 1
                self._append_reason(chosen, "same_datetime_candidates_consolidated")
                kept.append(chosen)

        kept.sort(key=self._semantic_sort_key)
        return kept, removed

    def consolidate_same_day_precision(
        self,
        candidates: list[Candidate],
    ) -> tuple[list[Candidate], int]:
        """Prefer timed candidates over same-day all-day duplicates."""
        grouped: dict[tuple[Any, ...], list[Candidate]] = defaultdict(list)
        passthrough: list[Candidate] = []
        for candidate in candidates:
            start = str(candidate.get("normalizedStart") or "")
            end = str(candidate.get("normalizedEnd") or start)
            if not start or not end:
                passthrough.append(candidate)
                continue
            key = (
                self.action_family_key(candidate),
                start[:10],
                end[:10],
                tuple(candidate.get("feedScopes") or []),
                self.semantic_scope_key(candidate),
            )
            grouped[key].append(candidate)

        kept = list(passthrough)
        removed = 0
        for group in grouped.values():
            timed = [item for item in group if not item.get("isAllDay")]
            all_day = [item for item in group if item.get("isAllDay")]
            if timed and all_day:
                removed += len(all_day)
                for item in timed:
                    self._append_reason(item, "same_day_precision_candidates_consolidated")
                kept.extend(timed)
            else:
                kept.extend(group)
        kept.sort(key=self._legacy_sort_key)
        return kept, removed

    def consolidate_same_action_ranges(
        self,
        candidates: list[Candidate],
    ) -> tuple[list[Candidate], int, int]:
        """Remove redundant boundary singles and demote true date conflicts."""
        groups: dict[tuple[Any, ...], list[Candidate]] = defaultdict(list)
        for candidate in candidates:
            groups[
                (
                    self.action_family_key(candidate),
                    tuple(candidate.get("feedScopes") or []),
                    self.audience_rules_key(candidate.get("audienceRules")),
                )
            ].append(candidate)

        removed_ids: set[int] = set()
        removed = 0
        conflicts = 0

        for group in groups.values():
            ranges: list[Candidate] = []
            singles: list[Candidate] = []
            for item in group:
                bounds = self.date_bounds(item)
                if bounds is None:
                    continue
                start_raw = str(item.get("normalizedStart") or "")
                end_raw = str(item.get("normalizedEnd") or "")
                (ranges if end_raw and end_raw != start_raw else singles).append(item)

            for single in singles:
                if id(single) in removed_ids:
                    continue
                single_bounds = self.date_bounds(single)
                if single_bounds is None:
                    continue
                single_start, _ = single_bounds
                for range_candidate in ranges:
                    range_bounds = self.date_bounds(range_candidate)
                    if range_bounds is None:
                        continue
                    range_start, range_end = range_bounds
                    if not (range_start.date() <= single_start.date() <= range_end.date()):
                        continue

                    at_start = single_start.date() == range_start.date()
                    at_end = single_start.date() == range_end.date()
                    if at_start or at_end:
                        exact_boundary = str(single.get("normalizedStart")) in {
                            str(range_candidate.get("normalizedStart")),
                            str(range_candidate.get("normalizedEnd")),
                        }
                        if bool(single.get("isAllDay")) or exact_boundary:
                            removed_ids.add(id(single))
                            removed += 1
                            self._append_reason(
                                range_candidate,
                                "same_action_boundary_candidates_consolidated",
                            )
                        else:
                            self.demote_candidate(single, "range_boundary_time_requires_review")
                            self.demote_candidate(
                                range_candidate, "range_boundary_time_requires_review"
                            )
                            conflicts += 1
                        break

                    self.demote_candidate(single, "conflicting_same_action_dates")
                    self.demote_candidate(
                        range_candidate, "conflicting_same_action_dates"
                    )
                    conflicts += 1
                    break

        kept = [item for item in candidates if id(item) not in removed_ids]
        kept.sort(key=self._legacy_sort_key)
        return kept, removed, conflicts

    def reconcile(
        self,
        candidates: list[Candidate],
    ) -> tuple[list[Candidate], ReconciliationReport]:
        """Run the canonical S25 intra-notice reconciliation sequence."""
        input_count = len(candidates)
        working, same_datetime_removed = self.consolidate_same_datetime(candidates)
        working, same_day_precision_removed = self.consolidate_same_day_precision(working)
        working, range_boundary_removed, conflict_count = self.consolidate_same_action_ranges(working)
        if self.synchronize_candidate is not None:
            for candidate in working:
                self.synchronize_candidate(candidate)
        report = ReconciliationReport(
            input_count=input_count,
            output_count=len(working),
            same_datetime_removed_count=same_datetime_removed,
            same_day_precision_removed_count=same_day_precision_removed,
            range_boundary_removed_count=range_boundary_removed,
            conflict_count=conflict_count,
        )
        return working, report

    def is_reconciled(self, candidates: list[Candidate]) -> bool:
        """Return whether a second pass preserves candidate identity and projection."""
        before = [self._stable_projection(item) for item in candidates]
        copied = [dict(item) for item in candidates]
        after, report = self.reconcile(copied)
        return (
            report.removed_count == 0
            and [self._stable_projection(item) for item in after] == before
        )

    def _semantic_sort_key(self, item: Candidate) -> tuple[Any, ...]:
        return (
            str(item.get("normalizedStart")),
            str(item.get("normalizedEnd") or ""),
            str(item.get("eventType")),
            str(item.get("actionType") or ""),
            self.audience_rules_key(item.get("audienceRules")),
        )


    @staticmethod
    def _legacy_sort_key(item: Candidate) -> tuple[str, str, str]:
        return (
            str(item.get("normalizedStart")),
            str(item.get("normalizedEnd") or ""),
            str(item.get("eventType")),
        )

    @staticmethod
    def _stable_projection(item: Candidate) -> tuple[Any, ...]:
        return (
            item.get("id"),
            item.get("eventType"),
            item.get("actionType"),
            item.get("normalizedStart"),
            item.get("normalizedEnd"),
            item.get("isAllDay"),
            tuple(item.get("feedScopes") or []),
            item.get("status"),
            item.get("includeInCalendarFeed"),
            tuple(item.get("reasonCodes") or []),
        )


__all__ = [
    "CANDIDATE_RECONCILER_VERSION",
    "CandidateReconciler",
    "ReconciliationReport",
]
