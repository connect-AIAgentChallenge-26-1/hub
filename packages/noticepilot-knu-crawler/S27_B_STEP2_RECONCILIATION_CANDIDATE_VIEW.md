# S27-B prerequisite 2 — ReconciliationCandidateView

Status: completed

`ReconciliationCandidateView` is a consumer-owned immutable projection. It joins:

```text
publishable CalendarEventCandidate
+ immutable notice metadata
+ canonical SourceBoard registry
→ ReconciliationCandidateView
```

It does not add fields to the producer candidate and does not issue a persistent event ID.

The view materializes:

- canonical source identity;
- observed and canonical source URLs separately;
- publication order;
- normalized/base title and title markers;
- event/action/temporal projection;
- campus and audience scope;
- publishability state needed for reconciliation auditing.
