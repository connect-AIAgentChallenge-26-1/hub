---
id: EXP-0001
title: Linked Live 대표 시나리오 반복 검증
type: experiment
status: completed
date: 2026-07-15
owners:
  - placepick-team
related:
  - ../work-records/WI-0042-naver-elice-linked-live-workflow.md
  - ../adr/ADR-0013-naver-elice-linked-live-boundary.md
  - ../runbooks/RUN-0004-recommendation-workflow-linked-live.md
  - ../troubleshooting/TS-0016-linked-live-provider-error-flattening.md
  - ../troubleshooting/TS-0017-workerd-linked-live-outbound-transport.md
  - ../troubleshooting/TS-0018-elice-structured-output-unsupported-array-keyword.md
---

# EXP-0001 Linked Live 대표 시나리오 반복 검증

## 가설과 목적

가설은 검토·push된 동일 코드에서 서로 다른 고정 합성 사용자 조건을 독립 실행해도
`Elice 조건 추출 -> 사용자 확인 경계 -> Naver Local·Blog -> 결정론적 Top 3 ->
Elice 근거 이유 -> 서버 검증`의 실제 연결이 strict 계약을 유지한다는 것이다.

목적은 단일 성공 사례의 우연성을 줄이고, 값이 모두 채워진 조건뿐 아니라 선택 정보가
누락된 조건과 선호가 있는 조건에서도 실제 Provider와 제품 core의 연결이 작동하는지
확인하는 것이다. 이 실험은 공개 API, 비동기 Job·Worker, 영속화, SSE, frontend 또는
배포 runtime의 검증이 아니다.

## 변수와 측정 방법

통제 조건은 다음과 같다.

- 모든 실행은 Dev Container의 Java 17과 Node 24에서 동일한 검토·push SHA
  `e789af65e94441aa38a018a2931c3705f7125112`를 사용했다.
- 각 시나리오는 별도 `workflow-live-linked-dev` invocation으로 실행했다. 한 invocation
  내부의 HTTP retry와 redirect는 모두 0회다.
- 입력은 versioned 고정 합성 데이터이며 실제 사용자 정보는 사용하지 않았다.
- 원본 Provider 자격은 Loopback Gateway만 보유했고 응답은 메모리에서 처리했다.
- 합격선은 `linked=true`, `degraded=false`, `reasonFallback=false`, `cleanup=true`와
  시나리오별 strict schema·의미·provenance 검증의 전부 통과다.
- `callCount`는 application이 허용한 Provider 논리 호출 수다. Provider 내부 재시도나
  서비스 수준 가용성을 나타내는 지표로 사용하지 않는다.

독립 변수는 사용자 조건의 완전성과 선호 유무다.

| 시나리오 | 사용자 흐름에서 달라지는 조건 | 검증 의도 |
| --- | --- | --- |
| `seoul-cafe-complete-v1` | 인원·예산·조용함 선호·흡연 제외가 모두 있음 | 완전한 Draft와 확정 조건의 실제 연결 |
| `seoul-restaurant-nullable-v1` | 인원·예산·선호·제외가 없음 | 누락 값을 추정하지 않고 nullable·warning을 유지 |
| `seoul-cafe-dessert-v1` | 인원·예산은 없고 디저트 선호·흡연 제외가 있음 | nullable과 선호·제외가 함께 있는 흐름 |

출력은 장소명·주소·검색어·prompt·completion·Provider body 대신 시나리오 ID, strict 성공
상태, 호출 수, degraded·fallback·cleanup 여부만 사용했다.

## 실행 결과

### 시나리오 1: 조건이 모두 있는 카페 탐색

1. Elice는 위치, 카페 유형, 인원, 예산, 선호와 제외 조건을 Draft schema로 반환했다.
2. 서버는 추출 의미를 finite allowlist로 검증한 뒤 versioned 확정 fixture를 적용했다.
3. Naver Local·Blog 결과는 제품 normalizer·filter·dedup과 근거 연결을 통과했다.
4. 서버가 점수와 Top 3를 먼저 확정하고 Elice에는 허용된 장소·근거 문맥만 전달했다.
5. Elice 결과의 place·evidence 관계를 서버가 다시 검증했다.

결과는 `callCount=7`, `degraded=false`, `reasonFallback=false`, `cleanup=true`인 strict
성공이었다. HTTP retry는 0회였다.

### 시나리오 2: 인원과 예산을 생략한 음식점 탐색

1. Elice 조건 추출에서 인원과 예산을 임의로 만들지 않고 nullable로 유지하는지
   검증했다.
2. 서버는 누락 warning과 명시적 사용자 확인 경계를 확인한 뒤 음식점 확정 조건을
   추천 core에 전달했다.
3. 실제 Naver 후보와 Blog 근거를 처리하고 서버가 Top 3를 결정했다.
4. Elice 근거 이유와 서버의 place·evidence 사후 검증까지 완료했다.

결과는 `callCount=6`, `degraded=false`, `reasonFallback=false`, `cleanup=true`인 strict
성공이었다. HTTP retry는 0회였다.

### 시나리오 3: 선택 정보가 누락된 디저트 카페 탐색

1. 인원·예산은 nullable로 유지하면서 디저트 선호와 흡연 제외가 분리 추출되는지
   검증했다.
2. 사용자가 확인한 versioned 조건을 기준으로 실제 Naver 후보를 정규화·필터링하고
   Blog 근거를 연결했다.
3. 서버의 결정론적 Top 3를 바꾸지 않은 채 Elice가 허용된 근거 안에서 이유를 만들고,
   서버가 그 관계를 다시 검증했다.

결과는 `callCount=6`, `degraded=false`, `reasonFallback=false`, `cleanup=true`인 strict
성공이었다. HTTP retry는 0회였다.

세 시나리오는 모두 같은 SHA에서 독립 invocation으로 성공했다. 모든 실행에서 fallback이나
Blog degraded가 발생하지 않았고 종료 뒤 Gateway와 임시 자원의 cleanup을 확인했다.

## 해석과 결정

가설은 정의한 세 고정 합성 시나리오와 해당 실행 시점의 실제 Provider 응답 범위에서는
채택한다. 즉, 조건의 완전성이 다른 대표 입력에서 실제 Elice 조건 추출, 실제 Naver
검색·근거, 서버 순위와 실제 Elice 이유 생성이 하나의 핵심 워크플로로 연결될 수 있음을
확인했다.

성공만 선별해 해석하지 않는다. 준비 과정에서 다음 실패가 먼저 관찰됐다.

- 이유 생성 strict schema의 `uniqueItems` 때문에 Elice가 400을 반환했다. 미지원 배열
  keyword를 제거하고 자동 회귀를 보강한 뒤 실제 전체 연결이 성공했다. 자세한 재현과
  해결은 TS-0018에 기록한다.
- 조건 추출 결과가 기대 의미와 달랐던 실행은 downstream Naver 호출 전에 fail-close했다.
  오류를 필드별 안전 code로 분리해 schema 성공과 의미 성공을 구분했다.
- nullable 시나리오에서 위치가 정확한 영문 동치 `Seoul`로 반환된 실행은 기존 한국어
  finite allowlist 때문에 거부됐다. 원문을 출력하지 않는 고정 안전 분류기로 exact 번역
  동치임을 확인한 뒤 `Seoul`·`seoul`만 유한 alias로 추가했으며 fuzzy matching이나 임의
  extra token 허용으로 넓히지 않았다.

표본은 세 시나리오의 각 한 번 성공에 불과하고 시간대·검색 분포·장애 상태를 대표하지
않는다. 따라서 성공률, SLA, 장기 가용성, 처리량 또는 성능 기준선을 계산하지 않는다.
Provider schema·모델·검색 분포가 바뀌거나 실제 사용자 runtime을 연결할 때는 별도
Experiment와 PP-029·PP-032~PP-035 검증을 수행한다.
