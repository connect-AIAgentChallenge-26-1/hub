# S27-A Creator Decision Record

Status: **approved for S27-B implementation**  
Policy: `configs/noticepilot_cross_notice_reconciliation_policy.v0.3.json`

S27-A remains no-mutation: no relation was assigned, no `CalendarEventId` was issued, and ICS was not changed.

## Approved decisions

### D1 — Repeated title, different window

Default to `distinct`.

### D2 — Cross-board duplicate

Automatic `duplicate` is allowed only when all conditions hold:

- same base title;
- same `eventType` and `actionType`;
- same normalized interval and all-day mode;
- compatible campus scopes;
- compatible target actor and audience;
- no revision, extension, replacement, or cancellation evidence.

### D3 — Marker authority

- A marker alone never authorizes a relation.
- `extension` requires: only the later notice has the extension marker, same base title, same semantic/action/scope, same start, and a later end.
- `재공지` / `재안내` may become `duplicate` only when the CalendarEvent projection is exactly equal.
- `수정` / `정정` / `변경` remain `needs_review` in initial S27 even when a field change is explicit.
- `추가모집` / `마감` default to `distinct`.
- `대체` / `취소` without a body-level original-notice reference remain `needs_review`.

### D4 — Campus

Campus-disjoint notices are always `distinct`. No parent/child event identity is created.

### D5 — Stable ID

Use `registry_assigned_opaque_v0`. IDs are issued only after an approved relation is persisted.

### D6 — Cluster merge

Every member pair must have direct evidence. Transitive A–B–C connectivity is insufficient.

### D7 — ICS

One active ICS event is emitted per approved CalendarEvent identity. All source URLs and source candidate IDs remain preserved and auditable.

### D8 — Canonical precedence

Use canonical source identity first, then canonical source URL authority, source-board canonical/alias relationships, and finally an explicitly configured representative-board precedence. No notice-sequence, candidate-ID, or lexical-URL fallback is allowed.

The creator approved the partial precedence `715 행사안내 > 504 일반공지` and `721 장학공지 > 504 일반공지`. This must not be expanded into a total order; unconfigured board pairs remain `needs_review`.
