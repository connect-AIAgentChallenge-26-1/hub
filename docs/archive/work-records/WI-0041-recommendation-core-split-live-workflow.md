---
id: WI-0041
title: PP-039 핵심 추천 워크플로와 Split Live 검증
type: work-record
status: blocked
date: 2026-07-15
owners:
  - placepick-team
related:
  - ../roadmap.md
  - ../contracts.md
  - ../adr/ADR-0012-recommendation-core-and-split-live-boundary.md
  - ../adr/ADR-0013-naver-elice-linked-live-boundary.md
  - ../runbooks/RUN-0003-recommendation-workflow-split-live-probe.md
  - WI-0042-naver-elice-linked-live-workflow.md
  - WI-0011-condition-extraction-port-schema-eval.md
  - WI-0016-candidate-normalization-deduplication-evidence.md
  - WI-0017-deterministic-scoring-top3-relaxation.md
  - WI-0018-grounded-reason-fallback.md
  - https://github.com/gdh0730/hub/issues/50
paths:
  - backend/src/main/java/com/placepick/recommendation/**
  - backend/src/main/java/com/placepick/infrastructure/external/llm/**
  - backend/src/test/java/com/placepick/recommendation/**
  - backend/src/test/java/com/placepick/infrastructure/external/llm/**
  - backend/src/integrationTest/java/com/placepick/recommendation/**
  - backend/src/integrationTest/java/com/placepick/infrastructure/external/llm/**
  - backend/src/evalTest/**
  - backend/src/workflowLiveProbeTest/**
  - backend/build.gradle
  - edge/**
  - mock-api/**
  - package.json
  - package-lock.json
  - scripts/**
  - Makefile
  - docs/**
---

# WI-0041 PP-039 핵심 추천 워크플로와 Split Live 검증

> Split Live 성공 기준은 충족하지 못한 채 중단됐다. 이후 PP-040이 실제 Linked Core를
> 별도로 검증했고 PP-041에서 Split 전용 경로를 제거했으므로 이 기록은 활성 작업이 아니다.

PP-039는 fork 저장소의 [Issue #44](https://github.com/gdh0730/hub/issues/44)로 추적한다.
Issue, 이 Work Record, roadmap과 구현·검증 증거는 같은 식별자를 유지한다.

## 문제와 근거

2026-07-14 Naver Local·Blog와 Elice Chat·Embedding의 개별 Local Live 계약은 각각
2xx와 필수 schema를 통과했다. 그러나 이는 인증·endpoint·응답 shape의 호환성 증거일
뿐, 조건 추출부터 검색·정규화·점수화·Top 3·근거 문장으로 이어지는 제품 워크플로가
구현되거나 검증됐다는 뜻은 아니다.

실제 Naver 결과를 바로 결합·재순위·저장하거나 Elice에 전달하면 Naver 약관·표시 의무와
Elice의 보관·학습·하위 처리자 정책이 확정되지 않은 상태에서 데이터 경계를 넓힌다.
반대로 개별 canary만 유지하면 provider 사이의 application 계약, 결정론적 점수,
fallback과 호출 상한을 검증할 수 없다. 전체 Mock 회귀와 제한된 실제 provider 검증이
각각 무엇을 증명하는지 분리한 핵심 슬라이스가 필요하다.

## 목적과 성공 기준

목적은 공개 API·DB·Worker 없이 이후 PP-017이 호출할 수 있는 동기식 추천 core를 만들고,
합성 데이터의 전체 Mock 연결과 provider별 Split Live를 서로 다른 증거로 검증하는 것이다.

- `ConditionExtractionPort`, `RecommendationCoreUseCase`,
  `GroundedReasonGenerationPort` 경계를 provider-neutral model로 구현한다.
- 추출 결과를 자동 추천에 넣지 않고 사용자가 확인한
  `ConfirmedRecommendationCondition`만 core가 받는다.
- Mock 전체 워크플로는 합성 조건과 검색·근거 fixture를 실제 application 흐름으로
  연결하고 정상 8회, 선호 완화 시 최대 9회의 논리 호출 상한을 검증한다.
- source link, 위치·유형·제외 filter, 보수적 dedup, 0~80 점수, `CandidateKey` 동점,
  한 번의 선호 완화와 후보 부족 실패를 결정적으로 검증한다.
- LLM은 Top 3별 evidence ID가 연결된 문장만 생성하고 점수·순위·사실·주의점·공유
  문구를 만들지 않는다. 잘못된 batch는 Top 3 전체 template fallback으로 바꾼다.
- Split Live는 Elice 합성 추출, Naver Local, Naver Blog, Elice 합성 이유 생성의 네
  논리 호출만 수행하며 Naver 응답을 Elice 요청에 전달하지 않는다.
- 비밀, provider routing identifier, 검색어, 장소 정보, prompt·completion과 원문
  응답은 console·report·Git에 남기지 않는다.

## 범위, 비범위와 제약

범위는 조건·후보·근거·점수 domain model, 동기 application use case, Mock adapter,
Elice 제품형 strict schema 경계, 결정론적 단위·통합·Eval과 로컬 전용 Split Live
launcher·Loopback Gateway다. 세부 구현은 PP-009, PP-014, PP-015, PP-016의 기존 Work
Record와 함께 추적한다.

공개 business Controller, 익명 세션, Draft 저장, PostgreSQL, Outbox, Redis Streams,
Worker, SSE, frontend, 투표방, 실제 cloud 배포와 Embedding runtime은 포함하지 않는다.
실제 Naver 결과의 결합·재순위·영구 저장·Elice 전달도 포함하지 않는다. Linked Live는
약관·표시·제3자 전달과 Elice 데이터 정책을 사람이 문서로 승인할 때까지 차단한다.

## 판단 기준과 대안

판단 기준은 사용자 확인권, 결정성, 근거 추적, provider 교체 가능성, 실제 데이터
최소화, 호출·비용 상한, 비밀 격리와 각 테스트가 증명하는 범위의 명확성이다.

- 개별 canary만 유지하면 실제 인증은 확인하지만 application 계약과 fallback을 검증하지
  못하므로 충분하지 않다.
- 실제 Naver→Elice를 즉시 연결하면 가장 실제에 가깝지만 현재 정책 gate를 위반하므로
  선택하지 않는다.
- 핵심 엔진을 처음부터 Job·Worker에 묶으면 DB·queue 복구와 추천 규칙 실패가 결합되므로
  먼저 동기 use case와 순수 규칙을 검증한다.
- 전체 Mock 연결과 Split Live를 함께 두면 경로가 늘어나지만 전자는 제품 논리를, 후자는
  실제 provider의 제품형 schema 호환성을 안전하게 검증할 수 있다.

PP-039 당시 선택은
`Mock linked workflow + Split Live provider probe + policy-blocked Linked Live`였다.
이후 PP-040은 저장소 소유자의 승인 진술 아래 로컬 일회성 Linked 검증만 별도 ADR로
허용한다. 배포에서는 원본 provider key를 외부 Gateway만 소유한다는 기존 신뢰 경계를
유지한다.

## 문제 해결 기록

1. Naver 최종 SHA `128692bdcaa8ef4e5e00a06362c02f25da223a4b`와 Elice 최종 SHA
   `e6190662c2382304f21c39bdb29375d1b1324733`의 개별 성공 증거를 확인했다.
2. 조건 Work Record의 `location`·`preferredKeywords`·1~50 계약이 정본의
   `locationQuery`·`preferences`·1~100과 충돌하는 것을 확인하고 정본으로 통일했다.
3. 구조화된 가격 근거가 없는 상태에서 예산 점수를 추론하거나 총점을 100으로 늘리는
   대신 현재 가능한 최고 80점과 명시적 warning을 선택했다.
4. UUID v4는 결정적 tie-break가 될 수 없으므로 identity의 SHA-256 `CandidateKey`를
   내부 정렬에 사용하고 Top 3 선정 뒤에만 UUID를 발급하도록 결정했다.
5. 추천 이유의 자유 `reason`·`shareText` 출력을 폐기하고 evidence ID가 연결된 문장만
   LLM이 생성하며 주의점과 공유 문구는 서버가 조합하도록 계약을 좁혔다.
6. PP-039의 실제 provider 검증은 Naver→Elice 데이터 연결 없이 정확히 네 단계의
   제품형 schema를 확인하는 Split Live로 제한하고, 전체 연결은 Mock fixture에서 자동
   검증하기로 했다. 로컬 실제 연결은 후속 PP-040·ADR-0013에서 별도 승인·명령·증거로
   분리했다.

## 구현 결과와 검증 증거

현재 상태는 `in-progress`다. 조건 추출, 후보 정규화·보수적 dedup, 결정론적 점수·완화,
근거 문장 검증·batch fallback과 동기 `RecommendationCoreUseCase`를 구현했다. Mock
정상 경로는 추출 1 + Local 1 + Blog 5 + 이유 1 = 8회, 완화 경로는 Local 1회를 더해
9회임을 통합 테스트로 확인했다. core는 `ConfirmedRecommendationCondition`만 받아
Draft 자동 연결을 구조적으로 차단한다.

### 2026-07-15 PP-039 당시 Mock 정상·완화 연결 재검증

Dev Container의 Java 17에서 다음 명령을 `--rerun-tasks`로 실행해 캐시된 성공 결과를
재사용하지 않았다. 전체 연결 테스트는 in-memory Mock port를 사용하고 단위 테스트도
실제 Provider 요청 없이 network-free로 실행돼 외부 HTTP 호출은 0건이다.

```text
./gradlew :backend:integrationTest --tests com.placepick.recommendation.workflow.application.RecommendationCoreLinkedMockIntegrationTest --rerun-tasks --console=plain
./gradlew :backend:test --tests 'com.placepick.recommendation.*' --rerun-tasks --console=plain
```

| 검증 | 클래스 | 테스트 | 실패 | 오류 | 건너뜀 | JUnit 시간 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Mock 전체 연결 | 1 | 2 | 0 | 0 | 0 | 1.373초 |
| 추천 domain·application 단위 | 12 | 51 | 0 | 0 | 0 | 8.365초 |

이 테스트는 HTTP나 화면을 거치는 브라우저 E2E가 아니라, 사용자의 행동과 시스템
반응을 application 호출로 모사한 user-flow integration이다. 다음 두 시나리오에서
실제 제품의 조건 모델·검색 계획·정규화·점수·근거 검증·결과 조립 코드를 실행하고
Provider 경계만 결정론적 in-memory 구현으로 교체했다.

#### 시나리오 A: 조건을 확인한 사용자가 정상 추천 3개를 받는다

1. 사용자가 `서울 강남구에서 4명이 조용한 주차 카페를 1만원~3만원으로 찾고 흡연
   제외`라고 입력한다.
2. 조건 추출기는 위치 `서울 강남구`, 유형 `CAFE`, 인원 4명, 1인 예산
   10,000~30,000원, 선호 `조용한`·`주차` 각 priority 5, 제외 `흡연`인 Draft를 만든다.
   테스트는 추출 성공과 Draft 타입을 먼저 확인한다.
3. 테스트가 사용자의 검토·확정을 모사해 Draft를 `ConfirmedRecommendationCondition`으로
   명시적으로 변환한다. 이 변환 전에는 추천을 호출하지 않으며, reflection으로 Draft를
   받는 공개 `recommend` overload가 없음을 확인한다.
4. 확정 조건으로 `서울 강남구 카페 조용한 주차`, `display=5` Local 검색을 한 번
   계획한다. Mock은 유효한 HTTPS link와 서울 강남구 주소, `카페>디저트` category를
   가진 `카페 1`~`카페 5`를 반환한다. 짝수 후보 설명은 `조용한 주차`, 홀수 후보
   설명은 `조용한 공간`이다.
5. 제품 normalizer가 위치·CAFE taxonomy·제외어·source link를 검사한다. 다섯 후보는
   모두 통과하고 canonical link가 달라 중복도 없으므로 완화 검색은 실행하지 않는다.
6. 제품 scorer가 Blog 전 예비 점수를 계산해 최대 5개 pool을 정한다. 위치 30점과
   유형 25점은 모두 충족하고, 짝수 후보는 두 선호가 모두 일치해 선호 15점, 홀수
   후보는 `조용한`만 일치해 half-up 8점이다. 가격 근거는 추정하지 않아 예산은 0점이다.
7. 다섯 후보 각각을 `카페 N 서울 강남구`, `display=3`으로 Blog 검색한다. Mock은
   후보 이름과 연결되는 유효한 Blog 근거를 한 건씩 반환하고, 각 후보는 Blog 3점을
   얻는다.
8. 최종 점수는 짝수 후보 73점, 홀수 후보 66점이다. `CandidateKey` tie-break를 적용한
   현재 fixture의 파생 결과는 `카페 4`, `카페 2`, `카페 3` 순서다. Top 3를 고른
   뒤에만 테스트용 UUID v4를 발급한다.
9. Top 3 전체를 한 batch로 이유 생성 port에 전달한다. Mock은 각 후보에 `카페 N 검색
   후보` 문장과 그 후보가 소유한 Local evidence ID를 반환한다. 서버는 place·evidence
   소유권과 금지 주장을 다시 검사하고 이유를 채택한 뒤 가격 근거 부재 caution과
   `추천 후보: 카페 N — 카페 N 검색 후보` 형태의 공유 문구를 조합한다.
   Blog 근거는 이 fixture에서 점수에 사용되지만 Mock 이유 문장은 첫 번째 Local
   evidence만 참조하므로 Blog 문구까지 설명에 활용한 시나리오는 아니다.
10. 현재 fixture와 제품 코드에서 파생한 application 결과는 장소 3개,
    `degraded=false`, `reasonFallback=false`, `relaxed=false`, `LOCAL_AND_BLOG`,
    `BUDGET_EVIDENCE_UNAVAILABLE`이다. 사용자는 정상 추천 3개와 근거 문장·가격 정보
    미확인 주의를 받는 흐름으로 해석할 수 있다. 아직 API와 UI가 없으므로 실제 화면
    표시까지 검증했다는 뜻은 아니다.

이 시나리오가 직접 assertion한 호출 과정은 조건 추출 1회, Local 1회, Blog 5회,
이유 batch 1회로 총 8회다. 장소 3개와 비 degraded·no fallback도 직접 확인한다.
73/66점, 구체적인 후보 순서, warning·caution·공유 문구는 현재 fixture와 제품 코드에서
파생한 관찰값이며 전체 결과 snapshot으로 직접 고정한 값은 아니다.

#### 시나리오 B: 최초 후보가 부족해 선호 하나만 완화한다

1. 사용자 입력·조건 추출·명시적 확인 과정은 시나리오 A와 같다.
2. 최초 `서울 강남구 카페 조용한 주차` Local 검색에서 Mock이 `카페 1`, `카페 2`
   두 개만 반환한다. 유효 후보가 최소 3개에 미달해 core가 완화 여부를 판단한다.
3. 위치 `서울 강남구`와 유형 `CAFE`는 필수 조건으로 유지한다. priority가 같은 선호
   `조용한`, `주차` 중 원래 배열의 마지막인 `주차` 하나만 제거한다.
4. `서울 강남구 카페 조용한`으로 Local을 정확히 한 번 더 검색하고 `카페 3`~`카페 5`를
   받는다. 최초 결과와 합쳐 다섯 후보가 된 후 Blog·점수·Top 3·이유 생성은 시나리오 A와
   같은 제품 코드를 통과한다.
5. 결과는 `relaxed=true`, Local 2회, Blog 5회, 이유 1회이며 조건 추출을 포함해 총
   9회다. 현재 fixture에서는 `주차`가 제거됐지만 결과 계약이 노출하는 값은
   `relaxed=true`뿐이다. 제거한 선호를 API·UI가 정확히 안내하려면 별도 결과 필드가
   필요하며 현재 테스트는 실제 안내 화면을 검증하지 않는다.

#### 보강한 전체 실패·저하 사용자 흐름

PP-040 구현에서 기존 계층별 검증 세 건을 같은
`RecommendationCoreLinkedMockIntegrationTest`와 실제 `RecommendationCoreUseCase` 경계로
올렸다. 따라서 Mock core matrix는 정상·완화와 다음 세 흐름을 합쳐 다섯 시나리오다.

- 한 번 완화한 뒤에도 후보가 3개 미만이면 `INSUFFICIENT_CANDIDATES`로 종료하고 Local은
  2회, Blog·이유 생성은 0회임을 core 결과와 호출 기록으로 확인한다.
- 두 번째 Blog 호출이 Provider 오류면 이후 호출을 중단하고 이미 받은 Blog 근거도
  폐기한다. Top 3 모두 `LOCAL_ONLY`, Blog 점수 0, `degraded=true`,
  `BLOG_EVIDENCE_UNAVAILABLE`이고 이유 fallback은 사용하지 않음을 확인한다.
- 이유 Provider가 실패하면 성공한 같은 fixture와 후보 순서·점수를 대조해 불변임을
  확인한다. Top 3 전체가 Local evidence 기반 서버 template으로 교체되고
  `reasonFallback=true`, `LLM_REASON_FALLBACK`임을 확인한다.

다섯 시나리오는 HTTP·화면 E2E가 아니라 합성 port를 사용한 core user-flow
integration이다. 실제 Provider·DB·Worker·SSE·UI 증거와 구분한다.

PP-040 보강 뒤 같은 core 통합 클래스의 최신 결과는 `5 tests / 0 failures / 0 errors /
0 skipped`다. 위 표의 2개는 PP-039 당시 정상·완화 경로의 역사적 실행값이며 현재 전체
matrix 수가 아니다. 최신 전체 저장소 검증은 WI-0042에 연결한다.

이 증거가 의미하는 범위를 과장하지 않는다. 다섯 전체 연결 테스트는 확정 조건 경계,
Top 3, 호출 상한과 대표 정상·완화·실패·저하 결과를 고정한다. 정확한 검색어, 후보 이름·
순서·점수 breakdown, UUID와 모든 warning·caution·share 문구를 하나의 snapshot으로
고정한 것은 아니며 계층별 단위 테스트가 세부 규칙을 보완한다. 실제 Naver payload를
core에서 처리해 실제 Elice에 전달하는 Linked Live, DB·Worker·SSE, HTTP API와 UI도 이
Mock 결과로 검증됐다고 해석하지 않는다.

2026-07-15 Java 17에서 단위 86건, 추천 통합 21건, Eval 7건이 모두 실패 0건으로
통과했다. Edge는 TypeScript typecheck와 전체 11개 파일 97건이 통과했다. Loopback
Gateway는 고정 fixture hash와 네 호출 budget, route·method·query·body·token 거부,
Naver/Elice 자격의 양방향 교차 전달 0건, 비표준 Naver Content-Type의 안전한 schema
검증과 `linked=false` summary를 자동 검증한다. launcher guard는 CI·dirty tree·SHA
불일치와 Java 프로세스의 원본 자격 전달을 거부한다.

2026-07-15 관련 코드가 병합된 `main` SHA
`dc6e1e2aacee47f2ac87bb425ff73299ba09854a`에서
`make workflow-live-probe APPROVED_SHA=<sha>`를 정확히 한 번 실행했다. 결과는
`Workflow split probe returned a safe failure status.`로 종료했으며 단계별 2xx·schema,
`mode=split`, `linked=false`, `callCount=4` 성공 summary를 얻지 못했다. 자동 재호출하지
않았고 10개 report 안전 scan은 통과해 비밀·Provider 원문 유출은 관찰되지 않았다.
다만 실패 stage와 정규화 오류 code가 출력되지 않아 원인을 분류할 수 없었고 Provider
dashboard의 wire 호출 수도 독립 대조하지 않았다. 따라서 WI-0041은 `in-progress`,
RUN-0003은 `draft`, Split Live 계약은 `specified`를 유지한다. 개별 Naver·Elice Local
Live 성공을 PP-039 완료로 재사용하지 않는다.

## AI 사용과 사람의 검증

AI에는 계약 충돌 탐색, domain·port와 순수 규칙 초안, 경계·공격 fixture, Loopback
Gateway 음성 테스트와 문서 정합성 검토를 위임할 수 있다. 전체 prompt나 내부 추론은
기록하지 않고 채택한 계약·근거·검증만 남긴다.

사람은 Naver 약관·표시 의무, Elice 데이터 처리 정책, 점수의 제품 의미, 실행 SHA와
전체 diff, 실제 호출 승인·사용량과 비밀 비노출을 직접 확인한다. AI나 자동 테스트가
정책 승인을 대신하지 않으며, Split Live 결과를 Linked Live 성공으로 해석하지 않는다.

## 남은 위험과 학습

Naver category·주소·link 품질과 Blog 근거는 실제 분포에서 달라질 수 있고 정적 0~80
점수는 사용자 만족의 실측 최적값이 아니다. 정책 승인이 나더라도 전체 Linked Live는
호출 비용, 데이터 수명, 표시 방식과 품질 Eval을 별도 검토해야 한다.

조건·점수·이유 core가 완료돼도 비동기 Job·재시도·중복 delivery·복구는 PP-011~PP-019의
책임이다. 실제 데이터 처리 허용 범위가 달라지거나 Elice가 strict schema를 바꾸면
ADR-0012와 provider 선택을 재검토한다.
