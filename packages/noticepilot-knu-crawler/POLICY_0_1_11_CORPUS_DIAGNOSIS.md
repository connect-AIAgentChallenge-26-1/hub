# Policy 0.1.11 corpus diagnosis and Policy.13 correction

Package under diagnosis: `noticepilot-knu-crawler-v0.4.4-observation.3-policy.12`  
Observed pipeline: `0.1.11`  
Correction package: `noticepilot-knu-crawler-v0.4.4-observation.3-policy.13`  
Corrected pipeline: `0.1.12`

## 1. Policy.12 full-run baseline

The immutable 2026 observation dataset completed without transport or chronology failures:

- indexed and processed notices: 2,059 / 2,059;
- missing normalized notices: 0;
- invalid date-order demotions: 0;
- student feed candidates: 620;
- board 716 job-application feed candidates: 300;
- structured-segment candidates: 1,004;
- locally grounded candidates: 928.

The student and job ICS files matched their export reports. Candidate IDs and UIDs were unique, RFC 5545 line folding remained within 75 octets, and no reversed interval entered either feed.

## 2. Corpus defect: declared table support produced no table rows

The uploaded `segments.zip` contained one segment document for each of the 2,059 notices. Aggregate segment inspection produced many paragraphs, label/value units, list items, titles, and continuations, but **zero `table_row` segments**.

The normalized source text had already flattened important tables into adjacent cells. Policy.12 preserved those cells but did not reconstruct row ownership, so local semantic binding failed in precisely the schedules that motivated academic personalization.

### 2.1 Leave and return application notice

`knu-720-2465` contains two leave windows and two return windows. Policy.12 auto-published only the two leave windows. The return dates followed standalone `복학`, `《1차》`, and `《2차》` cells and therefore remained locally ungrounded.

### 2.2 Course-registration cohort table

`knu-720-2352` contains flattened cells equivalent to:

- `1·4` → `2.20.(금) 10:00~13:00`;
- `2·3` → `2.20.(금) 14:00~17:00`;
- `전체` → `2.21.(토) 10:00 ~ 2.25.(수) 18:00`.

Policy.12 produced no student-year-scoped candidate from this notice. The full-run summary consequently reported `studentYearScopedCandidateCount: 0`.

## 3. Additional local-ownership and date-range defects

- A transfer-student orientation notice was also labelled as course registration because `수강신청 지도` appeared elsewhere in the notice.
- Four same-notice, same-timestamp groups retained both a typed academic action and a generic deadline/event candidate.
- Quoted/backtick short-year end dates were omitted in ranges such as `'26.5.22 ~ '26.6.22`.
- Compact weekday suffixes such as `3.2.월~3.12.목` interrupted range recognition.
- `수강신청 변경:` could be interpreted as revision metadata, causing the first boundary to be dropped.

## 4. Policy.13 correction boundary

Policy.13 does not return to broad sliding windows and does not attempt general table inference. It introduces bounded reconstruction only where local structural evidence is explicit.

### 4.1 Flattened leave/return rows

A `table_row` is reconstructed only when an exact leave/return section owner and a nearby deterministic date cell are present. Reconstructed candidates preserve the section owner in `sourceSegment`.

### 4.2 Flattened course-registration cohort rows

Reconstruction requires local course-registration context plus cohort/header evidence. Cells such as `1·4`, `2·3`, and `전체` become explicit `studentYears` applicability. Distant occurrences of `수강신청` cannot relabel orientation or other event dates.

### 4.3 Range and reconciliation corrections

- normalize quoted/backtick short-year ranges;
- normalize compact weekday suffix connectors;
- distinguish action label `수강신청 변경` from document-revision metadata;
- suppress generic same-time duplicates beneath a typed local academic action.

## 5. Deterministic verification before packaging

Policy.13 passes 118 policy and regression tests. Targeted reconstruction tests verify:

- two leave and two return periods from a flattened academic table;
- distinct `1·4`, `2·3`, and all-year course-registration rows;
- no course-registration leakage into transfer-student orientation;
- restoration of compact and short-year date ranges;
- consolidation of redundant generic candidates.

The full 2,059-notice Policy.13 result must still be generated locally. Expected acceptance signals are:

- board 716 job feed remains 300;
- `table_row` source-segment count becomes non-zero;
- return-from-leave candidates reappear for `knu-720-2465`;
- student-year-scoped candidates become non-zero for `knu-720-2352`;
- the known same-time typed/generic duplicate groups disappear;
- candidate chronology remains clean.
