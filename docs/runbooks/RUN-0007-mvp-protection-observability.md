---
id: RUN-0007
title: MVP 요청 보호·Provider 보호·관측성 대응
type: runbook
status: draft
date: 2026-07-16
owners:
  - placepick-team
related:
  - ../architecture.md
  - RUN-0006-free-demo-deployment-and-rollback.md
---

# RUN-0007 MVP 요청 보호·Provider 보호·관측성 대응

## 목적과 현재 경계

이 절차는 MVP 데모에서 과도한 API 요청, 외부 Provider quota 고갈, 추천 작업 장애,
Redis Streams DLQ, SSE 연결 급증과 투표 경합을 탐지하고 안전하게 완화하기 위한 기준이다.
현재 배포 기준은 Render의 `PLACEPICK_ROLE=all` 단일 인스턴스다. 따라서 API와 Worker,
retention schedule이 한 JVM에서 실행된다. 향후 API와 Worker를 별도 인스턴스로 분리하면
retention delete 자체는 조건부 `DELETE`라 재실행에 멱등적이지만, 두 역할에서 같은 schedule을
동시에 실행하지 않도록 한 역할에만 leader/lease를 부여해야 한다.

이 Runbook은 코드·Mock 검증 이후 실제 Prometheus/Grafana와 배포 프록시 경로를 확인하기
전까지 `draft`다. 측정하지 않은 처리량과 경보 임계값은 성공 기준으로 주장하지 않는다.

## 요청 rate limit

- `/api/v1/**`의 `OPTIONS`를 제외한 요청에 session 기준 분당 60회와 IP 기준 분당
  120회를 각각 적용한다. 어느 한쪽이라도 초과하면 RFC 9457 Problem Details,
  `errorCode=RATE_LIMITED`, HTTP 429와 양의 `Retry-After`를 반환한다.
- 키는 원문 session token과 IP가 아니라 SHA-256 지문만 메모리에 보관한다. metric label에는
  session, IP, URL query, resource ID를 넣지 않고 `scope=session|ip`만 사용한다.
- 현재 limiter는 JVM별 in-memory sliding window다. 재시작하면 상태가 초기화되고 여러
  instance에서는 허용량이 instance 수만큼 늘어날 수 있으므로 단일 instance의 MVP 완화책이다.

### Vercel → Render 전달 주소 검증 gate

`server.forward-headers-strategy=framework`는 최종 `remoteAddr`가 신뢰할 수 있는 ingress가
정리한 Forwarded/X-Forwarded-For 값이라는 가정에 의존한다. 브라우저가 임의로 보낸 header를
Vercel/Render가 제거하거나 재작성한다는 사실을 실제 배포에서 확인하기 전에는 IP별 보호를
검증 완료로 표시하지 않는다.

1. Vercel 경유로 서로 다른 두 네트워크에서 동일 API를 호출한다.
2. 원문 주소를 로그에 출력하지 않은 채 각 네트워크가 서로의 rate-limit bucket을 공유하지
   않는지 429 동작으로 확인한다.
3. 브라우저가 위조한 `X-Forwarded-For`를 보내도 임의 bucket을 선택할 수 없는지 확인한다.
4. 하나라도 실패하면 IP limiter를 보안 경계로 사용하지 말고, Vercel/Cloudflare edge에서
   신뢰할 수 있는 client identity 기반 제한을 적용하거나 Render 앞 trusted proxy 설정을
   확정할 때까지 session 제한만 보조 방어로 취급한다.

### 분산 limiter로 전환하는 조건

다음 중 하나라도 참이면 in-memory 구현을 유지하지 않는다.

- API instance가 2개 이상이거나 autoscaling을 사용한다.
- deploy/restart 때 bucket 초기화가 quota 또는 abuse 위험을 만든다.
- load balancer 분산 때문에 동일 client의 429 결과가 instance별로 달라진다.
- `placepick_rate_limit_rejected_total` 증가나 Provider quota 사고가 단일 instance 완화로
  통제되지 않는다.
- 최대 bucket 수 포화가 반복되거나 계정/IP 간 공정성이 제품 요구가 된다.

전환 구현은 Upstash/Redis의 원자적 Lua token bucket 또는 검증된 edge rate limit을 사용한다.
키에는 동일한 비가역 지문과 TTL만 저장하고, 외부 계약인 429·`Retry-After`는 유지한다.
Redis 장애 시 무제한 fail-open이나 전면 fail-closed를 암묵적으로 선택하지 말고 endpoint별
위험을 ADR로 정한다. 전환 전후에는 다중 instance 동시성·TTL·clock skew·재시작 회귀를
부하 실험으로 비교한다.

## Provider 동시성·quota·timeout 보호

Naver Local/Blog와 Elice condition/reason 호출은 JVM 전체의 공정한 semaphore를 공유한다.
기본 동시성은 2, permit 대기는 100ms다. 구성 범위는 1~64로 제한하며 측정 없이 값을 올리지
않는다. permit을 얻지 못하면 Provider를 실제 호출하지 않고 안전한 실패 결과로 바꾼다.
HTTP adapter의 retry와 redirect는 계속 0회다.

주요 metric은 다음과 같다.

| 목적 | Prometheus metric | 고정 label |
| --- | --- | --- |
| Provider 결과 | `placepick_provider_calls_total` | `provider`, `operation`, `outcome` |
| Provider 평균 지연 | `placepick_provider_latency_seconds_*` | `provider`, `operation` |
| Provider 활성 호출 | `placepick_provider_active` | 없음 |
| 429/quota 보호 | `placepick_provider_quota_protected_total` | `provider` |
| timeout budget 초과 | `placepick_provider_timeout_budget_exhausted_total` | `provider`, `operation` |

`rate_limited`, `concurrency_rejected`, `timeout`, `unavailable`이 증가하면 해당 Provider 신규
호출을 늘리지 않는다. credential·request/response body·query는 로그나 metric에 넣지 않는다.
Provider 콘솔 quota와 비교한 뒤 동시성 감소, 사용자 429, 기능의 명시적 degraded 처리를
선택한다. 인증 실패는 재시도하지 않고 RUN-0005의 rotation 절차로 이동한다.

## 추천·Streams·SSE·투표 진단

Grafana의 `PlacePick MVP Runtime` dashboard에서 다음 순서로 확인한다.

1. `Job stage transitions`와 `Job outcomes and degraded completions`를 비교해 정체 stage와
   완료/실패/degraded 비율을 찾는다.
2. `Provider calls`와 `Provider mean latency`로 외부 지연과 application 정체를 구분한다.
3. `DLQ events (15m)`가 0보다 크면 자동 재주입하지 않는다. poison reason, DB snapshot과
   처리 이력을 확인하고 원인을 수정한 새 SHA에서 event ID 멱등성을 검증한 뒤 재처리한다.
4. `Active SSE connections`가 트래픽 종료 뒤 감소하지 않으면 emitter timeout·completion과
   client reconnect 간격을 확인한다. resource ID를 metric label에 추가하지 않는다.
5. `Vote contention (15m)`이 증가하면 `placepick_vote_write_seconds_*`와 DB lock 대기를 함께
   확인한다. DB unique constraint와 transaction을 우회하는 Redis 집계를 정본으로 만들지 않는다.

초기에는 alert threshold를 임의 수치로 고정하지 않는다. 정상·장애 fixture 및 PP-034 부하
실험에서 baseline을 얻은 뒤 연속 관측 구간, 최소 traffic 조건, false positive를 포함해
성능·비율 경보 규칙을 별도 변경으로 승인한다. 현재 Prometheus에는 기준선이 필요 없는
불변식 신호만 둔다. 10분 내 DLQ 유입, Provider 인증 실패, Provider quota/rate-limit 응답이
각각 1분 이상 관측되면 warning 상태가 되고 이 Runbook으로 연결된다. Alertmanager와 외부
메시지 전송은 아직 구성하지 않았으므로 `make observe`의 Prometheus Alerts 화면에서 확인한다.

## 만료 데이터 정리

매시간 정리는 FK 안전 순서로 만료 방, 연결 해제 가능한 draft/job, job, draft,
idempotency record, 24시간이 지난 처리 이력과 발행 outbox, 참조되지 않는 만료 session을
삭제한다. 제품 이벤트는 별도 30일 retention schedule이 처리한다. Provider 원문, token과
cookie는 애초에 저장하지 않는다.

삭제 수가 예상보다 급증하면 schedule을 중지하고 DB backup/point-in-time recovery 가능 여부,
현재 UTC, TTL 설정과 참조 관계를 먼저 확인한다. cleanup SQL을 수동으로 범위를 넓혀 실행하지
않는다. 보존 기간 변경은 개인정보 목적과 운영 복구 필요를 함께 검토하고 1초~30일 운영 이력
범위 검증을 유지한다.

## 로그·비밀 사고 대응

production은 request detail과 오류 stack/body 노출을 끄며, Bearer/header/cookie/session token,
API key 및 `rediss://user:password@host` 같은 URI userinfo를 최종 converter에서도 가린다.
이는 마지막 방어선이지 비밀을 로그 호출 인자로 넘길 권한이 아니다.

비밀 원문이 로그에서 발견되면 해당 로그만 지우고 끝내지 않는다. 접근을 제한하고 영향 기간과
다운로드 이력을 보존한 뒤 Provider token, DB/Redis password, session signing material을
교체한다. 새 비밀로 배포하고 이전 자격 폐기를 확인한 다음 secret scan과 redaction 회귀
테스트를 통과시킨다.

## 검증과 rollback

1. Java 17에서 `make check`로 단위·통합·문서·secret 검사를 통과시킨다.
2. `make observe` 후 dashboard JSON provisioning과 Prometheus target을 확인한다.
3. 합성 session으로 429·`Retry-After`, Provider Mock 오류, DLQ fixture, SSE 연결 해제와
   동시 투표를 재현한다. 실제 Provider 원문과 비밀은 사용하지 않는다.
4. 실제 Vercel→Render 환경에서는 위 전달 주소 gate와 production origin/cookie/header를
   별도로 확인한다.
5. 회귀가 있으면 설정값만 무리하게 완화하지 말고 마지막 정상 SHA로 RUN-0006 롤백을 수행한다.

검증 증거가 확보되기 전에는 이 문서를 `verified`로 변경하지 않는다.
