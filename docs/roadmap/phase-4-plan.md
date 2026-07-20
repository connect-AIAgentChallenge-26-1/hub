# NoticePilot Route M Plan

> Former document name: NoticePilot Phase 4 Plan
>
> Document role: detailed plan for Route M — Manual / AI assistant
>
> Master roadmap authority: [`current-product-roadmap.md`](current-product-roadmap.md)
>
> Current status: AI route postponed; no live provider is connected
>
> Corpus status: 10-entry collection and deterministic validation complete

## 1. Purpose and Boundary

This document preserves the historical Phase 4 planning lineage while reclassifying it as the detailed plan for **Route M — Manual / AI assistant**.

Route M covers this user flow:

```text
user-provided notice text
→ evidence-backed structured extraction
→ user review and correction
→ Markdown checklist and one-off all-day ICS export
```

Route M does not own or sequence the following work:

- S-Lite deployment and physical calendar-client validation;
- live crawling or scheduled ingestion;
- durable event promotion and reconciliation;
- account-owned subscription feeds;
- subscription-management UI; or
- production subscription operations.

Those boundaries remain under the master product roadmap and Route S.

## 2. Authority and Conflict Rule

Use the following authority order:

```text
current implementation truth
→ ../project/current-implementation-summary.md

master product sequence and route decision
→ current-product-roadmap.md

Route M detail
→ phase-4-plan.md

batch/export/subscription detail
→ batch-calendar-export.md
```

If this document conflicts with current code, registered tests, the implementation summary, or the master roadmap, those sources take precedence.

## 3. Current Implementation Baseline

### 3.1 Route M baseline

The current Route M-adjacent implementation includes:

- React + Vite manual-analysis UI;
- client mock and Express server mock analysis paths;
- Zod-backed server schemas and normalization;
- evidence review, editing, deletion, and completion controls;
- Markdown export;
- selected one-off all-day `.ics` export;
- workspace tabs for `#analyze` and `#calendar`;
- separately stored campus preferences;
- inert `metadata.userPreferencesSnapshot`;
- strict AI raw schema documentation; and
- a prompt contract aligned with the current strict raw schema.

The current analyze mode boundary remains:

```text
missing mode or mode="mock" → mock result
mode="ai"                  → 501 ai_not_implemented
unknown explicit mode       → 400 unsupported_mode
```

A documented AI contract is not evidence that a live provider is connected or quality-validated.

### 3.2 Adjacent implemented boundaries outside Route M

The repository also contains:

- an isolated Foundation.25.1 KNU crawler package;
- an opt-in local reference feed using an in-memory capability that expires on restart;
- an opt-in S-Lite SQLite-backed durable singleton feed;
- administrator create, inspect, rotate, and revoke APIs for S-Lite; and
- reviewed public and LAN Caddy profiles.

These are not Route M deliverables or prerequisites. S-Lite proves one durable link, not account ownership, live ingestion, production deployment, or real-client compatibility.

## 4. Historical Phase Mapping

The historical Phase 4 labels remain available for traceability.

| Historical stage | Current Route M stage | Current status |
| --- | --- | --- |
| Phase 4-A — Planning / Contract Documentation | M0 — Contract baseline | Complete |
| Phase 4-B — Test Corpus Scaffold | M1 — Corpus collection + M2 — Deterministic validation | Initial collection and deterministic validation complete |
| Phase 4-C — Real AI API Integration | M3 — Small server-side AI vertical slice | Postponed |
| Phase 4-D — Corpus-based AI QA | M4 — Corpus-based AI QA | Blocked until M3 produces controlled provider output |
| Phase 4-E — Date Resolution v1 | M5 — Controlled expansion | Blocked by M4 evidence |

The mapping preserves historical references without treating all product work as one linear Phase 4 sequence.

## 5. M0 — Contract Baseline

**Historical label:** Phase 4-A — Planning / Contract Documentation  
**Status:** Complete

### Completed outputs

- `docs/project/current-implementation-summary.md`;
- `docs/roadmap/current-product-roadmap.md`;
- `docs/roadmap/phase-4-plan.md`;
- `docs/ai/ai-output-schema.md`;
- `docs/ai/prompt-contract.md`;
- `docs/qa/test-corpus-plan.md`; and
- `docs/roadmap/batch-calendar-export.md`.

The current contract establishes:

```text
AI raw JSON
→ strict raw-schema parse
→ server-side normalization or domain adapter
→ strict app-schema validation
→ existing review/edit/export UI
```

### Closed decisions

- the AI must not return frontend-only state;
- invalid JSON and raw-schema mismatches fail closed;
- provider failures must not silently become mock successes;
- `userPreferencesSnapshot` remains inert Route M metadata; and
- client mock and server mock remain regression baselines.

### What completion does not mean

M0 completion does not mean:

- a live provider is connected;
- prompt quality is verified;
- corpus evaluation is complete;
- AI output is production-ready; or
- subscription work is part of Route M.

## 6. M1 — Corpus Collection

**Historical label:** part of Phase 4-B — Test Corpus Scaffold  
**Status:** Complete for the initial collection gate

The repository contains 10 verified public-notice entries:

```text
scholarship:    3
school_notice:  3
assignment:     1
competition:    1
job_posting:    1
ambiguous_date: 1
```

Each entry has:

- a public source URL or verified source metadata;
- manually curated extracted text;
- a human-written expected result; and
- privacy and copyright review.

Templates are not counted as real corpus entries. Raw attachments remain excluded unless they are public, safe, necessary, and appropriately reviewed.

Ten examples satisfy an integration entry gate. They do not establish product-level extraction quality or justify school-level parser generalization.

## 7. M2 — Deterministic Corpus Validation

**Historical label:** remaining part of Phase 4-B — Test Corpus Scaffold  
**Status:** Complete for the initial 10-entry deterministic gate.

M2 completion is established by the active operational corpus contract and the registered strict repository validation. It establishes corpus integrity rather than provider-output quality.

### Completed deterministic checks

- required TSV columns, row shapes, allowed notice types, boolean values, copyright-risk values, and published dates are validated;
- repository-relative paths remain inside the repository, resolve to files, follow the required notice-type and ID conventions, and are not duplicated;
- expected truth conforms to the strict active `noticepilot.corpus.expected.v1` contract, including `items[]` and `calendarEventCandidates[]`;
- unsupported versions, unknown keys, legacy expected files, and mixed contracts fail closed;
- expected IDs, source titles, and notice types match the corpus index;
- assertion and candidate enums, normalized dates, date-expression review rules, assertion identities, and exact duplicate assertions are validated;
- assertion evidence is an exact substring of canonical extracted text, and each non-null date expression occurs inside its evidence;
- index privacy and copyright metadata fields are present and valid;
- the active baseline contains 10 indexed entries, 10 v1 expected files, zero legacy expected files, a separately validated v1 template, and the required category distribution; and
- failures identify the affected row or corpus path and violated rule.

The deterministic validator checks privacy and copyright metadata fields; it does not perform general sensitive-data detection over notice text.

### Completion evidence

M2 is complete because:

- strict validation is reproducible through the registered repository command;
- all 10 indexed baseline entries use the active v1 contract;
- zero legacy expected files remain;
- the v1 template is validated separately from real-entry counts;
- the deterministic checks above are enforced by the registered validator; and
- provider-output comparison and quality scoring remain outside M2.

M2 completion does not authorize M3. M3 remains postponed and requires its separate entry criteria before implementation resumes.

## 8. M3 — Small Server-side AI Vertical Slice

**Historical label:** Phase 4-C — Real AI API Integration  
**Status:** Postponed; not the current productization route

### Entry criteria

Before implementation begins, approve:

- confirm that the registered M2 deterministic validation remains green;
- one provider or a narrow provider-adapter interface;
- quality metrics, stop conditions, and rollback criteria;
- server-side secret storage and environment separation;
- prompt-injection and untrusted-input boundaries;
- personal-data, logging, and retention rules;
- request-size, timeout, quota, and concurrency limits; and
- an explicit reviewable implementation scope.

### Initial runtime scope

```text
manual text
→ POST /api/analyze mode="ai"
→ one server-side provider adapter
→ strict AI raw-schema parse
→ normalization
→ strict app-schema validation
→ existing review/edit UI
→ Markdown and one-off all-day ICS export
```

### Requirements

- provider credentials remain server-only;
- provider-specific code remains behind a narrow server boundary;
- raw output is parsed before app projection;
- invalid JSON is not partially normalized;
- schema mismatch fails closed;
- invalid raw output does not create calendar events;
- app-schema failure is not shown as a successful analysis;
- provider errors, stacks, and credentials are not exposed to the client;
- client mock and server mock remain available; and
- provider failure never silently falls back to a successful mock result.

### Explicit non-goals

- no PDF, HWP, HWPX, image, or OCR extraction;
- no `/api/extract` in the same slice;
- no root-application live crawling or scheduled ingestion;
- no multi-institution parser orchestration;
- no account database or saved multi-project repository;
- no provider-result persistence;
- no subscription database work;
- no changes to the isolated S-Lite SQLite singleton;
- no subscription management; and
- no campus-preference filtering of Route M extraction or exports.

The existing Foundation.25.1 crawler remains an isolated package and does not convert M3 into a school-level live-ingestion feature.

## 9. M4 — Corpus-based AI QA

**Historical label:** Phase 4-D — Corpus-based AI QA  
**Status:** Blocked until M2 is complete and M3 works on a controlled input

### Structural validity

Measure:

- schema-valid response rate;
- required arrays and fields;
- enum correctness;
- valid `normalizedDate` behavior;
- warning-shape correctness; and
- fail-closed behavior for invalid output.

### Extraction quality

Measure correctness for:

- deadlines;
- tasks;
- submissions;
- requirements;
- cautions; and
- calendar event candidates.

### Reliability

Measure:

- evidence coverage;
- fabricated-evidence rate;
- hallucination rate;
- critical-omission rate;
- user-correction rate;
- `reviewRequired` appropriateness;
- ambiguous-date preservation; and
- source-to-output traceability.

### Operational behavior

Measure:

- latency;
- timeout;
- quota and rate-limit failures;
- invalid JSON;
- schema mismatch;
- provider failure; and
- no-silent-fallback behavior.

### Required outputs

- reproducible corpus runner or execution procedure;
- provider, model, prompt, and contract revision record;
- corpus-ID-level results;
- expected-versus-actual report;
- critical failure taxonomy;
- regression baseline;
- prompt/schema revision backlog; and
- proposed quality thresholds and stop conditions.

No release gate passes until the quality thresholds and stop conditions are explicitly approved. This document does not invent those numerical thresholds in advance.

## 10. M5 — Controlled Expansion

**Historical label:** Phase 4-E — Date Resolution v1 and later Route M expansion  
**Status:** Blocked until M4 evidence supports expansion

M5 is not one combined implementation phase. Each capability requires its own vertical slice and entry gate.

### Candidate expansions

1. **Date resolution**
   - prioritize absolute dates;
   - compute relative dates only from a reliable reference date;
   - preserve the original expression;
   - use an empty normalized date when recovery is unsafe;
   - require review for ambiguous or derived dates; and
   - exclude timestamp and time-specific ICS support unless separately approved.

2. **File extraction**
   - keep extraction separate from analysis;
   - evaluate PDF text extraction first;
   - review HWP/HWPX and OCR as distinct risks; and
   - retain manual text as the stable fallback input class.

3. **School-level parser evaluation**
   - keep the isolated Foundation package distinct from root-app ingestion;
   - require roughly 30 verified examples before generalization; and
   - avoid overfitting to one institution or a small corpus.

4. **Checkbox-based batch one-off ICS export**
   - require stable single-notice extraction quality first;
   - define event identity and duplicate handling separately; and
   - do not conflate downloaded batch ICS with a durable subscription feed.

Subscription expansion is not an M5 subphase. It remains Route S work under the master roadmap.

## 11. Campus Preference Boundary

For Route M:

```text
userPreferencesSnapshot
→ request/result metadata only
→ no extraction change
→ no notice filtering
→ no Markdown filtering
→ no one-off ICS filtering
```

Future Route S `SubscriptionProfile` filtering is a separate contract and must not be inferred from Route M metadata.

## 12. Route M Release Gate

Before Route M is offered to external users, verify:

- the target user and supported input class are explicit;
- corpus-backed quality thresholds and stop criteria are approved;
- evidence remains traceable through review and editing;
- prompt injection and untrusted input are reviewed;
- secrets, personal data, logs, and retention are reviewed;
- provider failures cannot produce a false successful analysis;
- request limits, abuse controls, and error redaction are defined;
- Korean and English critical flows remain usable;
- accessibility and user-correction flows are tested;
- mock regression paths remain stable; and
- Markdown and one-off ICS behavior remain correct.

Passing this gate does not authorize Route S, S-Lite production deployment, live crawling, or account-owned subscription service.

## 13. Execution Rules

- Implement one Route M vertical slice at a time.
- Keep corpus, provider, schema, runtime, Wiki, and subscription work in separate reviewable PR boundaries.
- Preserve the latest default branch, protected CI checks, and resolved review conversations before merge.
- Do not modify `packages/noticepilot-knu-crawler/**` as part of Route M planning or provider integration.
- Wiki publication, upstream PR creation, production deployment, and physical-device mutation retain separate approval gates.

## 14. References

- Current implementation: [`../project/current-implementation-summary.md`](../project/current-implementation-summary.md)
- Master product roadmap: [`current-product-roadmap.md`](current-product-roadmap.md)
- AI raw schema: [`../ai/ai-output-schema.md`](../ai/ai-output-schema.md)
- Prompt contract: [`../ai/prompt-contract.md`](../ai/prompt-contract.md)
- Corpus plan: [`../qa/test-corpus-plan.md`](../qa/test-corpus-plan.md)
- Corpus baseline: [`../../test-corpus/README.md`](../../test-corpus/README.md)
- Batch/export/subscription detail: [`batch-calendar-export.md`](batch-calendar-export.md)
