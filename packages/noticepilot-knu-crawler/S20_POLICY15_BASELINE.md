# S20 — Policy.15 Baseline Fixture

## Purpose

S20 freezes the verified Policy.15 corpus output before the judgment engine is
split into layers. The baseline is behavioral, not merely a summary-count
snapshot.

It is used to answer three questions during S22–S26:

1. Did any candidate disappear or appear?
2. Did a candidate's semantic fields, audience, interval, decision, or stable ID change?
3. Did the student/job ICS feeds change after ignoring only generated timestamps and local paths?

## Embedded baseline

```text
baseline/policy15/
├── baseline-manifest.json
├── baseline-allowlist.example.json
├── regression-cases.jsonl
├── reports/
│   ├── policy-summary.json
│   └── candidate-integrity.json
├── decisions/
│   ├── publishable-candidates.jsonl
│   └── review-queue.jsonl
└── ics/
    ├── student_default/
    │   ├── ics_export_report.json
    │   └── noticepilot-student-default.ics
    └── job_application/
        ├── ics_export_report.json
        └── noticepilot-job-applications.ics
```

Baseline facts:

```text
processed notices:       2,059
all candidates:          1,304
publishable candidates:    909
review decisions:           796
review queue candidate entries: 498
  - needs_review:            395
  - embedded auto_confirmed: 103
student ICS events:         609
job ICS events:             300
critical regression cases:  11
```

The original eight artifacts are preserved byte-for-byte. The manifest stores
SHA-256 hashes and semantic hashes.

## Semantic comparison policy

The comparator ignores only values that are expected to vary without changing
behavior:

- generated timestamps;
- absolute local filesystem paths;
- ICS `DTSTAMP`.

The following remain strict by default:

- candidate ID and UID;
- source notice ID;
- event/action type;
- normalized interval;
- all-day and inclusive-end semantics;
- actor, feed scopes, and audience rules;
- source segment identity/type/label;
- disposition and reason codes;
- ICS event properties other than `DTSTAMP`.

## Compare a new run

```bash
python3 tools/compare_policy_baseline.py \
  --baseline baseline/policy15 \
  --current derived/mvp-policy-v0.1 \
  --output derived/policy15-baseline-diff.json
```

Exit status:

```text
0 = semantic match
1 = unapproved difference
```

## Intentional differences

Do not edit the baseline to make a refactor pass. Copy the example allowlist and
record each intentional change explicitly.

```bash
cp baseline/policy15/baseline-allowlist.example.json \
   baseline/policy15/local-allowlist.json

python3 tools/compare_policy_baseline.py \
  --baseline baseline/policy15 \
  --current derived/mvp-policy-v0.1 \
  --allowlist baseline/policy15/local-allowlist.json
```

Supported allowlist dimensions:

- candidate ID;
- source notice ID;
- summary field path;
- ICS UID.

An allowlist is a review record, not a permanent suppression mechanism.

## Regression cases

`regression-cases.jsonl` includes the highest-risk academic and review
boundaries, including:

- flattened leave/return table;
- student-year course-registration table;
- orientation versus course-registration ownership;
- course cancellation with nearby refund text;
- course evaluation and activity periods;
- readmission application/result separation;
- admitted-participant follow-up review;
- reference date, internal process, partial activity, and ungrounded date review.

## Scope boundary

S20 does not alter pipeline output. It adds fixtures, comparison tools, hashes,
and tests only.
