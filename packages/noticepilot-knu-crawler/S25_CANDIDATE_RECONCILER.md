# S25 Intra-notice CandidateReconciler

## Status

Completed in `0.4.4-observation.3-policy.15-foundation.8`.

## Purpose

S25 extracts candidate-to-candidate comparison from the monolithic policy
pipeline into `noticepilot_candidate_reconciler.py`.

The reconciler operates only within one notice. It does not reconcile revisions
or duplicates across notices; that remains S27.

## Owned decisions

The module owns the ordered sequence below:

1. exact timestamp duplicate consolidation;
2. generic academic candidate suppression when a locally equivalent typed
   academic action exists;
3. unscoped candidate suppression when the same action has an explicit cohort;
4. same-day all-day suppression when a timed form is available;
5. redundant same-action range-boundary suppression;
6. review demotion for true same-action date conflicts.

Distinct actions and distinct explicit cohorts are preserved.

## Runtime contract

```text
Candidate[]
→ CandidateReconciler.reconcile()
→ Candidate[] + ReconciliationReport
```

`ReconciliationReport` is an in-memory audit summary. It is not added to the
candidate or decision JSON contract in S25.

The pipeline retains its previous public helper functions as compatibility
wrappers, but the active extraction path uses one canonical `reconcile()` call.

Any reason-code mutation or review demotion is followed by S24-D runtime
judgment synchronization, keeping `publishabilityJudgment` consistent with the
legacy candidate projection.

## Full-corpus audit

```bash
python3 tools/audit_s25_candidate_reconciler.py \
  --baseline baseline/policy15 \
  --current derived/mvp-policy-v0.1
```

Expected results:

- notices: `2,059`;
- candidates: `1,304` unique;
- second-pass removed candidates: `0`;
- candidate ID/order mismatch: `0`;
- stable projection mismatch: `0`;
- complete object mismatch: `0`;
- pre-existing same-action conflict detections: `9` notices, with no further
  mutation because they are already review-only;
- publishable/review and student/job ICS semantic diff: `0`.

## Non-goals

- cross-notice duplicate, revision, extension, or replacement detection;
- stable CalendarEvent identity;
- subscription profile filtering;
- changing Policy.15 candidate counts or publication decisions.
