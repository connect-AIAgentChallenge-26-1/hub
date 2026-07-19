#!/usr/bin/env python3
from __future__ import annotations
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from noticepilot_s30_qa_server import serve


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve local S30 Samsung Calendar QA lifecycle feed")
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--runtime", type=Path, default=Path("runtime/s30-v1"))
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    root = args.root.resolve()
    runtime = args.runtime if args.runtime.is_absolute() else root / args.runtime
    serve(runtime, args.host, args.port)


if __name__ == "__main__":
    main()
