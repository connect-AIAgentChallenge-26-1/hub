#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from noticepilot_feed_builder import DeterministicFeedBuilder, load_feed_source_context
from noticepilot_feed_eligibility import build_eligibility_input_views, load_feed_eligibility_policy
from noticepilot_profile_matrix import load_profile_matrix, run_profile_matrix, validate_profile_matrix_result
from noticepilot_subscription_profile import load_canonical_board_map

AUDIT_SCHEMA_VERSION = "noticepilot.s28ProfileMatrixFullCorpusAudit.v0.1"
AUDITOR_VERSION = "0.1.0"
EXPECTED_S27C_MANIFEST_SHA256 = "47fa8e232254df978575f31e06d555c20cf5f50e99862dc8ae0e772a7e4a03dc"
EXPECTED_S27D_MANIFEST_SHA256 = "922eacc5a270f5119d0e86892d961ed742486b35b6a65d7a0d1642119820481f"
EXPECTED_S28_SNAPSHOT_MANIFEST_SHA256 = "975a23a8cb932d5b6f5511f3ef9b15869aba95985a482ce075ee18d351675895"
EXPECTED_S28_STUDENT_BUILD_RESULT_SHA256 = "2247cafae28b8a2ab9897779867f3494c8c2c9a08afe17337e4e3850d0ba893b"
EXPECTED_S28_JOB_BUILD_RESULT_SHA256 = "0fb2f8fe1656fc9271169917adb4e7cc0312d646fcce5ed2fd389a65bfdcb863"


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _stored_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected object: {path}")
    return value


def build_report(root: Path, output_dir: Path | None = None) -> dict[str, Any]:
    root = root.resolve()
    errors: list[str] = []
    matrix_path = root / "configs/noticepilot_profile_matrix.v0.1.json"
    report_dir = root / "derived/mvp-policy-v0.1/reports/s28-profile-matrix"
    try:
        board_map = load_canonical_board_map(root / "configs/knu_board_registry.v0.2.json")
        policy = load_feed_eligibility_policy(root / "configs/noticepilot_feed_eligibility_policy.v0.2.json")
        matrix, _ = load_profile_matrix(matrix_path, canonical_board_map=board_map)
        views = build_eligibility_input_views(root)
        builder = DeterministicFeedBuilder(
            policy=policy,
            canonical_board_map=board_map,
            source_context=load_feed_source_context(root),
        )
        run = run_profile_matrix(matrix=matrix, builder=builder, views=views, canonical_board_map=board_map)
        validate_profile_matrix_result(run.result)
    except Exception as exc:
        matrix = {}
        views = []
        run = None
        errors.append(f"profile matrix execution failed: {exc}")

    stored_result_path = report_dir / "profile-matrix-results.json"
    stored_rows_path = report_dir / "profile-matrix-case-results.jsonl"
    stored_exact = False
    stored_rows_exact = False
    if run is not None:
        try:
            stored_result = _stored_json(stored_result_path)
            stored_exact = stored_result == run.result
            if not stored_exact:
                errors.append("stored profile matrix result differs from recomputation")
            expected_rows = "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in run.result["caseResults"])
            stored_rows_exact = stored_rows_path.read_text(encoding="utf-8") == expected_rows
            if not stored_rows_exact:
                errors.append("stored matrix case JSONL differs from recomputation")
        except Exception as exc:
            errors.append(f"stored matrix artifact validation failed: {exc}")

    reference_parity: dict[str, Any] = {}
    if run is not None:
        try:
            student_ids = set(run.outputs["reference.student_all"].result["includedEventIds"])
            job_ids = set(run.outputs["reference.job_all"].result["includedEventIds"])
            student_snapshot = _stored_json(root / "snapshots/s28-v1/student_default.snapshot.json")
            job_snapshot = _stored_json(root / "snapshots/s28-v1/job_application.snapshot.json")
            student_parity = student_ids == set(student_snapshot["feed"]["eventIds"])
            job_parity = job_ids == set(job_snapshot["feed"]["eventIds"])
            reference_parity = {
                "studentSnapshotMembershipMatch": student_parity,
                "jobSnapshotMembershipMatch": job_parity,
                "studentEventCount": len(student_ids),
                "jobEventCount": len(job_ids),
                "unionCount": len(student_ids | job_ids),
                "overlapCount": len(student_ids & job_ids),
            }
            if not student_parity: errors.append("student reference matrix membership differs from S28-4 snapshot")
            if not job_parity: errors.append("job reference matrix membership differs from S28-4 snapshot")
        except Exception as exc:
            errors.append(f"reference snapshot parity failed: {exc}")

    s27c_hash = file_sha256(root / "registry/s27c-v1/manifest.json")
    s27d_hash = file_sha256(root / "projection/s27d-v1/manifest.json")
    if s27c_hash != EXPECTED_S27C_MANIFEST_SHA256: errors.append("S27-C manifest hash changed")
    if s27d_hash != EXPECTED_S27D_MANIFEST_SHA256: errors.append("S27-D manifest hash changed")
    s28_snapshot_hash = file_sha256(root / "snapshots/s28-v1/manifest.json")
    s28_student_build_hash = file_sha256(root / "derived/mvp-policy-v0.1/reports/s28-feed-builder/student_default-feed-build-result.json")
    s28_job_build_hash = file_sha256(root / "derived/mvp-policy-v0.1/reports/s28-feed-builder/job_application-feed-build-result.json")
    if s28_snapshot_hash != EXPECTED_S28_SNAPSHOT_MANIFEST_SHA256: errors.append("S28-4 snapshot manifest hash changed")
    if s28_student_build_hash != EXPECTED_S28_STUDENT_BUILD_RESULT_SHA256: errors.append("S28-3 student build result hash changed")
    if s28_job_build_hash != EXPECTED_S28_JOB_BUILD_RESULT_SHA256: errors.append("S28-3 job build result hash changed")
    layered_path = report_dir / "layered-baseline-no-change-diff.json"
    try:
        layered = _stored_json(layered_path)
        layered_match = layered.get("result") == "match" and layered.get("changeCount") == 0
        if not layered_match: errors.append("layered baseline differs from S26")
    except Exception as exc:
        layered = {}
        layered_match = False
        errors.append(f"layered baseline diff validation failed: {exc}")

    result = run.result if run is not None else {}
    report = {
        "schemaVersion": AUDIT_SCHEMA_VERSION,
        "auditorVersion": AUDITOR_VERSION,
        "result": "pass" if not errors and result.get("result") == "pass" else "fail",
        "status": "completed" if not errors and result.get("result") == "pass" else "failed",
        "scope": {
            "profileMatrixImplemented": True,
            "fullCorpusFeedAuditPerformed": True,
            "matrixCasesPersisted": True,
            "everyCaseEvaluatedAgainstAllActiveEvents": True,
            "newProductPolicyIntroduced": False,
            "snapshotMutationPerformed": False,
            "subscriptionUrlOrTokenIssued": False,
            "icsSerializationPerformed": False,
            "s27RegistryMutationPerformed": False,
            "s27ProjectionMutationPerformed": False,
        },
        "matrix": {
            "path": "configs/noticepilot_profile_matrix.v0.1.json",
            "schemaVersion": matrix.get("schemaVersion"),
            "matrixVersion": matrix.get("matrixVersion"),
            "caseCount": result.get("profileCaseCount", 0),
            "matrixSha256": result.get("matrixSha256"),
            "storedResultExactMatch": stored_exact,
            "storedCaseRowsExactMatch": stored_rows_exact,
        },
        "counts": {
            "inputEventCount": result.get("inputEventCount", 0),
            "profileCaseCount": result.get("profileCaseCount", 0),
            "decisionCount": result.get("decisionCount", 0),
            "personalizationReadyEventCount": result.get("coverage", {}).get("personalizationReadyEventCount", 0),
            "audienceUnscopedEventCount": result.get("coverage", {}).get("audienceUnscopedEventCount", 0),
            "unknownCampusEventCount": result.get("coverage", {}).get("unknownCampusEventCount", 0),
        },
        "coverage": result.get("coverage", {}),
        "referenceParity": reference_parity,
        "invariants": result.get("invariants", []),
        "immutability": {
            "s27cManifestSha256": s27c_hash,
            "s27cManifestExpectedSha256": EXPECTED_S27C_MANIFEST_SHA256,
            "s27dManifestSha256": s27d_hash,
            "s27dManifestExpectedSha256": EXPECTED_S27D_MANIFEST_SHA256,
            "s28SnapshotManifestSha256": s28_snapshot_hash,
            "s28SnapshotManifestExpectedSha256": EXPECTED_S28_SNAPSHOT_MANIFEST_SHA256,
            "s28StudentBuildResultSha256": s28_student_build_hash,
            "s28StudentBuildResultExpectedSha256": EXPECTED_S28_STUDENT_BUILD_RESULT_SHA256,
            "s28JobBuildResultSha256": s28_job_build_hash,
            "s28JobBuildResultExpectedSha256": EXPECTED_S28_JOB_BUILD_RESULT_SHA256,
            "layeredBaselineResult": layered.get("result"),
            "layeredBaselineChangeCount": layered.get("changeCount"),
            "layeredBaselineMatch": layered_match,
        },
        "deferred": {
            "snapshotPersistenceAndDelivery": "S29",
            "subscriptionUrlAndToken": "S29",
            "calendarClientPhysicalQa": "S30",
        },
        "errors": errors,
    }
    if output_dir is not None:
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "s28-profile-matrix-full-corpus-audit.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    output_dir = args.output_dir or (root / "derived/mvp-policy-v0.1/reports/s28-profile-matrix")
    report = build_report(root, output_dir)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["result"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
