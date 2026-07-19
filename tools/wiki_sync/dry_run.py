"""Command-line entry point for deterministic Wiki sync dry-runs."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .audit import AuditError, audit_mapping, canonical_json_bytes


class _ArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise AuditError(f"invalid CLI: {message}")


def _parser() -> argparse.ArgumentParser:
    parser = _ArgumentParser(description="Audit a repository-to-Wiki mapping")
    parser.add_argument("--repository-root", type=Path, required=True)
    parser.add_argument("--wiki-root", type=Path, required=True)
    parser.add_argument("--mapping", type=Path, required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    try:
        args = _parser().parse_args(argv)
        result = audit_mapping(args.repository_root, args.wiki_root, args.mapping)
    except AuditError as error:
        sys.stderr.write(f"wiki-sync audit failed: {error}\n")
        return 1
    except Exception as error:  # pragma: no cover - terminal safety boundary
        sys.stderr.write(f"wiki-sync internal failure: {error}\n")
        return 1
    sys.stdout.buffer.write(canonical_json_bytes(result))
    return 2 if result["status"] == "blocked" else 0


if __name__ == "__main__":
    raise SystemExit(main())
