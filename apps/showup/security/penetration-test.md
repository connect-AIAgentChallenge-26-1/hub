# Security Test Scenarios (ShowUp)

## 1. Unauthenticated Access
- Attempt to read any `/stores/{storeId}` collection without authentication.
- Expected: **Permission denied**.

## 2. Cross‑Store Read
- Authenticated as user A (owner of Store A). Try to read `/stores/StoreB/...`.
- Expected: **Permission denied**.

## 3. Owner UID Spoofing
- Attempt to write a new store document with a forged `ownerUid` that does not match `request.auth.uid`.
- Expected: **Permission denied**.

## 4. Invalid Incident Type
- Submit an incident with `type` = `spam` (not in the whitelist).
- Expected: **Permission denied** by rule validation.

## 5. Phone Number Exposure
- Query a customer document and try to retrieve the full `phone` field from the client UI.
- Expected: The UI should only receive `phoneLast4`; any attempt to read `phone` directly should be blocked by rule or client‑side masking.

## 6. Deletion Cascade
- Delete a customer document and verify that all sub‑collections (`reservations`, `incidents`) are also removed.
- Expected: All related documents are deleted; no orphan data remains.

## 7. RiskStats Write Restriction
- From the client, attempt to update `riskStats` directly.
- Expected: **Permission denied** – only Cloud Function service account may write.

## 8. Compliance Check – "Blacklist" Term
- Search the codebase for the string `blacklist`.
- Expected: No occurrences; ensure the term is replaced with "risk indicator" or similar.
