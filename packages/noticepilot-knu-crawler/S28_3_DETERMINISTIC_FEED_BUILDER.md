# S28-3 Deterministic FeedBuilder

## Status

S28-3 is complete.

- Builder: `noticepilot_feed_builder.py`
- Builder version: `0.1.0`
- Result schema: `noticepilot.feedBuildResult.v0.1`
- Default profile collection: `noticepilot.defaultSubscriptionProfiles.v0.1`
- Eligibility policy: `noticepilot.feedEligibilityPolicy.v0.2`
- Feed snapshot: not implemented
- Snapshot ID/hash: not issued
- Subscription URL/token: not issued
- ICS serialization: not performed
- S27 registry/projection mutation: none

## Boundary

```text
SubscriptionProfile
+ FeedEligibilityInputView[]
+ approved FeedEligibilityPolicy
→ FeedEligibilityDecision[]
→ FeedBuildResult
→ [S28-4 immutable feed snapshot]
```

`FeedBuildResult` is a deterministic partition of an explicit input event set. It is not a persisted feed snapshot and therefore carries no snapshot identity, snapshot hash, delivery token, public URL, or ICS payload.

## Approved-default profile factory

S28-3 materializes only policy defaults approved in S28-2:

- canonical-source-only source matching;
- canonical-candidate-only review aggregation;
- unknown-campus inclusion;
- review-required inclusion only with a valid normalized date;
- audience-unscoped inclusion.

Campus selection is not defaulted. Callers must supply one or more physical campuses. The checked-in student/job reference profiles explicitly select all four campuses only to reproduce full-corpus S27-D feed membership and do not establish an all-campus user default.

Reference profile IDs are opaque registry-issued IDs and are not derived from profile content.

## Deterministic build contract

For each validated profile:

1. validate all S28-2 input views;
2. reject duplicate CalendarEvent IDs;
3. evaluate exactly one eligibility decision per input event;
4. partition every input event into exactly one of included/excluded;
5. order included events by `normalizedStart`, then `calendarEventId`;
6. order excluded events by primary reason precedence, then `calendarEventId`;
7. order the decision ledger by `calendarEventId`;
8. preserve all primary-reason counts.

The same semantic inputs produce the same result and decision ledger regardless of input iteration order.

## Full-corpus reference results

```text
active input events                  900
student included                     601
student excluded                     299
job included                         299
job excluded                         601
student/job overlap                    0
student/job union                    900
```

The included event-ID sets exactly match the two S27-D persistent ICS feeds.

## Result fields

```text
schemaVersion
builderVersion
profileId
profileRevision
policySchemaVersion
policyVersion
sourceContext.registryId
sourceContext.projectionId
sortContract
inputEventCount
includedEventCount
excludedEventCount
includedEventIds
excludedEventIds
primaryReasonCounts
```

Forbidden in S28-3 output:

```text
snapshotId
snapshotHash
contentDigest
subscriptionUrl
feedToken / feedTokenHash
ics / icsPath
```

## Audit

```bash
python3 tools/audit_s28_feed_builder.py \
  --root . \
  --output-dir derived/mvp-policy-v0.1/reports/s28-feed-builder
```

The audit verifies deterministic reverse-input equivalence, exact 900-event partitioning, S27-D membership parity, S27 manifest immutability, and absence of deferred snapshot/delivery fields.
