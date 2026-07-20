# NoticePilot Test Corpus Plan

> Document role: corpus purpose, coverage, evaluation scope, and stage gates
>
> Operational contract authority: [`../../test-corpus/README.md`](../../test-corpus/README.md)
>
> Current status:
> - Route M M1 corpus collection: complete
> - Route M M2 deterministic validation: pending

## 1. Purpose

The test corpus provides verified real-notice examples for evaluating NoticePilot extraction quality before a live AI provider is treated as a product-quality signal.

The corpus supports:

- prompt and schema evaluation;
- AI extraction QA;
- date and ambiguity QA;
- evidence quality review;
- future parser evaluation; and
- future batch calendar-export evaluation.

This plan defines why the corpus exists, what coverage it should provide, and which gates determine progress. It does not define the executable file shape.

## 2. Authority Boundary

Use the following responsibility split:

```text
docs/qa/test-corpus-plan.md
= purpose, scope, coverage, evaluation dimensions, and stage gates

test-corpus/README.md
= corpus layout, index contract, canonical extracted-text policy,
  expected-truth schema, migration rules, validator requirements,
  authoring workflow, and activation state
```

The operational file, path, expected-truth, evidence, migration, and activation contracts are defined exclusively in `test-corpus/README.md`.

This document must not duplicate an expected-result JSON shape or introduce an alternate corpus schema. When the two documents appear to conflict, `test-corpus/README.md` governs corpus authoring and deterministic validation.

## 3. Confirmed Corpus Policy

- Use public notice pages or explicitly provided source material.
- Keep manually curated canonical extracted text for each real entry.
- Include raw PDF, HWPX, HWP, or image files only when they are public, safe, necessary, and appropriate for repository use.
- Exclude login-required, internal-only, personal, applicant-list, and unclear-copyright material.
- Human expected truth must remain grounded in canonical extracted text.
- Expected truth must not be copied from AI or Foundation output without human review.
- Expansion should add failure modes and source diversity rather than duplicate easy examples.

## 4. Current Baseline and Stage Status

The initial collection baseline was completed on 2026-07-19 with 10 verified Kangwon National University notices:

```text
scholarship:    3
school_notice:  3
assignment:     1
competition:    1
job_posting:    1
ambiguous_date: 1
```

Each indexed entry has a public source, canonical extracted text, a human-written expected result, and privacy/copyright review.

### M1 — Corpus collection

**Status: Complete for the initial 10-entry gate.**

M1 completion means that the initial category baseline and referenced corpus files exist. It does not prove that expected truth is structurally valid, evidence-exact, semantically complete, or ready for provider comparison.

### M2 — Deterministic validation

**Status: Pending.**

M2 is complete only when the operational activation gate in `test-corpus/README.md` is complete and the registered repository validation passes.

M2 must establish, at minimum:

- strict expected-truth schema validation;
- index, path, filename, ID, title, and notice-type consistency;
- allowed enum and date validation;
- exact evidence traceability to canonical extracted text;
- duplicate and assertion-identity checks;
- template exclusion from real-entry counts;
- baseline category-distribution verification; and
- deterministic, reviewable failures identifying the corpus ID and violated rule.

File presence alone does not complete M2.

## 5. Coverage Priorities by Notice Type

Expected-result depth should reflect the notice type while using the operational assertion contract defined in `test-corpus/README.md`.

### Scholarship

Prioritize:

- deadlines;
- submissions;
- requirements;
- calendar-event candidate correctness; and
- evidence traceability.

### Assignment or course notice

Prioritize:

- tasks;
- submissions;
- deadlines;
- cautions;
- tentative schedules; and
- calendar-event candidate correctness.

### School notice

Prioritize:

- user-actionable deadlines;
- tasks;
- cautions;
- internal-versus-student deadline distinction; and
- calendar-event candidate correctness.

### Competition

Prioritize:

- application and submission deadlines;
- submissions;
- requirements;
- separate event boundaries; and
- evidence traceability.

### Job or internship notice

Prioritize:

- application deadlines;
- requirements;
- submissions;
- cautions; and
- calendar-event candidate correctness.

### Ambiguous-date notice

Prioritize:

- original date expression preservation;
- unresolved or tentative date handling;
- `reviewRequired` appropriateness;
- caution behavior; and
- evidence traceability.

## 6. Deterministic Validation Versus Provider Evaluation

M2 deterministic validation and later provider-quality evaluation are separate gates.

```text
M2 deterministic validation
= corpus files and human expected truth are internally valid and reproducible

M4 provider-quality evaluation
= model output is compared against active human expected truth
```

M2 must not score provider quality. M4 must not compensate for an invalid corpus.

## 7. Evaluation Dimensions

Later provider-output evaluation should measure:

1. deadline correctness;
2. calendar-event candidate correctness;
3. submission extraction correctness;
4. requirement extraction correctness;
5. task usefulness;
6. caution usefulness;
7. evidence exactness and coverage;
8. hallucination absence;
9. date-normalization correctness;
10. ambiguity preservation;
11. `reviewRequired` appropriateness; and
12. critical omission and user-correction rate.

Suggested qualitative disposition:

```text
pass
minor issue
major issue
fail
```

A text difference alone is not necessarily a semantic failure. Matching and scoring policy requires a separate executable evaluation harness after M2.

## 8. Expansion Policy

The current 10 examples are an integration entry gate, not sufficient product-quality evidence.

Expansion should prioritize:

- new failure modes;
- new date, time, period, and ambiguity patterns;
- attachment-related evidence boundaries;
- different notice-board structures; and
- institutional diversity.

Do not add near-duplicate easy examples merely to increase the count.

## 9. Approximate 30-example Threshold

The approximate 30-example threshold applies to:

- broader parser generalization;
- multi-institution coverage claims; and
- new school-specific parsing strategies.

It does not block:

- deterministic validation of the current 10-entry corpus;
- Route M evaluation-harness work;
- the existing Foundation.25.1 package;
- verified-fixture export QA; or
- S-Lite physical calendar-client validation.

## 10. Privacy and Copyright Boundary

Do not include:

- student names or student IDs;
- applicant lists;
- resident-registration-number-like values;
- unnecessary personal phone numbers;
- internal-only documents;
- login-required documents; or
- raw files with unclear copyright status.

When raw attachments are unnecessary, retain only:

```text
public source URL
+ canonical extracted text
+ corpus metadata
+ human expected truth
```

## 11. Non-goals

This plan does not itself implement or authorize:

- a live AI provider;
- automated crawling or scheduling;
- PDF, HWP, HWPX, image, or OCR extraction;
- school-specific parser expansion;
- candidate promotion;
- persistent CalendarEvent identity or reconciliation;
- ICS serialization;
- batch-export UI;
- subscription-feed management; or
- production deployment.

Those capabilities retain their own contracts and gates. The presence or absence of those implementations elsewhere in the repository does not alter the corpus-stage definitions in this plan.
