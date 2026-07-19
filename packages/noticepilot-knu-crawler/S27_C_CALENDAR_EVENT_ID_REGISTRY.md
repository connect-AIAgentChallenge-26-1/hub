# S27-C Stable CalendarEventId registry and revision history

## Status

S27-C is complete as an isolated consumer/persistence foundation.

- Registry ID: `s27c-publishable-corpus-20260713-v1`
- ID strategy: `registry_assigned_opaque_v0`
- Registry directory: `registry/s27c-v1`
- ICS UID migration: not performed
- Existing candidate/runtime mutation: not performed

## Materialized identity set

```text
publishable candidates             909
CalendarEvent identities           900
candidate assignments              909
source links                       909
revision records                   901
active revisions                   900
persisted pair decisions           343
promotion decisions                900
pending projection outbox intents  900
```

Nine approved S27-B merge plans collapse eighteen candidates into nine event identities:

- eight cross-board `duplicate` identities;
- one explicit `extension` identity.

The remaining 891 candidates retain one-to-one event identity. This preserves the existing published projection while avoiding any merge for `needs_review` relationships.

## Opaque identity contract

Registry IDs use random opaque tokens and never encode:

- title;
- date or time;
- board/post number;
- candidate ID;
- content hash.

The persisted candidate-to-event assignment is the source of identity stability. Re-running normalization cannot derive or replace the ID.

## Relation persistence

All 343 S27-B pair decisions are stored.

```text
distinct      100
needs_review  234
duplicate       8
extension       1
```

Only the eight duplicates and one extension have `mergeApplied=true`. Every `needs_review` decision references two independently assigned event IDs and remains unmerged.

## Source provenance

Every publishable candidate has exactly one `CalendarEventSourceLink`.

- each event has exactly one canonical source link;
- duplicate identities retain the general-board and specialized-board source links;
- extension identity retains both the original and extension notice;
- observed and canonical URLs remain separate;
- source identity and pair/rule evidence remain auditable.

## Revision history

Every event has one active revision.

Duplicate and singleton events begin at:

```text
revisionNumber = 1
sequence = 0
```

The extension event preserves:

```text
revision 1: 2026-02-05 through 2026-02-13, sequence 0, inactive
revision 2: 2026-02-05 through 2026-02-19, sequence 1, active
```

Both revisions share one opaque `CalendarEventId`.

## Atomic snapshot boundary

The builder constructs and validates the complete registry in memory, writes all files to a temporary sibling directory, and performs one atomic directory rename. A validation or write failure leaves no partial registry.

The builder refuses to overwrite a nonempty registry directory. S29 will replace this file-backed reference transaction with a database transaction while retaining the same invariants.

## Outbox boundary

Each event has one pending `calendar_event_projection_changed` intent. The outbox is not consumed in S27-C.

```text
status = pending_s27d_projection
icsSerialized = false
```

S27-D owns ICS UID migration and serializer output.

## Commands

Build once:

```bash
python3 tools/build_s27c_calendar_event_registry.py \
  --current derived/mvp-policy-v0.1 \
  --registry registry/s27c-v1
```

Audit:

```bash
python3 tools/audit_s27c_calendar_event_registry.py \
  --current derived/mvp-policy-v0.1 \
  --registry registry/s27c-v1
```


## Downstream status

S27-D now consumes the 900 pending intents through an immutable receipt ledger under `projection/s27d-v1`. The original S27-C registry remains unchanged and continues to represent the pre-projection persistence snapshot.
