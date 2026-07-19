# Changelog

## 0.4.4-observation.3-policy.15-foundation.21 — 2026-07-13

- Completed S28-3 deterministic `FeedBuilder`.
- Added approved-default student/job profile factories while keeping campus selection explicit and caller-owned.
- Added two all-campus reference profiles for corpus parity checks without establishing a user campus default.
- Deterministically partitioned all 900 active CalendarEvents into included/excluded sets with complete decision ledgers.
- Fixed included ordering to normalized start then CalendarEventId and excluded ordering to reason precedence then CalendarEventId.
- Reproduced S27-D membership exactly: student 601, job 299, overlap 0, union 900.
- Added strict FeedBuildResult/default-profile schemas, focused tests, and full-corpus audit tooling.
- Preserved S27 registry/projection/ICS byte-for-byte and deferred snapshot identity/hash to S28-4.

## 0.4.4-observation.3-policy.15-foundation.18 — 2026-07-13

- Completed S28-1 as an isolated strict `SubscriptionProfile` contract.
- Added explicit campus, source, event, review-required, and audience selection objects with no silent defaults.
- Restricted source selection to canonical board IDs and required exact board/category consistency.
- Kept profile identity separate from subscription URL/token issuance and feed snapshot event IDs.
- Added non-authoritative contract examples, a strict Python validator, focused tests, and a no-mutation contract audit.
- Preserved the S27-C registry and S27-D persistent ICS projection unchanged.
- Marked S28-2 feed eligibility policy as ready; FeedBuilder and feed snapshots remain unimplemented.

## 0.4.4-observation.3-policy.15-foundation.16 — S27-C opaque CalendarEvent registry

- Added a file-backed immutable `registry_assigned_opaque_v0` CalendarEvent identity registry.
- Assigned all 909 publishable candidates to 900 stable event identities.
- Applied eight approved duplicate merges and one explicit extension merge.
- Preserved 909 source links, 343 relation decisions, and 901 revision records.
- Kept all 234 `needs_review` relations unmerged.
- Added atomic temporary-directory build/rename, manifest hashes, content digest, and non-overwrite guard.
- Created 900 pending S27-D projection outbox intents without serializing or changing ICS.
- Preserved the S26 layered baseline at `match / 0`.
- Verified 288/288 regression tests across independent test groups.

## 0.4.4-observation.3-policy.15-foundation.15 — S27-B representative selection

- Approved specialized-board representative precedence as a partial order: `715 > 504` and `721 > 504`.
- Avoided introducing an unintended total order between specialized boards.
- Resolved all eight corpus duplicate canonical selections to their `715` or `721` candidates.
- Kept unconfigured board pairs fail-closed as `needs_review`.
- Preserved relation persistence, CalendarEvent ID assignment, runtime mutation, and ICS mutation as unexecuted.
- Verified 275/275 regression tests across independent test groups.

## 0.4.4-observation.3-policy.15-foundation.14 — S27-B deterministic cross-notice reconciliation

- Replaced observed-source-URL precedence with canonical source identity (`institution + canonical board category + sourcePostId`).
- Added `ReconciliationCandidateView`, `CalendarEventSourceLink`, and atomic promotion/relation persistence contracts.
- Added deterministic fail-closed `CrossNoticeReconciler`.
- Classified 343 diagnostic pairs: distinct 100, duplicate 8, extension 1, needs_review 234.
- Approved one explicit extension merge plan; blocked eight duplicate pairs pending representative-board selection.
- Assigned no CalendarEvent IDs and preserved runtime, ICS, and layered baseline `match / 0`.

## 0.4.4-observation.3-policy.15-foundation.11 — S26-B separate layered baseline

- preserved `baseline/policy15` unchanged as historical rollback evidence;
- created immutable `baseline/layered-s26-v1` with 2,059 canonical notice documents and 1,304 strict full candidate objects;
- added layered baseline build, strict comparison, manifest hash, non-overwrite, and mutation-detection tooling;
- recorded the accepted 304 Policy.15 differences without creating an allowlist;
- completed S26 and advanced the roadmap to S27.

## 0.4.4-observation.3-policy.15-foundation.10 — S26-A portability follow-up

- changed unified S26 report path references to POSIX paths relative to the audit report directory;
- made custom `--output` runs place the raw Policy.15 observation diff beside the main report by default;
- added regression coverage that resolves every relative report reference back to the expected artifact;
- added `S26_B_DECISION_CHECKLIST.md` describing the decisions required without performing allowlist adjudication or baseline promotion;
- kept S26-B planned and all approval/replacement flags false.

## 0.4.4-observation.3-policy.15-foundation.9 — S26-A

- added `tools/audit_s26_layered_full_corpus.py` as one composition root for the S24-A/B/C/D and S25 corpus audits;
- added cross-layer count, complete-trace, runtime-judgment, reconciliation, publishable, review-queue, and ICS consistency checks;
- recorded the raw Policy.15 comparison as a non-adjudicated observation report;
- explicitly left allowlist adjudication, baseline promotion, and baseline replacement unexecuted;
- marked S26-A complete while keeping S26 in progress and S26-B planned.

## 0.4.4-observation.3-policy.15-foundation.8 — S25

- added standalone `noticepilot_candidate_reconciler.py` and one canonical intra-notice reconciliation sequence;
- moved exact duplicate, generic/typed, scoped/unscoped, all-day/timed, range-boundary, and same-action conflict handling out of the policy pipeline;
- preserved compatibility helper APIs while synchronizing runtime judgments after reconciliation mutations;
- added focused S25 tests and a full-corpus idempotence/semantic-equivalence audit;
- advanced the active pipeline to `0.1.18`, completed S25, and moved the roadmap to S26.

# Changelog

## 0.4.4-observation.3-policy.15-foundation.7 — S24-D

- added `noticepilot_runtime_judgment_wiring.py` and serialized `applicabilityJudgment` and `publishabilityJudgment` on every runtime candidate;
- synchronized judgments after candidate creation, review demotion, same-notice consolidation, and completed-result follow-up filtering;
- added deterministic derived-corpus migration and full cross-artifact S24-D audit tools;
- verified 1,304/1,304 candidates, 2,213 candidate-document occurrences, and 498 review candidate occurrences with zero contract, reconstruction, or cross-artifact mismatches;
- preserved 909 auto-confirmed, 395 needs-review, publishable/review identity sets, and student/job ICS semantics;
- advanced the pipeline to `0.1.17`, candidate document schema to `noticepilot.calendarCandidates.v0.11`, completed S24, and moved the roadmap to S25.

## 0.4.4-observation.3-policy.15-foundation.6 — S24-C

- added standalone `noticepilot_publishability_evaluator.py`;
- moved candidate verdict, calendar inclusion, publication reason/rule ownership, and review demotion behind the evaluator;
- made `temporalRole`, deterministic temporal evidence, and chronology explicit publication inputs with fail-closed guards;
- preserved `candidate_disposition_for_audience` and `demote_candidate_for_review` as compatibility wrappers;
- reconstructed 1,304/1,304 `PublishabilityJudgment` objects with zero compatibility or contract errors;
- preserved 909 publishable candidates, 395 review candidates, review queue, and student/job ICS semantics;
- kept runtime `publishabilityJudgment` serialization deferred to S24-D;
- advanced the active pipeline to `0.1.16`, marked S24-C complete, and moved the roadmap to S24-D;
- expanded the complete test suite from 196 to 208 tests.

## 0.4.4-observation.3-policy.15-foundation.5 — S24-B

- added standalone `noticepilot_applicability_evaluator.py`;
- moved notice actor inference, stable academic audience-rule extraction, profile scope, conditional participant scope, and subscription-profile matching behind the evaluator;
- preserved `infer_audience`, `build_audience_rules`, and profile matcher compatibility APIs;
- routed candidate `targetActor` and `audienceRules` through evaluator compatibility projection without adding the S24-D runtime judgment field;
- added full-corpus applicability audit with 1,304/1,304 judgment reconstruction and zero projection mismatches;
- preserved publishable IDs, review queue, and student/job ICS semantics;
- marked S24-B complete and moved the roadmap to S24-C;
- expanded the complete test suite from 185 to 196 tests.

## 0.4.4-observation.3-policy.15-foundation.4 — S24-A

- added `noticepilot_board716_trace_adapter.py` for exact board 716 list-metadata application periods;
- completed layered traces for all 300 `job_application_period` candidates without changing candidate identity, publication decisions, feed scopes, campus scopes, reason codes, or ICS semantics;
- added deterministic derived-artifact migration and full-corpus S24-A audit tools;
- raised complete layered trace coverage from 1,004/1,304 to 1,304/1,304;
- recorded explicit board 716 binding and semantic rule IDs while preserving existing schema enums;
- advanced the active pipeline to `0.1.15`, marked S24-A complete, and moved the roadmap to S24-B;
- expanded the complete test suite from 177 to 185 tests.

## 0.4.4-observation.3-policy.15-foundation.3 — S23

- added `noticepilot_local_binder.py` and wired deterministic date mentions to immutable `BoundTemporalFact` records;
- added `noticepilot_semantic_classifier.py` and routed runtime event/action classification through the semantic facade;
- introduced actual `temporalRole` output for user actions, events, results, reference dates, internal processes, and conditional follow-ups;
- added candidate audit fields for temporal mention, bound fact, and semantic classification without changing Policy.15 IDs or feed decisions;
- added an S23 layer-only audit CLI and 11 binding/semantic regression tests;
- added `PROJECT_PHASE_ROADMAP.md` and `ROADMAP_STATUS.json`, to be updated in every subsequent package;
- retained pipeline `0.1.14` and Policy.15 baseline semantic projection; total suite is 177 tests.

## policy.15-foundation.1 — 2026-07-12

- Completed S20 by embedding the verified Policy.15 2,059-notice baseline, eight key artifacts, SHA-256 manifest, semantic hashes, and 11 critical regression cases.
- Added a semantic baseline comparator that ignores only generated timestamps, absolute local paths, and ICS `DTSTAMP`, while keeping candidate IDs, decisions, semantic fields, intervals, and ICS event identities strict.
- Added an explicit allowlist contract for reviewed refactor differences.
- Completed S21 by defining immutable contracts for structure, temporal mentions, local binding, semantic classification, applicability, publishability, semantic candidates, and ordered judgment traces.
- Added JSON Schema documents for the S21 domain contracts.
- Added a read-only Policy.15 compatibility adapter that preserves current output and leaves `temporalRole` as `unknown`.
- Added a standalone exporter and verified compatibility traces for all 909 publishable baseline candidates.
- Kept the runtime policy pipeline unchanged at `0.1.14`; no new semantic rules or feed changes are wired in.
- Expanded the complete test suite from 143 to 156 tests.

## observation.3-policy.15 — 2026-07-12

- Classified explicit target/permission/confirmation notifications as result announcements rather than exams or application periods.
- Added `course_evaluation` as a stable academic action and separated course-evaluation periods from exams.
- Classified exact learning, practicum, facility-use, and operational periods as events while keeping vague-ended activity periods review-only.
- Sent refund/return schedules, scholarship deposits, and payment reference dates to review as non-user actions.
- Expanded conditional-status participant handling for additional-confirmed, registered, and payment-hold cohorts.
- Suppressed title-only timetable reference dates and consolidated title/body boundary duplicates.
- Sent internal document evaluation/selection points to review without affecting genuine application periods containing document screening text.
- Preserved actionable course-registration cancellation windows even when refund consequences are described nearby.
- Added `POLICY_0_1_13_CORPUS_DIAGNOSIS.md` and expanded deterministic policy coverage to 143 tests.

## observation.3-policy.14 — 2026-07-12

- Treated new numbered or lettered semantic items as continuation ownership boundaries.
- Separated recruitment attributes such as target/headcount from application-period labels.
- Added local result, exam/interview, and activity labels to prevent inherited action leakage.
- Sent payment/disbursement reference dates and readmission-admittee follow-up actions to review.
- Retained bounded academic table reconstruction and expanded deterministic policy coverage to 126 tests.

## observation.3-policy.13 — 2026-07-12

- Upgraded structured schedule segments to `noticepilot.scheduleSegments.v0.2`.
- Reconstructed bounded `table_row` segments from flattened leave/return application tables and course-registration cohort tables.
- Restored quoted/backtick short-year ranges and compact Korean weekday suffix ranges without broadening generic date matching.
- Prevented action words such as `수강신청 변경` from being discarded as document-revision metadata.
- Required course-registration cohort applicability to be owned by the same local segment or an explicit course-registration title.
- Suppressed redundant generic deadline/event candidates when a locally typed academic action exists at the same timestamp.
- Preserved per-segment audit metadata and review-only handling for unsupported or weakly grounded table layouts.
- Added `POLICY_0_1_11_CORPUS_DIAGNOSIS.md` and expanded deterministic policy coverage to 119 tests.

## observation.3-policy.12 — 2026-07-12

- Added `noticepilot.scheduleSegments.v0.1` as the structure-aware intermediate representation.
- Removed overlapping two-line and three-line regex windows from policy extraction.
- Split title, paragraph, list-item, label-value, table-row, and constrained continuation units.
- Bound dates to the nearest local action label before event/action classification.
- Split multiple labelled schedules on one physical line without splitting dotted dates as list markers.
- Added `sourceSegment` audit metadata to calendar candidates and upgraded candidate schema to `noticepilot.calendarCandidates.v0.7`.
- Added per-notice `derived/.../segments/*.segments.json` outputs and structured-segment summary metrics.
- Added `action_label_not_locally_grounded` as the deterministic review/AI handoff boundary.
- Retained policy.11 academic applicability, board 716, date-integrity, and ICS contracts.
- Added `POLICY_0_1_10_STRUCTURED_SEGMENT_ARCHITECTURE.md` and expanded deterministic policy coverage to 110 tests.

## observation.3-policy.11 — 2026-07-12

- Hardened leave/return detection so `휴학생`, exclusion clauses, and `재/휴학 증명서` cannot become leave-application actions.
- Excluded `학년도` digits from student-year extraction, preventing `2026학년도` from becoming a false `6학년` scope.
- Made the action label nearest each date authoritative; notice titles no longer relabel tuition, class, refund, result, or submission dates.
- Tightened readmission actions to explicit local `재입학 신청/지원서 접수` phrases.
- Limited `audienceRules` personalization to reviewed academic action types; generic scholarships, programs, events, and job postings remain unrestricted.
- Consolidated scoped academic candidates over their unscoped duplicates while preserving distinct year cohorts.
- Added `POLICY_0_1_9_CORPUS_DIAGNOSIS.md` and expanded deterministic policy coverage to 100 tests.

## observation.3-policy.10 — 2026-07-11

- Added stable academic `actionType` values for leave, return, and course-registration workflows.
- Preserved leave-of-absence and return-from-leave windows as `academic_period` candidates even when tuition wording appears nearby.
- Split a shared leave/return period into two action candidates with enrollment-status applicability.
- Added `audienceRules` for degree level, student year, enrollment status, and admission type.
- Split deterministic year-specific course-registration schedules into separate candidates.
- Prevented consolidation across different action types or applicability rules.
- Added deterministic subscription-profile matching semantics without filtering the generic preview feed.
- Added action/applicability summary counts and upgraded the candidate document schema to `noticepilot.calendarCandidates.v0.6`.
- Added `POLICY_0_1_8_ACADEMIC_APPLICABILITY_UPDATE.md` and expanded deterministic policy coverage to 87 tests.

## observation.3-policy.9 — 2026-07-11

- Rejected decimal scores, malformed grade-table values, and named historical dates that resemble month/day tokens.
- Sent slash-separated or middle-dot-separated independent dates to review instead of publishing only the first occurrence.
- Sent non-action reference dates such as term-end references, document release/share dates, grade-transmission dates, and eligibility ceremony dates to review.
- Kept future result announcements publishable while sending selected-participant-only orientation, registration, education, and follow-up submission actions to review.
- Classified exact activity periods as events rather than application periods.
- Sent partially specified activity periods such as `2026.4월 초 ~ 2027.2.12.` or `선발일 ~ 2027.8.31.` to review.
- Added `POLICY_0_1_7_CORPUS_DIAGNOSIS.md` and expanded deterministic policy coverage to 76 tests.

## observation.3-policy.8 — 2026-07-11

- Fixed truncated weekday detection when the weekday character is present or later text is joined into the extraction window.
- Rejected bare yearless hyphen project/section codes such as `4-3` unless an immediate calendar cue exists.
- Sent start-only first-come application periods to review instead of converting the opening date into a deadline.
- Excluded explicit vendor/contractor recruitment from the student feed.
- Sent recommending-institution deadlines and selected-participant-only follow-up actions to review.
- Overrode conflicting list campus metadata when the KNU campus is explicit in the source title.
- Added `POLICY_0_1_6_CORPUS_DIAGNOSIS.md` and expanded deterministic policy coverage to 64 tests.

## observation.3-policy.7 — 2026-07-11

- Rejected reference, eligibility, revision, and update dates that still entered the student feed.
- Preserved same-month ranges whose end omits the month, including timed final boundaries.
- Accepted full-width Korean weekday parentheses in multi-day timed ranges.
- Sent comma-separated discrete schedules and date windows with recurring daily hours to review instead of publishing only the first occurrence.
- Sent truncated date fragments ending in an unmatched weekday parenthesis to review.
- Excluded general-public education and practicum-host/company recruitment from the student-first feed.
- Rejected hyphenated course-credit notation such as `3-3-0` as non-date data.
- Expanded completed approval-list detection and improved nearest-date briefing/result labels.
- Added `POLICY_0_1_5_CORPUS_DIAGNOSIS.md` and expanded deterministic policy coverage to 57 tests.

## observation.3-policy.6 — 2026-07-11

- Fixed omitted range-end year inheritance: the end now inherits the range-start year and rolls only when crossing New Year.
- Prevented a clock written after the second date from leaking backward to the first date in multi-day ranges.
- Preserved mixed date/timed-deadline periods by normalizing the start to local midnight and retaining the exact end time.
- Excluded completed-result notices from the broad student feed; explicit selected-participant follow-up actions are retained as review-only.
- Consolidated redundant same-action boundary candidates and demoted conflicting same-action dates for review.
- Rejected revision timestamps, eligibility reference dates, and internal selection/assessment periods as non-action dates.
- Added `POLICY_0_1_4_CORPUS_DIAGNOSIS.md` and expanded deterministic policy coverage to 45 tests.

## observation.3-policy.5 — 2026-07-11

- Fixed `24:00` / `24시` parsing so the trailing `4:00` substring cannot become a false 04:00 timestamp.
- Preserved the end time of same-day clock ranges such as `14:00~17:00` and `14시~15시`.
- Consolidated same-notice, same-event-type all-day candidates when a more precise timed candidate exists on the same calendar date.
- Demoted department-to-central-office forwarding deadlines from the student feed while preserving the student's own submission deadline.
- Refined event type from the action label nearest the matched date, including future result announcements and event labels with punctuation or spaced `일 시`.
- Included publishable notices with embedded review-only candidates in `review-queue.jsonl`.
- Added `POLICY_0_1_3_CORPUS_DIAGNOSIS.md` and expanded regression coverage to 36 tests.

## observation.3-policy.4 — 2026-07-11

- Rejected attachment numbering and school-year text that resembled dates.
- Suppressed qualification/birth-date ranges and schedules already ended before publication.
- Refined event types around the matched date.
- Consolidated exact same-datetime candidates.

## observation.3-policy.3 — 2026-07-11

- Rejected fraction-like values such as `등록금의 1/6` and `졸업학점의 1/6까지` as non-date numeric expressions.
- Rejected score-like values such as `IELTS 6.5+` and numbered headings that resemble month/day tokens.
- Restricted date ranges to directly connected adjacent date tokens.
- Failed closed when one extraction segment contains a date range plus an additional independent date or multiple ranges.
- Added a final candidate-integrity pass that demotes reversed or malformed ranges before feed files are written.
- Added `reports/candidate-integrity.json`.
- Added regression tests covering the production failure from `knu-720-2483` and the wider reversed-range class.

## observation.3-policy.2 — 2026-07-11

- Fixed a corpus-wide crash when an inferred date token was not a real calendar date, such as `2월 31일`.
- Invalid date tokens now fail closed instead of allowing a malformed range such as `2.1~2.31` to become a false single-day candidate.
- Notices with action intent but only invalid dates are retained as `needs_review` with `unresolved_action_date`.
- Added regression coverage for inferred invalid dates, malformed ranges, and valid leap days.

# CHANGELOG

## v0.4.4-observation.3

### Fixed
- Corrected board 716 list semantics: `접수기간` is no longer treated as `publishedAt`.
- Preserved board 716 result/interview/final-announcement rows whose list period is only `~`.
- Added detail-page `등록일` extraction as the canonical publication date for board 716.
- Deferred board 716 date-range filtering until detail retrieval.
- Added a two-page application-period lower-bound guard for board 716 pagination.

### Added
- Added `application_period_start` and `application_period_end` list metadata.
- Added `--refresh-boards` so a resumed corpus can selectively re-fetch board 716.
- Added `detailOutOfRangeCount` diagnostics.
- Added offline regression checks for board 716 list and detail date handling.


## v0.4.4-observation.1

### Added
- Added `knu_observation_collector.py` as a research-only execution path.
- Added named `runtime` and `observation-2026` collection profiles.
- Added inclusive date-range pagination with pinned-row-safe cutoff logic.
- Added resumable detail collection and JSONL/TSV observation indexes.
- Added deterministic revision, cancellation, additional-recruitment, date-expression, and attachment-reference flags.
- Added selective attachment decisions and a second pass for exact-title duplicate suspects.
- Added local-only corpus output directories to `.gitignore`.

### Scope
- Runtime collection remains limited to boards 720 and 721.
- The observation profile covers boards 504, 715, 716, 717, 719, 720, and 721 for 2026-01-01 through 2026-07-11.
- This add-on does not implement promotion, reconciliation, hosted feeds, or production ICS publication.

## v0.4.4

### Added
- Added `configs/knu_feed_profiles.v0.4.4.json` with campus feed profile presets:
  - `knu-chuncheon`
  - `knu-samcheok`
  - `knu-dogye`
  - `knu-gangneung-wonju`
- Added exporter profile options:
  - `--profile <profileId>`
  - `--profiles-config <path>`
  - `--list-profiles`
  - `--export-all-profiles`
- Added `feedProfile` metadata to `ics_export_report.json`.
- Added `campusSummary` to `candidate_extraction_report.json`.

### Changed
- Exporter can now use profile presets instead of manually passing `--campuses`, `--calendar-name`, and include flags.
- Batch profile export writes one `.ics` output directory per profile.

### Notes
- This is a crawler/exporter-side update only. It does not implement frontend campus selection UI.

## v0.4.3

### Added
- Added campus taxonomy for KNU notice applicability:
  - `chuncheon` = 춘천
  - `samcheok` = 삼척
  - `dogye` = 도계
  - `gangneung_wonju` = 강릉원주
  - `all` = 전체
  - `unknown` = 불명확
- Added `campusScope` to normalized notice JSON.
- Propagated `campusScope` into calendar candidate JSON.
- Added campus-aware ICS export filters:
  - `--campuses samcheok`
  - `--include-all-campus`
  - `--include-unknown-campus`
- Added report fields:
  - `campusFilterActive`
  - `feedCampuses`
  - `feedCampusLabels`
  - `includeAllCampus`
  - `includeUnknownCampus`
  - `campusFilteredCount`
- Added `X-NOTICEPILOT-CAMPUS-SCOPE` to exported VEVENTs.

### Changed
- `noticepilot_ics_exporter.py` can now generate campus-specific calendars from the same candidate directory.
- `DESCRIPTION` includes campus labels when the candidate has a known campus scope.
- KNU list `campus` metadata is treated as the default applicability source with medium confidence.

### Notes
- `campusScope` is an applicability hint, not final eligibility proof.
- Current inference is conservative: office names in the body, such as `삼척교육지원과`, are not treated as high-confidence user applicability unless an explicit campus wording such as `삼척캠퍼스` appears.
- Future versions should add department/college/major filters separately from campus filters.

## v0.4.2
- Switched timed ICS events from UTC `Z` lines to `TZID=Asia/Seoul`.
- Added `VTIMEZONE:Asia/Seoul`.
- Added `TRANSP:TRANSPARENT` for non-blocking deadline events.

## v0.4.1
- Fixed empty ICS success when no `*.candidates.json` files were found.
- Added input candidate file count and file list to export report.

## v0.4.0
- Added static `.ics` export from calendar candidate JSON.

## v0.4.4-observation.2

- fixed date-bounded collection for KNU board layout variants
- added alternate header aliases and row-level date scanning
- restricted detail-link parsing to the requested board ID
- added metadata-enriched fallback parsing for card/list layouts
- fail closed with `undated_list_metadata` instead of traversing an archive without dates
- preserved campus/college qualifiers in duplicate-title identity
- narrowed revision detection and separated event cancellation from user withdrawal actions
- added offline regression cases for alternate table layouts and flag false positives

## observation.3-policy.1 — 2026-07-11

- Added deterministic `noticepilot_mvp_policy_pipeline.py`.
- Added confirmed student-first MVP policy configuration.
- Split publishable output into `student_default` and `job_application` feeds.
- Added board 716 application-period-only policy using list metadata.
- Added explicit date-range preservation and deterministic publication-relative date calculations.
- Added `publishable`, `needs_review`, and `not_calendar_relevant` decisions.
- Added review queue, policy summary, board TSV, and feed-scoped candidate outputs.
- Updated ICS export to convert inclusive all-day end dates to exclusive RFC 5545 `DTEND`.
- Added one-command local runner and 11 policy/ICS regression tests.

## 0.4.4-observation.3-policy.15-foundation.2 — S22

- extracted active deterministic date/time parsing into `noticepilot_temporal_parser.py`;
- extracted active structured schedule segmentation into `noticepilot_structure_analyzer.py`;
- wired both modules through the Policy.15 composition root while preserving existing function APIs;
- removed the former duplicate in-file structure/temporal implementations;
- added S21 `TemporalMention` projection and a layer-only audit export CLI;
- added nine S22 contract and compatibility tests;
- retained pipeline `0.1.14`, candidate schemas, baseline files, feed decisions, and ICS behavior unchanged.

## 0.4.4-observation.3-policy.15-foundation.12 — S27-A diagnostic gate

- Added draft CalendarEvent reconciliation schemas and relation vocabulary.
- Diagnosed all 909 publishable candidates into high/medium-signal cross-notice pairs and clusters without assigning relations.
- Added three stable CalendarEventId strategy drafts; no ID was assigned.
- Added explicit fail-closed policy and an eight-item creator decision queue.
- Verified layered baseline `match / 0`, 909 candidate UID compatibility, and unchanged 609/300 ICS events.
- Marked S27-A `awaiting_creator_decision`; S27-B remains blocked until product-owner approval.

## 0.4.4-observation.3-policy.15-foundation.13 — S27-A creator decisions

- Recorded creator decisions D1–D8 in a machine-readable reconciliation policy.
- Selected `registry_assigned_opaque_v0` without issuing any IDs.
- Approved strict cross-board duplicate, extension, campus-disjoint, pairwise-cluster, and one-active-ICS rules.
- Kept automatic revision disabled and marker-only relations forbidden.
- Added source-URL / configured-board precedence with no implicit fallback; missing board priority remains `needs_review`.
- Preserved all runtime candidates, existing candidate UIDs, ICS output, and layered baseline `match / 0`.

## 0.4.4-observation.3-policy.15-foundation.17

- completed S27-D persistent CalendarEvent ICS projection;
- migrated 900 active event identities to opaque event-owned ICS UIDs;
- consumed 900 S27-C projection intents through an immutable receipt ledger;
- collapsed eight duplicate pairs and one superseded extension revision in feed output;
- generated student and job feeds with 601 and 299 VEVENTs respectively;
- preserved all 909 source links across persistent VEVENTs;
- omitted DTEND for 155 timed events without a normalized end;
- preserved legacy candidate-UID ICS artifacts unchanged under pre-subscription cutover;
- added S27-D schemas, builder, audit, tests, and documentation.

## 0.4.4-observation.3-policy.15-foundation.19 — S28-2 creator-decision gate

- added the authoritative `FeedEligibilityInputView` join over 900 active events, 909 source links, and S24 publishability judgments;
- added a deterministic one-event eligibility evaluator and ordered inclusion/exclusion reason vocabulary;
- added strict input-view and decision JSON schemas;
- added corpus diagnostics for unknown campus, cross-post source matching, review aggregation, and academic audience scoping;
- recorded five unresolved creator decisions without inventing product defaults;
- kept S28-3 FeedBuilder blocked and did not create feed snapshots or mutate S27 registry/ICS artifacts.


## 0.4.4-observation.3-policy.15-foundation.20 — S28-2 decisions completed

- approved `noticepilot.feedEligibilityPolicy.v0.2`;
- selected canonical-source-only board matching and canonical-candidate review aggregation;
- inherited the authoritative default of including unknown-campus notices;
- inherited review-required inclusion only when a valid normalized date exists;
- selected audience-unscoped inclusion;
- added temporal validity to `FeedEligibilityInputView.v0.2` and the `invalid_normalized_date` exclusion reason;
- marked S28-2 completed and S28-3 ready;
- preserved S27 registry, projection, and ICS artifacts unchanged.

## foundation.22 — 2026-07-13

- Completed S28-4 immutable `SubscriptionFeedSnapshot` contract.
- Added content-addressed snapshot ID/hash using canonical semantic JSON.
- Added profile, event-membership, FeedBuildResult, and decision-ledger integrity hashes.
- Added atomic `snapshots/s28-v1` reference snapshot set and manifest.
- Materialized student `601` and job `299` snapshots with zero overlap and 900-event union.
- Preserved S27-C/S27-D artifacts and deferred URL/token, ICS delivery, and persistence to S29.
- Marked S28-5 profile-matrix full-corpus audit ready.

## foundation.23 — 2026-07-13

- Completed S28-5 profile matrix and full-corpus feed audit.
- Added 44 explicit audit-only SubscriptionProfile cases covering reference, campus, policy toggle, audience, status, canonical-board, and event-type dimensions.
- Evaluated all 900 active events for every case, producing 39,600 deterministic eligibility decisions.
- Verified exact 601/299 reference parity with S28-4 snapshots, canonical-board partition, event-type partition, campus subset invariants, and audience monotonicity.
- Preserved S27 registry/projection, S27-D ICS, S28-3 build artifacts, and S28-4 snapshots without mutation.
- Marked S28 complete and S29 PostgreSQL/incremental runtime ready.

## foundation.24.1 — S29 live PostgreSQL migration runner hotfix

- Fixed identical migration rerun incorrectly re-executing DDL and raising `DuplicateTable`.
- Migration DDL and checksum registration are now one runner-owned transaction.
- Added advisory locking, checksum skip/conflict handling, and untracked-schema fail-closed behavior.

## foundation.24.2 — S29 live PostgreSQL verification toolkit

- Added a non-destructive live PostgreSQL verifier for CHECK, UNIQUE, FOREIGN KEY, partial unique-index, transaction rollback, and advisory-lock behavior.
- Added immutable bootstrap-count and migration-rerun checks against the live database.
- Added a final residue scan; a passing run commits no probe rows.
- Recorded the user-observed successful live migration/bootstrap and zero-insert identical rerun without treating it as the remaining constraint/rollback verification.
- Kept S30 blocked until `live-postgres-verification.json` reports `status=pass`.


## foundation.24.3 — S29 live PostgreSQL evidence registration

- Registered `runtime/s29-v1/live-postgres-verification.json` as the immutable completion evidence for S29.
- Recorded semantic report SHA-256 `eb66e820ac8885296a4389889519fe78a53a22d7eb814625dafe391f1a3dddbf` and packaged file SHA-256 `8eecf611b93725372cafd5adfbef05717c0b66c5d9ae3b314233a7222a55d36d`.
- Marked S29 and S29-LIVE-POSTGRES-VERIFY completed in the roadmap and machine-readable status.
- Updated the S29 runtime manifest to record live PostgreSQL execution, 13 passing checks, zero probe residue, and no committed mutations.
- Updated the version manifest and unblocked S30 Samsung Calendar subscription QA.

## foundation.25 — S30 automated Samsung Calendar subscription QA

- Started S30 from the immutable foundation.24.3 S29 completion baseline.
- Added strict RFC 5545/HTTP audits for the 601-event student and 299-event job subscription feeds.
- Added stable-UID `initial → updated → cancelled` lifecycle fixtures and a same-URL local QA server with ETag/304 behavior.
- Added a physical Samsung Calendar result schema, template, validator, and request log path.
- Defined static `.ics` import as insufficient subscription evidence.
- Completed S30-A and left S30-B `awaiting_physical_device`; S30 remains in progress.
- Automated report semantic SHA-256: `cf7ff5ca03eca3ed5e210930c31384901258b45bb67d54a9d1beb577f37f9727`.
- Recorded module-isolated regression `428/428 pass` across 30 test modules and layered baseline `match / 0`.

## foundation.25.1 — S24-A segment summary repair release candidate

- Reused one deterministic summary helper in the runtime and board-716 migration paths.
- Corrected stale `typeCounts` in exactly 300 of 2,059 schedule-segment documents without changing segments or non-derived fields.
- Added a fail-closed summary-only repair tool with byte-idempotent reapplication.
- Replaced destructive, filesystem-dependent ZIP packaging with a deterministic packager and archive/source-aware validator.
- Fixed the release timestamp at `2026-07-14T00:00:00Z` (`SOURCE_DATE_EPOCH=1783987200`).
- Kept Foundation.25, Policy.15, and the layered baseline immutable.
- Identified this package only as a release candidate; verification authority, candidate SHA, promotion eligibility, and Git migration remain external to package metadata.
