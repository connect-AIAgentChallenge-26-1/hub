#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from noticepilot_samsung_calendar_qa import build_automated_qa


def main() -> None:
    parser = argparse.ArgumentParser(description="Build S30 automated Samsung Calendar QA artifacts")
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--output", type=Path, default=Path("runtime/s30-v1"))
    args = parser.parse_args()
    root = args.root.resolve()
    output = args.output if args.output.is_absolute() else root / args.output
    report = build_automated_qa(root, output)
    print(json.dumps({
        "automatedStatus": report["automatedStatus"],
        "physicalClientStatus": report["physicalClientStatus"],
        "s30Completed": report["s30Completed"],
        "reportSha256": report["reportSha256"],
        "output": str(output),
    }, ensure_ascii=False, indent=2))
    if report["automatedStatus"] != "pass":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
