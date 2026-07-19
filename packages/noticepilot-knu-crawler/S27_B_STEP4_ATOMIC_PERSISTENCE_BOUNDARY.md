# S27-B prerequisite 4 — Atomic promotion and relation persistence boundary

Status: completed

The following records form one atomic transaction:

1. approved relation or review decision;
2. opaque `CalendarEventId` issuance when creating an event;
3. CalendarEvent create/update with optimistic version check;
4. all `CalendarEventSourceLink` records;
5. revision record when event content changes;
6. projection-change outbox intent.

Any failure rolls back all six parts. An ID is never returned from an uncommitted transaction.

ICS serialization and file/feed delivery occur after commit by consuming the outbox. Raw ICS bytes are not written inside the transaction.

`needs_review` persists only the decision. It cannot create or mutate a CalendarEvent, source link, revision, or outbox intent.

## S27-C reference implementation

S27-C implements the boundary as an immutable file-backed registry snapshot. The complete event, source-link, revision, assignment, relation, promotion, and outbox set is built and validated in memory, written to a temporary sibling directory, and committed with one atomic directory rename. The builder refuses nonempty destination overwrite. S29 will map the same contract to a database transaction.
