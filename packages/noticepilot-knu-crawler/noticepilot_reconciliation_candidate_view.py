#!/usr/bin/env python3
"""Consumer-owned ReconciliationCandidateView projection for S27-B.

The view joins a publishable candidate with immutable notice and source-board
metadata. It does not mutate the producer candidate and it does not issue a
CalendarEventId.
"""
from __future__ import annotations

import json
import re
from copy import deepcopy
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qs, urlparse

from noticepilot_cross_notice_diagnostics import (
    leading_revision_marker,
    normalize_text,
    revision_markers,
    strip_leading_revision_marker,
    temporal_stripped_title,
    title_tokens,
)

VIEW_SCHEMA_VERSION = "noticepilot.reconciliationCandidateView.v0.1"
SOURCE_IDENTITY_SCHEMA_VERSION = "noticepilot.canonicalSourceIdentity.v0.1"
_SOURCE_NOTICE_ID = re.compile(r"^knu-(?P<board>[^-]+)-(?P<post>.+)$")
_DECORATIVE_MARKER = re.compile(
    r"(?:^\s*(?:[\[(（]\s*)?(수정|변경|정정|연장|재공지|재안내|추가\s*모집|취소|대체|마감)(?:\s*[\])）])?\s*[:：-]?\s*)"
    r"|(?:\s*(?:[-–—:]\s*)?[\[(（]?\s*(수정|변경|정정|연장|재공지|재안내|추가\s*모집|취소|대체|마감)\s*[\])）]?\s*$)",
    re.IGNORECASE,
)


class ReconciliationViewError(ValueError):
    pass


def load_board_registry(path: Path) -> list[dict[str, Any]]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list):
        raise ReconciliationViewError("board registry must be a list")
    return value


def board_registry_indexes(rows: Iterable[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[str, str]]:
    by_id: dict[str, dict[str, Any]] = {}
    alias_to_canonical: dict[str, str] = {}
    for raw in rows:
        row = deepcopy(raw)
        board_id = str(row.get("boardId") or "")
        if not board_id:
            raise ReconciliationViewError("board registry row requires boardId")
        if board_id in by_id:
            raise ReconciliationViewError(f"duplicate boardId: {board_id}")
        by_id[board_id] = row
    for board_id, row in by_id.items():
        if row.get("canonical") is not True:
            continue
        for alias in row.get("aliasBoardIds") or []:
            alias = str(alias)
            if alias in alias_to_canonical and alias_to_canonical[alias] != board_id:
                raise ReconciliationViewError(f"alias {alias} maps to multiple canonical boards")
            alias_to_canonical[alias] = board_id
    return by_id, alias_to_canonical


def _source_parts(source_notice_id: str, observed_url: str | None) -> tuple[str, str]:
    match = _SOURCE_NOTICE_ID.match(source_notice_id)
    if not match:
        raise ReconciliationViewError(f"unsupported sourceNoticeId: {source_notice_id}")
    board_id = match.group("board")
    source_post_id = match.group("post")
    if observed_url:
        query_post = (parse_qs(urlparse(observed_url).query).get("pstSn") or [None])[0]
        if query_post is not None and str(query_post) != source_post_id:
            raise ReconciliationViewError(
                f"sourceNoticeId/sourceUrl pstSn mismatch: {source_notice_id} vs {query_post}"
            )
    return board_id, source_post_id


def _canonical_source_url(canonical_board_id: str, source_post_id: str) -> str:
    return (
        f"https://www.kangwon.ac.kr/ko/bbs/{canonical_board_id}/detail.do"
        f"?pstSn={source_post_id}"
    )


def build_canonical_source_identity(
    notice: dict[str, Any],
    board_registry: list[dict[str, Any]],
) -> dict[str, Any]:
    by_id, alias_to_canonical = board_registry_indexes(board_registry)
    source_notice_id = str(notice.get("sourceNoticeId") or "")
    observed_url = notice.get("sourceUrl")
    observed_board_id, source_post_id = _source_parts(source_notice_id, observed_url)
    canonical_board_id = alias_to_canonical.get(observed_board_id, observed_board_id)
    board = by_id.get(canonical_board_id)
    if board is None:
        raise ReconciliationViewError(f"board {observed_board_id} is not registered")
    if board.get("canonical") is not True:
        raise ReconciliationViewError(f"resolved board {canonical_board_id} is not canonical")
    category = str(board.get("category") or "")
    if not category:
        raise ReconciliationViewError(f"canonical board {canonical_board_id} requires category")
    identity_key = f"kangwon|{category}|{source_post_id}"
    return {
        "schemaVersion": SOURCE_IDENTITY_SCHEMA_VERSION,
        "institutionId": "kangwon",
        "identityKey": identity_key,
        "canonicalBoardCategory": category,
        "sourcePostId": source_post_id,
        "observedBoardId": observed_board_id,
        "canonicalBoardId": canonical_board_id,
        "boardCanonical": observed_board_id == canonical_board_id,
        "aliasBoardIds": sorted(str(value) for value in (board.get("aliasBoardIds") or [])),
        "observedSourceUrl": observed_url,
        "canonicalSourceUrl": _canonical_source_url(canonical_board_id, source_post_id),
    }


def decorative_revision_markers(text: str) -> list[str]:
    values: set[str] = set()
    for match in _DECORATIVE_MARKER.finditer(str(text or "")):
        marker = match.group(1) or match.group(2)
        if marker:
            values.add(marker.replace(" ", ""))
    return sorted(values)


def relation_base_title(text: str) -> str:
    value = str(text or "")
    prior = None
    while prior != value:
        prior = value
        value = _DECORATIVE_MARKER.sub(" ", value)
    return normalize_text(value)


def _timezone(candidate: dict[str, Any]) -> str | None:
    mention = candidate.get("temporalMention") or {}
    return mention.get("timezone")


def event_projection(candidate: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": candidate.get("title"),
        "eventType": candidate.get("eventType"),
        "actionType": candidate.get("actionType"),
        "temporalRole": candidate.get("temporalRole"),
        "targetActor": candidate.get("targetActor"),
        "audienceRules": deepcopy(candidate.get("audienceRules") or {}),
        "campusScope": deepcopy(candidate.get("campusScope") or {}),
        "normalizedStart": candidate.get("normalizedStart"),
        "normalizedEnd": candidate.get("normalizedEnd"),
        "endDateInclusive": candidate.get("endDateInclusive"),
        "isAllDay": candidate.get("isAllDay"),
        "timezone": _timezone(candidate),
        "feedScopes": sorted(str(value) for value in (candidate.get("feedScopes") or [])),
    }


def build_reconciliation_candidate_view(
    candidate: dict[str, Any],
    notice: dict[str, Any],
    board_registry: list[dict[str, Any]],
) -> dict[str, Any]:
    if candidate.get("sourceNoticeId") != notice.get("sourceNoticeId"):
        raise ReconciliationViewError("candidate and notice sourceNoticeId must match")
    source_title = str(candidate.get("sourceTitle") or notice.get("title") or "")
    if not source_title:
        raise ReconciliationViewError("source title is required")
    source_identity = build_canonical_source_identity(notice, board_registry)
    projection = event_projection(candidate)
    view = {
        "schemaVersion": VIEW_SCHEMA_VERSION,
        "candidateId": candidate.get("id"),
        "sourceNoticeId": candidate.get("sourceNoticeId"),
        "sourceIdentity": source_identity,
        "publishedAt": notice.get("publishedAt"),
        "sourceTitle": source_title,
        "titleAnalysis": {
            "normalizedTitle": normalize_text(source_title),
            "baseTitle": normalize_text(strip_leading_revision_marker(source_title)),
            "relationBaseTitle": relation_base_title(source_title),
            "temporalStrippedBaseTitle": normalize_text(temporal_stripped_title(source_title)),
            "leadingMarker": leading_revision_marker(source_title),
            "markers": revision_markers(source_title),
            "decorativeMarkers": decorative_revision_markers(source_title),
            "tokens": sorted(title_tokens(source_title)),
        },
        "sourceContentHash": notice.get("sourceContentHash"),
        "eventProjection": projection,
        "candidateState": {
            "status": candidate.get("status"),
            "includeInCalendarFeed": candidate.get("includeInCalendarFeed"),
            "confidence": candidate.get("confidence"),
            "reasonCodes": sorted(str(value) for value in (candidate.get("reasonCodes") or [])),
            "publishabilityVerdict": (candidate.get("publishabilityJudgment") or {}).get("verdict"),
        },
    }
    validate_reconciliation_candidate_view(view)
    return view


def validate_reconciliation_candidate_view(view: dict[str, Any]) -> None:
    required = {
        "schemaVersion",
        "candidateId",
        "sourceNoticeId",
        "sourceIdentity",
        "publishedAt",
        "sourceTitle",
        "titleAnalysis",
        "sourceContentHash",
        "eventProjection",
        "candidateState",
    }
    if set(view) != required:
        raise ReconciliationViewError(f"unexpected view keys: {sorted(set(view) ^ required)}")
    if view["schemaVersion"] != VIEW_SCHEMA_VERSION:
        raise ReconciliationViewError("invalid view schemaVersion")
    if not view["candidateId"] or not view["sourceNoticeId"]:
        raise ReconciliationViewError("candidateId and sourceNoticeId are required")
    identity = view["sourceIdentity"]
    expected_identity = (
        f"{identity['institutionId']}|{identity['canonicalBoardCategory']}|{identity['sourcePostId']}"
    )
    if identity.get("identityKey") != expected_identity:
        raise ReconciliationViewError("source identityKey does not match its components")
    projection = view["eventProjection"]
    if not projection.get("eventType") or not projection.get("normalizedStart"):
        raise ReconciliationViewError("publishable reconciliation view requires eventType and normalizedStart")
    if view["candidateState"].get("includeInCalendarFeed") is not True:
        raise ReconciliationViewError("S27-B view accepts publishable candidates only")
