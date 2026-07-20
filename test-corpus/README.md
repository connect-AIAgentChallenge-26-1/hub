# NoticePilot Test Corpus

> Historical name: Phase 4-B corpus scaffold
>
> Current classification:
> - Route M M1 corpus collection: complete
> - Route M M2 deterministic validation: complete
>
> Document role:
> - operational contract for corpus layout and authoring
> - canonical extracted-text policy
> - active expected-truth contract
> - strict validator and activation authority
>
> Planning authority: [`../docs/qa/test-corpus-plan.md`](../docs/qa/test-corpus-plan.md)

## 1. Contract Status

The active and enforced expected-truth contract is:

```text
noticepilot.corpus.expected.v1
```

Current repository state:

```text
v1 contract                           active and enforced
real expected files                   10 / 10 migrated
example expected template             migrated
executable validator                  active
legacy expected files                 0
activation gate                       complete
```

The repository validator runs in strict v1 mode. Legacy expected files, mixed legacy/v1 corpora, unsupported schema versions, and unknown keys fail closed.

## 2. Purpose and Truth Authority

The corpus evaluates NoticePilot extraction behavior using verified public notices. It supports prompt and schema evaluation, AI extraction QA, date and ambiguity QA, evidence review, future parser evaluation, and future batch calendar-export evaluation.

Expected truth is a set of human-verified semantic assertions derived from canonical extracted text. It is not an `AppAnalysisSchema` snapshot, AI provider raw response, complete `ExtractionResult`, persistent `CalendarEvent`, subscription feed, or ICS rendering.

Authority order:

```text
public source
→ canonical extracted text
→ human expected truth
→ actual AI / domain / app output
```

Foundation.25.1 output may be used as cross-check evidence. It does not create or automatically approve expected truth.

## 3. Current Baseline

The active corpus contains 10 verified real public-notice entries collected on 2026-07-19:

```text
scholarship:    3
school_notice:  3
assignment:     1
competition:    1
job_posting:    1
ambiguous_date: 1
```

Each entry has a public source URL, privacy and copyright review, manually curated canonical extracted text, and a human-written v1 expected result. Raw attachments are intentionally not copied into this repository. Templates are examples only and are never counted as real entries.

## 4. Folder Structure

```text
test-corpus/
  README.md
  index/notice_index.tsv
  extracted-text/<notice_type>/<id>.txt
  expected-results/<notice_type>/<id>.expected.json
  raw/selected-public-files/
  templates/
    notice_index.example.tsv
    expected-result.example.json
    extracted-text.example.txt
```

Allowed notice-type directories:

```text
school_notice
scholarship
assignment
competition
job_posting
ambiguous_date
```

## 5. Index Contract

`test-corpus/index/notice_index.tsv` is tab-separated and requires these columns in order:

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

Cross-file invariants:

```text
expected.id          = index.id
expected.sourceTitle = index.source_title
expected.noticeType  = index.notice_type
```

Referenced paths must be repository-relative, resolve inside the repository, exist, use the indexed notice-type directory, and follow these exact patterns:

```text
test-corpus/extracted-text/<notice_type>/<id>.txt
test-corpus/expected-results/<notice_type>/<id>.expected.json
```

## 6. Canonical Extracted-text Policy

Canonical extracted text is the deterministic evidence source. It must preserve actionable content, dates, times, periods, requirements, cautions, labels, and source ambiguity without unnecessary personal information.

Expected evidence must be an exact contiguous substring of this file. Canonical text remains stable unless human review identifies a source-transcription error.

## 7. Expected-truth Shape

Every real expected file and the expected-result template use this strict shape:

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

Only these top-level keys are allowed:

```text
schemaVersion
id
sourceTitle
noticeType
expected
```

Only `items` and `calendarEventCandidates` are allowed inside `expected`.

## 8. Item Assertions

Required item fields:

```text
assertionId
kind
title
dateExpression
normalizedDate
evidence
reviewRequired
```

Allowed item kinds:

```text
deadline
task
submission
requirement
caution
```

`assertionId` must be stable and unique across both arrays within one expected file.

## 9. Calendar-event Candidate Assertions

Required candidate fields:

```text
assertionId
title
eventType
dateExpression
normalizedDate
evidence
reviewRequired
```

Allowed event types:

```text
deadline
start
end
announcement
meeting
other
```

Legacy event types such as `application_period`, `academic_period`, `result_announcement`, `submission_deadline`, `service_interruption`, and `event` are invalid.

## 10. Date, Time, Period, and Ambiguity Policy

`normalizedDate` is either a valid `YYYY-MM-DD` value or `null`. Timestamps, empty-string sentinels, partial dates, natural-language dates, and impossible calendar dates are invalid.

`dateExpression` preserves the original source expression or is `null` when no date expression exists. A non-null expression must occur inside its evidence.

v1 has no structured time fields. Materially actionable time remains in `dateExpression` and `evidence`; `normalizedDate` stores only the calendar date and `reviewRequired` must be `true`.

Periods are decomposed into semantic candidates. Use `start` for the opening boundary, `deadline` when a user action is due by the endpoint, and `end` for a non-deadline endpoint.

Explicit tentative dates may retain their safely resolved calendar date but require review. Unresolved wording such as `추후 공지`, `별도 안내`, or `작업 완료 시까지` uses `normalizedDate: null` and `reviewRequired: true`.

## 11. Evidence, Titles, Ordering, and Duplicates

Evidence must be non-empty, exact, contiguous, and sufficient to support the assertion. Do not paraphrase, correct, or invent evidence.

Titles are concise human reference labels and must not change source meaning. Array position is not identity or priority. Exact duplicate semantic assertions are prohibited. The same evidence may support different assertions when their meanings differ.

Initial evaluation direction:

```text
item match      = kind + normalizedDate + exact evidence
candidate match = eventType + normalizedDate + exact evidence
```

## 12. Fields Intentionally Excluded

Expected truth does not require runtime or projection metadata such as confidence, warnings, generated IDs, timestamps, hashes, evidence offsets, UI selection state, App start/end dates, CalendarEvent IDs, ICS UID/sequence, cancellation, or subscription-feed state.

`reviewReasons` is not part of v1. Detailed reasons may be generated by downstream adapters without coupling human truth to one implementation.

## 13. Completed Legacy Migration Reference

The completed migration used these semantic mappings:

| Legacy shape | Active v1 representation |
| --- | --- |
| `deadlines[]` | `items[]` with `kind=deadline` |
| `tasks[]` | `items[]` with `kind=task` |
| `submissions[]` | `items[]` with `kind=submission` |
| `requirements[]` | `items[]` with `kind=requirement` |
| `cautions[]` | `items[]` with `kind=caution` |
| `calendarEvents[]` | `calendarEventCandidates[]` |
| timestamp date | date-only `normalizedDate`; time retained in expression/evidence |
| empty missing value | `null` |
| period event | reviewed `start` plus `deadline` or `end` |

This table is historical guidance only. Legacy files are not accepted by the active validator.

## 14. Validator and Activation Gate

The validator enforces:

- exact schema version and strict keys;
- index ID, title, type, path, and filename agreement;
- path containment and file existence;
- assertion-ID uniqueness and duplicate rejection;
- allowed item and event enums;
- valid date or `null`;
- time, tentative, and unresolved review invariants;
- exact evidence and date-expression containment;
- template validation while excluding templates from real counts; and
- the declared 10-entry category baseline.

Activation gate status:

```text
1. expected-result template migrated            complete
2. validator updated for v1                     complete
3. validator tests registered                   complete
4. all 10 real expected JSON files migrated     complete
5. exact evidence validation                    enforced
6. index cross-file validation                  enforced
7. repository tests                             required by CI
```

The active command is strict and has no legacy compatibility flag:

```bash
npm run validate:corpus
```

## 15. Authoring Workflow

For a new entry:

```text
1. verify the public source
2. complete privacy and copyright review
3. create canonical extracted text
4. add the exact index row
5. write human semantic assertions
6. verify exact evidence matches
7. review time and ambiguity
8. run npm run test:corpus
9. complete human review
```

Do not copy AI or Foundation output directly into expected truth, infer uncertain dates, write absent evidence, add an index row without its files, or count templates as real entries.

## 16. Privacy, Copyright, Coverage, and Non-goals

Prefer:

```text
public URL + canonical extracted text + expected result JSON
```

Include raw files only when public, safe, necessary, reasonably sized, and appropriate for repository use. Exclude personal information, applicant lists, internal-only content, login-required documents, and unclear-copyright raw files.

Future expansion should prioritize new failure modes, date and ambiguity patterns, attachment evidence boundaries, and institutional diversity. The approximate 30-example threshold applies to broader parser generalization and multi-institution claims, not deterministic validation of the current corpus.

This contract does not implement an AI provider runtime, attachment extraction, OCR, crawling, scheduling, candidate promotion, CalendarEvent persistence, reconciliation, ICS serialization, batch UI, or subscription management.
