# S30 Creator Decision Packet

Status: `not_required_before_physical_test`

S30-A is deterministic and requires no product decision. A creator decision is required only if S30-B demonstrates that Samsung Calendar cannot subscribe to the NoticePilot URL directly or through a URL-polling calendar account.

## Decision trigger

Trigger this packet when any of the following is observed:

- only a one-time `.ics` import is available;
- the same URL is not polled after installation;
- event update or cancellation creates duplicates;
- a mandatory third-party account is required;
- the client cannot preserve the NoticePilot stable UID lifecycle.

## Options

### D30-1. Add a CalDAV or polling-account bridge

Advantages: native calendar UX and recurring synchronization.

Costs: new protocol, account lifecycle, credentials, hosting, and operational surface.

### D30-2. Build an Android companion app

Advantages: direct control over fetching, token storage, scheduling, and Android Calendar Provider writes.

Costs: Android application scope, permissions, Play/distribution, device-specific QA, and duplicate-management logic.

### D30-3. Use an existing intermediary calendar service

Advantages: lower implementation cost.

Costs: conflicts with the current preference not to depend on Google Calendar; privacy and account coupling must be approved explicitly.

### D30-4. Remove native Samsung subscription from the MVP

Advantages: preserves scope and avoids an unverified compatibility claim.

Costs: weakens the subscription product for Samsung users; static `.ics` export remains only a one-time import.

## Current decision

```text
selected option: none
reason: physical Samsung Calendar evidence is not yet available
```
