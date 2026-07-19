# S27-B prerequisite 3 — CalendarEventSourceLink

Status: completed

`CalendarEvent` keeps one canonical representative source for compatibility. Every contributing notice and candidate is stored separately as a `CalendarEventSourceLink`.

The link preserves:

- canonical source identity;
- observed and canonical URLs;
- source notice and candidate IDs;
- relation role to the event;
- pair evidence and rule IDs;
- first/last observation timestamps;
- active or historical source state.

Source links are append/update audit records. Duplicate reconciliation must never discard a source URL or candidate ID.
