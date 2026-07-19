# SubscriptionProfile schema

`noticepilot.subscriptionProfile.v0.1` is the S28-1 user selection contract.

It is intentionally separate from:

- `CalendarEvent` and persistent event identity;
- `SubscriptionIcsFeed` delivery state;
- feed URL/token issuance;
- serialized ICS snapshots.

All selectable dimensions are explicit. The schema supplies no implicit defaults for unknown-campus, review-required, or unscoped-audience handling.

Matching semantics reserved for S28-2:

- dimensions are combined with logical AND;
- values inside one dimension are combined with logical OR;
- campus matching uses physical-campus intersection;
- board IDs must be canonical board IDs;
- audience dimensions with empty profile values are unrestricted;
- `unscopedEventPolicy` governs events whose audience projection is not personalization-ready.
