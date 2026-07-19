#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from noticepilot_feed_builder import DeterministicFeedBuilder, load_default_profile_collection, load_feed_source_context
from noticepilot_feed_eligibility import build_eligibility_input_views, load_feed_eligibility_policy
from noticepilot_profile_matrix import build_profile_matrix, run_profile_matrix, write_profile_matrix_artifacts
from noticepilot_subscription_profile import load_canonical_board_map


def _profiles(root: Path, board_map: dict[str, str]) -> tuple[dict, dict]:
    _, profiles = load_default_profile_collection(
        root / "configs/noticepilot_default_subscription_profiles.v0.1.json",
        canonical_board_map=board_map,
    )
    student = next(row for row in profiles if row["eventSelection"]["includedFeedScopes"] == ["student_default"])
    job = next(row for row in profiles if row["eventSelection"]["includedFeedScopes"] == ["job_application"])
    return student, job


def build(root: Path, matrix_path: Path, output_dir: Path) -> dict:
    board_map = load_canonical_board_map(root / "configs/knu_board_registry.v0.2.json")
    policy = load_feed_eligibility_policy(root / "configs/noticepilot_feed_eligibility_policy.v0.2.json")
    student, job = _profiles(root, board_map)
    matrix = build_profile_matrix(student_profile=student, job_profile=job, canonical_board_map=board_map)
    matrix_path.parent.mkdir(parents=True, exist_ok=True)
    matrix_path.write_text(json.dumps(matrix, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    views = build_eligibility_input_views(root)
    builder = DeterministicFeedBuilder(
        policy=policy,
        canonical_board_map=board_map,
        source_context=load_feed_source_context(root),
    )
    run = run_profile_matrix(matrix=matrix, builder=builder, views=views, canonical_board_map=board_map)
    artifacts = write_profile_matrix_artifacts(output_dir, matrix=matrix, run=run)
    return {"matrixPath": str(matrix_path.relative_to(root)), "artifacts": artifacts, "result": run.result}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--matrix-path", type=Path)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    matrix_path = args.matrix_path or (root / "configs/noticepilot_profile_matrix.v0.1.json")
    output_dir = args.output_dir or (root / "derived/mvp-policy-v0.1/reports/s28-profile-matrix")
    result = build(root, matrix_path, output_dir)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["result"]["result"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
