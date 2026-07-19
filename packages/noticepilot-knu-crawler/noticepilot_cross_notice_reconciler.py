#!/usr/bin/env python3
"""S27-B deterministic, fail-closed CrossNoticeReconciler."""
from __future__ import annotations

import itertools
from collections import Counter, defaultdict
from copy import deepcopy
from typing import Any, Iterable

RECONCILER_VERSION = "0.1.1"
DECISION_SCHEMA_VERSION = "noticepilot.crossNoticeRelationDecision.v0.1"
MERGE_PLAN_SCHEMA_VERSION = "noticepilot.crossNoticeMergePlan.v0.1"
MERGE_RELATIONS = {"duplicate", "extension"}


class CrossNoticeReconciliationError(ValueError):
    pass


def _projection(view: dict[str, Any]) -> dict[str, Any]:
    return view["eventProjection"]


def _markers(view: dict[str, Any]) -> set[str]:
    return set(view["titleAnalysis"].get("decorativeMarkers") or [])


def _base_title(view: dict[str, Any]) -> str:
    return str(view["titleAnalysis"].get("relationBaseTitle") or "")


def _campuses(view: dict[str, Any]) -> set[str]:
    return set((_projection(view).get("campusScope") or {}).get("campuses") or [])


def _campus_relation(left: dict[str, Any], right: dict[str, Any]) -> str:
    a, b = _campuses(left), _campuses(right)
    if a == b:
        return "exact"
    if not a or not b or "all" in a or "all" in b:
        return "compatible_global_or_unknown"
    if a & b:
        return "overlap"
    return "disjoint"


def _same_semantic_action_scope(left: dict[str, Any], right: dict[str, Any]) -> bool:
    a, b = _projection(left), _projection(right)
    keys = ["eventType", "actionType", "temporalRole", "targetActor", "audienceRules", "campusScope"]
    return all(a.get(key) == b.get(key) for key in keys)


def _same_duplicate_projection(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return _projection(left) == _projection(right)


def _same_interval(left: dict[str, Any], right: dict[str, Any]) -> bool:
    a, b = _projection(left), _projection(right)
    keys = ["normalizedStart", "normalizedEnd", "endDateInclusive", "isAllDay", "timezone"]
    return all(a.get(key) == b.get(key) for key in keys)


def _publication_order(left: dict[str, Any], right: dict[str, Any]) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    a, b = left.get("publishedAt"), right.get("publishedAt")
    if not a or not b or a == b:
        return None, None
    return (left, right) if a < b else (right, left)


def _later_end_is_later(earlier: dict[str, Any], later: dict[str, Any]) -> bool:
    a, b = _projection(earlier), _projection(later)
    return bool(a.get("normalizedEnd") and b.get("normalizedEnd") and b["normalizedEnd"] > a["normalizedEnd"])


def _canonical_selection_for_duplicate(
    left: dict[str, Any],
    right: dict[str, Any],
    policy: dict[str, Any],
) -> dict[str, Any]:
    li, ri = left["sourceIdentity"], right["sourceIdentity"]
    rules: list[str] = []
    if li["identityKey"] == ri["identityKey"]:
        rules.append("D8.exact_canonical_source_identity")
        if li["boardCanonical"] != ri["boardCanonical"]:
            selected = left if li["boardCanonical"] else right
            return {"status": "resolved", "candidateId": selected["candidateId"], "ruleIds": rules + ["D8.canonical_board_over_alias"]}
    if li["canonicalSourceUrl"] == ri["canonicalSourceUrl"]:
        rules.append("D8.canonical_source_url_equality")
        if li["boardCanonical"] != ri["boardCanonical"]:
            selected = left if li["boardCanonical"] else right
            return {"status": "resolved", "candidateId": selected["candidateId"], "ruleIds": rules + ["D8.canonical_board_over_alias"]}
    precedence = policy["decisions"]["S27A-D8"].get("canonicalRepresentativeBoardPrecedence") or []
    lb, rb = str(li["canonicalBoardId"]), str(ri["canonicalBoardId"])
    direct_edges = {(str(row["higherBoardId"]), str(row["lowerBoardId"])) for row in precedence}
    if (lb, rb) in direct_edges:
        return {"status": "resolved", "candidateId": left["candidateId"], "ruleIds": rules + ["D8.configured_representative_board_precedence"]}
    if (rb, lb) in direct_edges:
        return {"status": "resolved", "candidateId": right["candidateId"], "ruleIds": rules + ["D8.configured_representative_board_precedence"]}
    return {"status": "needs_review", "candidateId": None, "ruleIds": rules + ["D8.unresolved_tie_needs_review"]}


class CrossNoticeReconciler:
    def __init__(self, policy: dict[str, Any]):
        self.policy = deepcopy(policy)
        if self.policy.get("schemaVersion") != "noticepilot.crossNoticeReconciliationPolicy.v0.3":
            raise CrossNoticeReconciliationError("unsupported reconciliation policy")

    def reconcile_pair(
        self,
        left: dict[str, Any],
        right: dict[str, Any],
        *,
        pair_id: str,
    ) -> dict[str, Any]:
        if left["candidateId"] == right["candidateId"]:
            raise CrossNoticeReconciliationError("pair members must be distinct")
        ordered = sorted([left, right], key=lambda row: row["candidateId"])
        left, right = ordered
        lp, rp = _projection(left), _projection(right)
        lm, rm = _markers(left), _markers(right)
        all_markers = lm | rm
        campus = _campus_relation(left, right)
        same_base = _base_title(left) == _base_title(right)
        same_projection = _same_duplicate_projection(left, right)
        same_interval = _same_interval(left, right)
        same_semantic_scope = _same_semantic_action_scope(left, right)
        same_board = left["sourceIdentity"]["canonicalBoardId"] == right["sourceIdentity"]["canonicalBoardId"]
        earlier, later = _publication_order(left, right)

        relation = "needs_review"
        status = "needs_review"
        merge_allowed = False
        rule_ids: list[str] = []
        canonical = {"status": "not_applicable", "candidateId": None, "ruleIds": []}

        if campus == "disjoint":
            relation, status = "distinct", "approved"
            rule_ids.append("D4.campus_disjoint_distinct")
        elif earlier and later and "연장" in _markers(later) and "연장" not in _markers(earlier):
            ep, lproj = _projection(earlier), _projection(later)
            if (
                same_base
                and same_semantic_scope
                and ep.get("normalizedStart") == lproj.get("normalizedStart")
                and _later_end_is_later(earlier, later)
            ):
                relation, status, merge_allowed = "extension", "approved", True
                rule_ids.append("D3.extension.strict_all_conditions")
                canonical = {"status": "resolved", "candidateId": later["candidateId"], "ruleIds": ["D3.extension.later_notice"]}
        if not rule_ids and all_markers & {"추가모집", "마감"}:
            relation, status = "distinct", "approved"
            rule_ids.append("D3.additional_recruitment_or_closed_distinct")
        elif not rule_ids and all_markers & {"대체", "취소"}:
            relation, status = "needs_review", "needs_review"
            rule_ids.append("D3.replacement_or_cancellation.body_reference_unavailable")
        elif not rule_ids and all_markers & {"수정", "정정", "변경"}:
            relation, status = "needs_review", "needs_review"
            rule_ids.append("D3.initial_revision_automatic_disabled")
        elif not rule_ids and all_markers & {"재공지", "재안내"} and same_projection:
            relation, status = "duplicate", "approved"
            rule_ids.append("D3.repost_exact_projection_duplicate")
            canonical = _canonical_selection_for_duplicate(left, right, self.policy)
            merge_allowed = canonical["status"] == "resolved"
        elif not rule_ids and same_base and not same_interval:
            relation, status = "distinct", "approved"
            rule_ids.append("D1.same_title_different_window_distinct")
        elif not rule_ids and left["sourceIdentity"]["identityKey"] == right["sourceIdentity"]["identityKey"] and same_projection:
            relation, status = "duplicate", "approved"
            rule_ids.append("D8.same_canonical_source_identity_same_projection")
            canonical = _canonical_selection_for_duplicate(left, right, self.policy)
            merge_allowed = canonical["status"] == "resolved"
        elif not rule_ids and not same_board and same_base and same_projection and same_semantic_scope and campus != "disjoint" and not all_markers:
            relation, status = "duplicate", "approved"
            rule_ids.append("D2.cross_board_duplicate_all_conditions")
            canonical = _canonical_selection_for_duplicate(left, right, self.policy)
            merge_allowed = canonical["status"] == "resolved"
        elif not rule_ids:
            relation, status = "needs_review", "needs_review"
            rule_ids.append("fail_closed.insufficient_direct_relation_evidence")

        return {
            "schemaVersion": DECISION_SCHEMA_VERSION,
            "pairId": pair_id,
            "candidateIds": [left["candidateId"], right["candidateId"]],
            "sourceNoticeIds": [left["sourceNoticeId"], right["sourceNoticeId"]],
            "relation": relation,
            "decisionStatus": status,
            "mergeAllowed": merge_allowed,
            "canonicalSelection": canonical,
            "ruleIds": rule_ids,
            "evidence": {
                "sameBaseTitle": same_base,
                "sameEventProjection": same_projection,
                "sameInterval": same_interval,
                "sameSemanticActionScope": same_semantic_scope,
                "campusRelation": campus,
                "sameCanonicalBoard": same_board,
                "sameCanonicalSourceIdentity": left["sourceIdentity"]["identityKey"] == right["sourceIdentity"]["identityKey"],
                "publicationOrderKnown": earlier is not None,
                "decorativeMarkers": sorted(all_markers),
            },
            "runtimeMutationPerformed": False,
            "calendarEventIdAssigned": False,
            "icsMutationPerformed": False,
        }


def build_merge_plans(
    views: Iterable[dict[str, Any]],
    decisions: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    views_by_id = {row["candidateId"]: row for row in views}
    merge_edges = [row for row in decisions if row["relation"] in MERGE_RELATIONS and row["mergeAllowed"]]
    adjacency: dict[str, set[str]] = defaultdict(set)
    decision_by_edge: dict[frozenset[str], dict[str, Any]] = {}
    for decision in merge_edges:
        a, b = decision["candidateIds"]
        adjacency[a].add(b)
        adjacency[b].add(a)
        decision_by_edge[frozenset((a, b))] = decision
    seen: set[str] = set()
    plans: list[dict[str, Any]] = []
    for start in sorted(adjacency):
        if start in seen:
            continue
        stack, members = [start], set()
        while stack:
            current = stack.pop()
            if current in members:
                continue
            members.add(current)
            stack.extend(adjacency[current] - members)
        seen |= members
        expected_edges = {frozenset(pair) for pair in itertools.combinations(sorted(members), 2)}
        actual_edges = {edge for edge in decision_by_edge if edge <= members}
        complete = expected_edges == actual_edges
        canonical_ids = {
            decision_by_edge[edge]["canonicalSelection"]["candidateId"]
            for edge in actual_edges
            if decision_by_edge[edge]["canonicalSelection"]["candidateId"]
        }
        status = "approved" if complete and len(canonical_ids) == 1 else "needs_review"
        plans.append({
            "schemaVersion": MERGE_PLAN_SCHEMA_VERSION,
            "memberCandidateIds": sorted(members),
            "decisionPairIds": sorted(decision_by_edge[edge]["pairId"] for edge in actual_edges),
            "pairwiseComplete": complete,
            "canonicalCandidateId": next(iter(canonical_ids)) if status == "approved" else None,
            "status": status,
            "ruleIds": ["D6.complete_pairwise_evidence"] if complete else ["D6.transitive_or_incomplete_graph_needs_review"],
            "calendarEventIdAssigned": False,
        })
    return plans


def decision_counts(decisions: Iterable[dict[str, Any]]) -> dict[str, int]:
    rows = list(decisions)
    relations = Counter(row["relation"] for row in rows)
    return {
        "decisionCount": len(rows),
        **{f"relation_{key}": relations.get(key, 0) for key in ["distinct", "duplicate", "revision", "extension", "replacement", "needs_review"]},
        "mergeAllowedCount": sum(row["mergeAllowed"] for row in rows),
        "canonicalSelectionNeedsReviewCount": sum(
            row["relation"] == "duplicate" and row["canonicalSelection"]["status"] == "needs_review"
            for row in rows
        ),
    }
