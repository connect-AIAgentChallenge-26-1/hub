---
id: CASE-0002
title: 실제 Naver→Elice 추천과 정식 서비스 사용자 여정 검증
type: case-study
status: verified
date: 2026-07-16
owners:
  - placepick-team
related:
  - ../work-records/WI-0044-live-playground.md
  - ../work-records/WI-0045-free-cloud-demo-deployment.md
  - ../adr/ADR-0014-mvp-direct-provider-and-simplified-trust-boundary.md
  - ../runbooks/RUN-0005-direct-live-development.md
  - ../contracts.md
  - ../archive/work-records/WI-0042-naver-elice-linked-live-workflow.md
  - ../archive/experiments/EXP-0001-linked-live-representative-scenario-repeatability.md
  - https://github.com/gdh0730/hub/issues/56
---

# CASE-0002 실제 Naver→Elice 추천과 정식 서비스 사용자 여정 검증

## 결론

2026-07-16 `make live-evidence`로 세 고정 합성 사용자 시나리오를 각각 독립 실행했다.
제품과 같은 Java adapter가 실제 Elice 조건 추출, 실제 Naver Local·Blog 검색, 서버의
정규화·필터·점수·Top 3, 실제 Elice 근거 이유 생성과 서버의 최종 evidence 검증을 끝까지
연결했다.

세 시나리오는 모두 장소 3개, `linked=true`, `degraded=false`,
`reasonFallback=false`로 통과했다. 호출 수는 각각 7·6·6회, 합계 19회였고 자동 retry와
Embedding 호출은 없었다. 실행 뒤 생성 report를 대상으로 한 secret scan도 통과했다.

이 결과는 **현재 직접 Java Provider 경로의 추천 핵심 워크플로가 세 합성 조건에서 실제로
작동했다**는 증거다. 실제 cloud에 배포된 브라우저 E2E, 장기 가용성·추천 품질·성능·SLA를
증명하지는 않는다.

같은 날 두 단계의 추가 검증도 수행했다. 첫째, Live Playground 브라우저에서 실제 Elice
Draft를 사람이 검토·보정한 뒤 실제 Naver evidence, 서버 Top 3와 Elice 이유를 화면에서
확인하고 데이터를 삭제했다. 둘째, same-origin 정식 API로 주최자·참여자 여정을 실행해
`202` Job, PostgreSQL Outbox, Redis Streams Worker, 추천·방 SSE, 투표 변경·삭제와 최종
확정까지 실제 Provider로 통과했다. 따라서 Core 호환성뿐 아니라 **로컬에서 정식 서비스
구성요소가 실제 Provider와 연결돼 사용자 여정을 완료한다**는 사실도 확인했다. 다만
Vercel·Render·Neon·Upstash에 배포한 결과는 아니므로 Cloud Demo는 계속 `planned`다.

## 무엇을 검증했는가

```text
고정 합성 자연어
  → 실제 Elice 조건 Draft 추출
  → 서버의 필수 의미 검증
  → versioned 확정 조건으로 사용자 검토·수정 경계 모사
  → 실제 Naver Local 후보 검색
  → 서버 정규화·필수 조건 filter·중복 제거
  → 실제 Naver Blog 근거 수집
  → 서버의 결정론적 점수·Top 3
  → 실제 Elice reason-statements.v2 생성
  → 서버의 place/evidence·금지 속성 검증
  → 세 장소의 완료 결과
```

실제 Provider 원문 응답, 장소명, 주소, 링크, prompt, completion과 인증정보는 증거 문서에
저장하지 않았다. 아래 내용은 versioned synthetic fixture의 의미와 안전한 실행 요약만
설명한다.

## 사용자 여정

### 1. 사용자가 자연어 조건을 입력한다

세 시나리오는 서로 다른 조건 누락과 선호가 제품 규칙에 어떤 영향을 주는지 확인하도록
구성했다.

| 시나리오 | 합성 사용자의 의도 | 확인하려는 경계 |
| --- | --- | --- |
| `seoul-cafe-complete-v1` | 서울, 카페, 2명, 1인당 최대 2만원, 조용함, 흡연 제외 | 인원·예산·선호·제외가 있는 완전 조건 |
| `seoul-restaurant-nullable-v1` | 서울 음식점, 인원·예산·선호 미지정 | 누락값을 추정하지 않는 nullable 조건 |
| `seoul-cafe-dessert-v1` | 서울, 디저트 카페, 흡연 제외 | 선호·제외가 검색과 근거에 연결되는 조건 |

Elice에는 이 합성 자연어와 비가역 synthetic safety identifier만 보냈다. 실제 사용자나
개인정보는 사용하지 않았다.

### 2. Elice가 조건 Draft를 추출하고 서버가 의미를 확인한다

Elice Chat Completions가 strict JSON Schema로 Draft를 반환했다. 서버는 각 응답이 성공
schema를 만족하고, 장소 유형과 위치가 합성 입력의 허용 의미와 일치하는지 확인했다.

추출 결과를 곧바로 추천에 사용하지 않았다. 실제 사용자가 화면에서 검토·수정하고
확정하는 경계를 재현하기 위해, 검증이 끝난 versioned `ConfirmedRecommendationCondition`
fixture를 추천 Core에 넘겼다. 따라서 이번 증거는 사용자 확인 경계를 보존하지만 사람이
실제 브라우저에서 버튼을 누른 E2E는 아니다. 그 차이는 뒤의 Live Playground 검증에서
별도로 확인했다.

### 3. Provider 표현 차이를 서버 의미로 정규화한다

실제 응답을 연결하면서 Mock만으로 드러나지 않던 세 차이를 확인했고 서버 정책으로
고정했다.

| 관찰한 문제 | 잘못된 처리의 위험 | 채택한 서버 정책 |
| --- | --- | --- |
| 이미 알려진 `CAFE`·`RESTAURANT`·`BAR`에도 `placeTypeDetail`이 올 수 있음 | 의미는 맞는 응답을 schema 실패로 오판 | 알려진 유형의 detail은 무시해 null로 정규화하고 `OTHER`만 필수 검증 |
| LLM warning 목록의 표현·누락이 달라질 수 있음 | 같은 조건이 호출마다 다른 제품 상태가 됨 | 누락 인원·예산 warning은 정규화 조건에서 서버가 결정적으로 생성 |
| 이유 v1의 단일 고정 문구는 실제 추천 문장으로 부자연스러움 | 계약은 통과하지만 사용자 가치가 낮음 | v2 자연어를 허용하되 서버 evidence 검증을 강화 |

즉, Provider JSON이 제품 상태의 정본이 아니다. Provider는 구조화된 후보를 제안하고
warning·정규화·최종 유효성은 서버가 결정한다.

### 4. Naver Local 후보를 검색하고 서버가 후보를 선별한다

사용자 확인을 거친 조건으로 실제 Naver Local을 호출했다. Java adapter는 HTML·공백을
정리하고 provider DTO를 domain-neutral 후보로 변환했다. 추천 Core는 다음 순서로 후보를
검사했다.

1. 유효한 source link가 있는지 확인한다.
2. 주소가 위치 조건을 충족하는지 확인한다.
3. category taxonomy가 장소 유형을 충족하는지 확인한다.
4. 제외 조건과 충돌하는 후보를 제거한다.
5. canonical link 또는 이름과 비어 있지 않은 주소가 같은 후보만 중복으로 병합한다.
6. 유효 후보가 세 개보다 적을 때만 가장 낮은 priority 선호 하나를 최대 한 번 완화한다.

세 실행 모두 최종 장소 3개를 만들 수 있었고 `degraded=false`였다. 호출별 실제 장소와
검색어는 Provider 데이터 비보존 원칙에 따라 기록하지 않았다.

### 5. Naver Blog 근거를 후보에 연결한다

예비 후보마다 실제 Naver Blog를 조회하고, 서버가 해당 후보에 연결할 수 있는 근거만
남겼다. Blog 호출 하나라도 Provider 장애가 나면 일부 근거를 섞지 않고 전체를
`LOCAL_ONLY`로 낮추는 정책이지만 이번 세 실행에서는 그 경로가 발생하지 않았다.

이 단계의 성공은 단순히 Blog가 2xx를 반환했다는 뜻이 아니다. 다음 Elice 이유 요청과
최종 검증에 사용할 수 있는 후보별 evidence가 구성됐다는 뜻이다.

### 6. 서버가 점수와 Top 3를 결정한다

순위는 LLM이 아니라 서버가 결정했다. 위치 30, 유형 25, 선호 최대 15, Blog 근거 최대
10점으로 계산하며 구조화된 가격 근거가 없어 예산 점수는 0으로 유지한다. 동점은 필수
조건 일치율, evidence 수, 내부 `CandidateKey` 순으로 안정적으로 정렬한다.

점수·순위·`CandidateKey`는 Elice에 보내지 않았다. Top 3를 고른 뒤에만 UUID v4
`placeId`를 발급했으므로 임의 UUID가 정렬 결과를 바꾸지 않는다.

### 7. Elice가 실제 Naver 파생 근거로 이유를 만든다

Top 3의 허용된 장소 정보와 후보별 evidence만 한 번의 batch로 Elice에 전달했다.
`placepick.reason-statements.v2`는 장소마다 1~3개의 자연스러운 한국어 문장과 문장당
1~3개의 evidence ID를 허용한다.

v2는 문장 표현을 자연스럽게 만들지만 사실 권한을 LLM에 넘기지 않는다. 서버는 다음을
다시 검사한다.

- 출력 place ID 집합이 입력 Top 3와 정확히 같은가
- 각 evidence ID가 같은 후보에 속하는가
- 가격, 영업 상태, 도보 시간, 출구처럼 제공하지 않은 속성을 만들지 않았는가
- 문장이 인용한 근거와 최소한의 어휘 연결을 가지는가
- 점수·순위·주의점·공유 문구를 LLM이 만들지 않았는가

한 문장이라도 실패하면 일부 결과를 섞지 않고 세 후보 전체를 서버 template으로 바꾼다.
이번 세 실행은 모두 이 검증을 통과해 `reasonFallback=false`였다.

### 8. 안전한 완료 결과만 증거로 남긴다

| 시나리오 | 실제 호출 수 | 장소 수 | 연결 | 저하 | 이유 fallback | 판정 |
| --- | ---: | ---: | --- | --- | --- | --- |
| `seoul-cafe-complete-v1` | 7 | 3 | true | false | false | 통과 |
| `seoul-restaurant-nullable-v1` | 6 | 3 | true | false | false | 통과 |
| `seoul-cafe-dessert-v1` | 6 | 3 | true | false | false | 통과 |
| 합계 | 19 | 시나리오마다 3 | true | false | false | 통과 |

`linked=true`는 같은 invocation 안에서 실제 Naver 파생 근거가 실제 Elice 이유 입력으로
연결됐다는 뜻이다. `degraded=false`는 Blog 전체 저하가 없었다는 뜻이고,
`reasonFallback=false`는 Elice v2 결과가 서버 evidence 검증을 통과했다는 뜻이다.

실행 종료 후 생성된 JUnit·Gradle report에서 credential과 Provider payload marker를 찾는
secret scan도 통과했다. 이 검사는 생성 report의 비노출을 검증하며 로컬 PC 전체나
Provider 측 보관 정책까지 증명하는 검사는 아니다.

## Live Playground에서 실제 값을 확인한 사용자 흐름

고정 합성 증거와 별도로 `make dev-live`를 실행하고 브라우저의 `/playground`에서 사람이
실제 단계 값을 확인했다. 값 자체는 로컬 화면에서만 확인하고 이 문서에는 검색어,
장소명·주소·링크, Blog 제목, prompt·completion과 Provider 응답 body를 기록하지 않았다.

1. 사용자가 비개인성 자연어 조건을 입력했다.
2. 실제 Elice가 조건 Draft를 반환했다. 장소 유형은 입력 의미와 맞았지만 위치 표현은
   제품 확정 조건으로 그대로 사용하기에 충분하지 않았다.
3. 사용자가 화면에서 위치를 정규화해 확정했다. 자동 추천을 시작하지 않았으므로 실제
   Provider 변동을 이 경계에서 바로잡을 수 있었다.
4. 실제 Naver Local 후보와 후보별 필터·중복 제거 결과가 단계 trace에 나타났다.
5. 실제 Blog evidence가 후보별로 연결되고 서버 점수와 Top 3가 표시됐다.
6. 실제 Elice 이유와 서버의 place/evidence 소유 관계 검증 결과가 표시됐다.
7. 완료 결과를 삭제했고 연결 Draft와 메모리 실행 데이터가 더 이상 조회되지 않았다.

브라우저 자동 검증은 실제 동적 값 대신 `INPUT_READY`, Draft 검증, 조건 보정·확정, Naver
evidence, Top 3와 삭제라는 고정 단계의 성공만 출력했다. screenshot·video·trace는 만들지
않았다. 이 결과는 Live 화면이 단순한 정적 prototype이 아니라 실제 adapter와 추천 Core를
호출하고, 사람이 조건을 수정할 수 있는 실행 가능한 검증 도구임을 보여 준다.

## 정식 제품 API에서 실제로 완료한 사용자 흐름

다음 검증은 개발 전용 `/__dev/api/**`가 아니라 same-origin Next 경로의 정식
`/api/v1/**`를 사용했다. PostgreSQL과 Redis를 사용했고 추천 Worker는 실제 Naver·Elice
adapter를 호출했다. 로그에는 고정 단계명과 성공 여부만 남겼다.

### 1. 주최자가 익명 세션을 시작하고 조건을 확인한다

서버가 주최자용 HttpOnly session cookie와 CSRF token을 발급했다. 주최자의 자연어는
실제 Elice 조건 추출을 거쳤고, 응답을 자동 소비하지 않고 versioned 제품 조건으로
명시적으로 확정했다. Draft 상태가 `CONFIRMED`가 된 뒤에만 추천을 제출했다.

### 2. 추천이 202 Job으로 접수되고 Worker가 처리한다

추천 생성은 동기 결과나 200을 반환하지 않고 `202 Accepted`, UUID v4 `jobId`와 정확한
`Location`을 반환했다. PostgreSQL에 Job과 transactional outbox가 함께 생성됐고 relay가
Redis Streams로 전달했다. Worker는 실제 추천 Core를 실행해 결과를 PostgreSQL에
저장했다.

### 3. 추천 SSE와 조회가 실제 Top 3 완료 상태로 수렴한다

same-origin 추천 SSE의 첫 상태 event가 `snapshot`인지 확인하고 이후 progress가 감소하지
않는지 검사했다. terminal `completed` 뒤 snapshot 조회는 정확히 세 장소와 각 장소의
서버 검증 추천 이유를 반환했다. 이때 점수·순위는 서버가 정했고 Elice 출력은 이를
변경하지 않았다.

### 4. 주최자가 방을 만들고 별도 참여자가 투표한다

완료 Job으로 방을 만들고 주최자 capability를 방 경로에 한정된 cookie로 받았다. 별도
cookie jar로 새 익명 참여자 세션을 만들었다. 참여자는 같은 후보에 대해
`LIKE → DISLIKE → DELETE → LIKE`를 차례로 실행했다. 이는 투표 생성, 원자적 교체,
멱등 삭제와 삭제 뒤 재생성을 한 흐름에서 확인한다.

방 SSE는 첫 상태 event `snapshot`, 투표 중 `voteUpdated`, 확정 시 `finalized`를 받았다.
주최자만 최종 후보를 확정했고, 참여자 세션의 결과 조회가 주최자 선택과 같은 장소와
확정 시각을 반환했다.

### 5. 최초 SSE timeout을 원인과 계약으로 분리했다

최초 정식 흐름은 방 SSE에서 90초 timeout으로 종료됐다. 서버는 HTTP 200,
`text/event-stream`과 response body를 제공했고 투표·확정 mutation은 아직 시작되지 않은
상태였다. Next rewrite를 지난 작은 초기 frame을 smoke가 먼저 읽어야만 mutation을
시작하도록 만든 상호 대기가 원인이었다. 즉, 방 transaction이나 SSE emitter가 실패한
것이 아니었다.

smoke는 transport의 HTTP 200, content type과 body 연결이 확인되면 mutation을 시작하도록
수정했다. 대신 상태 계약은 약화하지 않았다. 첫 non-heartbeat event는 여전히
`snapshot`이어야 하고, `voteUpdated`와 `finalized`를 모두 받아야 성공한다. 같은 수정으로
Mock과 실제 Provider 흐름을 각각 다시 실행해 모두 통과했다.

### 6. 정식 로컬 Live 판정

| 단계 | 실제로 확인한 결과 |
| --- | --- |
| 세션·보안 | 분리된 주최자·참여자 세션과 CSRF 적용 |
| 조건 | 실제 Elice 추출 뒤 명시적 사용자 확정 |
| 비동기 처리 | 202, Location, Job·Outbox, Redis Worker 완료 |
| 추천 stream | snapshot-first, progress, terminal 완료 |
| 추천 결과 | 실제 Provider 기반 Top 3와 검증 이유 |
| 공유·투표 | 방 생성, LIKE·DISLIKE·DELETE·LIKE 반영 |
| 방 stream | snapshot, voteUpdated, finalized 수신 |
| 최종 결과 | 주최자 확정과 참여자 결과 조회 일치 |
| 비노출 | Provider 값·자격·응답 body를 출력하지 않음 |

최종 safe summary는 `userFlow=complete`, `providerDataLogged=false`로 통과했다. 이 판정은
로컬 Dev Container와 same-origin 개발 proxy에서 수행한 실제 제품 흐름이다. 무료 Cloud의
sleep·TLS Redis·Neon migration·배포 revision·rollback은 별도의 PP-043 검증 항목이다.

## 자동 검증과 실제 검증의 역할 분리

실제 호출만 반복하면 오류·경합·만료를 결정적으로 재현할 수 없고, Mock만으로는 현재
Provider 응답 차이를 알 수 없다. 두 검증은 다음처럼 역할을 나눈다.

| 검증 축 | 확인한 내용 | 한계 |
| --- | --- | --- |
| 단위·Mock 계약 | Java 단위 162, 통합 158, 프런트 단위 29, 브라우저 E2E 4개로 schema·정규화·fallback·제품 흐름 검증 | 현재 Provider 가용성은 모름 |
| Testcontainers 통합 | Session, Draft, 202 Job, Outbox, Redis Worker, SSE, Room, Vote, 이벤트 | 외부 Provider는 Mock |
| 직접 Live Evidence | 실제 Elice→Naver→Elice 추천 Core 3개 시나리오 | 브라우저·cloud·장기 품질은 아님 |
| Live Playground | 사람이 실제 Draft 보정, 후보·evidence·Top 3·이유와 삭제를 확인 | 로컬 개발 profile이며 cloud가 아님 |
| 로컬 제품 Live E2E | 정식 API·DB·Redis Worker·두 SSE·별도 참여자 투표·확정 | 로컬 same-origin이며 배포 revision·cold start는 아님 |
| Cloud Demo E2E | 배포된 대표 사용자 여정 | 아직 `planned` |

정식 `/api/v1/**` 제품 경로와 DB·Worker·SSE·Room은 자동 통합 테스트와 로컬 제품 Live
E2E가 각각 결정적 경계와 실제 Provider 연결을 검증한다. 직접 Live Evidence는 동일 추천
Core의 세 시나리오 반복성을 보완한다. 따라서 “코드가 존재한다”, “실제 Provider가
호환된다”, “로컬 정식 사용자 여정이 끝까지 작동한다”는 사실은 말할 수 있다. 배포
환경의 전체 E2E가 끝났다고는 표현하지 않는다.

## 남은 위험과 다음 검증

- 합성 세 건은 대표 경로이지 임의 자연어와 지역·유형 전체의 품질 표본이 아니다.
- Provider schema·모델 동작·검색 결과는 앞으로 바뀔 수 있다.
- 실제 사용자 데이터 처리, 보관, 표시 의무와 제3자 전달 정책은 운영 활성화 전에 사람이
  다시 검토해야 한다.
- Live Playground에서 실제 값을 사람이 확인하는 것과 report의 redacted evidence는 목적이
  다르다. 화면 공유·브라우저 확장·로컬 접근 위험을 별도로 관리해야 한다.
- Vercel·Render·Neon·Upstash의 실제 리소스, secret 주입, migration, cold start,
  rollback과 배포 사용자 여정은 PP-043에서 검증하기 전까지 `planned`다.

이번 검증의 핵심 학습은 LLM 출력을 더 엄격한 문자열 모양으로 제한하는 것보다, Provider가
표현할 수 있는 변동은 정규화하고 제품 의미·warning·순위·근거 소유권을 서버가 다시
결정하는 편이 실제 사용자 가치와 안전성을 함께 높인다는 점이다.
