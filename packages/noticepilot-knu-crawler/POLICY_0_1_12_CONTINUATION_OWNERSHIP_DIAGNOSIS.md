# Policy 0.1.12 corpus diagnosis and Policy.14 correction

Package under diagnosis: `noticepilot-knu-crawler-v0.4.4-observation.3-policy.13`  
Observed pipeline: `0.1.12`  
Correction package: `noticepilot-knu-crawler-v0.4.4-observation.3-policy.14`  
Corrected pipeline: `0.1.13`

## 1. Policy.13 acceptance signals

The full immutable observation dataset completed successfully:

- indexed / processed notices: 2,059 / 2,059;
- missing normalized notices: 0;
- invalid date-order demotions: 0;
- student feed: 623;
- board 716 job feed: 300;
- `table_row` candidate count: 8;
- return-from-leave candidates: 2;
- student-year-scoped candidates: 4.

Policy.13 therefore fixed the Policy.12 table-reconstruction defects. Student and job ICS exports matched their reports, had no skipped events, used unique candidate IDs/UIDs, and preserved RFC 5545 line folding.

## 2. Residual continuation-ownership defects

A second corpus pass found that adjacency could still override explicit item structure. Confirmed examples included:

- `knu-721-2396`: `우선추천대상자 안내` became an application deadline because it followed `신청 방법`;
- `knu-721-2429` and `knu-721-2408`: `지급일자` became a submission deadline because it followed a modification instruction;
- `knu-504-10777`: `1차 선발확정` became an application period because it followed `모집대상`;
- `knu-504-10769`: `코딩테스트` became a submission period because it followed a document-submission item;
- `knu-504-10976`: `실습기간` became an application period because it followed `모집대상`;
- `knu-721-2409`: `탐방일정 및 모집인원` was treated as an application period;
- `knu-720-2423`: `폐강과목 확정` inherited a payment label from the preceding closure criterion;
- `knu-720-2343`: registration and course-registration dates for explicit `재입학 허가자` entered the broad student feed.

These are structural ownership errors, not date-token errors.

## 3. Policy.14 boundary

Policy.14 does not add broad sliding windows or general table inference. It makes the following bounded changes:

1. A new numbered/lettered item with its own semantic label cannot inherit the previous item’s action. Generic temporal cells such as `2. 일시` may still be owned by an explicit event-name item.
2. `모집대상`, `모집인원`, and `모집정원` are treated as attributes, not application-period labels.
3. Local labels map deterministically: recommendation/selection/final/closure confirmation to results; coding tests to exam/interview; practicum/trip periods to events.
4. `지급일자` remains review-only as a non-action reference date.
5. Explicit `재입학 허가자` follow-up schedules remain review-only.

## 4. Verification before packaging

- policy and regression tests: 126 / 126;
- Python compilation: pass;
- legacy crawler/detail/candidate/ICS/collector offline checks: pass;
- synthetic end-to-end pipeline: pass (9 notices, student feed 9, job feed 1, skipped ICS events 0);
- full 2,059-notice Policy.14 run: must be performed locally against the immutable observation dataset.
