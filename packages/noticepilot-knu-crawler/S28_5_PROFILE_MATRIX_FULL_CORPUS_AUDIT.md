# S28-5 — Profile Matrix and Full-Corpus Feed Audit

Status: completed  
Decision date: 2026-07-13  
Matrix schema: `noticepilot.profileMatrix.v0.1`  
Result schema: `noticepilot.profileMatrixResult.v0.1`  
Matrix version: `0.1.0`

## 1. Purpose

S28-5 validates the completed S28 profile and feed contracts across a representative matrix of explicit profiles.

```text
44 SubscriptionProfile audit cases
× 900 active CalendarEvent eligibility views
= 39,600 deterministic eligibility decisions
```

The matrix combines existing approved profile dimensions. It does not establish a new product default.

## 2. Matrix categories

```text
reference profiles       2
single-campus profiles   8
policy toggles           6
audience profiles        8
inactive statuses        2
canonical-board cases    9
event-type cases         9
---------------------------
total                    44
```

All profile IDs are fixed opaque audit identifiers. The matrix is marked `auditOnly=true`, `authoritativeProductDefaults=false`, and `userCampusDefaultEstablished=false`.

## 3. Reference parity

```text
student_default   601 events
job_application   299 events
overlap              0 events
union              900 events
```

The two reference memberships exactly match S28-4 snapshots and continue to partition every active S27 event.

## 4. Campus matrix

Included event counts:

```text
                     student   job
chuncheon                334   219
samcheok                 299    67
dogye                    120    18
gangneung_wonju          270    44
```

Every single-campus result is a subset of its all-campus reference membership. Common events remain included unless `includeAllCampusEvents=false`.

```text
student exclude common   487
job exclude common       296
```

Unknown-campus exclusion affects only the one current job event:

```text
student exclude unknown  601
job exclude unknown      298
```

## 5. Review and audience matrix

All 900 active events are currently `auto_confirmed`, so disabling review-required inclusion does not alter membership:

```text
student exclude review   601
job exclude review       299
```

Current audience data:

```text
personalization-ready     12
audience-unscoped         888
```

Student audience results:

```text
                                      include unscoped   exclude unscoped
graduate                                           597                  8
year 3                                             600                 11
enrolled                                           599                 10
new student                                        601                 12
```

For every audience pair, `exclude_unscoped` membership is a subset of `include_unscoped`, and both remain subsets of the 601-event student reference feed.

## 6. Canonical source partition

Canonical-board-only profile counts:

```text
504 general_notice   260
715 event             26
716 job_posting      299
717 career             6
719 competition       20
720 school_notice    176
721 scholarship      113
722 health_notice      0
723 form_archive       0
```

The nine board memberships are pairwise disjoint and their union is exactly 900 events. This confirms the approved `canonical_source_only` policy across the active corpus.

## 7. Event-type partition

```text
academic_period          46
application_period      239
deadline                 33
event                   110
exam_or_interview        13
payment_period           22
result_announcement      40
submission_period        98
job_application_period  299
```

The nine event-type memberships are pairwise disjoint and their union is exactly 900 events.

## 8. Status and determinism

```text
paused student profile   0 included
revoked job profile      0 included
```

All 44 cases produce identical FeedBuildResult and decision-ledger output when the 900 input views are reversed. The matrix therefore validates 39,600 decisions under both normal and reverse input order.

## 9. Reason coverage

Corpus-observed reasons include:

```text
profile_not_active
campus_unknown_excluded
campus_all_excluded
campus_no_intersection
source_board_or_notice_type_mismatch
feed_scope_mismatch
event_type_mismatch
target_actor_mismatch
audience_unscoped_excluded
audience_degree_level_mismatch
audience_student_year_mismatch
audience_enrollment_status_mismatch
eligible_all_dimensions_matched
```

The following reason paths remain unreachable in the current active corpus and stay covered by lower-level S28-2 tests:

```text
institution_mismatch
unsupported_event_status
invalid_normalized_date
review_state_unknown
review_required_excluded
audience_admission_type_mismatch
```

## 10. Boundaries preserved

S28-5 does not:

- change S28-4 snapshot identity or membership;
- mutate S27-C registry or S27-D projection;
- serialize or rewrite ICS;
- issue subscription URLs, slugs, or tokens;
- introduce new default profile policy;
- persist profiles or snapshots to PostgreSQL.

S29 owns persistence, incremental runtime wiring, and delivery identity.

## 11. Validation

```bash
python3 tools/build_s28_profile_matrix.py --root .
python3 tools/audit_s28_profile_matrix.py \
  --root . \
  --output-dir derived/mvp-policy-v0.1/reports/s28-profile-matrix
```

Expected audit result:

```text
profile cases       44
active events      900
decisions        39,600
invariants pass      9/9
result              pass
```
