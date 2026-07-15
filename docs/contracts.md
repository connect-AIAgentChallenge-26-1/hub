# 계약 정본

이 문서는 공개 API, 내부 이벤트와 외부 AI·검색 경계의 의미와 구현 상태를 관리한다.
계약 상태와 실제 공개 여부를 혼동하지 않는다.

| 상태 | 의미 |
| --- | --- |
| `planned` | 방향만 존재하며 요청·응답·오류가 확정되지 않음 |
| `specified` | 요청·응답·오류·권한·검증 기준이 확정됐지만 구현되지 않음 |
| `implemented` | 코드와 자동 테스트가 계약을 검증함 |
| `deprecated` | 대체 계약과 제거 조건이 확정됨 |

현재 실행 코드가 공개하는 HTTP 표면은 `/actuator/health`와
`/actuator/prometheus`뿐이다. 아래 `specified` 비즈니스 경로는 구현됐거나 호출할 수
있다는 뜻이 아니다. 각 연결 Task가 코드와 자동 검증을 완료한 뒤에만 상태를
`implemented`로 변경한다.

## 공통 HTTP 규칙

- API prefix는 `/api/v1`, JSON field는 `camelCase`를 사용한다.
- resource ID는 UUID v4 문자열이며 DB에서는 PostgreSQL `uuid`로 저장한다.
- 시각은 UTC ISO 8601 문자열, 금액은 KRW 정수다.
- 성공 응답은 `application/json`, 오류는 RFC 9457
  `application/problem+json`, stream은 `text/event-stream`이다.
- 익명 세션 cookie 이름은 `PLACEPICK_SESSION`, 주최자 capability cookie 이름은
  `PLACEPICK_ORGANIZER`다. 두 cookie는 `HttpOnly`, `SameSite=Lax`, 운영에서
  `Secure`이며 URL·응답 body·로그에 원문을 노출하지 않는다.
- 세션 생성 이외의 상태 변경 요청은 `X-CSRF-Token` header를 검사한다. GET과 SSE는
  CSRF 검증 대상이 아니지만 resource 소유권과 만료는 검사한다.
- resource 생성과 최종 확정은 `Idempotency-Key` header가 필수다. 같은 세션·method·
  path·body의 재요청은 최초 status와 body를 반환하고, 같은 key에 다른 body를 쓰면
  409 `IDEMPOTENCY_KEY_REUSED`를 반환한다. 기록은 최소 24시간 유지한다.
- 투표는 resource에 대한 `PUT`과 `DELETE`로 멱등성을 확보한다.
- 목록 문자열은 앞뒤 공백과 중복을 제거한다. 알 수 없는 JSON field는 400으로
  거부해 client와 server의 계약 drift를 드러낸다.

## 공통 resource schema

### 추천 조건 `RecommendationCondition`

추출 직후의 `DraftRecommendationCondition`과 사용자가 검토·수정한
`ConfirmedRecommendationCondition`은 같은 field 이름을 사용한다. Draft의
`partySize`, 두 예산과 preference priority는 null일 수 있지만 확정 조건의 preference
priority는 필수다. 추출 결과를 자동으로 추천에 연결하지 않으며 추천 core는 확정 조건만
받는다.

| field | 형식과 제약 |
| --- | --- |
| `locationQuery` | 1~100자의 검색 지역, 비어 있을 수 없음 |
| `placeType` | `RESTAURANT`, `CAFE`, `BAR`, `OTHER` 중 하나 |
| `placeTypeDetail` | `OTHER`일 때 필수인 1~30자 문자열, 그 외에는 null |
| `partySize` | nullable, 값이 있으면 1~100 정수 |
| `budgetPerPersonMin` | nullable, 값이 있으면 0~10,000,000 정수 |
| `budgetPerPersonMax` | nullable, 값이 있으면 최솟값 이상 10,000,000 이하 정수 |
| `preferences` | 최대 10개의 `{value, priority}`; value는 1~50자, Draft priority는 nullable, 확정 priority는 1~10 |
| `exclusions` | 최대 10개의 1~50자 문자열 |

위치는 필수 조건이며 장소 유형도 검색 확장에서 제거하지 않는다. 후보가 세 개보다
적으면 `preferences` 중 가장 낮은 priority의 항목만 한 번 제거해 재검색한다. 같은
priority가 여러 개면 배열의 마지막 항목을 제거해 결과를 결정적으로 만든다.

검색어는 `locationQuery`, 유형 token과 priority 내림차순·원래 배열 순의 선호를 최대
100자 안에서 완전한 token 단위로 조합한다. 문자열을 중간에서 자르지 않는다. 최초
Local은 `display=5`로 호출한다. NFKC·공백·HTML 정리 뒤 위치·유형·제외 hard filter를
적용하고 유효 후보가 세 개보다 적을 때만 실제 검색어에 포함된 최저 priority 선호 하나를
제거해 Local을 한 번 더 호출한다. 이후에도 세 개 미만이면 Blog·LLM을 호출하지 않고
`INSUFFICIENT_CANDIDATES`로 종료한다.

장소 유형은 versioned category taxonomy로 검사한다. 음식점은 음식점·식당·한식·중식·
일식·양식·분식·뷔페, 카페는 카페·커피·디저트·베이커리, 주점은 술집·주점·바·호프·
맥주·와인·칵테일·이자카야 segment를 허용한다. `OTHER`는 `placeTypeDetail`이 정규화된
이름 또는 category segment와 일치해야 한다. 행정구역 접미사를 정리한 location token은
`address` 또는 `roadAddress` 중 하나에서 확인돼야 한다. 일치하지 않으면 점수화하지
않고 필수 조건 filter로 제외한다.

### 후보 identity와 근거

표시용 문자열은 HTML 제거와 공백 정리만 수행하고 NFKC와 URL canonicalization은 내부
비교에만 사용한다. 유효한 HTTP(S) `sourceUrl`이 없는 Local 항목은 제품 후보에서
제외한다. canonical URL이 같으면 병합하고, 그렇지 않을 때는 정규화 이름과 비어 있지
않은 주소가 모두 같을 때만 보수적으로 병합한다. 이름만 또는 좌표만으로 합치지 않는다.
canonical URL은 scheme·host를 소문자로 만들고 기본 port와 fragment를 제거하며 dot
segment를 정리한다. raw percent-encoded path·query는 이중 인코딩하지 않고 Java와
TypeScript가 같은 conformance vector를 사용한다. encoded dot segment는 런타임별
정규화 차이와 경로 우회를 막기 위해 URL 전체를 거부한다.

내부 `CandidateKey`는 identity의 SHA-256 지문이며 중복 제거와 안정적 tie-break에만
사용한다. 로그·API에는 노출하지 않는다. UUID v4 `placeId`는 최종 Top 3를 고른 뒤에만
발급하므로 정렬 기준으로 사용하지 않는다. Blog 근거는 Local 예비 점수로 제한한 최대
다섯 후보에 대해 후보당 `display=3`까지 수집한다.

### 추천 후보 `RecommendationPlace`

| field | 의미 |
| --- | --- |
| `placeId` | 내부 UUID |
| `name`, `category`, `roadAddress`, `address` | Naver 검색에서 정규화한 최소 장소 정보 |
| `sourceUrl` | 사용자가 원문을 확인할 수 있는 Naver link |
| `score` | 현재 근거로 계산한 결정론적 0~80 정수, 100점으로 재정규화하지 않음 |
| `scoreBreakdown` | 위치 30, 유형 25, 예산 0, 선호 0~15, Blog 근거 0·3·7·10 |
| `reasonStatements` | 각 문장이 허용된 evidence ID에 연결된 검증 완료 이유 목록 |
| `cautions` | 근거가 부족하거나 사용자가 확인해야 할 사항 목록 |
| `shareText` | 서버가 검증된 문장과 warning으로 조합한 공유 문구 |
| `evidenceLevel` | `LOCAL_AND_BLOG` 또는 `LOCAL_ONLY` |
| `warnings` | `BUDGET_EVIDENCE_UNAVAILABLE` 등 안정적인 warning code 목록 |

도보 시간, 지하철 출구, 실시간 영업 여부처럼 현재 provider로 검증하지 않은 속성은
응답하지 않는다. Naver 응답에 구조화된 가격 근거가 없으므로 예산을 추론하지 않고
0점과 `BUDGET_EVIDENCE_UNAVAILABLE`을 사용한다. 제외 조건은 점수가 아니라 후보를
제거하는 hard filter다. LLM은 후보, 점수, 순위, 사실 field, 주의점과 공유 문구를
만들거나 변경할 수 없다.

점수가 같으면 필수 조건 일치율 내림차순, 유효 근거 수 내림차순, 내부 `CandidateKey`
오름차순으로 정렬한다. 선호 점수는 `roundHalfUp(15 × 일치 priority 합 / 전체 priority
합)`, Blog 점수는 근거 0·1·2·3개 이상에 각각 0·3·7·10이다. Blog endpoint가 하나라도
실패하면 이후 Blog 호출을 중단하고 이미 받은 Blog 근거도 모두 폐기한다. 모든 후보를
`LOCAL_ONLY`, degraded와 `BLOG_EVIDENCE_UNAVAILABLE`로 처리한다. 정상 0건은 provider
실패가 아니며 해당 후보만 Blog 점수 0이다.

추천 core의 provider 논리 호출 상한은 정상 8회, Local 선호 완화가 발생하면 9회다.
조건 추출 Elice 1회, Local 1~2회, 최대 다섯 후보의 Blog 각 1회와 Top 3 batch 이유
생성 Elice 1회로 계산한다. HTTP adapter의 자동 재시도와 redirect는 0회다.

### 추천 Job `RecommendationJobView`

| field | 형식과 의미 |
| --- | --- |
| `jobId` | UUID v4 |
| `status` | `ACCEPTED`, `PROCESSING`, `COMPLETED`, `FAILED` |
| `stage` | `QUEUED`, `LOCAL_SEARCH`, `BLOG_SEARCH`, `SCORING`, `REASON_GENERATION`, `PERSISTING`, `FINISHED` |
| `progress` | 0~100 정수이며 같은 Job에서 감소하지 않음 |
| `degraded` | 일부 근거·생성 fallback으로 완료됐는지 여부 |
| `warnings` | 안정적인 warning code 목록 |
| `condition` | 사용자가 확정한 `RecommendationCondition` |
| `places` | 완료 시 정확히 세 개의 `RecommendationPlace` |
| `failure` | 실패 시 `{errorCode, message}`, 내부 stack과 provider 원문 제외 |
| `createdAt`, `updatedAt`, `expiresAt` | UTC 시각 |

## HTTP API

| 상태 | 메서드·경로 | 권한 | 성공 계약 | 연결 Task |
| --- | --- | --- | --- | --- |
| `implemented` | `GET /actuator/health` | 공개 | 200과 프로세스·의존성 상태 | WI-0001 |
| `implemented` | `GET /actuator/prometheus` | 공개 | 200 Prometheus text exposition | WI-0001 |
| `specified` | `POST /api/v1/anonymous-sessions` | 공개 | 201, session cookie, CSRF token·만료 | PP-008 |
| `specified` | `POST /api/v1/recommendation-drafts` | 익명 세션 | 201 조건 추출 draft | PP-009, PP-010 |
| `specified` | `GET /api/v1/recommendation-drafts/{draftId}` | draft 소유 세션 | 200 draft snapshot | PP-010 |
| `specified` | `PUT /api/v1/recommendation-drafts/{draftId}` | draft 소유 세션 | 200 확정 조건으로 전체 교체 | PP-010 |
| `specified` | `POST /api/v1/recommendations` | 확정 draft 소유 세션 | 반드시 202와 Job locator | PP-011 |
| `specified` | `GET /api/v1/recommendations/{jobId}` | Job 소유 세션 | 200 최신 Job snapshot | PP-018 |
| `specified` | `GET /api/v1/recommendations/{jobId}/events` | Job 소유 세션 | 추천 진행 SSE | PP-019 |
| `specified` | `POST /api/v1/recommendations/{jobId}/rooms` | 완료 Job 소유 세션 | 201 공유방과 주최자 capability | PP-023 |
| `specified` | `GET /api/v1/rooms/{shareToken}` | share token | 200 후보·집계·만료 | PP-023 |
| `specified` | `PUT /api/v1/rooms/{shareToken}/votes/{placeId}` | 익명 세션과 share token | 200 자기 투표·최신 집계 | PP-024 |
| `specified` | `DELETE /api/v1/rooms/{shareToken}/votes/{placeId}` | 익명 세션과 share token | 204, 없어도 동일 | PP-024 |
| `specified` | `GET /api/v1/rooms/{shareToken}/events` | share token | 투표·확정 SSE | PP-025 |
| `specified` | `PUT /api/v1/rooms/{shareToken}/final-result` | organizer capability | 200 최종 결과 | PP-025 |
| `specified` | `GET /api/v1/rooms/{shareToken}/result` | share token | 200 확정 결과 | PP-025 |
| `specified` | `POST /api/v1/events` | 익명 세션 | 202 allowlist event 수락 | PP-027 |

## Endpoint 상세 계약

### 익명 세션

`POST /api/v1/anonymous-sessions`는 body 없이 호출한다. 201 body는
`{csrfToken, expiresAt}`이며 원문 session token은 cookie에만 둔다. 유효한 현재
세션 cookie가 있으면 새 ID를 늘리지 않고 같은 세션의 만료를 갱신한다. 변조·만료
cookie는 재사용하지 않는다.

### 조건 draft

`POST /api/v1/recommendation-drafts` body는 `{requestText}`이며 `requestText`는
1~1,000자다. 응답은 `{draftId, status, extractedCondition, warnings, expiresAt}`이고
status는 `EXTRACTED`다. 의미 있는 지역이나 장소 유형을 추출할 수 없으면 422
`UNPROCESSABLE_CONDITION`을 반환한다.

`GET`은 같은 snapshot을 반환한다. `PUT` body는 `{condition}`이고 전체
`RecommendationCondition`을 검증한 뒤 status를 `CONFIRMED`로 바꾼다. draft TTL은
생성부터 30분이며 만료 뒤 모든 접근은 410 `DRAFT_EXPIRED`다. Job으로 전환된 draft는
`CONSUMED`로 표시하며 다시 다른 Job을 만들 수 없다. 같은 idempotency key의 재요청은
기존 Job을 반환한다.

### 추천 생성·조회

`POST /api/v1/recommendations` body는 `{draftId}`다. 확정되지 않은 draft는 409
`DRAFT_NOT_CONFIRMED`, 이미 다른 key로 소비된 draft는 409 `DRAFT_ALREADY_CONSUMED`다.
성공은 다음 body와 `Location: /api/v1/recommendations/{jobId}`를 반환한다.

```json
{
  "jobId": "00000000-0000-4000-8000-000000000001",
  "status": "ACCEPTED"
}
```

성공 대체값으로 `200 OK`를 허용하지 않는다. Job과 outbox event는 한 DB transaction에
저장한다. `GET`은 항상 `RecommendationJobView`를 반환한다. 장소 검색 재시도 뒤에도
후보가 세 개 미만이면 `FAILED`와 `INSUFFICIENT_CANDIDATES`다. Blog 검색만 실패하면
`COMPLETED`, `degraded=true`, warning `BLOG_EVIDENCE_UNAVAILABLE`과 모든 후보의
`LOCAL_ONLY` 근거 수준을 반환한다. 이유 생성 실패는 템플릿 fallback으로 완료하고
warning `LLM_REASON_FALLBACK`을 포함한다.

### 공유방과 투표

`POST /api/v1/recommendations/{jobId}/rooms`는 body `{expiresInHours}`를 받으며 값은
1~168이다. 생략하면 72시간이다. 완료된 Job만 방으로 만들 수 있다. 201 body는
`{shareToken, shareUrl, expiresAt}`이며 organizer 원문은 cookie에만 둔다.

`GET /rooms/{shareToken}`은 `{roomId, status, places, aggregate, expiresAt}`을 반환한다.
status는 `OPEN` 또는 `FINALIZED`다. 내부 `roomId`는 UUID지만 외부 route에는 사용하지
않는다. 존재하지 않거나 형식이 잘못된 token은 동일한 404, 만료된 방은 410이다.

투표 `PUT` body는 `{value}`이고 value는 `LIKE` 또는 `DISLIKE`다. 같은 값을 다시
보내면 집계를 바꾸지 않는다. 다른 값은 원자적으로 교체한다. 응답은
`{placeId, myVote, aggregate, updatedAt}`이다. `DELETE`는 현재 세션의 해당 표만
제거하며 존재하지 않아도 204다. 확정·만료된 방은 변경할 수 없고 409 또는 410을
반환한다.

최종 확정 `PUT` body는 `{placeId}`다. 후보가 아닌 장소는 400이다. 같은 장소 재요청은
기존 200 결과를 반환하고, 이미 다른 장소가 확정됐으면 409
`FINAL_RESULT_CONFLICT`다. `GET /result`는 확정 전 409 `RESULT_NOT_FINALIZED`, 확정 후
`{place, finalizedAt}`을 반환한다.

### 제품 이벤트

`POST /api/v1/events` body는 `{eventId, name, occurredAt, context}`다. `eventId`는 UUID,
name은 `draftCreated`, `recommendationViewed`, `roomShared`, `voteChanged`,
`finalResultViewed`만 허용한다. context는 `draftId`, `jobId`, `roomId`, `placeId`,
`viewportClass` 중 해당 값만 포함하며 자유 텍스트, 검색 문장, cookie, token과 PII를
거부한다. body는 4 KiB 이하이고 중복 event ID는 다시 저장하지 않으면서 202를
반환한다. 시스템 처리 event는 server가 직접 생성하며 이 endpoint로 받지 않는다.

## 오류 계약

모든 오류는 `type`, `title`, `status`, `detail`, `instance`, 안정적인 `errorCode`,
`traceId`를 가진다. 입력 오류는 `fieldErrors` 배열에 `{field, code, message}`를
추가한다. `detail`과 message에는 secret, 원문 provider payload, stack trace와 내부
SQL을 넣지 않는다.

| HTTP | 대표 error code | 의미 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST`, `INVALID_CONDITION` | JSON·field·상호 제약 위반 |
| 401 | `SESSION_REQUIRED` | 익명 세션이 없거나 유효하지 않음 |
| 403 | `CSRF_INVALID`, `ORGANIZER_REQUIRED` | 상태 변경 또는 주최자 권한 거부 |
| 404 | `RESOURCE_NOT_FOUND` | 소유하지 않거나 존재하지 않는 resource |
| 409 | `INVALID_STATE`, `IDEMPOTENCY_KEY_REUSED`, `FINAL_RESULT_CONFLICT` | 상태·멱등성 충돌 |
| 410 | `DRAFT_EXPIRED`, `ROOM_EXPIRED`, `JOB_EXPIRED` | 존재했지만 보존 기간 종료 |
| 422 | `UNPROCESSABLE_CONDITION` | 안전한 추천 조건을 만들 수 없음 |
| 429 | `RATE_LIMITED`, `PROVIDER_QUOTA_PROTECTED` | 제한 초과, `Retry-After` 포함 |
| 500 | `INTERNAL_ERROR` | 노출 가능한 원인이 없는 내부 실패 |
| 502 | `PROVIDER_INVALID_RESPONSE` | 외부 응답 schema·근거 검증 실패 |
| 503 | `PROVIDER_UNAVAILABLE`, `QUEUE_UNAVAILABLE` | 제한 재시도 뒤 일시 장애 |

## SSE 계약

추천 stream event는 `snapshot`, `progress`, `completed`, `failed`, `heartbeat`, 방
stream event는 `snapshot`, `voteUpdated`, `voteRemoved`, `finalized`, `heartbeat`다.

- 연결 직후 현재 DB snapshot을 먼저 보낸다.
- 모든 상태 event는 증가하는 event ID와 `occurredAt`, aggregate ID를 가진다.
- 15초 안에 상태 event가 없으면 heartbeat를 보낸다.
- client는 `Last-Event-ID`로 재연결할 수 있다. 서버가 event gap을 재생할 수 없으면
  최신 snapshot을 보내 상태를 수렴시킨다.
- completed, failed, finalized terminal event 뒤에는 연결을 닫는다.
- 연결 해제 시 listener를 제거하고 resource별·세션별 연결 상한을 적용한다.
- SSE 중단은 Job이나 투표 transaction을 취소하지 않는다. client는 GET snapshot으로
  언제든 복구할 수 있다.

## 내부 이벤트

| 상태 | 이름 | 생산자 | 소비자 | 의미 |
| --- | --- | --- | --- | --- |
| `specified` | `recommendation.requested.v1` | 추천 application service | 추천 Worker | 저장·확정된 Job 처리 요청 |

event envelope는 `eventId`, `eventType`, `version`, `aggregateId`, `idempotencyKey`,
`occurredAt`, `traceId`, `payload`를 가진다. payload에는 `jobId`만 두고 draft 조건은
Worker가 DB에서 읽어 event의 개인정보와 크기를 줄인다. relay는 outbox를 반복 publish할
수 있고 Worker는 at-least-once delivery를 전제로 처리한다. DB commit 뒤에만 ACK하며
제한 재시도 뒤에는 원본 event ID와 안전한 오류 code를 DLQ에 보존한다.

## LLM과 외부 검색

| 상태 | 계약 | 기준 | 연결 Task |
| --- | --- | --- | --- |
| `implemented` | 개발·테스트 외부 모드 | `PLACEPICK_EXTERNAL_MODE=mock`만 허용 | WI-0001 |
| `implemented` | Mock Naver·LLM | 정상·오류·timeout fixture | WI-0001 |
| `implemented` | 조건 추출 | Draft nullable과 사용자 확인 경계를 포함한 `placepick.condition-extraction.v1` strict schema | PP-009 |
| `implemented` | 추천 이유 | place ID별 단일 evidence와 유형별 고정 문장만 허용하는 `placepick.reason-statements.v1` strict schema | PP-016 |
| `implemented` | Mock linked 추천 core | 정상·완화·후보 부족·Blog degraded·LLM fallback의 다섯 전체 application 흐름 | PP-039, PP-040 |
| `specified` | Split Live Probe | 2026-07-15 실제 실행은 safe failure; 성공 4회·`linked=false` 증거 없음 | PP-039 |
| `implemented` | Linked Live 자동 harness | 실제 호출 없이 source compile·Gateway·launcher·provenance·redaction 검증 | PP-040 |
| `implemented` | Linked Live Workflow | SHA `e789af65...`의 allowlist 3개 실제 연결 시나리오가 strict success, 호출 `7/6/6` | PP-040 |
| `implemented` | Naver Java adapter | 현행 API HUB Local·Blog port와 오류 정규화 | PP-013 |
| `implemented` | Naver Local Live | Local·Blog 각 1회 2xx·schema, safe report scan 통과 | PP-013 |
| `implemented` | Elice Chat Local Live | 합성 입력 1회 2xx·strict schema·usage, safe report scan 통과 | PP-038 |
| `implemented` | Elice Embedding capability | 합성 입력 1회 2xx·1 item·1,536 finite dimensions; runtime 미사용 | PP-038 |
| `implemented` | Approval Gate·Provider Gateway 프로그램 | OIDC·workflow hash·replay·JWT·Local/Blog allowlist 자동 검증 | PP-037 |
| `planned` | Gate·Gateway 클라우드 배포 | Cloudflare secret과 승인 SHA canary E2E | PP-033, PP-035 |
| `planned` | 전체 배포 Live | Gateway를 거친 Naver·Elice 전체 E2E | PP-029, PP-033 |

조건 추출은 사용자 입력을 instruction이 아닌 data로 격리하고 schema 외 field를
허용하지 않는다. refusal, incomplete, malformed와 안전하게 해석할 수 없는 입력은
draft를 저장하지 않고 422로 종료한다.

추천 이유 입력은 확정 조건과 이미 선택된 Top 3의 검증된 최소 근거만 포함한다. 출력은
다음 versioned strict schema이며 `additionalProperties=false`를 적용한다.

```json
{
  "schemaVersion": "placepick.reason-statements.v1",
  "places": [
    {
      "placeId": "00000000-0000-4000-8000-000000000001",
      "statements": [
        {
          "text": "검증된 장소 정보에 따라 이 후보를 제안합니다.",
          "evidenceIds": ["e1"]
        }
      ]
    }
  ]
}
```

입력 Top 3와 출력의 place ID 집합은 정확히 같아야 한다. 장소당 문장은 1~3개지만 각
문장은 evidence ID를 정확히 하나만 인용한다. `LOCAL` evidence의 문장은 정확히
`검증된 장소 정보에 따라 이 후보를 제안합니다.`, `BLOG` evidence의 문장은 정확히
`연결된 블로그 근거를 함께 확인할 수 있습니다.`만 허용한다. JSON Schema는 두 문장을
enum으로, evidence 배열은 `minItems=1`, `maxItems=1`로 제한하고 서버는 인용한 evidence
유형과 문장이 일치하는지 다시 검증한다. 장소명 같은 token을 공유하더라도
`장소명에는 루프탑이 있습니다`와 같은 자유 속성 문장은 거부한다.
정확히 한 항목이라는 의미는 `minItems=1`, `maxItems=1`과 서버 post-validation으로
완결하며, Elice strict Structured Outputs 지원 부분집합에서 400을 일으킨 `uniqueItems`는
사용하지 않는다.

LLM은 새로운 사실을 요약·추론하거나 점수·순위를 정하는 주체가 아니다. 결정론적 서버가
후보와 순위를 먼저 확정하고 LLM은 위 두 개의 보수적 표시 문장 중 근거 유형에 맞는 것을
선택한다. 다른 후보 또는 알 수 없는 evidence, 가격·영업 상태·도보 시간·출구와 입력에
없는 속성, 점수·순위·주의점·공유 문구 field를 거부한다. 한 후보라도 schema·ID·evidence
검증에 실패하면 batch 전체를 폐기하고 Top 3 모두 검증된 장소 field와 warning을 조합한
서버 template fallback을 사용한다. 서버가 주의점과 `shareText`를 조합하며 결과 순서와
점수는 바꾸지 않는다.

Naver adapter는 `https://naverapihub.apigw.ntruss.com`의 `/search/v1/local`과
`/search/v1/blog`, `X-NCP-APIGW-API-KEY-ID`와 `X-NCP-APIGW-API-KEY` 인증 header를
사용한다. adapter는 자동 재시도하지 않고 400, 401·403, 429, schema 오류와
5xx·timeout을 안정적인 application 오류로 정규화한다.
현재 일반 Spring 애플리케이션에는 원본 Naver key를 받는 bean이나 자동 구성을 연결하지
않는다. 직접 Naver adapter는 격리된 Local Live task와 자동 계약 테스트에서만 만들며,
향후 배포 runtime은 PP-029에서 원본 key가 아닌 Provider Gateway 자격을 사용하는 별도
adapter를 연결한다.
Local 실패는 제한 재시도 뒤 Job 실패, Blog 실패는 `LOCAL_ONLY` degraded 완료다.
원문 Naver response의 cache·영구 저장뿐 아니라 Local·Blog 결과 결합, 추천 후보로
저장하고 LLM에 전달하는 동작은 약관과 표시 의무를 사람이 확인하기 전까지 금지한다.
Naver 문서가 item 상세 field의 필수 존재를 보장하지 않으므로 누락된 상세값은 빈
문자열로 정규화한다. 단, 제목이 없는 item은 공식 schema 오류가 아니라 추천 후보로
식별할 수 없는 제품 적합성 실패로 분리해 거부한다.
Local Live 계약 검증은 응답을 메모리에서 schema 확인 후 폐기한다. 2026-07-14
SHA `128692bdcaa8ef4e5e00a06362c02f25da223a4b`에서 Local·Blog 메서드를 각각 한 번
호출해 모두 2xx·schema를 통과했다. automatic retry·redirect는 비활성화했고 논리 호출
수는 2다. safe summary와 report scan 외 원문은 artifact로 보존하지 않았으며 Naver
Live 상태는 `implemented`다. provider console의 wire 사용량 대조는 별도 운영 증거다.

MVP LLM 방향은 Elice OpenAI-compatible Chat Completions다. Local Live는 승인된
`https://mlapi.run/{canonical-uuid}/v1` 형태의 Chat base에서
`POST /chat/completions`, exact model `openai/gpt-4.1-mini`, strict
`response_format=json_schema`, `stream=false`, `store=false`, tool 없음과 제한된
output을 요구한다. 고정 합성 입력의 출력은 추가 field 없는 `{"status":"ok"}`만
허용한다. [공식 GPT-4.1 mini 사양](https://developers.openai.com/api/docs/models/gpt-4.1-mini)은
Chat Completions와 Structured Outputs 지원을 비교 기준으로 제공하지만 Elice proxy의
호환성·보관 정책을 증명하지 않는다.

요청 model pin은 바꾸지 않는다. 응답 model metadata는 Chat 요청 alias,
`gpt-4.1-mini`, `gpt-4.1-mini-2025-04-14`와 Embedding 요청 alias,
`text-embedding-3-small`만 닫힌 목록으로 허용한다. 실제 관찰값을 자동 등록하거나
부분 문자열로 수용하지 않으며 목록 밖 model은 `INVALID_RESPONSE`로 실패한다.

Embedding은 별도 base의 `POST /embeddings`, exact model
`openai/text-embedding-3-small`, 합성 입력 한 건과 float encoding으로 capability만
확인한다. [공식 Embeddings 가이드](https://developers.openai.com/api/docs/guides/embeddings)는
`text-embedding-3-small`의 기본 길이를 1,536으로 설명한다. vector는 출력·저장하지
않고 추천·검색·점수·중복 제거 runtime에 사용하지 않는다.

직접 OpenAI Responses API는 provider port 뒤의 대안으로 남기되 Elice 실패 시 자동
fallback하지 않는다. Elice의 보관·로깅·학습 사용·삭제·개인정보 정책을 사람이 확인하기
전에는 실제 사용자 입력, Naver 결과, 장소·블로그 근거와 생성 응답을 Elice에 보내거나
저장하는 제품 runtime을 활성화하지 않는다. `store=false` 전달은 proxy 미보관의 증거가
아니다.

PP-040의 로컬 Linked Live는 저장소 소유자가 Naver·Elice 양쪽 실행과 현재 전체 제품
문맥 전달을 승인했다고 진술한 고정 합성 입력의 invocation-bound 반복 검증 예외다.
각 실행은 새 Gateway·일회성 로컬 자격·독립 호출 예산을 사용하며 HTTP retry가 아니다.
승인 원문은 독립 검토하지
않았으므로 법률·약관 준수나 실제 사용자 데이터 처리 허용을 주장하지 않는다. Elice
요청 allowlist는 확정 조건의 `locationQuery`·`placeType`·`placeTypeDetail`·
`preferences`·`exclusions`, 장소의 UUID·이름·category, Local evidence의 ID·유형·
장소명 `title`과 category·description·주소·도로명 주소를 정규화해 결합한 `summary`,
Blog evidence의 ID·유형·제목·요약이다.
자격, 원문 응답 전체, source URL, 좌표, `CandidateKey`, Blog 작성자·작성일, 점수·순위,
session·개인정보와 Provider routing URL은 전달하지 않는다. 제품 runtime·실제 사용자
입력·영구 저장과 배포에는 이 예외를 승계하지 않는다.

실제 endpoint와 secret은 source, fixture, 문서와 일반 CI에 넣지 않는다. 공식 Naver
API HUB host는 allowlist 계약으로 공개하지만 credential은 Git에서 제외한
`.env.live.local` 또는 배포 Provider Gateway에만 둔다. 공유 Fork, GitHub Actions,
Vercel과 Render에는 원본 Naver key를 저장하지 않는다. Elice token과 routing identifier가
포함된 전체 proxy URL도 같은 위치에 저장하지 않는다. 전체 프롬프트나 내부 추론을
포트폴리오에 저장하지 않고 schema, 정책, fixture와 검증 결과만 기록한다.

### 외부 검증 상태 계약

외부 연동 완료 여부는 다음 증거 축으로 분리한다.

| 상태 축 | 의미 | 현재 상태 |
| --- | --- | --- |
| 코드 자동 검증 | Mock·adapter·fail-closed·redaction과 Gate/Gateway 음성 테스트 | 2026-07-15 표준 `make check` 통과; Live 호출 0회 |
| Naver Local Live | 교체된 key로 Local·Blog 논리 호출 각 1회 2xx·schema 확인 | 2026-07-14 통과; item 각 1개, 논리 호출 2회, safe report scan 통과 |
| Elice Local Live | 합성 Chat·Embedding 각 1회 2xx와 schema 확인 | 2026-07-14 통과; strict Chat·usage와 Embedding 1,536차원, 논리 호출 2회 |
| Mock linked 추천 core | 합성 Naver·LLM fixture를 같은 application use case로 연결 | 다섯 core 사용자 흐름 구현·자동 검증; 실제 외부 호출 0회 |
| Split Live Probe | Elice 합성 추출·Naver Local·Blog·Elice 합성 이유 4회, provider 간 실제 데이터 전달 없음 | 2026-07-15 main 실행 safe failure; 성공 summary 없음, `specified` 유지 |
| Linked Live 자동 harness | 자격 격리·실제 Naver provenance·6~9회 budget·safe summary | 코드·자동 검증 `implemented`; 표준 `make check`의 실제 Provider 호출 0회 |
| Linked Live Workflow | 실제 Naver 근거를 Elice에 연결한 동기 core 전체 흐름 | SHA `e789af65...`의 3개 allowlist 시나리오 strict success; 호출 `7/6/6`, 모두 `degraded=false`, `reasonFallback=false`, `cleanup=true`, retry 0회 |
| 제품 LLM runtime | PP-009·PP-016·PP-029 구현과 provider 정책 승인 | 구현되지 않음 |
| 클라우드 배포 | Gate·Gateway와 demo stack에서 승인 SHA E2E 확인 | 배포되지 않음 |

Linked 반복 캠페인은 완전 입력 카페, 인원·예산 nullable 음식점, 인원·예산 nullable
디저트 카페의 세 닫힌 시나리오를 사용했다. 조건 Draft의 exact `Seoul`은 finite alias로만
사용자 확인 정본 `서울`에 연결하며 broad·fuzzy 비교는 금지한다. 조건 field 간 불일치는
원문을 포함하지 않는 safe code로 fail-closed한다. 초기 조건 추출 전송 실패와 이유
schema의 `uniqueItems` 400은 성공으로 덮어쓰지 않고 WI-0042에 원인·수정·재검증 이력으로
보존한다. 세 번의 성공은 동기 Linked core 호환성 증거이지 SLA·성공률이나 제품 runtime
가용성 증거가 아니다.

2026-07-15 첫 코드 자동 검증 baseline은 Windows bind mount의 Gradle task output cache
mode 복원 실패 뒤 전체 build cache를 임시로 끄고 원인을 분리했다. 영구 정책은 모든
Gradle task output의 build cache를 끄고, Test의 up-to-date 재사용도 끄는 것이다.
dependency·configuration cache와 compile을 포함한 일반 up-to-date 판단은 유지한다.
이 설정에서 별도 `GRADLE_OPTS` 없는 표준 `make check`가 통과했다. 자세한 원인과 증거는
[TS-0013](troubleshooting/TS-0013-gradle-test-output-cache-bind-mount-mode.md)을 따른다.

한 축의 성공을 다른 축의 완료로 표현하지 않는다. 특히 Mock 성공은 실제 credential
호환성을, Local Live 2xx는 provider 정책 승인이나 클라우드 가용성을, Gateway 코드
테스트는 실제 edge 배포를 증명하지 않는다. Local Live capability 성공도 Naver 약관,
Elice 데이터 정책, 제품 LLM 기능 구현이나 운영 가용성을 뜻하지 않는다. Split Live는
실제 provider의 제품형 schema를 분리 검증하지만 Naver→Elice 연결 성공을 뜻하지 않는다.
Linked harness 자동 성공도 실제 `linked=true` 실행이나 제품 runtime·배포 성공을 뜻하지
않는다.

2026-07-15 21:10 KST SHA `541a98b3b73bfdaa3a1c7396aaea32ce410a7237`에서 Linked
Live를 한 번 실행했다. Gateway를 통한 Elice 조건 추출 논리 단계가
`PROVIDER_UNAVAILABLE`로 종료되어 사용자 확인과 Naver Local·Blog, 점수·Top 3, 근거
이유에는 도달하지 않았다. JUnit 결과는
`1 test / 1 failure`였고 생성 report 10개 안전 scan은 통과했다. 이는 Provider wire 호출
수나 전체 비노출을 독립 증명하지 않으며 같은 SHA에서는 재실행하지 않는다. application
논리 요청은 한 번이고 코드상 automatic retry는 0회지만 upstream wire 요청 수는
dashboard·network telemetry 미대조로 확정하지 않았다.

## 계약 검증 책임

- PP-002는 이 문서를 machine-readable OpenAPI와 정상·오류 example로 변환하고
  schema 검사를 CI에 연결한다.
- 각 구현 Task는 해당 행을 `implemented`로 바꾸기 전에 단위·통합·계약 테스트와
  Work Record 증거를 추가한다.
- 추천 생성 계약은 통합·브라우저 E2E·k6에서 모두 `202 + jobId`를 검사하며 200을
  허용하지 않는다.
- local/test/load에서 실제 외부 DNS·HTTP가 발생하면 검증을 실패시킨다.
- 공개 field, event version, 권한이나 오류 의미를 바꾸면 호환성·migration과 ADR을
  같은 PR에서 갱신한다.
