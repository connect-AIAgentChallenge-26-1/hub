#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from noticepilot_samsung_calendar_qa import validate_physical_report


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate completed Samsung Calendar physical QA report")
    parser.add_argument("--report", type=Path, default=Path("runtime/s30-v1/physical-qa/samsung-physical-qa-result.json"))
    args = parser.parse_args()
    report = json.loads(args.report.read_text(encoding="utf-8"))
    errors = validate_physical_report(report)
    result = {"status": "pass" if not errors else "fail", "errors": errors, "report": str(args.report)}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
