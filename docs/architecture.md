# 플레이스픽 AI 아키텍처

## 현재 구현 경계

현재 저장소에는 Java 17 Spring Boot 기반, PostgreSQL·Redis 개발 인프라, Flyway 검증,
Mock 외부 계약, 조건 추출·적응형 후보 검색·0~100 점수·최대 3개 결과·근거 이유의 동기
추천 Core가 있다.
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
    - 후보 정규화·hard filter·지점 안전 중복 제거
    - 검색 provenance·결정론적 0~100 점수·부분 결과·fallback
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
     -> Naver Local 정확도·인기·선호·유형·위치 variant
     -> 정규화·위치 신뢰도/유형/제외 filter·지점 안전 dedup
     -> Provider rank와 variant weight를 보존한 후보 pool
     -> 최대 8개 후보의 Naver Blog 근거·후보별 장애 격리
     -> 서버의 0~100 결정론적 점수·최대 3개
     -> 최종 후보마다 독립된 Elice slot/claim 이유 요청(최대 3개 병렬)
     -> 서버의 slot/claim·grounding 검증
     -> 후보 단위 template fallback 또는 envelope/root 실패 시 전체 fallback
```

LLM은 점수와 순위를 결정하지 않는다. 예산 근거가 없으면 추정하지 않고 warning을
남긴다. `CandidateKey`는 내부 안정 정렬과 다른 추천의 기존 후보 제외에만 쓰고 UUID v4는
최종 후보 선정 뒤 발급한다. 최종 후보가 1~2개면 실패가 아니라 부분 결과로 완료하고 0개만
실패한다. 추출 Draft를 자동 확정하지 않는다.

이유 생성에는 확정 조건 allowlist와 후보별 표시 identity·claim만 전달한다. DB UUID,
내부 evidence ID, 점수·순위와 다른 후보 문맥은 Elice 요청에서 제외하고, 요청 로컬
`p1`~`p3`와 `pN-cM`을 서버가 내부 ID에 다시 연결한다. 후보당 최대 두 번 호출하며
400·인증 실패는 재시도하지 않고 일시 장애와 후보 단위 schema·claim 검증 실패만 한 번
재생성한다. 후보 하나의 최종 실패는 그 후보의 `reasonSource=TEMPLATE`로 격리한다.
HTTP envelope·root schema 실패는 전체 template으로 전환하고 예상하지 못한 내부 예외는
Job 실패 경계로 전파한다. 따라서 후보 수가 `N`이면 이유 생성 호출 수는 `N..2N`이다.

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

다른 추천 요청도 같은 Job·Outbox·Worker 흐름을 재사용한다. 원 Job의 확정 조건과 내부
탐색 회차·candidate fingerprint·variant ID만 복사하고 원 결과는 변경하지 않는다. 검색은
Worker에서 실행하므로 POST는 실행 가능한 탐색에 202를 반환하며, 이후 후보가 0개면 새
Job의 terminal failure로 수렴한다.

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
- 후보 정규화는 수신·유효·식별 불가·위치·유형·제외·중복 수를 폐쇄형 funnel로 남기고
  검색어·장소·주소·URL은 metric label에 사용하지 않는다.
- 조건 추출과 이유 생성은 coarse Provider 결과 외에도 안전한 diagnostic code와 failure
  stage를 보존한다. 이유 생성은 후보별 `source`, 시도 횟수와 재시도 회복 여부를
  low-cardinality metric으로 구분하고 application validator의 예상 거부와 내부 결함을 같은
  fallback으로 합치지 않는다.
- Naver와 Elice는 각각 기본 6·4 permit의 독립 bulkhead를 사용하고 후보별 이유 요청은
  한 Job에서 최대 3개만 병렬 실행한다. permit 대기·거부와 실제 호출 latency를 분리해
  동시성 거부의 0초 표본이 Provider 지연 분포를 왜곡하지 않게 한다.
- `make check`는 실제 Provider를 호출하지 않고 문서·secret·정책까지 한 번 검증한다.
- 직접 실제 Provider 세 시나리오와 로컬 정식 제품 사용자 여정은 CASE-0002로 검증했다.
  이 증거의 이유 생성 경계는 당시 v2 batch이며, 현재 후보별 v3의 실제 품질 campaign과
  cloud 배포 사용자 여정은 각각 별도 증거로 만든다.
- 측정하지 않은 정확도·지연·처리량을 성과로 주장하지 않는다.
