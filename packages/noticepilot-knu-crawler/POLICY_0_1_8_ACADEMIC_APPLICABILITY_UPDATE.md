# Policy 0.1.8 Academic Applicability Update

## Decision

Policy.10 preserves academic actions and explicit student applicability before subscription feed filtering.

The extraction/policy stage does not choose a user's year. It emits distinct candidates and retains the facts needed by the downstream `Subscription Feed Builder`.

## Leave and return applications

Leave-of-absence and return-from-leave application windows are period schedules.

```text
휴학 신청기간 → eventType: academic_period
복학 신청기간 → eventType: academic_period
```

Stable action identifiers:

```text
leave_of_absence_application
return_from_leave_application
```

When one exact range is explicitly shared by both actions, two candidates are emitted. They are not consolidated because their action semantics and enrollment-status applicability differ.

```json
{
  "actionType": "leave_of_absence_application",
  "audienceRules": {
    "enrollmentStatuses": ["enrolled"]
  }
}
```

```json
{
  "actionType": "return_from_leave_application",
  "audienceRules": {
    "enrollmentStatuses": ["on_leave"]
  }
}
```

Nearby tuition wording does not reclassify a leave application window as `payment_period`.

## Course registration

Stable action identifiers:

```text
course_registration
preliminary_course_registration
course_registration_change
course_registration_cancellation
```

Explicit cohort schedules are split rather than merged.

```text
4학년: 2026. 8. 18.
3학년: 2026. 8. 19.
전체학년: 2026. 8. 24.
```

becomes three independently filterable candidates. `전체학년` maps to `[1,2,3,4]` for the current undergraduate MVP contract.

The extractor only performs this split when a deterministic date is adjacent to an explicit cohort label. Ambiguous or unlabeled multiple schedules remain review-only.

## Candidate contract

Candidate schema:

```text
noticepilot.calendarCandidates.v0.6
```

New fields:

```json
{
  "actionType": "course_registration",
  "audienceRules": {
    "degreeLevels": ["undergraduate"],
    "studentYears": [3],
    "enrollmentStatuses": [],
    "admissionTypes": [],
    "matchMode": "all_dimensions",
    "personalizationReady": true,
    "confidence": "high",
    "evidence": [
      "degree_level_explicit",
      "student_year_explicit"
    ]
  }
}
```

Empty arrays are unrestricted. Non-empty arrays are allow-lists for that dimension.

## Subscription matching boundary

The deterministic helper `candidate_matches_subscription_profile()` defines the future matching semantics:

- empty candidate dimension: unrestricted;
- non-empty candidate dimension: the profile must provide a matching value;
- all restricted dimensions must match;
- campus matching remains a separate layer.

The current `student_default` preview feed is intentionally not user-profile filtered. This update preserves data and contract boundaries; it does not add authentication, profile storage, frontend controls, or a hosted subscription endpoint.

## Consolidation rule

Candidate consolidation now includes:

```text
actionType + audienceRules
```

Therefore:

- leave and return candidates sharing one date remain distinct;
- third-year and fourth-year course-registration candidates sharing one date remain distinct;
- overlapping extraction windows for the same action and same audience rules are still consolidated.

## Validation

Regression coverage includes:

- separate leave and return periods;
- shared leave/return period split;
- tuition wording not overriding leave action semantics;
- year-specific course-registration splitting;
- same-date different-year preservation;
- preliminary/change course-registration action types;
- degree/admission applicability preservation;
- unrestricted behavior when no year is explicit;
- deterministic subscription-profile matching;
- action/applicability summary counts.
