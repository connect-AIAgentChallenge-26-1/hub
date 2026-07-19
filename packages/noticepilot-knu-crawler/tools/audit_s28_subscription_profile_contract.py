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

from noticepilot_subscription_profile import load_canonical_board_map, load_profile_examples

AUDIT_SCHEMA_VERSION = "noticepilot.s28SubscriptionProfileContractAudit.v0.1"
AUDITOR_VERSION = "0.1.1"
EXPECTED_FOUNDATION17_S27C_MANIFEST_SHA256 = "47fa8e232254df978575f31e06d555c20cf5f50e99862dc8ae0e772a7e4a03dc"
EXPECTED_FOUNDATION17_S27D_MANIFEST_SHA256 = "922eacc5a270f5119d0e86892d961ed742486b35b6a65d7a0d1642119820481f"


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_manifest_artifacts(base: Path, manifest: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for name, entry in (manifest.get("artifacts") or {}).items():
        path = base / entry["path"]
        if not path.exists():
            errors.append(f"missing artifact {name}: {entry['path']}")
        elif file_sha256(path) != entry["sha256"]:
            errors.append(f"artifact hash mismatch {name}: {entry['path']}")
    for name, entry in (manifest.get("feeds") or {}).items():
        for kind in ("ics", "report"):
            item = entry[kind]
            path = base / item["path"]
            if not path.exists():
                errors.append(f"missing feed artifact {name}/{kind}: {item['path']}")
            elif file_sha256(path) != item["sha256"]:
                errors.append(f"feed artifact hash mismatch {name}/{kind}")
    return errors


def build_report(root: Path, output_dir: Path | None = None) -> dict[str, Any]:
    root = root.resolve()
    schema_path = root / "schemas/subscription-profile/subscription-profile.schema.json"
    examples_path = root / "configs/subscription_profile_contract_examples.v0.1.json"
    board_path = root / "configs/knu_board_registry.v0.2.json"
    registry_path = root / "registry/s27c-v1/manifest.json"
    projection_path = root / "projection/s27d-v1/manifest.json"

    errors: list[str] = []
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
    except Exception as exc:
        schema = {}
        errors.append(f"schema parse failed: {exc}")
    try:
        board_map = load_canonical_board_map(board_path)
        examples = load_profile_examples(examples_path, canonical_board_map=board_map)
    except Exception as exc:
        board_map = {}
        examples = []
        errors.append(f"profile contract validation failed: {exc}")

    registry_manifest_sha256 = file_sha256(registry_path)
    projection_manifest_sha256 = file_sha256(projection_path)
    if registry_manifest_sha256 != EXPECTED_FOUNDATION17_S27C_MANIFEST_SHA256:
        errors.append("S27-C manifest differs from foundation.17")
    if projection_manifest_sha256 != EXPECTED_FOUNDATION17_S27D_MANIFEST_SHA256:
        errors.append("S27-D manifest differs from foundation.17")
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    projection = json.loads(projection_path.read_text(encoding="utf-8"))
    errors.extend(validate_manifest_artifacts(root / "registry/s27c-v1", registry))
    errors.extend(validate_manifest_artifacts(root / "projection/s27d-v1", projection))

    required_root = set(schema.get("required") or [])
    explicit_policy_fields = {
        "includeAllCampusEvents",
        "includeUnknownCampusEvents",
        "includeReviewRequiredEvents",
        "unscopedEventPolicy",
    }
    schema_text = schema_path.read_text(encoding="utf-8") if schema_path.exists() else ""
    missing_explicit = sorted(field for field in explicit_policy_fields if f'"{field}"' not in schema_text)
    errors.extend(f"missing explicit policy field: {field}" for field in missing_explicit)

    forbidden = ["feedTokenHash", "publicSlug", "subscriptionUrl", "icsUrl", "eventIds"]
    leaked_schema_fields = [field for field in forbidden if f'"{field}"' in schema_text]
    errors.extend(f"delivery/projection field leaked into profile schema: {field}" for field in leaked_schema_fields)

    checks = {
        "subscriptionProfileSchemaVersion": schema.get("properties", {}).get("schemaVersion", {}).get("const"),
        "requiredRootFieldCount": len(required_root),
        "validContractExampleCount": len(examples),
        "authoritativeDefaultProfileCount": 0,
        "canonicalBoardCount": len(board_map),
        "explicitPolicyFieldCount": len(explicit_policy_fields) - len(missing_explicit),
        "deliveryIdentityFieldLeakCount": len(leaked_schema_fields),
        "s27cManifestSha256": registry_manifest_sha256,
        "s27dManifestSha256": projection_manifest_sha256,
        "foundation17ManifestHashMatch": registry_manifest_sha256 == EXPECTED_FOUNDATION17_S27C_MANIFEST_SHA256 and projection_manifest_sha256 == EXPECTED_FOUNDATION17_S27D_MANIFEST_SHA256,
        "s27CalendarEventCount": registry.get("counts", {}).get("calendarEventCount"),
        "s27PersistentUidCount": projection.get("counts", {}).get("persistentUidCount"),
        "s27StudentFeedEventCount": projection.get("feeds", {}).get("student_default", {}).get("eventCount"),
        "s27JobApplicationFeedEventCount": projection.get("feeds", {}).get("job_application", {}).get("eventCount"),
        "registryArtifactErrorCount": sum(1 for error in errors if "artifact" in error and "feed" not in error),
        "projectionArtifactErrorCount": sum(1 for error in errors if "feed artifact" in error),
        "errorCount": len(errors),
    }
    report = {
        "schemaVersion": AUDIT_SCHEMA_VERSION,
        "auditorVersion": AUDITOR_VERSION,
        "result": "pass" if not errors else "fail",
        "scope": {
            "subscriptionProfileContractDefined": True,
            "profileDefaultsApproved": False,
            "feedEligibilityRulesImplemented": False,
            "feedBuilderImplemented": False,
            "feedSnapshotImplemented": False,
            "subscriptionTokenIssued": False,
            "subscriptionEndpointImplemented": False,
            "s27RegistryMutationPerformed": False,
            "s27ProjectionMutationPerformed": False,
            "icsMutationPerformed": False,
        },
        "checks": checks,
        "artifacts": {
            "schema": "schemas/subscription-profile/subscription-profile.schema.json",
            "validator": "noticepilot_subscription_profile.py",
            "examples": "configs/subscription_profile_contract_examples.v0.1.json",
            "contractDocument": "S28_1_SUBSCRIPTION_PROFILE_CONTRACT.md",
        },
        "deferredToS28_2": [
            "default_profile_policy",
            "campus_match_decision_order",
            "source_link_join_semantics",
            "review_required_event_state_projection",
            "audience_unscoped_event_product_default",
            "selection_reason_vocabulary",
        ],
        "errors": errors,
    }
    if output_dir is not None:
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "s28-subscription-profile-contract-audit.json").write_text(
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
