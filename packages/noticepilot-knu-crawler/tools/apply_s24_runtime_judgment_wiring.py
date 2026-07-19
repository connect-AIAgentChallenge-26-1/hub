#!/usr/bin/env python3
"""Wire S24-D applicability/publishability judgments into derived artifacts.

The migration is deterministic and idempotent. It changes only the two runtime
judgment fields plus producer version metadata; legacy candidate semantics,
review decisions, feed membership, and ICS files remain untouched.
"""
from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import noticepilot_mvp_policy_pipeline as policy  # noqa: E402
from noticepilot_runtime_judgment_wiring import RuntimeJudgmentWiring  # noqa: E402

REPORT_SCHEMA_VERSION = "noticepilot.s24RuntimeJudgmentWiringReport.v0.1"
TARGET_PIPELINE_VERSION = policy.PIPELINE_VERSION
TARGET_CANDIDATE_SCHEMA_VERSION = policy.CANDIDATE_SCHEMA_VERSION
JUDGMENT_FIELDS = {"applicabilityJudgment", "publishabilityJudgment"}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in rows),
        encoding="utf-8",
    )


def legacy_projection(candidate: dict[str, Any]) -> dict[str, Any]:
    return {key: copy.deepcopy(value) for key, value in candidate.items() if key not in JUDGMENT_FIELDS}


def wire_candidate(candidate: dict[str, Any], wiring: RuntimeJudgmentWiring) -> tuple[bool, bool]:
    before_legacy = legacy_projection(candidate)
    before_judgments = (
        copy.deepcopy(candidate.get("applicabilityJudgment")),
        copy.deepcopy(candidate.get("publishabilityJudgment")),
    )
    wiring.wire_candidate(candidate)
    if legacy_projection(candidate) != before_legacy:
        raise RuntimeError(f"legacy projection changed for candidate {candidate.get('id')}")
    after_judgments = (
        candidate.get("applicabilityJudgment"),
        candidate.get("publishabilityJudgment"),
    )
    return before_judgments != after_judgments, all(isinstance(value, dict) for value in after_judgments)


def wire_decision(decision: dict[str, Any], wiring: RuntimeJudgmentWiring) -> tuple[int, int]:
    decision["pipelineVersion"] = TARGET_PIPELINE_VERSION
    changed = 0
    total = 0
    for candidate in decision.get("candidates") or []:
        candidate_changed, complete = wire_candidate(candidate, wiring)
        if not complete:
            raise RuntimeError(f"incomplete judgment wiring for {candidate.get('id')}")
        changed += int(candidate_changed)
        total += 1
    return total, changed


def wire_jsonl(path: Path, *, decision_rows: bool, wiring: RuntimeJudgmentWiring) -> tuple[int, int, int]:
    rows = read_jsonl(path)
    candidate_total = 0
    changed = 0
    for row in rows:
        if decision_rows:
            row_total, row_changed = wire_decision(row, wiring)
            candidate_total += row_total
            changed += row_changed
        else:
            row_changed, complete = wire_candidate(row, wiring)
            if not complete:
                raise RuntimeError(f"incomplete judgment wiring for {row.get('id')}")
            candidate_total += 1
            changed += int(row_changed)
    write_jsonl(path, rows)
    return len(rows), candidate_total, changed


def wire_candidate_document(path: Path, wiring: RuntimeJudgmentWiring) -> tuple[int, int]:
    document = json.loads(path.read_text(encoding="utf-8"))
    document["schemaVersion"] = TARGET_CANDIDATE_SCHEMA_VERSION
    extractor = document.setdefault("extractor", {})
    extractor["version"] = TARGET_PIPELINE_VERSION
    changed = 0
    candidates = document.get("candidates") or []
    for candidate in candidates:
        candidate_changed, complete = wire_candidate(candidate, wiring)
        if not complete:
            raise RuntimeError(f"incomplete judgment wiring for {candidate.get('id')}")
        changed += int(candidate_changed)
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(candidates), changed


def update_report_versions(derived: Path) -> None:
    summary_path = derived / "reports" / "policy-summary.json"
    if summary_path.exists():
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        summary["pipelineVersion"] = TARGET_PIPELINE_VERSION
        summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    manifest_path = derived / "reports" / "run-manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["pipelineVersion"] = TARGET_PIPELINE_VERSION
        history = list(manifest.get("postProcessingHistory") or [])
        previous = manifest.get("postProcessing")
        if isinstance(previous, dict) and previous not in history:
            history.append(previous)
        current = {
            "adapter": "noticepilot_runtime_judgment_wiring",
            "adapterVersion": RuntimeJudgmentWiring.version,
            "reason": "S24-D runtime ApplicabilityJudgment/PublishabilityJudgment serialization",
        }
        if current not in history:
            history.append(current)
        manifest["postProcessing"] = current
        manifest["postProcessingHistory"] = history
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--derived-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    derived = args.derived_dir.resolve()
    wiring = RuntimeJudgmentWiring()

    required = [
        derived / "decisions" / "notices.jsonl",
        derived / "decisions" / "publishable-candidates.jsonl",
    ]
    if any(not path.exists() for path in required):
        raise FileNotFoundError("derived directory is missing required decision artifacts")

    occurrences = 0
    changed_occurrences = 0
    artifact_counts: dict[str, Any] = {}

    for name in ("notices.jsonl", "review-queue.jsonl", "not-calendar-relevant.jsonl"):
        path = derived / "decisions" / name
        if not path.exists():
            continue
        rows, total, changed = wire_jsonl(path, decision_rows=True, wiring=wiring)
        artifact_counts[name] = {"rowCount": rows, "candidateCount": total, "changedCount": changed}
        occurrences += total
        changed_occurrences += changed

    path = derived / "decisions" / "publishable-candidates.jsonl"
    rows, total, changed = wire_jsonl(path, decision_rows=False, wiring=wiring)
    artifact_counts[path.name] = {"rowCount": rows, "candidateCount": total, "changedCount": changed}
    occurrences += total
    changed_occurrences += changed

    candidate_document_count = 0
    candidate_document_occurrences = 0
    candidate_document_changes = 0
    for path in sorted((derived / "candidates").glob("*/*.candidates.json")):
        total, changed = wire_candidate_document(path, wiring)
        candidate_document_count += 1
        candidate_document_occurrences += total
        candidate_document_changes += changed
    occurrences += candidate_document_occurrences
    changed_occurrences += candidate_document_changes
    artifact_counts["candidateDocuments"] = {
        "documentCount": candidate_document_count,
        "candidateCount": candidate_document_occurrences,
        "changedCount": candidate_document_changes,
    }

    update_report_versions(derived)

    decision_candidates = [
        candidate
        for decision in read_jsonl(derived / "decisions" / "notices.jsonl")
        for candidate in decision.get("candidates") or []
    ]
    report = {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "pipelineVersion": TARGET_PIPELINE_VERSION,
        "candidateSchemaVersion": TARGET_CANDIDATE_SCHEMA_VERSION,
        "derivedDir": str(derived),
        "uniqueDecisionCandidateCount": len({str(candidate.get('id')) for candidate in decision_candidates}),
        "decisionCandidateCount": len(decision_candidates),
        "candidateOccurrenceCount": occurrences,
        "wiredCandidateOccurrenceCount": occurrences,
        "changedCandidateOccurrenceCount": changed_occurrences,
        "idempotentNoOp": changed_occurrences == 0,
        "artifactCounts": artifact_counts,
    }
    report_path = (args.report or derived / "reports" / "s24-runtime-judgment-wiring.json").resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
