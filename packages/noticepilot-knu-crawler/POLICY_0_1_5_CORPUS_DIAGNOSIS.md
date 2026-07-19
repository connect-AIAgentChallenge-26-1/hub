# Policy 0.1.5 corpus diagnosis

## Scope

This diagnosis reviews the output produced by `pipelineVersion: 0.1.5`
(observation.3-policy.6) from the 2,059-notice observation.3 corpus.

The run itself was structurally successful:

- processed notices: 2,059
- missing normalized notices: 0
- invalid date-order candidates: 0
- auto-confirmed candidates: 1,078
- student-default feed candidates: 778
- job-application feed candidates: 300

The remaining defects were semantic extraction errors rather than pipeline or
ICS serialization failures.

## Confirmed issue classes

### 1. Reference and revision dates entered the student feed

Four auto-confirmed candidates were created from non-action metadata:

- `공고일('26. 1. 14.) 기준 ...`
- `공고일(`26. 1. 14.) 기준 ...`
- `1차 수정(26. 2. 2.)`
- `학적 변동 반영일: 2026. 2. 12.` in an already completed approval-list notice

These dates describe eligibility/reference state or document revision, not a
student action window.

### 2. Month-omitted range ends collapsed to the first day

Eight candidates across six notices lost a same-month range end, including:

- `2026. 1. 23.~27.`
- `2026. 2. 10.(화) ~ 11.(수), 17:00`
- `2026. 3. 30.(월)~31.(화) 17:00까지`
- `2026. 3. 20.(금) ~ 26.(목)`
- `6. 1.(월) ~ 5.(금)`

The parser previously required the second boundary to repeat the month.

### 3. Full-width weekday parentheses broke a valid timed range

`2026. 2. 12.（목） 09:00 ~ 2. 27.（금） 18:00` was reduced to a
single 30-minute event because the date token accepted ASCII parentheses only.

### 4. Repeated and recurring schedules were partially published

- four candidates from two notices contained comma-separated independent dates
  but only one date was published;
- nine candidates contained a date range followed by recurring daily hours,
  such as `8.3.~8.7., 09:30~16:30`, but the end time was attached to the range
  boundary instead of being expanded into occurrences.

The deterministic MVP pipeline should not silently publish a partial schedule.
These cases now fail closed to review.

### 5. Truncated date evidence was auto-confirmed

Eighteen candidates across fifteen notices ended with an incomplete weekday or
HTML-derived fragment such as:

- `입사신청 기간: 2026. 1. 14.(`
- `예비수강신청: 2.12.(`
- `근로장학생 신청기간: 2026. 2. 5.(`

A single visible date is insufficient evidence that the action is a one-day
deadline. These candidates now require review.

### 6. Non-student actions entered the student-first feed

Eleven candidates across six notices targeted a different actor:

- general-public CPR education;
- practicum host/company recruitment.

These are now excluded with `non_student_action_target`.

### 7. Numeric course notation was treated as a date

A course-credit expression such as `3-3-0` produced a March 3 event. Hyphenated
three-part numeric notation is now rejected as non-date data.

### 8. Nearby action labels were occasionally overridden by broader context

Examples included a scholarship briefing classified as an application deadline
and `선정발표` classified as submission. Nearest-date label rules now recognize
particles after `설명회` and the compact `선정발표` form.

## Policy.7 behavior

Observation.3-policy.7:

- rejects reference/revision metadata dates more broadly;
- preserves same-month day-only range ends;
- supports full-width weekday parentheses;
- sends multiple independent dates and recurring daily time windows to review;
- sends truncated date contexts to review;
- excludes general-public and practicum-host actions from the student feed;
- rejects course-credit notation;
- expands completed approval-list title detection;
- improves nearest-date event/result classification.

Cross-board reconciliation remains intentionally out of scope.
