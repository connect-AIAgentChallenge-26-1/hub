# 현재와 목표 아키텍처

## 현재 경계

현재 저장소는 루트 Gradle 멀티 프로젝트와 `backend` Spring Boot 모듈로
구성한다. 환경 단계의 공개 HTTP 표면은 Actuator health와 Prometheus endpoint로
제한한다. 추천·투표·SSE 같은 비즈니스 기능은 계약이 확정되는 후속 단계다.

```text
Developer / Agent
  -> Makefile and scripts
    -> Gradle :backend
    -> Docker Compose local services
    -> documentation policy checks

Spring Boot
  -> PostgreSQL (schema authority: Flyway)
  -> Redis
  -> Mock Naver API
  -> Mock LLM API
  -> Actuator -> Prometheus -> Grafana
```

Naver Java adapter와 Elice transport·schema의 Mock 자동 검증은 통과했다. 2026-07-14
최종 Local Live에서 Naver Local·Blog는 SHA `128692bd...`, Elice 합성 Chat·Embedding은
SHA `e619066...`에서 각각 2xx와 필수 schema를 통과했다. 최초 `INVALID_RESPONSE`와
`PROVIDER_UNAVAILABLE` 관찰은 Work Record·Troubleshooting에 이력으로 남긴다.

이 개별 성공은 provider 간 연결의 구현 증거가 아니다. 조건 추출, 사용자 확인, 후보
정규화·점수화·Top 3와 근거 문장을 연결하는 동기 use case와 Mock workflow는 구현됐다.
Mock core는 PP-040에서 정상·완화·후보 부족·Blog degraded·LLM fallback의 다섯 흐름으로
보강했고 모두 자동 검증됐다. Split Live는 2026-07-15 병합 `main`에서 한 번 실행했지만
safe failure로 종료했다. Linked harness는 첫 조건 추출 실패와 이유 schema의
`uniqueItems` 400을 수정한 뒤 최종 SHA `e789af65...`에서 세 allowlist 사용자 시나리오가
실제 Elice→Naver Local·Blog→core→Elice 이유 흐름을 `7/6/6`회로 모두 통과했다.
동기 Linked core는 `implemented`지만 Split은 계속 `specified`이고 공개 HTTP 표면은
여전히 Actuator로 제한한다.

## 책임 경계

- Compose는 사람이 실행하는 장기 로컬 서비스와 관측성·부하 도구를 제공한다.
- Testcontainers는 테스트 프로세스가 PostgreSQL과 Redis의 생명주기를 소유한다.
- WireMock은 외부 Naver·LLM 응답, 오류와 timeout 계약을 재현한다.
- Flyway migration이 스키마를 만들고 JPA는 시작 시 매핑을 검증한다.
- k6는 환경 단계에서 health smoke만 수행하며 비즈니스 API 부하는 구현 후 추가한다.

통합 테스트 CI에 Compose service container를 함께 띄우지 않는다. 서로 다른
생명주기 관리자가 같은 의존성을 중복 제공하면 포트 충돌과 환경 차이를 만든다.

## 목표 모듈 규칙

후속 도메인 구현은 Controller, application, domain, adapter 경계를 유지한다.
외부 API DTO를 도메인·Entity에 노출하지 않고 외부 호출을 DB 트랜잭션 내부에서
수행하지 않는다. 추천 요청은 `RecommendationJob` 저장 후 Redis Streams 이벤트를
발행하고 Worker가 처리하는 비동기 흐름으로 확장한다.

## 품질과 관측성

단위 테스트는 Docker 없이 순수 규칙을 검증한다. 통합/계약 테스트는 실제 DB·Redis
프로토콜과 mock 외부 계약을 검증한다. 현재 Eval은 fixture 형식과 외부 연동 안전
정책을 검증하고, LLM 기능이 생기면 입력·출력 형식과 금지 표현 검증으로 확장한다.
k6는 현재 health smoke만 수행하고 API 계약·부하 특성 검증은 비즈니스 API 구현 후
추가한다. 도메인 메트릭은 기능이 생긴 뒤 낮은 cardinality로 추가하며 측정 전
수치를 문서 성과로 주장하지 않는다.

## 승인된 목표 흐름

아래 구조는 [서비스 완성 roadmap](roadmap.md)의 구현 목표이며 현재 구현 완료를
뜻하지 않는다.

```text
Browser
  -> Next.js same-origin proxy
    -> API role
      -> PostgreSQL: session, draft, job, outbox, result, room, vote
      -> Outbox relay -> Redis Streams
        -> Worker role
          -> Naver search port -> Mock or NAVER API HUB adapter
          -> LLM port -> Mock or Elice Chat Completions adapter
          -> PostgreSQL result and processing state
      -> DB snapshot + Redis Pub/Sub -> SSE
```

PP-009·PP-014~PP-016은 Worker에 앞서 다음 동기 core를 검증한다. 이 core는 구현됐지만
아직 제품 runtime·공개 API·Worker에 연결되지 않았다.

```text
ConditionExtractionPort
  -> 사용자 확인·수정
    -> RecommendationCoreUseCase(ConfirmedRecommendationCondition)
      -> PlaceSearchPort / BlogSearchPort
      -> 정규화·hard filter·dedup·0~80 점수·Top 3
      -> GroundedReasonGenerationPort
      -> 서버 검증·fallback·공유 문구 조합
```

추출 결과를 자동 추천에 넣지 않고, `CandidateKey`는 내부 안정 정렬에만 사용하며
UUID v4는 Top 3 선정 뒤 발급한다. 이 동기 core가 완료돼도 Job·Outbox·Streams·SSE는
PP-011~PP-019에서 별도로 검증한다.

하나의 Java 17 Spring Boot artifact가 `api`, `worker`, `all` 역할을 제공한다. 로컬은
`all`을 사용하고 운영용 Compose는 같은 image를 API와 Worker로 분리한다. 프런트는
별도 Next.js runtime이지만 브라우저 관점에서는 same-origin을 유지한다. 세부 결정은
[ADR-0006](adr/ADR-0006-api-worker-outbox-events.md)과
[ADR-0008](adr/ADR-0008-frontend-same-origin-boundary.md)을 따른다.

## 데이터와 전달 정합성 목표

- Job과 outbox event는 한 PostgreSQL transaction에 저장한다.
- relay와 Worker는 at-least-once 전달을 전제로 모든 처리 단계를 멱등하게 만든다.
- Worker는 DB commit 뒤에만 Streams message를 ACK한다.
- 제한 재시도 뒤 처리할 수 없는 event는 DLQ에 격리하고 Runbook과 metric으로
  연결한다.
- DB snapshot이 사용자 상태의 정본이며 Redis Pub/Sub은 SSE의 일시적 fan-out이다.
- 투표의 최종 정합성은 DB unique constraint와 transaction으로 보장하며 Redis
  집계는 DB에서 재계산할 수 있어야 한다.

## Provider와 실행 환경 목표

application은 Naver·Elice DTO가 아니라 검색·조건 추출·설명 생성 port에 의존한다.
외부 실행 환경은 다음 세 경계를 사용한다.

```text
Mock
  -> local / test / load / required CI
  -> fake credential + WireMock

Local Live
  -> reviewed developer commit
  -> gitignored .env.live.local
  -> isolated provider contract tasks
     -> Naver: NAVER API HUB Local 1 call + Blog 1 call
     -> Elice: synthetic Chat 1 call + Embedding 1 call
  -> Split Live Probe (specified: first run failed safely)
     -> Elice synthetic extraction 1 call
     -> Naver Local 1 call + Blog 1 call
     -> Elice synthetic grounded reason 1 call
     -> linked=false, Naver-to-Elice data transfer 0
  -> Linked Live harness (synchronous core implemented)
     -> three allowlisted synthetic user scenarios
     -> actual Elice extraction -> Naver Local / Blog -> product core -> Elice reason
     -> strict success 7 / 6 / 6 calls, retry 0, cleanup=true

Deployment Live (planned)
  -> GitHub OIDC -> Approval Gate
  -> short-lived scoped credential -> Provider Gateway
  -> NAVER API HUB
```

검증 증거는 환경과 별도로 `Mock linked`, `Split Live`, `Linked Live`로 구분한다.
`Mock linked`는 합성 Naver·LLM fixture를 같은 application use case로 연결해 규칙과
fallback을 자동 검증한다. `Split Live`는 실제 provider의 제품형 schema를 각각 확인하지만
provider 간 실제 데이터를 연결하지 않는다. `Linked Live`는 PP-040의 별도 승인·
allowlist·Loopback Gateway에서만 실제 데이터를 연결한다. 자동 harness 구현과 실제
Provider 실행 증거는 별도 상태로 검증했으며, 최종 세 invocation이 strict success를
통과했다.

`local`, `test`, `load`와 필수 CI는 Mock adapter만 허용한다. 일반 앱과 표준 검증은
`.env.live.local`을 읽지 않는다. Naver와 Elice Local Live task는 공용 파일을
수동 parsing하되 자기 provider 변수만 하위 JVM에 전달한다. Local Live는 현재
인증·schema만 확인하고 응답을 메모리에서 폐기한다. 배포 Live의 원본 key는 외부
Provider Gateway만 소유하며 공유 Fork, GitHub Actions, Vercel과 Render에는 전달하지
않는다.

Provider Gateway는 Local·Blog GET과 제한된 query만 허용하고 client의 Naver 인증
header를 제거한 뒤 자체 secret을 주입한다. Approval Gate는 사용자의 actor와 승인
SHA·workflow, OIDC issuer·audience·만료와 replay를 검증한다. 이 Gateway 프로그램의
자동 검증과 실제 edge 배포는 별도 상태이며 현재 cloud resource는 배포되지 않았다.

Local·Blog 결과 결합, 후보 영구 저장과 LLM 전달은 사람의 승인 범위에서만 허용한다.
저장소 소유자는 Naver·Elice 양쪽 승인과 주소·도로명 주소를 포함한 현재 전체 문맥의
로컬 Linked 검증을 승인했다고 진술했지만 원문은 이 작업에서 독립 검토하지 않았다.
따라서 PP-040의 고정 합성 입력·메모리 처리·invocation-bound 반복 Gateway 예외만
허용하며 법률·약관 준수나 실제 사용자 데이터 처리 허용을 주장하지 않는다. 각 실행은
새 Gateway·일회성 로컬 자격·독립 호출 예산을 사용하고 HTTP retry와 구분한다. 제품
runtime·영구 저장과 배포에는 이 예외를 자동 적용하지 않는다.

합성 Chat canary는 OpenAI-compatible strict schema만, Embedding canary는 1,536차원
capability만 확인하며 제품 runtime을 활성화하지 않는다. Split Live 이유 생성도
versioned 합성 candidate·evidence만 사용하며 실제 Naver 응답을 Elice에 보내지 않는다.
직접 OpenAI Responses API는 자동 fallback이 아닌 재검토 대안이다. 약관, 비밀과 비용 경계는
[ADR-0009](adr/ADR-0009-mock-local-live-gateway-boundary.md)과
[ADR-0011](adr/ADR-0011-elice-chat-completions-provider-boundary.md), 핵심 core와 단계별
검증 경계는 [ADR-0012](adr/ADR-0012-recommendation-core-and-split-live-boundary.md),
Linked Live는 [ADR-0013](adr/ADR-0013-naver-elice-linked-live-boundary.md)을 따른다.

## 무료 데모 배포 목표

아래 topology는 PP-033·PP-035에서 검증할 포트폴리오 demo 목표이며 현재 배포된
서비스가 아니다.

```text
Browser
  -> Vercel Hobby Next.js
    -> same-origin API/SSE proxy
      -> Render Free Singapore: Java 17 role=all
        -> Neon Free PostgreSQL
        -> Upstash Free Redis Streams
        -> Provider Gateway -> NAVER API HUB
```

Render Free에는 독립 무료 Worker가 없어 demo에서만 같은 artifact의 `all` 역할을
사용한다. idle sleep·cold start, 단일 process와 무료 한도를 수용하므로 상시 운영이나
SLA 환경으로 표현하지 않는다. Vercel proxy를 통과하는 SSE는 연결 종료 뒤
`Last-Event-ID`와 DB snapshot으로 수렴해야 한다. Upstash REST는 blocking Streams
consumer를 지원하지 않으므로 Worker는 TLS Redis protocol을 사용한다.

플랫폼 선택과 재검토 조건은
[ADR-0010](adr/ADR-0010-free-demo-deployment-boundary.md)을 따른다. 실제 canary,
edge와 demo 배포 성공은 각각 실행 증거가 생긴 뒤에만 이 문서의 현재 경계로 옮긴다.
