# Architecture Overview

> Wiki version: 2026-07-19 Foundation.25.1 reference-integration baseline
> Source of truth: repository runtime code, strict schemas, tests, and authoritative architecture contracts  
> Scope: repository-visible implementation only

## 1. Purpose

NoticePilot transforms long university notices into actionable items and calendar-event candidates.

The repository now contains three related but distinct surfaces:

1. **Manual-analysis runtime** — user-facing review, editing, Markdown export, and one-off `.ics` download.
2. **Subscription domain foundation** — the exact restored Foundation.25.1 package with source, event, persistence, and delivery implementations.
3. **Local reference delivery** — an opt-in Express/Python bridge exposing one fixed Foundation snapshot through an in-memory capability URL.

The manual-analysis UI is not the authoritative subscription-domain model.

## 2. Status Vocabulary

- **Runtime active** — reachable through the current application.
- **Implemented, isolated** — code and tests exist, but default runtime callers do not use it automatically.
- **Contract complete** — authoritative behavior is documented; downstream implementation may still be pending.
- **Pending** — not implemented in this repository baseline.

## 3. Product-Level Architecture

```text
Source inputs
├─ Manual text / TXT / MD
├─ Legacy AI raw analysis
└─ KNU crawler normalized payload + rule candidates

Normalization and canonical domain
├─ ManualNoticeInput → CanonicalNotice
├─ KNU payload → CrawledNotice → CanonicalNotice
└─ Legacy AI raw + CanonicalNotice → ExtractionResult

Extraction boundary
├─ ExtractionItem[]
└─ CalendarEventCandidate[]

Production consumer boundary
├─ candidate promotion
├─ CalendarEvent identity issuance
├─ previous/current reconciliation
├─ sequence increment
└─ cancellation generation
   └─ implemented inside restored Foundation.25.1; not wired to live root ingestion

Local reference delivery — runtime active only when explicitly enabled
├─ fixed Foundation snapshot
├─ in-memory capability provisioning
├─ Express GET / HEAD / conditional 304 endpoint
└─ server-restart expiry

Production delivery — pending
├─ account-owned persistent profile and token lifecycle
├─ durable feed state
├─ live crawler/snapshot refresh
└─ operational deployment and observability
```

Root adapters reach `CalendarEventCandidate`. The restored Foundation package
contains the later event and delivery layers, and the root reference bridge
exercises one sealed snapshot. A live multi-user ingestion and persistent
delivery runtime is not implemented.

## 4. Current User-Facing Runtime

```text
Manual text or TXT/MD
→ client mock or Express server mock
→ AppAnalysisSchema-compatible result
→ user review/edit
→ Markdown or selected one-off all-day ICS

Calendar tab + explicit local reference mode
→ POST /api/subscription-feeds/reference
→ Express/Python bridge
→ fixed 601-event Foundation snapshot
→ in-memory capability URL
→ GET / HEAD / conditional 304 ICS delivery
```

Runtime-active capabilities:

- React + Vite frontend MVP
- Express `GET /api/health`
- Express `POST /api/analyze` mock mode
- explicit `501 ai_not_implemented` for `mode="ai"`
- explicit `400 unsupported_mode` for unknown modes
- bilingual UI
- `#analyze` and `#calendar` workspace tabs
- notice title/body, type, publication date, TXT/MD input
- editable result sections and evidence review
- warning, error, privacy-confirmation, and overwrite-confirmation flows
- browser `localStorage` persistence
- separate campus-preference storage
- inert `metadata.userPreferencesSnapshot`
- Markdown checklist export
- selected one-off all-day `.ics` export
- opt-in fixed Foundation.25.1 reference feed creation and copy flow
- capability-authenticated reference ICS delivery on loopback hosts only

Campus preferences currently do not filter notices, alter extraction, personalize exports, or alter the fixed reference feed.

## 5. Strict Subscription Domain

The repository implements strict `noticepilot.domain.v1` schemas for:

```text
SourceBoard
CrawledNotice
CanonicalNotice
ExtractionResult
CalendarEventCandidate
CalendarEvent
SubscriptionIcsFeed
```

Supporting contracts include:

- source identity and canonical URL separation
- campus target metadata
- evidence and warning references
- strict dates and times
- review state
- event status and sequence
- inclusive core `endDate`

Important distinction:

```text
AppAnalysisSchema
= manual-analysis UI projection
≠ authoritative core subscription schema
```

The restored Foundation package implements and verifies event reconciliation
and subscription delivery semantics. The root application consumes only the
fixed reference snapshot; it does not yet provide production account-owned
event or feed persistence.

## 6. Implemented Adapter Boundaries

### Manual input

```text
ManualNoticeInput
→ normalizeManualNoticeToCanonical
→ CanonicalNotice
```

### Legacy AI

```text
Legacy AiRawAnalysis + CanonicalNotice
→ normalizeAiRawToExtractionResult
→ ExtractionResult
```

### UI projection

```text
ExtractionResult
→ projectExtractionResultToAppAnalysis
→ AppAnalysisSchema-compatible projection
```

### KNU source integration

```text
KNU normalized notice v0.4.4
→ normalizeKnuV044ToCrawledNotice
→ CrawledNotice
→ normalizeCrawledNoticeToCanonical
→ CanonicalNotice
```

### KNU rule-candidate integration

```text
KNU rule candidates
→ normalizeKnuRuleCandidatesToExtractionResult
→ ExtractionResult + CalendarEventCandidate[]
```

Adapter constraints:

- strict input and output validation
- dependency-injected IDs, clocks, and hashes
- no database access
- no candidate promotion
- no persistent event reconciliation
- no ICS serialization

## 7. Legacy Compatibility Path

`normalizeAiRawToAppResult(aiRawInput, options)` preserves the legacy normalization path by default.

A complete strict `options.domainAdapter` enables the opt-in path:

```text
Legacy AI raw
→ ExtractionResult
→ AppAnalysis projection
```

The wrapper rejects null, partial, or unknown-key domain-adapter options. It does not synthesize canonical notices, clocks, IDs, hashes, or extraction metadata.

## 8. Responsibility Boundaries

### React client

- owns current UI state and user edits
- performs defensive response validation
- stores current session and campus preferences locally
- exports current Markdown and one-off `.ics`
- must not treat browser preference metadata as durable subscription state

### Express runtime

- exposes health and mock analysis endpoints
- keeps live AI mode explicitly unavailable until implemented
- treats external/model output as untrusted
- returns safe AppAnalysis-compatible responses
- exposes the opt-in reference provisioning and capability delivery routes
- rejects reference mode on non-loopback hosts before gateway startup
- does not persist root-application notices, events, or feeds

### Source adapters

- validate source-specific payloads
- normalize source identity and metadata
- produce strict domain objects
- stop at `ExtractionResult` / `CalendarEventCandidate`

### Calendar-event consumer — isolated Foundation implementation

- decides candidate eligibility and promotion
- issues persistent event IDs
- reconciles previous and current events
- increments sequence
- generates cancellation state

These behaviors are implemented and verified inside the restored Foundation
package. They are not connected to a live root crawler or account-owned runtime.

### Delivery layer — local reference active, production pending

- serializes validated events to ICS
- stores feed state
- exposes feed URLs or tokens
- defines refresh, caching, retention, and observability

The local bridge renders a fixed snapshot and keeps capability state in memory.
Persistent profiles, rotation/revocation UI, live refresh, and production
observability remain pending.

## 9. Candidate, Event, and ICS Semantics

### CalendarEventCandidate

- producer output
- may be unresolved or review-required
- may lack a normalized date
- does not provide durable published identity

### CalendarEvent

- consumer-owned promoted event
- uses persistent `eventId`
- carries status and sequence
- uses inclusive core `endDate`

### ICS VEVENT

- delivery representation
- persistent UID derives from `CalendarEvent.eventId`
- all-day `DTEND` is exclusive
- serializer owns escaping, folding, ordering, and date conversion

Persistent UID must not be derived from candidate index, title/date text, or content hash alone.

## 10. Date and Time Policy

Core rules:

- normalized dates use `YYYY-MM-DD` or `null`
- normalized times use strict time values or `null`
- core `CalendarEvent.endDate` is inclusive
- all-day ICS `DTEND` is exclusive
- valid timed deadlines may have `endTime=null`
- arbitrary duration must not be invented
- unresolved dates remain reviewable and are not automatically exported

The current browser exporter is a compatibility path for selected all-day events. A future core serializer should become the shared implementation for one-off and subscription delivery.

## 11. State and Persistence

### Current

```text
analysis session
→ browser localStorage

campus preferences
→ separate browser localStorage

local reference capability
→ Python bridge memory until server restart
```

### Pending

```text
CanonicalNotice repository
CalendarEvent repository
Subscription profile repository
feed snapshot and cancellation retention
```

Browser-only preference metadata must not silently become server-side subscription state. A migration and ownership contract is required.

## 12. Security and Trust Boundaries

Treat the following as untrusted:

- AI output
- crawler/source payloads
- uploaded or pasted text
- restored browser state
- future attachment extraction output

Required controls:

- strict schema validation
- source-specific repair only at adapter boundaries
- no provider secrets in the browser
- no raw AI output forwarded directly to the UI
- no automatic mock fallback that hides live-AI failure
- no feed endpoint before token, caching, abuse, and observability policies exist

## 13. Current Quality Baseline

Repository commands:

```text
npm test
npm run test:http
npm run test:schemas
npm run test:adapters
npm run build
npm run security:audit
```

The repository defines these validation commands, but it does not currently include `.github/workflows/quality-gate.yml`. Whether validation runs automatically on pull requests, and whether any check is required, is controlled by the repository's other active workflows and branch-protection or ruleset configuration.

## 14. Current Pending Layers

```text
live AI provider integration
corpus-based AI QA
PDF / HWP / HWPX / OCR runtime extraction
outbound crawler deployment
candidate promotion
persistent CalendarEvent repository
cross-run reconciliation
sequence and cancellation generation
core server-side ICS serializer
SubscriptionIcsFeed persistence
feed endpoint and refresh behavior
subscription-management UI
calendar-client subscription QA
```

## 15. Related Documents

- [`../project/current-implementation-summary.md`](../project/current-implementation-summary.md)
- [`../roadmap/current-product-roadmap.md`](../roadmap/current-product-roadmap.md)
- [`../roadmap/phase-4-plan.md`](../roadmap/phase-4-plan.md)
- [`../roadmap/batch-calendar-export.md`](../roadmap/batch-calendar-export.md)
- [`../architecture/subscription-foundation-contract.md`](../architecture/subscription-foundation-contract.md)
- [`../architecture/subscription-adapter-contract.md`](../architecture/subscription-adapter-contract.md)

## 16. Governance Rule

When documents conflict, use this order:

```text
runtime code and tests
→ strict schemas and authoritative contracts
→ implementation summary
→ master roadmap
→ track-specific roadmap
→ wiki and presentation material
```

Isolated tested code must not be described as user-facing runtime behavior, and contract-only work must not be described as implemented delivery.
