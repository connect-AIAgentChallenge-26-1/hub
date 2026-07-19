# Policy.15 immutable behavioral baseline

This directory contains the S20 baseline generated from the verified 2,059
notice Policy.15 run. Do not regenerate it during normal tests.

Verify the embedded file hashes:

```bash
python3 -m unittest tests.test_baseline_and_judgment_contracts.Policy15BaselineTests.test_manifest_hashes_match_embedded_artifacts -v
```

Compare a current run:

```bash
python3 tools/compare_policy_baseline.py \
  --baseline baseline/policy15 \
  --current derived/mvp-policy-v0.1
```
