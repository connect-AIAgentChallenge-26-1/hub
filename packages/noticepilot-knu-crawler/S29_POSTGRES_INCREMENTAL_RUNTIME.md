# S29 — PostgreSQL persistence and incremental runtime wiring

Status: **implemented in isolation; live PostgreSQL execution pending**  
Package target: `0.4.4-observation.3-policy.15-foundation.24.3`

## 1. Scope

S29 maps the S27 atomic event boundary and the S28 profile/snapshot boundary to a PostgreSQL-oriented persistence contract.

```text
Periodic crawler batch
→ source identity + content-hash comparison
→ atomic source state / processing state / outbox commit
→ extraction and reconciliation workers
→ deterministic FeedBuilder
→ immutable feed snapshot
→ stable subscription feed identity
→ token-authenticated read-only ICS endpoint
```

The package includes SQL migration, a PEP-249 repository loader, an in-memory transaction reference, content-hash planning, durable-outbox coordination, opaque feed-token handling, and a read-only WSGI endpoint.

The execution environment used to build this package does **not** contain a PostgreSQL server or a Python PostgreSQL driver. Therefore the DDL and DB-API calls were statically and behaviorally validated but were not executed against a live PostgreSQL process. No contrary claim is made.

## 2. PostgreSQL schema

Migration:

```text
migrations/postgresql/0001_s29_initial.sql
```

Primary persisted aggregates:

- `source_notice`
- `extraction_run`
- `calendar_event_candidate`
- `calendar_event`
- `calendar_event_revision`
- `calendar_event_source_link`
- `candidate_event_assignment`
- `cross_notice_relation_decision`
- `subscription_profile_revision`
- `subscription_profile_head`
- `feed_snapshot`
- `feed_snapshot_event`
- `subscription_feed`
- `subscription_feed_snapshot_history`
- `runtime_outbox`
- `crawler_checkpoint`
- `source_processing_state`

The event active-revision foreign key is `DEFERRABLE INITIALLY DEFERRED`, allowing event and revision rows to commit in the same transaction. Partial unique indexes enforce one active revision and one active canonical source per event.

All structured domain payloads use `jsonb`; normalized identity, status, sequence, version, content hash, timestamps, and relationship columns remain queryable first-class fields.

## 3. Foundation bootstrap

`build_foundation_bootstrap_bundle()` projects foundation.23 artifacts into database rows:

```text
source notices                    2,059
extraction runs                   2,059
calendar event candidates         1,304
calendar events                     900
calendar event revisions             901
calendar event source links          909
candidate/event assignments          909
cross-notice relation decisions      343
subscription profile revisions         2
subscription profile heads             2
feed snapshots                         2
feed snapshot memberships            900
```

The in-memory PostgreSQL reference store verifies:

- atomic rollback;
- immutable-row conflict detection;
- idempotent second bootstrap;
- foreign-key-equivalent coverage;
- exactly one active revision per event;
- exactly one active canonical source per event;
- contiguous snapshot membership positions.

A real deployment can run:

```bash
python3 tools/apply_s29_postgres.py --root . --dry-run
python3 tools/apply_s29_postgres.py --root . --dsn "$NOTICEPILOT_POSTGRES_DSN"
```

The second command requires `psycopg`, a reachable PostgreSQL instance, and deployment-owned credentials.

## 4. Incremental source planner

The planner classifies each crawler result as:

```text
insert_and_extract
reprocess_content_changed
refresh_metadata_only
skip_unchanged
mark_deleted
retain_last_good_retry
```

Authoritative reprocessing key:

```text
source identity + contentHash + extractorVersion + policyVersion
```

An unchanged content hash does not enqueue extraction. A changed content hash atomically updates source state and emits `extract_source_notice`. A missing/deleted notice emits reconciliation work without re-extraction. A fetch failure preserves the last good content and emits retry work.

The full 2,059-notice replay produced:

```text
skip_unchanged                  2,059
outbox intents                     0
```

A one-notice changed-content simulation produced:

```text
reprocess_content_changed          1
extract_source_notice outbox       1
```

## 5. Subscription delivery identity

Feed identity and event identity remain separate.

```text
CalendarEvent UID: evt_<opaque>@noticepilot.local
Subscription feed ID: feed_<32 lowercase hexadecimal>
Snapshot ID: feedsnap_<content hash prefix>
```

The subscription path contract is:

```text
/subscription-feeds/{feedId}/{opaqueToken}.ics
```

Only SHA-256 token hash and a 12-character diagnostic prefix are stored. The raw token is returned once to the provisioning caller and is not persisted. Token rotation preserves the feed ID and invalidates the previous token.

Read behavior:

- invalid feed/token: `404`;
- paused feed: `503` with `Retry-After`;
- revoked feed: `410`;
- matching `If-None-Match`: `304`;
- active feed: `200 text/calendar; charset=utf-8`.

The response ETag is the current immutable snapshot hash. Updating the snapshot preserves feed ID and token while changing ETag and membership.

## 6. Full-corpus delivery audit

Reference feeds were provisioned with non-deployable audit credentials. Raw tokens were never written to disk.

```text
student feed VEVENTs             601
job feed VEVENTs                 299
persistent UID leakage errors      0
ETag conditional GET              304
```

S27 persistent event projection and S28 snapshot membership are reused; no candidate-derived UID is reintroduced.

## 7. Live PostgreSQL completion evidence

The migration, full bootstrap, identical rerun, live constraints, atomic rollback, advisory-lock contention/release, and final zero-residue checks passed against local PostgreSQL 16.14.

Registered evidence:

```text
path: runtime/s29-v1/live-postgres-verification.json
reportSha256: eb66e820ac8885296a4389889519fe78a53a22d7eb814625dafe391f1a3dddbf
fileSha256: 8eecf611b93725372cafd5adfbef05717c0b66c5d9ae3b314233a7222a55d36d
status: pass
livePostgresVerified: true
probeResidue: []
mutationsCommitted: false
```

S29 is complete and S30 is unblocked. Connection pooling, worker supervision, production URL/secret configuration, TLS deployment, managed backup/PITR, and physical Samsung Calendar QA remain subsequent operational work.

## 8. Validation

```bash
python3 -m unittest \
  tests.test_s29_postgres_persistence \
  tests.test_s29_incremental_runtime \
  tests.test_s29_subscription_delivery

python3 tools/audit_s29_postgres_runtime.py --root .
```
