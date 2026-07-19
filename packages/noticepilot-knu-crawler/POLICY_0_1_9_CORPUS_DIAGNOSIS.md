# Policy 0.1.9 corpus diagnosis and 0.1.10 hardening

## Scope

Policy 0.1.9 introduced stable academic `actionType` and `audienceRules` fields. The full 2,059-notice observation run completed without chronology errors, but semantic review of the 1,084 auto-confirmed candidates found that the first applicability implementation was too permissive.

## Confirmed regressions in policy 0.1.9 output

### 1. Enrollment-status words were mistaken for academic actions

`휴학생`, `휴학생 제외`, and `재/휴학 증명서` were interpreted as `leave_of_absence_application` because the action detector accepted the notice title or a distant `신청` token as confirmation.

- `leave_of_absence_application`: 30 auto-confirmed candidates
- Actual leave-application candidates: 3
- False leave-action assignments: 27
- One of three return candidates was also assigned to the neighboring leave period.

### 2. School-year notation became a sixth-year audience rule

The terminal digit in `2026학년도` was captured as `6학년`. Nine auto-confirmed candidates received a false sixth-year scope, including closed-course notices, seasonal classes, tuition exemptions, and a scholarship notice.

### 3. Notice titles leaked action semantics into unrelated dates

A title containing `수강신청` or `재입학` relabeled nearby body dates even when the body label was more specific.

Examples:

- tuition payment period → `readmission_application`
- class period or refund date → `course_registration`
- readmission permission notice → `readmission_application`
- scholarship application mentioning `재입학생` → `readmission_application`

Of seven auto-confirmed readmission-action candidates, only the two actual application periods were valid.

### 4. Generic audience text over-scoped non-academic notices

Scholarships, programs, events, and job postings received candidate-level personalization from phrases such as `3학년 재학생`, `4학년 우선`, or `대학원생 제외`. This created duplicate scoped and unscoped candidates and risked hiding generally applicable schedules.

- Auto-confirmed candidates with personalization metadata: 128
- Non-academic personalized candidates: 69
- Same-notice/date/action duplicate groups: 35, with 36 redundant candidates

## Policy 0.1.10 resolution

Policy 0.1.10 narrows applicability to reviewed academic actions and makes the date-local action label authoritative.

- `휴학생`, exclusions, eligibility clauses, and certificate requirements never create leave/return actions.
- `학년` extraction uses digit boundaries that exclude `학년도`.
- Course-registration and readmission action types require an explicit local temporal label.
- `재입학 허가자 등록 및 수강신청` cannot turn the tuition period into readmission application.
- Generic scholarships, programs, events, and job postings retain unrestricted `audienceRules` in this policy version.
- Explicit year-scoped course schedules remain separate; their unscoped duplicate is removed.
- Different academic action types remain separate even when timestamps match.

## Responsibility boundary

This hardening does not implement user-profile storage or personalized feed generation. The pipeline preserves verified applicability metadata only. The downstream Subscription Feed Builder remains responsible for matching `audienceRules` against a user's profile.
