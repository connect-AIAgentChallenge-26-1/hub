#!/usr/bin/env python3
"""Apply the S24-A board 716 metadata trace adaptation to derived artifacts.

This utility exists for packages that contain the verified derived corpus but
not the local observation source snapshot. It preserves candidate decisions and
ICS files and changes only layered trace/audit material plus matching extractor
metadata and structured-segment summary counters.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
import sys
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import noticepilot_mvp_policy_pipeline as policy  # noqa: E402

REPORT_SCHEMA_VERSION = "noticepilot.s24Board716TraceAdaptationReport.v0.1"
TARGET_PIPELINE_VERSION = policy.PIPELINE_VERSION


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in rows),
        encoding="utf-8",
    )


def is_target(candidate: dict[str, Any]) -> bool:
    source_notice_id = str(candidate.get("sourceNoticeId") or "")
    source_url = str(candidate.get("sourceUrl") or "")
    return (
        candidate.get("eventType") == "job_application_period"
        and candidate.get("temporalRole") in {None, "user_action_period"}
        and (source_notice_id.startswith("knu-716-") or "/bbs/716/" in source_url)
    )


def resolution_from_candidate(candidate: dict[str, Any]) -> Any:
    resolution = candidate.get("dateResolution") or {}
    return SimpleNamespace(
        start=candidate.get("normalizedStart"),
        end=candidate.get("normalizedEnd"),
        is_all_day=bool(candidate.get("isAllDay")),
        date_text=candidate.get("dateText"),
        kind=resolution.get("kind") or "list_application_period",
        evidence=candidate.get("evidence"),
        inferred_year=bool(resolution.get("inferredYear")),
        calculation_policy=resolution.get("calculationPolicy"),
    )


def candidate_has_s24_trace(candidate: dict[str, Any]) -> bool:
    segment = candidate.get("sourceSegment") or {}
    fact = candidate.get("boundTemporalFact") or {}
    semantic = candidate.get("semanticClassification") or {}
    return (
        str(segment.get("segmentId") or "").startswith("seg-board716-")
        and fact.get("ruleId") == "binding.board716.list_metadata.application_period"
        and semantic.get("ruleId") == "semantic.board716.exact_application_period"
        and isinstance(candidate.get("temporalMention"), dict)
        and candidate.get("temporalRole") == "user_action_period"
    )


def adapt_candidate(candidate: dict[str, Any]) -> bool:
    if not is_target(candidate) or candidate_has_s24_trace(candidate):
        return False
    trace = policy.BOARD716_TRACE_ADAPTER.adapt(
        source_notice_id=str(candidate["sourceNoticeId"]),
        resolution=resolution_from_candidate(candidate),
    )
    candidate["sourceSegment"] = trace.source_segment.source_metadata()
    candidate["temporalRole"] = trace.semantic_classification.temporal_role.value
    candidate["semanticClassification"] = trace.semantic_classification.to_dict()
    candidate["temporalMention"] = trace.binding_result.temporal_mention.to_dict()
    candidate["boundTemporalFact"] = trace.binding_result.bound_fact.to_dict()
    # Preserve the pre-S24-A producer identity. This remains a deterministic
    # board rule, not a body-structure extraction rule.
    candidate["createdBy"] = "rule"
    return True


def adapt_decision(decision: dict[str, Any]) -> int:
    decision["pipelineVersion"] = TARGET_PIPELINE_VERSION
    adapted_segments: dict[str, dict[str, Any]] = {}
    adapted = 0
    for candidate in decision.get("candidates") or []:
        if adapt_candidate(candidate):
            adapted += 1
            source_segment = candidate.get("sourceSegment") or {}
            segment_id = str(source_segment.get("segmentId") or "")
            if segment_id:
                adapted_segments[segment_id] = source_segment
    if adapted_segments:
        summary = decision.setdefault("scheduleSegmentSummary", {})
        summary["segmentCount"] = int(summary.get("segmentCount") or 0) + len(adapted_segments)
        summary["locallyGroundedCount"] = int(summary.get("locallyGroundedCount") or 0) + len(adapted_segments)
        type_counts = summary.setdefault("typeCounts", {})
        type_counts["label_value"] = int(type_counts.get("label_value") or 0) + len(adapted_segments)
    return adapted


def adapt_jsonl(path: Path, *, decision_rows: bool) -> tuple[int, int]:
    rows = read_jsonl(path)
    adapted = 0
    for row in rows:
        if decision_rows:
            adapted += adapt_decision(row)
        else:
            adapted += int(adapt_candidate(row))
    write_jsonl(path, rows)
    return len(rows), adapted


def adapt_candidate_document(path: Path) -> int:
    document = json.loads(path.read_text(encoding="utf-8"))
    extractor = document.setdefault("extractor", {})
    extractor["version"] = TARGET_PIPELINE_VERSION
    adapted = sum(int(adapt_candidate(candidate)) for candidate in document.get("candidates") or [])
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
    return adapted


def append_segment_document(path: Path, candidate: dict[str, Any]) -> bool:
    document = json.loads(path.read_text(encoding="utf-8"))
    segment = dict(candidate.get("sourceSegment") or {})
    segment_id = str(segment.get("segmentId") or "")
    if not segment_id:
        return False
    segment["text"] = candidate.get("evidence") or candidate.get("dateText") or ""
    rows = document.setdefault("segments", [])
    if any(str(row.get("segmentId") or "") == segment_id for row in rows):
        return False
    rows.append(segment)
    extractor = document.setdefault("extractor", {})
    extractor["version"] = TARGET_PIPELINE_VERSION
    existing_summary = document.get("summary") or {}
    document["summary"] = {
        **existing_summary,
        **policy.build_schedule_segment_summary(rows),
    }
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
    return True


def update_summary(derived: Path, target_count: int) -> None:
    path = derived / "reports" / "policy-summary.json"
    summary = json.loads(path.read_text(encoding="utf-8"))
    summary["pipelineVersion"] = TARGET_PIPELINE_VERSION
    summary["structuredSegmentCandidateCount"] = int(summary.get("structuredSegmentCandidateCount") or 0) + target_count
    summary["locallyGroundedCandidateCount"] = int(summary.get("locallyGroundedCandidateCount") or 0) + target_count
    type_counts = summary.setdefault("sourceSegmentTypeCounts", {})
    type_counts["label_value"] = int(type_counts.get("label_value") or 0) + target_count
    summary["sourceSegmentTypeCounts"] = dict(sorted(type_counts.items()))
    path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")


def update_run_manifest(derived: Path) -> None:
    path = derived / "reports" / "run-manifest.json"
    if not path.exists():
        return
    manifest = json.loads(path.read_text(encoding="utf-8"))
    manifest["pipelineVersion"] = TARGET_PIPELINE_VERSION
    manifest["postProcessing"] = {
        "adapter": "noticepilot_board716_trace_adapter",
        "adapterVersion": policy.BOARD716_TRACE_ADAPTER.version,
        "reason": "S24-A board 716 list-metadata trace completion",
    }
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--derived-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    derived = args.derived_dir.resolve()

    decisions_path = derived / "decisions" / "notices.jsonl"
    publishable_path = derived / "decisions" / "publishable-candidates.jsonl"
    if not decisions_path.exists() or not publishable_path.exists():
        raise FileNotFoundError("derived directory is missing required decision artifacts")

    decision_count, decision_adapted = adapt_jsonl(decisions_path, decision_rows=True)
    publishable_count, publishable_adapted = adapt_jsonl(publishable_path, decision_rows=False)

    for name in ("review-queue.jsonl", "not-calendar-relevant.jsonl"):
        path = derived / "decisions" / name
        if path.exists():
            adapt_jsonl(path, decision_rows=True)

    candidate_doc_adapted = 0
    for path in sorted((derived / "candidates").glob("*/*.candidates.json")):
        candidate_doc_adapted += adapt_candidate_document(path)

    publishable_rows = read_jsonl(publishable_path)
    segment_appended = 0
    for candidate in publishable_rows:
        if not is_target(candidate):
            continue
        path = derived / "segments" / f"{candidate['sourceNoticeId']}.segments.json"
        if path.exists() and append_segment_document(path, candidate):
            segment_appended += 1

    if decision_adapted != publishable_adapted:
        raise RuntimeError(
            f"decision/publishable adaptation mismatch: {decision_adapted} != {publishable_adapted}"
        )
    update_summary(derived, publishable_adapted)
    update_run_manifest(derived)

    report = {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "pipelineVersion": TARGET_PIPELINE_VERSION,
        "derivedDir": str(derived),
        "decisionCount": decision_count,
        "publishableCandidateCount": publishable_count,
        "adaptedCandidateCount": publishable_adapted,
        "decisionCandidateAdaptationCount": decision_adapted,
        "candidateDocumentAdaptationOccurrences": candidate_doc_adapted,
        "segmentDocumentAppendCount": segment_appended,
    }
    report_path = (args.report or derived / "reports" / "s24-board716-trace-adaptation.json").resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
