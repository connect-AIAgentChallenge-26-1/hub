#!/usr/bin/env python3
"""Shared canonicalization helpers for NoticePilot policy baselines."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

BASELINE_SCHEMA_VERSION = "noticepilot.policyBaseline.v0.1"
REGRESSION_CASE_SCHEMA_VERSION = "noticepilot.regressionCase.v0.1"
DIFF_REPORT_SCHEMA_VERSION = "noticepilot.policyBaselineDiff.v0.1"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line_number, line in enumerate(f, start=1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"invalid JSONL at {path}:{line_number}: {exc}") from exc
            if not isinstance(value, dict):
                raise ValueError(f"expected object at {path}:{line_number}")
            rows.append(value)
    return rows


def candidate_projection(candidate: dict[str, Any]) -> dict[str, Any]:
    source_segment = candidate.get("sourceSegment") or {}
    source_location = source_segment.get("sourceLocation") or {}
    audience = candidate.get("audienceRules") or {}
    return {
        "id": candidate.get("id"),
        "sourceNoticeId": candidate.get("sourceNoticeId"),
        "eventType": candidate.get("eventType"),
        "actionType": candidate.get("actionType"),
        "targetActor": candidate.get("targetActor"),
        "feedScopes": sorted(candidate.get("feedScopes") or []),
        "normalizedStart": candidate.get("normalizedStart"),
        "normalizedEnd": candidate.get("normalizedEnd"),
        "endDateInclusive": candidate.get("endDateInclusive"),
        "isAllDay": candidate.get("isAllDay"),
        "status": candidate.get("status"),
        "includeInCalendarFeed": candidate.get("includeInCalendarFeed"),
        "audienceRules": {
            "degreeLevels": sorted(audience.get("degreeLevels") or []),
            "studentYears": sorted(audience.get("studentYears") or []),
            "enrollmentStatuses": sorted(audience.get("enrollmentStatuses") or []),
            "admissionTypes": sorted(audience.get("admissionTypes") or []),
            "personalizationReady": bool(audience.get("personalizationReady")),
        },
        "sourceSegment": {
            "segmentId": source_segment.get("segmentId"),
            "segmentType": source_segment.get("segmentType"),
            "labelText": source_segment.get("labelText"),
            "parentSegmentId": source_location.get("parentSegmentId"),
        },
        "reasonCodes": sorted(candidate.get("reasonCodes") or []),
    }


def decision_projection(decision: dict[str, Any]) -> dict[str, Any]:
    candidates = sorted(
        (candidate_projection(candidate) for candidate in decision.get("candidates") or []),
        key=lambda row: (
            str(row.get("id") or ""),
            str(row.get("eventType") or ""),
            str(row.get("normalizedStart") or ""),
        ),
    )
    return {
        "sourceNoticeId": decision.get("sourceNoticeId"),
        "disposition": decision.get("disposition"),
        "reasonCodes": sorted(decision.get("reasonCodes") or []),
        "candidateProjections": candidates,
    }


def canonical_publishable(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        (candidate_projection(row) for row in rows),
        key=lambda row: (str(row.get("id") or ""), str(row.get("sourceNoticeId") or "")),
    )


def canonical_review(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        (decision_projection(row) for row in rows),
        key=lambda row: str(row.get("sourceNoticeId") or ""),
    )


def canonical_summary(summary: dict[str, Any]) -> dict[str, Any]:
    source = summary.get("source") or {}
    return {
        "schemaVersion": summary.get("schemaVersion"),
        "pipelineVersion": summary.get("pipelineVersion"),
        "policyVersion": summary.get("policyVersion"),
        "source": {
            "indexNoticeCount": source.get("indexNoticeCount"),
            "processedNoticeCount": source.get("processedNoticeCount"),
            "missingNormalizedCount": source.get("missingNormalizedCount"),
            "missingNormalizedNoticeIds": source.get("missingNormalizedNoticeIds") or [],
            "boardsFilter": source.get("boardsFilter") or [],
            "limit": source.get("limit"),
        },
        "noticeCount": summary.get("noticeCount"),
        "dispositionCounts": summary.get("dispositionCounts") or {},
        "candidateCount": summary.get("candidateCount"),
        "candidateStatusCounts": summary.get("candidateStatusCounts") or {},
        "feedCandidateCounts": summary.get("feedCandidateCounts") or {},
        "eventTypeCounts": summary.get("eventTypeCounts") or {},
        "actionTypeCounts": summary.get("actionTypeCounts") or {},
        "personalizationReadyCandidateCount": summary.get("personalizationReadyCandidateCount"),
        "studentYearScopedCandidateCount": summary.get("studentYearScopedCandidateCount"),
        "structuredSegmentCandidateCount": summary.get("structuredSegmentCandidateCount"),
        "locallyGroundedCandidateCount": summary.get("locallyGroundedCandidateCount"),
        "sourceSegmentTypeCounts": summary.get("sourceSegmentTypeCounts") or {},
        "rangeCandidateCount": summary.get("rangeCandidateCount"),
        "relativeDateCandidateCount": summary.get("relativeDateCandidateCount"),
        "boardDispositionCounts": summary.get("boardDispositionCounts") or {},
        "reasonCodeCounts": summary.get("reasonCodeCounts") or {},
    }


def canonical_ics_report(report: dict[str, Any]) -> dict[str, Any]:
    exported = []
    for event in report.get("exportedEvents") or []:
        exported.append({
            "candidateId": event.get("candidateId"),
            "uid": event.get("uid"),
            "sourceNoticeId": event.get("sourceNoticeId"),
            "title": event.get("title"),
            "normalizedStart": event.get("normalizedStart"),
            "normalizedEnd": event.get("normalizedEnd"),
            "endDateInclusive": event.get("endDateInclusive"),
            "isAllDay": event.get("isAllDay"),
            "status": event.get("status"),
            "campusScope": event.get("campusScope"),
        })
    exported.sort(key=lambda row: (str(row.get("uid") or ""), str(row.get("candidateId") or "")))
    return {
        "schemaVersion": report.get("schemaVersion"),
        "exporterVersion": report.get("exporterVersion"),
        "calendarName": report.get("calendarName"),
        "timezone": report.get("timezone"),
        "timedEventMode": report.get("timedEventMode"),
        "availability": report.get("availability"),
        "inputCandidateFileCount": report.get("inputCandidateFileCount"),
        "eventCount": report.get("eventCount"),
        "skippedCount": report.get("skippedCount"),
        "exportedEvents": exported,
        "skippedCandidates": report.get("skippedCandidates") or [],
    }


def unfold_ics(path: Path) -> list[str]:
    raw = path.read_bytes()
    # RFC 5545 requires CRLF, but tolerate LF while producing a semantic baseline.
    text = raw.decode("utf-8")
    lines = text.replace("\r\n", "\n").split("\n")
    unfolded: list[str] = []
    for line in lines:
        if line.startswith((" ", "\t")) and unfolded:
            unfolded[-1] += line[1:]
        else:
            unfolded.append(line)
    return unfolded


def canonical_ics_events(path: Path) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    current: list[str] | None = None
    for line in unfold_ics(path):
        if line == "BEGIN:VEVENT":
            current = []
            continue
        if line == "END:VEVENT" and current is not None:
            props: dict[str, list[str]] = {}
            for prop in current:
                if ":" not in prop:
                    continue
                key, value = prop.split(":", 1)
                if key == "DTSTAMP":
                    continue
                props.setdefault(key, []).append(value)
            events.append({key: values if len(values) > 1 else values[0] for key, values in sorted(props.items())})
            current = None
            continue
        if current is not None:
            current.append(line)
    events.sort(key=lambda event: str(event.get("UID") or ""))
    return events


def semantic_hash(value: Any) -> str:
    return sha256_bytes(canonical_json_bytes(value))
