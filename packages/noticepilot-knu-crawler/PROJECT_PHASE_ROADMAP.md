# NoticePilot 판단 엔진 및 구독형 ICS 로드맵

마지막 갱신: 2026-07-14  
현재 패키지 후보: `0.4.4-observation.3-policy.15-foundation.25.1`  
release stage: `release_candidate` — 공식 승격 및 Git 이식 미수행

이 문서는 이후 모든 전달 ZIP에 포함하고, 단계 완료 시 상태와 완료 근거를 갱신한다.

## 상태 표기

- `[x]` 완료: 코드·계약·테스트·패키지 검증 완료
- `[~]` 진행 중: 구현 중이거나 실데이터 재검증 대기
- `[ ]` 예정: 아직 착수하지 않음
- `[-]` 보류: 선행 단계 완료 전 진행하지 않음

## S24A-repair — segment summary 교정 release candidate

- S7: runtime과 migration이 공유하는 segment summary helper 보강 완료
- S8: 2,059개 문서 중 stale `typeCounts` 300개 교정, 재적용 변경 0
- S9-B: 동일 pinned Python/zlib toolchain 범위의 deterministic packager·validator 완료
- candidate version: `foundation.25.1`
- release timestamp: `2026-07-14T00:00:00Z`
- candidate 검증과 승격 적격 판정 권위: 외부 S9-C 실행 evidence
- 내부 metadata는 `release_candidate`만 선언하며 verified·eligible 상태를 선언하지 않음
- 기존 Foundation.25 ZIP과 Policy.15/layered baseline 보존

## Phase 1 — Policy.15 기준선과 계층형 판단 엔진

### [x] S20. Policy.15 baseline fixture

완료 내용:

- 검증된 2,059건 Policy.15 산출물 8종 고정
- 파일 SHA-256 및 semantic hash 기록
- 중요 회귀 notice 11건 fixture 고정
- baseline semantic comparator 및 allowlist 계약 추가

완료 근거:

- Policy.15 baseline self-diff `changeCount: 0`
- `S20_POLICY15_BASELINE.md`

### [x] S21. Judgment model contract

완료 내용:

- `ScheduleSegment`, `TemporalMention`, `BoundTemporalFact`
- `SemanticClassification`, `ApplicabilityJudgment`
- `PublishabilityJudgment`, `JudgmentTrace`
- immutable dataclass와 JSON Schema 정의

완료 근거:

- 909개 publishable candidate legacy trace 변환 성공
- `S21_JUDGMENT_MODEL_CONTRACT.md`

### [x] S22. StructureAnalyzer / TemporalParser 분리

완료 내용:

- 구조 복원 로직을 `noticepilot_structure_analyzer.py`로 추출
- 날짜·시간 해석을 `noticepilot_temporal_parser.py`로 추출
- 기존 인파일 중복 구현 제거
- 구조·시간 전용 감사 CLI 추가

완료 근거:

- 로컬 전체 corpus 기준 baseline semantic diff `changeCount: 0` 확인됨
- `S22_STRUCTURE_TEMPORAL_EXTRACTION.md`

### [x] S23. LocalBinder / SemanticClassifier 분리

완료 내용:

- `noticepilot_local_binder.py` 추가
- `noticepilot_semantic_classifier.py` 추가
- 런타임 후보에 `temporalMention`, `boundTemporalFact`, `semanticClassification`, `temporalRole` 기록
- `temporalRole` 실제 판정 도입
- binding·semantic 전용 감사 CLI 추가

현재 역할:

```text
StructureAnalyzer
→ TemporalParser
→ LocalBinder
→ SemanticClassifier
→ 기존 Policy.15 applicability/publishability/reconciliation
```

완료 근거:

- 전체 테스트 `177/177`
- 기존 baseline comparator projection 기준 의미 변경 없음
- `S23_LOCAL_BINDING_SEMANTIC_CLASSIFICATION.md`

### [x] S24. ApplicabilityEvaluator / PublishabilityEvaluator 분리

#### [x] S24-A. Board 716 list-metadata trace adaptation

완료 내용:

- board 716의 정확한 목록 `접수기간` metadata를 `label_value` 구조 세그먼트로 투영
- 300개 채용 후보에 `TemporalMention → BoundTemporalFact → SemanticClassification` trace 연결
- 본문 추출과 구분되는 binding/semantic rule ID 기록
- candidate ID, 게시 판정, feed, 캠퍼스, reason code, ICS 보존

완료 근거:

- 전체 후보 `1,304 / 1,304` complete layered trace
- board 716 trace `300 / 300`
- legacy candidate projection mismatch `0`
- review queue 및 student/job ICS diff `0`
- 전체 테스트 `185/185`
- `S24_BOARD716_LIST_METADATA_TRACE_ADAPTATION.md`

#### [x] S24-B. ApplicabilityEvaluator 추출

완료 내용:

- `noticepilot_applicability_evaluator.py` 추가
- `targetActor`, `audienceRules`, profile scope 및 conditional applicability 소유권 분리
- 기존 `infer_audience`, `build_audience_rules`, profile matcher API를 compatibility wrapper로 유지
- runtime candidate의 기존 projection은 evaluator 결과에서 생성
- `applicabilityJudgment` 직렬화는 S24-D에서 완료

완료 근거:

- 전체 후보 `1,304 / 1,304` ApplicabilityJudgment 재구성
- compatibility projection mismatch `0`
- scope: unrestricted `990`, unknown `282`, profile_scoped `12`, conditional `20`
- publishable/review queue 및 student/job ICS diff `0`
- 전체 테스트 `196/196`
- `S24_APPLICABILITY_EVALUATOR.md`

#### [x] S24-C. PublishabilityEvaluator 추출

완료 내용:

- `noticepilot_publishability_evaluator.py` 추가
- `status`, `includeInCalendarFeed`, `feedScopes`, 게시 reason/rule ID 소유권 분리
- `temporalRole`, determinism, chronology를 명시적 게시 판단 입력으로 사용
- 기존 candidate projection과 publishable/review/ICS 결과 보존
- `publishabilityJudgment` 직렬화는 S24-D에서 완료

완료 근거:

- 전체 후보 `1,304 / 1,304` PublishabilityJudgment 재구성
- compatibility projection mismatch `0`
- verdict: auto_confirmed `909`, needs_review `395`
- temporal-role guard 대상 `90`, chronology/determinism 오류 `0`
- publishable/review queue 및 student/job ICS diff `0`
- 전체 테스트 `208/208`
- `S24_PUBLISHABILITY_EVALUATOR.md`

#### [x] S24-D. Runtime wiring / layer audit

완료 내용:

- `ApplicabilityJudgment`, `PublishabilityJudgment`를 runtime candidate에 연결
- 후보 생성, review demotion, 통합 후 최종 synchronization 수행
- 기존 projection과 신규 판단 객체의 전수 정합성 및 멱등성 검사
- decision/publishable/review/candidate document 간 judgment 일치 검증

완료 근거:

- runtime judgment `1,304 / 1,304`
- contract/reconstruction/cross-artifact mismatch `0`
- candidate document occurrence `2,213 / 2,213` wired
- publishable/review 및 student/job ICS diff `0`
- `S24_RUNTIME_JUDGMENT_WIRING.md`

### [x] S25. Intra-notice CandidateReconciler 분리

완료 내용:

- `noticepilot_candidate_reconciler.py` 추가
- 동일 timestamp 중복, generic/typed 후보, scoped/unscoped 후보 통합 소유권 분리
- all-day/timed 정밀도 우선 및 same-action range boundary 처리 분리
- 진짜 same-action 날짜 충돌은 review로 demotion하고 runtime judgment 재동기화
- 서로 다른 action과 명시적 cohort는 보존
- 기존 세 reconciliation helper는 compatibility wrapper로 유지

완료 근거:

- 전체 후보 `1,304 / 1,304` second-pass identity 보존
- second-pass 제거 `0`, ID/order/projection/object mismatch `0`
- 기존 충돌 공지 `9`건 재감지, 추가 상태 변경 `0`
- publishable/review queue 및 student/job ICS diff `0`
- `S25_CANDIDATE_RECONCILER.md`

### [x] S26. Layered pipeline 전체 corpus 검증

#### [x] S26-A. 단일 layered full-corpus 감사

완료 내용:

- S24-A/B/C/D 및 S25 전수 감사를 하나의 실행 경계로 통합
- 2,059개 notice decision과 1,304개 고유 candidate의 계층별 수량 일치 검증
- complete trace, runtime judgment, reconciliation 멱등성의 교차 무결성 검증
- publishable semantics, review queue, student/job ICS 보존 검증
- Policy.15 raw diff를 관찰 보고서로 기록하되 판정에는 사용하지 않음
- 통합 보고서 내부 경로를 audit report 디렉터리 기준 POSIX 상대경로로 기록
- `S26_LAYERED_FULL_CORPUS_AUDIT.md`

#### [x] S26-B. 별도 layered baseline 결정 및 생성

완료 내용:

- `baseline/policy15`를 변경하지 않고 역사적 rollback 기준선으로 보존
- `baseline/layered-s26-v1` 별도 생성
- baseline ID `layered-s26-corpus-2059-20260712-v1` 확정
- 2,059개 canonical notice candidate 문서와 1,304개 full candidate 객체 고정
- complete trace, runtime judgment, reconciliation, publishable/review/ICS 의미 고정
- broad allowlist를 만들지 않고 strict layered comparator 사용
- `tools/build_layered_baseline.py`, `tools/compare_layered_baseline.py` 추가
- `S26_LAYERED_BASELINE.md` 및 machine-readable decision record 추가

## Phase 2 — CalendarEvent reconciliation

### [x] S27. Cross-notice CalendarEvent reconciliation

목표:

- 게시판 간 중복, 수정, 연장, 대체 관계 판정
- stable `CalendarEventId` 및 revision history
- `distinct | duplicate | revision | extension | replacement | needs_review`

S27-A 상태(2026-07-13):

- 계약, 909개 publishable 후보 pair/cluster 진단, stable ID 전략 검토 완료
- 제작자 결정 D1~D8을 `noticepilot_cross_notice_reconciliation_policy.v0.3.json`에 기록
- `registry_assigned_opaque_v0`, campus-disjoint=`distinct`, pairwise-complete merge, one-active-ICS 정책 승인
- runtime/ICS 무변경 및 layered baseline `match / 0` 유지
- 관계 판정 0건, CalendarEventId 할당 0건
- S27-B 순차 선행 5단계 및 전수 relation 판정 완료
- 343 pair: distinct 100, duplicate 8, extension 1, needs_review 234
- 명시적 연장 1쌍과 cross-board duplicate 8쌍, 총 9개 automatic merge plan 승인
- duplicate 8쌍은 전문 게시판 우선 부분순서로 canonical selection 해소
- S27-B 시점 CalendarEventId/runtime/ICS 변경 0, layered baseline `match / 0`
- S27-C에서 909개 후보를 900개 opaque CalendarEvent identity로 배정
- relation 343건, source link 909건, revision 901건 영속화
- S27-D에서 persistent CalendarEvent UID 기반 ICS projection 완료

## Phase 3 — 사용자별 구독 피드

### [x] S28. SubscriptionProfile / FeedBuilder

초기 지원 범위:

- 캠퍼스
- 학부/대학원
- 학년
- 학적 상태
- 학생 기본 피드 / 채용 피드

진행 상태:

- [x] S28-1 — strict `SubscriptionProfile` 계약
- [x] S28-2 — feed eligibility 정책과 결정 사유
- [x] S28-3 — deterministic `FeedBuilder`
- [x] S28-4 — feed snapshot 계약 (`completed`)
- [x] S28-5 — profile matrix 및 full-corpus audit (`completed`)

S28-1 확정 원칙:

- 프로필은 사용자 선택 상태이며 event identity·feed token·ICS snapshot을 포함하지 않음
- 캠퍼스, unknown-campus, review-required, audience-unscoped 처리는 모두 명시 필드
- canonical board ID만 저장하고 alias board ID는 거부
- 추출 단계에서 사용자 조건으로 후보를 삭제하지 않음
- opaque subscription token 발급은 S29 delivery/persistence 경계로 유지

S28-2 완료 상태(2026-07-13):

- S27-D active event 900건, source link 909건, S24 publishability judgment를 결합한 `FeedEligibilityInputView.v0.2` 구현
- 단일 event/profile eligibility evaluator와 deterministic exclusion reason precedence 구현
- E1 `canonical_source_only`, E2 `canonical_candidate_only`, E5 audience-unscoped `include` 승인
- 원격 authoritative contract를 상속해 학생·채용 기본 profile policy 모두 unknown-campus 포함, review-required는 유효 날짜일 때 포함
- `invalid_normalized_date` temporal guard 추가; active 900건 모두 valid
- FeedBuilder, snapshot, ICS 변경은 수행하지 않음; S28-3 ready

S28-3 완료 상태(2026-07-13):

- 승인된 policy defaults를 명시적으로 materialize하는 student/job profile factory 구현
- 사용자 캠퍼스 기본값은 만들지 않고 selected campuses를 caller가 반드시 공급하도록 유지
- 900개 active event를 deterministic하게 순회해 include/exclude partition과 decision ledger 생성
- 포함 정렬은 normalizedStart → CalendarEventId, 제외 정렬은 reason precedence → CalendarEventId
- 학생 601건, 채용 299건으로 S27-D persistent ICS membership과 정확히 일치
- content-addressed snapshot ID/hash 및 atomic snapshot-set manifest 완료; URL/token·ICS 직렬화는 미수행

S28-5 완료 상태(2026-07-13):

- 44개 audit-only SubscriptionProfile matrix 구성
- 각 case에서 active event 900건 전수 판정, 총 39,600개 eligibility decision 수행
- 학생 601 / 채용 299 기준 membership과 S28-4 snapshot parity 유지
- 4개 캠퍼스별 학생·채용 subset, common/unknown/review 토글 검증
- audience scoped/unscoped, paused/revoked 상태 검증
- canonical board 9개 case와 event type 9개 case가 각각 900건을 중복 없이 정확히 분할
- 모든 case reverse-input determinism 확인
- 신규 제품 정책, snapshot mutation, ICS 직렬화, URL/token 발급 없음


## Phase 4 — 운영 인프라

### [x] S29. PostgreSQL / incremental runtime wiring

완료 내용:

- source notice, extraction run, candidate, calendar event, subscription PostgreSQL persistence
- content hash 기반 증분 재처리와 durable outbox
- opaque token hash-only subscription feed delivery 및 ETag
- 실제 PostgreSQL migration/bootstrap, 동일 migration 재실행, bootstrap idempotency
- CHECK/UNIQUE/FK/partial unique index, transaction rollback, advisory lock live 검증

완료 근거:

- live report: `runtime/s29-v1/live-postgres-verification.json`
- report semantic SHA-256: `eb66e820ac8885296a4389889519fe78a53a22d7eb814625dafe391f1a3dddbf`
- packaged file SHA-256: `8eecf611b93725372cafd5adfbef05717c0b66c5d9ae3b314233a7222a55d36d`
- `status: pass`
- `livePostgresVerified: true`
- `probeResidue: []`
- `mutationsCommitted: false`
- migration SHA-256: `a542301b0630c17a27169b4412f439f54f133c2d95b08a01d39e188b9ce8c759`
- bootstrap 12개 table expected/actual count 일치

### [~] S30. Samsung Calendar 구독 QA (`in_progress`)

#### [x] S30-A. 자동 iCalendar·HTTP 구독 적합성 감사

구현 범위:

- 실제 student 601 / job 299 VEVENT feed 전수 검사
- UTF-8, CRLF, 75-octet line folding
- stable UID, `SEQUENCE`, `STATUS`
- all-day exclusive `DTEND`
- timed `TZID=Asia/Seoul` 및 `VTIMEZONE`
- `Content-Type`, `Content-Disposition`, `ETag`, `Cache-Control`, `Last-Modified`
- conditional GET `304`
- 동일 URL lifecycle fixture: `initial → updated → cancelled`
- 정적 `.ics` import를 구독 성공으로 인정하지 않는 fail-closed 계약

자동 감사 근거:

- report: `runtime/s30-v1/automated-qa-report.json`
- report semantic SHA-256: `cf7ff5ca03eca3ed5e210930c31384901258b45bb67d54a9d1beb577f37f9727`
- packaged report SHA-256: `86078b8f267544677eedc42fbae905d58e14efd405740d28688bbe3c2f87b7db`
- manifest: `runtime/s30-v1/manifest.json`
- manifest semantic hash: `0bd2ee5bd3e2b8499750a4c96eeb9e4778dc41881a194e45e86f038b932491b0`
- packaged manifest SHA-256: `84e2400ec65123d777341ab9dd7761b148b86439c21417f087ab351b1e787eac`
- `automatedStatus: pass`
- `physicalClientStatus: pending`
- `s30Completed: false`
- regression summary: `runtime/s30-v1/regression-summary.json`
- module-isolated regression: `428/428 pass` across 30 modules
- regression file SHA-256: `843c6546b101d8fd400db99f6cf63e9c87a284eb9b5ed65e2289bddd8bb5783b`
- layered baseline: `match / changeCount 0`

#### [ ] S30-B. Samsung Calendar 물리 기기 구독 수명주기 QA (`awaiting_physical_device`)

남은 검증:

- 동일 URL을 실제 구독으로 등록할 수 있는지 확인
- 초기 all-day/timed/한글 표시
- 신규 이벤트 polling 반영
- 동일 UID 수정·연장 시 중복 미발생
- 동일 UID `STATUS:CANCELLED` 처리
- 실제 refresh latency와 요청 로그 기록

실행 문서: `S30_SAMSUNG_CALENDAR_SUBSCRIPTION_QA.md`

결과 템플릿: `runtime/s30-v1/samsung-physical-qa-result.template.json`

물리 기기 증거 없이 S30을 완료 처리하지 않는다. Samsung Calendar가 정적 import만 지원하거나 URL polling이 불가능한 경우 `S30_CREATOR_DECISION_PACKET.md`에 따라 별도 제품 결정을 거친다.

## 현재 보류 범위

다음은 S26 이전에 확대하지 않는다.

- 다른 대학 추가
- 신규 게시판 확대
- 학과 단위 정밀 개인화
- 전체 공지 LLM 해석
- 프론트엔드 대규모 개편
- TypeScript 전환
- 운영용 review UI 고도화

### S27-B representative selection 결정

- 전문 게시판 우선 부분순서: `715 행사안내 > 504 일반공지`, `721 장학공지 > 504 일반공지`
- 다른 board 조합에는 순위를 추론하지 않음
- 8개 duplicate pair의 canonical selection 해소
- S27-C에서 해당 8개 duplicate와 연장 1개를 포함한 registry persistence 완료

### S27-C completion (2026-07-13)

- issued 900 opaque CalendarEvent identities for all 909 publishable candidates;
- persisted one assignment and source link per candidate;
- applied eight duplicate merges and one extension merge;
- persisted 343 pair decisions while keeping all 234 `needs_review` relations unmerged;
- recorded 901 revisions with exactly 900 active revisions;
- preserved the extension under one event ID with sequence `0 → 1`;
- created 900 pending S27-D projection outbox intents;
- left existing runtime candidates and ICS UIDs unchanged;
- completed S27-D persistent UID projection and advanced S28 to ready.


### S27-D completion (2026-07-13)

- projected 900 active CalendarEvent identities to persistent ICS UIDs;
- generated 601 student-feed and 299 job-feed VEVENTs;
- mapped all 909 legacy candidate UIDs without treating them as durable identities;
- consumed 900 projection outbox intents using immutable receipts;
- retained the extension UID with `SEQUENCE:1`;
- preserved all 909 source links;
- omitted arbitrary DTEND values for 155 timed events without an end;
- kept legacy ICS and the S27-C registry unchanged;
- deferred hosted feed delivery to S28/S29 and physical Samsung Calendar QA to S30.
