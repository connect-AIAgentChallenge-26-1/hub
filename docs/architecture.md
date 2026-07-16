# 플레이스픽 AI 아키텍처

## 현재 구현 경계

현재 저장소에는 Java 17 Spring Boot 기반, PostgreSQL·Redis 개발 인프라, Flyway 검증,
Mock 외부 계약, 조건 추출·후보 처리·점수·Top 3·근거 이유의 동기 추천 Core가 있다.
정식 익명 Session·Draft·202 Job·Outbox·Redis Worker·결과 조회, 추천·방 SSE,
Room·Vote·최종 확정과 비식별 이벤트 수집 API도 구현돼 있으며 PostgreSQL·Redis
Testcontainers 통합 테스트가 핵심 계약을 검증한다. Next.js 제품 route와 개발 전용 Live
Playground도 저장소에 있다.

제품 Java adapter로 실제 Naver와 Elice를 연결한 세 합성 사용자 흐름을 2026-07-16 직접
검증했으며 과정과 결과는
[CASE-0002](case-studies/CASE-0002-naver-elice-linked-live-user-flow.md)에 보존한다.

아직 검증되지 않은 경계는 Vercel·Render·Neon·Upstash 실제 cloud 리소스와 secret 주입,
배포된 정식 API→Worker→실제 Provider→브라우저 전체 E2E다. 코드·로컬 자동 검증과 실제
Provider Core 검증을 cloud 배포 완료로 표현하지 않는다. 추천·방 SSE는 실제 HTTP wire
통합 테스트에서 snapshot-first, heartbeat, 재연결, terminal close와 연결 정리를
검증했다.

## 현재 모듈 책임

```text
backend
  domain/application
    - 조건 모델과 확인 경계
    - 후보 정규화·hard filter·중복 제거
    - 결정론적 점수·Top 3·fallback
    - Session·Draft·Job·Room·Vote·이벤트 application service
  adapter
    - Naver Local·Blog HTTP
    - Elice Chat Completions HTTP
    - Mock·계약 fixture
  infrastructure
    - Spring Boot·Flyway·Actuator·보안·관측성
    - PostgreSQL repository와 transactional outbox
    - Redis Streams relay·consumer·retry·DLQ
    - Job/Room persisted event와 SSE emitter

frontend
  - Next.js 제품 route와 same-origin API client
  - Mock 사용자 여정·접근성 E2E
  - live-dev 전용 단계별 Playground

PostgreSQL / Redis
  - PostgreSQL: Session·Draft·Job·Outbox·결과·Room·Vote·이벤트 정본
  - Redis Streams: 추천 작업 전달, pending claim, retry·DLQ
```

domain과 application은 Naver·Elice DTO, HTTP, JPA와 Redis에 의존하지 않는다. Provider는
`ConditionExtractionPort`, `PlaceSearchPort`, `BlogSearchPort`,
`GroundedReasonGenerationPort` 뒤에 둔다. 외부 호출은 DB transaction 안에서 실행하지
않는다.

## 추천 Core

```text
자연어 입력
  -> ConditionExtractionPort
  -> 사용자가 조건을 검토·수정·확정
  -> RecommendationCoreUseCase(ConfirmedRecommendationCondition)
     -> Naver Local 후보
     -> 정규화·위치/유형/제외 filter·dedup
     -> 부족하면 최저 priority 선호 한 번 완화
     -> 최대 5개 후보의 Naver Blog 근거
     -> 서버의 0~80 결정론적 점수·Top 3
     -> Elice 근거 문장 batch
     -> 서버의 place/evidence 검증 또는 전체 template fallback
```

LLM은 점수와 순위를 결정하지 않는다. 예산 근거가 없으면 추정하지 않고 warning을
남긴다. `CandidateKey`는 내부 안정 정렬에만 쓰고 UUID v4는 Top 3 선정 뒤 발급한다.
추출 Draft를 자동 확정하지 않는다.

## 현재 정식 서비스 흐름

```text
Browser
  -> Next.js same-origin proxy
    -> API role
      -> PostgreSQL: session, draft, job, outbox, result, room, vote
      -> Outbox relay -> Redis Streams
        -> Worker role
          -> RecommendationCoreUseCase
          -> PostgreSQL result and processing state
      -> PostgreSQL snapshot·event + SSE delivery
```

하나의 Java artifact가 `api`, `worker`, `all` 역할을 제공한다. 로컬·무료 demo는 자원
제약 때문에 `all`을 사용할 수 있지만 상시 운영에서는 API와 Worker를 분리한다.
Job과 outbox는 같은 PostgreSQL transaction에 저장하고, Worker는 at-least-once 전달,
멱등 처리, commit 후 ACK와 DLQ를 사용한다. Redis Streams는 추천 작업 queue이며 SSE
fan-out 용도가 아니다.

추천 SSE는 `recommendation_job_event`를 저장한 뒤 같은 JVM emitter에 전달하고, 분리된
API·Worker role에서는 API가 DB event를 polling해 수렴한다. 방 SSE는
`voting_room_event` 저장과 같은 JVM after-commit fan-out을 사용한다. 무료 demo의 `all`
role에서는 한 process 안에서 동작하지만 API를 수평 분리할 때는 방 event의 cross-instance
polling 또는 별도 pub/sub를 보강해야 한다. 모든 경우 PostgreSQL snapshot이 사용자 상태의
정본이다.

세부 결정은 [ADR-0006](adr/ADR-0006-api-worker-outbox-events.md), 프런트 경계는
[ADR-0008](adr/ADR-0008-frontend-same-origin-boundary.md)을 따른다.

## Provider 실행 경계

```text
Mock
  local / test / required CI / make check
  fake credential + deterministic fixtures

Local Live
  explicit make dev-live or make live-evidence
  gitignored .env.live.local
  product Java adapters -> NAVER API HUB / Elice

Deployment Live
  Vercel frontend -> same-origin proxy -> Render backend
  Render runtime secrets -> NAVER API HUB / Elice
```

표준 자동 검증은 실제 DNS·HTTP를 호출하지 않는다. 실제 호출은 명시적인 Live 명령에서만
허용한다. 로컬과 배포는 제품 Java adapter를 직접 사용하며 Cloudflare Approval Gate,
Provider Gateway, Split/Linked 전용 Loopback Gateway는 MVP에 사용하지 않는다.

원본 Naver key, Elice token과 routing URL은 로컬 `.env.live.local` 또는 Render secret
store에만 둔다. Git, GitHub Actions, Vercel browser bundle과 artifact에는 넣지 않는다.
GitHub Actions에는 배포에 필요한 최소 scope credential만 둔다. 이 단순화한 신뢰 경계와
잔여 관리자 위험은 [ADR-0014](adr/ADR-0014-mvp-direct-provider-and-simplified-trust-boundary.md)를
따른다.

Mock 성공, 실제 Provider 성공, 사람이 실제 값을 확인한 결과와 cloud E2E는 서로 다른
증거다. 현재 직접 adapter의 실제 사용자 여정 증거는
[CASE-0002](case-studies/CASE-0002-naver-elice-linked-live-user-flow.md)가 서술 정본이며,
과거 Gateway 기반 증거는 `docs/archive/`에만 보존한다. 2026-07-16에는 Live Playground
브라우저뿐 아니라 정식 API·PostgreSQL·Redis Worker·추천/방 SSE·별도 참여자 투표와
최종 확정의 로컬 실제 Provider 흐름도 통과했다. 이는 cloud topology 검증과 구분한다.

## 무료 Demo 목표

```text
Browser
  -> Vercel Hobby Next.js
    -> same-origin API/SSE proxy
      -> Render Free Singapore: Java 17 role=all
        -> Neon Free PostgreSQL
        -> Upstash Free Redis Streams
        -> NAVER API HUB / Elice
```

Render Free의 sleep·cold start, 단일 process와 무료 한도를 수용하는 포트폴리오 demo다.
상시 운영이나 SLA 환경으로 표현하지 않는다. Vercel proxy를 통과하는 SSE는
`Last-Event-ID`와 DB snapshot으로 복구해야 한다. Worker는 Upstash TLS Redis protocol을
사용한다.

PP-043에서 실제 image, migration, secret scope, 배포 SHA, 대표 E2E, cold start와 rollback을
검증하기 전에는 배포 완료로 표시하지 않는다. 플랫폼 선택과 재검토 조건은
[ADR-0010](adr/ADR-0010-free-demo-deployment-boundary.md)을 따른다.

## 품질과 관측성

- 단위 테스트는 Docker 없이 순수 규칙을 검증한다.
- 통합 테스트는 Testcontainers PostgreSQL·Redis와 Mock HTTP 계약을 사용한다.
- Eval은 schema, 근거 연결, 금지 주장과 fallback을 검증한다.
- `make check`는 실제 Provider를 호출하지 않고 문서·secret·정책까지 한 번 검증한다.
- 직접 실제 Provider 세 시나리오와 로컬 정식 제품 사용자 여정은 CASE-0002로 검증했고,
  cloud 배포 사용자 여정은 PP-043에서 별도 증거를 만든다.
- 측정하지 않은 정확도·지연·처리량을 성과로 주장하지 않는다.
