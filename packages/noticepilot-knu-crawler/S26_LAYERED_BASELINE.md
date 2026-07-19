# S26-B Separate Layered Baseline

## Architecture decision

S26 uses two immutable references with different purposes:

```text
baseline/policy15
  Historical observable-behavior and rollback reference

baseline/layered-s26-v1
  Current strict layered-engine regression reference
```

Policy.15 was not modified or replaced. A broad allowlist was deliberately not
introduced because it could conceal future trace or judgment regressions.

## Build guard

The build tool refuses to overwrite a non-empty baseline directory and refuses
to target `baseline/policy15`.

```bash
python3 tools/build_layered_baseline.py \
  --derived derived/mvp-policy-v0.1 \
  --baseline baseline/layered-s26-v1
```

`--force` exists only for intentionally rebuilding an uncommitted fixture. It
must not be used during ordinary testing.

## Strict comparison

```bash
python3 tools/compare_layered_baseline.py \
  --baseline baseline/layered-s26-v1 \
  --current derived/mvp-policy-v0.1
```

or:

```bash
bash run_layered_baseline_check.sh
```

A normal verified run returns:

```json
{
  "result": "match",
  "changeCount": 0
}
```

The comparator checks complete candidate objects, canonical all/student/job notice-to-candidate mappings,
runtime judgments, reconciliation reports, decisions, and ICS semantics. It
has no allowlist mode.

## Lifecycle

A future corpus or semantic-policy change must create a new versioned layered
baseline after review. Do not mutate `layered-s26-v1` in place after it is
committed as an immutable fixture.
