---
id: RUN-0001
title: Naver Local Live 검증과 자격증명 교체
type: runbook
status: retired
date: 2026-07-14
owners:
  - placepick-team
related:
  - ../adr/ADR-0009-mock-local-live-gateway-boundary.md
  - ../work-records/WI-0007-provider-and-live-validation-policy.md
  - ../work-records/WI-0015-naver-api-hub-adapter.md
  - ../troubleshooting/TS-0012-provider-response-metadata-compatibility.md
---

# RUN-0001 Naver Local Live 검증과 자격증명 교체

> Provider별 canary 명령 제거로 이 절차는 종료됐다. 자격 노출 시 Provider console에서
> 즉시 폐기·교체하고, 현재 직접 Live 검증은 PP-042의 검증된 절차를 따른다.

## 목적과 적용 조건

개발자가 NAVER API HUB Local·Blog의 실제 인증과 현재 schema를 최소 호출로 확인하고,
노출·의심·정기 교체 시 기존 credential을 안전하게 폐기하는 절차다. 일반 기능 개발과
CI는 Mock을 사용하고 이 절차는 실제 계약 drift를 확인해야 할 때만 수동으로 수행한다.

2026-07-14 교체된 key와 검토된 SHA에서 Local·Blog 실제 canary가 모두 2xx·schema를
통과해 이 절차의 정상 경로를 검증했다. 명령 실행, provider 호환성, 약관 승인과 제품
runtime 활성화는 계속 구분한다. `verified`는 정상 canary와 교체된 key 사용 경로를
뜻하며, 실제 유출 사고 대응 훈련이나 provider dashboard 대조 완료를 뜻하지 않는다.

## 사전 조건과 안전장치

- 대화에 게시된 기존 Naver secret을 NAVER API HUB 콘솔에서 교체한다. 교체 완료를
  사람이 확인하기 전에는 Local Live를 실행하지 않는다.
- 새 ID·key는 대화, Issue, PR, Git, shell history, 화면 캡처와 문서에 복사하지 않는다.
- 실행할 branch와 전체 diff, 특히 live task와 HTTP client를 사람이 검토한다. 출처를
  신뢰하지 않는 commit이나 미추적 실행 파일이 있으면 중단한다.
- `.env.live.local`은 저장소의 ignore 정책으로 제외하고 현재 Windows 계정 외 사용자가
  작업공간을 읽을 수 있으면 실행하지 않는다.
- Naver 결과의 결합·DB 저장·LLM 전달은 약관 검토가 끝날 때까지 허용하지 않는다.
- `make check`와 일반 앱은 `.env.live.local`을 읽지 않아야 한다. live task 이외의
  프로세스가 파일을 읽는 정황이 있으면 즉시 중단한다.

## 진단과 검증 절차

1. NAVER API HUB 콘솔에서 개발 전용 Application에 Local과 Blog가 활성화됐는지
   확인한다. 기존 secret을 교체했다면 교체 시각과 담당자만 비공개 운영 기록에 남긴다.
2. 저장소의 `.env.live.local.example`을 `.env.live.local`로 복사하고 로컬 편집기로
   `PLACEPICK_EXTERNAL_MODE=live-contract`, 새 ID와 key를 입력한다. 공식 API HUB base
   URL은 live test 코드에 고정되어 있으며 이 파일에서 변경할 수 없다. 값이 포함된
   명령을 터미널에 직접 입력하지 않는다.
3. 다음 명령이 성공해 파일이 Git 대상이 아님을 확인한다.

   ```powershell
   git check-ignore -q .env.live.local
   git status --short -- .env.live.local
   ```

   두 번째 명령은 아무 경로도 출력하지 않아야 한다. 경로가 출력되면 live 호출 전에
   파일을 작업공간 밖으로 이동하고 ignore 규칙을 수정한다.
4. Mock 경로의 결정적 회귀를 먼저 실행한다.

   ```powershell
   make check
   ```

5. 작업 대상 SHA와 live 관련 diff를 다시 확인한 뒤 전용 task를 한 번 실행한다.

   ```powershell
   git rev-parse HEAD
   make naver-live-contract
   ```

6. 성공 출력에는 Local·Blog별 HTTP 분류, schema 적합 여부, item 수, 지연시간과 총
   application 논리 호출 수 2만 있어야 한다. 검색어, 장소명, 주소, URL, 응답 body와
   인증 header가 보이면 성공 여부와 관계없이 유출 대응 절차로 이동한다.
7. 가능하면 NCP 콘솔의 호출량이 실행 의도와 일치하는지 사람이 추가 확인한다. 성공은 해당 시각에
   두 API의 인증·schema가 호환됐다는 의미이며 약관 승인, 추천 품질, 장애 대응과
   클라우드 배포를 증명하지 않는다.

## 2026-07-14 실행 증거

- 최초 실행의 포괄적 `INVALID_RESPONSE`를 바로 반복하지 않고 HTTP·parser stage와
  no-retry transport, 합성 회귀를 먼저 보강했다.
- 진단 실행에서 Local·Blog 모두 2xx 이후 `MEDIA_TYPE` 단계임을 확인했으며 header 원문과
  body는 보존하지 않았다.
- `Accept: application/json`을 명시하고 응답 header는 보조 신호로 전환했다. 1MiB 상한,
  엄격 JSON·schema 검증과 malformed·중복 key·trailing token 거부는 유지했다.
- 최종 SHA `128692bdcaa8ef4e5e00a06362c02f25da223a4b`, 시각
  2026-07-14T14:18:00.433Z에서 Local은 item 1개·5615ms, Blog는 item 1개·1071ms로
  모두 2xx·schema를 통과했다.
- application 논리 호출은 endpoint별 한 번, 합계 2회였고 automatic retry·redirect는
  비활성화됐다. provider console wire 사용량은 별도 대조하지 않았다.
- 응답 body, 검색어, 장소·주소·URL과 인증 header는 보존하지 않았고 report 10개 안전
  scan을 통과했다.

## 실패 분기

| 관찰 | 조치 |
| --- | --- |
| 실행 전 구성 거부 | mode, CI 여부, exact HTTPS host와 누락 항목만 확인한다. 값을 출력하지 않는다. |
| 400 | 고정 query·display 계약과 API 선택을 공식 문서와 대조하고 재시도하지 않는다. |
| 401·403 | task를 중단하고 Application 선택·secret 교체 상태를 콘솔에서 확인한다. |
| 429 | 호출을 중단하고 NCP 사용량·quota를 확인한다. 자동 재시도하지 않는다. |
| 5xx·timeout | 외부 장애로 분류하고 원문 body 없이 시각·오류 class만 기록한다. |
| schema 불일치 | 응답을 저장하지 않고 field 존재·type 차이만 안전한 fixture로 재현한다. |
| `INVALID_RESPONSE` | content type·envelope·필수 field·JSON parsing을 Mock fixture로 분리 진단하고 원인을 확인하기 전 재호출하지 않는다. |

실패 뒤 임의 `curl`로 인증 header를 붙여 재시도하지 않는다. 필요한 재검증은 원인을
수정하고 호출 상한을 다시 확인한 뒤 같은 task로 Local·Blog 각 한 번만 수행한다.

## 노출·교체 절차

1. 대화, log, report, artifact, commit 또는 화면 공유에 key가 나타나면 해당 값을
   노출된 것으로 간주하고 모든 live 실행을 중단한다.
2. NAVER API HUB 콘솔에서 secret을 교체하고 기존 값이 더 이상 인증되지 않는지
   콘솔이 제공하는 상태로 확인한다. 실제 key 값은 기록하지 않는다.
3. 로컬 `.env.live.local`을 삭제하고 저장소의 tracked file과 최근 diff를 secret
   scanner로 확인한다. Git 이력에 들어갔다면 단순 삭제 commit으로 해결됐다고 보지
   않고 저장소 관리자와 이력 정화 범위를 결정한다.
4. NCP 사용량과 감사 가능한 기록에서 의도하지 않은 호출이 있는지 확인하고 시각,
   호출량, 조치와 영향을 비밀 없는 Troubleshooting 기록으로 남긴다.
5. 새 값을 로컬 파일에 다시 입력한 뒤 사전 조건부터 재수행한다. 클라우드 Gateway
   secret도 같은 값이었다면 Gateway를 중지하고 새 version으로 교체한 후 별도 배포
   검증을 수행한다.

## 검증과 rollback

정상 종료 기준은 Mock 전체 검증 성공, Local·Blog 논리 호출 각 1회의 2xx·schema 통과,
출력·보고서 비밀 부재다. 가능하면 NCP console에서 wire 호출량 2건도 대조하되, 확인하지
못한 경우 논리 호출 수와 no-retry transport 증거만 명시한다. 실제 결과 전문은 artifact로
보존하지 않고 Work Record에는 시각, safe summary와 실행 SHA만 기록한다.

이번 검증은 DB schema나 서비스 상태를 변경하지 않으므로 기능 rollback은 없다.
의심 시 credential을 폐기하고 `.env.live.local`을 삭제하는 것이 보안 rollback이다.
반복 인증 실패, 의도하지 않은 사용량 또는 약관 해석이 필요한 경우 실제 호출을
중지하고 NCP 지원과 프로젝트 보안 책임자에게 에스컬레이션한다.
