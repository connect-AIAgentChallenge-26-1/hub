#!/usr/bin/env python3
"""Run non-destructive live PostgreSQL checks for S29."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from noticepilot_live_postgres_verifier import (
    LivePostgresVerificationError,
    validate_live_verification_report,
    verify_live_postgres,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--dsn", required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    try:
        report = verify_live_postgres(dsn=args.dsn, root=args.root)
        validate_live_verification_report(report)
    except LivePostgresVerificationError as exc:
        raise SystemExit(str(exc)) from exc

    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        output = args.output
        if not output.is_absolute():
            output = args.root.resolve() / output
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    if report["status"] != "pass":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
