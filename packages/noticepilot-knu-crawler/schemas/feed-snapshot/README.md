# S28-4 Subscription Feed Snapshot schemas

`SubscriptionFeedSnapshot` is an immutable, content-addressed membership snapshot produced from one validated `SubscriptionProfile` and one deterministic S28-3 `FeedBuildOutput`.

Identity rules:

- `snapshotHash` is SHA-256 of canonical semantic JSON.
- `snapshotId` is `feedsnap_` plus the first 32 hexadecimal characters of `snapshotHash`.
- `generatedAt` is audit metadata and is excluded from semantic identity.
- snapshot identity is never used as an ICS UID.

The snapshot contains included `CalendarEventId` membership and aggregate exclusion reasons. It contains no subscription URL, token, or serialized ICS. S29 owns persistence and delivery.
