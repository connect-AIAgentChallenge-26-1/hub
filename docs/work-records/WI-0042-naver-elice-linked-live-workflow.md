---
id: WI-0042
title: PP-040 Naver·Elice 실제 Linked Live 워크플로 검증
type: work-record
status: done
date: 2026-07-15
owners:
  - placepick-team
related:
  - ../roadmap.md
  - ../contracts.md
  - ../adr/ADR-0013-naver-elice-linked-live-boundary.md
  - ../runbooks/RUN-0004-recommendation-workflow-linked-live.md
  - ../troubleshooting/TS-0013-gradle-test-output-cache-bind-mount-mode.md
  - ../troubleshooting/TS-0014-cross-runtime-canonical-url-evidence-id.md
  - ../troubleshooting/TS-0015-cross-runtime-naver-html-plain-text.md
  - ../troubleshooting/TS-0016-linked-live-provider-error-flattening.md
  - ../troubleshooting/TS-0017-workerd-linked-live-outbound-transport.md
  - ../troubleshooting/TS-0018-elice-structured-output-unsupported-array-keyword.md
  - ../experiments/EXP-0001-linked-live-representative-scenario-repeatability.md
  - ../case-studies/CASE-0002-naver-elice-linked-live-user-flow.md
  - WI-0041-recommendation-core-split-live-workflow.md
  - https://github.com/gdh0730/hub/issues/50
paths:
  - build.gradle
  - package-lock.json
  - backend/src/integrationTest/java/com/placepick/recommendation/**
  - backend/src/integrationTest/java/com/placepick/infrastructure/external/llm/**
  - backend/src/workflowLiveLinkedTest/**
  - backend/build.gradle
  - backend/gradle.lockfile
  - backend/src/main/java/com/placepick/recommendation/application/candidate/**
  - backend/src/main/java/com/placepick/shared/text/**
  - backend/src/main/java/com/placepick/infrastructure/external/naver/NaverTextSanitizer.java
  - backend/src/main/java/com/placepick/infrastructure/external/llm/**
  - backend/src/main/java/com/placepick/recommendation/reason/**
  - backend/src/test/java/com/placepick/recommendation/application/candidate/**
  - backend/src/test/java/com/placepick/infrastructure/external/naver/NaverTextSanitizerTest.java
  - backend/src/test/java/com/placepick/recommendation/reason/**
  - backend/src/evalTest/**/recommendation/reason/**
  - edge/**
  - edge/src/shared/naver-html-text.ts
  - edge/tests/naver-html-text.test.ts
  - scripts/workflow-live-linked*.sh
  - scripts/run-local-linked-workflow-gateway.mjs
  - scripts/run-local-linked-workflow-gateway-test.sh
  - scripts/check.sh
  - Makefile
  - AGENTS.md
  - README.md
  - docs/**
---

# WI-0042 PP-040 Naver·Elice 실제 Linked Live 워크플로 검증

PP-040은 fork 저장소의 [Issue #50](https://github.com/gdh0730/hub/issues/50)으로
추적한다. 이 Work Record는 자동 harness 구현과 실제 Provider 실행 증거를 분리한다.
코드 자동 검증과 실제 Provider 실행 증거를 같은 완료로 취급하지 않는다. 최종 검증
SHA `e789af65e94441aa38a018a2931c3705f7125112`에서 허용된 세 사용자 시나리오가 모두
strict Linked 성공 조건을 충족했으므로 PP-040의 동기 Linked core 범위는 완료했다.

## 문제와 근거

Mock 정상·선호 완화 경로는 실제 `RecommendationCoreUseCase`를 통과했지만 Provider
경계만 in-memory fixture였다. 반대로 Naver·Elice 개별 Local Live는 인증과 schema를
확인했을 뿐 실제 Naver 응답을 추천 core가 정규화·점수화한 뒤 Elice 이유 생성으로
연결하지 않았다. Split Live도 의도적으로 Naver 응답과 Elice 이유 입력을 분리한다.

2026-07-15 `main` SHA `dc6e1e2aacee47f2ac87bb425ff73299ba09854a`에서 Split
Live를 정확히 한 번 실행했으나 안전한 실패 상태로 종료했다. 비밀이나 Provider
원문이 출력·Git diff에 남지 않은 것은 확인했지만 네 단계 성공 summary를 얻지 못했다.
따라서 WI-0041은 `in-progress`, RUN-0003은 `draft`, Split Live 계약은 `specified`로
유지한다. 이 실패를 Linked Live 성공 근거나 Provider 전체 호환성 증거로 재사용하지
않는다.

## 목적과 성공 기준

목적은 고정 합성 사용자 입력에서 시작해 실제 Elice 조건 추출, 실제 Naver Local·Blog,
제품 추천 core와 실제 Elice 근거 이유 생성을 하나의 로컬 실행으로 연결하는 것이다.

- 사용자 확인을 모사한 versioned 확정 조건 뒤에만 추천 core를 호출한다.
- 실제 Naver Local 응답은 제품 normalizer·filter·dedup을 거쳐 최대 5개 예비 pool을
  만들고, 후보별 Blog 근거 수집 뒤 최종 0~80 점수와 Top 3를 만든다.
- Top 3의 검증된 전체 제품 문맥만 실제 Elice 이유 생성에 전달한다.
- Elice 출력의 place ID와 evidence ID가 입력과 정확히 연결되고, 문장마다 단일 evidence를
  인용하며 `LOCAL`·`BLOG` 유형별 고정 문장 외 자유 속성이 없어야 한다.
- 결과는 정확히 세 후보, `linked=true`, `degraded=false`, `reasonFallback=false`여야 한다.
- 정상 논리 호출 수는 추출 1 + Local 1~2 + Blog 3~5 + 이유 1인 6~9회다.
- Embedding 호출은 0회이며 추천·정렬·중복 제거에 사용하지 않는다.
- retry·redirect는 0회이고 비밀, 검색 결과, prompt·completion과 전체 응답은 저장하지
  않는다.
- 실제 성공은 병합 `main` 또는 저장소 소유자가 명시적으로 승인하고 원격에 push한 전용
  검증 브랜치의 깨끗한 정확한 SHA에서 기록한다. 같은 SHA의 수동 재실행은 허용하되 각
  invocation은 새 Gateway·일회성 자격·6~9회 예산을 사용하고 HTTP retry는 0회다.

## 범위, 비범위와 제약

범위는 누락된 세 Mock core 실패 흐름, Linked Live 전용 Gradle source set, 제품 adapter
factory, stateful Loopback Gateway, 안전 launcher·guard, 계약·문서 자동 검증이다.
실제 Provider 자격은 Git에서 제외된 기존 `.env.live.local`에만 있고 Gateway 프로세스만
받는다.

공개 Controller, 익명 session, Draft DB, Job, Outbox, Redis Worker, SSE, frontend,
투표방, 제품 runtime bean, Cloudflare·Vercel·Render 배포는 포함하지 않는다. Local
Linked Live 성공도 이 비범위가 구현되거나 운영 약관 준수와 가용성이 보증됐다는 뜻이
아니다.

저장소 소유자는 Naver와 Elice 양쪽의 실행 승인이 있고 주소·도로명 주소를 포함한 현재
전체 제품 문맥 전달을 승인했다고 진술했다. 승인 원문은 저장소와 이 작업에서 독립적으로
검토하지 않았다. 따라서 이 기록은 법률·약관 적합성 판단이나 제3자 보관·학습 부재의
증거가 아니며, 고정 합성 입력을 사용하는 invocation-bound 로컬 반복 검증에만 적용한다.
각 invocation은 새 Gateway·일회성 로컬 자격·독립 호출 예산을 가지며 HTTP 재시도와는
구분한다.

## 판단 기준과 대안

판단 기준은 실제 데이터 연결, 사용자 확인권, 근거 provenance, 비밀 격리, 재시도 없는
호출 상한, 원문 비저장, Mock 회귀와 실제 증거의 분리다.

- Split Live만 유지하면 Provider별 제품형 schema는 볼 수 있지만 Naver→core→Elice
  연결을 증명하지 못한다.
- Java에 원본 자격을 직접 주입하면 구현은 단순하지만 테스트 report·환경 상속과
  예외에서 자격이 퍼질 위험이 커 제외한다.
- 실제 응답을 파일 fixture로 저장하면 재현성은 높지만 Naver 원문과 장소 정보를
  영구 보존하므로 제외한다.
- stateful Loopback Gateway는 구현 부담이 있지만 원본 자격을 격리하고 실제 Naver에서
  유래하지 않은 place·evidence를 Elice 전송 전에 막을 수 있어 선택한다.

## 문제 해결 기록

1. Mock 정상·선호 완화는 core 전체를 통과했으나 후보 부족·Blog degraded·LLM
   fallback은 계층별 테스트였음을 확인했다. 세 경로를 같은 core 통합 matrix에 추가해
   전체 다섯 사용자 흐름으로 맞추기로 했다.
2. Linked Live는 기존 Split source set을 재사용하지 않고 별도 task로 분리해 한 명령의
   성공 의미가 섞이지 않게 했다.
3. 기존 제품 adapter의 package-private test factory를 같은 package의 Linked 전용
   factory에서 사용해 production 공개 API와 Spring runtime 구성을 넓히지 않기로 했다.
4. Gateway가 조건 추출 → Local → 선택적 완화 → Blog → 이유 생성 순서와 9회 상한을
   보유하고, 실제 Naver 응답에서 파생되지 않은 이유 입력을 upstream 전에 거부하도록
   결정했다.
5. 2026-07-15 baseline `make check`는 Windows bind mount의 로컬 Gradle cache entry를
   복원하며 `/workspace/backend/build/test-results/integrationTest/binary`에 mode 755를
   설정하지 못해 실패했다. `./gradlew --no-daemon clean` 뒤 Dev Container에서
   `GRADLE_OPTS='-Dorg.gradle.caching=false' make check`를 실행했을 때만 전체 통과했다.
   이 관찰은 제품 코드 성공과 분리하며 cache·bind mount의 영구 해결로 주장하지 않는다.
6. 같은 날 Split Live는 위 `main` SHA에서 한 번 실패했다. 공개된 진단은
   `Workflow split probe returned a safe failure status.`뿐이어서 실패 stage·정규화 오류를
   구분할 수 없었다. 자동 재호출하지 않았고 10개 report의 안전 scan과 비밀·Provider
   원문 비노출을 확인한 뒤 상태를 완료로 올리지 않았다. 후속 launcher는 원문 없이도
   stage와 정규화 오류를 구분하는 진단 계약을 보강해야 한다.
7. Linked provenance 검토에서 Java와 TypeScript의 Blog evidence ID 공식은 같지만
   percent-encoded 경로의 canonical byte 문자열이 다름을 합성 벡터로 발견했다. Java의
   raw path·query 이중 인코딩을 제거하고 양쪽에 같은 expected hash를 고정했다. 자세한
   원인과 재발 방지는 TS-0014에 분리했다.
8. 새 Split·Linked source set도 dependency locking 적용 범위에 포함되도록 Gradle lock
   state를 재생성했다. 새 외부 dependency나 동적 version은 추가하지 않았다.
9. Test output만 cache에서 제외한 첫 영구안 뒤 Java compile output을 cache에 저장하는
   과정에서도 같은 file mode 오류가 재현됐다. 원인을 모든 Gradle task output build
   cache와 bind mount의 조합으로 넓히고, task output cache만 전체 차단했다. compile
   up-to-date와 dependency·configuration cache는 유지한다.
10. Linked Gateway의 제한된 대소문자 무시 entity 치환은 Java `HtmlUtils`의 HTML 4
    case-sensitive·numeric decode와 달랐다. 실제 Naver title·description이 decimal 또는
    hex entity를 포함하면 정상 근거를 변조로 오인할 수 있어, 양쪽을 bounded entity별
    decode와 Unicode whitespace 축약으로 통일했다. 음수·범위 초과·unknown·malformed
    참조는 해당 참조만 보존하고 나머지 문자열 처리는 계속한다. 같은 ID의 6개 교차
    런타임 벡터를 Java와 Edge에 고정했으며 자세한 내용은 TS-0015에 기록했다.
11. 최종 보안 검토에서 느슨한 JSON Schema 검사, encoded-dot URL 정규화 차이, 누락된
    Provider 오류·timeout 인수 경로를 발견했다. Java 제품 schema와 exact 비교하고 raw
    encoded-dot segment를 양쪽에서 거부했으며, 400·401·403·429·5xx와 Naver 5초·Elice
    30초 timeout을 stateful Gateway 자체 테스트에 추가했다.
12. 첫 최종 `make check`는 고정 actionlint image의 버전 출력이 일시적으로 비어 중단됐다.
    같은 digest를 독립 실행해 1.7.12와 workflow 검증 성공을 확인했고, source나 image
    pin을 바꾸지 않은 두 번째 표준 실행이 전체 통과했다. 이 첫 중단 시점에는 Live task가
    시작되지 않았고 Provider 호출도 없었다.
13. 기존 자유 문장 정책은 장소명 같은 token만 공유해도 `장소명에는 루프탑이 있습니다`와
    같은 근거 없는 속성을 통과시킬 수 있었다. LLM을 사실·점수 생성 주체로 사용하지
    않는다는 목적에 맞춰 문장을 `LOCAL`·`BLOG` 유형별 두 exact 상수로 제한하고, 문장당
    evidence ID도 정확히 하나로 축소했다. Java strict schema·post-validation과 Linked
    Gateway가 같은 text↔evidence type 관계를 각각 검사하며 한 문장이라도 어긋나면 batch
    전체 fallback 또는 Linked 실패로 처리한다.
14. reason schema·prompt와 허용 출력 의미가 달라졌으므로 기존 승인 hash를 재사용하지
    않았다. Split reason fixture hash와 Linked scope hash를 새 계약 값으로 회전하고 각
    Java Live harness와 Gateway의 상수를 함께 고정했다. 실제 Live 실행은 하지 않았다.
15. Live launcher가 tracked·staged diff만 거부하면 untracked Java가 전용 source set에
    주입될 수 있고, 여러 evidence 파일을 한 번에 검색하며 scanner 오류를 미검출로 볼 수
    있음을 최종 검토에서 발견했다. 직접 하위 `plans/*.md` 외 untracked 파일과 executable
    경로의 ignored 파일을 거부하고, 각 evidence 파일의 검색 종료 코드 0·1·기타를
    leak·미검출·scan 실패로 구분했다. 합성 성공 marker는 guard 내부에서만 캡처해 실제
    Live 성공처럼 표준 check 로그에 남지 않게 했다.
16. 저장소 소유자는 Provider 호출 여유가 있으므로 merge-per-attempt 제한을 제거하고
    실제 연결을 충분히 반복 검증하도록 승인했다. 기본 `main` 경계는 유지하면서
    `feat/workflow-linked-live-validation`의 정확한 pushed SHA만 허용하는 development
    명령을 추가했다. clean tree, `origin/main` ancestry, 원격 SHA 일치, Java 17·Node 24,
    실행 source 주입 차단과 process lock은 그대로 적용한다. 같은 SHA 반복은 자동 HTTP
    retry가 아니라 사용자가 시작한 서로 독립적인 invocation이다.
17. 병합 SHA `69e95c62e72917804868bdb883fcb26f80c9e4cf`에서 두 번째 Linked 실행도
    `conditionExtraction / PROVIDER_UNAVAILABLE`로 재현됐지만, 곧이어 Elice Chat·Embedding
    개별 실제 계약은 성공했다. 이에 인증·routing 전체 장애와 제품형 조건 추출 문제를
    분리했다. Gateway가 strict JSON 구조뿐 아니라 `서울`·`조용한`·`흡연`의 한 표현까지
    강제해 동치 표현을 502로 바꾸고, Java가 그 safe code를 가용성 오류로 평탄화하는
    결함을 확인했다. Gateway는 JSON Schema 인스턴스 구조만 검사하고 fixture 의미는
    Java가 NFKC+유한 allowlist로 검사하도록 책임을 분리했다. loopback 전용 safe header의
    고정 오류 code만 Java가 신뢰하며 원문 body는 읽거나 보존하지 않는다.
18. 세부 code 보강 뒤 실제 실행은 `LINKED_PROVIDER_UNAVAILABLE`로 분류됐다. 이는 Elice
    upstream 5xx가 아니라 로컬 workerd의 fetch·timeout·redirect 전송 경로가 응답을 얻지
    못했다는 뜻이다. 같은 endpoint의 Java 17 개별 Chat 계약은 직전에 실제 성공했으므로
    API 자격과 workerd 전송을 분리했다. Gateway의 검증 코드는 유지하면서 실행 adapter만
    Node 24 loopback HTTP server로 교체했다. Node runner는 고정 env-file allowlist를 직접
    파싱하고 esbuild 0.28.1로 같은 Worker 코드를 임시 bundle하며, raw 자격은 여전히
    Gateway process에만 존재한다. 자세한 진단과 rollback은 TS-0017에 기록한다.
19. Node 전송 경로를 복구한 뒤 이유 생성 단계가 Elice 400으로 실패했다. 조건 추출
    schema에는 없고 이유 schema에만 있던 `uniqueItems`가 Provider의 strict Structured
    Outputs 지원 부분집합과 맞지 않는 차이였다. 문장당 evidence ID 정확히 하나라는 계약은
    `minItems=1`과 `maxItems=1`만으로 충분하므로 `uniqueItems`를 제거했다. Java의 후검증과
    Gateway provenance 검증은 배열 크기와 단일 evidence 소유 관계를 계속 강제한다.
20. nullable 대표 시나리오에서 Elice가 지역을 정본 `서울`과 의미가 같은 exact `Seoul`로
    반환할 수 있음을 관찰했다. 사용자 확인 전 Draft의 동치 표현만 닫힌 finite alias로
    수용하고, 확정 fixture에서는 정본 `서울`로 정규화했다. 부분 문자열·광범위 번역·fuzzy
    비교는 도입하지 않았다. 위치·유형·인원·예산·선호·제외의 cross-field 불일치는 원문을
    노출하지 않는 field별 safe code로 구분해 확인 경계에서 fail-closed한다.
21. 최종 push SHA `e789af65e94441aa38a018a2931c3705f7125112`에서 allowlist된 세
    시나리오를 각각 독립 invocation으로 실행했다. 세 실행 모두 실제 Elice 조건 추출,
    versioned 사용자 확인, 실제 Naver Local·Blog, 제품 core 점수·Top 3, 실제 Elice 이유,
    서버 place/evidence 검증을 끝까지 통과했다. safe summary의 논리 호출 수는 각각
    `7/6/6`이고 모두 `linked=true`, `degraded=false`, `reasonFallback=false`,
    `cleanup=true`, HTTP retry 0회였다.

## 구현 결과와 검증 증거

현재 상태는 `done`이다. 다음 자동 검증 기반과 실제 Provider 캠페인을 모두 완료했다.

- `RecommendationCoreUseCase`의 정상, 한 번의 완화, 후보 부족, Blog degraded, LLM
  전체 fallback 다섯 흐름
- Linked route·method·query·header allowlist와 호출 순서·상한
- Naver 자격의 Elice 전달과 Elice bearer의 Naver 전달 0건
- Elice Embedding 호출 0건
- 실제 Naver 응답에 없는 장소·주소·근거와 후보 간 evidence 교차 거부
- 자유 문장·장소명만 겹치는 속성 주장·evidence 유형과 고정 문장 불일치·한 문장의 다중
  evidence 인용 거부
- timeout·redirect·oversized·malformed·401·403·429·5xx의 fail-closed 처리
- 일반 `make check`와 CI에서 `.env.live.local` 미사용 및 실제 외부 호출 0회
- 종료 시 Gateway·일회성 자격·임시 파일 정리와 report secret scan

2026-07-15 Java 17 Dev Container에서 별도 cache 우회 옵션 없는 표준 `make check`가
최종 코드와 증거 문서에 대해 통과했다. Linked Gateway는 `58/58`, Edge 전체는
`13 files / 161 tests`, 문서 99개와 음성 검증 `8/8`이었고 생성 report 127개 안전 scan도
통과했다. Gradle `check`의 17개 task는 단위·통합·Eval과 Linked offline 계약을 통과했지만
Live task를 실행하지 않았으며 일반 검증은 Mock 경로만 수행했다. guard 내부의 합성
fixture가 만든
`linked=true` marker는 캡처해 검증하되 표준 check 로그에는 출력하지 않는다. 이는 실제
Provider 성공 증거가 아니다.

Split Live의 2026-07-15 실행은 `status=passed`, `callCount=4`를 얻지 못했으므로 실패
증거다. 공개 가능한 결과는 `Workflow split probe returned a safe failure status.`이며
실행 SHA, 재시도하지 않았다는 사실과 10개 report 안전 scan·비밀·원문 비노출만 함께
확인했다. 실패 stage와 Provider dashboard의 wire 호출 수는 독립 대조하지 못했다.

2026-07-15 21:10 KST, 병합 `main` SHA
`541a98b3b73bfdaa3a1c7396aaea32ce410a7237`에서 다음 명령을 정확히 한 번 실행했다.

```text
make workflow-live-linked APPROVED_SHA=541a98b3b73bfdaa3a1c7396aaea32ce410a7237
```

실행 결과는 `conditionExtraction / PROVIDER_UNAVAILABLE`이며 JUnit은
`1 test / 1 failure`였다. 이 수치는 Provider wire 호출 수가 아니다. Gateway를 통한 Elice
조건 추출 논리 단계에 진입했지만 schema·의미 검증을 완료하지 못해 `linked=true`, 후보
3개, Blog 근거, Top 3와 이유 생성 증거는 확보되지 않았다. 같은 SHA에서는 재실행하지
않았다.

### 2026-07-15 Linked Live 1차 실행의 사용자 흐름

1. 합성 사용자는 서울의 카페, 2명, 1인당 2만원 이하, 조용함 선호와 흡연 제외 조건을
   입력하는 fixture로 시작했다. 원문 prompt나 생성 검색어는 증거에 남기지 않았다.
2. Gateway를 통한 Elice 조건 추출 논리 요청에는 진입했으나 `PROVIDER_UNAVAILABLE`로
   실패했다. application 논리 요청은 한 번이고 코드상 automatic retry는 0회지만
   upstream wire 요청 수는 dashboard·network telemetry 없이 확정하지 않았다.
   따라서 조건 schema와 합성 입력 의미 검증은 완료되지 않았다.
3. 추출 Draft 뒤의 명시적 사용자 확인 fixture는 적용하지 않았다.
4. Naver Local 검색과 장소 정규화·필터·중복 제거에는 도달하지 않았다.
5. 후보 수에 따른 선호 한 번 완화 여부도 판단하지 않았다.
6. Naver Blog 검색과 후보별 근거 연결에는 도달하지 않았다.
7. 서버의 결정론적 점수와 Top 3는 생성하지 않았다.
8. 실제 Naver 근거를 사용한 Elice 이유 생성은 호출 단계에 도달하지 않았다.
9. place·evidence 관계와 금지 속성의 최종 검증도 수행하지 않았다.
10. 최종 판정은 실패다. `linked=true`, `degraded=false`, `reasonFallback=false` 성공
    summary와 6~9회 전체 흐름 증거가 없다.

실행 전 같은 SHA의 표준 `make check`가 다시 통과했고 Live task 실행 0회와 Mock-only
경로를 확인했다. 실행 뒤 생성 report 10개 안전 scan이 통과했으며 Gateway process·port·
임시 디렉터리 guard도 중단되지 않았다. 사후 Linked Gateway process count는 0이었다. 성공 전용
`cleanup=true` summary는 출력되지 않았으므로 정상 완료로 해석하지 않는다. report scan은
알려진 자격·routing·고정 marker 미검출 증거이며 모든 미지의 Provider 데이터를 원문
대조해 비노출을 독립 증명하지 않는다.

현재 `PROVIDER_UNAVAILABLE`은 Java client가 loopback HTTP 5xx와 전송 예외를 같은 제품
오류로 정규화한 결과다. Gateway도 upstream 5xx, 응답 검증 오류와 workerd 전송·timeout을
여러 5xx code로 반환하지만 Java가 안전한 problem code를 보존하지 않는다. 따라서 인증
오류나 일시 장애라고 임의로 단정하지 않으며 Provider dashboard 미대조로 실제 wire 호출
수도 확정하지 않았다. 다음 결정은 원본 자격 없이 실패 범주를 Mock으로 재현하고 body를
노출하지 않는 안전한 세부 code를 보존한 뒤, 수정 PR이 병합된 새로운 `main` SHA에서만
한 번 재검증하는 것이다. 이 진단은 이후 문제 해결 이력이며 최종 상태 설명은 아래 반복
캠페인 증거를 따른다.

### 2026-07-15 최종 Linked Live 반복 캠페인의 사용자 흐름

최종 실행 기준은 push된 SHA `e789af65e94441aa38a018a2931c3705f7125112`다. 아래 세
시나리오는 같은 호출의 재시도가 아니라 새 Gateway·새 일회성 로컬 자격을 사용하는 독립
invocation이며, 응답 원문·장소명·주소·검색어·prompt·completion은 기록하지 않았다.

1. `seoul-cafe-complete-v1`은 서울 카페, 2명, 1인당 최대 2만원, 조용함 선호와 흡연 제외를
   가진 완전 입력 흐름이다. Elice Draft의 모든 범주를 확인한 뒤 versioned 사용자 확인
   fixture로 확정했고, Naver 장소·Blog 근거를 제품 core가 정규화·필터·중복 제거·점수화해
   Top 3를 만들었다. Elice 이유의 place/evidence 집합과 금지 속성을 서버가 다시 검증했다.
   결과는 strict success, 논리 호출 7회였다.
2. `seoul-restaurant-nullable-v1`은 서울 음식점이 필요하지만 인원과 예산을 명시하지 않은
   흐름이다. Draft가 누락값을 추정하지 않는지, exact `Seoul` 표현은 닫힌 alias로만
   해석한 뒤 사용자 확인 fixture가 `서울` 정본을 적용하는지 검증했다. 이후 같은 실제
   Local→Blog→점수·Top 3→근거 이유 경로를 통과했으며 결과는 strict success, 논리 호출
   6회였다.
3. `seoul-cafe-dessert-v1`은 서울의 디저트 카페 선호와 흡연 제외를 포함하되 인원과 예산은
   명시하지 않은 흐름이다. 선호·제외와 nullable field의 cross-field 의미를 확인한 뒤 실제
   검색 근거만으로 Top 3와 이유를 만들고 provenance를 검증했다. 결과는 strict success,
   논리 호출 6회였다.

세 실행 모두 후보 3개, 실제 Blog evidence, place ID 집합 일치와 같은 후보의 evidence만
인용하는 계약을 통과했고 `linked=true`, `degraded=false`, `reasonFallback=false`,
`cleanup=true`였다. adapter 자동 retry와 redirect는 0회였고 Embedding은 호출하지 않았다.
`7/6/6`은 이 캠페인의 안전 요약이지 가용성·성능 SLA나 Provider 성공률 표본은 아니다.
과거 조건 추출 실패와 이유 schema 400은 삭제하지 않고 위 문제 해결 기록에 원인·수정·
재검증 순서로 보존한다.

세 실행의 공통 12단계 흐름, 시나리오별 사용자 의도·기대·관찰·판정과 이 결과가
입증하거나 입증하지 않는 범위는
[CASE-0002](../case-studies/CASE-0002-naver-elice-linked-live-user-flow.md)에 포트폴리오
관점으로 정리했다. Case Study는 이 Work Record와 safe report에 없는 수치를 추정하지
않으며 문서화 과정에서 Provider를 다시 호출하지 않았다.

## AI 사용과 사람의 검증

AI에는 기존 경계 조사, Mock 실패 경로와 Gateway 공격 fixture 초안, launcher guard와
문서 정합성 검토를 위임할 수 있다. 실제 자격을 읽거나 출력하고, 실패한 Live를 임의로
재호출하거나 승인 범위를 법적으로 해석하도록 위임하지 않는다.

사람은 전달 field, 실행 SHA와 전체 diff, Provider 승인·비용·표시 의무, Live 실행과
safe summary를 직접 확인한다. 이번 작업에서 확인한 사람의 입력은 양쪽 승인과 현재 전체
문맥 전송 승인에 관한 저장소 소유자의 진술이며 승인 원문 자체는 검토하지 않았다.

## 남은 위험과 학습

실제 검색 분포에 따라 세 후보가 나오지 않거나 Blog·Elice가 실패할 수 있다. 이런 안전한
종료는 제품 fallback 동작의 증거가 될 수 있지만 Linked Live 성공은 아니다. 같은 run의
HTTP 자동 재시도는 금지한다. 원인을 Mock에서 재현해 새 clean commit으로 만든 뒤에는
승인된 전용 검증 브랜치에서 새 invocation으로 다시 실행할 수 있다.

초기 실행은 검색 분포에 도달하기 전에 조건 추출 `PROVIDER_UNAVAILABLE`로 중단됐고,
후속 실행은 이유 schema의 지원되지 않는 `uniqueItems` 때문에 400으로 실패했다. 전자는
cross-field safe diagnostics와 Node 24 전송 adapter로 분리했고 후자는 정확히 한 evidence
계약을 유지하면서 해당 keyword만 제거해 최종 세 시나리오로 재검증했다. finite alias는
관찰된 exact 동치만 허용하며 새로운 언어·표기 변형을 자동 확장하지 않는다.

Windows bind mount의 Gradle task output cache mode 문제는 TS-0013 정책을 적용한 뒤
별도 우회 없는 표준 `make check`로 해결을 검증했다. 향후 host filesystem이나 Gradle
정책이 바뀌어 같은 오류가 재발하면 dependency·configuration cache까지 임의로 끄지 않고
TS-0013의 재검토 조건을 적용한다. Linked Live가 성공해도 실제 사용자 데이터, 영구
저장, 배포 runtime과 클라우드 가용성은 PP-029·PP-033·PP-035에서 별도로 검증한다.

자동 report scan은 launcher가 알고 있는 원본 자격·일회성 자격·routing URL, 고정 합성
입력과 이유 생성 계약의 두 고정 문장을 정확히 탐지한다. 파일 탐색 명령 자체가 실패해도
빈 결과로 오인하지 않고 검증을 중단하는 음성 테스트를 함께 둔다. 반면 실행 전에 값을 알
수 없는 실제 Naver 장소명·주소·Blog 제목·요약을 원문 대조해 비노출을 독립 증명하지는
못한다. 이를 성공으로 과장하지 않고, 출력 형식을 allowlist된 safe summary로 제한하는
코드·음성 테스트와 실행자의 예상 밖 출력 부재 확인을 함께 증거로 사용한다. 예상하지 않은
자유 문자열이 한 줄이라도 나오면 결과를 성공으로 기록하지 않고 노출 대응 절차를 적용한다.
