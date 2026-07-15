---
id: RUN-0004
title: Naver→Elice 실제 Linked Live 워크플로 실행과 중단
type: runbook
status: draft
date: 2026-07-15
owners:
  - placepick-team
related:
  - ../roadmap.md
  - ../contracts.md
  - ../adr/ADR-0013-naver-elice-linked-live-boundary.md
  - ../work-records/WI-0042-naver-elice-linked-live-workflow.md
  - https://github.com/gdh0730/hub/issues/50
  - RUN-0001-naver-local-live-and-credential-rotation.md
  - RUN-0002-elice-llm-local-live-and-token-rotation.md
  - RUN-0003-recommendation-workflow-split-live-probe.md
  - ../troubleshooting/TS-0016-linked-live-provider-error-flattening.md
---

# RUN-0004 Naver→Elice 실제 Linked Live 워크플로 실행과 중단

## 목적과 적용 조건

고정 합성 사용자 입력을 실제 Elice 조건 추출, 실제 Naver Local·Blog, 제품 추천 core와
실제 Elice 근거 이유 생성으로 연결해 핵심 Linked Live 경로를 반복 가능하게 검증하는 절차다.
이 Runbook은 harness의 자동 검증과 main 병합 뒤 실제 정상 실행이 끝나기 전까지
`draft`다. 문서 존재만으로 Live 실행을 승인하지 않는다.

저장소 소유자는 양쪽 Provider 실행과 주소·도로명 주소를 포함한 현재 전체 문맥 전달을
승인했다고 진술했다. 승인 원문은 독립 검토하지 않았으며 이 절차는 법률·약관 준수나
실제 사용자 데이터 처리 승인을 증명하지 않는다. 합성 입력의 로컬 일회성 검증에만
적용한다.

## 사전 조건과 안전장치

- 기본 경로에서는 PP-040 harness가 필수 CI를 통과해 `main`에 병합되고 전체 diff를 사람이
  검토해야 한다. 개발 반복 경로는 `feat/workflow-linked-live-validation` exact branch만
  허용하며, `HEAD`, 원격 branch와 `APPROVED_SHA`가 같고 `origin/main`의 descendant여야 한다.
- 두 경로 모두 tracked tree가 깨끗해야 한다. 직접 하위의 미추적 `plans/*.md`만 보존할 수
  있고 실행 입력으로 사용하지 않는다. 그 밖의 untracked 파일과 executable source
  경로에서 ignore된 파일은 실행 전에 거부한다.
- Dev Container의 Java 17·Node 24에서 표준 `make check`가 먼저 통과해야 한다. Windows
  bind mount의 Gradle task output cache mode 문제가 재현되면 실패를 숨기거나 전체
  cache를 임의로 끄지 말고 TS-0013의 영구 정책이 적용됐는지 확인한다.
- CI, GitHub Actions, 공유 runner, 원격 shell, 화면 공유 중인 환경에서는 실행하지 않는다.
- `.env.live.local`은 Git에서 제외되고 기존 8개 allowlist 변수만 가져야 한다. 값을
  shell·대화·Issue·PR·log에 출력하지 않는다.
- launcher와 Gateway의 고정 합성 입력, 전송 field allowlist, 상태 순서, 9회 호출 상한,
  no-retry·no-redirect와 report scan을 사람이 확인한다.
- Naver·Elice raw credential은 Gateway만 받고 Java에는 loopback URL과 일회성 local
  자격만 전달돼야 한다.
- 실제 Provider 결과, 검색어, 장소명·주소·링크, prompt·completion과 전체 Elice routing
  URL을 console·JUnit·Gradle report·Git에 남기지 않는다.
- 같은 SHA의 수동 재실행은 허용한다. 각 invocation은 새 process·port·일회성 자격과 독립
  9회 상한을 가져야 하며, 한 invocation 내부 retry·redirect와 병렬 실행은 금지한다.

## 진단과 실행 절차

1. 원격과 현재 SHA, tracked 상태를 확인한다.

   ```powershell
   git fetch origin main
   git rev-parse HEAD
   git rev-parse origin/main
   git status --short
   ```

   두 SHA가 같아야 한다. tracked 변경이 있거나 실행 코드의 출처를 설명할 수 없으면
   중단한다.
2. 비밀값을 출력하지 않고 환경 파일이 Git에서 제외됐는지 확인한다.

   ```powershell
   git check-ignore -q .env.live.local
   git status --short -- .env.live.local
   ```

   두 번째 명령은 출력이 없어야 한다.
3. 표준 자동 검증을 실행한다.

   ```powershell
   make check
   ```

   실제 Provider 호출 없이 다섯 Mock core 흐름, Linked source compile, Gateway·launcher
   음성 테스트와 secret scan이 모두 통과해야 한다.
4. 병합본 검증은 승인할 40자리 `origin/main` SHA로 실행한다.

   ```powershell
   make workflow-live-linked APPROVED_SHA=<40자리-origin/main-SHA>
   ```

   수정·재검증을 merge마다 끊지 않는 개발 경로는 전용 branch를 push한 정확한 SHA에서만
   다음 명령으로 실행한다.

   ```powershell
   make workflow-live-linked-dev APPROVED_SHA=<40자리-pushed-validation-SHA>
   ```

5. launcher는 임시 127.0.0.1 port와 256-bit local 자격을 만들고 Gateway를 시작한다.
   예상 논리 호출은 다음 순서이며 총 6~9회다.

   ```text
   conditionExtraction  Elice Chat             1
   naverLocal           Naver Local            1~2
   naverBlog            Naver Blog             3~5
   reasonGeneration     Elice Chat             1
   embedding            Elice Embedding        0
   total                                       6~9
   ```

6. 성공은 조건 schema·사용자 확인 경계, 후보 3개, 점수 범위 0~80, 실제 Blog evidence
   연결, 이유 place/evidence 집합 일치와 금지 주장 부재를 모두 검증해야 한다.
7. 마지막 summary는 안전한 count·boolean·latency·token 수와 다음 상태만 포함해야 한다.

   ```text
   WORKFLOW_LINKED mode=linked linked=true status=passed degraded=false reasonFallback=false callCount=<6..9> cleanup=true
   ```

   실제 field 값이나 응답 본문이 보이면 성공 여부와 관계없이 노출 대응으로 이동한다.
8. 종료 뒤 Gateway process, 임시 port·local 자격·파일이 제거됐는지 확인한다. 실행 SHA,
   시각, 단계별 schema 여부, 후보·근거 수, 호출 수와 cleanup 결과만 WI-0042에 기록한다.
   Provider dashboard를 확인하지 못했으면 application 논리 호출 수와 no-retry transport만
   주장한다.

자동 scan은 launcher가 아는 자격·routing URL·고정 합성 marker를 검사하지만 실행 전에
알 수 없는 장소명·주소·생성 문장을 원문 대조하지는 못한다. 실행자는 console이 문서화된
safe summary 형식만 포함하는지 별도로 확인한다. 예상하지 않은 자유 문자열이나 Provider
본문으로 의심되는 출력이 있으면 `passed` marker가 있어도 실패와 노출 가능성으로 다룬다.

## 실패 분기

| 관찰 | 조치 |
| --- | --- |
| SHA·diff·CI guard 실패 | Provider를 호출하지 않고 깨끗한 병합 main을 준비한다. |
| 환경 parsing·Git ignore 실패 | 값을 출력하지 않고 allowlist·누락·placeholder와 ignore 규칙만 수정한다. |
| 조건 추출 의미·schema 실패 | Draft를 자동 보정·확정하지 않고 안전한 오류만 기록한다. |
| 조건 추출 `PROVIDER_UNAVAILABLE` | 사용자 확인·Naver·Blog·이유 단계를 진행하지 않는다. Mock에서 5xx와 전송 실패를 분리한 뒤 새 독립 invocation을 승인한다. |
| Local 후 한 번 완화해도 후보 3개 미만 | `INSUFFICIENT_CANDIDATES`로 종료하고 Blog·이유를 호출하지 않는다. |
| Blog Provider 오류 | Gateway가 phase를 `failed`로 바꾸고 이후 Java 이유 요청을 409로 막아 실제 Elice upstream 호출을 0으로 유지한다. core의 degraded·fallback 결과도 Linked 성공으로 처리하지 않는다. |
| 정상 Blog 응답이지만 연결 근거 0건 | 이유 provenance 검증 전에 중단하고 Linked 성공으로 처리하지 않는다. |
| 이유 생성 오류·fallback | 서버 fallback이 안전해도 실제 Linked 증거는 실패로 기록한다. |
| place·evidence provenance 불일치 | Elice upstream 호출 전에 거부하고 Mock 공격 fixture로 재현한다. |
| 401·403 | Provider console에서 자격 연결을 확인하고 같은 SHA를 재호출하지 않는다. |
| 429·5xx·timeout | 즉시 중단하고 자동 retry하지 않는다. |
| 호출 9회 초과·redirect | 안전 계약 실패로 처리하고 자격 노출 여부를 사람이 판단한다. |
| 비밀·원문·금지 field 출력 | 즉시 중단하고 RUN-0001·RUN-0002의 노출 대응을 수행한다. |
| report 파일 읽기·검색 실패 | 미검출로 간주하지 않고 scan 실패로 중단한다. |
| cleanup 실패 | local process를 중지하고 임시 자격·파일을 제거한 뒤 Mock으로 원인을 재현한다. |

실패 뒤 실제 자격을 붙인 임의 `curl`, URL 변경 또는 계약을 약화하는 schema 완화로
진단하지 않는다. 안전한 stage·오류 code만 남기고 원인을 Mock에서 먼저 재현한다. 수정은
검토·commit·push한 전용 branch의 새 SHA에서 별도 invocation으로 검증할 수 있다.

## 실행 이력

2026-07-15 21:10 KST, SHA `541a98b3b73bfdaa3a1c7396aaea32ce410a7237`에서 실제
Linked Live를 정확히 한 번 실행했다. 고정 합성 조건은 Gateway를 통한 Elice 조건 추출
논리 단계에 진입했지만 `conditionExtraction / PROVIDER_UNAVAILABLE`로 종료됐다. JUnit은
`1 test / 1 failure`였고 사용자 확인, Naver Local·Blog, 점수·Top 3와 Elice 이유에는
도달하지 않았다. 같은 SHA 재시도는 0회이며 생성 report 10개 안전 scan은 통과했다.

Launcher의 Gateway process·port·임시 디렉터리 guard가 실패하지 않은 채 종료됐고 사후
process count도 0이었다. 성공 전용 `cleanup=true` summary는 Gradle 실패 때문에 출력되지
않았으므로 정상 완료 증거로 사용하지 않는다. Provider dashboard를 대조하지 않아 wire
호출 수는 확정하지 않았다. application 논리 요청은 한 번이고 코드상 automatic retry는
0회지만 upstream wire 요청 수는 dashboard·network telemetry 없이 단정하지 않는다.
5xx·전송·timeout 중 세부 원인도 확정하지 않았다. 이 실패 분기만으로 RUN-0004를
`verified`로 올리지 않는다.

## 노출 대응과 rollback

1. Gateway와 Live 실행을 즉시 중단한다.
2. 노출 가능성이 있는 Naver key와 Elice token을 Provider console에서 폐기·교체하고
   의도하지 않은 사용량을 확인한다.
3. `.env.live.local`, 임시 local 자격과 파일을 제거하고 Git history·report·artifact를
   secret scanner로 검사한다. 삭제 commit만으로 이력 노출이 해결됐다고 보지 않는다.
4. 실제 값 없이 노출 시각·범위·호출량·대응만 Troubleshooting에 기록한다.

## 검증과 rollback

정상 완료는 검토된 병합 `main`, 선행 `make check`, 실제 6~9회 경로, 후보 3개,
`linked=true`, `degraded=false`, `reasonFallback=false`, provenance 검증, 안전한 report와
완전한 cleanup이다. 하나라도 없으면 RUN-0004를 `verified`로 올리지 않는다.

이 검증은 DB나 앱 runtime을 바꾸지 않는다. 기능 rollback은 Gateway 종료와 임시 자격
제거다. Linked Live 성공도 공개 API·Job·Worker·SSE·frontend·배포나 실제 사용자 데이터
정책 완료를 뜻하지 않으며 각 후속 Task에서 별도로 검증한다.
