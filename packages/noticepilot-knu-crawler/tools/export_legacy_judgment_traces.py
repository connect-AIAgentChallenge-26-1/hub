#!/usr/bin/env python3
"""Export read-only S21 JudgmentTrace records from Policy.15 candidate JSONL."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from noticepilot_judgment_models import legacy_candidate_to_judgment_trace  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Policy.15 candidate JSONL")
    parser.add_argument("--output", type=Path, required=True, help="JudgmentTrace JSONL output")
    parser.add_argument("--pipeline-version", default="0.1.14")
    parser.add_argument("--policy-version", default="noticepilot.studentFirstMvp.v0.1")
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with args.input.open("r", encoding="utf-8") as source, args.output.open("w", encoding="utf-8", newline="\n") as target:
        for line_number, line in enumerate(source, start=1):
            if not line.strip():
                continue
            try:
                candidate = json.loads(line)
                trace = legacy_candidate_to_judgment_trace(
                    candidate,
                    pipeline_version=args.pipeline_version,
                    policy_version=args.policy_version,
                )
            except Exception as exc:
                raise RuntimeError(f"failed to adapt {args.input}:{line_number}: {exc}") from exc
            target.write(json.dumps(trace.to_dict(), ensure_ascii=False, sort_keys=True) + "\n")
            count += 1
    print(json.dumps({"traceCount": count, "output": str(args.output)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
