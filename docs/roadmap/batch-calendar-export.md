# NoticePilot Batch Calendar Export Roadmap

## Purpose

This document describes the long-term roadmap for batch calendar export. It is a roadmap document, not current implemented behavior.

Current implemented baseline relevant to this roadmap:

- single-notice selected all-day `.ics` export exists
- `공지 캘린더` / calendar workspace tab exists
- campus preferences are stored separately in `noticepilot:campus-preferences:v1`
- `metadata.userPreferencesSnapshot` is attached as inert metadata
- subscription ICS is only represented by a 준비 중 status card

The current campus preference feature does not implement notice filtering, crawling, batch export filtering, or subscription feed behavior.

## Long-term Product Scenario

Target scenario:

```text
school notice collection
→ parsed source notices
→ normalized calendar event candidates
→ user checkbox selection
→ selected `.ics` export
```

NoticePilot should eventually help users review many school notices and select only the calendar events that matter to them.

## Initial Selection Unit: Calendar Event Candidate

The first batch export selection unit should be the individual `calendarEvent` candidate.

Reason:

- one notice can contain multiple dates
- not every date is relevant to every user
- some notices contain informational dates that should not be exported
- event-level review matches the current `.ics` export model

Example:

```text
[ ] 장학금 신청 시작일
[x] 장학금 신청 마감일
[ ] 서류 보완 기간
[x] 최종 발표일
```

## Later Notice-level Select-all

Notice-level selection can be added later as a convenience feature.

Expected behavior:

```text
notice checkbox checked
→ all valid event candidates under that notice are selected

notice checkbox unchecked
→ all event candidates under that notice are unselected

individual event changed
→ notice checkbox becomes partial/indeterminate if supported
```

This should be a UI convenience, not the underlying export unit.

## `.ics` Export Assumptions

Current `.ics` behavior:

- selected calendar events only
- valid `startDate` required
- all-day events only
- `DTSTART;VALUE=DATE:YYYYMMDD`
- `DTEND;VALUE=DATE:next day`

Batch export should preserve this baseline at first.

Time-specific events and timezone handling should remain future work.

## Stable UID Direction

Current single-notice UID direction can use app event IDs.

Long-term batch UID direction:

```text
<institution>-notice-<noticeId>-<eventType>-<eventIndex>@noticepilot.local
```

Future public product direction may replace `noticepilot.local` with a production domain.

UID goals:

- stable across repeated exports of the same source event
- avoid duplicate calendar entries where possible
- trace event back to source notice

## Relationship with School-level Parsing

Batch calendar export depends on school-level parsing, but should not start with full automation.

Recommended sequence:

```text
corpus examples
→ AI extraction against single notices
→ event candidate quality QA
→ school-level notice parsing design
→ batch event selection UI
→ batch `.ics` export
```

School-level parsing should be considered after around 30 corpus examples are collected.

## Relationship with Campus Preferences

Campus preferences are now available as local, browser-scoped product metadata. They may become useful later for school-level parsing, notice filtering, or subscription defaults, but they are not part of the current batch export behavior.

Current rule:

```text
campus preferences
→ metadata only
→ no notice filtering
→ no event filtering
→ no export behavior change
```

Any future use of campus preferences for filtering or subscription behavior should be introduced as a separate scoped phase with dedicated QA.

## Subscription Feed Direction

Production user-specific subscription calendar feeds remain a future roadmap
item. The current app has an opt-in, loopback-only reference flow for one fixed
Foundation.25.1 snapshot; it is not durable user subscription infrastructure.

Downloaded `.ics` export should come first because it is simpler, reviewable, and does not require account infrastructure.

Production subscription feeds still require additional decisions:

- hosted feed URL
- update cadence
- stable UID persistence
- institution/source tracking
- user preferences beyond local-only metadata
- privacy policy
- database or durable storage
- authentication model if user-specific

## Explicit Non-goals for Current MVP

Not implemented yet:

- batch `.ics` export
- notice collection crawler
- school-specific parser
- campus preference based notice filtering
- subscription feed URL/backend generation
- Google Calendar API integration
- user accounts
- database persistence
