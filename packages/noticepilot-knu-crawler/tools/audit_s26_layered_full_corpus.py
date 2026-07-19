#!/usr/bin/env python3
"""Run the S24/S25 audits as one layered full-corpus audit.

This tool performs the unified validation and records the accepted S26 decision:
Policy.15 remains immutable, no allowlist is created, and a separate layered
baseline is maintained beside it.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(ROOT / "tools"))

from compare_policy_baseline import compare as compare_policy_baseline  # noqa: E402

SCHEMA_VERSION = "noticepilot.s26LayeredFullCorpusAudit.v0.3"
AUDIT_VERSION = "0.1.2"

COMPONENTS = (
    (
        "s24aBoard716Trace",
        "audit_s24_board716_trace_adaptation.py",
        "s24a-board716-trace.json",
    ),
    (
        "s24bApplicability",
        "audit_s24_applicability_evaluator.py",
        "s24b-applicability.json",
    ),
    (
        "s24cPublishability",
        "audit_s24_publishability_evaluator.py",
        "s24c-publishability.json",
    ),
    (
        "s24dRuntimeWiring",
        "audit_s24_runtime_judgment_wiring.py",
        "s24d-runtime-wiring.json",
    ),
    (
        "s25CandidateReconciler",
        "audit_s25_candidate_reconciler.py",
        "s25-candidate-reconciler.json",
    ),
)


def relative_report_reference(target: Path, *, report_path: Path) -> str:
    """Return a POSIX path relative to the directory containing the main report."""
    return Path(
        os.path.relpath(target.resolve(), start=report_path.parent.resolve())
    ).as_posix()


def count_changes(value: Any) -> int:
    if isinstance(value, list):
        return len(value)
    if isinstance(value, dict):
        return sum(count_changes(child) for child in value.values())
    return 0


def keyed_change_counts(section: dict[str, Any]) -> dict[str, int]:
    return {
        "added": len(section.get("added") or []),
        "removed": len(section.get("removed") or []),
        "changed": len(section.get("changed") or []),
    }


def run_component(
    *,
    name: str,
    script_name: str,
    report_path: Path,
    baseline: Path,
    current: Path,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    command = [
        sys.executable,
        str(ROOT / "tools" / script_name),
        "--baseline",
        str(baseline),
        "--current",
        str(current),
        "--output",
        str(report_path),
    ]
    process = subprocess.run(command, capture_output=True, text=True, check=False)
    execution = {
        "name": name,
        "script": f"tools/{script_name}",
        "report": str(report_path),
        "returnCode": process.returncode,
        "stderr": process.stderr.strip(),
    }
    if not report_path.exists():
        return None, execution
    try:
        return json.loads(report_path.read_text(encoding="utf-8")), execution
    except json.JSONDecodeError as exc:
        execution["parseError"] = str(exc)
        return None, execution


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--component-output-dir", type=Path)
    args = parser.parse_args()

    baseline = args.baseline.resolve()
    current = args.current.resolve()
    output = (args.output or current / "reports" / "s26-layered-full-corpus-audit.json").resolve()
    component_dir = (
        args.component_output_dir or output.parent / "s26-components"
    ).resolve()
    component_dir.mkdir(parents=True, exist_ok=True)

    component_reports: dict[str, dict[str, Any] | None] = {}
    component_execution: dict[str, dict[str, Any]] = {}
    component_failures: list[str] = []

    for name, script_name, report_name in COMPONENTS:
        report, execution = run_component(
            name=name,
            script_name=script_name,
            report_path=component_dir / report_name,
            baseline=baseline,
            current=current,
        )
        component_reports[name] = report
        component_execution[name] = execution
        if execution["returnCode"] != 0 or not report or report.get("result") != "pass":
            component_failures.append(name)

    s24a = component_reports.get("s24aBoard716Trace") or {}
    s24b = component_reports.get("s24bApplicability") or {}
    s24c = component_reports.get("s24cPublishability") or {}
    s24d = component_reports.get("s24dRuntimeWiring") or {}
    s25 = component_reports.get("s25CandidateReconciler") or {}

    a = s24a.get("checks") or {}
    b = s24b.get("checks") or {}
    c = s24c.get("checks") or {}
    d = s24d.get("checks") or {}
    e = s25.get("checks") or {}

    candidate_counts = {
        "s24a": a.get("candidateCount"),
        "s24b": b.get("candidateCount"),
        "s24c": c.get("candidateCount"),
        "s24d": d.get("candidateCount"),
        "s25": e.get("candidateCount"),
    }
    unique_counts = {
        "s24a": a.get("uniqueCandidateIdCount"),
        "s24b": b.get("uniqueCandidateIdCount"),
        "s24c": c.get("uniqueCandidateIdCount"),
        "s24d": d.get("uniqueCandidateIdCount"),
        "s25": e.get("uniqueCandidateIdCount"),
    }
    count_inconsistencies: list[str] = []
    if set(candidate_counts.values()) != {1304}:
        count_inconsistencies.append(f"candidate counts differ: {candidate_counts}")
    if set(unique_counts.values()) != {1304}:
        count_inconsistencies.append(f"unique candidate counts differ: {unique_counts}")
    if e.get("noticeDecisionCount") != 2059:
        count_inconsistencies.append(
            f"notice decision count is {e.get('noticeDecisionCount')}, expected 2059"
        )

    scope_counts = d.get("scopeCounts") or b.get("scopeCounts") or {}
    verdict_counts = d.get("verdictCounts") or c.get("verdictCounts") or {}
    ics_sources = {
        "s24a": a.get("icsMatches") or {},
        "s24b": b.get("icsMatches") or {},
        "s24c": c.get("icsMatches") or {},
        "s24d": d.get("icsMatches") or {},
        "s25": e.get("icsMatches") or {},
    }
    all_ics_match = all(
        values.get("student_default") is True and values.get("job_application") is True
        for values in ics_sources.values()
    )
    all_review_match = all(
        checks.get("reviewQueueMatches") is True for checks in (a, b, c, d, e)
    )
    publishable_semantics_match = (
        a.get("publishableIdSetsMatch") is True
        and b.get("publishableIdSetsMatch") is True
        and c.get("publishableIdSetsMatch") is True
        and d.get("publishableIdSetsMatch") is True
        and d.get("publishableSemanticsMatch") is True
        and e.get("publishableSemanticsMatch") is True
    )

    baseline_diff = compare_policy_baseline(baseline, current, None)
    baseline_diff_path = output.parent / "s26-policy15-observation-diff.json"
    baseline_diff_path.write_text(
        json.dumps(baseline_diff, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    baseline_sections = baseline_diff.get("sections") or {}
    publishable_diff_counts = keyed_change_counts(
        baseline_sections.get("publishableCandidates") or {}
    )
    review_diff_counts = keyed_change_counts(baseline_sections.get("reviewQueue") or {})
    ics_diff_counts = {
        feed: keyed_change_counts(section or {})
        for feed, section in (baseline_sections.get("icsEvents") or {}).items()
    }

    checks = {
        "allComponentAuditsPass": not component_failures,
        "noticeDecisionCount": e.get("noticeDecisionCount"),
        "candidateCount": d.get("candidateCount"),
        "uniqueCandidateIdCount": d.get("uniqueCandidateIdCount"),
        "crossLayerCandidateCounts": candidate_counts,
        "crossLayerUniqueCandidateCounts": unique_counts,
        "crossLayerCountConsistency": not count_inconsistencies,
        "completeTraceCandidateCount": a.get("completeTraceCandidateCount"),
        "traceErrorCount": a.get("traceErrorCount"),
        "board716CandidateCount": a.get("board716CandidateCount"),
        "board716ContractErrorCount": a.get("board716ContractErrorCount"),
        "runtimeApplicabilityJudgmentFieldCount": d.get(
            "runtimeApplicabilityJudgmentFieldCount"
        ),
        "runtimePublishabilityJudgmentFieldCount": d.get(
            "runtimePublishabilityJudgmentFieldCount"
        ),
        "runtimeJudgmentContractErrorCount": d.get(
            "runtimeJudgmentContractErrorCount"
        ),
        "runtimeJudgmentReconstructionMismatchCount": d.get(
            "runtimeJudgmentReconstructionMismatchCount"
        ),
        "crossArtifactJudgmentMismatchCount": d.get(
            "crossArtifactJudgmentMismatchCount"
        ),
        "scopeCounts": scope_counts,
        "scopeCountsMatchExpected": d.get("scopeCountsMatchExpected") is True,
        "verdictCounts": verdict_counts,
        "verdictCountsMatchExpected": d.get("verdictCountsMatchExpected") is True,
        "reconcilerSecondPassInputCandidateCount": e.get(
            "secondPassInputCandidateCount"
        ),
        "reconcilerSecondPassOutputCandidateCount": e.get(
            "secondPassOutputCandidateCount"
        ),
        "reconcilerSecondPassRemovedCandidateCount": e.get(
            "secondPassRemovedCandidateCount"
        ),
        "reconcilerSecondPassConflictDetectionCount": e.get(
            "secondPassConflictDetectionCount"
        ),
        "reconcilerCandidateObjectMismatchCount": e.get(
            "candidateObjectMismatchCount"
        ),
        "publishableSemanticsMatch": publishable_semantics_match,
        "reviewQueueMatchesAcrossAllAudits": all_review_match,
        "icsMatchesAcrossAllAudits": all_ics_match,
    }

    passed = (
        not component_failures
        and not count_inconsistencies
        and checks["completeTraceCandidateCount"] == 1304
        and checks["traceErrorCount"] == 0
        and checks["board716CandidateCount"] == 300
        and checks["board716ContractErrorCount"] == 0
        and checks["runtimeApplicabilityJudgmentFieldCount"] == 1304
        and checks["runtimePublishabilityJudgmentFieldCount"] == 1304
        and checks["runtimeJudgmentContractErrorCount"] == 0
        and checks["runtimeJudgmentReconstructionMismatchCount"] == 0
        and checks["crossArtifactJudgmentMismatchCount"] == 0
        and checks["scopeCountsMatchExpected"]
        and checks["verdictCountsMatchExpected"]
        and checks["reconcilerSecondPassInputCandidateCount"] == 1304
        and checks["reconcilerSecondPassOutputCandidateCount"] == 1304
        and checks["reconcilerSecondPassRemovedCandidateCount"] == 0
        and checks["reconcilerSecondPassConflictDetectionCount"] == 9
        and checks["reconcilerCandidateObjectMismatchCount"] == 0
        and publishable_semantics_match
        and all_review_match
        and all_ics_match
    )

    report = {
        "schemaVersion": SCHEMA_VERSION,
        "result": "pass" if passed else "fail",
        "baselineDir": relative_report_reference(baseline, report_path=output),
        "currentDir": relative_report_reference(current, report_path=output),
        "auditVersion": AUDIT_VERSION,
        "pathReferences": {
            "base": "audit_report_directory",
            "format": "posix_relative",
        },
        "scope": {
            "unifiedLayeredFullCorpusAuditPerformed": True,
            "componentStages": ["S24-A", "S24-B", "S24-C", "S24-D", "S25"],
            "allowlistDecisionPerformed": False,
            "baselinePromotionDecisionPerformed": True,
            "baselineReplacementPerformed": False,
            "separateLayeredBaselineCreated": True,
            "layeredBaselineId": "layered-s26-corpus-2059-20260712-v1",
            "layeredBaselineDir": relative_report_reference(
                ROOT / "baseline" / "layered-s26-v1", report_path=output
            ),
            "decisionRecord": relative_report_reference(
                ROOT / "baseline" / "layered-s26-v1" / "decision-record.json",
                report_path=output,
            ),
        },
        "checks": checks,
        "componentAudits": {
            name: {
                "schemaVersion": (component_reports[name] or {}).get("schemaVersion"),
                "result": (component_reports[name] or {}).get("result", "missing"),
                "report": relative_report_reference(
                    Path(component_execution[name]["report"]), report_path=output
                ),
                "returnCode": component_execution[name]["returnCode"],
            }
            for name, _, _ in COMPONENTS
        },
        "baselineObservation": {
            "comparisonSchemaVersion": baseline_diff.get("schemaVersion"),
            "result": baseline_diff.get("result"),
            "changeCount": baseline_diff.get("changeCount"),
            "allowlist": baseline_diff.get("allowlist"),
            "summaryChangeCount": len(baseline_sections.get("summary") or []),
            "candidateIntegrityChangeCount": len(
                baseline_sections.get("candidateIntegrity") or []
            ),
            "publishableCandidateChanges": publishable_diff_counts,
            "reviewQueueChanges": review_diff_counts,
            "icsEventChanges": ics_diff_counts,
            "rawDiffReport": relative_report_reference(
                baseline_diff_path, report_path=output
            ),
            "adjudication": "accepted_for_separate_layered_baseline",
        },
        "samples": {
            "componentFailures": component_failures,
            "countInconsistencies": count_inconsistencies,
            "componentExecutionErrors": [
                {
                    "component": name,
                    "returnCode": execution["returnCode"],
                    "stderr": execution.get("stderr", "")[:1000],
                    "parseError": execution.get("parseError"),
                }
                for name, execution in component_execution.items()
                if execution["returnCode"] != 0 or execution.get("parseError")
            ],
        },
    }

    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(encoded, encoding="utf-8")
    print(encoded, end="")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
