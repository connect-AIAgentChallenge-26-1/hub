# RiskStats Client Update Exception Policy

## Scope
- This document defines when a client‑side update to `riskStats` is **allowed** despite the default rule that only Cloud Functions may write to this field.

## Allowed Scenarios
1. **Stale‑Data Refresh**
   - If the client detects that its cached `riskStats.updatedAt` timestamp is older than **30 minutes**, it may issue a **PATCH** request to update **only** the `updatedAt` field to trigger a re‑fetch.
   - No other fields (`score`, `noShowCount`, `incidentCounts.*`) may be modified.
2. **Manual Admin Override (internal tool only)**
   - A privileged admin UI (protected by a custom claim `admin: true`) may request a full `riskStats` overwrite.
   - This route is separate (`/admin/riskStats`) and guarded by a dedicated security rule.

## Validation Rules (Server‑Side)
- `updatedAt` must be a valid ISO‑8601 timestamp and **must be newer** than the current stored value.
- If any other field is present in the update payload, the rule **rejects** the write.
- All updates are logged to `audit/riskStatsUpdates` with `request.auth.uid`, timestamp, and diff.

## Client Implementation Notes
- Use the helper `updateRiskStatsTimestamp()` in `src/utils/risk.ts` which builds the minimal payload `{ updatedAt: new Date().toISOString() }` and sends it via the existing Firestore SDK.
- The UI should display a toast if the write is rejected, prompting the user to retry later.

## Rationale
- Prevents accidental or malicious manipulation of the scoring algorithm while still allowing the client to keep its cache in sync during periods of low connectivity.
- Keeps the **single‑source‑of‑truth** principle: the authoritative `score` value is always calculated by Cloud Functions.
