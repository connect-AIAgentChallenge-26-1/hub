# NoticePilot Test Corpus

> Historical name: Phase 4-B corpus scaffold
>
> Current classification:
> - Route M M1 corpus collection: complete
> - Route M M2 deterministic validation: pending
>
> Document role:
> - operational contract for corpus layout and authoring
> - canonical extracted-text policy
> - approved target contract for expected truth JSON
> - legacy migration and activation gates
>
> Planning authority: [`../docs/qa/test-corpus-plan.md`](../docs/qa/test-corpus-plan.md)

## 1. Contract Status

The approved target expected-truth contract is:

```text
noticepilot.corpus.expected.v1
```

This contract is **approved but not active**.

Current repository state:

```text
v1 target contract                    approved
legacy expected files                 migration pending
example template                      migration pending
executable validator enforcement      pending
activation                            blocked
```

The current 10 expected JSON files and `templates/expected-result.example.json`
still use the legacy app-oriented shape. The current validator also checks only
that the legacy six expected sections exist as arrays. Those files are migration
inputs, not examples of an active v1 contract.

Do not describe v1 as active or enforced until the activation gate in section 16
is complete.

## 2. Purpose and Truth Authority

The corpus evaluates NoticePilot extraction behavior using real public notices.
It supports:

- prompt and schema validation;
- AI extraction QA;
- date and ambiguity QA;
- evidence quality review;
- future parser evaluation; and
- future batch calendar-export evaluation.

Expected truth is a set of human-verified semantic assertions derived from the
canonical extracted text.

It is not:

- an `AppAnalysisSchema` snapshot;
- an AI provider raw-response snapshot;
- a complete `ExtractionResult`;
- a persistent `CalendarEvent`;
- a subscription feed; or
- an ICS rendering.

Authority order:

```text
public source
→ canonical extracted text
→ human expected truth
→ actual AI / domain / app output
```

Foundation.25.1 output may be used as cross-check evidence. It does not create or
automatically approve expected truth.

## 3. Current Baseline

The corpus contains 10 verified real public-notice entries collected on
2026-07-19:

- scholarship: 3
- school_notice: 3
- assignment: 1
- competition: 1
- job_posting: 1
- ambiguous_date: 1

Each entry has:

- a public source URL;
- a privacy and copyright review;
- manually curated canonical extracted text; and
- a human-written legacy expected result awaiting v1 migration.

Raw attachments are intentionally not copied into this repository. Templates are
examples only and are never counted as real entries.

## 4. Folder Structure

```text
test-corpus/
  README.md
  index/
    notice_index.tsv
  extracted-text/
    school_notice/
    scholarship/
    assignment/
    competition/
    job_posting/
    ambiguous_date/
  expected-results/
    school_notice/
    scholarship/
    assignment/
    competition/
    job_posting/
    ambiguous_date/
  raw/
    selected-public-files/
  templates/
    notice_index.example.tsv
    expected-result.example.json
    extracted-text.example.txt
```

Use the notice-type folder names exactly as shown. `job_posting` includes public
job and internship notices.

## 5. `notice_index.tsv` Contract

The real corpus index is:

```text
test-corpus/index/notice_index.tsv
```

Required columns, in order:

```text
id
institution
notice_type
source_title
source_url
published_at
file_type
raw_file_path
extracted_text_path
expected_result_path
has_attachment
has_deadline
has_relative_date
has_vague_date
contains_personal_info
copyright_risk
notes
```

Allowed `notice_type` values:

```text
school_notice
scholarship
assignment
competition
job_posting
ambiguous_date
```

Cross-file invariants for each migrated v1 entry:

```text
expected.id          = index.id
expected.sourceTitle = index.source_title
expected.noticeType  = index.notice_type
```

The extracted-text and expected-result paths must remain repository-relative,
resolve inside the repository, exist, and use the same notice-type directory as
the index row. The expected filename must be `<id>.expected.json`.

## 6. Real Entry Requirements

Only add a real corpus entry when all of the following hold:

- the source is a public notice page or explicitly provided source material;
- no login is required;
- the content is not internal-only;
- student names, student IDs, and applicant lists are excluded;
- resident-registration-number-like values are excluded;
- phone numbers are excluded unless they are necessary public office contacts;
- copyright risk is reviewed; and
- the source facts can be represented faithfully in canonical extracted text.

For each real entry, add:

```text
test-corpus/extracted-text/<notice_type>/<id>.txt
test-corpus/expected-results/<notice_type>/<id>.expected.json
```

Then add exactly one matching row to `notice_index.tsv`.

## 7. Canonical Extracted-text Policy

The extracted-text file is the canonical evaluation source used by expected
truth and deterministic evidence validation.

It should:

- preserve actionable source content faithfully;
- retain dates, times, periods, requirements, cautions, and relevant labels;
- avoid summarizing away ambiguity;
- exclude unnecessary personal information; and
- remain stable unless a human review identifies a source-transcription error.

Expected evidence must match this file, not an untracked alternate source copy.

## 8. Target Expected-truth Shape

A migrated v1 file has this strict top-level shape:

```json
{
  "schemaVersion": "noticepilot.corpus.expected.v1",
  "id": "knu-school-003",
  "sourceTitle": "2026학년도 2학기 숙명여자대학교 교류 수학 안내",
  "noticeType": "school_notice",
  "expected": {
    "items": [],
    "calendarEventCandidates": []
  }
}
```

Allowed top-level keys:

```text
schemaVersion
id
sourceTitle
noticeType
expected
```

Allowed keys inside `expected`:

```text
items
calendarEventCandidates
```

Unknown keys are rejected after v1 activation.

## 9. Item Assertions

Target item shape:

```json
{
  "assertionId": "deadline-001",
  "kind": "deadline",
  "title": "학생 교류 수학 서류 제출 마감",
  "dateExpression": "2026. 8. 3.(월) 18:00",
  "normalizedDate": "2026-08-03",
  "evidence": "학생 제출 마감: 2026. 8. 3.(월) 18:00",
  "reviewRequired": true
}
```

Required fields:

```text
assertionId
kind
title
dateExpression
normalizedDate
evidence
reviewRequired
```

Allowed `kind` values:

```text
deadline
task
submission
requirement
caution
```

`assertionId` is stable within the expected file and must be unique. It is for
human review, migration, and diff tracking. Actual AI or runtime output does not
need to emit the same ID.

## 10. Calendar-event Candidate Assertions

Target candidate shape:

```json
{
  "assertionId": "candidate-deadline-001",
  "title": "교류 수학 학생 제출 마감",
  "eventType": "deadline",
  "dateExpression": "2026. 8. 3.(월) 18:00",
  "normalizedDate": "2026-08-03",
  "evidence": "학생 제출 마감: 2026. 8. 3.(월) 18:00",
  "reviewRequired": true
}
```

Required fields:

```text
assertionId
title
eventType
dateExpression
normalizedDate
evidence
reviewRequired
```

Allowed `eventType` values:

```text
deadline
start
end
announcement
meeting
other
```

The following legacy values are not valid v1 event types:

```text
application_period
academic_period
result_announcement
submission_deadline
service_interruption
event
```

Migration must review source meaning instead of applying a blind string rename.

## 11. Date, Time, Period, and Ambiguity Policy

### 11.1 `normalizedDate`

Allowed values:

```text
valid YYYY-MM-DD
null
```

Disallowed values:

- ISO timestamps;
- empty-string sentinels;
- partial dates;
- natural-language dates; and
- invalid calendar dates.

### 11.2 `dateExpression`

`dateExpression` is the original source expression or `null` when no date
expression exists. A non-null value must appear inside `evidence`.

### 11.3 Time

v1 does not introduce structured time fields. Preserve time in:

- `dateExpression`; and
- `evidence`.

When time is materially actionable but the current contract cannot represent it
structurally:

```text
normalizedDate = calendar date only
reviewRequired = true
```

Structured time requires a future versioned contract. Do not place timestamps in
`normalizedDate`.

### 11.4 Periods

A legacy period must be reviewed and decomposed into semantic candidates when
appropriate.

Example:

```text
application period: 2026-01-15 through 2026-01-21
→ start candidate: 2026-01-15
→ deadline or end candidate: 2026-01-21
```

Use `deadline` when the user must complete an action by the endpoint. Use `end`
for a non-deadline period endpoint. Use `announcement` for a result publication,
`meeting` for attendance, and `other` only when the approved taxonomy cannot
represent the source meaning more precisely.

### 11.5 Ambiguity

Do not invent a normalized date for wording such as:

```text
예정
추후 공지
별도 안내
작업 완료 시까지
```

Preserve the wording in `dateExpression` and `evidence`, use
`normalizedDate: null` when a date is not safely resolved, and set
`reviewRequired: true`.

## 12. Evidence and Title Policy

### 12.1 Evidence

Evidence must be:

- a non-empty string;
- an exact contiguous substring of canonical extracted text;
- copied without paraphrasing, correction, or invented wording; and
- sufficient to support the assertion.

When `dateExpression` is non-null, it must occur inside the evidence string.
Evidence offsets are computed by validation or adapters and are not stored in
expected truth.

### 12.2 Title

The title is a concise human reference label. It must be non-empty, trimmed, and
must not change source meaning.

Title text is a quality comparison field, not the sole assertion identity. A
semantically correct actual result may use different natural wording.

## 13. Ordering, Duplicates, and Evaluation Direction

Array position is not semantic identity or priority.

Rules:

- `assertionId` values are unique across both arrays in one file;
- exact duplicate assertions are prohibited;
- the same evidence may support different assertions when the meanings differ;
- array reordering alone is not a semantic change; and
- evaluators should use one-to-one matching.

Initial evaluation direction:

```text
item match
= kind + normalizedDate + exact evidence

candidate match
= eventType + normalizedDate + exact evidence
```

Title and date-expression quality are secondary comparison dimensions. This
matching runner is a target direction until executable evaluation is separately
implemented.

## 14. Fields Intentionally Excluded

Expected truth does not require exact values for:

```text
summary
description wording
confidence
warnings
generated runtime IDs
extractionId
createdAt / updatedAt
hashes
evidence offsets
edited
completed
selected
allDay
App startDate / endDate
CalendarEvent.eventId
ICS UID
sequence
cancellation
SubscriptionIcsFeed
```

These belong to model metadata, adapter enrichment, UI projection, persistence,
or delivery layers rather than human source truth.

`reviewReasons` is also not required in v1. The current raw AI boundary exposes
`reviewRequired`, while detailed reasons may be generated by downstream domain
adapters. Requiring exact reasons would couple expected truth to one adapter
implementation.

## 15. Legacy Migration Rules

The current app-oriented expected files migrate as follows:

| Legacy shape | v1 target |
| --- | --- |
| `deadlines[]` | `items[]` with `kind=deadline` |
| `tasks[]` | `items[]` with `kind=task` |
| `submissions[]` | `items[]` with `kind=submission` |
| `requirements[]` | `items[]` with `kind=requirement` |
| `cautions[]` | `items[]` with `kind=caution` |
| `calendarEvents[]` | `calendarEventCandidates[]` |
| timestamp in a date field | date part in `normalizedDate`; preserve time in expression/evidence |
| empty string used as missing value | `null` |
| `application_period` | human review; usually `start` plus `deadline` or `end` |
| `academic_period` | human review; usually `start` plus `deadline` or `end` |
| `result_announcement` | `announcement` |
| `submission_deadline` | `deadline` |
| `event` | `meeting` or `other` after source review |
| `service_interruption` | `start` or `other` after source review |

Migration is not a key-renaming exercise. Every file must be re-reviewed against
its canonical extracted text. Do not bulk-replace event types without checking
source meaning and ambiguity.

## 16. Validator Requirements and Activation Gate

Future executable v1 validation must check:

- exact schema version;
- exact top-level and nested keys;
- index ID, title, and notice-type agreement;
- path containment, existence, and notice-type directory agreement;
- assertion-ID uniqueness;
- allowed item kinds and event types;
- valid `YYYY-MM-DD` or `null`;
- absence of empty-string date sentinels;
- non-empty exact-match evidence;
- date-expression containment inside evidence;
- duplicate assertions;
- template exclusion from real-entry counts; and
- required category distribution where a gate declares one.

v1 becomes active only after all of the following are complete:

```text
1. templates/expected-result.example.json migrated
2. validator updated for v1
3. validator tests added
4. all 10 real expected JSON files migrated
5. full evidence exact-match validation passed
6. index cross-file validation passed
7. registered repository tests passed
```

Until then, the correct status is:

```text
approved target contract
→ migration pending
→ executable enforcement pending
→ not active
```

After the complete gate passes, update this section to `active and enforced` in a
separate reviewed change.

## 17. Authoring Workflow

For a new or migrated entry:

```text
1. verify the public source
2. complete privacy and copyright review
3. create or verify canonical extracted text
4. create or verify the index row
5. write human semantic assertions
6. verify exact evidence matches
7. review ambiguity and reviewRequired
8. run the validator
9. complete human review
```

Do not:

- copy AI output directly into expected truth;
- copy Foundation output without human review;
- write evidence absent from canonical extracted text;
- infer uncertain dates;
- add an index row without referenced files; or
- count templates as real corpus entries.

## 18. Raw Files, Privacy, and Copyright

Prefer:

```text
public URL + canonical extracted text + expected result JSON
```

Include a raw PDF, HWPX, HWP, or image only when it is public, safe, necessary,
reasonably sized, and appropriate for repository use.

Exclude raw files containing personal information, applicant lists, internal-only
content, or unclear copyright status.

## 19. Coverage and Expansion

The 10-entry collection gate is complete. Expansion should prioritize:

- new failure modes;
- new date and ambiguity patterns;
- attachment-related evidence boundaries; and
- institutional diversity.

Do not add duplicate easy examples merely to increase the count.

The approximate 30-example threshold applies to broader parser generalization,
multi-institution coverage claims, and new school-specific parsing strategies. It
does not block:

- deterministic validation of the current corpus;
- the existing Foundation.25.1 package;
- Route M evaluation;
- verified-fixture export QA; or
- S-Lite physical calendar-client validation.

## 20. Explicit Non-goals

This corpus contract does not itself implement:

- an AI provider runtime;
- attachment extraction or OCR;
- source crawling or scheduling;
- candidate promotion;
- persistent `CalendarEvent` identity;
- reconciliation;
- ICS serialization;
- multi-notice batch UI; or
- subscription management.

The existence or absence of those implementations elsewhere in the repository is
separate from this corpus contract.
