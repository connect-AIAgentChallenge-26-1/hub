#!/usr/bin/env python3
"""S27-A diagnostic-only cross-notice CalendarEvent identity analysis.

This module deliberately produces retrieval candidates and evidence vectors only.
It never assigns a CalendarEventId and never decides a relation.
"""
from __future__ import annotations

import hashlib
import itertools
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

DIAGNOSTIC_VERSION = "0.1.1"
PAIR_SCHEMA_VERSION = "noticepilot.crossNoticePairDiagnostic.v0.2"
CLUSTER_SCHEMA_VERSION = "noticepilot.crossNoticeClusterDiagnostic.v0.2"
IDENTITY_DRAFT_SCHEMA_VERSION = "noticepilot.calendarEventIdentityDraft.v0.2"
RELATIONS = ["distinct", "duplicate", "revision", "extension", "replacement", "needs_review"]

_MARKER_PATTERN = re.compile(
    r"^\s*(?:[\[(（]\s*)?(수정|변경|정정|연장|재공지|재안내|추가모집|추가 모집|취소|대체|마감|긴급)"
    r"(?:\s*[\])）])?\s*[:：-]?\s*",
    re.IGNORECASE,
)
_DATE_PATTERN = re.compile(
    r"(?:20\d{2}\s*[.년/-]\s*)?\d{1,2}\s*[.월/-]\s*\d{1,2}\s*(?:일|\.)?"
    r"|20\d{2}\s*학년도|20\d{2}\s*[-년]\s*\d\s*학기|\d{1,2}\s*/\s*\d{1,2}"
)
_MARKER_ANY_PATTERN = re.compile(r"수정|변경|정정|연장|재공지|재안내|추가\s*모집|취소|대체|마감", re.IGNORECASE)
_NON_TOKEN = re.compile(r"[^0-9a-z가-힣]+")
_STOP_TOKENS = {"강원대학교", "강원대", "공지", "공고", "안내", "관련", "및"}


def _hash(prefix: str, value: Any, size: int = 16) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return f"{prefix}-{hashlib.sha256(payload).hexdigest()[:size]}"


def normalize_text(text: str) -> str:
    value = unicodedata.normalize("NFKC", str(text or "")).lower().strip()
    return " ".join(_NON_TOKEN.sub(" ", value).split())


def strip_leading_revision_marker(text: str) -> str:
    value = unicodedata.normalize("NFKC", str(text or ""))
    prior = None
    while prior != value:
        prior = value
        value = _MARKER_PATTERN.sub("", value)
    return value.strip()


def leading_revision_marker(text: str) -> str | None:
    match = _MARKER_PATTERN.match(unicodedata.normalize("NFKC", str(text or "")))
    return match.group(1).replace(" ", "") if match else None


def revision_markers(text: str) -> list[str]:
    value = unicodedata.normalize("NFKC", str(text or ""))
    return sorted({match.group(0).replace(" ", "") for match in _MARKER_ANY_PATTERN.finditer(value)})


def temporal_stripped_title(text: str) -> str:
    return _DATE_PATTERN.sub(" ", strip_leading_revision_marker(text))


def title_tokens(text: str) -> set[str]:
    return {
        token
        for token in normalize_text(temporal_stripped_title(text)).split()
        if len(token) > 1 and token not in _STOP_TOKENS and not token.isdigit()
    }


def semantic_key(candidate: dict[str, Any]) -> tuple[str, str]:
    return (str(candidate.get("eventType") or ""), str(candidate.get("actionType") or ""))


def campus_values(candidate: dict[str, Any]) -> set[str]:
    return set((candidate.get("campusScope") or {}).get("campuses") or [])


def campus_relation(a: dict[str, Any], b: dict[str, Any]) -> str:
    left, right = campus_values(a), campus_values(b)
    if left == right:
        return "exact"
    if not left or not right or "all" in left or "all" in right:
        return "global_or_unknown_compatible"
    if left & right:
        return "overlap"
    return "disjoint"


def audience_relation(a: dict[str, Any], b: dict[str, Any]) -> str:
    if a.get("targetActor") != b.get("targetActor"):
        return "disjoint"
    if (a.get("audienceRules") or {}) == (b.get("audienceRules") or {}):
        return "exact"
    return "same_actor_different_rules"


def _jaccard(left: set[str], right: set[str]) -> float:
    union = left | right
    return round(len(left & right) / len(union), 6) if union else 0.0


def _summary(candidate: dict[str, Any], notice: dict[str, Any], content_hash: str) -> dict[str, Any]:
    title = str(candidate.get("sourceTitle") or "")
    return {
        "candidateId": candidate.get("id"),
        "sourceNoticeId": candidate.get("sourceNoticeId"),
        "boardId": notice.get("boardId"),
        "publishedAt": notice.get("publishedAt"),
        "sourceUrl": notice.get("sourceUrl"),
        "sourceTitle": title,
        "sourceContentHash": content_hash,
        "eventType": candidate.get("eventType"),
        "actionType": candidate.get("actionType"),
        "targetActor": candidate.get("targetActor"),
        "campuses": sorted(campus_values(candidate)),
        "normalizedStart": candidate.get("normalizedStart"),
        "normalizedEnd": candidate.get("normalizedEnd"),
        "isAllDay": candidate.get("isAllDay"),
        "leadingRevisionMarker": leading_revision_marker(title),
        "revisionMarkers": revision_markers(title),
        "normalizedTitle": normalize_text(title),
        "revisionStrippedTitle": normalize_text(strip_leading_revision_marker(title)),
        "temporalStrippedTitle": normalize_text(temporal_stripped_title(title)),
        "titleTokens": sorted(title_tokens(title)),
    }


def diagnose_pair(
    left: dict[str, Any],
    right: dict[str, Any],
    notice_by_id: dict[str, dict[str, Any]],
    content_hash_by_notice: dict[str, str],
) -> dict[str, Any] | None:
    if left.get("sourceNoticeId") == right.get("sourceNoticeId"):
        return None
    left_notice = notice_by_id[str(left.get("sourceNoticeId"))]
    right_notice = notice_by_id[str(right.get("sourceNoticeId"))]
    left_summary = _summary(left, left_notice, content_hash_by_notice[str(left.get("sourceNoticeId"))])
    right_summary = _summary(right, right_notice, content_hash_by_notice[str(right.get("sourceNoticeId"))])
    left_tokens = set(left_summary["titleTokens"])
    right_tokens = set(right_summary["titleTokens"])
    similarity = _jaccard(left_tokens, right_tokens)
    same_semantic = semantic_key(left) == semantic_key(right)
    campus = campus_relation(left, right)
    audience = audience_relation(left, right)
    compatible = campus != "disjoint" and audience != "disjoint"
    same_interval = (
        left.get("normalizedStart"), left.get("normalizedEnd"), left.get("isAllDay")
    ) == (
        right.get("normalizedStart"), right.get("normalizedEnd"), right.get("isAllDay")
    )
    extension_shape = bool(
        left.get("normalizedStart")
        and left.get("normalizedStart") == right.get("normalizedStart")
        and left.get("normalizedEnd")
        and right.get("normalizedEnd")
        and left.get("normalizedEnd") != right.get("normalizedEnd")
    )
    marker_present = bool(left_summary["revisionMarkers"] or right_summary["revisionMarkers"])
    high: list[str] = []
    medium: list[str] = []
    if left_summary["sourceContentHash"] == right_summary["sourceContentHash"]:
        high.append("same_source_content_hash")
    if left_summary["normalizedTitle"] == right_summary["normalizedTitle"] and same_semantic and compatible:
        high.append("exact_normalized_title_same_semantic")
    if (
        left_summary["revisionStrippedTitle"] == right_summary["revisionStrippedTitle"]
        and same_semantic and compatible and marker_present
    ):
        high.append("revision_stripped_title_with_marker")
    if same_interval and same_semantic and compatible and similarity >= 0.6:
        high.append("same_interval_semantic_high_title_overlap")
    if extension_shape and same_semantic and compatible and marker_present and similarity >= 0.5:
        high.append("extension_shape_with_marker")
    if not high:
        if left_summary["temporalStrippedTitle"] == right_summary["temporalStrippedTitle"] and same_semantic and compatible:
            medium.append("exact_temporal_stripped_title")
        if same_semantic and compatible and similarity >= 0.72 and len(left_tokens & right_tokens) >= 3:
            medium.append("high_title_overlap_same_semantic")
        if same_interval and same_semantic and compatible and similarity >= 0.4:
            medium.append("same_interval_semantic_title_overlap")
        if marker_present and same_semantic and compatible and similarity >= 0.45 and len(left_tokens & right_tokens) >= 2:
            medium.append("marker_semantic_title_overlap")
    reasons = high or medium
    if not reasons:
        return None
    ordered = sorted([left_summary, right_summary], key=lambda row: str(row["candidateId"]))
    return {
        "schemaVersion": PAIR_SCHEMA_VERSION,
        "pairId": _hash("xnpair", [row["candidateId"] for row in ordered]),
        "diagnosticTier": "high_signal" if high else "medium_signal",
        "relationDecision": {
            "status": "policy_approved_execution_deferred",
            "policyVersion": "noticepilot.crossNoticeReconciliationPolicy.v0.3",
            "relation": None,
            "allowedRelations": RELATIONS,
            "automaticMutationAllowed": False,
        },
        "retrievalReasons": reasons,
        "signals": {
            "titleTokenJaccard": similarity,
            "sharedTitleTokens": sorted(left_tokens & right_tokens),
            "sameNormalizedTitle": left_summary["normalizedTitle"] == right_summary["normalizedTitle"],
            "sameRevisionStrippedTitle": left_summary["revisionStrippedTitle"] == right_summary["revisionStrippedTitle"],
            "sameTemporalStrippedTitle": left_summary["temporalStrippedTitle"] == right_summary["temporalStrippedTitle"],
            "sameSourceContentHash": left_summary["sourceContentHash"] == right_summary["sourceContentHash"],
            "sameSemanticKey": same_semantic,
            "sameNormalizedInterval": same_interval,
            "sameStartDifferentEnd": extension_shape,
            "campusRelation": campus,
            "audienceRelation": audience,
            "sameBoard": left_summary["boardId"] == right_summary["boardId"],
            "revisionMarkerPresent": marker_present,
            "publicationOrderKnown": bool(left_summary["publishedAt"] and right_summary["publishedAt"]),
        },
        "candidates": ordered,
    }


def diagnose_pairs(
    candidates: list[dict[str, Any]],
    notice_by_id: dict[str, dict[str, Any]],
    content_hash_by_notice: dict[str, str],
) -> list[dict[str, Any]]:
    rows = [
        row
        for left, right in itertools.combinations(candidates, 2)
        if (row := diagnose_pair(left, right, notice_by_id, content_hash_by_notice)) is not None
    ]
    rows.sort(key=lambda row: (row["diagnosticTier"], row["pairId"]))
    return rows


def diagnose_clusters(pairs: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    pairs = list(pairs)
    adjacency: dict[str, set[str]] = defaultdict(set)
    pair_by_edge: dict[frozenset[str], str] = {}
    member_summary: dict[str, dict[str, Any]] = {}
    for pair in pairs:
        left, right = pair["candidates"]
        a, b = str(left["candidateId"]), str(right["candidateId"])
        adjacency[a].add(b)
        adjacency[b].add(a)
        pair_by_edge[frozenset((a, b))] = str(pair["pairId"])
        member_summary[a] = left
        member_summary[b] = right
    seen: set[str] = set()
    clusters: list[dict[str, Any]] = []
    for start in sorted(adjacency):
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        members: list[str] = []
        while stack:
            node = stack.pop()
            members.append(node)
            for neighbor in sorted(adjacency[node]):
                if neighbor not in seen:
                    seen.add(neighbor)
                    stack.append(neighbor)
        member_set = set(members)
        pair_ids = sorted(
            pair["pairId"]
            for pair in pairs
            if {row["candidateId"] for row in pair["candidates"]}.issubset(member_set)
        )
        ordered_members = [member_summary[key] for key in sorted(members)]
        clusters.append({
            "schemaVersion": CLUSTER_SCHEMA_VERSION,
            "clusterId": _hash("xncluster", sorted(members)),
            "status": "diagnostic_only_policy_approved_execution_deferred",
            "automaticMergeAllowed": False,
            "candidateCount": len(members),
            "sourceNoticeCount": len({row["sourceNoticeId"] for row in ordered_members}),
            "pairIds": pair_ids,
            "members": ordered_members,
            "transitivityWarning": len(pair_ids) < (len(members) * (len(members) - 1) // 2),
        })
    clusters.sort(key=lambda row: (-row["candidateCount"], row["clusterId"]))
    return clusters


def stable_id_strategy_draft(candidates: list[dict[str, Any]]) -> dict[str, Any]:
    def semantic_material(candidate: dict[str, Any]) -> list[Any]:
        return [
            "knu",
            normalize_text(temporal_stripped_title(str(candidate.get("sourceTitle") or ""))),
            candidate.get("eventType"),
            candidate.get("actionType"),
            sorted(campus_values(candidate)),
            candidate.get("targetActor"),
        ]

    semantic_groups: dict[str, list[str]] = defaultdict(list)
    for candidate in candidates:
        preview = _hash("evt-semantic-draft", semantic_material(candidate), 20)
        semantic_groups[preview].append(str(candidate.get("id")))
    multi = {key: value for key, value in semantic_groups.items() if len(value) > 1}
    return {
        "schemaVersion": IDENTITY_DRAFT_SCHEMA_VERSION,
        "status": "strategy_approved_registry_not_created",
        "selectedStrategy": "registry_assigned_opaque_v0",
        "policyVersion": "noticepilot.crossNoticeReconciliationPolicy.v0.3",
        "calendarEventIdAssigned": False,
        "dateExcludedFromIdentityMaterial": True,
        "options": [
            {
                "id": "source_anchored_v0",
                "description": "Opaque ID derived from the first approved canonical candidate; later approved revisions reuse it.",
                "advantages": ["lowest accidental merge risk", "stable across date changes"],
                "risks": ["pre-existing duplicates require alias/merge records", "first-source choice becomes historical anchor"],
            },
            {
                "id": "semantic_hash_v0",
                "description": "Hash institution, normalized subject title, semantic key, campus, and actor; exclude dates.",
                "advantages": ["deterministic before persistence", "can converge cross-board duplicates"],
                "risks": ["recurring events with identical titles may collide", "normalizer changes can alter IDs"],
                "diagnosticPreview": {
                    "uniquePreviewIdCount": len(semantic_groups),
                    "multiCandidatePreviewIdCount": len(multi),
                    "maxCandidatesPerPreviewId": max((len(value) for value in semantic_groups.values()), default=0),
                },
            },
            {
                "id": "registry_assigned_opaque_v0",
                "description": "Assign an opaque ID only after a relation decision is approved and persisted.",
                "advantages": ["identity policy is decoupled from normalization", "supports explicit aliases and splits"],
                "risks": ["requires persistent registry before incremental runtime", "not independently reproducible from one candidate"],
            },
        ],
    }


def diagnostic_counts(pairs: list[dict[str, Any]], clusters: list[dict[str, Any]], total_candidates: int) -> dict[str, Any]:
    candidate_ids = {
        row["candidateId"]
        for pair in pairs
        for row in pair["candidates"]
    }
    retrieval = Counter(reason for pair in pairs for reason in pair["retrievalReasons"])
    signal_counts = Counter()
    for pair in pairs:
        for key, value in pair["signals"].items():
            if value is True:
                signal_counts[key] += 1
    return {
        "publishableCandidateCount": total_candidates,
        "diagnosticPairCount": len(pairs),
        "highSignalPairCount": sum(pair["diagnosticTier"] == "high_signal" for pair in pairs),
        "mediumSignalPairCount": sum(pair["diagnosticTier"] == "medium_signal" for pair in pairs),
        "diagnosticClusterCount": len(clusters),
        "pairedCandidateCount": len(candidate_ids),
        "unpairedCandidateCount": total_candidates - len(candidate_ids),
        "maxClusterCandidateCount": max((row["candidateCount"] for row in clusters), default=0),
        "transitiveClusterWarningCount": sum(bool(row["transitivityWarning"]) for row in clusters),
        "retrievalReasonCounts": dict(sorted(retrieval.items())),
        "booleanSignalCounts": dict(sorted(signal_counts.items())),
    }
