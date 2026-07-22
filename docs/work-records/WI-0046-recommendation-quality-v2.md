---
id: WI-0046
title: PP-044 추천 품질 v2와 운영 진단 기반
type: work-record
status: in-progress
date: 2026-07-16
owners:
  - placepick-team
related:
  - https://github.com/gdh0730/hub/issues/59
  - ../contracts.md
  - ../architecture.md
  - ../adr/ADR-0015-retrieval-ranking-v2.md
  - ../adr/ADR-0016-grounded-reason-v3.md
  - ../adr/ADR-0017-production-otlp-observability.md
  - ../adr/ADR-0018-condition-recovery-embedding-shadow.md
  - ../runbooks/RUN-0007-mvp-protection-observability.md
paths:
  - backend/src/main/java/com/placepick/recommendation/**
  - backend/src/main/java/com/placepick/infrastructure/external/llm/**
  - backend/src/main/java/com/placepick/infrastructure/observability/**
  - backend/src/test/**
  - backend/src/integrationTest/**
  - backend/src/evalTest/**
  - frontend/src/features/live-playground/**
  - frontend/src/features/product/**
  - frontend/e2e/**
  - observability/**
  - docs/**
  - AGENTS.md
  - backend/AGENTS.md
  - README.md
  - scripts/test.sh
  - Makefile
---

# WI-0046 PP-044 추천 품질 v2와 운영 진단 기반

## 문제와 근거

실제 Live Playground에서 같은 조건은 결정론적으로 같은 후보를 반환했지만, 일부 입력은
유효 후보가 세 개보다 적어 실패했고 Elice 이유 검증 실패는 전체 템플릿 대체로 끝났다.
Provider 호출 자체는 정상이었으므로 검색 회수·필터·근거 검증의 어느 경계가 원인인지
코드와 metric을 대조했다.

Naver Local은 공식 계약상 한 번에 최대 다섯 항목만 반환하지만 현재 Core는 한두 번만
검색한다. 후보는 link 누락, 위치·유형·제외 조건과 중복 단계에서 제거되지만 탈락 수가
결과에 남지 않는다. Elice client도 상세 boundary code를 계산한 뒤 coarse
`invalid_response`로 축약하고, 이유 service는 예상하지 못한 RuntimeException까지 fallback으로
바꿔 내부 결함과 안전한 저하를 구분하지 못한다.

## 목적과 성공 기준

전체 목적은 후보 부족을 실패로 숨기지 않으면서 검색 범위와 근거 품질을 높이고, 그 변화가
어느 단계에서 효과를 냈는지 안전하게 관측하는 것이다. 첫 단계에서는 추천 동작을 바꾸기
전에 후보 funnel과 LLM 실패 원인을 폐쇄형 코드로 보존하고 v1 baseline을 재현했다.

- 후보 수신·탈락·중복·유효 수의 합이 항상 일치한다.
- 조건·이유 진단 코드는 Provider 원문 없이 port, metric과 Live Playground까지 전달된다.
- 예상 Provider·검증 실패만 fallback하고 내부 계약 위반은 실패 경로로 전파된다.
- 동시성 permit 거부가 Provider latency에 0초 표본으로 섞이지 않는다.
- 검색어·장소·주소·URL·prompt·응답·비밀은 일반 telemetry와 test report에 남지 않는다.

두 번째 단계에서는 다중 검색·부분 결과·다른 추천과 점수 v2를 구현했다. 세 번째 단계에서는
후보별 이유 v3, 네 번째 단계에서는 조건 추출 복구와 Embedding shadow 평가 기반을
구현했다. 다섯 번째 단계에서는 production OTLP 코드·dashboard·alert 검증 기반을 구현한다.
실제 Grafana Cloud 수집과 실제 Provider 품질 campaign은 별도 실증으로 남겨 코드 계약과
외부 결과를 구분한다.

## 판단 기준과 선택

문제를 해결하는 기준은 사용자 영향과 내부 원인을 분리하는가, metric label이 유한한가,
실제 값 없이도 같은 장애를 재현할 수 있는가, 이후 품질 변경의 전후 비교가 가능한가다.

자유 문자열 진단과 응답 body 로깅은 원인 설명은 쉬워도 비밀·개인정보와 cardinality 위험이
커 제외한다. 각 경계의 사유를 enum으로 제한하고 count·duration·token 수만 telemetry에
남긴다. Live Playground는 로컬 개발 화면이므로 실제 정제 값을 계속 보여 주되 일반 로그와
OTLP에는 전달하지 않는다.

## 구현·검증 기록

첫 PR은 기존 검색·랭킹·공개 API 동작을 바꾸지 않고 다음 진단 기반을 구현했다.

- 후보 정규화는 수신, 유효, 식별 불가, 위치, 유형, 제외 조건과 중복 수를 하나의 누적
  funnel로 보존한다. 완화 검색에서는 최종 snapshot만 metric에 한 번 기록해 최초 응답을
  중복 합산하지 않는다. 0개 후보도 Distribution Summary 표본으로 남는다.
- Elice 조건·이유 outcome은 coarse error와 함께 폐쇄형 diagnostic code와 failure stage를
  보존한다. 서버 이유 validator의 거부도 별도 code로 기록한다.
- 이유 service는 예상 Provider·검증 실패만 fallback한다. null outcome과 예상하지 못한
  RuntimeException은 내부 계약 실패로 전파한다.
- Provider permit 대기와 거부를 실제 호출 latency에서 분리했다. 거부 호출의 0초 표본은
  Provider latency와 timeout budget에 포함하지 않는다.
- Live Playground는 후보 탈락 수와 안전 진단 code를 표시하며 실제 응답 원문은 추가로
  노출하지 않는다.
- Grafana runtime dashboard와 RUN-0007은 후보 funnel, LLM 진단과 permit 지표를 사용하도록
  갱신했다. Prometheus scrape 이름을 단위 테스트에서 dashboard 계약과 직접 대조한다.

Java 17·Node 24 Dev Container의 `make check`에서 문서 정책과 여섯 음성 fixture, Java
단위 178개·Testcontainers 통합 159개·Eval 7개, 프런트 typecheck·35개 Vitest·production
build, Compose, ShellCheck, actionlint와 233개 생성 test report의 비밀 검사가 통과했다.
이 검증은 Mock만
사용했으며 `.env.live.local`과 실제 Naver·Elice를 읽거나 호출하지 않았다. 실제 Provider의
품질 전후 비교는 검색·이유 v2 구현 이후 실행 명령부터 별도로 구현할
실제 Provider 품질 campaign 증거로 남긴다.

두 번째 PR은 첫 PR의 funnel을 근거로 검색 회수와 결과 계약을 변경한다.

- Local 정확도·인기, 독립 선호, 유형 동의어와 위치 alias를 안정적인 variant ID와
  Provider rank로 보존한다. 기본 6회·다른 추천 8회와 목표 pool 10개는 설정 가능한 보호
  값이고 query+sort 중복은 실행하지 않는다.
- 일반 문자열에서 행정구역 접미사를 제거하지 않고 exact·alias·등록 생활권을 구분한다.
  `여의도`가 `여의`로 변하는 결함을 음성 테스트로 고정한다.
- source link를 identity 필수값에서 표시용 nullable 값으로 바꾸고 이름·주소·좌표로 지점을
  구분한다. 같은 홈페이지를 쓰는 서로 다른 지점은 합치지 않는다.
- Blog는 예비 후보 8개, `display=10`, 후보별 장애 격리와 entity confidence·출처 다양성·
  최신성 기준을 적용한다.
- 점수는 위치 신뢰도 15, weighted RRF 30, 선호 근거 30, 근거 품질 25의 0~100으로
  재정의한다. 같은 fixture의 기본 순위는 계속 결정적이다.
- 1~2개 후보는 `partial=true`로 완료하고 투표방까지 사용할 수 있다. 0개만 실패한다.
  완료 Job의 다른 추천 요청은 기존 candidate fingerprint와 variant 이력을 제외한다.

비동기 202와 즉시 409의 충돌도 구현 전에 명시적으로 해결했다. 검색은 Worker에서만
실행하므로 저장된 variant 소진을 요청 전에 확정한 경우만 POST가 409를 반환한다. 202 뒤
실제 미노출 후보가 0개면 새 Job이 `FAILED/NO_ALTERNATIVE_CANDIDATES`로 종료된다. 외부
호출을 HTTP 요청이나 DB transaction으로 옮기는 대안은 기존 불변식을 깨뜨려 제외했다.

최종 정적 검토와 회귀 과정에서 다음 경계도 함께 보강했다.

- Blog는 후보명만 같아서는 연결하지 않고 요청 위치 또는 후보 주소의 지점 신호까지 있어야
  한다. 다른 지역의 같은 상호가 근거로 들어오는 음성 fixture를 추가했다.
- 한 글자 선호인 `뷰`가 `리뷰`의 부분 문자열로 일치하지 않게 조사 경계를 검사한다.
- Blog pool 설정과 실행 불변식의 상한을 모두 8로 맞춰 quota를 사용한 뒤 내부 예외가 나는
  설정을 차단한다.
- V3 이전 후보에서 원래 CandidateKey를 복원할 수 없으면 같은 장소 재노출보다 보수적인
  탐색 소진을 선택한다. 새 lineage는 DB trigger로 root와 round 연속성도 검증한다.
- 대체 Job은 원 Job의 공개 만료 시각을 연장하지 않는다. 살아 있는 room과 idempotency
  응답 기간은 retention에서 lineage 전체를 별도로 보존한다.
- 실행 중 Redis consumer group이 사라지면 group cache를 무효화하고 `0-0`에서 복구한다.
  재전달은 기존 processed event ID 멱등성으로 무해하게 처리한다.
- 프런트는 즉시 409뿐 아니라 202 뒤 후보 0건으로 실패한 경우에도 원 추천으로 돌아간다.
  Mock API도 동일 Idempotency-Key replay를 같은 Job으로 반환한다.
- Local 실패 호출도 `outcome=failure`로 집계하고, 기존 노출 후보 제외 수와 최종 저장·SSE
  완료 snapshot의 부분 결과·점수를 구분해 기록한다.

Java 17·Node 24 Dev Container의 최종 `make check`에서 문서·Compose·ShellCheck·actionlint,
Java 단위 197개·Testcontainers 통합 170개·Eval 7개, 프런트 Vitest 42개와 production build,
205개 생성 report의 비밀 검사가 통과했다. 별도 Playwright는 desktop/mobile 각각에서
Live Playground와 정식 제품 흐름 4개를 통과했다. 제품 흐름은 빠른 중복 클릭을 한 요청으로
제한하고, 대체 결과 2개와 1개, 템플릿 이유, 비동기 후보 소진 뒤 원 결과 복귀, 저장된 소진
409, 두 세션 투표·확정을 검증했다. 이 자동 검증은 Mock만 사용해 실제 Naver·Elice 호출은
0건이었다.

세 번째 PR은 Top 3 batch와 전체 fallback 경계를 후보별 이유 v3로 교체한다.

- 최종 후보마다 `placepick.reason-statements.v3` 요청을 독립 생성한다. 요청에는 확정 조건
  allowlist, 한 후보의 이름·category, `p1`~`p3` slot과 `pN-cM` claim만 포함한다.
  DB UUID, 내부 evidence ID, 점수·순위와 다른 후보 문맥은 Elice에 보내지 않는다.
- 후보 요청은 최대 세 개를 병렬 실행한다. HTTP adapter retry는 0회이고, 후보당 호출은
  최대 두 번이다. 400·401·403은 재시도하지 않으며 429·5xx·timeout과 후보 단위
  schema·claim·grounding 거부만 한 번 재생성한다.
- 두 번째 실패는 해당 후보만 검증된 Local·Blog claim 기반 문장으로 바꾸고 다른 후보의
  생성 결과는 보존한다. envelope·root schema 실패는 결과 전체를 template으로 바꾸며,
  null outcome과 예상하지 못한 내부 예외는 Job 실패 경계로 전파한다.
- 결과는 후보별 `reasonSource=GENERATED|TEMPLATE`를 보존한다. 후보 수가 `N`이면 실제 이유
  호출 수는 `N..2N`이며 시도 횟수·재시도 회복·최종 source를 폐쇄형 metric으로 기록한다.
- Naver와 Elice permit을 기본 6·4의 독립 bulkhead로 분리해 한 Provider 포화가 다른
  Provider를 막지 않게 하고, 후보별 이유 병렬도는 한 추천 안에서 최대 3으로 제한한다.
- 단위·WireMock 통합 fixture는 후보 독립성, 최대 병렬도, 재시도·무재시도 분류,
  `Retry-After`, 부분·전체 fallback, slot/claim 소유권, Blog 출처 귀속, 일반 단어만
  공유한 근거와 금지 속성 거부, redirect·Responses fallback·과대 응답·timeout 차단을
  검증하도록 구성한다.
- v3 claim 정책 Eval은 27개 기준 시나리오에 8개 안전한 문장 변형을 적용해 216개
  결정적 사례를 검증한다. 출처가 다른 claim, 일반 단어만 겹친 문장, 근거 없는 민감
  속성·점수·순위·prompt injection은 허용하지 않는다.

세 번째 단계의 전체 검증에서는 Java 단위 201개, Testcontainers·WireMock 통합 173개,
Eval suite 7개와 프런트 Vitest 42개가 실패 없이 통과했다. 문서 lint·정책·음성 fixture,
Compose, ShellCheck, actionlint, production 프런트 build와 207개 생성 test report의
비밀·payload scan도 통과했다. 일반 `make check` 경로의 실제 Provider 호출은 0건이다.

2026-07-16 CASE-0002의 실제 Provider 실행은 당시 v2 batch를 통과한 역사적 증거다. 이번
v3의 자동 검증과 혼동하지 않으며, v3 실제 Provider 품질은 후속 실행 명령과
campaign을 구현·실행하기 전까지 완료로 주장하지 않는다.

네 번째 PR은 조건 추출 실패를 사용자가 복구할 수 있는 Draft와 Embedding shadow
비승격 경계로 분리한다.

- 조건 추출 LLM 출력에서 서버 계산 항목인 `warnings`를 제거하고, user message를
  `{"requestText":"..."}` JSON data 문자열로 격리했다.
- HTTP adapter retry는 계속 0회다. application은 JSON·Chat schema/구조 오류와
  429·5xx·timeout만 한 번 재생성한다. 400·401·403, model·응답 크기 위반과 내부 예외는
  성공으로 숨기지 않는다.
- 필수 지역·유형이 없거나 두 번째 결과도 재생성 대상 실패이면 기존 `EXTRACTED` Draft에
  부분 조건을 보존하고 `manualEntryRequired=true`를 반환한다. 인증·잘못된 요청·모델·
  응답 크기 위반, refusal, timeout이 아닌 transport 장애와 내부 결함은 수동 복구로 숨기지
  않는다. 사용자가 전체 조건을 확정하면 같은 Draft가 `CONFIRMED`,
  `manualEntryRequired=false`가 된다.
- 정식 API와 Live Playground가 같은 복구 service를 사용한다. 따라서 실제 개발 화면에서도
  비어 있는 지역·유형을 직접 입력해 다음 Naver 검색 단계로 진행할 수 있다.
- 정식 입력 화면은 React hydration이 끝나기 전까지 입력과 제출을 활성화하지 않는다.
  초기 JavaScript가 붙기 전의 빠른 사용자 입력이 기본 예시와 합쳐지거나 덮어써지는 경계를
  desktop·mobile Playwright 시나리오로 재현하고 차단했다.
- `placepick.recommendation.condition.resolutions`는 최종 상태, 시도 수, 회복 여부와
  폐쇄형 diagnostic만 기록한다. 자연어와 Provider 값은 label에 넣지 않는다.
- Elice Embedding batch adapter는 최대 64개 입력, 정확한 model·index·usage와 각
  1,536차원 finite vector를 검증하며 Spring runtime bean으로 등록되지 않는다.
- `preference-embedding-shadow.v1`은 train 10개·holdout 10개 쌍의 40개 텍스트를 정확히
  한 번의 batch로 평가한다. train threshold와 holdout F1·false positive gate만 계산하고
  vector나 corpus 원문을 결과·로그·metric에 보존하지 않는다.
- deterministic vector fixture에서 승격 gate가 동작한 것은 정책 구현 검증이다. 실제
  Elice 모델이 품질 기준을 충족했다거나 runtime 랭킹이 개선됐다는 근거로 사용하지 않는다.

네 번째 단계의 최종 검증에서는 Java 17 기준 `make check`가 성공했다. 단위 229개,
Testcontainers·WireMock 통합 191개, Eval 8개와 프런트 Vitest 45개가 모두 0실패였고,
문서 lint·정책 음성 fixture, Compose, ShellCheck, actionlint, Next.js production build,
운영 JavaScript 의존성 감사와 생성 보고서 219개의 비밀·Provider payload scan도 통과했다.
`make quality-eval`로 이유 정책과 Embedding shadow 승격 정책만 다시 실행해 성공했으며,
lockfile은 `npm ci --dry-run`으로 재현 가능성을 확인했다. 브라우저 E2E 8개는 desktop과
360px mobile에서 일반 추천·부분 대체 추천·두 세션 투표·최종 확정, Live Playground와
정식 제품의 수동 조건 완성 흐름을 모두 통과했다. 초기 hydration 전에 사용자가 입력할 때
기본 예시가 값을 덮어쓰던 결함도 재현한 뒤, hydration 완료 전 입력·제출을 비활성화해
차단했다.

완료 직전 계약 대조에서는 manual Draft와 `PUT` 이후 warning이 최초 응답에 고정되는
불일치를 발견했다. 현재 condition에서 서버가 warning을 재계산하고 JDBC의 condition·
warning JSON을 한 UPDATE로 교체하도록 수정했으며, 기존 stale snapshot도 조회 응답에서
재계산한다. 조건 추출 관측 budget도 HTTP response timeout과 같은 12초 상수로 정렬했다.
실제 HTTP 조합 테스트는 schema 오류 1회 뒤 성공하면 총 2회로 회복하고, 401은 1회만
호출하며, timeout 두 번 뒤에는 두 누락 warning을 가진 manual Draft가 되는지 검증한다.
보고서 검사는 219개 파일마다 프로세스를 반복 생성하지 않고 모든 금지 패턴을 한 번의
`rg` 호출로 검사하도록 단순화했으며, 정상 report 통과와 금지 marker 음성 검사를 확인했다.

Next.js 16.2.10의 optional image dependency가 끌어오던 취약한 `sharp` 0.34.5는 Node 24와
호환되는 exact override `0.35.3`으로 교체했다. production build와 `npm audit`의
`--omit=dev --audit-level=moderate` 검사에서 취약점 0건을 확인했다. 이 모든 자동 검증은 Mock과
합성 vector만 사용했고 실제 Naver·Elice 호출은 0건이다. 따라서 실제 이유 v3 성공률,
실제 Embedding 품질과 production telemetry 수집 완료를 의미하지 않는다.

다섯 번째 PR은 로컬 scrape와 production push의 책임을 분리하고 비동기 trace와 운영 신호를
연결한다.

- production은 Spring Boot·Micrometer·OpenTelemetry OTLP metric·trace·safe log exporter를
  사용한다. endpoint·Basic authorization·정확한 release SHA·role은 시작 guard가 검증하고,
  Prometheus registry와 `/actuator/prometheus`는 production에서 비활성화한다.
- 응답 `X-Trace-Id`와 Problem Details는 active span의 실제 trace ID를 사용한다. Outbox
  envelope v2는 W3C `traceparent`와 선택적인 `tracestate`를 보존하고 Redis Worker가 이를
  복원해 consumer span을 만든다. 과거 v1 envelope도 context 없는 경로로 계속 읽는다.
- Naver·Elice outbound 호출은 provider-neutral CLIENT span을 만들고 W3C carrier만 주입한다.
  요청 URL·query·body, Provider 응답과 예외 원문은 span attribute·event에 넣지 않는다.
- production console은 ECS JSON과 최종 redaction을 사용한다. OTLP log는 폐쇄형 event code,
  release·role과 correlation ID만 쓰는 전용 safe logger로 한정한다. root application log를
  통째로 OTLP에 복제하지 않는다.
- readiness, 미발행 Outbox와 전달 후 ACK되지 않은 Stream PEL의 수·oldest age, stuck Job,
  relay·Worker 결과, LLM input/output token과 중복 제거된 client event를 유한한 label로
  계측한다. PEL을 아직 consumer에 전달되지 않은 전체 stream lag로 표현하지 않는다. snapshot 조회
  실패는 마지막 gauge를 0으로 위장하지 않고 source별 success/failure counter로 드러낸다.
- 프런트는 Web Vitals, SSE 복구, 부분 결과, 다른 추천, 조건 field 변경, cold start 복구와
  client 오류를 폐쇄형 event로만 전송한다. URL, 오류 message·stack과 사용자 입력은 TypeScript
  계약과 서버 validator 양쪽에서 거부한다.
- Grafana dashboard를 일곱 운영 row로 재구성하고 즉시 신호 10개·최소 20표본 품질 신호
  5개를 정의했다. dashboard query·metric 존재·민감 label·alert 표본 gate를 정적 검사하고
  `promtool check rules`와 rule unit test를 `make check` 경로에 연결했다.

이 단계의 자동 증거는 production 설정 guard, envelope v1/v2 호환, Worker parent/child context,
client event allowlist·metric, dashboard·alert 계약의 결정적 fixture다. 실제 Grafana Cloud
endpoint와 자격은 CI에 없으며 실제 Render revision의 metric·trace·log 수집, exporter 장애
주입, Synthetic Monitoring과 notification 전송은 아직 실행 증거가 아니다. direct exporter는
business path를 fail-open으로 유지하지만 collector 디스크 buffer가 없어 전송 장애 시
telemetry 유실 가능성을 수용한다.

최신 Java 17·Node 24 Dev Container에서 전체 `make check`를 다시 실행해 Java 단위·통합·Eval,
프런트 53개 단위 테스트와 production build, 문서·Compose·ShellCheck·actionlint 및 생성된
보고서 235개의 비밀·Provider payload scan이 모두 통과했다. 별도 Playwright는 개발 서버의
Windows bind mount cold compile 지연을 재현한 뒤 E2E 전용 production standalone build로
교체했다. 일반 production build에서는 Mock API와 Playground가 닫히고, E2E build의 명시적
opt-in과 loopback Host에서만 열린다. 이 고정 bundle에서 desktop·360px mobile의 Playground,
조건 직접 보완, 추천 Job·SSE, 부분·대체 추천, 두 세션 투표와 최종 확정 8개 시나리오가 모두
통과했다.

## AI 사용과 사람의 검증

AI에는 코드 경로 감사, 진단 taxonomy와 테스트 초안을 위임한다. 사람은 진단 코드의 공개
경계, fallback 의미, metric cardinality, 실제 값·비밀 비노출과 GitHub 증거를 검증한다.

## 남은 위험과 재검토 조건

검색·랭킹 v2, 부분·대체 추천, 후보별 이유 v3, 조건 추출 제한 복구, Embedding shadow와
production OTLP 코드·로컬 운영 검증 계약을 구현했지만 PP-044 전체가 끝난 것은 아니다.
실제 Grafana Cloud 수집과 exporter 장애 주입, 비개인성 30개 시나리오 품질 campaign은
후속 증거로 남는다. 실제 campaign 전에는 이번 변경이 실제 후보 성공률·이유 생성률,
Embedding 품질 또는 2분 내 telemetry 수집 목표를 달성했다고 주장하지 않는다. Provider
계약, 데이터 이용 조건 또는 무료 관측 한도가 바뀌면 호출 예산·telemetry 수집 범위를
재검토한다.
