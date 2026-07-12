# 구현 백로그 — 전체 기능 완료

이 문서는 [plan.md](plan.md)의 전체 `REQUIRED` 범위를 어떤 의존 순서로 구현할지 관리한다. 입력·출력 계약은 [skills.md](skills.md), 세부 완료 조건은 [checklist.md](checklist.md)가 진실 소스다.

## 운영 원칙

- 모든 Task는 필수다. 순서가 늦다는 이유로 범위에서 제거하지 않는다.
- 우선순위는 포함 여부가 아니라 선행조건과 위험 감소 순서를 뜻한다.
- 선행조건이 충족되지 않은 Task는 `BLOCKED`로 표시하고 원인·해제 조건을 기록한다.
- 일정은 진행 속도에 맞춰 재산정하되 기능 삭제로 맞추지 않는다.
- Task 완료는 코드 작성만이 아니라 테스트, 문서, 관측성, 오류 처리와 보안 기준 통과를 포함한다.
- 상태는 `대기 / 진행중 / BLOCKED / 완료`만 사용한다.

## 구현 순서

| 순서 | Task | 범위 | 선행조건 | 종료 조건 | 상태 |
|---:|---|---|---|---|:---:|
| T00 | 계약·저장소 품질 게이트 | 문서 동기화, 공통 schema·verdict·reason code, 테스트/lint/type/security CI, auto-merge 승인·테스트 gate | 없음 | C0 전체 통과 | 진행중 |
| T01 | Backend·DB 기반 | FastAPI, Pydantic, PostgreSQL schema, migration, 인증·secret 기반, trace/error envelope, provider interface | T00 | API·DB·인증 기반 contract test | 대기 |
| T02 | 종목·OpenDART 수집 | S1·S2, 종목 master, 공시검색, 전체 재무제표, 원문·checksum·정정 이력, retry/rate limit/cache | T01 | C1·C2 통과 | 대기 |
| T03 | 시세·외부 근거 수집 | S13·S14, 시세·거래일·기업행위, 뉴스·공식 외부 근거 provider와 라이선스 | T02 | C3 통과 | 대기 |
| T04 | Temporal Integrity·재무 계산 | S15·S3, as_of·정정·잠정/확정·CFS/OFS·누적/단일·단위·기업행위, 파생 지표 | T02·T03 | C4 통과 | 대기 |
| T05 | I9 평가 기반 | versioned golden set, record/replay fixture, unit·contract·integration scorer, threshold registry, CI report | T00·T01 | C12-A 통과 | 대기 |
| T06 | 기능 C 숫자 검증 | S7·S16·S17, Structured Claim, 5 verdict, evidence plan, 결정론 검산, Claim 편집 | T04·T05 | C7·C8 통과 | 대기 |
| T07 | 기능 C RAG·반증·인용 | S18·S19·S20·S23·S8·S9·S11, hybrid RAG, counter evidence, citation gate, injection defense, 3회 제한 루프·체크리스트·결과 UI | T02·T03·T06 | C9·C10 통과 | 대기 |
| T08 | 기능 A 종목 공부 | S4·S11, 기업개요·공시·지표·용어·확인 포인트·원문 viewer | T04·T07 | C5 통과 | 대기 |
| T09 | 기능 B 가치·가격 위치 | S5·S6·S21, 복수 valuation, 비교군, 민감도, 중립 가격 위치 | T03·T04·T05 | C6 통과 | 대기 |
| T10 | 복기·가설 추적 | T01 인증 주체 기반 격리·삭제/내보내기, S10·S22, 신규 공시 scheduler와 역사 replay | T06·T07 | C11 통과 | 대기 |
| T11 | FastAPI·React 전체 통합 | A/B/C API, 비동기 job, 인증·권한, 모든 UI 상태, 접근성·모바일 | T08·T09·T10 | C13 통과 | 대기 |
| T12 | I9 전체 평가·회귀 차단 | extraction·verdict·temporal·retrieval·citation·peer·safety·performance·cost E2E | T06~T11 | C12-B 통과 | 대기 |
| T13 | 배포·운영 | secrets, 암호화, backup/restore, 관측·alert, 배포·rollback, incident runbook | T11·T12 | C14 통과 | 대기 |
| T14 | 기능 D 개인 주문 | S12, 주문 API/UI, paper→broker sandbox→live-disabled adapter, 주문 state machine·idempotency·reconciliation·kill switch | T10·T11·T12·T13 | C15 전체 통과(주문 API/UI·live-disabled adapter·안전 gate 포함) | 대기 |
| T15 | 전체 릴리스 검증 | R01~R15 acceptance matrix, T14 포함 최종 tree의 C12-B·C14·보안 gate 재실행, 알려진 한계·규제 검토·운영 인수 | T00~T14 | C16 전체 통과 | 대기 |

## Task 상세

### 감사 개선안 작업 매핑

| 개선안 | Backlog Task |
|---|---|
| I1 Structured Claim | T06 |
| I2·I3 Deterministic Verification·Verdict | T06 |
| I4 Temporal Integrity | T04 |
| I5 Required-Evidence Planner | T06 |
| I6 Counter-Evidence Retrieval | T07·T12 |
| I7 Citation·Provenance | T07·T11 |
| I8 Peer Comparison | T09·T12 |
| I9 Evaluation Harness | T05·T12 |
| I10 Hypothesis Tracking | T10 |
| I11 Injection Defense | T00·T07·T12 |

### T00. 계약·품질 게이트

- `plan → skills → checklist → backlog → CLAUDE/AGENTS` 용어를 동기화한다.
- 5상태 verdict, Claim·Fact·Evidence·trace schema를 versioning한다.
- 테스트·lint·type check·security scan을 CI 필수 상태로 만든다.
- auto-merge는 승인과 품질 gate를 만족할 때만 실행하고 충돌 PR을 자동 종료하지 않는다.
- 추적 문서가 ignore된 문서에 의존하지 않도록 문서 정책을 정리한다.

### T01~T04. 플랫폼·원천·무결성

- raw 데이터는 immutable snapshot과 checksum을 보존한다.
- OpenDART `rcept_no`로 공시검색의 접수일과 재무제표를 연결한다.
- provider 오류·timeout·limit·점검을 데이터 없음과 구분한다.
- 다른 기업·기간·단위·CFS/OFS 값이 섞이는 테스트를 실패시킨다.
- 시세와 재무·발행주식 수 기준시점을 맞춘다.

### T05·T12. I9 품질 계약

- T05에서 C12-A의 scorer·threshold registry·초기 golden set·record/replay 기반을 구현하고 각 Task와 함께 확장한다.
- T12에서 C12-B의 A/B/C 전체 E2E, 안전, 공격, 장애, 성능, 비용 기준을 CI 차단 gate로 확정한다.
- 평가 결과는 versioned report로 저장하고 이전 버전 대비 회귀를 표시한다.

### T06·T07. 기능 C

- 수치 Claim은 S16에서 코드로 판정하고 LLM이 덮어쓰지 못하게 한다.
- 뉴스·테마·공시 이벤트 Claim은 허용 provider와 S18 RAG로 검증한다.
- S17의 필수 근거 충족률이 재검색·종료 기준이며 LLM 자기확신도는 사용하지 않는다.
- 지지 검색과 반증 검색을 모두 수행하고 S20 인용 gate를 통과한 근거만 판정에 쓴다.

### T08·T09. 기능 A·B

- 기능 A는 데이터 한계와 staleness를 숨기지 않고 원문으로 이동할 수 있어야 한다.
- 기능 B는 복수 모델·가정·민감도·peer 구성 내역을 공개한다.
- 기능 B UI는 행동 권고가 아니라 모델 범위 대비 가격 위치만 표시한다.

### T10. 복기·가설

- 사용자별 데이터 격리, 보존기간, 삭제·내보내기, 기기 변경을 구현한다.
- I10은 역사 `as_of` replay로 먼저 검증하고 실제 신규 공시 scheduler를 함께 구현한다.
- 과거 snapshot을 새 데이터로 덮어쓰지 않는다.

### T13. 배포·운영

- 배포 플랫폼·PostgreSQL·Chroma 영속화 방식을 확정한다.
- secret rotation, backup/restore, migration rollback, provider 장애 runbook을 실제로 재현한다.
- model·prompt·rule·schema 버전과 비용·latency·실패율을 관측한다.

### T14. 기능 D

- 분석 결과에서 주문 경로로 자동 edge를 만들지 않는다.
- paper와 broker sandbox를 모두 완료한다.
- live adapter 코드는 구현하되 기본 비활성, 개인 전용, 별도 server-side gate로 둔다.
- timeout 후 맹목 재시도하지 않고 broker 상태를 조회해 reconcile한다.
- 부분체결·취소·거부·중복 클릭·장마감·잔고부족·stale quote를 테스트한다.
- 공개·데모 배포는 paper-only다.

## 완료 정책

- 하위 체크박스가 모두 통과해야 상위 Task를 완료로 바꾼다.
- 외부 자격증명·권한이 없어 live 호출이 차단돼도 adapter·sandbox·비활성 gate가 검증되면 코드는 완료할 수 있다. 실제 활성 상태는 별도 운영·컴플라이언스 승인으로 관리한다.
- 데이터 원천이 기준을 충족하지 못하는 경우 안전한 `UNVERIFIABLE` 동작과 사용자 설명까지 구현해야 해당 기능이 완료다.
- T15 전에는 “전체 구현 완료”라고 표시하지 않는다.
