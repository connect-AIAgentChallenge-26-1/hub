---
id: RUN-0003
title: 추천 워크플로 Split Live Probe 실행과 중단
type: runbook
status: retired
date: 2026-07-15
owners:
  - placepick-team
related:
  - ../roadmap.md
  - ../contracts.md
  - ../adr/ADR-0012-recommendation-core-and-split-live-boundary.md
  - ../work-records/WI-0041-recommendation-core-split-live-workflow.md
  - RUN-0001-naver-local-live-and-credential-rotation.md
  - RUN-0002-elice-llm-local-live-and-token-rotation.md
  - RUN-0004-recommendation-workflow-linked-live.md
---

# RUN-0003 추천 워크플로 Split Live Probe 실행과 중단

> 이 절차는 PP-041에서 Split 전용 경로를 제거하면서 종료됐다. 현재 명령으로 실행하지
> 않는다. 실제 값 확인은 PP-042 Live Playground의 검증된 절차를 따른다.

## 목적과 적용 조건

핵심 추천 core의 제품형 schema가 실제 Elice와 Naver endpoint에서 호환되는지, 실제
Naver 데이터를 Elice에 전달하지 않는 네 단계의 Split Live로 확인하는 절차다. 이
Runbook은 명령과 자동 안전장치 구현, main 병합과 정상·실패 rehearsal이 끝나기 전까지
`draft`다. 현재 문서만으로 Live 실행을 승인하지 않는다.

이 검증은 Elice 조건 추출 1회, Naver Local 1회, Naver Blog 1회, Elice 합성 이유 생성
1회만 수행한다. Naver 결과의 결합·점수화·LLM 전달, Embedding, 공개 서비스와 cloud
배포는 검증하지 않는다.

2026-07-15 `main` SHA `dc6e1e2aacee47f2ac87bb425ff73299ba09854a`에서 정상
절차를 한 번 실행했지만 `Workflow split probe returned a safe failure status.`만 남기고
실패했다. 자동 재호출하지 않았고 10개 report 안전 scan과 비밀·원문 비노출은
확인했으나 실패 stage와 정규화 오류 code를 구분하지 못했다. 정상 경로가 검증되지
않았으므로 이 Runbook은 계속 `draft`다.

## 사전 조건과 안전장치

- PP-009·PP-014~PP-016 core와 Split Live launcher가 main에 병합되고 전체 diff를 사람이
  검토해야 한다.
- 실행 SHA는 현재 `origin/main`과 같은 정확한 40자리 commit이어야 하고 tracked working
  tree가 깨끗해야 한다. 기존 미추적 사용자 파일은 실행 대상에 포함하지 않는다.
- Dev Container Java 17과 Node 24 환경에서 `make check`가 먼저 통과해야 한다.
- CI, GitHub Actions, 공유 runner, 화면 공유 중인 환경에서는 실행하지 않는다.
- `.env.live.local`은 Git에서 제외돼야 하고 기존 8개 allowlist 변수 외 항목, 중복,
  빈 값, 예시값 또는 제어문자가 있으면 요청 전에 거부한다.
- Naver와 Elice 자격·전체 proxy URL은 shell 인자, 대화, Issue, PR, log, report와
  artifact에 복사하지 않는다.
- launcher는 고정 합성 fixture의 hash, 정확한 네 호출 예산, no-retry·no-redirect와
  127.0.0.1 bind를 검증해야 한다.
- Naver 응답이 Elice request body에 포함되거나 Elice bearer와 Naver header가 서로
  교차하면 즉시 실패하고 모든 자격을 노출 의심으로 처리한다.

## 진단과 실행 절차

1. 현재 SHA, 원격 main과 tracked diff를 확인한다.

   ```powershell
   git rev-parse HEAD
   git rev-parse origin/main
   git status --short
   ```

   두 SHA가 같아야 한다. tracked 변경이 있거나 실행 파일의 출처를 설명할 수 없으면
   중단한다.
2. `.env.live.local`이 Git 대상이 아닌지 값은 출력하지 않고 확인한다.

   ```powershell
   git check-ignore -q .env.live.local
   git status --short -- .env.live.local
   ```

   두 번째 명령은 아무것도 출력하지 않아야 한다.
3. 실제 provider를 호출하지 않는 전체 회귀를 먼저 실행한다.

   ```powershell
   make check
   ```

4. 코드에 구현된 launcher, Loopback Gateway route·fixture hash·redaction과 호출 예산을
   다시 검토한다. 승인할 main SHA를 별도로 복사하고 다음 전용 명령을 한 번만 실행한다.

   ```powershell
   make workflow-live-probe APPROVED_SHA=<40자리-main-SHA>
   ```

5. launcher는 127.0.0.1 임시 포트와 일회성 local token을 만들고 Gateway를 시작한다.
   provider 원본 자격은 Gateway 프로세스에만 전달되고 Java 프로세스에는 loopback URL과
   local token만 전달돼야 한다.
6. 예상 단계와 application 논리 호출 수를 확인한다.

   ```text
   conditionExtraction  Elice synthetic Chat   1
   naverLocal           Naver fixed canary     1
   naverBlog            Naver fixed canary     1
   reasonGeneration     Elice synthetic Chat   1
   total                                         4
   ```

7. 성공 출력은 단계별 2xx·schema·안전한 count·latency와 마지막
   `mode=split linked=false status=passed callCount=4`만 포함해야 한다. 검색어, 장소명,
   주소, URL, prompt, completion, vector, credential과 전체 provider 응답이 보이면
   성공 여부와 무관하게 노출 분기로 이동한다.
8. 종료 뒤 Gateway process, 임시 포트, local token과 임시 파일이 남지 않았는지 확인하고
   실행 SHA·시각·안전한 단계 결과만 WI-0041에 기록한다. provider dashboard 사용량을
   확인하지 못했으면 논리 호출과 no-retry transport까지만 주장한다.

## 실패 분기

| 관찰 | 조치 |
| --- | --- |
| SHA·diff·CI guard 실패 | provider를 호출하지 말고 main 병합과 working tree를 복구한다. |
| 환경 parsing 실패 | 값을 출력하지 않고 unknown·duplicate·누락·예시값과 URL·model 계약만 확인한다. |
| Loopback 인증·fixture hash 실패 | 임의 token·body로 우회하지 않고 launcher와 Gateway Mock 테스트를 수정한다. |
| 400·schema 실패 | 실제 body를 저장하지 않고 stage·오류 code만 기록한 뒤 합성 fixture로 재현한다. |
| 401·403 | provider console에서 자격 연결·교체 상태를 확인하고 자동 재호출하지 않는다. |
| 429 | 즉시 중단하고 provider별 quota·사용량을 확인한다. |
| 5xx·timeout | 외부 장애로 분류하고 자동 재시도하지 않는다. |
| 네 호출 초과 또는 redirect | 안전 계약 실패로 처리하고 자격을 폐기할지 사람이 판단한다. |
| `linked=true` 또는 Naver→Elice 전달 흔적 | 정책 위반으로 중단하고 실제 데이터·자격 노출 대응을 수행한다. |
| cleanup 실패 | 남은 local process를 중지하고 임시 파일·token을 제거한 뒤 원인을 Mock으로 재현한다. |
| safe failure에 stage·오류 code 없음 | 같은 SHA를 재호출하지 않고 launcher의 redacted 진단 계약을 먼저 보강한다. |

실패 뒤 provider credential을 붙인 임의 `curl`, base URL 변경, schema 완화 또는 반복
호출로 진단하지 않는다. 원인을 Mock과 redacted stage로 좁히고 새 검토 SHA가 main에
병합된 뒤 사람이 재실행을 승인한다.

## 노출 대응과 rollback

1. credential, 전체 Elice proxy URL, Naver 원문 또는 Elice prompt·completion이 출력·
   report·artifact·Git에 나타나면 Gateway와 live 실행을 즉시 중단한다.
2. RUN-0001과 RUN-0002에 따라 해당 Naver key와 Elice token을 provider console에서
   폐기·교체하고 의도하지 않은 사용량을 확인한다.
3. `.env.live.local`과 남은 local token·임시 파일을 삭제하고 Git history, report와
   artifact를 secret scanner로 확인한다. 삭제 commit만으로 이력 노출이 해결됐다고
   간주하지 않는다.
4. 실제 값 없이 노출 범위·시각·호출량·조치만 Troubleshooting에 기록한다.

## 검증과 rollback

정상 완료는 검토된 main SHA, 사전 `make check`, 정확히 네 논리 호출의 2xx·제품형
schema, `linked=false`, report 안전 scan과 완전한 local cleanup이다. 이 결과는 개별
provider가 제품형 요청을 수락했다는 뜻이며 Naver→Elice Linked Live, 약관 승인,
제품 runtime, Job·Worker 또는 cloud 배포 완료를 뜻하지 않는다.

Split Live는 DB·서비스 설정을 바꾸지 않는다. 기능 rollback은 Gateway process 종료와
임시 자격 제거다. Linked Live는 새 Task·Work Record·ADR·별도 명령과 Runbook 검증을
요구하며 Split 절차 안에서 실행하거나 그 결과로 대체하지 않는다.

PP-040은 저장소 소유자의 양쪽 Provider 승인 진술을 근거로 별도 Linked Live 명령과
[RUN-0004](RUN-0004-recommendation-workflow-linked-live.md)를 도입한다. 승인 원문은
독립 검토하지 않았고, 이 변경은 실패한 Split Live를 성공으로 바꾸거나 RUN-0003을
`verified`로 올리는 근거가 아니다.
