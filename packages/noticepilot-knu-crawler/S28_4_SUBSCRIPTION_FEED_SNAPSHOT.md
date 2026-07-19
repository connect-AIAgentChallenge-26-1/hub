# S28-4 — Subscription Feed Snapshot Contract

Status: completed  
Decision date: 2026-07-13  
Snapshot schema: `noticepilot.subscriptionFeedSnapshot.v0.1`  
Snapshot builder: `0.1.0`

## 1. Purpose

S28-4 turns one validated `SubscriptionProfile` and one deterministic S28-3 `FeedBuildOutput` into an immutable feed-membership snapshot.

```text
SubscriptionProfile
+ FeedBuildResult
+ FeedEligibilityDecision ledger
→ SubscriptionFeedSnapshot
→ snapshot set manifest
```

The snapshot records membership and integrity. It is not a delivery endpoint and does not contain an ICS payload.

## 2. Identity contract

Snapshot identity is content-addressed because a snapshot is immutable. This differs from `CalendarEventId`, whose identity must survive content revisions.

```text
snapshotHash = SHA-256(canonical semantic JSON)
snapshotId   = feedsnap_ + first 32 hex characters of snapshotHash
```

Hash contract:

```text
sha256_canonical_json_utf8_sorted_keys_compact_v0
```

The semantic hash covers:

- profile ID, profile revision, and full profile fingerprint;
- FeedBuilder and eligibility-policy versions;
- S27-C registry ID and S27-D projection ID;
- ordered included `CalendarEventId` membership;
- input/included/excluded counts and reason aggregation;
- FeedBuildResult hash and decision-ledger hash.

`generatedAt` is audit metadata and is excluded from semantic identity. A future persistence layer must retain the first materialization timestamp when an identical `snapshotHash` is observed again.

## 3. Snapshot fields

```text
schemaVersion
snapshotBuilderVersion
snapshotId
snapshotHash
snapshotIdStrategy
hashContract
generatedAt
profile
builder
sourceContext
feed
integrity
```

The `feed` object contains only included event membership plus aggregate exclusion information:

```text
inputEventCount
eventCount
excludedEventCount
eventIds
primaryReasonCounts
sortContract
```

Excluded event IDs remain in the S28-3 build result and decision ledger. They are not duplicated into the delivery-oriented snapshot membership document.

## 4. Integrity fields

Each snapshot independently stores:

```text
eventMembershipSha256
feedBuildResultSha256
decisionLedgerSha256
profileFingerprintSha256
```

Any change to membership, profile revision/content, policy/build context, or the decision ledger changes the snapshot hash.

## 5. Atomic snapshot set

Reference snapshots are written atomically under:

```text
snapshots/s28-v1
```

The writer:

1. validates both snapshots in memory;
2. writes them to a temporary sibling directory;
3. validates artifact and upstream hashes;
4. writes `manifest.json`;
5. performs a single directory rename;
6. refuses to overwrite an existing snapshot directory.

A failure leaves no partial snapshot set.

## 6. Reference snapshot result

```text
student_default   601 events
job_application   299 events
overlap              0 events
union              900 events
```

Snapshot identities:

```text
student_default
feedsnap_d44c2066a621c9bd81762a9099dd7106

a job_application
feedsnap_0503ff13f28784d645e5722ac2e771a8
```

Snapshot set:

```text
snapset_874ba65cc0b7e371837e5ab3b9887ee6
```

## 7. Explicitly deferred

S28-4 does not:

- issue a subscription URL or token;
- persist snapshots in PostgreSQL;
- define cache or refresh behavior;
- serialize a new ICS file;
- mutate S27-C registry or S27-D projection;
- perform profile-matrix corpus QA.

S28-5 has completed the profile matrix and full-corpus feed audit. S29 owns database persistence and delivery.

## 8. Validation

```bash
python3 tools/audit_s28_feed_snapshot.py \
  --root . \
  --snapshot-dir snapshots/s28-v1 \
  --output-dir derived/mvp-policy-v0.1/reports/s28-feed-snapshot
```

The audit verifies reverse-input determinism, timestamp-independent semantic identity, manifest and upstream hashes, exact 601/299 membership, and unchanged S27 manifests.
