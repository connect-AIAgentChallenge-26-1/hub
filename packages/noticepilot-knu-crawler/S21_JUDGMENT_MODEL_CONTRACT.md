# S21 — Layered Judgment Model Contract

## Purpose

S21 defines the domain types needed to separate the current Policy.15 engine
without changing its behavior.

```text
CanonicalNotice
→ Structure
→ Temporal parsing
→ Local binding
→ Semantic classification
→ Applicability
→ Publishability
→ Reconciliation
→ Subscription projection
→ ICS serialization
```

The contracts are implemented in:

```text
noticepilot_judgment_models.py
schemas/judgment/*.schema.json
```

The module is deliberately not imported by
`noticepilot_mvp_policy_pipeline.py` in this package.

## Contracts

### ScheduleSegment

Structure-only document unit. It preserves source location, parent ownership,
text, and non-authoritative action/audience signals. It must not decide whether
a date is publishable.

### TemporalMention

A raw date/time mention and its normalized representation. It records whether
the result is deterministic and whether the year was inferred.

### BoundTemporalFact

A local relation between one or more temporal mentions and their owning
segment. Supported binding classes include same segment, same table row,
continuation owner, list item, paragraph, title context, and unresolved.

### SemanticClassification

The semantic layer produces three independent axes:

```text
eventType
actionType
temporalRole
```

`temporalRole` values:

```text
user_action_period
event_occurrence
result_announcement
reference_date
internal_process
conditional_followup
unknown
```

### ApplicabilityJudgment

Actor and audience scope only. It must not alter the semantic action.

### PublishabilityJudgment

Consumes prior judgments and returns one of:

```text
auto_confirmed
needs_review
not_calendar_relevant
```

The invariant is strict: only `auto_confirmed` may set
`includeInCalendarFeed=true`.

### JudgmentTrace

Immutable ordered records of each layer's inputs, rule ID, confidence, output,
and reason codes. Layer order is validated.

## Policy.15 compatibility adapter

```python
legacy_candidate_to_judgment_trace(candidate)
```

The adapter preserves current candidate IDs, intervals, applicability fields,
status, feed scopes, and reason codes. It does **not** guess a new semantic role.

```json
{
  "temporalRole": "unknown",
  "semanticMigrationComplete": false
}
```

Actual temporal-role migration belongs to S23. This prevents S21 from silently
changing corpus behavior.

The adapter can be exercised over the complete publishable baseline without
wiring it into runtime:

```bash
python3 tools/export_legacy_judgment_traces.py \
  --input baseline/policy15/decisions/publishable-candidates.jsonl \
  --output /tmp/policy15-judgment-traces.jsonl
```

The packaged validation converts all 909 publishable candidates and checks trace
ID uniqueness.

## Versioning

```text
judgment contract:                 0.1.0
schedule segment contract:         noticepilot.scheduleSegmentContract.v0.1
temporal mention:                  noticepilot.temporalMention.v0.1
bound temporal fact:               noticepilot.boundTemporalFact.v0.1
semantic schedule candidate:       noticepilot.semanticScheduleCandidate.v0.1
applicability judgment:             noticepilot.applicabilityJudgment.v0.1
publishability judgment:            noticepilot.publishabilityJudgment.v0.1
judgment trace:                     noticepilot.judgmentTrace.v0.1
```

These versions are independent from the unchanged Policy.15 runtime pipeline
version `0.1.14`.

## Migration boundary

S21 completes contracts only. It does not yet provide:

- runtime `StructureAnalyzer`;
- independent `TemporalParser`;
- `LocalBinder` execution;
- temporal-role migration;
- standalone applicability or publishability engines;
- reconciliation wiring;
- persisted judgment trace outputs.

Those are S22–S25 tasks and must be checked against the S20 baseline after each
step.

## Runtime migration status

- S22: `ScheduleSegment` and `TemporalMention` wired.
- S23: `BoundTemporalFact`, `SemanticClassification`, and actual `temporalRole` wired.
- S24-B: standalone `ApplicabilityEvaluator` extracted with Policy.15 compatibility projection.
- S24-C: standalone `PublishabilityEvaluator` extracted with temporal-role, determinism, and chronology guards.
- S24-D planned: runtime `ApplicabilityJudgment` and `PublishabilityJudgment` object wiring.

The legacy trace adapter continues to emit `temporalRole=unknown` because it
wraps already-produced Policy.15 artifacts without replaying semantic analysis.
