#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from noticepilot_feed_builder import (
    FEED_BUILDER_VERSION,
    DeterministicFeedBuilder,
    FeedBuilderError,
    load_default_profile_collection,
    load_feed_source_context,
    write_feed_build_artifacts,
)
from noticepilot_feed_eligibility import (
    build_eligibility_input_views,
    load_feed_eligibility_policy,
)
from noticepilot_subscription_profile import load_canonical_board_map

AUDIT_SCHEMA_VERSION = "noticepilot.s28DeterministicFeedBuilderAudit.v0.1"
AUDITOR_VERSION = "0.1.0"
EXPECTED_S27C_MANIFEST_SHA256 = "47fa8e232254df978575f31e06d555c20cf5f50e99862dc8ae0e772a7e4a03dc"
EXPECTED_S27D_MANIFEST_SHA256 = "922eacc5a270f5119d0e86892d961ed742486b35b6a65d7a0d1642119820481f"


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_ics_event_ids(path: Path) -> list[str]:
    data = path.read_bytes()
    text = data.decode("utf-8")
    ids: list[str] = []
    for line in text.replace("\r\n ", "").split("\r\n"):
        if not line.startswith("UID:"):
            continue
        uid = line[4:]
        match = re.fullmatch(r"(evt_[0-9a-f]{32})@noticepilot\.local", uid)
        if not match:
            raise FeedBuilderError(f"unexpected persistent UID in {path}: {uid}")
        ids.append(match.group(1))
    if len(ids) != len(set(ids)):
        raise FeedBuilderError(f"duplicate persistent UID in {path}")
    return ids


def _profile_kind(profile: dict[str, Any]) -> str:
    scopes = profile["eventSelection"]["includedFeedScopes"]
    if scopes == ["student_default"]:
        return "student_default"
    if scopes == ["job_application"]:
        return "job_application"
    raise FeedBuilderError(f"unsupported reference profile feed scope: {scopes}")


def build_report(root: Path, output_dir: Path | None = None) -> dict[str, Any]:
    root = root.resolve()
    errors: list[str] = []
    policy_path = root / "configs/noticepilot_feed_eligibility_policy.v0.2.json"
    profile_path = root / "configs/noticepilot_default_subscription_profiles.v0.1.json"
    board_path = root / "configs/knu_board_registry.v0.2.json"

    try:
        policy = load_feed_eligibility_policy(policy_path)
        board_map = load_canonical_board_map(board_path)
        collection, profiles = load_default_profile_collection(
            profile_path, canonical_board_map=board_map
        )
        views = build_eligibility_input_views(root)
        source_context = load_feed_source_context(root)
        builder = DeterministicFeedBuilder(
            policy=policy,
            canonical_board_map=board_map,
            source_context=source_context,
        )
        outputs = {_profile_kind(profile): builder.build(profile, views) for profile in profiles}
        reverse_outputs = {
            _profile_kind(profile): builder.build(profile, reversed(views)) for profile in profiles
        }
    except Exception as exc:
        policy = {}
        collection = {}
        profiles = []
        views = []
        source_context = {}
        outputs = {}
        reverse_outputs = {}
        errors.append(f"FeedBuilder construction failed: {exc}")

    if outputs:
        for kind, output in outputs.items():
            reverse_output = reverse_outputs[kind]
            if output.result != reverse_output.result:
                errors.append(f"{kind} result differs under reversed input order")
            if output.decisions != reverse_output.decisions:
                errors.append(f"{kind} decision ledger differs under reversed input order")

        student = outputs["student_default"]
        job = outputs["job_application"]
        student_ids = set(student.result["includedEventIds"])
        job_ids = set(job.result["includedEventIds"])
        all_input_ids = {view["calendarEventId"] for view in views}
        if student.result["includedEventCount"] != 601:
            errors.append("student reference feed must contain 601 events")
        if job.result["includedEventCount"] != 299:
            errors.append("job reference feed must contain 299 events")
        if student_ids & job_ids:
            errors.append("student and job reference feeds must be disjoint")
        if student_ids | job_ids != all_input_ids:
            errors.append("student and job reference feeds must partition all 900 active events")

        try:
            student_ics_ids = set(parse_ics_event_ids(
                root / "projection/s27d-v1/feeds/student_default/noticepilot-student-default.ics"
            ))
            job_ics_ids = set(parse_ics_event_ids(
                root / "projection/s27d-v1/feeds/job_application/noticepilot-job-applications.ics"
            ))
            if student_ids != student_ics_ids:
                errors.append("student FeedBuilder membership differs from S27-D persistent ICS")
            if job_ids != job_ics_ids:
                errors.append("job FeedBuilder membership differs from S27-D persistent ICS")
        except Exception as exc:
            student_ics_ids = set()
            job_ics_ids = set()
            errors.append(f"persistent ICS parity check failed: {exc}")
    else:
        student = job = None
        student_ids = job_ids = all_input_ids = set()
        student_ics_ids = job_ics_ids = set()

    registry_manifest = root / "registry/s27c-v1/manifest.json"
    projection_manifest = root / "projection/s27d-v1/manifest.json"
    registry_hash = file_sha256(registry_manifest)
    projection_hash = file_sha256(projection_manifest)
    if registry_hash != EXPECTED_S27C_MANIFEST_SHA256:
        errors.append("S27-C manifest differs from the immutable expected hash")
    if projection_hash != EXPECTED_S27D_MANIFEST_SHA256:
        errors.append("S27-D manifest differs from the immutable expected hash")

    forbidden_result_fields = {
        "snapshotId", "snapshotHash", "contentDigest", "subscriptionUrl",
        "feedToken", "feedTokenHash", "ics", "icsPath",
    }
    leaked_fields: list[str] = []
    for output in outputs.values():
        leaked_fields.extend(sorted(forbidden_result_fields & set(output.result)))
    errors.extend(f"deferred field leaked into FeedBuilder result: {field}" for field in leaked_fields)

    report = {
        "schemaVersion": AUDIT_SCHEMA_VERSION,
        "auditorVersion": AUDITOR_VERSION,
        "result": "pass" if not errors else "fail",
        "status": "completed" if not errors else "failed",
        "scope": {
            "defaultProfileFactoryImplemented": True,
            "deterministicFeedBuilderImplemented": True,
            "fullActiveCorpusIterationPerformed": True,
            "eligibilityDecisionLedgerProduced": True,
            "feedSnapshotImplemented": False,
            "snapshotIdentityOrHashIssued": False,
            "subscriptionUrlOrTokenIssued": False,
            "icsSerializationPerformed": False,
            "s27RegistryMutationPerformed": False,
            "s27ProjectionMutationPerformed": False,
        },
        "builder": {
            "module": "noticepilot_feed_builder.py",
            "version": FEED_BUILDER_VERSION,
            "policySchemaVersion": policy.get("schemaVersion") if policy else None,
            "policyVersion": policy.get("policyVersion") if policy else None,
            "sourceContext": source_context,
            "sortContract": student.result["sortContract"] if student else None,
        },
        "profiles": {
            "collectionPath": "configs/noticepilot_default_subscription_profiles.v0.1.json",
            "collectionSchemaVersion": collection.get("schemaVersion") if collection else None,
            "authoritativePolicyDefaults": collection.get("authoritativePolicyDefaults") if collection else None,
            "userCampusDefaultEstablished": collection.get("userCampusDefaultEstablished") if collection else None,
            "profileCount": len(profiles),
        },
        "counts": {
            "inputEventCount": len(views),
            "studentIncludedEventCount": student.result["includedEventCount"] if student else 0,
            "studentExcludedEventCount": student.result["excludedEventCount"] if student else 0,
            "jobIncludedEventCount": job.result["includedEventCount"] if job else 0,
            "jobExcludedEventCount": job.result["excludedEventCount"] if job else 0,
            "studentDecisionCount": len(student.decisions) if student else 0,
            "jobDecisionCount": len(job.decisions) if job else 0,
            "studentJobOverlapCount": len(student_ids & job_ids),
            "studentJobUnionCount": len(student_ids | job_ids),
            "persistentIcsStudentEventCount": len(student_ics_ids),
            "persistentIcsJobEventCount": len(job_ics_ids),
        },
        "reasonCounts": {
            "student": student.result["primaryReasonCounts"] if student else {},
            "job": job.result["primaryReasonCounts"] if job else {},
        },
        "determinism": {
            "studentResultStableUnderReverseInput": bool(student and student.result == reverse_outputs["student_default"].result),
            "studentDecisionLedgerStableUnderReverseInput": bool(student and student.decisions == reverse_outputs["student_default"].decisions),
            "jobResultStableUnderReverseInput": bool(job and job.result == reverse_outputs["job_application"].result),
            "jobDecisionLedgerStableUnderReverseInput": bool(job and job.decisions == reverse_outputs["job_application"].decisions),
        },
        "immutability": {
            "s27cManifestSha256": registry_hash,
            "s27cManifestExpectedSha256": EXPECTED_S27C_MANIFEST_SHA256,
            "s27dManifestSha256": projection_hash,
            "s27dManifestExpectedSha256": EXPECTED_S27D_MANIFEST_SHA256,
        },
        "deferred": {
            "feedSnapshotContract": "S28-4",
            "snapshotIdentityAndHash": "S28-4",
            "profileMatrixFullCorpusAudit": "S28-5",
            "subscriptionUrlTokenPersistenceAndDelivery": "S29",
            "calendarClientPhysicalQa": "S30",
        },
        "errors": errors,
    }

    if output_dir is not None:
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "default-subscription-profiles.json").write_text(
            json.dumps(collection, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        artifact_paths: dict[str, Any] = {}
        for kind, output in outputs.items():
            artifact_paths[kind] = write_feed_build_artifacts(
                output_dir, profile_kind=kind, output=output
            )
        report["artifacts"] = {
            "defaultProfiles": "default-subscription-profiles.json",
            "studentBuildResult": artifact_paths.get("student_default", {}).get("result"),
            "studentDecisionLedger": artifact_paths.get("student_default", {}).get("decisions"),
            "jobBuildResult": artifact_paths.get("job_application", {}).get("result"),
            "jobDecisionLedger": artifact_paths.get("job_application", {}).get("decisions"),
        }
        (output_dir / "s28-feed-builder-audit.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    report = build_report(args.root, args.output_dir)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["result"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
