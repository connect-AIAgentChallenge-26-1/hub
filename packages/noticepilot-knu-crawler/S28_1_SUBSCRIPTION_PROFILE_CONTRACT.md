# S28-1 SubscriptionProfile contract

## Status

S28-1 is complete as an isolated strict contract.

- Schema: `noticepilot.subscriptionProfile.v0.1`
- Validator: `noticepilot_subscription_profile.py`
- JSON Schema: `schemas/subscription-profile/subscription-profile.schema.json`
- Contract examples: `configs/subscription_profile_contract_examples.v0.1.json`
- Product defaults: not approved in this step
- Feed selection: not executed in this step
- S27 registry/ICS mutation: none

## Boundary

```text
User subscription preferences
→ SubscriptionProfile
→ [S28-2 eligibility policy]
→ [S28-3 FeedBuilder]
→ [S28-4 feed snapshot]
```

`SubscriptionProfile` is user selection state. It is not:

- a `CalendarEvent` identity record;
- a feed snapshot or event-ID list;
- a subscription URL/token;
- an ICS serialization result;
- a crawler or extraction policy.

## Root contract

```json
{
  "schemaVersion": "noticepilot.subscriptionProfile.v0.1",
  "profileId": "subprof_<32 lowercase hex>",
  "profileRevision": 1,
  "institutionId": "kangwon",
  "displayName": "...",
  "calendarName": "...",
  "timezone": "Asia/Seoul",
  "status": "active | paused | revoked",
  "campusSelection": {},
  "sourceSelection": {},
  "eventSelection": {},
  "audienceFilter": {},
  "createdAt": "ISO datetime with offset",
  "updatedAt": "ISO datetime with offset"
}
```

The profile ID is opaque and registry-issued. It is not the public feed token and must not be derived from profile content.

## Campus selection

```json
{
  "selectedCampuses": ["chuncheon"],
  "includeAllCampusEvents": true,
  "includeUnknownCampusEvents": true,
  "matchingMode": "intersects"
}
```

- `selectedCampuses` contains one or more physical campus IDs.
- `all` and `unknown` are not physical selected-campus IDs.
- all-campus and unknown-campus handling are explicit booleans.
- no implicit product default is supplied by the schema.

## Source selection

```json
{
  "selectedBoardIds": ["720", "721"],
  "selectedNoticeTypes": ["school_notice", "scholarship"],
  "canonicalBoardsOnly": true,
  "matchingMode": "all_dimensions"
}
```

Only canonical board IDs are allowed. Alias board IDs such as `718` and `750` cannot be stored in a profile. `selectedNoticeTypes` must exactly match the categories represented by `selectedBoardIds`, preventing unreachable or contradictory source filters.

## Event selection

```json
{
  "includedFeedScopes": ["student_default"],
  "includedEventTypes": ["application_period", "submission_period"],
  "includedTargetActors": ["student"],
  "includeReviewRequiredEvents": false,
  "matchingMode": "all_dimensions"
}
```

The profile explicitly selects feed scope, event type, actor, and review-required policy. Selection dimensions are conjunctive; values inside a dimension are alternatives.

The current S27 active event projection does not carry a standalone `reviewRequired` field. S28-2 must define the authoritative join/projection before this selector can be evaluated. S28-1 defines the user contract only.

## Audience filter

```json
{
  "enabled": true,
  "degreeLevels": ["undergraduate"],
  "studentYears": [3],
  "enrollmentStatuses": ["enrolled"],
  "admissionTypes": [],
  "matchMode": "all_dimensions",
  "unscopedEventPolicy": "include | exclude"
}
```

- empty profile dimensions mean unrestricted for that dimension;
- when enabled, at least one audience dimension must be selected;
- audience filtering is limited to student profiles in v0.1;
- when disabled, all audience arrays are empty and `unscopedEventPolicy=include`;
- `unscopedEventPolicy` is explicit because 888 of the current 900 events are not personalization-ready, while 12 carry reviewed audience constraints.

The exact matching algorithm and product defaults belong to S28-2.

## Strict invariants

- unknown keys are rejected at every contract level;
- profile timestamps require timezone offsets;
- `updatedAt >= createdAt`;
- board IDs must exist as canonical boards in `knu_board_registry.v0.2.json`;
- source board/category selectors must be consistent;
- feed scope and target actor must be consistent;
- delivery URL/token fields and event-ID arrays are forbidden;
- no schema field receives a silent default.

## Deferred decisions

S28-2 must define and, where necessary, request creator approval for:

1. authoritative default student and job profiles;
2. include/exclude default for unknown-campus events;
3. include/exclude default for review-required events;
4. product default for audience-unscoped events;
5. authoritative review-state input and source-link join order;
6. deterministic inclusion/exclusion reason vocabulary.

## Audit

```bash
python3 tools/audit_s28_subscription_profile_contract.py \
  --root . \
  --output-dir derived/mvp-policy-v0.1/reports/s28-subscription-profile
```
