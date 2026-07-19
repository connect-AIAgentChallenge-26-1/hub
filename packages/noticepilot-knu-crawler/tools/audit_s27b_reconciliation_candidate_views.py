#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from noticepilot_reconciliation_candidate_view import (
    build_reconciliation_candidate_view,
    load_board_registry,
)


def read_jsonl(path: Path):
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    derived = args.current.resolve()
    candidates = read_jsonl(derived / "decisions" / "publishable-candidates.jsonl")
    notices = {row["sourceNoticeId"]: row for row in read_jsonl(derived / "decisions" / "notices.jsonl")}
    registry = load_board_registry(ROOT / "configs" / "knu_board_registry.v0.2.json")
    views = [build_reconciliation_candidate_view(row, notices[row["sourceNoticeId"]], registry) for row in candidates]
    report = {
        "schemaVersion": "noticepilot.s27bReconciliationCandidateViewAudit.v0.1",
        "result": "pass" if len(views) == 909 and len({row["candidateId"] for row in views}) == 909 else "fail",
        "checks": {
            "viewCount": len(views),
            "uniqueCandidateIdCount": len({row["candidateId"] for row in views}),
            "uniqueSourceIdentityCount": len({row["sourceIdentity"]["identityKey"] for row in views}),
            "canonicalSourceUrlCount": sum(bool(row["sourceIdentity"]["canonicalSourceUrl"]) for row in views),
            "candidateMutationPerformed": False,
            "calendarEventIdAssigned": False
        }
    }
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps({"report": report, "views": views}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["result"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
