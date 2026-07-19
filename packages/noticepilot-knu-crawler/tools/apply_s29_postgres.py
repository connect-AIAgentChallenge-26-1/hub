#!/usr/bin/env python3
"""Apply S29 migration/bootstrap to a real PostgreSQL database.

Requires `psycopg` in the deployment environment. The foundation package does
not vendor a driver or database credentials.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from noticepilot_postgres_persistence import (
    build_foundation_bootstrap_bundle,
    dbapi_bootstrap,
    execute_migration,
    file_sha256,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--dsn")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--migration-only", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    migration = root / "migrations/postgresql/0001_s29_initial.sql"
    bundle = build_foundation_bootstrap_bundle(root)
    if args.dry_run:
        print(json.dumps({
            "migration": str(migration.relative_to(root)),
            "migrationSha256": file_sha256(migration),
            "bootstrapCounts": bundle.counts,
            "bootstrapBundleSha256": bundle.integrity["bootstrapBundleSha256"],
        }, ensure_ascii=False, indent=2))
        return
    if not args.dsn:
        raise SystemExit("--dsn is required unless --dry-run is used")
    try:
        import psycopg  # type: ignore
    except ImportError as exc:
        raise SystemExit("psycopg is not installed in this environment") from exc
    with psycopg.connect(args.dsn) as connection:
        checksum = execute_migration(connection, migration)
        result = {} if args.migration_only else dbapi_bootstrap(connection, bundle)
    print(json.dumps({"migrationSha256": checksum, "inserted": result}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
