# S28-2 Feed eligibility policy and decision reasons

## Status

S28-2 is complete.

- Policy schema: `noticepilot.feedEligibilityPolicy.v0.2`
- Policy version: `0.2.0`
- Input view schema: `noticepilot.feedEligibilityInputView.v0.2`
- Decision schema: `noticepilot.feedEligibilityDecision.v0.2`
- Evaluator: `noticepilot_feed_eligibility.py`
- Policy status: `approved`
- Unresolved decisions: `0`
- FeedBuilder: implemented in S28-3
- Feed snapshot: implemented in completed S28-4
- S27 registry/ICS mutation: none

## Boundary

```text
S27-D active CalendarEvent projection
+ S27-C CalendarEventSourceLink[]
+ S24 PublishabilityJudgment
+ SubscriptionProfile
→ FeedEligibilityInputView
→ one-event FeedEligibilityDecision
→ S28-3 FeedBuilder
```

S28-2 evaluates one event against one explicit profile. It does not enumerate or
sort a corpus, assign a feed snapshot ID, issue a URL/token, or serialize ICS.

## Approved policy

```text
sourceLinkMatchMode         = canonical_source_only
reviewStateAggregationMode = canonical_candidate_only
student unknown campus      = include
student review-required     = include if valid normalized date
job unknown campus          = include
job review-required         = include if valid normalized date
audience-unscoped default   = include
```

The unknown-campus and review-required defaults inherit the authoritative
Subscription Foundation contract. Core profile schemas still insert no defaults;
S28-3 factories must materialize these values explicitly.

## Temporal guard

`FeedEligibilityInputView.v0.2` carries:

```text
temporalState.normalizedStart
temporalState.normalizedEnd
temporalState.hasValidNormalizedDate
temporalState.source = s27d_active_projection
```

`invalid_normalized_date` is a deterministic exclusion reason. Enabling
review-required inclusion never permits an undated event into a feed.

Current active corpus:

```text
active CalendarEvent                900
valid normalized date               900
invalid normalized date               0
joined source links                 909
```

## Authoritative join

The input view joins:

1. event identity, active revision, event type, actor, temporal fields, campus,
   audience, and feed scope from S27-D;
2. canonical/duplicate/extension provenance from S27-C source links;
3. immutable S24 publishability judgments joined by source candidate ID.

## Fixed matching semantics

- profile dimensions are conjunctive;
- values inside one dimension are alternatives;
- campus-specific events require physical-campus intersection;
- common/all-campus and unknown-campus handling use explicit profile booleans;
- board ID and notice type must match the same canonical source link;
- feed scope, event type, and target actor must all match;
- canonical candidate judgment controls review state;
- unscoped audience events remain included by default;
- all exclusion reasons are retained and primary reason follows fixed precedence.

## Decision reasons

```text
profile_not_active
institution_mismatch
unsupported_event_status
invalid_normalized_date
review_state_unknown
campus_unknown_excluded
campus_all_excluded
campus_no_intersection
source_board_or_notice_type_mismatch
feed_scope_mismatch
event_type_mismatch
target_actor_mismatch
review_required_excluded
audience_unscoped_excluded
audience_degree_level_mismatch
audience_student_year_mismatch
audience_enrollment_status_mismatch
audience_admission_type_mismatch
eligible_all_dimensions_matched
```

## Corpus diagnostics

```text
active events                         900
single-source events                  891
multi-source events                     9
unknown-campus events                   1
personalization-ready events           12
audience-unscoped events              888
active review-required events           0
upstream review queue candidates      395
```

Counterfactual checks remain recorded:

- general-board-only: canonical source `260`, any source link `268`;
- all-campus job feed: unknown included `299`, excluded `298`;
- year-3 personalization: unscoped included `600`, excluded `11`.

## Deferred

- default SubscriptionProfile factory and reference object materialization: completed in S28-3;
- deterministic corpus FeedBuilder: completed in S28-3;
- feed snapshot identity/hash: S28-4;
- profile matrix full-corpus audit: completed in S28-5;
- subscription URL/token and incremental delivery: S29.
