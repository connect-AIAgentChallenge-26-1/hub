# S27-B prerequisite 5 — CrossNoticeReconciler

Status: implemented

The reconciler consumes two `ReconciliationCandidateView` objects and emits a deterministic relation decision. It never mutates producer candidates, assigns a CalendarEvent ID, or changes ICS.

Decision order is fail-closed:

1. campus-disjoint → `distinct`;
2. strict approved extension conditions → `extension`;
3. additional recruitment/closed → `distinct`;
4. replacement/cancellation without body reference → `needs_review`;
5. initial revision markers → `needs_review`;
6. repost/reannouncement with exact projection → `duplicate`;
7. same base title with different interval → `distinct`;
8. same canonical source identity and exact projection → `duplicate`;
9. cross-board D2 all-conditions match → `duplicate`;
10. otherwise → `needs_review`.

A duplicate relation may be approved while persistence remains blocked if D8 cannot choose a canonical representative. Merge plans require a complete direct-evidence graph and one consistent canonical candidate.
