# S26-B Decision Record and Checklist Resolution

## Decision

S26-B is complete. The selected strategy is:

```text
Preserve baseline/policy15 unchanged
+ create baseline/layered-s26-v1
+ use a strict layered comparator
+ do not create an allowlist
+ do not replace Policy.15
```

Baseline ID:

```text
layered-s26-corpus-2059-20260712-v1
```

The machine-readable approval record is:

```text
baseline/layered-s26-v1/decision-record.json
```

## Resolved questions

### Difference classification

All 304 Policy.15 differences are classified:

- 300 board 716 list-metadata trace enrichments;
- three trace-derived summary count changes;
- one pipeline-version change;
- zero candidate-integrity, review-queue, and ICS event changes.

### Contract significance

The layered trace and runtime judgment fields are now a stable downstream and
audit contract. They are not classified as a user-visible semantic change.

### Comparator policy

Future layered-engine regression checks use the strict layered comparator:

```bash
python3 tools/compare_layered_baseline.py \
  --baseline baseline/layered-s26-v1 \
  --current derived/mvp-policy-v0.1
```

Policy.15 comparison remains separate and historical. No migration allowlist is
created.

### Baseline preservation

`baseline/policy15` remains immutable rollback evidence. The layered baseline
is a separate successor and does not overwrite its predecessor.

### Baseline scope

The layered baseline freezes:

- all 2,059 canonical notice candidate documents;
- student-default 417개 및 job-application 300개 feed candidate 문서;
- all 1,304 unique full candidate objects;
- complete structure/temporal/binding/semantic traces;
- runtime applicability and publishability judgments;
- publishable candidates and review queue;
- S25 reconciliation evidence;
- S26 unified audit evidence;
- student and job-application ICS reports and events.

### Acceptance gates

The baseline was created only after:

- all S24-A through S25 component audits passed;
- 1,304 candidate IDs remained stable;
- complete traces and both runtime judgments were 1,304/1,304;
- trace, contract, reconstruction, and cross-artifact mismatches were zero;
- verdicts remained 909 auto-confirmed / 395 needs-review;
- review queue and both ICS feeds remained unchanged;
- reconciler second pass removed zero candidates.

### Rollback and retention

Retain both baseline directories, the S26 reports, decision record, manifests,
and raw Policy.15 observation diff. Deleting Policy.15 is not part of this
decision.
