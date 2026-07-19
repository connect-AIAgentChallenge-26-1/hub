# S29 runtime persistence schemas

- `postgres-bootstrap-manifest.schema.json`: immutable foundation bootstrap counts and upstream integrity.
- `incremental-source-plan.schema.json`: content-hash change classification and downstream work flags.
- `subscription-feed-delivery.schema.json`: persisted delivery identity. Raw feed tokens are deliberately absent.

The PostgreSQL DDL is under `migrations/postgresql/`. Actual network/database credentials are not part of these artifacts.
