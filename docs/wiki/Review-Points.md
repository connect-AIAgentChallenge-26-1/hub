# Review Points

> Wiki version: 2026-07-13 Subscription Foundation + HTTP-contract baseline
> Review baseline: current runtime, strict domain schemas, tested adapters, authoritative architecture contracts, and the hardened analyze HTTP boundary
> Review scope: next decisions for candidate promotion, reconciliation, persistence, ICS, and subscription delivery—not reopening completed behavior
> Caution: this document does not automatically approve policy or authorize implementation.

## 1. Purpose and Use

NoticePilot is not a finished production service. The repository contains both a manual notice-analysis runtime and an isolated domain foundation for subscription ICS delivery.

This document separates three categories:

1. **Closed decisions** — do not reopen these as unresolved architecture questions.
2. **Current review items** — require product-owner judgment or an explicit contract before the next implementation step.
3. **Later review items** — do not block the current critical path and belong to a separate stage.

Reviewers must not treat isolated code or schema existence as delivered user-facing behavior.

## 2. Current Baseline

### 2.1 Runtime active

Currently reachable through the application:

- React + Vite frontend MVP
- Express `GET /api/health`
- Express `POST /api/analyze` mock mode
- explicit `501 ai_not_implemented` for `mode="ai"`
- explicit `400 unsupported_mode` for an unknown explicit mode
- client-mock and server-mock analysis
- manual text and TXT/MD input
- editable analysis results
- evidence review
- warning, privacy confirmation, overwrite confirmation, and error flows
- browser `localStorage` session persistence
- separate campus-preference persistence
- inert `metadata.userPreferencesSnapshot`
- Markdown export
- selected one-off all-day `.ics` export

#### HTTP contract baseline

The public HTTP boundary preserves these responses:

- `GET /api/health` returns the exact public health response.
- Missing `mode` or `mode="mock"` returns a `200` mock analysis result.
- `mode="ai"` returns `501 ai_not_implemented`.
- An unknown explicit mode returns `400 unsupported_mode`.
- Malformed JSON returns `400 invalid_json`.
- A JSON body over `1mb` returns `413 request_too_large`.
- An analyze dependency rejection returns `500 server_error` without exposing the exception message or stack.

These paths are covered by the HTTP contract tests registered in `npm run test:http` and `npm test`.

Decision: the detailed HTTP delta belongs in the implementation summary and Review Points. Architecture remains a high-level responsibility document and does not duplicate every response code.

### 2.2 Implemented, isolated

Code and tests exist, but normal runtime callers do not use these paths automatically:

- strict `noticepilot.domain.v1` schemas
- `ManualNoticeInput → CanonicalNotice`
- `Legacy AiRawAnalysis + CanonicalNotice → ExtractionResult`
- `ExtractionResult → AppAnalysis projection`
- `KNU normalized payload → CrawledNotice`
- `CrawledNotice → CanonicalNotice`
- `KNU rule candidates → ExtractionResult + CalendarEventCandidate[]`
- opt-in domain-adapter path in `normalizeAiRawToAppResult`

### 2.3 Foundation implemented, production runtime pending

The contract and restored Foundation implementation are authoritative. The
root application exercises one fixed reference snapshot, while live ingestion
and account-owned persistent delivery remain absent:

- persistent `CalendarEvent.eventId`
- ICS UID derived from `CalendarEvent.eventId`
- stable UID across revisions
- `sequence` increments
- cancellation publication
- inclusive core `endDate`
- exclusive all-day ICS `DTEND`
- campus and feed-actor defaults

### 2.4 Pending

- live AI provider
- runtime PDF/HWP/HWPX/OCR extraction
- outbound crawler deployment
- candidate promotion
- previous/current event reconciliation
- persistent repositories
- production root server-side ICS pipeline
- account-owned subscription-feed persistence and management endpoint
- subscription-management UI
- calendar-client subscription QA

## 3. Closed Decisions — Do Not Reopen

### 3.1 Domain and projection boundary

The following boundary is fixed:

```text
Legacy AiRawAnalysis
+ CanonicalNotice
→ ExtractionResult
→ AppAnalysis projection
```

- `AppAnalysisSchema` is a manual-analysis UI projection.
- `AppAnalysisSchema` is not the core Subscription Foundation domain schema.
- AI raw output must not reach AppAnalysis without domain validation.
- A projected `calendarEvents[]` UI row is not a persistent `CalendarEvent`.
- Projection is not candidate promotion.

### 3.2 Producer and consumer responsibilities

```text
source / AI producer
→ ExtractionResult
→ CalendarEventCandidate

calendar-event consumer
→ candidate promotion
→ CalendarEvent
→ reconciliation
```

- Source adapters stop at `ExtractionResult` / `CalendarEventCandidate`.
- Source adapters do not issue persistent event IDs.
- Source adapters do not reconcile published events.
- Extraction adapters do not serialize ICS.
- Candidate promotion and default-feed selection are separate decisions.

### 3.3 Event identity, revision, and cancellation

- Persistent UID derives from `CalendarEvent.eventId`.
- Do not create persistent UID from title/date/content hash alone.
- A revision of the same event preserves `eventId` and UID.
- A published event change increments `sequence`.
- Removal of a previously published event publishes cancellation rather than silently losing identity.

### 3.4 Date and ICS semantics

- Normalized dates use `YYYY-MM-DD` or `null`.
- Core `CalendarEvent.endDate` is inclusive.
- All-day ICS `DTEND` is exclusive.
- A timed deadline may have `endTime=null`.
- Do not invent arbitrary duration.
- An event without a valid `normalizedDate` is not eligible for automatic ICS output.
- The current browser exporter is a one-off compatibility path, not the future core serializer layer.

### 3.5 Campus preference and server state

- Current campus preferences are stored in separate browser `localStorage`.
- Current campus preferences do not filter notices, alter extraction, personalize export, or generate feeds.
- `metadata.userPreferencesSnapshot` is inert metadata.
- Browser preference must not become authoritative server-side subscription state without migration and ownership contracts.
- Listed-campus classification and target-campus classification are separate concepts.

### 3.6 Corpus policy

- The repository currently has zero verified real-corpus entries.
- Templates and synthetic fixtures do not count as real corpus data.
- Canonical extracted text and core expected truth are separate.
- Primary expected truth describes `ExtractionResult` / `CalendarEventCandidate` meaning.
- AppAnalysis expected truth is an optional compatibility projection.
- Do not add promotion, reconciliation, feed, or server-side ICS expected truth before those layers exist.
- Roughly 30 examples are a coverage-expansion milestone, not a prerequisite for source-adapter or domain work.

### 3.7 Failure and trust boundary

- Treat AI output, source payloads, pasted/uploaded text, and restored browser state as untrusted.
- Do not automatically fall back to mock in a way that hides live-AI failure.
- Distinguish provider failure, malformed JSON, schema mismatch, unsupported mode, request-size failure, and internal dependency failure where the public contract defines them.
- Do not place provider secrets in the browser.
- Current privacy-like patterns use warning and user-confirmation flows.
- Login, payment, and Google Calendar API are not on the current critical path.

## 4. Highest-Priority Review — Candidate Promotion

### 4.1 Fixed premises

- `CalendarEventCandidate` is producer output.
- A candidate may be unresolved or review-required.
- Candidate ID is not a durable ICS UID.
- `CalendarEvent` is a consumer-owned promoted event.
- Promotion must not contain source-specific regex knowledge.
- Promotion must not persist feeds.
- Promotion and default-feed inclusion must remain separate.

### 4.2 Product-owner decisions required

#### P4-C1. Candidate eligibility

Decide:

- Which `candidateStatus` values may enter promotion.
- Which minimum fields are required in addition to a valid `normalizedDate`.
- Whether a `meeting` without structured time is blocked or preserved as unresolved.
- How to restrict `announcement`, `other`, and internal deadlines.
- Whether suppressed candidates are permanently excluded or remain reviewable.

#### P4-C2. Review-required behavior

Fixed principles:

- Do not silently discard review-required candidates.
- Preserve review state and evidence traceability.
- A promoted event with a valid `normalizedDate` is not excluded from the default feed solely because `reviewRequired` is true.
- Separate eligibility and feed policies—event type, target actor, time completeness—still apply.

Additional decisions:

- Which `reviewReasons` block candidate eligibility.
- Which reasons survive only as promoted-event review state.
- How to record priority when eligibility and feed policies both fail.
- Which review state represents explicit user approval.
- Whether provenance must distinguish manual approval from automatic promotion.

#### P4-C3. Actor and feed applicability

Fixed principles:

- `department` and `staff` are valid actors but excluded from the default student feed.
- Schemas do not insert an actor default automatically.

Additional decisions:

- Whether `unknown` actors may be promoted.
- Feed inclusion rules for `student`, `applicant`, `public`, and `unknown`.
- Handling candidate actor versus subscription-profile actor conflicts.
- Whether actor conflict produces review-required state or suppression.

#### P4-C4. Reason codes and evidence

Decide:

- Promotion-result reason-code taxonomy.
- Minimum evidence for eligibility decisions.
- Trace link from source candidate to promoted event.
- Representative evidence selection when multiple evidence items exist.
- Audit fields that distinguish automatic decisions from product-owner approval.

### 4.3 Entry criteria for C2

Before promotion implementation begins, document and approve:

```text
candidate eligibility
review-required behavior
actor applicability
separation of promotion and default-feed inclusion
reason codes
evidence traceability
non-goals
acceptance tests
```

## 5. Event Reconciliation Review

### 5.1 Fixed premises

- Persistent identity is not content-hash identity.
- Revisions of the same event preserve `eventId` and UID.
- Published changes increment `sequence`.
- Deletion is expressed as cancellation.
- Source identity and event identity are different concepts.

### 5.2 Product-owner decisions required

#### P4-R1. Previous/current matching

- Match the same event after a date change.
- Match the same event after a title change.
- Handle legacy candidates without `sourceCandidateKey`.
- Handle candidate split and merge.
- Decide whether evidence-only changes create an event revision.

#### P4-R2. Cross-notice events

- Choose a representative event when the same event is posted in multiple notices.
- Define canonical-board and alias-board priority.
- Define consolidation criteria for multiple source notices.
- Handle date or title conflicts across sources.
- Preserve source traceability after consolidation.

#### P4-R3. Sequence and cancellation

- Define fields that require a `sequence` increment.
- Decide whether unpublished changes use sequence.
- Define cancellation retention.
- Handle reappearance after deletion as restoration or new identity.
- Distinguish cancellation from supersession.

### 5.3 Entry criteria for reconciliation

Before implementation, approve:

```text
matching-key hierarchy
split/merge behavior
cross-notice representative policy
sequence-triggering fields
cancellation retention
reappearance policy
```

## 6. Persistence and Repository Review

### 6.1 Required repositories

- `CanonicalNotice` repository
- `CalendarEvent` repository
- subscription-profile repository
- feed-snapshot and cancellation-retention store

### 6.2 Product-owner decisions required

#### P4-D1. Storage unit and transaction boundary

- Scope of a transaction across crawl run, canonical revision, candidate set, and event reconciliation.
- Commit/rollback policy for partial failure.
- Idempotent replay criteria.
- Separation of source run and event publication.

#### P4-D2. Persistent-ID issuance

- ID-issuing layer.
- Repository-generated versus application-generated IDs.
- Dependency-injected deterministic IDs in tests.
- Relationship to existing one-off row IDs during migration.

#### P4-D3. Retention and audit

- Canonical-revision retention period.
- Whether candidate history is retained.
- Published-event revision history.
- Cancellation retention.
- Storage of product-owner decisions and manual approvals.

## 7. Core ICS Serialization Review

### 7.1 Fixed premises

- Input is a validated `CalendarEvent`.
- UID derives from persistent `eventId`.
- Serialization supports `sequence` and cancellation.
- Inclusive core end date becomes exclusive all-day `DTEND`.
- Escaping, line folding, and ordering belong to the serializer.
- Serializer tests are independent of HTTP endpoints.

### 7.2 Product-owner decisions required

- UID namespace and format.
- Timed-event timezone representation.
- Update rules for `DTSTAMP`, `LAST-MODIFIED`, and `SEQUENCE`.
- Minimum fields in a cancellation VEVENT.
- Evidence/source-link scope in description.
- Deterministic ordering key.
- Point at which one-off export and subscription feed share the serializer.

### 7.3 Calendar-client QA

Minimum targets:

- Samsung Calendar
- Apple Calendar
- Outlook

Review:

- initial subscription and refresh
- event update propagation
- cancellation propagation
- all-day date boundaries
- timed events and timezone
- long-line folding
- Korean text, comma, semicolon, and newline escaping
- duplicate UID handling

Do not report calendar-client compatibility as complete without real-client QA evidence.

## 8. Subscription Feed Review

### 8.1 Product-owner decisions required

#### P4-F1. Feed identity and access

- Feed URL/token issuance.
- Token rotation and revocation.
- Public, unlisted, or authenticated feed.
- URL-leak response.
- Per-user feed versus shared profile feed.

#### P4-F2. Refresh, cache, and publication

- Refresh cadence.
- HTTP caching and ETag/Last-Modified.
- Acceptable stale-feed duration.
- Retaining existing events during source-fetch failure.
- Publication atomicity.
- Cancellation-retention relationship to feed snapshots.

#### P4-F3. Filtering

- Application point for institution/source/category/campus filters.
- Default inclusion of unknown-campus notices.
- Combining target actor and subscription-profile actor.
- Presentation of review-required events.
- UID preservation after preference changes.

#### P4-F4. Observability and abuse control

- Feed-generation failure metrics.
- Source-stale visibility.
- Token abuse and excessive-refresh limits.
- Personal-data and log minimization.
- Operator audit events.

## 9. Source and Crawler Review

### 9.1 Current state

KNU fixture-driven adapters and mapping contracts are implemented and isolated. The repository does not contain a scheduled outbound crawler runtime.

### 9.2 Later review items

- Scheduling and cadence.
- Robots/rate-limit policy.
- Retry and backoff.
- Fetch-failure and deletion/supersession state.
- Crawl-run persistence.
- Source health and observability.
- Attachment download and extraction ownership.
- Source aliases and canonical boards.
- Cross-post representative selection.

A future source runtime must not give source adapters event-promotion or ICS-delivery responsibility.

## 10. AI, Corpus, and File Extraction — Later Review

### 10.1 Live AI provider

Later decisions:

- Provider choice and server-only configuration.
- Timeout, quota, malformed JSON, and schema-mismatch handling.
- Legacy AI raw v1 support period.
- AI raw vNext with richer actor/time/subtype/provenance.
- Corpus-based quality threshold.
- Scope of user-controlled mock fallback.

### 10.2 Corpus

Later decisions:

- Approval process for the first verified real entry.
- Minimum coverage by notice type.
- Evidence-exactness and ambiguity evaluation.
- Metrics comparing AI output with human expected truth.
- Time to add delivery expected layers after promotion/reconciliation implementation.

### 10.3 File extraction

Later decisions:

- Express process versus separate worker/service.
- PDF/HWP/HWPX/OCR extraction adapters.
- Raw-file retention.
- Attachment provenance.
- Extraction confidence and review state.
- Failure isolation between extraction and AI analysis.

These items do not block CalendarEvent-consumer C1–C3 contract work.

## 11. Frontend — Later Review

Do not perform a large rewrite of `App.jsx + useState`, hash tabs, or local preferences before backend and subscription contracts stabilize.

Later review:

- institution/source selection
- category and campus preferences
- subscription creation
- feed URL copy/share
- active/inactive state
- refresh/error visibility
- preference-update behavior
- separation of manual review and subscription management
- browser-preference migration UX

The UI must not present an unimplemented feed as an active feature.

## 12. Questions That Are No Longer Open

Do not reopen these questions:

- Whether AI raw and AppAnalysis must be separate.
- Whether server normalization must be tested before live AI.
- Whether AI should generate `selected`, `completed`, or `edited`.
- Whether a source adapter should issue persistent event IDs.
- Whether stable UID should derive from title/date/content hash.
- Whether `CalendarEventCandidate` projection is promotion.
- Whether existence of `CalendarEvent` schema means reconciliation is implemented.
- Whether existence of `SubscriptionIcsFeed` schema means feed runtime is implemented.
- Whether campus preference currently filters notices.
- Whether subscription ICS is currently active.
- Whether 30 corpus examples are a source-adapter prerequisite.
- Whether Google Calendar API belongs in the current scope.

These are settled by authoritative contracts or current implementation state.

## 13. Product-Owner Decision Gates

### Gate 1 — C1 promotion contract

Approval required:

- candidate eligibility
- blocking/non-blocking review reasons
- actor applicability
- separation of promotion and feed inclusion
- promotion reason codes
- evidence traceability

### Gate 2 — C3 reconciliation contract

Approval required:

- previous/current matching hierarchy
- split/merge and cross-notice handling
- persistent identity preservation
- sequence triggers
- cancellation retention
- event reappearance

### Gate 3 — D1/D2/D3 delivery foundation

Approval required:

- repository boundary
- persistent-ID issuance
- transaction and retention
- ICS UID format
- timezone/cancellation serialization
- feed token, caching, refresh, and filtering

### Gate 4 — E1 subscription UI

Approval required:

- subscription-profile UX
- campus/source/category selection
- browser-preference migration
- feed status and error presentation
- relationship between one-off export and subscription UI

Do not start C2 without Gate 1 approval. Do not freeze persistent-event repository and publication behavior without Gate 2 approval. Do not expose a subscription-feed endpoint as a user-facing feature without Gate 3 approval.

## 14. Review Priority

Current product-owner or reviewer questions:

1. Which candidates may become `CalendarEvent`?
2. Which review reasons block promotion, and which remain display-only?
3. How will promotion and default-feed inclusion be separated in data structures and function boundaries?
4. How will previous/current events match when legacy candidates lack stable source keys?
5. How will cross-notice duplicates and aliases choose a representative event?
6. Which changes increment `sequence`?
7. How long will cancellation be retained, and how will reappearing events be handled?
8. Which layer issues persistent IDs, and which repository owns them?
9. What is the input/output contract of the core ICS serializer shared by one-off and subscription delivery?
10. Which security and operational policies govern feed token, refresh, caching, and filtering?
11. What minimum Samsung Calendar evidence validates update and cancellation?
12. How will audit trail distinguish product-owner decisions from automatic decisions?

## 15. Related Documents

- [`docs/project/current-implementation-summary.md`](../project/current-implementation-summary.md)
- [`docs/wiki/Architecture-Overview.md`](Architecture-Overview.md)
- [`docs/wiki/Implementation-Plan.md`](Implementation-Plan.md)
- [`docs/architecture/subscription-foundation-contract.md`](../architecture/subscription-foundation-contract.md)
- [`docs/architecture/subscription-adapter-contract.md`](../architecture/subscription-adapter-contract.md)
- [`docs/ai/ai-output-schema.md`](../ai/ai-output-schema.md)
- [`docs/qa/test-corpus-plan.md`](../qa/test-corpus-plan.md)

## 16. Governance Rule

When implementation and documentation conflict, use this order:

```text
runtime code and tests
→ strict schemas and authoritative contracts
→ implementation summary
→ master roadmap
→ track-specific roadmap
→ wiki and presentation material
```

Do not reopen settled decisions. Conversely, do not settle unresolved policy merely for implementation convenience. Product-owner decisions must pass through explicit decision gates.
