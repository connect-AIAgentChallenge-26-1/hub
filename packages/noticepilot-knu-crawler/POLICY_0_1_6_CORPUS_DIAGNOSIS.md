# Policy 0.1.6 corpus diagnosis

## Scope

This diagnosis reviews the output produced by `pipelineVersion: 0.1.6`
(observation.3-policy.7) from the immutable 2,059-notice observation.3 corpus.

The run was structurally successful:

- processed notices: 2,059;
- missing normalized notices: 0;
- invalid date-order candidates: 0;
- auto-confirmed candidates: 1,039;
- student-default feed candidates: 739;
- job-application feed candidates: 300.

Both ICS files matched their reports exactly. Candidate IDs and UIDs were
unique, physical lines used CRLF, and no physical ICS line exceeded 75 octets.
The remaining defects were semantic candidate-production issues.

## Confirmed issue classes

### 1. Truncated weekday fragments still entered the feed

Eighteen auto-confirmed candidates across fifteen notices contained incomplete
weekday parentheticals such as:

```text
2026. 7. 17.(금
2026. 7. 8.(수
2026. 1. 14.( 수
```

Policy.7 only recognized an opening parenthesis at the absolute end of the
whole extraction segment. It missed a weekday character after the opening
parenthesis and cases where a multi-line extraction window appended later text.

Policy.8 inspects the text immediately following every parsed date token. If an
opening weekday parenthesis is not closed locally, the schedule is review-only
with `truncated_date_context`.

### 2. A two-part project code was parsed as a date

The text below produced a false April 3 deadline:

```text
4-3 강원형 직업·평생 교육체계 구축_지역선도 인재양성 사업
```

Policy.7 rejected `3-3-0`, but a bare two-part hyphen code remained accepted.
Policy.8 rejects yearless hyphen pairs unless the token has an immediate
calendar cue such as a weekday, clock, range connector, or deadline suffix.

### 3. An open-ended start date became a false deadline

```text
접수기간: 1월 9일(금)부터 ~ 선착순 마감
```

The only explicit date is the opening date. Policy.7 emitted January 9 as an
application deadline, which reverses the meaning. Policy.8 sends this form to
review with `open_ended_application_period`.

### 4. Non-student or conditional actions remained in the student feed

Confirmed examples included:

- seven candidates from a campus-festival temporary liquor-vendor recruitment;
- a facilities manager's additional pest-control request deadline;
- a recommending institution's recommendation deadline;
- a document deadline applying only to an applicant already selected as the
  institution's nominee.

Policy.8 excludes explicit vendor/contractor recruitment titles. Candidate-level
institutional actions are review-only with `non_student_local_action`, and
actions conditional on prior selection are review-only with
`conditional_selected_participant_action`.

### 5. One explicit campus title conflicted with list metadata

A `삼척생활관` recruitment notice carried `춘천` list metadata and therefore
entered the job feed with the wrong campus scope. Policy.8 treats explicit KNU
campus wording in the title as stronger than a conflicting list cell and records
`source: title_explicit_override`.

## Deliberate boundary

Policy.8 does not reconcile repeated source notices, cross-board reposts, or
extension/revision relationships. Those remain downstream CalendarEvent
reconciliation responsibilities. Source notices remain distinct at this stage.
