# S29-LIVE-POSTGRES-VERIFY — Live constraint and rollback verification

Status: completed; live execution passed

Package target: `0.4.4-observation.3-policy.15-foundation.24.3`

## Purpose

This gate validates the S29 PostgreSQL contract against a real PostgreSQL instance after migration and bootstrap have succeeded. It does not create product data and does not require a disposable database.

The verifier uses temporary identifiers and rolls back every probe transaction. A passing report requires a final residue scan of zero rows.

## Preconditions

- PostgreSQL is running;
- `0001_s29_initial` is recorded with checksum `a542301b0630c17a27169b4412f439f54f133c2d95b08a01d39e188b9ce8c759`;
- the foundation bootstrap row counts match `runtime/s29-v1/bootstrap-manifest.json`;
- `psycopg` is installed in the active Python environment.

Migration/bootstrap, identical rerun, live constraints, rollback, advisory lock, and residue checks passed on the user's local PostgreSQL 16.14 test database. The generated report is registered as immutable package evidence.

## Command

```bash
python3 tools/verify_s29_live_postgres.py \
  --root . \
  --dsn "dbname=noticepilot_s29_test host=localhost user=$(whoami)" \
  --output runtime/s29-v1/live-postgres-verification.json
```

The DSN is used only for the connection. It is not written to the report.

## Checks

The report must pass all of the following:

1. tracked migration checksum matches the checked-in SQL;
2. all 12 bootstrap table counts match the immutable manifest;
3. identical migration rerun skips DDL;
4. `source_notice.status` CHECK rejects an invalid value (`23514`);
5. source identity UNIQUE rejects a duplicate (`23505`);
6. extraction/source FOREIGN KEY rejects a missing notice (`23503`);
7. the one-active-revision partial unique index rejects a second active revision;
8. the one-active-canonical-source partial unique index rejects a second canonical source;
9. subscription feed status/token CHECK rejects an active feed without a token hash;
10. a multi-write transaction fully rolls back after a later FK failure;
11. the migration advisory lock excludes a competing transaction and releases on rollback;
12. every generated probe identifier has zero residue after verification.

## Safety boundary

- no schema is dropped or altered;
- no existing row is updated or deleted;
- no verification row is committed;
- no DSN, password, raw feed token, or subscription URL is written to the report;
- a failed check exits non-zero and leaves the database unchanged.

## Completion rule

`S29-LIVE-POSTGRES-VERIFY` may be marked completed only when the generated report contains:

```json
{
  "status": "pass",
  "livePostgresVerified": true,
  "probeResidue": [],
  "mutationsCommitted": false
}
```

The report is available at `runtime/s29-v1/live-postgres-verification.json`, has semantic SHA-256 `eb66e820ac8885296a4389889519fe78a53a22d7eb814625dafe391f1a3dddbf`, and unblocks S30.


## Registered completion evidence

```text
path: runtime/s29-v1/live-postgres-verification.json
reportSha256: eb66e820ac8885296a4389889519fe78a53a22d7eb814625dafe391f1a3dddbf
fileSha256: 8eecf611b93725372cafd5adfbef05717c0b66c5d9ae3b314233a7222a55d36d
status: pass
livePostgresVerified: true
probeResidue: []
mutationsCommitted: false
```
