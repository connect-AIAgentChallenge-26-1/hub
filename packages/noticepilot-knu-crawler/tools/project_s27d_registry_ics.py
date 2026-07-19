#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from noticepilot_registry_ics_projector import write_projection_snapshot


def main() -> int:
    parser = argparse.ArgumentParser(description="Project the S27-C registry into persistent-UID ICS feeds.")
    parser.add_argument("--root", default=str(ROOT))
    parser.add_argument("--registry", default=str(ROOT / "registry" / "s27c-v1"))
    parser.add_argument("--output", default=str(ROOT / "projection" / "s27d-v1"))
    parser.add_argument("--created-at", default="2026-07-13T12:30:00+09:00")
    args = parser.parse_args()
    try:
        manifest = write_projection_snapshot(
            root=Path(args.root).resolve(),
            registry_dir=Path(args.registry).resolve(),
            output_dir=Path(args.output).resolve(),
            created_at=args.created_at,
        )
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
