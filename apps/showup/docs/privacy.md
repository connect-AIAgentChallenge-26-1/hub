# Privacy Policy (ShowUp)

## 1. Purpose of Data Collection
- Collect personal information (name, phone number, reservation history) to provide risk‑warning and customer‑history services for store owners.

## 2. Types of Data Collected
- **Contact**: phone number (full), `phoneLast4` (search key).
- **Reservation**: date, time, status.
- **Incident**: predefined categories (abuse, dispute, late, unreasonable) and factual memo.

## 3. Storage & Retention
- Data is stored in Firestore under each store’s own namespace. Only the store owner (authenticated UID) can read/write.
- When a customer requests deletion (Phase 2), all related documents are permanently removed.

## 4. Access Control
- **Owner‑only**: `ownerUid` must match `request.auth.uid` for any read/write.
- **No cross‑store sharing**: Data never leaves the store’s collection.

## 5. Phone Number Masking
- The full phone number is stored but never sent to the client UI or logs. UI displays only `phoneLast4` in the format `010‑****‑1234`.

## 6. User Rights
- **Access**: Store owners can view all data they own.
- **Correction**: Owners can edit phone number, incident memo, etc., through the app.
- **Deletion**: Owners may delete a customer; all sub‑collections are cascaded.

## 7. Security Measures
- Firestore Security Rules enforce owner‑UID checks (see `firestore.rules`).
- All write operations are validated with Zod schemas on the client and replicated on the server side.

## 8. Contact
- For any privacy‑related questions, contact the ShowUp admin at `privacy@showup.example.com`.
