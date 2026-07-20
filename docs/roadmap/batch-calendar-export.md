# NoticePilot Batch Calendar Export Roadmap

> Document role: detailed plan for multi-notice one-off calendar export and its
> relationship to the local reference proof, S-Lite durable proof, and future
> Route S production subscription.
>
> Master roadmap authority: [`current-product-roadmap.md`](current-product-roadmap.md)
>
> Current productization route: S-Lite physical calendar-client validation.
>
> Batch export status: pending Route M controlled expansion; it is not a
> prerequisite for S-Lite or Route S.

## 1. Purpose and Boundary

This document describes the future **multi-notice one-off `.ics` export** flow
and records the delivery boundaries that it must not collapse together.

The repository currently contains four distinct calendar surfaces:

| Surface | Status | Current boundary |
| --- | --- | --- |
| Selected one-off ICS | Implemented | One manual-analysis result, user-selected valid all-day rows, one downloaded file. |
| Multi-notice batch ICS | Pending | Multiple reviewed notice results, event-level selection, one downloaded file. |
| Local reference proof | Implemented, opt-in | Fixed 601-event Foundation.25.1 snapshot, in-memory capability, restart expiry, frontend create/copy flow. |
| S-Lite durable proof | Implemented, opt-in | One operator, one SQLite singleton, restart recovery, create/inspect/rotate/revoke, fixed snapshot. |
| Production Route S subscription | Pending | Live ingestion, persistent event runtime, account-owned profiles, dynamic refresh, operations, and multi-client evidence. |

These surfaces share calendar contracts, but they are not one linear feature
sequence. Batch one-off export does not have to precede durable subscription,
and durable subscription does not prove batch UI completion.

## 2. Authority and Conflict Rule

Use the following authority order:

```text
runtime code and registered tests
→ strict schemas and authoritative architecture contracts
→ current implementation summary
→ current product roadmap
→ this detailed roadmap
```

If this document conflicts with the current runtime, the Subscription Foundation
contract, the implementation summary, or the master roadmap, those sources take
precedence.

## 3. Distinct Object Boundaries

The selection, publication, and delivery objects must remain distinct.

```text
reviewed app projection or CalendarEventCandidate
→ user selection for one-off export

CalendarEventCandidate
→ promotion
→ persistent CalendarEvent
→ reconciliation / sequence / cancellation
→ SubscriptionIcsFeed
```

The initial batch UI may select reviewed app projection rows or strict
`CalendarEventCandidate` objects. That selection does not:

- promote a candidate;
- issue a persistent event identity;
- create a subscription profile;
- prove repeated-import update behavior; or
- authorize a production feed.

A persistent calendar identity belongs to the consumer-owned `CalendarEvent`,
not to the candidate's display order or UI checkbox state.

## 4. Multi-notice One-off Product Scenario

The initial batch flow should be possible without live crawling or a
school-level production parser:

```text
multiple manually supplied or already available notice results
→ reviewed event candidates
→ event-level checkbox selection
→ one downloaded ICS file
```

A later source-driven flow may supply the same selection surface:

```text
approved notice sources
→ source adapters / extraction
→ reviewed event candidates
→ event-level checkbox selection
→ one downloaded ICS file
```

Automated collection is therefore one possible producer, not a mandatory
precondition for the batch export UI.

## 5. Initial Selection Unit

The initial selection unit remains the individual calendar-event candidate or
its app projection row.

Reasons:

- one notice can contain multiple actionable dates;
- not every date is relevant to every user;
- informational dates may be unsuitable for export;
- event-level review matches the current one-off workflow; and
- review and evidence should remain visible before export.

Example:

```text
[ ] 장학금 신청 시작일
[x] 장학금 신청 마감일
[ ] 서류 보완 기간
[x] 최종 발표일
```

Selection and export eligibility are separate decisions. A checked row must not
be exported when it lacks a valid date or fails an explicit export policy.

### 5.1 Minimum export eligibility

The first batch slice should require:

- explicit user selection;
- a valid exportable date;
- preserved source evidence or traceability;
- no unresolved date promoted into a false normalized value;
- visible `reviewRequired` state where applicable; and
- an allowed event type under the selected one-off export policy.

An event without a valid normalized date is not eligible for automatic ICS
output.

## 6. Notice-level Select-all

Notice-level selection may be added as a UI convenience.

Expected behavior:

```text
notice checkbox checked
→ select all eligible event rows under that notice

notice checkbox unchecked
→ clear all selected event rows under that notice

individual event changed
→ notice checkbox becomes partial / indeterminate when supported
```

Notice-level select-all must not:

- force invalid or unresolved rows into the export;
- re-enable suppressed rows;
- hide `reviewRequired` state;
- issue persistent identity; or
- act as candidate promotion.

The individual event remains the underlying export unit.

## 7. Current Browser ICS Compatibility Path

The current browser exporter is a one-off compatibility implementation. It:

- exports selected rows only;
- requires a valid `startDate` in `YYYY-MM-DD` form;
- emits all-day events only;
- writes `DTSTART;VALUE=DATE`;
- always writes `DTEND` as the day after `startDate`; and
- does not use the row's `endDate` to represent a multi-day period.

The current implementation therefore produces one-day all-day VEVENTs. The
first batch slice may preserve this limitation, but it must state the limitation
rather than imply that date ranges are already supported.

Time-specific events, timezone-aware serialization, and multi-day periods remain
separate decisions.

## 8. UID and Persistent Identity

### 8.1 Current browser UID limitation

The current browser generator derives a compatibility UID from the app row ID
or title together with `startDate`. This is acceptable only for the existing
one-off download path.

It is not the durable identity contract because:

- a date change changes the UID;
- a missing app row ID falls back to title text;
- it does not represent persistent `CalendarEvent.eventId`; and
- it cannot support authoritative update or cancellation semantics across runs.

### 8.2 Prohibited persistent UID sources

Persistent UIDs must not be derived from:

- candidate or event array index;
- notice-local event order;
- title;
- date;
- title/date combinations;
- content hash alone; or
- source notice ID alone.

The previous proposal
`<institution>-notice-<noticeId>-<eventType>-<eventIndex>@noticepilot.local`
is retired because candidate order is not persistent event identity.

### 8.3 Authoritative persistent UID direction

```text
persistent ICS UID
← CalendarEvent.eventId
```

A revision of the same persistent event keeps `eventId` and UID. Published
content changes increment `sequence`. Removal of a previously published event is
represented through cancellation rather than silent identity loss.

A batch export implementation that operates only on candidates or app rows must
not claim these persistent update semantics. It must either document repeated
imports as a compatibility limitation or first introduce the separately gated
promotion, repository, and reconciliation layers.

## 9. Date-range and Serializer Direction

The core event and ICS representations use different end-date semantics:

```text
CalendarEvent.endDate
= inclusive core date

ICS DTEND
= exclusive delivery date
```

A future shared core serializer should own the conversion from inclusive core
`endDate` to exclusive ICS `DTEND`.

### 9.1 Initial batch decision gate

Before implementation, decide whether the first batch slice:

1. preserves the current one-day all-day compatibility behavior; or
2. accepts promoted `CalendarEvent` objects and supports inclusive date ranges.

Do not silently mix these behaviors.

### 9.2 Future shared core serializer

A production-capable serializer should own:

- `CalendarEvent.eventId` to UID mapping;
- inclusive-to-exclusive end-date conversion;
- sequence and cancellation fields;
- escaping and line folding;
- deterministic event ordering; and
- stable rendering across repeated requests.

The browser generator must not become the production subscription serializer by
implicit extension.

## 10. Relationship to Corpus and Source Parsing

### 10.1 Corpus

Route M batch expansion should not begin until its input and expected-truth
contract is deterministic enough to evaluate:

- candidate correctness;
- evidence traceability;
- unresolved and ambiguous dates;
- duplicate candidates;
- review-required behavior; and
- export eligibility.

The current 10-entry collection gate is complete, but deterministic corpus
validation remains pending.

### 10.2 Source parsing

The repository already contains an isolated Foundation.25.1 KNU crawler and
source-specific implementation. This is distinct from the still-pending root
application work:

- scheduled live ingestion;
- production source orchestration;
- multi-institution parser coverage; and
- dynamic snapshot refresh.

The approximate 30-example threshold applies to broader parser generalization
and product coverage claims. It does not block:

- the restored Foundation package;
- manual multi-notice batch UI work;
- export tests using verified candidate fixtures; or
- S-Lite physical-client validation.

## 11. Campus Preferences and Subscription Profiles

Current browser campus preferences remain local UI metadata:

```text
campus preferences
→ browser localStorage
→ metadata.userPreferencesSnapshot
→ no notice filtering
→ no event filtering
→ no export behavior change
```

They must not silently become authoritative server-side subscription state.

A future `SubscriptionProfile` requires separate contracts for:

- owner identity;
- explicit migration or initialization;
- campus and source filter semantics;
- common-notice handling;
- unknown-campus handling;
- revision and deletion; and
- user consent where applicable.

Route M campus metadata and Route S profile ownership are separate boundaries.

## 12. Local Reference Proof

The opt-in local reference flow is implemented independently from batch export.
It provides:

- a frontend create/copy status flow;
- one fixed 601-event Foundation.25.1 snapshot;
- an in-memory capability URL;
- `GET`, `HEAD`, `ETag`, and conditional `304` delivery;
- loopback-only runtime enforcement; and
- capability expiry when the server restarts.

It has no accounts, per-user filtering, persistent capability recovery, or live
snapshot refresh. It is an integration proof, not a batch export or production
subscription implementation.

## 13. S-Lite Durable Proof

S-Lite is the implemented durable single-link proof. It provides:

- one trusted administrator;
- one SQLite singleton;
- one fixed 601-event Foundation.25.1 snapshot;
- restart recovery for the issued capability;
- create, inspect, rotate, and revoke administrator operations;
- hash-only token persistence;
- public `GET` / `HEAD` calendar delivery;
- `ETag` and conditional `304`; and
- reviewed LAN and public HTTPS proxy profiles.

S-Lite deliberately excludes:

- accounts;
- a management UI;
- campus or source filters;
- live crawling or dynamic refresh;
- multiple feeds or profiles;
- multi-process coordination; and
- completed physical calendar-client lifecycle evidence.

S-Lite proves a durable single link. It does not prove account-owned production
subscription.

## 14. Future Route S Production Subscription

The production subscription pipeline is separate from one-off batch export:

```text
live ingestion
→ CanonicalNotice
→ ExtractionResult
→ CalendarEventCandidate
→ promotion
→ persistent CalendarEvent
→ reconciliation / sequence / cancellation
→ account-owned SubscriptionProfile
→ SubscriptionIcsFeed
→ continuing calendar-client refresh
```

The repository already contains strict domain contracts, isolated Foundation
implementations, local reference delivery, and S-Lite durable capability state.
Production root-runtime completion still requires:

- approved live ingestion and scheduler behavior;
- request, redirect, attachment, retry, and failure-isolation controls;
- persistent `CanonicalNotice` and `CalendarEvent` repositories;
- production promotion and reconciliation wiring;
- account or explicit operator ownership;
- multiple durable subscription profiles;
- source and campus filtering;
- dynamic snapshot refresh;
- cancellation retention;
- account-owned token lifecycle;
- multi-process coordination and rate limiting;
- observability with capability-safe logging;
- backup and restore drills;
- actual host, DNS, firewall, and secret provisioning; and
- physical calendar-client refresh, update, and cancellation evidence.

## 15. Batch Export Entry Gate

Before implementing multi-notice batch export, approve:

- the input and expected-truth contract;
- deterministic corpus validation;
- the selection unit;
- notice-level select-all semantics;
- export eligibility rules;
- unresolved and review-required behavior;
- duplicate handling;
- one-day versus date-range ICS scope;
- UID limitations or persistent identity requirements;
- deterministic ordering; and
- regression requirements for the existing one-off exporter.

Batch work must stop rather than invent a persistent UID or silently coerce an
unresolved date when these decisions are missing.

## 16. Batch Export Exit Gate

The first completed batch slice should demonstrate:

- multiple notice results can enter one review surface;
- event-level selection works;
- notice-level select-all preserves eligibility and partial state;
- invalid or unresolved dates are excluded;
- review-required state remains visible;
- one valid ICS file is generated;
- event ordering is deterministic;
- Korean text and ICS escaping remain valid;
- duplicate handling is tested;
- the no-valid-event path blocks download;
- the existing single-result export remains stable; and
- UID and repeated-import limitations are stated accurately.

Do not claim update, sequence, or cancellation behavior unless persistent
`CalendarEvent` identity, repositories, and reconciliation are actually wired.

## 17. Explicit Current Non-goals

Not implemented in the current batch surface:

- multi-notice checkbox batch `.ics` export;
- time-specific or timezone-aware batch export;
- persistent batch event identity;
- root application scheduled live ingestion;
- multi-institution production parser orchestration;
- account-owned multi-profile subscription;
- dynamic feed refresh from live notices;
- production subscription-management UI;
- production multi-process operation;
- completed public deployment evidence;
- completed physical calendar-client lifecycle evidence; and
- Google Calendar API integration.

Existing but separately bounded implementations must not be described as absent:

- selected one-off browser ICS export;
- isolated Foundation.25.1 crawler/domain/feed package;
- local in-memory reference feed; and
- S-Lite SQLite durable singleton.

## 18. Related Documents

- [`current-product-roadmap.md`](current-product-roadmap.md)
- [`phase-4-plan.md`](phase-4-plan.md)
- [`../project/current-implementation-summary.md`](../project/current-implementation-summary.md)
- [`../architecture/subscription-foundation-contract.md`](../architecture/subscription-foundation-contract.md)
- [`../architecture/slite-durable-feed.md`](../architecture/slite-durable-feed.md)
