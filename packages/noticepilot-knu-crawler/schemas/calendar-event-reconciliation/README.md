# CalendarEvent reconciliation contract draft

S27-A defines diagnostic and draft contracts only. No runtime candidate is mutated,
no CalendarEventId is assigned, and no relation is automatically decided.

Allowed future relation values are `distinct`, `duplicate`, `revision`, `extension`,
`replacement`, and `needs_review`. Every S27-A pair remains
`creator_decision_required` until the product owner approves the policy decisions in
`S27_A_CREATOR_DECISION_PACKET.md`.

## S27-C registry contracts

- `calendar-event-registry-event.schema.json`
- `calendar-event-revision.schema.json`
- `calendar-event-identity-assignment.schema.json`
- `persisted-cross-notice-relation.schema.json`
- `calendar-event-promotion-decision.schema.json`
- `calendar-event-registry-manifest.schema.json`
- `calendar-event-projection-outbox-intent.schema.json`

These are isolated consumer/persistence contracts. They do not change the producer candidate schema or serialize ICS.


## S27-D persistent ICS projection schemas

- `registry-ics-projection-manifest.schema.json`
- `registry-ics-feed-report.schema.json`
- `calendar-event-projection-outbox-receipt.schema.json`
- `legacy-candidate-uid-cutover-map.schema.json`
- `active-calendar-event-projection.schema.json`

These schemas describe the immutable S27-D projection snapshot. They do not mutate the S27-C registry or the legacy candidate-UID ICS artifacts.
