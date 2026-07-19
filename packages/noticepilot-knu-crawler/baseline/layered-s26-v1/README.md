# S26 layered baseline v1

This is an immutable layered baseline created from the verified 2,059-notice
S26 corpus run. It exists **beside** `baseline/policy15`; Policy.15 was not
replaced and no allowlist was created.

Baseline ID: `layered-s26-corpus-2059-20260712-v1`

It freezes:

- all 1,304 unique candidate objects with complete layered traces;
- all 2,059 canonical notice candidate documents;
- canonical student-default and job-application feed candidate documents;
- runtime applicability and publishability judgments;
- S25 reconciliation state;
- publishable and review outputs;
- student and job-application ICS semantics;
- the S26 unified audit evidence.

Verify this baseline:

```bash
python3 tools/compare_layered_baseline.py \
  --baseline baseline/layered-s26-v1 \
  --current derived/mvp-policy-v0.1
```

Do not regenerate this directory during normal tests. The build command refuses
to overwrite a non-empty destination unless `--force` is explicitly supplied.
