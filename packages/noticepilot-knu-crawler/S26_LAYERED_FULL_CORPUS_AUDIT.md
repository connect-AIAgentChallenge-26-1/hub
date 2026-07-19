# S26-A Layered Full-Corpus Audit

## Scope

S26-A combines the completed S24-A, S24-B, S24-C, S24-D, and S25 corpus audits
into one executable validation boundary:

```text
2,059 notice decisions
→ 1,304 unique candidates
→ complete structure/temporal/binding/semantic traces
→ runtime applicability and publishability judgments
→ idempotent intra-notice reconciliation
→ unchanged publishable/review/ICS semantics
```

The unified command is:

```bash
python3 tools/audit_s26_layered_full_corpus.py \
  --baseline baseline/policy15 \
  --current derived/mvp-policy-v0.1
```

Default output:

```text
derived/mvp-policy-v0.1/reports/s26-layered-full-corpus-audit.json
derived/mvp-policy-v0.1/reports/s26-policy15-observation-diff.json
derived/mvp-policy-v0.1/reports/s26-components/*.json
```

## Portable report references

The unified report uses the directory containing
`s26-layered-full-corpus-audit.json` as its reference base. The following fields
are written as POSIX relative paths:

- `baselineDir`;
- `currentDir`;
- every `componentAudits.*.report`;
- `baselineObservation.rawDiffReport`.

The report declares this contract explicitly:

```json
{
  "pathReferences": {
    "base": "audit_report_directory",
    "format": "posix_relative"
  }
}
```

With the default output layout, component reports are referenced as
`s26-components/<report>.json` and the raw diff as
`s26-policy15-observation-diff.json`.

## Validation boundary

The unified report requires:

- all five component audits to pass;
- consistent `1,304` candidate and unique-ID counts across every layer;
- `1,304 / 1,304` complete temporal traces;
- `1,304 / 1,304` runtime applicability judgments;
- `1,304 / 1,304` runtime publishability judgments;
- zero trace, contract, reconstruction, and cross-artifact judgment errors;
- reconciliation second-pass identity with zero removals;
- preserved `909 auto_confirmed / 395 needs_review` verdicts;
- unchanged publishable semantics, review queue, and both ICS feeds.

## Policy.15 comparison and S26-B decision

The tool still records the raw Policy.15 comparator result. The 304 differences
were reviewed and accepted as layered enrichment for the purpose of creating a
separate successor baseline.

The report now records:

```json
{
  "allowlistDecisionPerformed": false,
  "baselinePromotionDecisionPerformed": true,
  "baselineReplacementPerformed": false,
  "separateLayeredBaselineCreated": true,
  "layeredBaselineId": "layered-s26-corpus-2059-20260712-v1"
}
```

Policy.15 remains immutable. No allowlist was created. Strict future layered
comparisons use `baseline/layered-s26-v1`; historical behavior comparisons may
still use `baseline/policy15`. See `S26_LAYERED_BASELINE.md`.
