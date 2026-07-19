# NoticePilot Phase 4 Plan

## Purpose

Phase 4 prepares NoticePilot for real AI integration without collapsing the project into an unstructured AI demo. The phase is split into documentation, corpus, integration, AI QA, and date-resolution subphases.

## Confirmed Direction

The confirmed Phase 4 architecture is:

```text
AI raw schema
→ server-side normalization / validation
→ current NoticePilot app schema
→ frontend rendering / review / export
```

The AI should not directly return the current frontend app schema. This separation keeps prompt design, AI response evaluation, and future batch calendar export more maintainable.

## Current Baseline Before Real AI

The current app already includes:

- React + Vite frontend MVP
- Express mock analyze API
- Zod-backed server schemas
- client mock and server mock analysis paths
- workspace tabs for `#analyze` and `#calendar`
- separate campus preference storage
- inert `metadata.userPreferencesSnapshot`
- selected all-day `.ics` export

Campus preferences are stored and echoed as metadata only. They do not affect analysis, filtering, Markdown export, or `.ics` export behavior in Phase 4.

## Phase 4-A. Planning / Contract Documentation

### Goal

Create the planning and contract documentation needed before implementing real AI.

### Deliverables

- `docs/project/current-implementation-summary.md`
- `docs/roadmap/phase-4-plan.md`
- `docs/ai/ai-output-schema.md`
- `docs/ai/prompt-contract.md`
- `docs/qa/test-corpus-plan.md`
- `docs/roadmap/batch-calendar-export.md`

### Entry Criteria

- Frontend MVP follow-up complete
- Express analyze API skeleton complete
- Frontend ↔ server mock wiring complete
- Zod-backed server schemas available
- Calendar tab and campus preference metadata complete
- client mock and server mock available as regression baselines

### Exit Criteria

- AI raw schema documented
- mapping into current app schema documented
- prompt contract documented
- corpus structure and expected-result policy documented
- Phase 4-B through Phase 4-E boundaries documented
- batch calendar export roadmap documented as future behavior, not current implementation

### Non-goals

- no real AI API call
- no API key
- no PDF/HWP/HWPX/OCR extraction
- no runtime behavior change
- no campus-preference-based filtering or analysis behavior
- no database/auth/payment/Google Calendar API

## Phase 4-B. Test Corpus Scaffold

### Goal

Create the first reproducible test corpus structure for real notice examples.

### Deliverables

- `test-corpus/index/notice_index.tsv`
- manually extracted text files
- expected result JSON files
- selected public raw attachments only when safe and necessary

### Initial Target

Start with 10 to 12 examples:

```text
school notice: 2-3
scholarship: 2-3
assignment / course notice: 2
competition: 1-2
job / internship: 1-2
ambiguous date notice: 1-2
```

### Entry Criteria

- Phase 4-A documentation merged
- corpus columns and expected-result policy accepted

### Exit Criteria

- at least 10 examples indexed
- each example has public URL or source metadata
- each example has manually extracted text
- each example has expected result file
- privacy/copyright checks applied

### Non-goals

- no automated crawling
- no school-level parser
- no OCR pipeline
- no AI provider integration requirement

## Phase 4-C. Real AI API Integration

### Goal

Implement `mode: "ai"` through the Express server while keeping API keys server-only.

### Expected Runtime Flow

```text
frontend request
→ POST /api/analyze mode="ai"
→ server builds prompt
→ provider call
→ parse AI raw JSON
→ normalize to app schema
→ attach inert app metadata as needed
→ validate app schema
→ return result to frontend
```

### Requirements

- API key must never be exposed to the browser.
- provider-specific code should remain server-side.
- AI response must be parsed as AI raw schema first.
- Zod schemas should validate AI raw output and app analysis output.
- server normalization must convert AI raw schema into current NoticePilot app schema.
- `userPreferencesSnapshot` should remain optional app metadata and must not alter extraction in this phase.
- frontend should continue using existing validation defensively.
- client mock and server mock should remain available.

### Error Policy

Distinguish the following where possible:

- network/provider failure
- timeout
- quota/rate-limit error
- invalid JSON
- schema mismatch
- unsupported mode
- AI not configured

Do not automatically fall back to server mock. A future user-controlled fallback action may be offered.

### Non-goals

- no batch `.ics`
- no PDF/HWPX/OCR
- no school-specific parser
- no campus preference filtering
- no production user-specific subscription feed or persistent backend generation; the separate opt-in local/reference slice remains unchanged
- no database/auth/payment/Google Calendar API

## Phase 4-D. Corpus-based AI QA

### Goal

Evaluate real AI extraction against the test corpus.

### Deliverables

- QA report comparing AI output against expected results
- prompt/schema revision backlog
- failure taxonomy
- examples of strong/weak extraction cases

### Evaluation Dimensions

- deadline extraction accuracy
- submission extraction accuracy
- requirement extraction accuracy
- caution extraction usefulness
- calendar event candidate correctness
- evidence quality
- hallucination rate
- reviewRequired appropriateness
- warning quality

### Entry Criteria

- Phase 4-B corpus scaffold exists
- Phase 4-C real AI integration works on at least one example

### Exit Criteria

- corpus examples can be run through real AI mode
- AI output can be compared with expected results
- top prompt/schema defects are identified

## Phase 4-E. Date Resolution v1

### Goal

Improve date handling without overbuilding a full natural-language date engine.

### Initial Rule

- Prioritize absolute dates.
- Allow relative dates only when a reliable reference date exists.
- Ambiguous dates should be `reviewRequired: true`.
- Preserve original date expressions.

### Long-term Direction

Move date computation toward a server-side date resolver:

```text
originalDateExpression + referenceDate + context
→ normalizedDate / reviewRequired / dateConfidence
```

### Non-goals

- no full recurring schedule engine
- no timezone-specific event support
- no time-specific `.ics` event support in this phase

## Post-Phase-4 Roadmap

### Phase 5. Advanced File Extraction

Goal:

- introduce `/api/extract`
- support PDF text extraction
- evaluate HWP/HWPX extraction strategy
- evaluate OCR for scanned documents/images

Important boundary:

Analyze and extract should remain separate capabilities.

### Phase 6. School-level Notice Parsing

Entry condition:

- about 30 corpus examples collected

Goal:

- compare school notice patterns
- identify institution-specific metadata needs
- evaluate whether heuristic parsing or prompt rules are sufficient

### Phase 7. Batch Calendar Export

Goal:

- parse multiple notices
- collect calendar event candidates
- allow event-level checkbox selection
- export selected events as `.ics`

### Phase 8. Subscription Calendar Feed

Goal:

- move beyond downloaded `.ics` files toward a subscription feed

Status:

- future roadmap only
- an opt-in loopback-only fixed reference feed exists for contract validation
- no durable database or user-specific subscription state exists yet
