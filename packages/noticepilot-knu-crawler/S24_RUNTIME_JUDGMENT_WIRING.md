# S24-D Runtime Judgment Wiring and Layer Audit

## Status

Completed in package `0.4.4-observation.3-policy.15-foundation.7`.

S24-D serializes the immutable evaluator outputs on every runtime calendar
candidate while retaining all Policy.15 compatibility fields:

```text
applicabilityJudgment
publishabilityJudgment
```

The compatibility projection remains authoritative for current consumers:

```text
targetActor / audienceRules
status / includeInCalendarFeed / feedScopes / reasonCodes
```

The runtime judgment objects are required to be exact, reconstructable
projections of those fields.

## Runtime wiring

`noticepilot_runtime_judgment_wiring.py` owns final serialization and
synchronization. The pipeline invokes it:

1. when a candidate is created;
2. after review demotion;
3. after same-notice consolidation and post-result filtering;
4. immediately before a notice decision is returned.

This final synchronization prevents stale judgment objects when compatibility
reason codes are appended after initial extraction.

## Derived corpus migration

```bash
python3 tools/apply_s24_runtime_judgment_wiring.py \
  --derived-dir derived/mvp-policy-v0.1
```

The migration covers:

- `decisions/notices.jsonl`;
- `decisions/review-queue.jsonl`;
- `decisions/not-calendar-relevant.jsonl`;
- `decisions/publishable-candidates.jsonl`;
- all candidate documents under `candidates/*/`.

It is deterministic and idempotent. A second run changes zero candidate
occurrences.

## Full-corpus audit

```bash
python3 tools/audit_s24_runtime_judgment_wiring.py \
  --baseline baseline/policy15 \
  --current derived/mvp-policy-v0.1
```

Verified result:

```text
candidateCount:                              1,304
uniqueCandidateIdCount:                      1,304
runtime ApplicabilityJudgment:              1,304 / 1,304
runtime PublishabilityJudgment:             1,304 / 1,304
contract errors:                                 0
reconstruction mismatches:                      0
cross-artifact judgment mismatches:              0
candidate-document occurrences wired:       2,213 / 2,213
review candidate occurrences checked:          498
publishable:                                    909
needs_review:                                   395
student/job ICS differences:                      0
```

Applicability distribution remains:

```text
unrestricted:       990
unknown:            282
profile_scoped:      12
conditional:         20
```

## Compatibility constraints

S24-D does not change:

- candidate IDs;
- normalized dates;
- event/action/temporal-role classification;
- applicability compatibility projection;
- publishability verdicts;
- feed membership;
- review queue membership;
- student or job-application ICS events.

Policy.15 remains the immutable semantic baseline. S25 may now extract the
intra-notice `CandidateReconciler` against fully wired layered candidates.
