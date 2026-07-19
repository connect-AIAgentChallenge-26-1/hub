# Policy 0.1.7 corpus diagnosis

## Scope

This diagnosis reviews the output produced by `pipelineVersion: 0.1.7`
(observation.3-policy.8) from the immutable 2,059-notice observation.3 corpus.

The run was structurally successful:

- processed notices: 2,059;
- missing normalized notices: 0;
- invalid date-order candidates: 0;
- auto-confirmed candidates: 1,007;
- student-default feed candidates: 707;
- job-application feed candidates: 300.

Both ICS files matched their reports exactly. Candidate IDs and UIDs were
unique, date order was valid, and the explicit-title campus override corrected
the confirmed `삼척생활관` recruitment case. The remaining defects were
semantic candidate-production issues rather than ICS serialization failures.

## Confirmed issue classes

### 1. Numeric facts still resembled dates

Three student-feed candidates were produced from non-calendar numeric text:

```text
강릉의 3.1 독립만세운동
평균 평점이 4.5점 만점
0.15 4.15 ... 성적 기준
```

Policy.9 rejects decimal scores with particles or score suffixes, adjacent
score-table values, and named historical dates.

### 2. Independent dates separated by a slash were collapsed

Two confirmed candidates contained more than one independent occurrence:

```text
3.13. / 3.20.(금)
2026.7.6. ... / 2026.7.7. ...
```

Publishing only the first date loses information. Policy.9 sends slash- or
middle-dot-separated independent dates to review with
`multiple_discrete_event_dates` until occurrence expansion is implemented.

### 3. Reference facts entered the student feed

Nineteen confirmed candidates represented reference dates rather than a user
action. The observed classes included:

- a term-end date used as the base for later training;
- a future document release, share, publication, or upload date;
- exchange-study grade-transmission dates;
- a degree-ceremony date inside an eligibility condition.

Policy.9 detects these local contexts and routes them to review with
`reference_date_not_user_action`.

### 4. Selected-participant follow-ups remained broadly publishable

Two confirmed candidates applied only after a prior selection or recommendation:

```text
합격자 오리엔테이션: 2026.4.2. 18:00~19:00
추천 승인받은 학생이 직접 등록: 2026.1.19.~1.30.
```

Policy.9 preserves future result announcements, but sends orientation,
registration, education, and follow-up submission limited to selected
participants to review with `conditional_selected_participant_action`.

### 5. Activity periods had incorrect calendar semantics

Exact activity ranges were sometimes labelled as application periods. Policy.9
classifies a complete `활동기간` range as an `event`, while preserving a separate
application period from the same notice.

Four confirmed candidates exposed partially specified activity periods such as:

```text
2026.4월 초 ~ 2027.2.12.
2026학년도 1학기 (~2026.6.19.)
선발일 ~ 2027.8.31.
```

A single exact endpoint does not justify publishing the whole activity period as
a deadline. Policy.9 routes these cases to review with
`partial_activity_period_requires_review`.

## Projected effect

Applying the policy.9 guards to the policy.8 student feed identifies the
following confirmed candidate classes before overlap:

- numeric score/history false positives: 3;
- independent slash-separated schedules: 2;
- non-action reference dates: 19;
- selected-participant-only follow-ups: 2;
- partially specified activity periods: 4.

Exact policy.9 feed counts require rerunning all 2,059 normalized notices because
candidate consolidation and notice-level dispositions are recomputed together.
No final corpus count is inferred from this projection.

## Deliberate boundary

Policy.9 does not reconcile repeated source notices, cross-board reposts, or
extension/revision relationships. Those remain downstream CalendarEvent
reconciliation responsibilities. Source notices remain distinct at this stage.
