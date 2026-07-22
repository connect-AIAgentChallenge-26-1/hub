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
  - ../work-records/WI-0046-recommendation-quality-v2.md
  - ../adr/ADR-0017-production-otlp-observability.md
  - ../adr/ADR-0018-condition-recovery-embedding-shadow.md
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

## production OTLP 설정과 자격 교체

로컬 `make observe`는 `/actuator/prometheus`를 scrape한다. production은 Prometheus
endpoint를 공개하지 않고 애플리케이션이 Grafana Cloud로 직접 OTLP push한다. Render
secret에는 다음 값만 추가한다.

| 변수 | 기준 |
| --- | --- |
| `GRAFANA_OTLP_ENDPOINT` | Grafana Cloud가 제공한 HTTPS `/otlp` base URL, query·userinfo 없음 |
| `GRAFANA_OTLP_AUTHORIZATION` | Grafana Cloud가 제공한 `Basic ...` Authorization 전체 값 |
| `PLACEPICK_TRACE_SAMPLING_PROBABILITY` | 0~1; 무료 데모 최초 확인은 기본 1.0, quota 확인 후 조정 |
| `PLACEPICK_OTLP_METRICS_STEP` | 기본 30초; dashboard 지연과 무료 quota를 함께 보고 조정 |
| `RENDER_GIT_COMMIT` | Render가 제공하는 정확한 40자리 배포 SHA |
| `PLACEPICK_ROLE` | `api`, `worker`, `all` 중 하나; 무료 데모는 `all` |

endpoint와 Authorization은 GitHub·Vercel·Git·Issue·PR·일반 로그에 복사하지 않는다.
production 시작 guard는 endpoint·자격 형식·SHA·role을 검증하지만 Grafana Cloud 접속 성공을
시작 조건으로 삼지는 않는다. exporter는 비동기로 동작하므로 전송 실패가 사용자 요청과
Worker를 실패시키지 않는 대신, 별도 collector buffer가 없어 장애 구간 telemetry가 유실될
수 있다.

### 최초 수집 확인

1. Render secret을 저장한 뒤 승인한 SHA를 배포하고 `/actuator/health/readiness`가 200인지
   확인한다. production의 `/actuator/prometheus`가 노출되지 않는 것도 확인한다.
2. Grafana Explore에서 `service.name=placepick-backend`, 실제 배포 SHA와 일치하는
   `service.version`, `deployment.environment=production`, `placepick.role=all` resource로
   검색한다.
3. 합성 익명 세션 한 건으로 Draft와 추천 Job을 만든다. 응답 `X-Trace-Id`를 복사해 같은
   trace의 API server span, Redis consumer span `placepick.recommendation.consume`, Naver·
   Elice HTTP client span이 이어지는지 확인한다.
4. Metrics에서 `placepick_readiness`, `placepick_outbox_pending`,
   `placepick_stream_pending`, `placepick_job_stuck`, source별
   `placepick_telemetry_snapshot_total`과
   `placepick_telemetry_snapshot_last_success_timestamp_seconds`를 확인한다.
5. Logs에서는 message가 `placepick.event`이고 event code가 폐쇄형인 Worker event만
   OTLP로 들어오는지 확인한다. 자연어·검색어·장소·주소·URL·Provider body와 자격이 하나라도
   보이면 검증을 중단하고 아래 사고 대응으로 이동한다.

세 signal이 같은 release에서 2분 안에 보이지 않으면 운영 관측 완료로 표시하지 않는다.
endpoint/auth 형식, Render outbound 통신, exporter timeout과 Grafana quota를 확인하되 사용자
요청을 반복 실행해 quota를 늘리지 않는다.

### Grafana 자격 교체

1. Grafana Cloud에서 최소 telemetry write scope의 새 access policy token을 만든다.
2. 원문을 터미널 history나 문서에 남기지 않고 Render의
   `GRAFANA_OTLP_AUTHORIZATION`만 새 값으로 교체한다.
3. 새 SHA를 배포해 위 최초 수집 확인을 수행한다.
4. 새 signal의 release SHA와 시각을 확인한 뒤 이전 token을 폐기한다.
5. 이전 token의 접근·사용 이력을 검토하고 유출 가능성이 있으면 관련 기간과 영향 범위를
   남긴다. token 원문은 증거에 포함하지 않는다.

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

Naver Local/Blog와 Elice condition/reason은 서로 독립된 공정한 semaphore를 사용한다.
기본 동시성은 Naver 6, Elice 4이고 Mock은 8이며 permit 대기는 100ms다. 한 Provider의
포화가 다른 Provider 호출을 차단하지 않는다. 구성 범위는 각각 1~64로 제한하며 Provider
콘솔 quota와 실측 없이 값을 올리지 않는다. permit을 얻지 못하면 Provider를 실제 호출하지
않고 안전한 실패 결과로 바꾼다. HTTP adapter의 retry와 redirect는 계속 0회다.

주요 metric은 다음과 같다.

| 목적 | Prometheus metric | 고정 label |
| --- | --- | --- |
| Provider 결과 | `placepick_provider_calls_total` | `provider`, `operation`, `outcome` |
| Provider 평균 지연 | `placepick_provider_latency_seconds_*` | `provider`, `operation` |
| Provider 활성 호출 | `placepick_provider_active` | `provider` |
| Provider permit 대기 | `placepick_provider_permit_wait_seconds_*` | `provider`, `operation` |
| Provider permit 거부 | `placepick_provider_permit_rejected_total` | `provider`, `operation` |
| 429/quota 보호 | `placepick_provider_quota_protected_total` | `provider` |
| timeout budget 초과 | `placepick_provider_timeout_budget_exhausted_total` | `provider`, `operation` |

조건 추출의 관측 budget은 HTTP response timeout과 같은 12초를 사용한다. 따라서 정상적인
응답 timeout을 30초 budget 아래에서 누락하지 않는다. 이유 생성은 별도 30초 budget을
사용하며, connect timeout처럼 각 operation 전체 budget보다 먼저 끝나는 장애는
`outcome=unavailable`과 LLM failure stage로 구분한다.

`rate_limited`, `concurrency_rejected`, `timeout`, `unavailable`이 증가하면 해당 Provider 신규
호출을 늘리지 않는다. credential·request/response body·query는 로그나 metric에 넣지 않는다.
Provider 콘솔 quota와 비교한 뒤 동시성 감소, 사용자 429, 기능의 명시적 degraded 처리를
선택한다. 인증 실패는 재시도하지 않고 RUN-0005의 rotation 절차로 이동한다.

permit 거부는 실제 Provider 호출 지연이 아니므로 `placepick_provider_latency_seconds_*`에
0초 표본으로 넣지 않는다. permit wait p95와 거부 수를 함께 보고 외부 Provider 지연인지
로컬 bulkhead 포화인지 구분한다.

## 추천 품질 진단

후보가 부족하거나 이유가 대체되면 응답 원문을 찾지 말고 다음 안전 지표를 먼저 확인한다.

| 목적 | Prometheus metric | 고정 label |
| --- | --- | --- |
| 최종 후보 funnel | `placepick_recommendation_candidate_funnel_*` | `result`, `reason`, `relaxed` |
| Local variant 호출·수신 | `placepick_recommendation_retrieval_local_*` | `sort`, `expanded`, `outcome` |
| 대체 추천의 기존 후보 제외 | `placepick_recommendation_retrieval_previously_exposed_*` | 없음 |
| Blog 호출 결과 | `placepick_recommendation_retrieval_blog_*` | `outcome` |
| 정상·부분·저하 결과 | `placepick_recommendation_results_total` | `partial`, `degraded` |
| 최종 결과 수·점수 | `placepick_recommendation_result_count_*`, `placepick_recommendation_result_score_*` | `partial` |
| Top 1·2 점수 간격 | `placepick_recommendation_result_score_margin_*` | 없음 |
| 후보별 근거 수준·수 | `placepick_recommendation_evidence_candidates_total`, `placepick_recommendation_evidence_count_*` | `level` |
| LLM Provider 진단 | `placepick_provider_llm_outcomes_total` | `provider`, `operation`, `error`, `stage`, `diagnostic` |
| 조건 추출 최종 해석 | `placepick_recommendation_condition_resolutions_total` | `status`, `attempts`, `recovered`, `diagnostic` |
| 서버 이유 검증 거부 | `placepick_provider_llm_validation_failures_total` | `operation`, `code` |
| 후보별 이유 결과·복구 | `placepick_recommendation_reason_candidates_total` | `source`, `attempts`, `recovered` |
| Embedding shadow 결과(현재 비활성 계약) | `placepick_recommendation_preference_shadow_evaluations_total` | `status`, `eligible`, `failure` |
| Shadow holdout F1(현재 비활성 계약) | `placepick_recommendation_preference_shadow_f1_*` | `matcher`, `split` |
| Shadow holdout false positive(현재 비활성 계약) | `placepick_recommendation_preference_shadow_false_positives_*` | `matcher`, `split` |

Grafana의 `Per-candidate reason outcomes (15m)` 패널은 후보별 generated/template,
1·2회 시도와 재시도 회복 여부를 함께 보여 준다. 한 추천 전체의 `reasonFallback`만으로
부분 fallback과 전체 fallback을 혼동하지 않는다.

후보 funnel은 한 추천 실행의 최종 누적 snapshot을 정확히 한 번 기록한다. variant별 중간
수를 최종 수와 합산하지 않는다. `missing_identity`, `location`, `type`, `exclusion`,
`duplicate` 중 큰 값으로 후보 부족의 경계를 분류한다. 기존 호환 label인
`relaxed=true`는 v2에서 기본 두 검색 이후 추가 variant까지 실행한 최종 snapshot이라는
뜻이다. 실제 선호 조건을 제거했다는 의미로 해석하지 않는다.

Local `calls`는 성공뿐 아니라 timeout·Provider 실패도 `outcome=failure`로 집계한다. 대체
추천에서 정규화 후보가 많지만 실제 결과가 0개면 `previously_exposed` 분포를 함께 확인해
Provider 후보 부족과 이미 노출한 후보 제외를 구분한다. `results`, 결과 수와 점수는 랭킹
중간값이 아니라 DB 저장과 SSE `completed` event가 끝난 Job snapshot에서만 기록한다.

`Adaptive Local retrieval`에서 정확도·인기 호출과 평균 수신 수를 비교하고,
`Result quality and partial outcomes`에서 부분 결과·저하와 평균 근거 점수를 함께 본다.
검색어, 장소와 candidate fingerprint를 label로 추가하지 않는다.

LLM 진단은 envelope·usage·schema·slot/claim 소유권 같은 폐쇄형 코드만 기록한다.
조건 추출은 attempt별 Provider outcome과 최종 `extracted|manual|failed` resolution을
분리해 본다. `manual`은 사용자가 직접 조건을 완성할 수 있는 정상 복구 상태이며 Provider
성공으로 합산하지 않는다. `attempts=2,recovered=true`는 두 번째 생성에서 안전한 초안을
회복했다는 뜻이다.

Embedding shadow metric observer와 메트릭 계약은 구현됐지만 현재 실행 가능한
`make quality-eval`은 합성 vector로 정책 산식만 검증하며 observer를 운영 registry에
연결하지 않는다. 실제 Provider campaign runner와 운영 metric 연결은 후속 PR에서
구현한다.
`eligible=true`는 승격 필요조건을 충족했다는 의미이지 runtime에 적용됐다는 뜻이 아니다.
lexical/embedding holdout F1과 false positive gate를 함께 검토하고 별도 ADR 없이 점수
정책에 연결하지 않는다. corpus 원문과 vector는 metric·log·trace에 넣지 않는다.

`diagnostic=none`이 아닌 값과 서버 validation failure를 함께 확인한다. 후보별
`source=generated|template`, `attempts=1|2`, `recovered=true|false`를 함께 보면 첫 실패 뒤
회복과 최종 template 대체를 구분할 수 있다. 후보별 작업은 최대 세 개를 병렬로 제출하지만
실제 HTTP 호출은 위 Provider semaphore 보호도 적용받는다. 후보당 호출은 최대 두 번이며
400·인증 실패는 재시도하지 않는다. prompt, completion, 장소·주소·URL은 metric·로그·trace에서
찾거나 추가하지 않는다. 예상하지 못한 내부 예외는 fallback 성공으로 간주하지 않고 Job
실패·retry·DLQ 경로를 조사한다.

## 추천·Streams·SSE·투표 진단

Grafana의 `PlacePick MVP Runtime` dashboard는 다음 일곱 row를 이 순서로 제공한다.

1. 사용자 여정과 품질 SLO
2. 후보 검색 Funnel과 부분 결과
3. Naver·Elice 호출·Token·Fallback
4. Outbox·Redis·Worker
5. DB·Redis·JVM·HTTP
6. SSE·투표·보안
7. 프런트 Web Vitals·Cold Start·Release SHA

장애를 조사할 때는 다음 순서로 확인한다.

1. `Job stage transitions`와 `Job outcomes and degraded completions`를 비교해 정체 stage와
   완료/실패/degraded 비율을 찾는다.
2. `Provider calls`와 `Provider mean latency`로 외부 지연과 application 정체를 구분한다.
3. `DLQ events (15m)`가 0보다 크면 자동 재주입하지 않는다. poison reason, DB snapshot과
   처리 이력을 확인하고 원인을 수정한 새 SHA에서 event ID 멱등성을 검증한 뒤 재처리한다.
4. `Active SSE connections`가 트래픽 종료 뒤 감소하지 않으면 emitter timeout·completion과
   client reconnect 간격을 확인한다. opened·resumed·replayed·send failure·close reason과
   connection lifetime p95를 같은 stream 종류 안에서 대조하고 resource ID를 metric label에
   추가하지 않는다.
5. `Vote contention (15m)`이 증가하면 `placepick_vote_write_seconds_*`와 DB lock 대기를 함께
   확인한다. DB unique constraint와 transaction을 우회하는 Redis 집계를 정본으로 만들지 않는다.

### Outbox·Stream backlog와 stuck Job

- `placepick_outbox_pending > 0`이고 oldest age가 증가하면 DB에서 해당 event의 원문 payload를
  출력하지 말고 relay 실행 여부, publish 결과 counter와 Redis 연결부터 확인한다. 원인을
  수정하지 않은 채 outbox를 수동 published로 바꾸지 않는다.
- `placepick_stream_pending > 0`이고 oldest age가 증가하면 consumer role·group, pending claim,
  Worker 처리 시간과 DLQ를 확인한다. 이 값은 consumer group에 전달됐지만 ACK되지 않은 PEL이며
  아직 전달되지 않은 전체 stream lag는 아니다. ACK를 먼저 보내거나 임의 새 event ID로
  재발행하지 않는다.
- `placepick_job_stuck > 0`이면 `ACCEPTED|PROCESSING` Job의 stage, outbox/stream 상태와 같은
  trace를 대조한다. Job ID는 안전한 correlation 범위에서만 사용하고 metric label로 추가하지
  않는다.
- DB 또는 Redis snapshot counter의 `outcome=failure`가 증가하면 gauge는 마지막 성공값일 수
  있다. `placepick_telemetry_snapshot_last_success_timestamp_seconds`의 source별 마지막 성공
  시각도 함께 확인하며, 0으로 보인다는 이유만으로 backlog가 없다고 결론 내리지 않는다.

원인을 수정한 새 SHA에서 event ID 멱등성, commit 뒤 ACK와 pending claim을 검증한 후에만
재처리한다. DLQ는 자동 재주입하지 않는다.

현재 15개 rule은 즉시 운영 신호와 표본 gate가 있는 품질 신호로 분리한다. 즉시 신호 10개는
telemetry 중단, readiness DOWN, Provider 인증, quota 압력, DLQ, Outbox backlog, Stream
backlog, stuck Job, snapshot 실패와 snapshot freshness 정체다. 품질 신호 5개는 후보 0건, 부분 결과, 이유 fallback, Provider 오류,
HTTP p95이며 분모 표본이 최소 20개일 때만 평가한다. 이 비율과 5초 p95는 초기 데모 보호값이지
실측 SLA가 아니다. 7일 또는 추천 100회 중 더 늦은 시점의 baseline과 false positive를 검토해
조정한다.

Alertmanager와 외부 메시지 전송은 아직 구성하지 않았으므로 로컬에서는 `make observe`의
Prometheus Alerts 화면에서 확인한다. Grafana Cloud notification policy와 Synthetic
Monitoring도 실제 계정에서 별도 구성·검증하기 전에는 완료로 표시하지 않는다.

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

1. Java 17·Node 24에서 `make check`로 단위·통합·문서·secret 검사와 dashboard query,
   15개 alert, `promtool check rules`·`promtool test rules`를 통과시킨다.
2. `make observe` 후 7-row dashboard JSON provisioning, Prometheus target과 Alerts 화면을
   확인한다.
3. 합성 session으로 429·`Retry-After`, Provider Mock 오류, DLQ fixture, SSE 연결 해제와
   동시 투표를 재현한다. 실제 Provider 원문과 비밀은 사용하지 않는다.
4. 실제 Vercel→Render 환경에서는 위 전달 주소 gate, production origin/cookie/header와
   production OTLP 최초 수집 절차를 별도로 확인한다.
5. DB·Redis snapshot 조회 장애를 각각 주입해 source별 failure와 마지막 성공 시각 정체가
   dashboard·alert에 나타나는지 확인한다. 별도로 exporter 장애를 주입해 사용자 요청·Worker는
   성공하고 Grafana 수집 공백만 발생하는지 확인한다. 이는 telemetry 무손실을 검증하는 절차가
   아니다.
6. 회귀가 있으면 설정값만 무리하게 완화하지 말고 마지막 정상 SHA로 RUN-0006 롤백을 수행한다.

검증 증거가 확보되기 전에는 이 문서를 `verified`로 변경하지 않는다.
