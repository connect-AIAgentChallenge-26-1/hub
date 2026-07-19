# S29 Live PostgreSQL Migration Runner Hotfix

## Defect

The original `execute_migration()` executed `0001_s29_initial.sql` on every run. The SQL file contains its own `BEGIN/COMMIT`, so DDL could commit before the migration checksum row was recorded. An identical rerun then failed with `DuplicateTable`.

## Correction

- the runner owns one transaction and strips only the outer SQL `BEGIN/COMMIT` in memory;
- a transaction-scoped PostgreSQL advisory lock serializes migration application;
- an existing matching checksum skips DDL;
- a conflicting checksum fails closed;
- application tables without a tracked migration row fail closed instead of being modified;
- migration DDL and the checksum row commit atomically.

## Recovery

For a disposable test database, drop and recreate the database, then run the patched tool twice. The first run applies migration/bootstrap; the second skips DDL and reports zero inserted rows.
