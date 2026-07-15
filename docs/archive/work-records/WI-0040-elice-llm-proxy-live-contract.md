---
id: WI-0040
title: PP-038 Elice LLM Proxy Local Live 계약 검증
type: work-record
status: done
date: 2026-07-14
owners:
  - placepick-team
related:
  - ../roadmap.md
  - ../adr/ADR-0011-elice-chat-completions-provider-boundary.md
  - ../runbooks/RUN-0002-elice-llm-local-live-and-token-rotation.md
  - ../troubleshooting/TS-0010-elice-live-no-http-response.md
  - ../troubleshooting/TS-0011-github-runner-ripgrep.md
  - ../troubleshooting/TS-0012-provider-response-metadata-compatibility.md
  - https://github.com/gdh0730/hub/issues/42
paths:
  - backend/src/main/java/com/placepick/infrastructure/external/llm/**
  - backend/src/main/java/com/placepick/infrastructure/external/http/**
  - backend/src/test/java/com/placepick/infrastructure/external/llm/**
  - backend/src/integrationTest/java/com/placepick/infrastructure/external/llm/**
  - backend/src/llmLiveContractTest/**
  - backend/build.gradle
  - backend/gradle.lockfile
  - .env.live.local.example
  - scripts/*live-contract*.sh
  - scripts/lib/live-contract-env.sh
  - scripts/check.sh
  - scripts/scan-test-reports.sh
  - scripts/scan-test-reports-test.sh
  - scripts/setup-ripgrep-ci.sh
  - .github/workflows/ci.yml
  - Makefile
  - README.md
  - AGENTS.md
  - backend/AGENTS.md
  - docs/**
---

# WI-0040 PP-038 Elice LLM Proxy Local Live 계약 검증

> GitHub Issue: [PP-038 #42](https://github.com/gdh0730/hub/issues/42)

## 문제와 근거

Mock LLM은 정상·오류·timeout을 결정적으로 재현하지만 제공된 Elice proxy가 실제로
Chat Completions strict schema와 Embedding 계약을 지원하는지는 증명하지 못한다.
기존 OpenAI Responses 직접 호출 방향을 그대로 유지하면 현재 credential·endpoint와
맞지 않고, 호환 proxy라는 이유만으로 OpenAI와 동일한 기능·데이터 정책을 가정하게 된다.

2026-07-14 최초 Naver Local Live는 baseline `make check` 통과 뒤 Local·Blog 메서드를
application 수준에서 각각 한 번 호출했지만 둘 다 `INVALID_RESPONSE`로 실패했다.
당시 provider 사용량을 대조하지 않아 실제 wire 요청 수는 확정하지 않는다. 이 결과는 Mock의 필요성을
약화하지 않고 실제 계약 증거를 독립적으로 관리해야 함을 확인한다. Naver 원인 진단과
Elice 계약 검증은 서로 다른 provider 작업으로 분리한다.

## 목적과 성공 기준

목적은 실제 token 없이 Elice 요청·응답·오류·redaction을 자동 검증하고, 승인된 로컬에서
합성 Chat과 Embedding을 각각 한 번만 호출해 capability를 확인하는 것이다.

- 공용 `.env.live.local`을 수동 parsing하되 Naver와 Elice 명령은 자기 provider 변수만
  하위 프로세스에 전달한다.
- URL은 서로 다른 exact HTTPS `mlapi.run/{canonical-uuid}/v1`, 모델은
  `openai/gpt-4.1-mini`와 `openai/text-embedding-3-small`만 허용한다.
- Chat은 strict JSON Schema, `stream=false`, `store=false`, tool 없음과 bounded output을
  검증한다.
- Embedding은 합성 입력 한 건, float encoding, index 0, 1,536 finite dimensions만
  확인하고 vector를 출력·저장하지 않는다.
- 400, 401·403, 429, 5xx, timeout, malformed·oversized·schema 위반을 안정적인 오류로
  정규화하고 자동 재시도·Responses fallback을 금지한다.
- token, 전체 proxy URL, 요청·응답 본문과 vector가 console·JUnit·Gradle report·Git에
  나타나지 않아야 한다.

## 범위, 비범위와 제약

범위는 Elice 전용 Java 17 transport·schema validator, WireMock 계약, Local Live source
set, 공용 환경 parser의 provider 격리, `make llm-live-contract`, ADR·Runbook·계약과
실행 증거다. runtime bean은 자동 등록하지 않는다.

PP-009 조건 추출, PP-016 추천 이유, PP-029 runtime wiring, 실제 사용자·Naver 데이터
전송, Embedding 기반 검색·추천·중복 제거, vector 저장소, Cloudflare LLM Gateway와 cloud
배포는 포함하지 않는다. Elice의 보관·로깅·학습 사용·삭제·개인정보 정책을 사람이
검토하기 전에는 합성 canary 외 데이터를 보내지 않는다.

## 판단 기준과 대안

기준은 현재 제공된 계약과의 일치, strict schema, 최소 호출, provider별 secret 격리,
결정적 Mock 회귀, 데이터 최소화와 후속 교체 가능성이다.

- Elice를 일반 앱에 바로 연결하면 제품 기능과 계약 확인이 섞이므로 독립 Local Live
  harness를 먼저 둔다.
- 직접 OpenAI Responses는 공식 기능이 명확하지만 현재 제공 경로와 다르므로 자동
  fallback이 아닌 재검토 대안으로 남긴다.
- Chat 성공만으로 Embedding을 runtime에 채택하지 않고 capability 상태를 분리한다.
- 전체 proxy 응답을 artifact로 남기면 진단은 쉽지만 데이터·비밀 위험이 커 safe summary와
  합성 WireMock fixture만 보존한다.

## 문제 해결 기록

1. Elice proxy가 OpenAI-compatible Chat Completions와 Embedding URL을 별도로 제공한다는
   구성 계약을 확인했다.
2. OpenAI 공식 문서에서 GPT-4.1 mini의 Chat Completions·Structured Outputs 지원과
   `text-embedding-3-small` 기본 1,536차원을 비교 기준으로 확인했다.
3. Responses 직접 호출을 기본에서 대안으로 옮기고 Elice 정책 검토 전 실제 제품 데이터
   전달을 차단하는 ADR-0011을 채택했다.
4. Naver 실패를 application에서 재호출하지 않고 `INVALID_RESPONSE` 두 건으로 기록해
   Elice 작업과
   원인·증거를 분리했다.
5. unit security, LLM WireMock 통합 테스트와 Local Live source set compile을 먼저
   실행해 실제 credential 없이 transport·schema·redaction 경계를 검증했다.
6. Apache HttpClient 5의 automatic retry·redirect를 명시적으로 끈 공통 전송 계층으로
   Naver·Elice를 통일하고 5xx·timeout의 WireMock 요청 수가 endpoint별 한 건인지 검증했다.
7. 텍스트와 binary JUnit·Gradle report를 fail-closed 검사하고 provider별 Live 명령도
   종료 성공 여부와 무관하게 전용 report를 검사하도록 보강했다.
8. Dev Container Java 17에서 전체 `make check`를 실행한 뒤 감사 SHA에서 실제 Elice
   합성 canary를 한 번 수행했다. 두 capability 모두 HTTP 응답 전
   `PROVIDER_UNAVAILABLE`로 실패해 자동 재호출하지 않고 TS-0010으로 분리했다.
9. 첫 실행이 connection manager 하나를 공유해 두 번째 실패의 독립성을 보장하지
   못한 점을 수정했다. Chat·Embedding transport를 분리하고 TLS 기본 구성이 검증된
   pooling manager를 사용하되 실제 endpoint는 재승인 전 다시 호출하지 않는다.
10. 첫 원격 CI에서 GitHub-hosted runner에 `rg`가 없어 fail-closed 보고서 검사가
    의도대로 중단됐다. 공식 ripgrep 14.1.1 Linux x86_64 artifact와 SHA-256을 고정해
    두 검사 job에서만 설치하고, scanner의 `rg` 누락 음성 테스트는 그대로 유지했다.
11. 안전한 failure stage가 포함된 SHA에서 Chat·Embedding을 각각 한 번 호출해 두
    응답이 모두 2xx 이후 `CHAT_MODEL`·`EMBEDDING_MODEL`에서만 거부됨을 확인했다.
    관찰된 model 문자열과 response body는 출력하지 않고 자동 재호출하지 않았다.
12. 요청 pin은 그대로 유지하면서 응답에는 공식 base alias와 승인된 Chat snapshot만
    허용하는 닫힌 목록을 추가했다. 무관한 model 거부 테스트와 strict content·usage·
    1,536차원 검증은 유지했다.
13. 검토·push된 SHA `e6190662c2382304f21c39bdb29375d1b1324733`에서 실제 Chat과
    Embedding을 각각 한 번 재검증해 모두 2xx 계약을 통과했다.

## 구현 결과와 검증 증거

Elice 자동 타깃 검증은 2026-07-14에 `BUILD SUCCESSFUL`로 끝났다. unit security 18개,
Elice transport 통합 43개, committed mapping 통합 4개로 총 65개 테스트가
failures·errors 0이었고 mapping JSON 20개를 parsing했다.
`compileLlmLiveContractTestJava`도 성공했다. Naver는 단위 3개·통합 21개로 총 24개가
failures·errors 0이었다. 최종 metadata 회귀 추가 뒤 Naver는 단위 5개·통합 28개로
총 33개가 failures·errors 0이었다.

같은 날 capability별 transport 분리까지 반영한 최종 트리에서 Dev Container Java 17
전체 `make check`가 279.6초, exit 0으로 통과했다. actionlint 1.7.12의 고정 digest를
대조했고 Markdown은 86개 파일·오류 0,
문서 음성 테스트는 8/8, Edge는 74/74였다. Gradle은 unit·integration·Eval을 실행하고
Naver·LLM Live class를 compile한 뒤 89초에 `BUILD SUCCESSFUL`로 끝났다. Java 단위
27개·통합 79개·Eval 5개와 텍스트·binary를 포함한 test report 81개도 비밀·본문 안전
scan을 통과했다. Live task는
실행하지 않아 이 전체 검증에서 실제 provider 호출은 0회였다. 자동 검증과 Live 상태를
다음처럼 분리한다.

후속 CI 도구 수정 commit `cb6213acc044515a2ba484d8ed7be32cba8f03bd`에서는 공식
ripgrep 14.1.1 artifact·SHA-256 검증을 추가했다. 원격 CI run `29337507462`의
정책·Compose와 Java 17 backend job, Dev Container smoke run `29337507340`이 모두
통과했다. 이 원격 성공은 무비밀 자동 하네스의 재현성 증거이며 Local Live는 아래의
별도 실제 실행으로 검증했다.

| 증거 | 현재 상태 | 완료 기준 |
| --- | --- | --- |
| Elice 자동 타깃 검증 | 통과 | 65 tests·20 mapping JSON·Live source compile, failures·errors 0 |
| 저장소 전체 검증 | 통과 | Dev Container Java 17, exit 0, 279.6초; report 81개 안전 scan, 실제 provider 호출 0회 |
| Chat Local Live | 통과 | 2026-07-14 2xx·strict schema·usage, input 69·output 5 tokens, 3207ms |
| Embedding capability | 통과 | 2xx·item 1개·1,536 finite dimensions·usage, input 8 tokens, 1067ms |
| 제품 runtime | 구현 안 됨 | PP-009·PP-016·PP-029와 Elice 정책 검토 |
| 클라우드 배포 | 배포 안 됨 | PP-033·PP-035 승인 SHA E2E |

최종 Elice 실행 시각은 2026-07-14T14:22:09.241Z이고 application 논리 호출은 Chat·
Embedding 각 한 번, 합계 2회다. automatic retry와 redirect는 비활성화됐으며 test
report 10개는 token·전체 URL·본문·vector 안전 scan을 통과했다. provider dashboard의
wire 사용량은 독립 대조하지 않았으므로 논리 호출 수와 transport 정책까지만 주장한다.

## AI 사용과 사람의 검증

AI에는 공식 OpenAI 호환 기준 탐색, transport·schema·음성 fixture와 문서 초안을
위임한다. AI는 token이나 실제 proxy URL을 읽거나 출력하지 않고 live 실행을 승인하지
않는다.

사람은 Elice endpoint·token, 실행 SHA, 정책·비용과 실제 canary를 확인한다. 이번 상태
변경은 safe summary와 secret scan을 근거로 하며 provider dashboard 사용량은 독립
대조하지 않았다. 반복 실행에서는 가능한 경우 추가 운영 증거로 남긴다.

## 남은 위험과 재검토 조건

Elice의 OpenAI 호환 범위, model alias, response schema, quota와 데이터 정책은 바뀔 수
있다. `store=false`가 수락돼도 proxy 미보관을 증명하지 않는다. strict schema 미지원,
정책 미확정, 예상 밖 token·응답 노출이나 사용량이 관찰되면 live를 중단하고 provider
선정과 Gateway 경계를 재검토한다.

Embedding을 제품 기능으로 쓰려면 사용자 가치, 품질 Eval, vector 저장·보존·삭제와 비용을
별도 Task에서 승인해야 한다. PP-038의 성공은 PP-009·PP-016·PP-029 구현 완료가 아니다.
