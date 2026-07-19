# NoticePilot Current Implementation Summary

## Purpose

This document summarizes the current implementation baseline of NoticePilot before real AI integration begins. It is intended to prevent future implementation phases from accidentally breaking the existing MVP, mock analysis flows, validation behavior, campus preference metadata, and export workflows.

## Current Status

NoticePilot is currently a React + Vite MVP UI with an Express mock analyze API, Zod-backed server schemas, and an opt-in S-Lite durable single-feed API. The project validates the analysis workflow through mock paths and validates one persistent subscription URL through Foundation.25.1 plus SQLite.

Current user-facing flow:

```text
long notice
→ structured analysis result
→ user review/edit
→ checklist export
→ selected all-day `.ics` export
```

### Standalone Crawler Release Boundary

Foundation.25.1 is a verified standalone crawler release. Its exact promoted
package subtree is restored at `packages/noticepilot-knu-crawler`. The root app
now has an explicitly opt-in, local/reference-only bridge that provisions and
renders one fixed all-campus student subscription feed from that package.
Production ingestion, account identity, and deployment were not performed.
See the [Foundation.25.1 standalone release record](../releases/foundation-25.1.md)
for the detailed release and restoration authority.

NoticePilot is not a generic summarization app. Its purpose is to extract actionable notice information:

- deadlines
- tasks
- submissions
- requirements
- cautions
- calendar event candidates
- source evidence

Current technology stack:

```text
Frontend: React + Vite
Backend: Express
Schema validation: Zod
State: React useState in App.jsx
Persistence: browser localStorage + opt-in S-Lite SQLite singleton
Export: client-side Markdown and .ics generation
```

## Completed Phases

### Phase 1. Frontend MVP Follow-up

Status: Complete

Implemented capabilities:

- React + Vite UI skeleton preserved
- bilingual UI: English / Korean
- project intro sections
- notice title input
- notice text input
- client-side mock analysis
- mock analysis dashboard
- editable extracted items
- item delete behavior
- task completion toggle
- calendar event selection toggle
- evidence panel
- Markdown checklist export
- TXT / MD file upload
- extracted text preview
- notice type metadata input
- notice publication date metadata input
- warning and error UI
- overwrite confirmation
- privacy-like pattern confirmation
- localStorage session persistence
- real all-day `.ics` export for selected valid calendar events

### Phase 1-QA. Frontend MVP QA and Major Fixes

Status: Complete

Regression baseline:

- client-side mock analysis still works
- language toggle preserves active analysis result
- all-day `.ics` export scope is no longer represented as time-specific export
- edit/delete/toggle/export flows remain functional

Known minor backlog from earlier QA:

- Uploaded TXT / MD content is placed in the editable notice text input before analysis, but the preview copy can be made clearer so users understand that the editable text area is the extracted text preview.
- Intro copy may still need refinement to avoid overstating real AI readiness.

### Phase 2. Express Analyze API Skeleton

Status: Complete

Implemented capabilities:

- Express dependency and server scripts
- `GET /api/health`
- `POST /api/analyze`
- mock analysis service
- AI analysis service stub
- server-side validation / normalization
- explicit mode policy

Analyze mode behavior:

```text
missing mode or mode="mock" → 200 mock analysis result
mode="ai"                  → 501 ai_not_implemented
unknown explicit mode       → 400 unsupported_mode
```

### Phase 2-QA. Backend Analyze API QA and Major Fixes

Status: Complete

Regression baseline:

- backend health endpoint responds normally
- backend mock analyze response validates against server schema rules
- `mode="ai"` remains blocked with 501 until real AI integration is implemented
- unsupported modes return 400
- missing/invalid section fields are normalized safely
- warning objects preserve `{ type, message }` structure

Automated HTTP contract coverage registered in `npm test`:

- `GET /api/health` exact public response
- `POST /api/analyze` default mock and explicit mock success responses
- `mode="ai"` returns `501 ai_not_implemented`
- unsupported explicit mode returns `400 unsupported_mode`
- malformed JSON returns `400 invalid_json`
- JSON bodies over `1mb` return `413 request_too_large`
- an analyze dependency rejection injected at app construction returns
  `500 server_error` through the actual `/api/analyze` boundary without exposing
  the exception message or stack

Local isolated Node 22 verification passed:

- runtime: Node `v22.23.1`, npm `10.9.8`
- `npm ci`: passed
- `npm run test:http`: 8/8 passed
- `npm test`: 121/121 passed
- `npm run build`: passed
- `npm run security:audit`: passed with 0 vulnerabilities

A repository CI workflow is defined for Node 22 tests/build/audit and the
Foundation.25.1 Python 3.14 regression suite. Previous product-baseline PRs have
passed those remote checks; the historical local counts above describe the
earlier phase rather than the current regression total.

### Phase 3. Frontend ↔ Server Mock Analyze Wiring

Status: Complete

Implemented capabilities:

- separate frontend action for server mock analysis
- `Analyze via server mock` / `서버 mock 분석` button
- `POST /api/analyze` call with `mode: "mock"`
- Vite `/api` dev proxy to Express server
- server mock loading state
- server unavailable error handling
- non-2xx response handling
- invalid/empty response handling
- server warnings preserved in `analysisResult.warnings[]`
- existing frontend validation still applied after server response
- overwrite confirmation preserved
- privacy confirmation preserved
- existing client-side mock flow preserved

### Calendar Tab + Campus Preferences

Status: Complete

Implemented capabilities:

- workspace hash tabs for `#analyze` and `#calendar`
- unsupported workspace hashes normalize to `#analyze`
- header and brand links point to supported workspace hashes
- full-width calendar tab layout
- campus preference card with native checkbox-based campus chips
- campus options in fixed order: `chuncheon`, `samcheok`, `dogye`, `gangneung_wonju`
- reference subscription ICS card with idle, provisioning, ready, copy, and unavailable states
- separate campus preference storage key: `noticepilot:campus-preferences:v1`
- no first-visit campus preference write before user change
- campus preference normalization for invalid and duplicate campus IDs
- `updatedAt` written only inside `institutionPreferences.kangwon` after user-initiated changes
- client mock analysis metadata includes inert `metadata.userPreferencesSnapshot`
- server mock request includes `userPreferencesSnapshot`
- server mock response echoes normalized `metadata.userPreferencesSnapshot`
- campus preferences do not alter analysis sections, filtering, Markdown export, or `.ics` export behavior

### Foundation.25.1 Reference Subscription Feed

Status: Complete for the local/reference implementation boundary

Implemented capabilities:

- exact promoted Foundation.25.1 package restored without subtree changes
- opt-in flag: `NOTICEPILOT_ENABLE_REFERENCE_FEED=true`
- strict `POST /api/subscription-feeds/reference` with exact `{}` JSON body
- fixed all-campus student reference calendar with 601 events
- capability URL authentication for `GET` / `HEAD /subscription-feeds/:feedId/:token.ics`
- conditional request support with `ETag` and `304`
- Python-owned token provisioning, authentication, and ICS rendering through a long-lived JSON-lines bridge
- raw capability token returned only inside `subscriptionPath`; no log, error, or localStorage persistence
- UI builds the same-origin subscription URL in memory and exposes bilingual create, retry, copy, and expiry states
- disabled and dependency-unavailable provisioning returns `503`; malformed or unauthorized public URLs return a generic `404`
- bridge cleanup on application shutdown
- reference mode fails before gateway startup unless the configured server host is loopback-only
- frontend API contract tests are registered in the root `npm test` command
- GitHub Actions defines separate JavaScript and Foundation.25.1 regression jobs

This slice is a non-production integration proof. It has no caller account
authentication, database-backed feed lifetime, user-specific profile, campus
filtering, revocation UI, rotation workflow, or deployment configuration.

### S-Lite Durable Single Subscription Feed

Status: Complete for the single-admin, single-process implementation boundary

Implemented capabilities:

- explicit opt-in flag: `NOTICEPILOT_ENABLE_SLITE_FEED=true`
- fail-closed startup requiring a whitespace-free 32-byte administrator key and
  an absolute SQLite path
- reference mode and S-Lite mode are mutually exclusive
- authenticated administrator status, create, rotate, and revoke endpoints
- one singleton feed backed by the fixed Foundation.25.1 601-event snapshot
- SQLite persistence of feed identity, lifecycle state, SHA-256 token hash, and
  a hash-derived display fingerprint; the raw token, raw prefix, and full
  subscription URL are never stored
- raw capability URL returned only after a successful create or rotate commit
- existing URL continues to render after a full bridge/server restart
- rotate preserves feed identity, issues a new token once, and invalidates the
  old token with a generic `404`
- revoke persists across restart; explicit rotate is required to reactivate it
- public `GET`, `HEAD`, `ETag`, and `304` behavior with allowlisted headers and
  non-reflecting `404`/`503` failures
- private `0600` database creation, schema-version checks, `BEGIN IMMEDIATE`,
  `busy_timeout`, and `synchronous=FULL`
- real A→B→C restart integration coverage registered in root `npm test`

This is not a production subscription service. It has no UI, accounts,
multi-user profile ownership, live ingestion, crawler schedule, dynamic
snapshot refresh, multi-process coordination, TLS/reverse-proxy deployment,
rate limiting, observability, or automated backup/restore. See
[`slite-durable-feed.md`](../architecture/slite-durable-feed.md).

Local hardening verification on 2026-07-19:

- focused frontend API contract: 3/3 passed
- focused reference-feed HTTP and real bridge contract: 6/6 passed
- focused S-Lite lifecycle, failure, and restart contract: 7/7 passed
- root `npm test`, including S-Lite restart contracts: 137/137 passed
- Foundation.25.1 regression: 462/462 passed
- production build: passed with 57 modules
- high-severity dependency audit: passed with 0 vulnerabilities
- known immutable-package warning: Python 3.14 emits one cleanup
  `ResourceWarning` for the Foundation conditional-304 test; it does not fail
  the suite and the restored subtree remains unchanged

## Current App Schema Baseline

The current app schema uses separate arrays:

```text
deadlines
tasks
submissions
requirements
cautions
calendarEvents
```

Analysis results may also contain optional metadata:

```text
metadata.userPreferencesSnapshot
```

This snapshot is inert. It records current campus preference state for future product context, but it must not change current mock analysis output, exports, or filtering.

This structure should be preserved through Phase 4. UI handlers may be generic, but the app state should not be migrated to a unified `items[]` model yet.

## Current Regression Baselines

Future phases must not break the following behavior:

- client-side mock analysis
- server mock analysis
- bilingual UI
- manual paste flow
- TXT / MD upload flow
- localStorage restore / clear
- campus preference localStorage restore
- `noticepilot:v1` and `noticepilot:campus-preferences:v1` remain separate
- overwrite confirmation
- privacy confirmation
- validation / normalization warnings
- item edit behavior with `edited: true`
- item delete behavior
- task completion toggle
- calendar event selection toggle
- source evidence display
- full evidence review mode
- Markdown export
- optional Markdown evidence export
- all-day selected `.ics` export
- campus preferences remain inert metadata for export behavior
- server unavailable / invalid response error UI

## Explicitly Unsupported Capabilities

The following are not implemented yet:

- real AI API integration
- AI prompt/schema hardening in runtime
- PDF extraction
- HWP/HWPX extraction
- image OCR
- scanned PDF OCR
- advanced relative date resolution
- school-level notice parsing
- checkbox-based batch `.ics` export
- production account-owned or multi-user subscription feeds
- multiple saved notice projects
- login / general application database
- Google Calendar API integration
- payment

## Phase 4 Starting Point

Phase 4 should not begin by directly wiring a provider API. The next step is to document the AI raw schema, prompt contract, corpus plan, and roadmap boundaries so that real AI integration can be implemented against a stable contract.
