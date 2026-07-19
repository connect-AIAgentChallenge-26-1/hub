# S27-D Persistent CalendarEvent ICS projection

## Status

S27-D is complete as an isolated projection foundation.

- Projection ID: `s27d-registry-ics-projection-20260713-v1`
- Source registry: `registry/s27c-v1`
- Projection directory: `projection/s27d-v1`
- Migration mode: `pre_subscription_cutover`
- Subscription endpoint: not implemented
- Physical calendar-client QA: deferred to S30

## UID cutover

Every active `CalendarEvent` is serialized with:

```text
UID:{calendarEventId}@noticepilot.local
```

The 909 legacy candidate UIDs are mapped to 900 persistent UIDs. Eight duplicate sources and one superseded extension revision collapse into their approved persistent events.

Legacy candidate UIDs were never contracted as durable subscription identities and no subscription endpoint exists. S27-D therefore performs a pre-subscription cutover and emits no legacy UID cancellation tombstones. Existing legacy ICS artifacts remain unchanged and are hash-checked by the audit.

## Feed results

```text
student_default: 609 legacy candidates -> 601 persistent events
job_application: 300 legacy candidates -> 299 persistent events
```

The reductions are exactly:

- eight approved cross-board duplicate collapses in the student feed;
- one inactive pre-extension revision in the job feed.

## Revision and sequence

- 899 events serialize with `SEQUENCE:0`.
- The explicit extension event preserves its opaque UID and serializes with `SEQUENCE:1`.
- Active events use `STATUS:CONFIRMED`.
- Future cancellations retain the same UID and use `STATUS:CANCELLED`; cancellation runtime and retention remain later work.

## Time semantics

- Core all-day end dates remain inclusive; ICS `DTEND` is exclusive.
- Timed events use `TZID=Asia/Seoul`.
- 155 timed events have no normalized end. S27-D omits `DTEND` rather than inventing a duration.
- UTF-8 lines are folded at 75 octets and files use CRLF.

## Source provenance

Each VEVENT carries the canonical source URL and repeated NoticePilot extension properties for every source link. Across the two feeds, all 909 source URLs are preserved.

## Outbox consumption

The immutable S27-C intent snapshot remains unchanged. S27-D writes 900 consumption receipts in `projection/s27d-v1/outbox-consumption-receipts.jsonl`, one for each intent.

## Commands

Build once:

```bash
python3 tools/project_s27d_registry_ics.py \
  --root . \
  --registry registry/s27c-v1 \
  --output projection/s27d-v1
```

Audit:

```bash
python3 tools/audit_s27d_ics_projection.py \
  --current derived/mvp-policy-v0.1 \
  --registry registry/s27c-v1 \
  --projection projection/s27d-v1
```
