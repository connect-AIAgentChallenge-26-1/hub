# S28 FeedBuilder schemas

`FeedBuildResult` is the deterministic S28-3 include/exclude partition and complete reason aggregation.

S28-4 consumes that result and its decision ledger to create `SubscriptionFeedSnapshot` under `schemas/feed-snapshot/`. The original build result remains snapshot-neutral: it has no snapshot ID/hash, delivery URL/token, or ICS payload.

S29 owns database persistence and delivery.
