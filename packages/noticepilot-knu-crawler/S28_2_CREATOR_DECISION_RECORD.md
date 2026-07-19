# S28-2 creator decision record

## Status

S28-2 decisions are complete.

```text
Policy schema: noticepilot.feedEligibilityPolicy.v0.2
Policy version: 0.2.0
Status: approved
Unresolved decisions: 0
```

## Approved decisions

### E1 — Source-link matching

```text
canonical_source_only
```

Only the canonical representative source participates in board and notice-type
filtering. Duplicate source links remain provenance and do not make an event
eligible for a profile that excludes its canonical source.

### E2 — Review-state aggregation

```text
canonical_candidate_only
```

The canonical candidate's publishability judgment controls the active event's
review state. Non-canonical source judgments remain preserved for audit.

### E3 — Default student policy

Inherited from the authoritative Subscription Foundation contract:

```text
includeUnknownCampusEvents = true
includeReviewRequiredEvents = true
reviewRequiredInclusionRule = include_if_valid_normalized_date
```

An event without a valid normalized date is excluded even when review-required
inclusion is enabled.

### E4 — Default job policy

The authoritative contract defines the user-facing unknown-campus and event/date
defaults without a job-feed exception. The same policy applies:

```text
includeUnknownCampusEvents = true
includeReviewRequiredEvents = true
reviewRequiredInclusionRule = include_if_valid_normalized_date
```

### E5 — Audience-unscoped default

```text
include
```

When academic personalization is enabled, events without reviewed audience scope
remain visible. Explicitly scoped incompatible events are still excluded.

## Boundary

S28-2 approves policy only. It does not materialize default SubscriptionProfile
objects, iterate events into feeds, create feed snapshots, issue URLs/tokens, or
rewrite ICS. Those responsibilities begin in S28-3 and later stages.
