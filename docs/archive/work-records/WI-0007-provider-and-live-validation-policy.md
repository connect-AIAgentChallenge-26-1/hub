---
id: WI-0007
title: PP-005 Naver·Elice 실제 API 검증 정책
type: work-record
status: done
date: 2026-07-14
owners:
  - placepick-team
related:
  - ../roadmap.md
  - ../adr/ADR-0007-provider-and-live-boundary.md
  - ../adr/ADR-0009-mock-local-live-gateway-boundary.md
  - ../adr/ADR-0011-elice-chat-completions-provider-boundary.md
  - ../work-records/WI-0039-shared-fork-live-security-foundation.md
  - ../work-records/WI-0040-elice-llm-proxy-live-contract.md
paths:
  - docs/contracts.md
  - docs/development-environment.md
  - docs/architecture.md
  - docs/adr/ADR-0007-provider-and-live-boundary.md
  - docs/adr/ADR-0009-mock-local-live-gateway-boundary.md
  - docs/adr/ADR-0011-elice-chat-completions-provider-boundary.md
  - docs/runbooks/RUN-0001-naver-local-live-and-credential-rotation.md
  - docs/runbooks/RUN-0002-elice-llm-local-live-and-token-rotation.md
  - README.md
  - AGENTS.md
  - backend/AGENTS.md
---

# WI-0007 PP-005 Naver·Elice 실제 API 검증 정책

> GitHub Issue: [PP-005 #7](https://github.com/gdh0730/hub/issues/7)

## 문제와 근거

기존 환경은 Mock Naver와 Mock LLM으로 자동 회귀를 안전하게 실행하지만 실제 API
인증과 schema 호환성을 증명하지 못했다. 이를 해결하려고 원본 key를 GitHub
`staging-live` Environment에 두는 ADR-0007을 채택했으나, 공유 Fork 관리자가
workflow를 변경할 수 있어 사용자의 비밀 신뢰 경계 요구를 충족하지 못했다.

Mock을 제거하고 모든 개발을 실제 API로 바꾸면 테스트 결과가 외부 장애·quota·검색
변동에 종속되고 비용과 데이터 노출이 커진다. 문제는 Mock 자체가 아니라 자동 회귀,
현재 provider 호환성과 클라우드 배포를 하나의 `live 완료` 상태로 표현한 데 있다.

사용자가 대화에 게시한 Naver key는 안전한 비밀 채널을 벗어났다. 값은 문서에 다시
기록하지 않으며 교체 여부를 사람이 확인하기 전에는 실제 호출에 사용하지 않는다.

## 목적과 성공 기준

목적은 provider-neutral port를 유지하면서 Mock·Local Live·배포 Gateway의 책임과
증거를 독립적으로 확정하는 것이다.

- 장소·블로그 검색, 조건 추출과 추천 이유 생성을 application port로 정의하고
  Naver·Elice DTO가 domain 밖에 머문다.
- `local`, `test`, `load`와 필수 CI는 Mock만 사용하고 실제 host·credential이 있으면
  호출 전에 실패한다.
- Local Live는 일반 실행과 분리한 전용 task만 Git에서 제외된 로컬 credential을
  읽고 Naver Local·Blog 인증과 schema를 각각 한 번 확인한다.
- 배포 Live의 원본 key는 외부 Provider Gateway만 보유하고 GitHub Actions는
  Approval Gate에 OIDC token만 제시한다.
- 코드 자동 검증, 실제 Local Live와 클라우드 배포 상태를 각각 기록한다.
- Naver 결과 결합·영구 저장·Elice 전달은 Naver 약관과 Elice 데이터 정책 검토 전까지
  차단한다.

Naver live base는 `https://naverapihub.apigw.ntruss.com`, Local과 Blog 경로는 각각
`/search/v1/local`, `/search/v1/blog`다. 인증은 `X-NCP-APIGW-API-KEY-ID`와
`X-NCP-APIGW-API-KEY` header를 사용한다. 이 계약은 구현 시작일과 live 검증일에
공식 문서로 다시 확인한다.

## 범위, 비범위와 제약

범위는 provider port 책임, 환경별 credential·host 경계, timeout·오류·quota 정책,
Mock과 Local Live 분리, Approval Gate·Provider Gateway 설계, 약관 gate와 증거 상태다.
Naver Java adapter와 canary는 PP-013, 실제 추천 pipeline adapter는 PP-029, 배포 Live
E2E는 PP-033이 담당한다. Gate/Gateway foundation은 PP-037과 연결한다.

Cloudflare, Vercel, Render, Neon, Upstash의 실제 리소스·secret·배포와 실제 Elice
호출은 이번 정책 작업의 완료 범위가 아니다. 실제 key, token, 전체 proxy URL, 응답
전문, 개인정보, 검색어, 장소명·주소·링크를 문서·fixture·로그와 artifact에 남기지
않는다.

## 판단 기준과 대안

판단 기준은 테스트 결정론, 실제 drift 탐지, 별도 저장소 없는 비밀 격리, provider
교체 가능성, 비용·호출 상한, 데이터 최소화와 약관 준수다.

- 실제 API만 사용하면 현재성은 높지만 자동 회귀와 장애 재현성이 사라져 제외했다.
- Mock만 영구 사용하면 실제 인증·schema drift를 발견하지 못해 제외했다.
- 공유 Fork의 GitHub Environment secret은 workflow 수정 권한과 비밀 사용 권한을
  분리하지 못해 폐기했다.
- Local Live와 외부 Gateway를 분리하면 운영 요소는 늘지만 로컬 개발과 배포의 비밀
  소유자를 명확히 할 수 있어 선택했다.

MVP LLM 방향은 Elice OpenAI-compatible Chat Completions, strict JSON Schema,
exact model configuration, `stream=false`, `store=false`, tool 비활성화와 bounded
output이다. 직접 OpenAI Responses API는 자동 fallback이 아닌 재검토 대안으로 둔다.
Embedding은 합성 capability만 확인하고 별도 가치·품질·보존 결정 전 runtime에 쓰지
않는다. 실제 model과 상한은 구현 시점의 계약, Eval과 비용 검토 없이 자동 변경하지
않는다.

## 문제 해결 기록

1. 기존 코드·설정이 Mock만 허용하며 실제 Naver adapter와 live source set이 없음을
   확인했다.
2. 현행 NAVER API HUB host·Local·Blog 경로와 인증 header를 공식 문서에서 확인했다.
3. 공유 Fork 관리자 권한과 GitHub Environment를 신뢰 경계로 사용할 수 없는 요구를
   반영해 ADR-0007을 ADR-0009로 대체했다.
4. Mock 자동 회귀, 로컬 실제 계약, 배포 실제 계약을 서로 대신할 수 없는 증거로
   분리했다.
5. 대화에 노출된 key의 재사용을 금지하고 교체·사용량 확인·재검증을 RUN-0001로
   분리했다.
6. 무료 demo 후보의 sleep·Worker·SSE·DB·Redis 한계를 ADR-0010에 별도 기록했다.
7. 실제 사용 가능한 Elice proxy에 맞춰 Chat Completions를 MVP 방향으로, 직접 OpenAI
   Responses를 대안으로 정하고 Embedding runtime 미사용을 ADR-0011에 기록했다.
8. 2026-07-14 Naver Local·Blog canary가 모두 `INVALID_RESPONSE`로 실패한 사실을 Mock
   자동 검증과 분리해 기록했다.
9. 실패 stage와 합성 회귀를 먼저 추가한 뒤 Naver Local·Blog와 Elice Chat·Embedding을
   검토된 SHA에서 각각 한 번 재검증해 모두 2xx·schema 계약을 통과했다.

## 구현 결과와 검증 증거

정책 결정과 문서 정합성, 이를 강제하는 자동 검증 기반을 구현했다. 완료 상태를 다음
세 축으로 관리한다.

| 검증 축 | 현재 상태 | 완료 증거 |
| --- | --- | --- |
| 코드 자동 검증 | 완료 | `./gradlew check`, `npm run edge:check`의 74개 테스트·두 Wrangler dry-run, `npm run docs:check`, `npm run docs:test`와 Compose 검증 통과 |
| Naver Local Live | 완료 | 2026-07-14 Local·Blog 각 1회 2xx·schema, safe report scan 통과 |
| Elice Local Live | 완료 | 합성 Chat·Embedding 각 1회 2xx·strict schema·usage·1,536차원 통과 |
| 제품 LLM runtime | 미구현 | PP-009·PP-016·PP-029와 Elice 정책 검토 |
| 클라우드 배포 | 배포 안 됨 | Gate·Gateway 배포, 승인 SHA E2E, secret·비용·로그 사람 검토 |

Mock 정책과 기존 환경 안전장치가 구현됐다는 사실은 실제 Naver canary 성공을 뜻하지
않는다. Gate/Gateway 코드 테스트가 통과해도 Cloudflare에 배포된 것은 아니다. 실제
응답 전문이나 credential은 증거로 저장하지 않는다.

## AI 사용과 사람의 검증

AI는 저장소 탐색, 공식 문서 차이, 오류 분류, redaction·claim 음성 테스트와 문서
초안을 지원한다. 기억으로 제안된 endpoint, header, quota, model과 플랫폼 한도는
공식 출처 또는 실행 코드와 대조되지 않으면 채택하지 않는다.

사람은 노출 key 교체, Naver 약관, Elice 데이터 정책·비용·quota, 승인 actor·SHA, 외부 secret,
실제 Local Live와 클라우드 배포를 승인한다. 자동 테스트 결과를 실제 호출·약관·배포
증거로 승격하지 않는다.

## 남은 위험과 학습

외부 API, model, Elice 호환 범위, OIDC claim, 약관과 무료 플랫폼 정책은 저장소보다
먼저 바뀔 수 있다.
401·403, schema drift, 비정상 사용량이나 약관 변경이 감지되면 live 경로를 먼저
비활성화하고 Mock 회귀와 분리해 원인을 분석한다.

이 Work Record의 `done`은 정책·자동 강제 장치와 Local Live capability가 구현·검증됐다는
뜻이다. 제품 runtime, Naver 약관·Elice 데이터 정책과 cloud 배포는 별도 상태와 Task로
남아 있으므로 서비스 전체나 운영 가용성을 성과로 주장하지 않는다.
