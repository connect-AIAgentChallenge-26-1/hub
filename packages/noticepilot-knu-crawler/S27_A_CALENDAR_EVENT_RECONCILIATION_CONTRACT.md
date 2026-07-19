# S27-A CalendarEvent reconciliation contract and corpus diagnosis

## Status

S27-A contract policy is approved. This stage is still diagnostic-only: it does not assign relations, issue `CalendarEventId`, mutate runtime candidates, or change ICS.

Approved policy file:

```text
configs/noticepilot_cross_notice_reconciliation_policy.v0.3.json
```

## Relation vocabulary

- `distinct`: separate real-world schedules.
- `duplicate`: multiple notices describe the same unchanged CalendarEvent projection.
- `revision`: a later notice changes non-extension event facts. Initial S27 automatic revision is disabled.
- `extension`: the same event keeps its identity while the end boundary moves later under the approved marker and identity conditions.
- `replacement`: a later notice explicitly supersedes the prior event; body-level original-notice evidence is required.
- `needs_review`: evidence or configured precedence is insufficient.

## Stable identity

`registry_assigned_opaque_v0` is selected. Dates and titles do not independently generate the stable ID. The registry issues an opaque ID only after an approved relation is persisted.

## Merge invariants

- Same title alone never merges.
- Same date alone never merges.
- A marker alone never authorizes a relation.
- Different date windows with the same title default to `distinct`.
- Campus-disjoint notices are always `distinct`.
- Cross-board `duplicate` requires every approved identity condition.
- Every candidate pair in a merged cluster must have direct evidence; transitive connectivity is insufficient.
- One active ICS projection is allowed per approved identity, with every source URL and candidate ID retained.

## Canonical precedence

Publication order may identify the later notice. For ties or missing dates, use canonical source identity, canonical source URL authority, source-board canonical/alias relationships, and then explicitly configured representative-board precedence. The approved partial precedence is `715 > 504` and `721 > 504`; every unconfigured pair fails closed to `needs_review`.

## S27-A no-change command

```bash
python3 tools/audit_s27a_cross_notice_diagnostics.py \
  --current derived/mvp-policy-v0.1
```
