# 계약 정본

이 문서는 공개 API, 내부 이벤트와 외부 AI·검색 경계의 의미와 구현 상태를 관리한다.
계약 상태와 실제 공개 여부를 혼동하지 않는다.

| 상태 | 의미 |
| --- | --- |
| `planned` | 방향만 존재하며 요청·응답·오류가 확정되지 않음 |
| `specified` | 요청·응답·오류·권한·검증 기준이 확정됐지만 구현되지 않음 |
| `implemented` | 코드와 자동 테스트가 계약을 검증함 |
| `deprecated` | 대체 계약과 제거 조건이 확정됨 |

현재 실행 코드에는 아래 정식 `/api/v1/**` 경로와 Actuator가 구현돼 있다. 정식 API는
Mock·Testcontainers 자동 검증을 통과한 행만 `implemented`로 표시한다. 개발 전용
`/__dev/api/**`는 `live-dev` profile에서만 등록되고 정식 제품 API로 재사용하지 않는다.
이 구현 상태는 실제 cloud 배포나 배포된 실제 Provider E2E 완료를 뜻하지 않는다.

## 공통 HTTP 규칙

- API prefix는 `/api/v1`, JSON field는 `camelCase`를 사용한다.
- resource ID는 UUID v4 문자열이며 DB에서는 PostgreSQL `uuid`로 저장한다.
- 시각은 UTC ISO 8601 문자열, 금액은 KRW 정수다.
- 성공 응답은 `application/json`, 오류는 RFC 9457
  `application/problem+json`, stream은 `text/event-stream`이다.
- 익명 세션 cookie 이름은 `PLACEPICK_SESSION`, 주최자 capability cookie 이름은
  `PLACEPICK_ORGANIZER`다. 두 cookie는 `HttpOnly`, `SameSite=Lax`, 운영에서
  `Secure`이며 URL·응답 body·로그에 원문을 노출하지 않는다. 주최자 cookie의 Path는
  `/api/v1/rooms/{shareToken}`으로 방마다 격리해 여러 방의 capability가 서로
  덮어쓰이거나 다른 방 요청에 전송되지 않게 한다.
- 세션 생성 이외의 상태 변경 요청은 `X-CSRF-Token` header를 검사한다. GET과 SSE는
  CSRF 검증 대상이 아니지만 resource 소유권과 만료는 검사한다.
- 같은 cookie를 공유하는 다른 탭이 익명 세션을 갱신해 기존 탭의 CSRF token이
  만료된 경우, 클라이언트는 `403 CSRF_INVALID`에서 세션을 정확히 한 번 다시
  동기화한다. 멱등성 대상 요청은 최초 `Idempotency-Key`를 유지하며 두 번째 실패는
  반복 재시도하지 않는다.
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
| `placeTypeDetail` | `OTHER`일 때 필수인 1~30자 문자열; 알려진 유형의 Provider 값은 무시하고 null로 정규화 |
| `partySize` | nullable, 값이 있으면 1~100 정수 |
| `budgetPerPersonMin` | nullable, 값이 있으면 0~10,000,000 정수 |
| `budgetPerPersonMax` | nullable, 값이 있으면 최솟값 이상 10,000,000 이하 정수 |
| `preferences` | 최대 10개의 `{value, priority}`; value는 1~50자, Draft priority는 nullable, 확정 priority는 1~10 |
| `exclusions` | 최대 10개의 1~50자 문자열 |

위치는 필수 조건이며 장소 유형도 검색 확장에서 제거하지 않는다. 후보가 세 개보다
적으면 `preferences` 중 가장 낮은 priority의 항목만 한 번 제거해 재검색한다. 같은
priority가 여러 개면 배열의 마지막 항목을 제거해 결과를 결정적으로 만든다.

누락된 인원·예산 warning은 LLM이 반환한 warning 문자열을 제품 상태로 채택하지 않고,
정규화가 끝난 조건에서 서버가 안정적인 code로 결정한다. 같은 조건은 Provider 표현과
무관하게 같은 warning을 만든다.

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
| `implemented` | `POST /api/v1/anonymous-sessions` | 공개 | 201, session cookie, CSRF token·만료 | PP-008 |
| `implemented` | `POST /api/v1/recommendation-drafts` | 익명 세션 | 201 조건 추출 draft | PP-009, PP-010 |
| `implemented` | `GET /api/v1/recommendation-drafts/{draftId}` | draft 소유 세션 | 200 draft snapshot | PP-010 |
| `implemented` | `PUT /api/v1/recommendation-drafts/{draftId}` | draft 소유 세션 | 200 확정 조건으로 전체 교체 | PP-010 |
| `implemented` | `POST /api/v1/recommendations` | 확정 draft 소유 세션 | 반드시 202와 Job locator | PP-011 |
| `implemented` | `GET /api/v1/recommendations/{jobId}` | Job 소유 세션 | 200 최신 Job snapshot | PP-018 |
| `implemented` | `GET /api/v1/recommendations/{jobId}/events` | Job 소유 세션 | snapshot-first·heartbeat·cursor·재연결·terminal close | PP-019 |
| `implemented` | `POST /api/v1/recommendations/{jobId}/rooms` | 완료 Job 소유 세션 | 201 공유방과 주최자 capability | PP-023 |
| `implemented` | `GET /api/v1/rooms/{shareToken}` | share token | 200 후보·집계·만료 | PP-023 |
| `implemented` | `PUT /api/v1/rooms/{shareToken}/votes/{placeId}` | 익명 세션과 share token | 200 자기 투표·최신 집계 | PP-024 |
| `implemented` | `DELETE /api/v1/rooms/{shareToken}/votes/{placeId}` | 익명 세션과 share token | 204, 없어도 동일 | PP-024 |
| `implemented` | `GET /api/v1/rooms/{shareToken}/events` | share token | snapshot-first·투표 변경/삭제·재연결·finalized close | PP-025 |
| `implemented` | `PUT /api/v1/rooms/{shareToken}/final-result` | organizer capability | 200 최종 결과 | PP-025 |
| `implemented` | `GET /api/v1/rooms/{shareToken}/result` | share token | 200 확정 결과 | PP-025 |
| `implemented` | `POST /api/v1/events` | 익명 세션 | 202 allowlist event 수락 | PP-027 |

`implemented` API 행은 `SessionDraftApiIntegrationTest`,
`RecommendationJobApiIntegrationTest`, `VotingRoomApiIntegrationTest`와
`ProductEventApiIntegrationTest`가 정상·권한·만료·멱등·경합·오류 경계를 검증한다.
`SseWireContractIntegrationTest`는 실제 HTTP 연결에서 두 SSE의 snapshot-first,
heartbeat, 단조 증가 event ID, `Last-Event-ID` 재연결, terminal EOF와 emitter 정리를
양성 검증한다.

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

`GET /rooms/{shareToken}`은 `{roomId, status, places, aggregate, myVotes, canFinalize,
finalizedPlaceId, expiresAt}`을 반환한다. `aggregate`는 place별
`{placeId, likeCount, dislikeCount}`, `myVotes`는 현재 익명 세션의 place ID를 key로 하고
`LIKE` 또는 `DISLIKE`를 값으로 갖는 object다. `canFinalize`는 현재 요청의 HttpOnly
organizer cookie가 이 방에 유효한지만 나타내며 capability 원문이나 hash를 노출하지
않는다. `finalizedPlaceId`는 확정 전 null이다. status는 `OPEN` 또는 `FINALIZED`다. 내부
`roomId`는 UUID지만 외부 route에는 사용하지 않는다. 존재하지 않거나 형식이 잘못된
token은 동일한 404, 만료된 방은 410이다.

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
수집 endpoint·allowlist·중복 제거·보존 정리는 자동 검증됐지만 제품 화면에서 다섯 event를
실제로 발행하는 instrumentation은 아직 연결 증거가 없어 별도 구현 범위로 남긴다.

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
| 405 | `METHOD_NOT_ALLOWED` | 알려진 resource에 허용되지 않은 HTTP method, `Allow` 포함 |
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
- 공통 JSON envelope는 `{eventId, occurredAt, aggregateId, snapshot}`이다. 최초
  `snapshot`과 terminal event의 `snapshot`에는 각각 완전한 `RecommendationJobView` 또는
  room view를 넣는다. 중간 event도 같은 최신 snapshot을 넣어 클라이언트가 event별
  부분 payload 조합에 의존하지 않게 한다.
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
| `implemented` | `recommendation.requested.v1` | 추천 application service | 추천 Worker | 저장·확정된 Job 처리 요청 |

event envelope는 `eventId`, `eventType`, `version`, `aggregateId`, `idempotencyKey`,
`occurredAt`, `traceId`, `payload`를 가진다. payload에는 `jobId`만 두고 draft 조건은
Worker가 DB에서 읽어 event의 개인정보와 크기를 줄인다. relay는 outbox를 반복 publish할
수 있고 Worker는 at-least-once delivery를 전제로 처리한다. DB commit 뒤에만 ACK하며
제한 재시도 뒤에는 원본 event ID와 안전한 오류 code를 DLQ에 보존한다.

`RecommendationJobPipelineIntegrationTest`는 Job·outbox 원자성, 멱등 replay, pending
claim, commit 전 ACK 금지, 제한 retry와 DLQ를 PostgreSQL·Redis Testcontainers로 검증한다.

## LLM과 외부 검색

### 구현 상태

| 상태 | 경계 | 의미 | Task |
| --- | --- | --- | --- |
| `implemented` | Naver Local·Blog adapter | API HUB header·schema·오류 정규화와 Mock 계약 검증 | PP-013 |
| `implemented` | Elice Chat adapter | 조건 추출·근거 이유 strict schema와 Mock·Eval 검증 | PP-009, PP-016 |
| `implemented` | 동기 추천 Core | 확정 조건부터 후보·근거·점수·Top 3·이유 fallback | PP-039 |
| `implemented` | 직접 실제 Core 연결 증거 | 직접 Java adapter의 세 합성 Naver→Elice 흐름; CASE-0002가 정본 | PP-040, PP-042 |
| `implemented` | 제품 runtime wiring | production Elice·Naver bean과 Worker Core 연결; Mock pipeline·wiring 자동 검증 | PP-029 |
| `implemented` | Live Playground | 개발 profile API·SSE·화면·TTL·삭제와 직접 Provider 실행 | PP-042 |
| `implemented` | 로컬 정식 API→Worker→Provider E2E | 별도 주최자·참여자 세션, 202·Outbox·Redis Worker·추천/방 SSE·투표·확정을 실제 Provider로 검증 | PP-042, PP-043 |
| `planned` | 배포된 정식 API→Worker→Provider E2E | 실제 cloud runtime에서 제품 전체 경로 검증 | PP-043 |
| `planned` | 무료 Cloud Demo | Render secret과 배포 E2E | PP-043 |

PP-037의 Approval Gate·Provider Gateway와 Split/Linked 전용 Gateway는 MVP 계약에서
제외한다. 과거 결정과 검증 결과는 ADR-0009, ADR-0013과
[CASE-0002](case-studies/CASE-0002-naver-elice-linked-live-user-flow.md)에 보존한다.

### Naver 검색

domain은 Naver DTO가 아닌 `PlaceSearchPort`와 `BlogSearchPort`에 의존한다. adapter는
NAVER API HUB의 Local·Blog 계약을 사용하고 HTML 제거, Unicode·공백 정규화와 provider
오류 분류를 adapter 경계에서 수행한다. 원문 응답은 영구 저장하거나 일반 로그에 남기지
않는다.

Local 결과는 유효한 HTTP(S) source link, 위치 token과 versioned category taxonomy를
통과해야 한다. canonical link가 같거나 정규화한 이름과 비어 있지 않은 주소가 모두
같을 때만 중복으로 병합한다. 후보가 부족하면 검색어에 실제 포함된 최저 priority 선호
한 개만 제거해 Local을 한 번 더 호출한다. 여전히 세 개 미만이면
`INSUFFICIENT_CANDIDATES`로 종료한다.

Blog 근거는 후보별 최대 세 개를 연결한다. 하나의 Blog provider 호출이라도 실패하면
이미 받은 Blog 근거를 모두 폐기하고 `LOCAL_ONLY`, `degraded=true`,
`BLOG_EVIDENCE_UNAVAILABLE`로 처리한다.

### Elice Chat

MVP LLM은 Elice OpenAI-compatible Chat Completions의
`openai/gpt-4.1-mini`를 사용한다. 조건 추출과 근거 이유 생성은 각각 strict JSON
Schema, `additionalProperties=false`, bounded output, timeout, retry 0과 tool 미사용을
요구한다. 자유 text나 Responses API로 자동 fallback하지 않는다.

Embedding `openai/text-embedding-3-small`은 과거 capability만 확인했으며 추천·검색·
점수·중복 제거 runtime에는 사용하지 않는다.

이유 생성에는 Top 3의 허용된 장소·근거만 전달한다. 출력 place ID 집합은 입력 Top 3와
정확히 같고, 모든 evidence ID는 같은 후보의 입력 근거에 속해야 한다. 가격, 영업 상태,
도보 시간, 출구처럼 제공되지 않은 속성은 금지한다. 한 후보라도 schema·근거 검증에
실패하면 batch 전체를 버리고 서버 template fallback을 사용한다. 점수·순위·주의점·
공유 문구는 서버가 결정한다.

이유 출력은 `placepick.reason-statements.v2`다. 장소마다 1~3개의 자연스러운 한국어
문장을 허용하고 각 문장은 1~160자, 같은 장소에 속한 1~3개의 고유 evidence ID를
인용한다. 서버는 place/evidence 소유 관계, 금지 속성, 입력 근거와의 최소 어휘 연결을
다시 검증한다. LLM 결과 일부만 섞지 않으며 한 문장이라도 실패하면 Top 3 전체를 서버
template으로 교체한다.

2026-07-16 직접 Live Evidence는 알려진 유형의 불필요한 detail 정규화, 서버 warning
생성, v2 자연 문장과 동일 후보 evidence 검증을 적용한 세 시나리오에서
`reasonFallback=false`를 확인했다. 실행 과정과 safe summary는
[CASE-0002](case-studies/CASE-0002-naver-elice-linked-live-user-flow.md)를 정본으로 삼는다.

### 실행과 비밀 경계

`local`, `test`, 일반 CI와 `make check`는 Mock만 사용하고 실제 외부 호출을
허용하지 않는다. 실제 Provider는 개발자가 명시적으로 `make dev-live` 또는
`make live-evidence`를 실행할 때만 사용한다.

로컬 자격은 Git에서 제외한 `.env.live.local`, 배포 자격은 Render runtime secret
store에 둔다. Naver key, Elice token과 routing URL을 Git, GitHub Actions, Vercel
browser bundle, PR·Issue·artifact에 넣지 않는다. GitHub Actions에는 배포에 필요한 최소
scope credential만 둔다.

`make live-evidence`는 안전한 단계·count·latency·schema 결과만 증거로 남긴다.
실제 장소명·주소·링크·사용자 입력·prompt·completion을 문서나 기본 로그에 남기지 않는다.
사람이 값 단위로 확인하는 PP-042 Live Playground는 로컬 화면에만 표시하고 저장·공유
모드는 별도로 통제한다.

실제 사용자 입력, Naver 결과의 제3자 LLM 전달과 영구 저장은 Naver·Elice 정책, 표시
의무, 개인정보와 데이터 수명 검토를 통과한 제품 runtime에서만 활성화한다. `store=false`
전달만으로 제3자 미보관을 보증하지 않는다.

### 검증 축

| 축 | 증명하는 것 | 증명하지 않는 것 |
| --- | --- | --- |
| Mock 자동 검증 | 변환·오류·fallback·redaction 회귀 | 현재 자격·Provider 가용성 |
| 직접 Live Evidence | 현재 직접 adapter의 실제 Naver→Elice 연결 | 정식 API 전체·cloud·장기 품질·SLA |
| Live Playground | 사람이 단계별 실제 값을 확인 | 자동 회귀·운영 안정성 |
| 로컬 제품 Live E2E | 정식 API·DB·Redis Worker·추천/방 SSE·투표·확정의 실제 Provider 연결 | cloud revision·cold start·rollback |
| Cloud Demo E2E | 배포된 대표 사용자 여정 | 상시 운영·무중단·SLA |

한 축의 성공을 다른 축의 완료로 표현하지 않는다. 실제 실행의 과정·결과와 제한은
[CASE-0002](case-studies/CASE-0002-naver-elice-linked-live-user-flow.md) 한 곳에서 관리한다.

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
