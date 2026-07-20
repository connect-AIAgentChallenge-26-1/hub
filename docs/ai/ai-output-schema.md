# NoticePilot AI Output Schema

> Contract status: current implemented runtime schema
>
> Runtime authority: `server/src/schemas/aiRawSchema.js`, normalization adapters,
> app schema validation, and their registered tests
>
> Scope: AI raw extraction output before server-side normalization and projection

## Purpose

This document defines the AI raw schema currently accepted by NoticePilot.
The AI raw schema is intentionally separated from the manual-analysis app
schema.

The implemented flow is:

```text
AI raw schema
→ server parse and validate
→ ExtractionResult/domain adapter when explicitly selected
  or legacy compatibility normalization
→ NoticePilot app schema
→ frontend rendering, review, and export
```

The AI must not directly return the current frontend app schema. This separation
keeps extraction output independent from UI-only state such as `edited`,
`selected`, and `completed`.

## Authority and Change Rule

The current strict runtime schema is defined in:

```text
server/src/schemas/aiRawSchema.js
```

This document must match that implementation. A field described only as a future
direction is not accepted by the current parser.

Because the top-level schema and nested item schemas are strict, adding fields
such as `document`, `sourceItemIndex`, or `sourceItemId` requires an explicit
schema revision, adapter review, tests, and prompt-contract update. Providers
must not emit those fields under the current contract.

## Current App Schema Target

The server ultimately normalizes or projects AI extraction into the current
manual-analysis app shape:

```json
{
  "title": "string",
  "summary": "string",
  "detectedNoticeType": "string",
  "userSelectedNoticeType": "string",
  "noticePublicationDate": "string",
  "uploadedFileName": "string",
  "deadlines": [],
  "tasks": [],
  "submissions": [],
  "requirements": [],
  "cautions": [],
  "calendarEvents": [],
  "metadata": {
    "userPreferencesSnapshot": {
      "activeInstitution": "kangwon",
      "selectedCampuses": [],
      "includeCommonNotices": true
    }
  },
  "warnings": []
}
```

`metadata.userPreferencesSnapshot` is optional app metadata. It is not an AI
extraction target and must not be included in AI raw output.

Document metadata such as the user-entered title, selected notice type,
publication date, uploaded filename, canonical notice identity, and adapter
context is supplied separately by the server. It is not part of the current AI
raw JSON shape.

## Current Implemented AI Raw Schema

The current parser accepts exactly these top-level keys:

```json
{
  "summary": "string",
  "items": [
    {
      "kind": "deadline | task | submission | requirement | caution",
      "title": "string",
      "description": "string",
      "dateExpression": "string",
      "normalizedDate": "YYYY-MM-DD or empty string",
      "evidence": "string",
      "confidence": "high | medium | low",
      "reviewRequired": true
    }
  ],
  "calendarEventCandidates": [
    {
      "title": "string",
      "eventType": "deadline | start | end | announcement | meeting | other",
      "dateExpression": "string",
      "normalizedDate": "YYYY-MM-DD or empty string",
      "evidence": "string",
      "confidence": "high | medium | low",
      "reviewRequired": true
    }
  ],
  "warnings": [
    "string warning or strict warning object"
  ]
}
```

A warning object has this shape:

```json
{
  "type": "optional string",
  "message": "string"
}
```

The following are not valid current AI raw fields:

```text
document
sourceItemIndex
sourceItemId
userPreferencesSnapshot
edited
selected
completed
```

## Top-Level Field Policy

### `summary`

`summary` is required and must be a string. It should concisely describe the
notice, but the primary purpose of the response remains actionable extraction.

### `items`

`items` is required and must be an array. Each item must match one of the five
allowed extraction kinds.

### `calendarEventCandidates`

`calendarEventCandidates` is required and must be an array. Candidates represent
event-level calendar possibilities before app projection or persistent event
promotion.

A raw candidate is not a durable `CalendarEvent`. It does not issue a persistent
event ID, UID, revision, sequence, or cancellation state.

### `warnings`

`warnings` is required and must be an array. Each entry may be either:

- a string; or
- a strict object containing required `message` and optional `type`.

During normalization, string warnings are converted to app warning objects.
An object without `type` receives a generated fallback type.

## Item Kind Policy

Allowed values:

```text
deadline
task
submission
requirement
caution
```

Legacy app projection mapping:

```text
items[kind=deadline]    → deadlines[]
items[kind=task]        → tasks[]
items[kind=submission]  → submissions[]
items[kind=requirement] → requirements[]
items[kind=caution]     → cautions[]
```

The domain-adapter path instead normalizes the raw items into the strict domain
extraction boundary before projecting them back to the manual-analysis app
shape.

## Calendar Event Candidate Policy

Allowed `eventType` values:

```text
deadline
start
end
announcement
meeting
other
```

The current raw candidate does not carry a source-item link. If event-to-item
traceability becomes necessary, introduce a stable identifier through a
versioned schema change rather than adding an unvalidated array index.

The legacy compatibility normalizer generates app-level fields such as:

```text
id
startDate
endDate
allDay
selected
edited
dateConfidence
dateSource
referenceDate
originalDateExpression
```

These fields are generated by the server and must not be requested from the AI
under the current raw contract.

## Evidence Policy

`evidence` is a required string field for every item and calendar event
candidate. The runtime shape requirement alone does not guarantee useful
evidence; providers must copy a short, exact excerpt from the confirmed notice
text.

Do not fabricate evidence. When adequate evidence is unavailable:

- keep `evidence` as an empty string only if the provider cannot support the
  extraction with source text;
- set `reviewRequired: true`;
- lower confidence as appropriate; and
- add a warning when useful.

Evidence quality remains especially important for:

- deadlines;
- calendar event candidates;
- requirements;
- submissions; and
- cautions describing penalties or exclusion risks.

## Confidence Policy

Allowed values:

```text
high
medium
low
```

Interpretation:

```text
high   → direct evidence and unambiguous meaning
medium → source evidence exists but interpretation needs review
low    → ambiguous, incomplete, indirect, or context-dependent
```

Low-confidence items should normally set `reviewRequired: true`.

## `reviewRequired` Policy

Set `reviewRequired: true` when any of the following applies:

- the date is ambiguous or vague;
- evidence is empty, weak, or indirect;
- the item category is uncertain;
- a deadline is inferred rather than stated;
- a relative date depends on a reference date;
- the source uses wording such as `추후 공지`, `예정`, or `별도 안내`;
- the candidate cannot safely be auto-selected for calendar export.

## Date Field Policy

### `dateExpression`

Preserve the original source expression as a string. Use an empty string when the
item has no date expression.

### `normalizedDate`

The current schema accepts only:

```text
an actual calendar date in YYYY-MM-DD
or
an empty string
```

Values such as `2026-02-30`, partial dates, natural-language dates, timestamps,
and `null` do not satisfy the current AI raw schema.

Initial policy:

- prefer absolute dates;
- normalize a relative date only when a reliable reference date exists;
- preserve ambiguous expressions in `dateExpression`;
- use an empty `normalizedDate` and set `reviewRequired: true` when the date is
  not safely recoverable.

Time-specific extraction is not represented in the current AI raw schema. Do not
place ISO timestamps in `normalizedDate`.

## User Preferences Snapshot Policy

Campus preferences remain inert product metadata:

```text
userPreferencesSnapshot
→ request/result metadata only
→ no effect on AI extraction
→ no notice filtering
→ no Markdown export changes
→ no one-off ICS export changes
```

The AI raw schema must not include `userPreferencesSnapshot`. Preference-aware
analysis or subscription filtering requires a separate product contract and QA
boundary.

## Warning Normalization Policy

AI warnings normalize into app-level objects:

```json
{
  "type": "string",
  "message": "string"
}
```

Server-generated warning types may include:

```text
missing_evidence
ambiguous_date
invalid_normalized_date
schema_mismatch
section_limit_applied
duplicate_calendar_event_removed
low_confidence_item
```

The presence of a documented warning type does not mean every type is currently
emitted by every adapter path.

## Example Valid AI Raw Response

```json
{
  "summary": "2026학년도 2학기 장학금 신청 기간과 제출 서류를 안내하는 공지입니다.",
  "items": [
    {
      "kind": "deadline",
      "title": "장학금 신청 마감",
      "description": "장학금 신청은 2026년 7월 20일까지입니다.",
      "dateExpression": "2026.07.20.",
      "normalizedDate": "2026-07-20",
      "evidence": "신청 기간: 2026.07.10. ~ 2026.07.20.",
      "confidence": "high",
      "reviewRequired": false
    },
    {
      "kind": "submission",
      "title": "성적증명서 제출",
      "description": "성적증명서를 제출해야 합니다.",
      "dateExpression": "",
      "normalizedDate": "",
      "evidence": "제출서류: 성적증명서, 자기소개서",
      "confidence": "high",
      "reviewRequired": false
    }
  ],
  "calendarEventCandidates": [
    {
      "title": "장학금 신청 마감",
      "eventType": "deadline",
      "dateExpression": "2026.07.20.",
      "normalizedDate": "2026-07-20",
      "evidence": "신청 기간: 2026.07.10. ~ 2026.07.20.",
      "confidence": "high",
      "reviewRequired": false
    }
  ],
  "warnings": []
}
```

## Example Invalid Current Response

```json
{
  "document": {
    "title": "장학금 안내",
    "detectedNoticeType": "scholarship",
    "language": "ko"
  },
  "summary": "장학금 공지입니다.",
  "items": [],
  "calendarEventCandidates": [
    {
      "title": "신청 마감",
      "eventType": "deadline",
      "dateExpression": "곧 마감",
      "normalizedDate": "",
      "sourceItemIndex": 0,
      "evidence": "",
      "confidence": "low",
      "reviewRequired": true
    }
  ],
  "warnings": []
}
```

This response is invalid under the current strict parser because it contains the
unsupported `document` and `sourceItemIndex` fields.

## Future Schema Revision Direction

Future versions may add document metadata, stable raw item identity,
event-to-item relationships, richer date/time structures, or an extraction
graph:

```text
sourceDocument
→ extractedFacts/items
→ eventCandidates
→ domain extraction result
→ app projection / batch export / subscription event runtime
```

These are not current accepted fields. Introduce them only through an explicit
schema version or coordinated breaking change covering:

- Zod schemas;
- normalization and domain adapters;
- prompt contract;
- corpus expected truth;
- provider fixtures;
- HTTP and regression tests; and
- migration or compatibility behavior where necessary.
