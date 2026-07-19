#!/usr/bin/env python3
"""Canonicalization helpers for the immutable S26 layered baseline."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

from baseline_common import canonical_ics_events, canonical_ics_report, canonical_summary

LAYERED_BASELINE_SCHEMA_VERSION = "noticepilot.layeredBaseline.v0.1"
LAYERED_BASELINE_DIFF_SCHEMA_VERSION = "noticepilot.layeredBaselineDiff.v0.1"
LAYERED_BASELINE_DECISION_SCHEMA_VERSION = "noticepilot.layeredBaselineDecision.v0.1"
BASELINE_ID = "layered-s26-corpus-2059-20260712-v1"
BASELINE_DIR_NAME = "layered-s26-v1"

_SET_LIKE_LIST_KEYS = {
    "actionSignals",
    "admissionTypes",
    "allowedOutcomes",
    "audienceSignals",
    "candidateActionTypes",
    "candidateEventTypes",
    "campuses",
    "degreeLevels",
    "enrollmentStatuses",
    "feedScopes",
    "reasonCodes",
    "ruleIds",
    "studentYears",
    "temporalMentionIds",
    "uncertaintyReasons",
}


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def semantic_hash(value: Any) -> str:
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line_number, line in enumerate(f, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"expected JSON object at {path}:{line_number}")
            rows.append(value)
    return rows


def _sort_key(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def canonical_value(value: Any, *, parent_key: str | None = None) -> Any:
    """Return a deterministic deep copy while retaining all semantic fields."""
    if isinstance(value, dict):
        return {
            str(key): canonical_value(child, parent_key=str(key))
            for key, child in sorted(value.items(), key=lambda item: str(item[0]))
        }
    if isinstance(value, list):
        normalized = [canonical_value(child) for child in value]
        if parent_key in _SET_LIKE_LIST_KEYS:
            normalized.sort(key=_sort_key)
        return normalized
    return copy.deepcopy(value)


def canonical_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    return canonical_value(candidate)


def canonical_decision(decision: dict[str, Any]) -> dict[str, Any]:
    row = canonical_value(decision)
    row["candidates"] = sorted(
        (canonical_candidate(candidate) for candidate in decision.get("candidates") or []),
        key=lambda candidate: str(candidate.get("id") or ""),
    )
    if "semanticReviewPayloads" in row:
        row["semanticReviewPayloads"] = sorted(
            row.get("semanticReviewPayloads") or [],
            key=lambda payload: (
                str(payload.get("reviewReason") or ""),
                str((payload.get("sourceSegment") or {}).get("segmentId") or ""),
            ),
        )
    return row


def canonical_notice_document(document: dict[str, Any]) -> dict[str, Any]:
    extractor = document.get("extractor") or {}
    return canonical_value({
        "schemaVersion": document.get("schemaVersion"),
        "sourceNoticeId": document.get("sourceNoticeId"),
        "sourceContentHash": document.get("sourceContentHash"),
        "sourceTitle": document.get("sourceTitle"),
        "sourceUrl": document.get("sourceUrl"),
        "timezone": document.get("timezone"),
        "sourceCampusScope": document.get("sourceCampusScope"),
        "extractor": {
            "version": extractor.get("version"),
            "mode": extractor.get("mode"),
            "policyVersion": extractor.get("policyVersion"),
        },
        "candidates": sorted(
            (canonical_candidate(candidate) for candidate in document.get("candidates") or []),
            key=lambda candidate: str(candidate.get("id") or ""),
        ),
        "summary": document.get("summary") or {},
    })


def load_notice_documents(derived_dir: Path, collection: str = "all") -> list[dict[str, Any]]:
    documents = [
        canonical_notice_document(read_json(path))
        for path in sorted((derived_dir / "candidates" / collection).glob("*.candidates.json"))
    ]
    documents.sort(key=lambda row: str(row.get("sourceNoticeId") or ""))
    return documents


def unique_candidates_from_documents(documents: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for document in documents:
        for candidate in document.get("candidates") or []:
            candidate_id = str(candidate.get("id") or "")
            if not candidate_id:
                raise ValueError(f"candidate without id in {document.get('sourceNoticeId')}")
            prior = by_id.get(candidate_id)
            if prior is not None and prior != candidate:
                raise ValueError(f"cross-document candidate mismatch: {candidate_id}")
            by_id[candidate_id] = candidate
    return [by_id[key] for key in sorted(by_id)]


def canonical_publishable(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        (canonical_candidate(row) for row in rows),
        key=lambda row: str(row.get("id") or ""),
    )


def canonical_review(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        (canonical_decision(row) for row in rows),
        key=lambda row: str(row.get("sourceNoticeId") or ""),
    )


def canonical_layered_audit(report: dict[str, Any]) -> dict[str, Any]:
    components = report.get("componentAudits") or {}
    return canonical_value({
        "schemaVersion": report.get("schemaVersion"),
        "result": report.get("result"),
        "auditVersion": report.get("auditVersion"),
        "scope": report.get("scope") or {},
        "checks": report.get("checks") or {},
        "componentAudits": {
            name: {
                "schemaVersion": row.get("schemaVersion"),
                "result": row.get("result"),
                "returnCode": row.get("returnCode"),
            }
            for name, row in sorted(components.items())
        },
        "baselineObservation": {
            key: value
            for key, value in (report.get("baselineObservation") or {}).items()
            if key not in {"rawDiffReport"}
        },
        "samples": report.get("samples") or {},
    })


def canonical_component_audit(report: dict[str, Any], version_key: str) -> dict[str, Any]:
    return canonical_value({
        "schemaVersion": report.get("schemaVersion"),
        "result": report.get("result"),
        version_key: report.get(version_key),
        "checks": report.get("checks") or {},
        "samples": report.get("samples") or {},
    })


def current_snapshot(derived_dir: Path) -> dict[str, Any]:
    documents = load_notice_documents(derived_dir, "all")
    student_documents = load_notice_documents(derived_dir, "student_default")
    job_documents = load_notice_documents(derived_dir, "job_application")
    all_candidates = unique_candidates_from_documents(documents)
    publishable = canonical_publishable(
        read_jsonl(derived_dir / "decisions" / "publishable-candidates.jsonl")
    )
    review = canonical_review(read_jsonl(derived_dir / "decisions" / "review-queue.jsonl"))
    layered_audit = canonical_layered_audit(
        read_json(derived_dir / "reports" / "s26-layered-full-corpus-audit.json")
    )
    runtime_audit = canonical_component_audit(
        read_json(derived_dir / "reports" / "s26-components" / "s24d-runtime-wiring.json"),
        "wiringVersion",
    )
    reconciler_audit = canonical_component_audit(
        read_json(derived_dir / "reports" / "s26-components" / "s25-candidate-reconciler.json"),
        "reconcilerVersion",
    )
    return {
        "summary": canonical_summary(read_json(derived_dir / "reports" / "policy-summary.json")),
        "integrity": canonical_value(read_json(derived_dir / "reports" / "candidate-integrity.json")),
        "noticeDocuments": documents,
        "studentCandidateDocuments": student_documents,
        "jobCandidateDocuments": job_documents,
        "allCandidates": all_candidates,
        "publishableCandidates": publishable,
        "reviewQueue": review,
        "studentIcsReport": canonical_ics_report(
            read_json(derived_dir / "ics" / "student_default" / "ics_export_report.json")
        ),
        "studentIcsEvents": canonical_ics_events(
            derived_dir / "ics" / "student_default" / "noticepilot-student-default.ics"
        ),
        "jobIcsReport": canonical_ics_report(
            read_json(derived_dir / "ics" / "job_application" / "ics_export_report.json")
        ),
        "jobIcsEvents": canonical_ics_events(
            derived_dir / "ics" / "job_application" / "noticepilot-job-applications.ics"
        ),
        "layeredAudit": layered_audit,
        "runtimeWiringAudit": runtime_audit,
        "candidateReconcilerAudit": reconciler_audit,
    }


def keyed(rows: Iterable[dict[str, Any]], key: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        value = str(row.get(key) or "")
        if not value:
            raise ValueError(f"row missing key {key}")
        if value in result:
            raise ValueError(f"duplicate key {value}")
        result[value] = row
    return result
