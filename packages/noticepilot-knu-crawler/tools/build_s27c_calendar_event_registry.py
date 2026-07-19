#!/usr/bin/env python3
"""Create the immutable S27-C opaque CalendarEvent registry snapshot."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from noticepilot_calendar_event_registry import (
    OpaqueIdIssuer,
    REGISTRY_ID,
    build_manifest,
    materialize_registry,
)

DEFAULT_CREATED_AT = "2026-07-13T11:30:00+09:00"
FILES = {
    "events": "calendar-events.jsonl",
    "sourceLinks": "calendar-event-source-links.jsonl",
    "revisions": "calendar-event-revisions.jsonl",
    "assignments": "candidate-event-assignments.jsonl",
    "relationDecisions": "relation-decisions.jsonl",
    "promotionDecisions": "promotion-decisions.jsonl",
    "outbox": "projection-outbox-intents.jsonl",
}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--registry", type=Path, required=True)
    parser.add_argument("--created-at", default=DEFAULT_CREATED_AT)
    args = parser.parse_args()

    current = args.current.resolve()
    destination = args.registry.resolve()
    if destination.exists():
        if destination.is_dir() and any(destination.iterdir()):
            raise SystemExit(f"refusing to overwrite nonempty registry: {destination}")
        if destination.is_file():
            raise SystemExit(f"registry target is a file: {destination}")
        destination.rmdir()
    destination.parent.mkdir(parents=True, exist_ok=True)

    source = current / "reports" / "s27b-cross-notice"
    views = read_jsonl(source / "reconciliation-candidate-views.jsonl")
    decisions = read_jsonl(source / "relation-decisions.jsonl")
    plans = read_jsonl(source / "merge-plans.jsonl")
    approved_plans = [row for row in plans if row.get("status") == "approved"]

    artifacts = materialize_registry(
        views=views,
        relation_decisions=decisions,
        merge_plans=plans,
        issuer=OpaqueIdIssuer(),
        now=args.created_at,
        registry_id=REGISTRY_ID,
    )

    temporary = Path(tempfile.mkdtemp(prefix=f".{destination.name}.", dir=destination.parent))
    try:
        artifact_files: dict[str, Path] = {}
        for key, filename in FILES.items():
            path = temporary / filename
            write_jsonl(path, list(artifacts[key]))  # type: ignore[arg-type]
            artifact_files[key] = path
        manifest = build_manifest(
            registry_id=REGISTRY_ID,
            created_at=args.created_at,
            artifacts=artifacts,
            artifact_files=artifact_files,
            publishable_candidate_count=len(views),
            s27b_merge_plan_count=len(approved_plans),
        )
        from noticepilot_calendar_event_registry import file_sha256
        manifest["upstream"] = {
            "policyVersion": "noticepilot.crossNoticeReconciliationPolicy.v0.3",
            "s27bAudit": {
                "path": "../../derived/mvp-policy-v0.1/reports/s27b-cross-notice/s27b-cross-notice-reconciler-audit.json",
                "sha256": file_sha256(source / "s27b-cross-notice-reconciler-audit.json"),
            },
            "reconciliationCandidateViews": {
                "path": "../../derived/mvp-policy-v0.1/reports/s27b-cross-notice/reconciliation-candidate-views.jsonl",
                "sha256": file_sha256(source / "reconciliation-candidate-views.jsonl"),
            },
            "relationDecisions": {
                "path": "../../derived/mvp-policy-v0.1/reports/s27b-cross-notice/relation-decisions.jsonl",
                "sha256": file_sha256(source / "relation-decisions.jsonl"),
            },
            "mergePlans": {
                "path": "../../derived/mvp-policy-v0.1/reports/s27b-cross-notice/merge-plans.jsonl",
                "sha256": file_sha256(source / "merge-plans.jsonl"),
            },
        }
        (temporary / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        os.replace(temporary, destination)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise

    print(json.dumps({
        "result": "created",
        "registry": str(destination),
        "registryId": REGISTRY_ID,
        "counts": manifest["counts"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
