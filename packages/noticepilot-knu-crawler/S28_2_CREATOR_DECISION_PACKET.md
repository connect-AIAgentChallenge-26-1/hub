# S28-2 creator decision packet — resolved

This packet is retained as the historical decision input. All decisions were
resolved in `S28_2_CREATOR_DECISION_RECORD.md` and
`configs/noticepilot_feed_eligibility_policy.v0.2.json`.

---

# S28-2 creator decision packet

## Decision format

```text
E1:
E2:
E3-student-unknown:
E3-student-review:
E4-job-unknown:
E4-job-review:
E5:
```

## E1 — Source-link matching

### A. `canonical_source_only`

Only the S27 canonical representative source participates in the profile's board
and notice-type filter.

Effect:

- a 504-only profile excludes eight events whose canonical representative is
  board 715 or 721;
- general-board-only diagnostic count: `260`.

### B. `any_active_source_link`

Any active source link may satisfy the board and notice-type filter. The event is
still emitted once because identity is `CalendarEventId`.

Effect:

- the same eight cross-post events remain discoverable through board 504;
- general-board-only diagnostic count: `268`.

## E2 — Review-state aggregation

### A. `canonical_candidate_only`

The canonical candidate's `PublishabilityJudgment` controls the event review state.

### B. `any_source_requires_review`

If any linked source candidate is review-required, the event is review-required.
Unknown source judgment also fails closed.

Current active corpus impact is zero because all 909 linked candidate judgments are
`auto_confirmed`. This decision affects future review-approved or revised sources.

## E3 — Default student profile

Choose both booleans:

```text
includeUnknownCampusEvents = true | false
includeReviewRequiredEvents = true | false
```

Current active corpus impact:

- student unknown-campus events: `0`;
- active review-required events: `0`;
- upstream review queue candidates not promoted into S27 registry: `395`.

The choice is still required for forward compatibility and S28-3 default-profile
materialization.

## E4 — Default job profile

Choose both booleans:

```text
includeUnknownCampusEvents = true | false
includeReviewRequiredEvents = true | false
```

Current active corpus impact:

- one job event has unknown campus;
- active review-required events: `0`.

Unknown-campus choice:

```text
false → 298 job events in the all-campus diagnostic profile
true  → 299 job events
```

Affected event:

```text
강원대학교 글로벌미래융합대학 기간제 직원 채용 공고 채용 접수기간
```

## E5 — Audience-unscoped default

This applies when the user enables academic personalization, but an event has no
reviewed degree/year/status/admission scope.

### A. `include`

Unscoped events remain visible; explicit incompatible scoped events are excluded.

Year-3 diagnostic profile: `600` events.

### B. `exclude`

Only personalization-ready events that match the selected profile remain.

Year-3 diagnostic profile: `11` events.

Current corpus:

```text
personalization-ready                 12
audience-unscoped                    888
```
