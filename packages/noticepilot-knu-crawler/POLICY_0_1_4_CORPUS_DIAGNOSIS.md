# Policy 0.1.4 corpus diagnosis

## Input inspected

The inspection used the policy.5 outputs generated from the observation.3
snapshot:

- 2,059 processed notices
- 1,118 auto-confirmed candidates
- 818 `student_default` candidates
- 300 `job_application` candidates
- zero reversed ranges in the final integrity report

The chronology guard therefore worked, but semantic date projection still
contained four classes of false or redundant student-feed events.

## 1. Omitted range-end year was inferred independently

Three auto-confirmed ranges began in 2025 and ended in 2026 even though the
source omitted the end year and did not cross New Year.

Examples:

```text
2025. 3. 3. ~ 6. 30.
2025. 4. 4. ~ 6. 21.
2025. 2. 5. 10:00 ~ 2. 11. 18:00
```

The end date must inherit 2025. Once corrected, these ranges are entirely
before their 2026 publication dates and are therefore suppressed into review.

Policy.6 inherits the start year for a directly connected range and increments
the year only when the end month/day is earlier than the start month/day.

## 2. End-only time leaked to the range start

Fourteen multi-day timed candidates contained only one clock in the source,
at the end boundary, but policy.5 copied that clock to both dates.

Example:

```text
2026. 2. 13. ~ 3. 8. 23:59까지
```

Incorrect:

```text
2026-02-13 23:59 ~ 2026-03-08 23:59
```

Policy.6 attaches the clock only to the second date and projects the start as
local midnight:

```text
2026-02-13 00:00 ~ 2026-03-08 23:59
```

## 3. Completed result notices entered the broad student feed

Seventeen auto-confirmed candidates were produced from titles such as:

```text
멘토 선발 결과 안내
수행팀 선정 결과 안내
공모 결과 안내
```

Activity periods and selected-person schedules are not appropriate for the
default feed used by all students. Policy.6 excludes the completed result
notice from automatic publication. An explicit post-result action such as a
signed document submission, orientation, or mandatory training is retained
only in the review queue with:

```text
post_result_selected_participant_action
```

## 4. Same-action periods and single dates were duplicated

Policy.5 contained same-notice application/payment/submission ranges together
with a repeated start or deadline candidate.

Applying the policy.6 consolidation rule to the policy.5 output found:

- 34 affected notices
- 29 redundant boundary candidates removable without information loss
- 6 same-action conflicts requiring review rather than automatic publication

The full period remains canonical under the confirmed MVP period policy.
Interior conflicting dates and timed-vs-all-day boundary conflicts fail closed.

## Additional metadata exclusions

Policy.6 also rejects:

- revision timestamps such as `2026. 2. 4. 수정`
- eligibility reference dates such as `2026. 3. 1. 기준`
- internal selection, screening, and candidate-decision periods

## Deliberate boundary

Cross-board duplicate reconciliation is not performed by this policy stage.
Source notices remain separate. Stable event identity, revision linkage, and
cross-board deduplication remain downstream CalendarEvent reconciliation
responsibilities.
