# Judgment contract schemas

These schemas describe the S21 layered judgment domain. They are contracts for
future modules and are **not** wired into the Policy.15 runtime pipeline.

| Schema | Responsibility |
|---|---|
| `schedule-segment` | Structure-only document unit |
| `temporal-mention` | Date/time mention and normalization |
| `bound-temporal-fact` | Local relationship between segment and temporal mention |
| `semantic-schedule-candidate` | Semantic classification plus applicability |
| `applicability-judgment` | Actor and audience scope |
| `publishability-judgment` | Auto-confirm, review, or reject decision |
| `judgment-trace` | Immutable ordered evidence and decision trace |

`temporalRole` remains `unknown` in the Policy.15 compatibility adapter. Actual
role migration is deferred to S23.
