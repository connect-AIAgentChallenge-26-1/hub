#!/usr/bin/env python3
from __future__ import annotations
import argparse
from pathlib import Path

STAGES = ("initial", "updated", "cancelled")


def main() -> None:
    parser = argparse.ArgumentParser(description="Change the active S30 physical QA lifecycle stage")
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--runtime", type=Path, default=Path("runtime/s30-v1"))
    parser.add_argument("--stage", required=True, choices=STAGES)
    args = parser.parse_args()
    root = args.root.resolve()
    runtime = args.runtime if args.runtime.is_absolute() else root / args.runtime
    target = runtime / "active-stage.txt"
    if not (runtime / "fixtures" / f"{args.stage}.ics").exists():
        raise SystemExit(f"fixture is missing for stage: {args.stage}")
    target.write_text(args.stage + "\n", encoding="utf-8")
    print(f"S30 QA stage: {args.stage}")


if __name__ == "__main__":
    main()
