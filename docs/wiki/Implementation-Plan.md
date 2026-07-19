# Implementation Plan

> Wiki version: 2026-07-09 Calendar tab / campus preferences baseline
> Implementation baseline: React + Vite frontend MVP, Express mock analyze API, Zod server schemas, frontend-server mock analyze wiring, calendar tab, and campus preferences
> Runtime scope: Phase 4 real AI integration is planned but not implemented yet.

## 1. Current Baseline

The current NoticePilot project is no longer only a React + Vite UI skeleton. It now includes a React + Vite frontend MVP, an Express mock analyze API, Zod-backed server schemas, frontend-to-server mock analyze wiring, workspace tabs, and campus preferences.

Current implemented baseline:

```text
- React + Vite frontend MVP
- Express analyze API skeleton
- Zod-backed server schemas
- GET /api/health
- POST /api/analyze mock mode
- mode: "ai" returns 501 ai_not_implemented
- unknown explicit mode returns 400 unsupported_mode
- Vite /api dev proxy to the Express server
- bilingual UI
- workspace hash tabs for #analyze and #calendar
- project introduction section
- notice title/body input
- TXT / MD file upload
- extract preview before analysis
- notice type input
- notice publication date input
- client-side mock analysis button
- server mock analysis button
- analysis dashboard
- item edit/delete
- task completion toggle
- calendar event selection toggle
- source evidence panel
- full evidence review mode
- warning and error UI
- privacy-like pattern detection and confirmation
- overwrite confirmation
- frontend and backend validation/normalization
- localStorage persistence
- separate campus preference persistence
- inert metadata.userPreferencesSnapshot
- calendar tab with campus preferences and opt-in local reference subscription flow
- Markdown checklist download
- optional evidence inclusion in Markdown export
- selected all-day .ics export
- server unavailable / invalid response handling
```

Not implemented yet:

```text
- real AI API call
- runtime AI prompt/schema hardening
- PDF / HWP / HWPX / OCR parsing
- advanced relative date resolution
- school-level notice parsing
- checkbox-based batch .ics export
- production user-specific subscription feed and persistent backend generation
- login / database / payment
- Google Calendar API integration
```

This implementation plan assumes the current working app should be preserved. Do not rebuild the app from scratch.

---

## 2. Development Principles

```text
- Preserve the existing working client mock flow.
- Preserve the existing server mock flow.
- Keep the app usable with manual text paste only.
- Keep TXT / MD upload as a lightweight client-side path.
- Keep campus preferences inert until a later school parsing/filtering phase explicitly changes behavior.
- Add real functionality incrementally.
- Treat AI output as untrusted external input.
- Treat file input as unstable.
- Require user review before analysis and export.
- Avoid premature architecture changes.
- Keep all future roadmap items clearly separated from implemented behavior.
```

---

## 3. Completed Milestones

### 3.1 Phase 1: Frontend MVP Follow-up

Status: Completed

Implemented:

```text
- preserved React + Vite skeleton
- preserved bilingual UI
- preserved manual paste flow
- added TXT / MD upload
- added extract preview
- added notice type input
- added notice publication date input
- added warning/error UI
- added privacy warning and lightweight detection
- added overwrite confirmation
- added localStorage persistence
- added real all-day .ics export
- improved Markdown export with evidence option
- added full evidence review mode
- extracted repeated update logic into utilities
- preserved edit/delete/toggle flows
```

Acceptance state:

```text
- npm run build passed
- existing client-side mock analysis continued to work
- manual paste flow remained usable
- real selected all-day .ics export replaced the placeholder
```

---

### 3.2 Phase 1-QA: Frontend MVP QA and Major Fixes

Status: Completed

Fixed major issues:

```text
- language toggle no longer replaces the active analysis result
- calendar event UI no longer implies time-specific export when export is all-day only
```

Regression baseline:

```text
- client-side mock analysis
- bilingual UI
- manual paste flow
- TXT / MD upload
- edit/delete/toggle behavior
- evidence panel
- Markdown export
- all-day .ics export
```

---

### 3.3 Phase 2: Express /api/analyze Skeleton

Status: Completed

Implemented:

```text
- Express dependency and server scripts
- server/src/index.js
- GET /api/health
- POST /api/analyze
- mock analysis service
- AI service stub
- server-side validation utility
```

Endpoint behavior:

```text
POST /api/analyze with missing mode or mode="mock"
→ returns server mock analysis result

POST /api/analyze with mode="ai"
→ returns 501 ai_not_implemented

POST /api/analyze with unknown explicit mode
→ returns 400 unsupported_mode
```

Scope limits:

```text
- real AI API call not implemented
- API keys not added
- file extraction not added
- authentication/database/payment not added
```

---

### 3.4 Phase 2-QA: Backend Analyze API QA and Major Fixes

Status: Completed

Fixed major issues:

```text
- unsupported modes are no longer silently treated as mock
- mode="ai" remains explicitly blocked with 501 ai_not_implemented
- server validation normalizes section item fields into stable frontend-compatible shapes
```

Regression baseline:

```text
- npm run build
- git diff --check
- npm run dev:server
- GET /api/health
- POST /api/analyze mock mode
- POST /api/analyze mode="ai"
- POST /api/analyze unknown explicit mode
```

---

### 3.5 Phase 3: Frontend ↔ Server Mock Analyze Wiring

Status: Completed

Implemented:

```text
- added a separate server mock analysis action
- preserved existing client-side mock analysis action
- added src/utils/analyzeApi.js
- POST /api/analyze request with mode="mock"
- included language, noticeTitle, extractedText, userSelectedNoticeType, noticePublicationDate, and uploadedFileName in request body
- added Vite /api dev proxy to Express server
- added server mock loading state
- added server unavailable / non-2xx / invalid response error handling
- applied frontend validation to server response before storing analysisResult
- preserved overwrite confirmation for server mock analysis
- preserved privacy confirmation for server mock analysis
- preserved localStorage persistence
```

Scope limits:

```text
- real AI API not implemented
- mode="ai" not exposed as a normal user-facing AI feature
- PDF/HWP/HWPX/OCR not added
- .ics export scope not changed
```

---

### 3.6 Phase 3-QA: Frontend-Server Mock Wiring QA

Status: Completed

Verified:

```text
- npm run build passed
- git diff --check passed
- npm run dev:server started Express server
- npm run dev started Vite frontend
- GET /api/health worked
- POST /api/analyze mock mode worked
- mode="ai" still returned 501 ai_not_implemented
- unsupported explicit mode still returned 400 unsupported_mode
- Vite /api proxy forwarded requests to Express
- existing client-side mock analysis still worked
- server mock analysis rendered server result and warnings
- overwrite confirmation worked with server mock analysis
- privacy confirmation worked with server mock analysis
- server unavailable path displayed a clear input error
- edit/delete/task toggle/export flows worked after server mock analysis
- English/Korean server mock button labels worked
```

---

### 3.7 Calendar Tab + Campus Preferences

Status: Completed

Implemented:

```text
- added workspace hash tabs for #analyze and #calendar
- normalized unsupported workspace hashes to #analyze
- updated header links to supported workspace hashes
- added full-width calendar tab
- added campus preference card
- added opt-in local reference subscription creation, copy, and status flow
- added separate campus preference localStorage key
- normalized invalid and duplicate campus IDs
- attached inert metadata.userPreferencesSnapshot to client mock results
- included userPreferencesSnapshot in server mock requests
- echoed normalized metadata.userPreferencesSnapshot from Express mock responses
- preserved existing analysis, filtering, Markdown export, and .ics export behavior
```

Scope limits:

```text
- no crawler
- no real school notice collection
- no school selector or notice filtering
- no subscription ICS URL/backend feed generation
- no behavior changes from campus preferences
```

---

### 3.8 Calendar / Export QA Notes

Status: Completed with documented limitations

Verified:

```text
- npm run build passed
- git diff --check passed
- campus preference helper checks passed
- backend snapshot normalization checks passed
- Express /api/analyze snapshot echo smoke passed
- browser tab routing and Back behavior worked
- campus preference save status and refresh restore worked
- Markdown and .ics files were generated from browser clicks
- generated export file contents matched expected sample data
```

Known QA limitations:

```text
- Browser plugin read-only page scope did not expose raw localStorage.
- Blob download events were not captured through waitForEvent('download').
- Those checks were covered by helper serialization, refresh restore, and Downloads file inspection.
```

---

## 4. Current Regression Baseline

The following behavior must remain stable in future phases:

```text
- client-side mock analysis
- server mock analysis
- manual text paste flow
- TXT / MD upload and extract preview
- notice title input
- notice type input
- publication date input
- privacy warning and confirmation
- overwrite confirmation
- frontend validation/normalization
- backend validation/normalization
- warning banner
- blocking error UI
- item edit/delete
- task completion toggle
- calendar event selection toggle
- source evidence panel
- full evidence review mode
- Markdown export
- Markdown export with evidence option
- selected all-day .ics export
- localStorage session restore and clear
- workspace tab routing
- campus preference localStorage restore
- userPreferencesSnapshot remains inert metadata
```

---

## 5. Phase 4 Plan

Phase 4 should not be treated as one implementation task. It should be split into planning, corpus, real AI integration, QA, and date resolution subphases.

### 5.1 Phase 4-A: Planning / Contract Documentation

Goal:

```text
Create planning and contract documentation before implementing real AI.
```

Scope:

```text
- current implementation summary
- Phase 4 plan
- AI output schema
- prompt contract
- test corpus plan
- batch calendar export roadmap
```

Confirmed decisions:

```text
- AI should not directly return the current frontend app schema.
- AI should return an AI raw schema.
- Server-side normalization and validation should convert AI raw schema into the current NoticePilot app schema.
- Current app schema continues to use separated arrays:
  - deadlines
  - tasks
  - submissions
  - requirements
  - cautions
  - calendarEvents
- Initial AI date handling prioritizes absolute dates.
- Relative dates may be accepted only when a reliable reference date exists.
- Long-term date calculation should move into a server-side date resolver.
- Client mock, server mock, and future real AI should all remain available for development/regression.
```

Non-goals:

```text
- no real AI API call
- no API key
- no PDF/HWPX/OCR extraction
- no database/auth/payment/Google Calendar API
- no runtime behavior changes unless strictly necessary
```

Exit criteria:

```text
- docs/project/current-implementation-summary.md exists
- docs/roadmap/phase-4-plan.md exists
- docs/ai/ai-output-schema.md exists
- docs/ai/prompt-contract.md exists
- docs/qa/test-corpus-plan.md exists
- docs/roadmap/batch-calendar-export.md exists
- git diff --check passes
```

---

### 5.2 Phase 4-B: Test Corpus Scaffold

Goal:

```text
Create a small real-notice corpus scaffold for future AI evaluation.
```

Scope:

```text
- test-corpus folder structure
- notice_index.tsv
- 10 to 12 public notice examples
- manually extracted text
- expected result JSON files
- README explaining corpus policy
```

Corpus policy:

```text
- Start with public URLs and manually extracted text.
- Include raw PDF/HWPX/HWP files in the repo only when they are public, safe, and necessary.
- Do not include personal information or internal/private documents.
- Expected results should vary by notice type.
```

Suggested notice types:

```text
- school_notice
- scholarship
- assignment
- competition
- job_posting
- ambiguous_date
- attachment_heavy
```

Exit criteria:

```text
- at least 10 to 12 examples exist
- notice_index.tsv is filled
- each example has extracted text
- key examples have expected result JSON
- privacy/copyright review is documented
```

---

### 5.3 Phase 4-C: Real AI API Integration

Goal:

```text
Implement POST /api/analyze mode="ai" using a real AI provider through the Express server.
```

Scope:

```text
- server-only API key through environment variable
- no browser-exposed API key
- AI prompt using the prompt contract
- AI raw schema parsing
- server-side AI raw schema normalization
- conversion into current app schema
- provider failure handling
- invalid JSON handling
- schema mismatch handling
- timeout handling
- frontend AI analyze button or developer-facing action
```

Required behavior:

```text
- client mock remains available
- server mock remains available
- real AI is added as a third path
- automatic fallback to mock is not allowed
- user-controlled fallback to server mock may be offered after AI failure
```

Exit criteria:

```text
- mode="ai" can call real AI when API key is configured
- missing API key returns clear error
- invalid JSON returns clear error
- provider failure returns clear error
- timeout returns clear error
- server validation still protects the frontend
- client mock and server mock regression pass
```

---

### 5.4 Phase 4-D: Corpus-Based AI QA

Goal:

```text
Evaluate real AI extraction quality against the test corpus.
```

Scope:

```text
- run AI analysis against corpus examples
- compare AI output with expected result JSON
- record extraction quality observations
- classify errors by type
- produce prompt/schema improvement backlog
```

Evaluation focus:

```text
- deadline extraction
- submission extraction
- requirement extraction
- calendarEvent candidate generation
- evidence quality
- date normalization
- reviewRequired usage
- hallucination avoidance
- warning quality
```

Exit criteria:

```text
- QA report exists
- major recurring failure types are identified
- prompt/schema backlog is created
- decision made whether schema/prompt is stable enough for next phase
```

---

### 5.5 Phase 4-E: Date Resolution v1

Goal:

```text
Improve date handling without overbuilding a full date engine.
```

Scope:

```text
- refine absolute date handling
- allow limited relative date handling only with reliable referenceDate
- mark relative-date-derived events as reviewRequired
- keep vague dates out of calendarEvents
- document long-term server date resolver direction
```

Non-goals:

```text
- no full Korean natural-language date engine
- no timezone-specific event handling
- no time-specific .ics export
```

Exit criteria:

```text
- date policy is implemented consistently
- reviewRequired behavior is tested
- ambiguous dates produce warnings or cautions
- .ics export remains all-day only
```

---

## 6. Post-Phase-4 Roadmap

### Phase 5: Advanced File Extraction

Goal:

```text
Add /api/extract and support complex document formats.
```

Possible scope:

```text
- PDF text extraction
- HWPX extraction
- HWP strategy review
- OCR for images/scanned PDFs
- extraction confidence
- extract preview before analysis
```

Important boundary:

```text
Text extraction should remain separate from analysis.
```

---

### Phase 6: School-Level Notice Parsing

Entry condition:

```text
At least around 30 corpus examples should exist before this phase becomes serious.
```

Goal:

```text
Handle school notice formats and metadata more systematically.
```

Possible scope:

```text
- institution metadata
- notice category
- source URL
- published date
- attachment metadata
- school-specific parsing observations
```

---

### Phase 7: Batch Calendar Export

Goal:

```text
Let users select calendar event candidates across multiple notices and export selected events as .ics.
```

Initial selection unit:

```text
calendarEvent candidate
```

Future addition:

```text
notice-level select-all
```

---

### Phase 8: Subscription Calendar Feed

Goal:

```text
Move beyond downloaded .ics files toward a future subscription feed.
```

Status:

```text
Production user-specific feed remains future scope. The current MVP exposes
only an opt-in, loopback-only fixed Foundation.25.1 reference feed.
```

---

## 7. Recommended Next PR Boundaries

### Next PR

```text
Document NoticePilot Phase 4 plan and AI integration contracts
```

Expected files:

```text
- docs/project/current-implementation-summary.md
- docs/roadmap/phase-4-plan.md
- docs/ai/ai-output-schema.md
- docs/ai/prompt-contract.md
- docs/qa/test-corpus-plan.md
- docs/roadmap/batch-calendar-export.md
```

### Following PR

```text
Add NoticePilot test corpus scaffold
```

Expected files:

```text
- test-corpus/README.md
- test-corpus/index/notice_index.tsv
- test-corpus/extracted-text/...
- test-corpus/expected-results/...
```

### Later PR

```text
Implement real AI analyze mode
```

Expected files:

```text
- server/src/services/aiAnalysisService.js
- server/src/utils/normalizeAiRawResult.js
- server/src/utils/validateAiRawResult.js
- updates to analyze route and API client
- AI failure handling tests or QA notes
```

---

## 8. Verification Requirements

For documentation-only PRs:

```text
- git diff --check
- npm run build optional but recommended
```

For runtime PRs:

```text
- npm run build
- git diff --check
- npm run dev:server
- npm run dev
- GET /api/health
- POST /api/analyze mock mode
- POST /api/analyze mode="ai" when relevant
- client-side mock regression
- server mock regression
- export regression
```

---

## 9. Current Implementation Rule

Do not remove or hide the existing mock flows during Phase 4.

```text
- client-side mock analysis remains available
- server mock analysis remains available
- future real AI analysis is added separately
- campus preferences remain metadata-only until a later explicit filtering or subscription phase
```

This keeps the demo stable and gives reviewers a reliable regression baseline.
