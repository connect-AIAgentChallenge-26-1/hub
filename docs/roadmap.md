# 플레이스픽 AI 서비스 완성 Roadmap

## 문서 목적과 현재 상태

이 문서는 플레이스픽 AI 완성형 MVP와 공유 Fork 배포 신뢰 기반을 구현하는
`PP-001`~`PP-040`의 실행 순서,
선행 관계와 완료 증거를 관리하는 운영 정본이다. GitHub Issue는 실행 상태와 리뷰를,
연결된 Work Record는 문제 해결 과정과 검증 증거를 보존한다.

현재 구현은 Java 17 Spring Boot 개발 환경, PostgreSQL·Redis·Mock API 하네스,
조건 추출과 동기 추천 core·근거 fallback, Actuator, CI와 문서 검증까지다. 공개 HTTP 표면은 `/actuator/health`와
`/actuator/prometheus`뿐이며 아래 Task가 나열됐다는 사실은 비즈니스 기능이
구현됐다는 뜻이 아니다.

서비스 백로그 게시 변경은 [PR #39](https://github.com/gdh0730/hub/pull/39)에서
검토했다. PP-001~PP-036은 Issue #3~#38과, 공유 Fork 신뢰 기반 PP-037은
[Issue #40](https://github.com/gdh0730/hub/issues/40), Elice 계약 기반 PP-038은
[Issue #42](https://github.com/gdh0730/hub/issues/42)와 1:1로 연결한다. 핵심 추천 core와
Split Live 검증은 [PP-039](https://github.com/gdh0730/hub/issues/44)·WI-0041로 추적한다.
실제 Naver→Elice 로컬 연결 검증은
[PP-040](https://github.com/gdh0730/hub/issues/50)·WI-0042로 별도 추적한다.

## 목표와 완료 경계

목표 사용자 여정은 다음과 같다.

```text
익명 세션
  -> 자연어 조건 입력
  -> AI 조건 초안
  -> 사용자 수정·확정
  -> 202 추천 Job
  -> Naver 장소·블로그 검색
  -> 결정론적 점수와 근거 기반 설명
  -> 진행 SSE와 후보 3개
  -> 공유방
  -> LIKE/DISLIKE 변경·삭제
  -> 주최자 최종 장소 확정
  -> 최종 결과 공유
```

서비스 완료에는 backend, frontend, 실제 Naver·Elice adapter, Mock 기반 CI,
Local Live 호환성 검증, 배포 Gateway 신뢰 기반, 보안·관측성·Eval·부하 검증과
Java 17 운영 패키징을 포함한다. PP-037·PP-038에는 실제 Cloudflare·Vercel·Render·
Neon·Upstash 리소스 배포나 제품 LLM runtime을 포함하지 않는다. 유료 클라우드 배포, 회원 가입,
관리자 UI, 결제, 지도·길찾기와 네이티브 앱도 포함하지 않는다.

완료는 기능 존재가 아니라 다음 release gate를 모두 만족하는 상태다.

- API, DB, event, LLM schema와 화면 상태가 같은 의미를 사용한다.
- local/test/load와 필수 CI에서 실제 외부 API 호출이 0건이다.
- Mock 자동 검증, 제한된 Local Live provider 검증과 클라우드 배포 검증을 서로
  다른 증거로 관리한다.
- 합성 Naver·LLM fixture를 연결한 Mock 전체 추천 core, provider 데이터를 연결하지 않는
  Split Live와 승인된 invocation-bound 로컬 반복 Linked Live를 서로 다른 증거로 관리한다.
- 향후 Approval Gate를 거친 제한된 배포 Live에서 하나의 전체 실제 추천 경로가
  schema와 근거 검증을 통과한다.
- 단위·통합·계약·Eval·브라우저 E2E·접근성·보안·부하 검증이 통과한다.
- 재시도, 중복 event, Worker 재시작, DLQ, 동시 투표와 SSE 재연결을 검증한다.
- 관련 Work Record, ADR, Troubleshooting, Experiment, Runbook과 Case Study가
  실제 증거에 맞게 갱신된다.

## 고정된 설계 기준

- Java 17, Spring Boot 3.5.16과 Gradle Wrapper 8.14.4를 유지한다.
- 사용자는 AI가 추출한 조건을 확인·수정한 후에만 추천 Job을 시작한다.
- 추천 생성 성공은 반드시 `202 Accepted + jobId`이며 200을 허용하지 않는다.
- 외부·DB ID는 UUID v4를 사용하고 공개 방 route는 불투명 share token을 사용한다.
- 서버 발급 익명 세션, 공개 share token과 organizer capability를 분리한다.
- Job과 outbox는 한 DB transaction에 저장하고 Worker는 at-least-once·멱등 처리를
  전제로 DB commit 후 ACK한다.
- DB snapshot을 상태 정본으로, Redis Streams를 작업 전달에, Redis Pub/Sub을 SSE의
  일시적 fan-out에 사용한다.
- 후보가 부족하면 낮은 우선순위 선호 하나만 제거해 한 번 재검색한다. 위치와 장소
  유형은 유지하며 여전히 세 개 미만이면 부분 결과 대신 실패한다.
- 구조화된 가격 근거가 없는 현재 점수는 위치 30, 유형 25, 선호 최대 15, Blog 최대
  10의 0~80이며 예산은 추론하지 않고 warning을 반환한다. 제외 조건은 hard filter다.
- 동점은 필수 조건 일치율, 근거 수와 내부 `CandidateKey`로 해소하고 UUID v4는 Top 3
  선정 뒤 발급한다.
- Blog만 실패하면 `LOCAL_ONLY` degraded 완료, 이유 생성만 실패하면 검증된 field의
  template fallback을 사용한다.
- LLM은 후보와 점수를 결정하지 않고 수집된 근거의 설명만 생성한다.
- frontend는 Next.js same-origin 경계에서 익명 cookie, CSRF와 SSE를 사용한다.
- 원본 provider key는 공유 Fork·GitHub Actions·Vercel·Render에 두지 않는다. Local
  Live는 Git에서 제외한 개발자 파일, 배포 Live는 외부 Provider Gateway를 사용한다.
- Naver 검색 결과 결합·영구 저장·LLM 전달과 Elice 데이터 처리는 사람의 승인 범위에서만
  허용한다. PP-040은 저장소 소유자의 양쪽 Provider 승인 진술에 근거한 고정 합성 입력의
  invocation-bound 로컬 반복 Linked 검증 예외이며, 승인 원문을 독립 검토하거나 법률
  준수를 확인했다는
  뜻은 아니다.
- 실제 사용자 데이터·제품 runtime·배포에는 PP-040의 로컬 예외를 자동 적용하지 않는다.
- Elice Chat Completions를 MVP 방향으로 두고 직접 OpenAI Responses는 자동 fallback이
  아닌 재검토 대안으로 유지한다. Embedding은 capability만 확인하고 runtime에 쓰지 않는다.

세부 계약은 [계약 정본](contracts.md), 장기 결정은
[ADR-0004](adr/ADR-0004-service-boundary.md)부터
[ADR-0008](adr/ADR-0008-frontend-same-origin-boundary.md),
[ADR-0009](adr/ADR-0009-mock-local-live-gateway-boundary.md)와
[ADR-0010](adr/ADR-0010-free-demo-deployment-boundary.md),
[ADR-0011](adr/ADR-0011-elice-chat-completions-provider-boundary.md),
[ADR-0012](adr/ADR-0012-recommendation-core-and-split-live-boundary.md),
[ADR-0013](adr/ADR-0013-naver-elice-linked-live-boundary.md)을 따른다.

## Task 운영 규칙

### 상태

| 상태 | 진입 조건 | 종료 조건 |
| --- | --- | --- |
| `planned` | 범위와 선행 관계가 정의됨 | 모든 선행 Task가 `done` |
| `ready` | 선행 Task·계약·ADR이 준비됨 | 담당자가 Work Record를 시작함 |
| `in-progress` | 연결 WI를 `in-progress`로 변경함 | 검증 완료 또는 명시적 blocker 발생 |
| `blocked` | 외부 권한·정책·선행 결과가 없으면 진행 불가 | blocker와 재개 조건 해결 |
| `done` | 구현·자동 테스트·문서 증거가 모두 존재 | release gate에서 회귀가 발견되면 재개 |

Task를 시작할 때 Issue와 Work Record에서 문제, 성공 기준, 선행 결과와 검증 명령을
다시 확인한다. Task 완료 전에 구현 경로, 계약 상태, 테스트 보고서, AI 위임 범위와
사람의 검증을 같은 WI에 기록한다.

### Definition of Ready

- 모든 선행 Task가 `done`이고 그 결과가 main에 병합됐다.
- 변경할 계약이 `specified`이며 구현자가 request·response·오류·권한을 추측하지
  않아도 된다.
- 장기 결정은 accepted ADR에 있고 약관·비용처럼 사람의 승인이 필요한 gate가
  식별됐다.
- local/test/load에서 Mock만 사용하도록 검증 방법이 정해졌다.
- rollback 또는 기능 비활성화 경계가 Issue에 기록됐다.

### Definition of Done

- 정상·경계·실패와 재시도 시나리오가 위험에 비례한 테스트로 검증됐다.
- `make check`가 통과하고 실제 외부 호출·비밀·개인정보가 diff와 log에 없다.
- 변경된 API·event·DB·LLM·실행 계약이 같은 PR에서 갱신됐다.
- Work Record에 실행 명령과 실제 결과가 있고 완료되지 않은 증거를 성공으로
  표현하지 않는다.
- 재발 가능한 장애, 측정 실험이나 복구 절차는 적절한 전문 문서에 분리됐다.

## Milestone과 Task DAG

### M0 제품·계약·아키텍처

| ID | Task | 선행 | Work Record | 핵심 완료 증거 |
| --- | --- | --- | --- | --- |
| [PP-001](https://github.com/gdh0730/hub/issues/3) | 서비스 경계와 사용자 여정 | 없음 | [WI-0003](work-records/WI-0003-service-boundary-and-user-journey.md) | 역할·상태·실패·비범위가 API와 화면에 매핑됨 |
| [PP-002](https://github.com/gdh0730/hub/issues/4) | HTTP·보안·오류·멱등성 OpenAPI | PP-001 | [WI-0004](work-records/WI-0004-http-security-error-idempotency-contract.md) | machine-readable 계약과 정상·오류 example 검증 |
| [PP-003](https://github.com/gdh0730/hub/issues/5) | 도메인·상태·점수·보존 정책 | PP-001 | [WI-0005](work-records/WI-0005-domain-status-scoring-retention-policy.md) | lifecycle/stage, 점수·동점·TTL·삭제 규칙 fixture |
| [PP-004](https://github.com/gdh0730/hub/issues/6) | API·Worker·Outbox·Streams 구조 | PP-001, PP-003 | [WI-0006](work-records/WI-0006-api-worker-outbox-streams-architecture.md) | 역할·event envelope·ACK·retry·DLQ 계약 |
| [PP-005](https://github.com/gdh0730/hub/issues/7) | Provider·실제 API 검증 정책 | PP-001 | [WI-0007](work-records/WI-0007-provider-and-live-validation-policy.md) | Mock/Local Live/Gateway, quota·약관·kill switch gate |
| [PP-006](https://github.com/gdh0730/hub/issues/8) | Frontend UX·접근성 명세 | PP-001, PP-002 | [WI-0008](work-records/WI-0008-frontend-ux-accessibility-specification.md) | route와 모든 loading·error·expired·degraded 상태 |

M0가 완료되기 전에는 business Controller나 production frontend를 구현하지 않는다.
PP-002는 이 문서에 고정된 계약을 OpenAPI와 자동 schema 검증으로 형식화하며 제품
의미를 임의로 바꾸지 않는다.

### 횡단 Provider·공유 Fork Live 신뢰 경계

| ID | Task | 선행 | Work Record | 핵심 완료 증거 |
| --- | --- | --- | --- | --- |
| [PP-037](https://github.com/gdh0730/hub/issues/40) | Approval Gate·Provider Gateway 기반 | PP-005 | [WI-0039](work-records/WI-0039-shared-fork-live-security-foundation.md) | 무비밀 CI의 OIDC·JWT·replay·allowlist 검증과 세 상태 분리 |
| [PP-038](https://github.com/gdh0730/hub/issues/42) | Elice LLM Proxy Local Live 계약 | PP-005 | [WI-0040](work-records/WI-0040-elice-llm-proxy-live-contract.md) | Chat strict schema·Embedding capability와 provider별 secret 격리 |
| [PP-039](https://github.com/gdh0730/hub/issues/44) | 핵심 추천 core·Split Live 검증 | PP-009, PP-013~PP-016, PP-038 | [WI-0041](work-records/WI-0041-recommendation-core-split-live-workflow.md) | Mock 전체 연결과 실제 provider 4회·`linked=false` 검증 |
| [PP-040](https://github.com/gdh0730/hub/issues/50) | Naver→Elice 실제 Linked Live 워크플로 | PP-039 | [WI-0042](work-records/WI-0042-naver-elice-linked-live-workflow.md) | 다섯 Mock core 흐름과 SHA `e789af65...`의 실제 3개 `linked=true` strict success |

PP-037은 PP-013의 Local Live 검증 및 PP-033·PP-035의 향후 배포가 사용할 횡단
신뢰 기반이다. PP-038은 PP-009·PP-016·PP-029가 사용할 Elice 계약을 제품 runtime과
분리해 검증한다. 두 Task 모두 실제 edge·무료 demo stack을 배포하지 않으며 PP-038
완료도 조건 추출·추천 이유 구현 완료를 뜻하지 않는다. PP-039는 PP-009·PP-014~PP-016의
동기 core를 Mock으로 연결하고 Split Live를 분리 검증한다. Split Probe는 2026-07-15
병합 `main`에서 한 번 실행했지만 safe failure로 종료해 PP-039는 `in-progress`다.
PP-040은 누락된 세 Mock 실패 흐름을 core 전체로 보강하고 실제 Naver→Elice Linked
Live harness를 별도 검증했다. harness 코드의 자동 검증과 실제 Provider 성공 증거는
분리하며 공개 API, Worker와 cloud 배포는 완료 범위가 아니다.

2026-07-15 첫 SHA `541a98b3b73bfdaa3a1c7396aaea32ce410a7237`의 조건 추출
`PROVIDER_UNAVAILABLE`과 후속 이유 schema `uniqueItems` 400은 실패 이력으로 보존한다.
전송 경계와 safe diagnostics를 분리하고, exact 동치 `Seoul`만 finite alias로 사용자 확인
정본 `서울`에 연결했으며 broad·fuzzy 해석은 허용하지 않았다. 최종 push SHA
`e789af65e94441aa38a018a2931c3705f7125112`에서 완전 입력 카페, nullable 음식점,
nullable 디저트 카페의 세 allowlist 시나리오가 각각 논리 호출 `7/6/6`으로 strict
success를 통과했다. 모두 `linked=true`, `degraded=false`, `reasonFallback=false`,
`cleanup=true`, retry 0회이므로 PP-040의 동기 Linked core와 WI-0042는 완료다. 공개 API,
DB·Worker·SSE·frontend, 제품 runtime과 cloud 배포는 계속 후속 Task다.

### M1 Backend 도메인 기반과 익명 보안

| ID | Task | 선행 | Work Record | 핵심 완료 증거 |
| --- | --- | --- | --- | --- |
| [PP-007](https://github.com/gdh0730/hub/issues/9) | Flyway schema·domain·JPA 경계 | PP-002~PP-004 | [WI-0009](work-records/WI-0009-flyway-domain-jpa-boundary.md) | 신규·upgrade migration, validate와 ArchUnit |
| [PP-008](https://github.com/gdh0730/hub/issues/10) | 익명 session·capability·CSRF·Problem Details | PP-002, PP-003 | [WI-0010](work-records/WI-0010-anonymous-session-capability-csrf-problem-details.md) | 변조·만료·권한·CSRF·secret 제거 계약 테스트 |

DB 정합성은 Flyway constraint와 transaction으로 보장한다. cookie나 capability 원문을
DB·로그·metric label에 저장하지 않는다.

### M2 조건 Draft와 비동기 Job 기반

| ID | Task | 선행 | Work Record | 핵심 완료 증거 |
| --- | --- | --- | --- | --- |
| [PP-009](https://github.com/gdh0730/hub/issues/11) | 조건 추출 port·schema·Eval | PP-002, PP-003, PP-005 | [WI-0011](work-records/WI-0011-condition-extraction-port-schema-eval.md) | 정상·경계·refusal·malformed·injection Eval |
| [PP-010](https://github.com/gdh0730/hub/issues/12) | Draft 생성·조회·수정·만료 API | PP-007~PP-009 | [WI-0012](work-records/WI-0012-recommendation-draft-api.md) | 30분 TTL, 소유권, 전체 교체와 상태 전이 |
| [PP-011](https://github.com/gdh0730/hub/issues/13) | 추천 Job 202·Outbox·멱등성 | PP-004, PP-007, PP-008, PP-010 | [WI-0013](work-records/WI-0013-recommendation-job-202-outbox-idempotency.md) | 202/Location, 중복 key와 원자적 job·outbox |
| [PP-012](https://github.com/gdh0730/hub/issues/14) | Streams relay·retry·DLQ | PP-004, PP-007, PP-011 | [WI-0014](work-records/WI-0014-streams-relay-retry-dlq.md) | publish 복구, pending claim, poison event와 DLQ |

### M3 추천 Pipeline

| ID | Task | 선행 | Work Record | 핵심 완료 증거 |
| --- | --- | --- | --- | --- |
| [PP-013](https://github.com/gdh0730/hub/issues/15) | NAVER API HUB 장소·Blog adapter | PP-005 | [WI-0015](work-records/WI-0015-naver-api-hub-adapter.md) | 현행 경로 WireMock·구 경로 거부와 교체 key Local·Blog 각 1회 safe canary |
| [PP-014](https://github.com/gdh0730/hub/issues/16) | 후보 정규화·중복 제거·근거 | PP-007, PP-013 | [WI-0016](work-records/WI-0016-candidate-normalization-deduplication-evidence.md) | 동일 장소 병합과 최소 provenance 보존 |
| [PP-015](https://github.com/gdh0730/hub/issues/17) | 결정론적 점수·Top 3·조건 완화 | PP-003, PP-014 | [WI-0017](work-records/WI-0017-deterministic-scoring-top3-relaxation.md) | 경계·동점·제외·한 번 확장·후보 부족 fixture |
| [PP-016](https://github.com/gdh0730/hub/issues/18) | 근거 기반 이유·주의점·fallback | PP-003, PP-005, PP-009, PP-015 | [WI-0018](work-records/WI-0018-grounded-reason-fallback.md) | strict schema·환각 차단·template fallback Eval |
| [PP-017](https://github.com/gdh0730/hub/issues/19) | Worker 전체 pipeline·복구 | PP-012~PP-016 | [WI-0019](work-records/WI-0019-worker-pipeline-recovery.md) | 상태 전이·degraded·중복·재시작·terminal 실패 |
| [PP-018](https://github.com/gdh0730/hub/issues/20) | 추천 상태·결과 조회 API | PP-002, PP-017 | [WI-0020](work-records/WI-0020-recommendation-status-result-api.md) | snapshot 소유권·만료·완료·실패 계약 |
| [PP-019](https://github.com/gdh0730/hub/issues/21) | 추천 진행 SSE | PP-004, PP-017, PP-018 | [WI-0021](work-records/WI-0021-recommendation-sse.md) | snapshot-first, heartbeat, reconnect와 자원 정리 |

### M4 추천 Frontend

| ID | Task | 선행 | Work Record | 핵심 완료 증거 |
| --- | --- | --- | --- | --- |
| [PP-020](https://github.com/gdh0730/hub/issues/22) | Next.js frontend 기반 | PP-006 | [WI-0022](work-records/WI-0022-next-frontend-foundation.md) | exact version·lockfile·test·same-origin proxy |
| [PP-021](https://github.com/gdh0730/hub/issues/23) | 홈·자연어 조건·Draft 확인 UI | PP-010, PP-020 | [WI-0023](work-records/WI-0023-home-draft-ui.md) | validation·수정·확정·새로고침 복구·접근성 |
| [PP-022](https://github.com/gdh0730/hub/issues/24) | 진행·결과·상세·공유 UI | PP-018~PP-020 | [WI-0024](work-records/WI-0024-progress-result-share-ui.md) | SSE, 후보 3개, degraded·error·retry 상태 |

### M5 공유방·투표·최종 확정

| ID | Task | 선행 | Work Record | 핵심 완료 증거 |
| --- | --- | --- | --- | --- |
| [PP-023](https://github.com/gdh0730/hub/issues/25) | 방 생성·조회·만료·공유 | PP-007, PP-008, PP-018 | [WI-0025](work-records/WI-0025-room-creation-read-expiry.md) | share/capability 분리, expiry와 404/410 |
| [PP-024](https://github.com/gdh0730/hub/issues/26) | 투표 변경·삭제·동시성 | PP-008, PP-023 | [WI-0026](work-records/WI-0026-vote-change-delete-concurrency.md) | 세션·후보당 한 표와 경합·집계 정합성 |
| [PP-025](https://github.com/gdh0730/hub/issues/27) | 방 SSE·주최자 최종 확정 | PP-004, PP-023, PP-024 | [WI-0027](work-records/WI-0027-room-sse-finalization.md) | 실시간 집계, capability, 원자적 확정과 409 |
| [PP-026](https://github.com/gdh0730/hub/issues/28) | 참여자 투표·주최자 확정 UI | PP-020, PP-022~PP-025 | [WI-0028](work-records/WI-0028-room-frontend.md) | 두 browser context의 변경·삭제·확정 E2E |
| [PP-027](https://github.com/gdh0730/hub/issues/29) | allowlist 제품 event 수집 | PP-002, PP-008, PP-023, PP-024 | [WI-0029](work-records/WI-0029-allowlisted-analytics.md) | 크기·schema·비식별화·PII 거부와 보존 정책 |

### M6 실제 Adapter·보안·운영성

| ID | Task | 선행 | Work Record | 핵심 완료 증거 |
| --- | --- | --- | --- | --- |
| [PP-028](https://github.com/gdh0730/hub/issues/30) | Cache·rate limit·quota 보호 | PP-005, PP-009, PP-013, PP-017, PP-024 | [WI-0030](work-records/WI-0030-rate-quota-cache.md) | Retry-After, stampede·timeout·quota metric |
| [PP-029](https://github.com/gdh0730/hub/issues/31) | 실제 Naver·Elice adapter 활성화 | PP-005, PP-009, PP-013, PP-028, PP-038 | [WI-0031](work-records/WI-0031-live-provider-adapters.md) | profile 격리, host allowlist, key fail-fast·kill switch |
| [PP-030](https://github.com/gdh0730/hub/issues/32) | 보안·개인정보·수명 hardening | PP-007, PP-008, PP-020, PP-023, PP-027~PP-029 | [WI-0032](work-records/WI-0032-security-privacy-lifecycle.md) | 위협 모델, CSRF·XSS·SSRF·cleanup·약관 검증 |
| [PP-031](https://github.com/gdh0730/hub/issues/33) | 도메인 metric·Grafana·Runbook | PP-012, PP-017, PP-024, PP-028~PP-030 | [WI-0033](work-records/WI-0033-observability-runbooks.md) | 단계 지연·degraded·DLQ·quota·SSE·경합 관측 |

### M7 시스템 검증·Release

| ID | Task | 선행 | Work Record | 핵심 완료 증거 |
| --- | --- | --- | --- | --- |
| [PP-032](https://github.com/gdh0730/hub/issues/34) | 전체 자동 검증 matrix | PP-001~PP-031 | [WI-0034](work-records/WI-0034-full-test-matrix.md) | unit·integration·contract·Eval·E2E·a11y·security |
| [PP-033](https://github.com/gdh0730/hub/issues/35) | Approval Gate 기반 배포 Live E2E | PP-029~PP-032, PP-037 | [WI-0035](work-records/WI-0035-staging-live-workflow.md) | 승인 SHA·한도·알림·rotation과 수동/예약 검증 |
| [PP-034](https://github.com/gdh0730/hub/issues/36) | k6 부하 실험과 기준선 | PP-017, PP-024, PP-031, PP-032 | [WI-0036](work-records/WI-0036-k6-load-experiments.md) | Job·Worker·SSE·투표 baseline과 병목 전후 EXP |
| [PP-035](https://github.com/gdh0730/hub/issues/37) | Java 17 운영 image·Demo Compose | PP-020, PP-029~PP-032 | [WI-0037](work-records/WI-0037-java17-production-packaging.md) | api·worker·frontend, readiness·종료·rollback |
| [PP-036](https://github.com/gdh0730/hub/issues/38) | 최종 release·portfolio Case Study | PP-033~PP-035 | [WI-0038](work-records/WI-0038-final-release-case-study.md) | 계약·증거 대조와 README·ADR·WI·전문 문서 gate |

## 병렬 실행과 Critical Path

M0에서는 PP-002~PP-005가 PP-001 뒤에 부분 병렬로 진행되고 PP-006은 PP-002 계약을
기다린다. M1의 schema와 익명 보안은 병렬화할 수 있다. M2 이후 critical path는
`PP-010 → PP-011 → PP-012 → PP-017 → PP-018 → PP-019 → PP-022 → PP-023 →
PP-024 → PP-025 → PP-026 → PP-032 → PP-033 → PP-036`이다.

Provider adapter PP-013~PP-016과 frontend 기반 PP-020은 선행 계약이 닫히면 다른
작업과 병렬로 수행한다. PP-037의 Gate/Gateway 기반은 실제 클라우드 배포 없이 먼저
자동 검증하고 PP-033·PP-035가 승인된 배포 경로를 완성한다. 보안·관측·테스트는
마지막에 처음 추가하는 단계가 아니라 각 Task의 완료 조건으로 계속 수행하며
PP-030~PP-032에서 전체 경계를 다시 검증한다.

## 전체 검증 시나리오

### Backend와 전달

- 단위 테스트는 Docker 없이 실행하고 통합 테스트는 Testcontainers PostgreSQL·
  Redis와 WireMock만 사용한다.
- 같은 idempotency key는 중복 Job을 만들지 않고 다른 body 재사용은 409다.
- DB commit 직후 Redis 중단, relay·Worker 재시작, 중복 delivery, pending claim,
  poison event와 DLQ를 검증한다.
- Job lifecycle과 사용자 processing stage를 별도 상태로 검증한다.

### Provider와 Eval

- Naver 정상·0건·중복·HTML·인증·429·5xx·timeout과 오류 body 변형을 검증한다.
- Elice Chat 정상·strict schema 위반·불완전 종료·429·5xx·timeout을 검증한다.
- Embedding은 capability fixture와 합성 live만 검증하고 추천 runtime에서 사용하지 않는다.
- Mock 전체 추천 core는 사용자 확인 경계, 검색어 100자, 한 번의 완화, source link·
  위치·유형·제외 filter, dedup, 0~80 점수, `CandidateKey` 동점과 정상·완화·후보 부족·
  Blog degraded·LLM batch fallback 다섯 core 흐름을 검증한다.
- Split Live는 Elice 합성 추출, Naver Local·Blog와 Elice 합성 이유의 네 호출만 허용하고
  Naver 응답의 Elice 전달과 Embedding 호출을 0건으로 검증한다.
- Linked Live는 실제 Elice 추출, 실제 Naver Local·Blog, 제품 core와 실제 Elice 이유를
  6~9회로 연결한다. 후보 3개, 실제 Blog evidence, `linked=true`, `degraded=false`,
  `reasonFallback=false`와 place/evidence provenance가 모두 맞아야 성공이다.
- 검색 근거에 없는 장소·가격·영업·위치 특성을 만들면 Eval을 실패시킨다.
- local/test/load에서 외부 DNS·HTTP가 한 번이라도 발생하면 전체 검증을 실패시킨다.

### API·SSE·투표

- 추천 생성은 202, 유효한 UUID와 Location을 반환하고 200을 거부한다.
- 404와 만료 410, 권한 403, 상태·멱등 충돌 409, 제한 429를 구분한다.
- SSE snapshot, 증가 event ID, heartbeat, `Last-Event-ID`, terminal close와 연결 누수를
  검증한다.
- 투표 생성·변경·삭제·중복·동시 요청과 organizer 확정 경합을 검증한다.

### Browser·부하·Packaging

- 서로 다른 두 browser context에서 주최자와 참여자의 전체 흐름을 검증한다.
- 360px viewport, 키보드, focus, label, 명암과 `aria-live` 갱신을 검사한다.
- k6는 202와 jobId를 검사하고 제출 latency와 Worker 완료 latency를 분리한다.
- 최초 측정 전 성능 수치를 목표로 주장하지 않고 PP-034에서 baseline 뒤 regression
  threshold를 정한다.
- 깨끗한 clone에서 Java 17 api·worker와 frontend image를 build하고 SIGTERM·재시작과
  pending message 복구를 검증한다.

## 실제 외부 검증 제한

실제 외부 검증은 provider와 배포 상태로 분리한다. Naver Local Live는 교체된
credential과 검토한 SHA로 Local·Blog 논리 호출을 각각 한 번 수행하고 provider
client의 automatic retry·redirect가 꺼졌는지 확인한다. provider dashboard의 wire
사용량 대조는 가능한 경우 추가 운영 증거로 남긴다. 2026-07-14 SHA `128692bd...`에서 Local·Blog
각 1회가 2xx·schema를 통과해 PP-013의 Local Live 계약을 완료했다. 같은 날 SHA
`e619066...`에서 합성 Chat·Embedding 각 1회도 2xx·strict schema·usage와 1,536차원을
통과해 PP-038 capability 계약을 완료했다. 이번 실행의 provider console 사용량은
독립 대조하지 않았고, 이 성공은 제품 runtime이나 배포 완료를 뜻하지 않는다.
PP-039의 Mock linked core 정상 8회·완화 9회에 더해 PP-040에서 후보 부족, Blog
degraded와 LLM 전체 fallback을 같은 core matrix로 보강했고 다섯 경로가 자동 검증됐다.
Split Live Probe는
2026-07-15 정확한 `main` SHA `dc6e1e2aacee47f2ac87bb425ff73299ba09854a`에서 한 번
실행했지만 `Workflow split probe returned a safe failure status.`로 종료했다. 10개 report
안전 scan은 통과했고 비밀·Provider 원문 노출은 관찰되지 않았으나 stage·오류 code와
wire 호출 수는 확인하지 못했다. 따라서 PP-039·WI-0041은 `in-progress`, RUN-0003은
`draft`, Split 계약은 `specified`다.

PP-040의 Linked harness는 저장소 소유자가 양쪽 Provider 승인과 주소·도로명 주소를
포함한 현재 전체 문맥 전달을 승인했다고 진술한 범위에서만 만든다. 승인 원문을 독립
검토하지 않았으므로 법률·약관 준수나 실제 사용자 데이터 처리를 주장하지 않는다.
최종 SHA `e789af65e94441aa38a018a2931c3705f7125112`의 세 allowlist 시나리오는 실제
Elice 추출→사용자 확인→Naver Local·Blog→결정론적 Top 3→실제 Elice 이유→서버
provenance 검증을 끝까지 통과했다. 논리 호출은 `7/6/6`, 세 실행 모두
`degraded=false`, `reasonFallback=false`, `cleanup=true`, retry 0회였다. 따라서 로컬
동기 Linked 계약은 `implemented`다. 이 작은 반복 캠페인은 SLA·성공률 증거가 아니며,
제품 runtime과 배포 Live는 계속 별도 Task다. 첫 실행의 조건 추출 안전 실패와 후속 이유
schema 400도 원인·수정 이력으로 WI-0042에 남긴다.
PP-033의 배포 Live는 외부 Approval Gate가 사용자 actor, main의 승인 SHA와 고정
workflow를 검증한 뒤 제한된 provider 요청만 실행한다.

공유 Fork와 GitHub Actions에는 원본 Naver·Elice·배포 secret을 두지 않는다. 호출
상한, 알림과 rotation 담당자가 준비되기 전에는 예약 실행을 활성화하지 않는다.
정확한 장소명이 계속 같다는 가정 대신 schema, 후보 수, 근거 연결, 금지 field와
환각 부재를 검증한다. key, cookie, token과 전체 provider response는 log와 artifact에
남기지 않는다. Mock 자동 검증, Naver·Elice Local Live, 제품 runtime과 클라우드
배포를 서로 다른 완료 상태로 기록한다.

## Task 변경 정책

공식 API나 실측 결과 때문에 Task를 바꿔야 하면 기존 성공 기준을 조용히 덮어쓰지
않는다. 연결 Work Record에 관찰, 가설, 검증과 다음 결정을 기록하고 공개 계약·장기
결정이 바뀌면 같은 PR에서 `contracts.md`와 ADR을 갱신한다. Issue 분할·병합 시에도
`PP-*` 식별자는 재사용하지 않고 superseded 관계를 명시한다.
