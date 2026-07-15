---
id: RUN-0002
title: Elice LLM Local Live 검증과 Token 교체
type: runbook
status: retired
date: 2026-07-14
owners:
  - placepick-team
related:
  - ../adr/ADR-0011-elice-chat-completions-provider-boundary.md
  - ../work-records/WI-0040-elice-llm-proxy-live-contract.md
  - ../troubleshooting/TS-0010-elice-live-no-http-response.md
  - ../troubleshooting/TS-0012-provider-response-metadata-compatibility.md
  - https://github.com/gdh0730/hub/issues/42
---

# RUN-0002 Elice LLM Local Live 검증과 Token 교체

> Provider별 canary 명령 제거로 이 절차는 종료됐다. Token 노출 시 Provider console에서
> 즉시 폐기·교체하고, 현재 직접 Live 검증은 PP-042의 검증된 절차를 따른다.

## 목적과 적용 조건

Elice OpenAI-compatible proxy의 Chat Completions strict schema와 Embedding 기본
capability를 합성 입력·최소 호출로 확인하고, token 노출·의심·교체에 대응하는 절차다.
일반 앱과 CI는 Mock만 사용하며 이 Runbook은 검토된 commit에서 사람이 승인한 Local
Live에만 적용한다.

Elice unit security·통합 계약·Live source compile과 실제 Chat·Embedding canary가
2026-07-14 모두 통과해 이 Runbook의 정상 경로를 검증했다. 명령 존재, Mock 통과,
실제 capability와 제품 runtime 활성화는 각각 다른 상태로 기록한다. `verified`는 정상
canary 경로만 뜻하며 token 노출 사고·교체 훈련이나 provider dashboard 대조 완료를
뜻하지 않는다.

## 사전 조건과 안전장치

- 실행할 SHA와 전체 diff, 특히 환경 parser·HTTP client·live test를 사람이 검토한다.
- token은 사용자가 로컬 편집기로 `.env.live.local`에 입력한다. 대화, shell command,
  Issue, PR, Git, 화면 캡처, JUnit report와 artifact에 복사하지 않는다.
- 전체 proxy URL에는 routing identifier가 포함되므로 token과 같은 민감 구성으로 다룬다.
- Chat과 Embedding base는 서로 다른 `https://mlapi.run/{canonical-uuid}/v1` 형태여야
  하며 userinfo, query, fragment, redirect와 다른 host·port를 허용하지 않는다.
- Chat model은 `openai/gpt-4.1-mini`, Embedding model은
  `openai/text-embedding-3-small`로 고정한다.
- 실제 사용자 문장, Naver 검색 결과, 장소명·주소·블로그 내용은 사용하지 않는다.
- Elice 정책 검토 전에는 합성 canary 외 전송, 응답·vector 저장과 runtime 연결을
  허용하지 않는다.
- `make check`와 일반 앱은 `.env.live.local`을 읽지 않아야 한다.

## 구성과 검증 절차

1. Elice 관리 화면에서 개발 전용 token과 Chat·Embedding endpoint가 활성 상태인지
   확인한다. 값 자체는 운영 기록에도 남기지 않는다.
2. Git에서 제외된 `.env.live.local`에 다음 Elice 변수만 로컬 편집기로 입력한다.

   ```dotenv
   PROXY_TOKEN=
   CHAT_PROXY_URL=
   EMBEDDING_PROXY_URL=
   OPENAI_MODEL=openai/gpt-4.1-mini
   OPENAI_EMBEDDING_MODEL=openai/text-embedding-3-small
   ```

   이 블록은 변수명 계약이며 문서나 example에 실제 값·routing UUID를 채우지 않는다.
   같은 파일의 Naver 값은 LLM 명령의 하위 프로세스에 전달되지 않아야 한다.
3. 파일이 Git 대상이 아닌지 확인한다.

   ```powershell
   git check-ignore -q .env.live.local
   git status --short -- .env.live.local
   ```

   두 번째 명령은 아무것도 출력하지 않아야 한다. 경로가 출력되면 live 실행을 중단한다.
4. 현재 SHA와 Mock 기반 전체 회귀를 먼저 확인한다.

   ```powershell
   git rev-parse HEAD
   make check
   ```

5. diff를 다시 확인한 뒤 전용 task를 정확히 한 번 실행한다.

   ```powershell
   make llm-live-contract
   ```

6. 성공 summary는 Chat 1회와 1초 간격 뒤 Embedding 1회, 총 application 논리 호출 수
   2만 보고해야 한다.
   Chat은 2xx·strict `{"status":"ok"}`·usage, Embedding은 2xx·data 한 건·index 0·
   1,536개의 finite number를 확인한다. token, 전체 URL, prompt, 응답 content와 vector가
   출력되면 성공 여부와 관계없이 노출 대응으로 이동한다.
7. 가능하면 provider 사용량이 의도한 두 호출과 일치하는지 사람이 추가 확인하고 실행
   SHA, 시각, endpoint별 성공 여부·안전한 count·latency만 Work Record에 남긴다.

## 2026-07-14 실행 증거

- 최초 전송 실패 뒤 capability별 transport와 no-retry·no-redirect 경계를 보강했다.
- 다음 진단 실행은 두 요청 모두 2xx를 받았지만 Chat·Embedding response model metadata가
  요청 alias와 다름을 안전한 stage로 확인했다. 실제 model 문자열과 body는 보존하지
  않았고 같은 코드로 반복 호출하지 않았다.
- 요청 model pin은 유지하고 공식 base alias와 승인된 Chat snapshot만 닫힌 목록으로
  허용했다. 무관한 model, 자유 JSON, refusal, incomplete, usage 오류와 잘못된 embedding
  차원은 계속 거부한다.
- 최종 SHA `e6190662c2382304f21c39bdb29375d1b1324733`, 시각
  2026-07-14T14:22:09.241Z에서 Chat은 2xx·strict schema·usage, input 69·output 5
  tokens·3207ms를 통과했다. Embedding은 2xx·item 1개·1,536 finite dimensions·input 8
  tokens·1067ms를 통과했다.
- application 논리 호출은 각 한 번, 합계 2회이고 report 10개는 token·전체 URL·본문·
  vector 안전 scan을 통과했다. provider dashboard의 wire 사용량은 독립 대조하지 않았다.

## 실패 분기

| 관찰 | 조치 |
| --- | --- |
| 실행 전 구성 거부 | unknown·duplicate·누락·placeholder, URL shape와 exact model만 확인하고 값을 출력하지 않는다. |
| 400 | request field와 Elice 호환 범위를 공식 계약과 대조하고 자동 fallback·재시도하지 않는다. |
| 401·403 | token·endpoint 연결 상태를 관리 화면에서 확인하고 token을 터미널에 출력하지 않는다. |
| 429 | 호출을 중단하고 quota·사용량을 확인한다. 자동 재시도하지 않는다. |
| 5xx·timeout | 외부 장애로 분류하고 원문 body 없이 시각·안전한 오류 code만 기록한다. |
| Chat strict schema 실패 | 자유 JSON·일반 텍스트·Responses API로 우회하지 않고 MVP Chat 계약 실패로 기록한다. |
| Embedding schema·차원 실패 | capability 실패로 기록하고 Chat 성공 여부와 분리한다. runtime에는 연결하지 않는다. |
| oversized·malformed 응답 | 원문을 저장하지 않고 안전한 합성 fixture로 parser 차이만 재현한다. |

실패 뒤 token을 붙인 임의 `curl`, endpoint 변경, 반복 실행으로 진단하지 않는다. 원인을
안전한 Mock fixture로 먼저 재현하고 호출 상한과 diff를 다시 검토한 뒤 사람이 재실행을
승인한다.

## 노출·교체 절차

1. token이나 전체 proxy URL이 대화, log, report, artifact, commit 또는 화면 공유에
   나타나면 즉시 모든 Elice live 실행을 중단한다.
2. Elice 관리 화면에서 기존 token을 폐기·교체하고 의도하지 않은 사용량을 확인한다.
3. 로컬 `.env.live.local`을 삭제하고 tracked diff와 Git 이력을 secret scanner로
   확인한다. Git 이력에 들어갔다면 삭제 commit만으로 해결됐다고 간주하지 않는다.
4. 노출 시각, 영향, 호출량과 조치만 비밀 없는 Troubleshooting 기록으로 남긴다.
5. 새 token과 endpoint를 로컬 파일에 다시 설정하고 사전 조건부터 재수행한다.

## 검증과 rollback

정상 완료는 자동 회귀 통과, Chat·Embedding application 호출 각 1회의 2xx·schema 통과,
출력과 보고서의 token·전체 URL·본문·vector 부재다. provider dashboard 대조는 가능한
경우 추가하며, 수행하지 않았으면 논리 호출 수와 no-retry transport까지만 증거로
주장하고 운영 사용량 확인이 남았음을 기록한다.
Chat만 성공하고 Embedding이 실패한 경우 Chat capability와 Embedding capability를
분리해 기록하며 PP-038 전체 완료로 처리하지 않는다.

Local Live는 DB나 runtime 구성을 변경하지 않는다. 의심 시 token 폐기와 로컬 파일
삭제가 보안 rollback이다. 실제 제품 데이터 전송과 배포 활성화는 이 Runbook의 성공만으로
허용되지 않으며 PP-009·PP-016·PP-029와 Elice 정책 검토가 필요하다.
