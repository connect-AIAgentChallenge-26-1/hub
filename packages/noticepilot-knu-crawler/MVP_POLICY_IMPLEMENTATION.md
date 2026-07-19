# NoticePilot MVP Policy Pipeline v0.1

## 1. Purpose

This package applies the confirmed MVP publication policy to the immutable
`observation.3` corpus.

The source observation directory is read-only. All decisions, candidate files,
review queues, and ICS previews are written under a separate `derived/` output.

## 2. Confirmed policy

### Primary audience

- Student-first default feed.
- Board 716 recruitment application periods are exposed through a separate,
  optional `job_application` feed.
- Internal staff-only notices are not published to the student feed.
- Unknown or mixed audiences go to review rather than automatic publication.

### Calendar relevance

Publishable:

- user action periods and deadlines;
- academic administration periods;
- event/exam dates when the audience is student-relevant;
- future result announcement dates;
- board 716 application periods for active recruitment announcements.

Not automatically published:

- already-completed result announcements;
- board 716 interview, document-screening, and final-result notices;
- internal staff-only schedules;
- notices without a deterministic actionable date.

### Date policy

- Explicit ranges remain full ranges.
- Core all-day end dates are inclusive.
- ICS `DTEND` is emitted as the following day, because RFC 5545 uses an
  exclusive all-day end.
- Deterministic publication-relative expressions are calculated:
  - `공고일로부터 N일 이내` -> `publishedAt + N calendar days`;
  - `공고일로부터 N일간` -> inclusive period beginning on `publishedAt`;
  - `공고일 다음 날부터 N일간` -> inclusive period beginning the next day.
- User-specific references such as `통보일로부터 N일` require review.
- `7월 중`, `추후 공지`, `상시 모집`, and similar expressions require review.

## 3. Feed separation

The implementation intentionally separates the two enabled feeds.

```text
student_default
  Student actions and future result announcement dates.

job_application
  Board 716 recruitment application periods only.
```

This preserves the student-first product direction without discarding the
confirmed MVP treatment of board 716.

## 4. Run

Assuming the two work directories are siblings:

```text
noticepilot-knu-crawler-v0.4.4-observation.3/
noticepilot-knu-crawler-v0.4.4-observation.3-policy.15-foundation.1/
```

Run from the policy package:

```bash
cd noticepilot-knu-crawler-v0.4.4-observation.3-policy.15-foundation.1

bash run_mvp_policy_pipeline.sh \
  ../noticepilot-knu-crawler-v0.4.4-observation.3/local-observation-data/observation-2026-v2
```

The input observation directory is not modified.

## 5. Outputs

Default output root:

```text
derived/mvp-policy-v0.1/
├── decisions/
│   ├── notices.jsonl
│   ├── publishable-candidates.jsonl
│   ├── review-queue.jsonl
│   └── not-calendar-relevant.jsonl
├── candidates/
│   ├── all/
│   ├── student_default/
│   └── job_application/
├── reports/
│   ├── policy-summary.json
│   ├── board-disposition-summary.tsv
│   └── run-manifest.json
└── ics/
    ├── student_default/
    │   ├── noticepilot-student-default.ics
    │   └── ics_export_report.json
    └── job_application/
        ├── noticepilot-job-applications.ics
        └── ics_export_report.json
```

### Dispositions

- `publishable`: at least one candidate satisfies the deterministic MVP policy.
- `needs_review`: potentially relevant but audience/date/evidence is not safe
  enough for automatic publication.
- `not_calendar_relevant`: excluded by the confirmed MVP policy.

## 6. Validation

```bash
python3 -m py_compile \
  noticepilot_mvp_policy_pipeline.py \
  noticepilot_ics_exporter.py

python3 -m unittest discover -s tests -v
```

The test suite covers:

- explicit date ranges;
- publication-relative date calculations;
- student action publication;
- future result dates;
- completed result exclusion;
- board 716 application-only policy;
- user-specific relative dates;
- ambiguous dates;
- inclusive core end date to exclusive ICS `DTEND` conversion;
- same-day clock ranges and `24:00`;
- nearest-date event classification;
- student versus internal forwarding deadlines;
- same-day precision consolidation;
- embedded review candidates in the review queue.


## Policy.15 semantic ownership rules

The deterministic extractor treats regex matches as token evidence only. A candidate is classified from the locally owned segment label, with the following fail-closed rules:

- result/status announcements are `result_announcement`;
- course evaluation is `academic_period` with `actionType: course_evaluation`;
- exact learning, practicum, facility-use, and operation periods are `event`;
- partially specified activity ends are `needs_review`;
- refund, return, scholarship deposit, and payment reference dates are `reference_date_not_user_action`;
- explicit status-limited follow-ups are `conditional_selected_participant_action`;
- internal document evaluation or selection points are `internal_process_period`.

A course-registration cancellation period is not demoted merely because the same segment explains that tuition will be refunded. The explicit cancellation action remains authoritative.

See `POLICY_0_1_13_CORPUS_DIAGNOSIS.md`.

## 7. Current limitations

- No LLM extraction.
- No PDF/HWP/OCR text extraction is introduced by this package.
- Attachment-dependent notices are placed in the review queue when the body
  does not provide enough deterministic evidence.
- Candidate reconciliation and stable production UID/version promotion remain
  separate downstream responsibilities.


### Candidate integrity and feed guards (policy.15)

- Fractions, scores, and numbered headings that resemble dates are rejected before candidate creation.
- A range is accepted only when two adjacent date tokens are directly connected by a range marker.
- Segments containing multiple independent schedules fail closed into the review path.
- Any residual reversed range is removed from feeds and recorded in `derived/mvp-policy-v0.1/reports/candidate-integrity.json`.
- Same-day clock ranges preserve both start and end times.
- `24:00` is handled as the end of the stated day rather than a substring `04:00`.
- Range-end years are inherited from the range start unless the month/day crosses New Year.
- End-only clocks are attached only to the end date; the period start is normalized to local midnight.
- Completed-result notices are excluded from the broad feed, with explicit follow-up actions retained as review-only.
- Same-action range boundaries are consolidated; interior or precision conflicts are review-only.
- Revision timestamps, eligibility reference dates, and internal selection periods are ignored as non-actions.
- A precise timed candidate supersedes an otherwise identical all-day candidate.
- Department-to-administration forwarding deadlines are review-only, not student-feed events.
- The review queue includes notices containing embedded review-only candidates even when another candidate from the same notice is publishable.

## Policy.9 semantic hardening

Policy.9 retains the policy.8 fail-closed schedule and actor guards. It rejects score/history numerics, reviews independent slash-separated dates and non-action reference dates, separates result announcements from selected-participant follow-ups, classifies exact activity periods as events, and reviews partial activity periods. See `POLICY_0_1_7_CORPUS_DIAGNOSIS.md`.

## Policy.9 residual corpus guards

- Decimal scores, malformed grade-table values, and named historical dates do
  not produce calendar candidates.
- Independent dates separated by `/` or a middle dot are review-only until the
  pipeline can expand each occurrence deterministically.
- Term-end references, release/share dates, grade-transmission dates, and
  eligibility ceremony dates are not treated as student actions.
- Future result announcements remain publishable; orientation, registration,
  education, or follow-up submission limited to selected participants is
  review-only.
- Exact activity ranges are classified as `event`; partially specified activity
  periods are review-only with `partial_activity_period_requires_review`.
- Explicit KNU campus names in titles continue to override conflicting list
  metadata.


## Policy.11 academic action and subscription applicability

Policy.10 introduces a stable academic-action layer without moving user-profile filtering into the extraction stage.

### Academic actions

- `leave_of_absence_application`
- `return_from_leave_application`
- `course_registration`
- `preliminary_course_registration`
- `course_registration_change`
- `course_registration_cancellation`
- `readmission_application`
- `major_transfer_application`
- `credit_recognition_application`

Leave and return application windows use `eventType: academic_period` even when nearby wording mentions tuition payment. A shared leave/return range produces two candidates so a future subscription builder can match the user's current enrollment status.

### Applicability fields

Every candidate now carries `audienceRules` with these dimensions:

```json
{
  "degreeLevels": ["undergraduate"],
  "studentYears": [3],
  "enrollmentStatuses": ["enrolled"],
  "admissionTypes": [],
  "matchMode": "all_dimensions",
  "personalizationReady": true,
  "confidence": "high",
  "evidence": ["degree_level_explicit", "student_year_explicit"]
}
```

Empty arrays mean unrestricted applicability for that dimension. Restricted dimensions require a matching profile value. Campus matching remains a separate feed-builder layer. The policy package exposes `candidate_matches_subscription_profile()` as the deterministic matching contract, but the current generic `student_default` preview is not filtered by a user profile.

### Course-registration schedule splitting

When deterministic dates are adjacent to explicit cohort labels such as `4학년`, `3학년`, `전체학년`, `신입생`, or `편입생`, policy.15 creates separate candidates. Multiple unlabeled or ambiguous schedules still fail closed into review. Candidate consolidation includes `actionType` and `audienceRules`, so different cohorts are never collapsed merely because their dates match.

See `POLICY_0_1_8_ACADEMIC_APPLICABILITY_UPDATE.md`.

### Policy.11 scope hardening

Policy.11 treats audience status and calendar actions as separate concepts. `휴학생`, `휴학생 제외`, and certificate requirements do not create leave actions. Student-year parsing excludes `학년도`, and only explicit cohort labels attached to course-registration dates populate `studentYears`. Academic `actionType` is assigned from the nearest temporal label rather than from the notice title. Generic non-academic notices receive empty applicability dimensions in this version. See `POLICY_0_1_9_CORPUS_DIAGNOSIS.md`.


## S20/S21 refactor guardrails

The runtime pipeline remains Policy.15 `0.1.14`. Before S22–S26 refactoring,
this package adds two non-runtime layers:

1. `baseline/policy15/` freezes the verified 2,059-notice output.
2. `noticepilot_judgment_models.py` defines immutable structure, temporal,
   binding, semantic, applicability, publishability, and trace contracts.

Run the behavioral comparator after every extraction/refactor step:

```bash
python3 tools/compare_policy_baseline.py \
  --baseline baseline/policy15 \
  --current derived/mvp-policy-v0.1 \
  --output derived/policy15-baseline-diff.json
```

S21 is contract-only. `noticepilot_mvp_policy_pipeline.py` does not import the
new judgment module, and the compatibility adapter uses
`temporalRole: unknown` rather than inferring new semantics.


## S23 layered runtime update

The active compatibility pipeline is now composed as follows:

```text
StructureAnalyzer
→ TemporalParser
→ LocalBinder
→ SemanticClassifier
→ legacy Policy.15 applicability/publishability
→ legacy intra-notice reconciliation
```

`temporalRole` is now an explicit candidate audit field. It is not yet the
authoritative publishability policy input; that migration is reserved for S24.
See `S23_LOCAL_BINDING_SEMANTIC_CLASSIFICATION.md` and
`PROJECT_PHASE_ROADMAP.md`.

## S27-C consumer registry boundary

S27-C materializes an isolated file-backed CalendarEvent identity registry after publishability and S27-B cross-notice reconciliation.

```text
909 publishable candidates
→ 900 opaque CalendarEvent identities
→ 909 source links
→ 901 revision records
→ 900 pending S27-D projection intents
```

The policy pipeline and candidate documents remain unchanged. `needs_review` relations never merge. Existing candidate-based ICS remains the compatibility output until S27-D consumes the outbox and migrates UID projection.

## S27-D persistent ICS projection

The S27-C registry is now consumed by `noticepilot_registry_ics_projector.py`. The output is isolated under `projection/s27d-v1` and leaves producer candidates, the S27-C registry, and legacy candidate-UID ICS artifacts unchanged. Persistent UID, sequence, source-link, all-day end, timed-no-end, CRLF, and UTF-8 folding invariants are audited by `tools/audit_s27d_ics_projection.py`.

## S28-4 feed snapshot boundary

S28-4 stores deterministic FeedBuilder membership as an immutable content-addressed snapshot. Snapshot identity is derived from semantic feed state and is distinct from persistent CalendarEvent identity. The snapshot carries no URL, token, or ICS payload. Reference snapshots and their upstream hashes are recorded in `snapshots/s28-v1/manifest.json`.

## S28-5 profile matrix boundary

S28-5 validates the approved S28 profile and eligibility contracts with 44 audit-only profiles across all 900 active CalendarEvents. It produces 39,600 deterministic decisions and verifies reference snapshot parity, campus subset behavior, unknown/common/review toggles, audience monotonicity, inactive status exclusion, canonical-board partitioning, and event-type partitioning. It adds no product policy and does not mutate snapshots, registry state, projection state, or ICS output.
