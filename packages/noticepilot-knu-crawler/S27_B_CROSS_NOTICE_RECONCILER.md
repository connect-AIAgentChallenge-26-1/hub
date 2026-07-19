# S27-B Deterministic CrossNoticeReconciler

## Status

S27-B relation classification is complete. Persistent relation storage, opaque CalendarEvent ID issuance, runtime mutation, and ICS migration remain unexecuted.

## Sequential prerequisites completed

1. D8 changed from observed URL identity to canonical source identity.
2. `ReconciliationCandidateView` consumer projection defined and audited for all 909 candidates.
3. `CalendarEventSourceLink` draft/persisted contracts defined.
4. Atomic promotion/relation persistence boundary defined with rollback and outbox separation.
5. `CrossNoticeReconciler` implemented and executed over the corpus.

## Corpus result

```text
publishable candidates      909
diagnostic pairs            343
distinct                    100
duplicate                     8
extension                     1
needs_review                234
automatic merge plans         9
```

The eight duplicate relations now select their specialized-board candidates under the explicit partial precedence `715 > 504` and `721 > 504`. No precedence is inferred between specialized boards or for any unconfigured pair.

The ninth automatic merge plan is the explicit extension pair:

```text
knu-716-3184
→ knu-716-3235 (연장)
```

It keeps the same start date and extends the end date from 2026-02-13 to 2026-02-19.

## No-change boundary

- CalendarEvent ID assignments: 0
- runtime mutations: 0
- ICS mutations: 0
- layered baseline: `match / 0`
