# Policy 0.1.13 Corpus Diagnosis and Policy.15 Update

## 1. Input and baseline

Policy.14 was executed against the immutable KNU observation dataset containing 2,059 normalized notices. The run completed without missing normalized notices or reversed date candidates.

Baseline output:

- student feed: 620 candidates;
- job application feed: 300 candidates;
- auto-confirmed: 920;
- needs review: 390;
- structured candidates: 1,010;
- locally grounded candidates: 937;
- reconstructed `table_row` candidates: 8;
- leave application: 2;
- return application: 2;
- student-year-scoped candidates: 4.

Policy.14 therefore preserved the Policy.13 table reconstruction and fixed the tested continuation ownership defects.

## 2. Residual semantic classes

Manual and pattern-based inspection of the 620 student-feed candidates found four remaining semantic boundaries.

### 2.1 Reference dates incorrectly treated as user actions

Examples included refund/return schedules, scholarship deposit processing dates, payment schedule references, and a title-only timetable reference date. These dates describe an administrative consequence or reference point rather than an action the student must perform.

Policy.15 sends these candidates to review with `reference_date_not_user_action`. The guard is locally anchored: a genuine `수강신청 취소기간` remains actionable even when the segment also states that tuition is fully refunded.

### 2.2 Status/result announcements incorrectly classified as exams or applications

Examples included:

- `시험 대상자 발표`;
- `재입학 허가 통보`;
- `지원대상자 확정통보`.

These are result announcements. Policy.15 prioritizes the explicit announcement/status label over inherited exam or application context.

### 2.3 Activity and academic-evaluation periods incorrectly classified as deadlines or exams

Examples included `수업평가`, `수강기간`, `현장실습기간`, facility-use periods, and operational-hour extensions. Exact periods are now typed as academic evaluation or activity events. An exact start with a vague end such as `7월 말` remains review-only.

### 2.4 Conditional participant and internal selection points

Examples included additional confirmed participants, registered/filled-seat participants, payment-hold groups, and internal document evaluation dates. These are not broad student actions. Policy.15 sends them to review under conditional-participant or internal-process reasons.

## 3. Deterministic implementation

Policy.15 retains `noticepilot.scheduleSegments.v0.3`. The change is semantic ownership, not a return to broad regex windows. Regex identifies candidate tokens; the nearest locally owned label determines the action.

New or strengthened behavior:

- `course_evaluation` action type;
- result/status announcement priority;
- exact activity-period classification;
- vague-ended activity review;
- refund/deposit/payment reference review;
- expanded conditional-status review;
- internal document evaluation review;
- title-reference suppression;
- action-family precision consolidation.

## 4. Regression constraints

The following must remain true:

- board 716 job feed stays application-period-only;
- leave/return table rows remain restored;
- student-year course-registration rows remain distinct;
- exact course-registration cancellation windows remain publishable;
- readmission application periods that mention document screening remain applications;
- candidate chronology integrity remains zero.

## 5. Version contract

- package: `0.4.4-observation.3-policy.15`;
- pipeline: `0.1.14`;
- candidate schema: `noticepilot.calendarCandidates.v0.10`;
- summary schema: `noticepilot.mvpPolicySummary.v0.5`;
- segment schema: `noticepilot.scheduleSegments.v0.3`.

Policy.15 was validated with 143 deterministic unit/regression tests and the package-level offline checks. Exact full-corpus feed counts require a local rerun against the immutable observation dataset.
