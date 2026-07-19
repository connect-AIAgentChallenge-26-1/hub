# Policy 0.1.10 — Structured Schedule Segment Architecture

Package: `noticepilot-knu-crawler-v0.4.4-observation.3-policy.12`  
Pipeline: `0.1.11`  
Segment schema: `noticepilot.scheduleSegments.v0.1`  
Candidate schema: `noticepilot.calendarCandidates.v0.7`

## Decision

Policy.12 stops treating overlapping regex windows as the semantic unit of extraction.
Regex remains the tokenizer for dates, times, labels, and applicability terms. The
policy engine now evaluates those tokens inside a structure-aware intermediate unit:
`ScheduleSegment`.

```text
normalized notice
→ title / paragraph / list item / label-value / table-row segmentation
→ local date, action, and audience signals
→ deterministic date resolution
→ candidate creation and document-level reconciliation
→ review queue or feed candidate
```

The change addresses the failure mode where a word in the title or an adjacent line
relabels an unrelated body date. Examples include `휴학생` becoming a leave request,
`2026학년도` becoming `6학년`, and a readmission title turning tuition dates into
readmission applications.

## Segment contract

Each segment contains:

```json
{
  "schemaVersion": "noticepilot.scheduleSegments.v0.1",
  "segmentId": "seg-...",
  "segmentType": "label_value",
  "labelText": "복학 신청기간",
  "bodyText": "2026. 7. 20. ~ 8. 28.",
  "sourceLocation": {
    "lineIndex": 4,
    "clauseIndex": 0,
    "parentSegmentId": null
  },
  "actionSignals": ["return_from_leave_application"],
  "audienceSignals": [],
  "dateSpans": [
    {"value": "2026-07-20", "start": 8, "end": 19},
    {"value": "2026-08-28", "start": 22, "end": 27}
  ],
  "locallyGrounded": true
}
```

Supported segment types:

- `title`
- `paragraph`
- `list_item`
- `label_value`
- `table_row`
- `continuation`

## Structural rules

### No overlapping sliding windows

Policy.11 and earlier generated each line plus two-line and three-line overlapping
windows. This increased recall but allowed action terms from neighboring lines to own
a date they did not describe. Policy.12 removes those windows.

### Explicit clause splitting

A single line may contain more than one labelled schedule:

```text
지원 마감: 2026. 3. 29. 합격자 발표: 2026. 4. 1.
```

It becomes two `label_value` segments. Dotted dates such as `2026. 7. 17.` are never
split as numbered list markers.

### One-line continuation

A continuation is allowed only when:

1. the first unit contains an explicit action label but no date;
2. the immediately following source line contains a date;
3. the following line does not contain a competing action label;
4. neither line exceeds the conservative length limit.

```text
휴학 신청기간:
2026. 8. 1. ~ 8. 20.
```

becomes one locally grounded continuation segment. `문의처: 학사지원과` followed by
an unlabelled date does not.

### Local ownership

The segment label is the primary event classifier. Full segment text is a local
fallback. The notice title may confirm a deliberately short label such as `취소기간`
when the title explicitly states `수강신청 취소`, but it cannot relabel unrelated
body dates.

### Fail closed

When a body date has no local action label but the title suggests an actionable notice,
the policy emits no feed candidate and adds:

```text
action_label_not_locally_grounded
```

This is the deterministic handoff point for human review or a future semantic model.

## Candidate audit field

Candidates created from structured extraction contain `sourceSegment`. This allows a
reviewer, reconciliation service, or later AI adjudicator to inspect the exact local
unit that produced the candidate without reconstructing sliding windows.

## Derived outputs

A full pipeline run now creates:

```text
derived/mvp-policy-v0.1/segments/<noticeId>.segments.json
```

The policy summary adds:

```json
{
  "structuredSegmentCandidateCount": 0,
  "locallyGroundedCandidateCount": 0,
  "sourceSegmentTypeCounts": {}
}
```

## Semantic model boundary

Policy.12 does not call an LLM. A future adjudicator should receive only the structured
segment, deterministic date resolution, candidate labels, and uncertainty reasons.
It should not be asked to re-parse an entire notice from scratch.

Recommended handoff:

```json
{
  "sourceSegment": {},
  "dateResolution": {},
  "candidateEventTypes": ["application_period", "academic_period"],
  "candidateActionTypes": ["course_registration"],
  "reviewReason": "action_label_not_locally_grounded"
}
```

The adjudicator may select a label, reject the candidate, or retain review status. It
must not promote a non-deterministic date.

## Compatibility

- Observation source data is unchanged.
- Board 716 still uses the exact list application period.
- CalendarEvent reconciliation remains downstream.
- Subscription profile filtering remains downstream.
- ICS serialization is unchanged.
- Existing policy.11 academic applicability and semantic guards are retained.

## Validation

Policy.12 includes 110 deterministic tests. New coverage verifies:

- dotted dates are not split as list markers;
- multiple labelled schedules on one line are separated;
- valid one-line continuations are joined;
- unrelated adjacent lines are not joined;
- table rows preserve label/date locality;
- candidates expose `sourceSegment` metadata;
- unlabelled dates fail into review;
- per-notice segment documents are generated;
- policy summaries report structured-segment counts.
