---
id: WI-0039
title: PP-037 공유 Fork Live 신뢰 경계 기반
type: work-record
status: done
date: 2026-07-14
owners:
  - placepick-team
related:
  - ../roadmap.md
  - ../adr/ADR-0009-mock-local-live-gateway-boundary.md
  - ../adr/ADR-0010-free-demo-deployment-boundary.md
  - ../runbooks/RUN-0001-naver-local-live-and-credential-rotation.md
paths:
  - edge/**
  - .github/workflows/**
  - .gitignore
  - .env.live.local.example
  - Makefile
  - package.json
  - package-lock.json
  - README.md
  - AGENTS.md
  - backend/AGENTS.md
  - docs/**
---

# WI-0039 PP-037 공유 Fork Live 신뢰 경계 기반

> GitHub Issue: [PP-037 #40](https://github.com/gdh0730/hub/issues/40)

## 문제와 근거

Mock 전용 환경은 결정적이지만 실제 NAVER API HUB 인증·schema와 배포 경로를 검증하지
못한다. 실제 key를 공유 Fork의 GitHub Environment에 넣으면 workflow를 수정할 수 있는
관리자가 비밀을 사용하는 job도 변경할 수 있어 사용자의 신뢰 경계를 만족하지 못한다.
별도 저장소를 만들지 않으면서 Local Live 개발과 향후 무료 데모 배포를 안전하게
연결할 기반이 필요하다.

또한 사용자가 대화에 게시한 기존 key는 안전한 비밀 전달 경로를 벗어났다. 해당 값을
코드나 자동화에 복사하지 않고 교체를 선행 조건으로 만들어야 한다. 기술적 2xx가
Naver 결과 결합·저장·LLM 전달 권한을 의미하지 않으므로 약관 gate도 독립적으로
유지해야 한다.

## 목적과 성공 기준

목적은 Mock, Local Live, 배포 Gateway가 서로 다른 비밀·실행·증거 경계를 갖게 하고,
공유 Fork 관리자가 GitHub 권한만으로 원본 provider 또는 배포 secret을 획득하지 못하는
기반을 같은 monorepo에 만드는 것이다.

- 일반 CI는 실제 secret과 `id-token: write` 없이 Gate·Gateway의 claim, replay,
  allowlist와 redaction을 자동 검증한다.
- Approval Gate는 사용자 actor와 승인 SHA·workflow를 모두 검증하고 OIDC `jti`를 한 번만
  사용한다.
- Provider Gateway만 Naver 원본 key를 가지며 Local·Blog의 제한된 요청만 대신 보낸다.
- Local Live는 `.env.live.local`을 전용 task에서만 읽고 CI·일반 앱·부하 실행에서
  fail-closed한다.
- 코드 자동 검증, 실제 Local Live canary, 클라우드 배포를 별도 상태로 보고한다.
- Naver 약관 검토 전 결과 결합·영구 저장·LLM 전달은 차단한다.

## 범위, 비범위와 제약

범위는 `edge/`의 Gate·Gateway foundation, OIDC/JWT/replay·요청 allowlist 검증, 무비밀
CI 연결 계약, Local Live 정책, ADR·Runbook·roadmap과 무료 demo 목표 topology다.

Cloudflare Worker·Durable Object, Vercel, Render, Neon과 Upstash 리소스·secret 생성,
실제 edge 배포, GitHub release workflow, Elice live 연동과 production traffic은 포함하지
않는다. 이번 작업의 Gateway HTTP foundation은 고정 canary와 scope가 분리된 Naver
Local·Blog 검색 GET으로 제한한다. 임의 upstream·HTTP method·header·provider endpoint나
배포 명령을 받는 범용 proxy는 만들지 않으며, 운영용 token 발급과 경로 활성화는 후속
배포 검증 범위다.

## 판단 기준과 대안

판단 기준은 별도 저장소 없는 추적성, 공유 관리자와 원본 비밀의 분리, 최소 권한,
재현 가능한 승인, 무료 데모 가능성, 비용·데이터 상한과 실패 시 차단이다.

- GitHub secret 기반 배포는 단순하지만 workflow 수정 권한을 비밀 신뢰 경계에 포함해
  제외했다.
- 로컬 `.env`만으로 배포까지 처리하면 공유 관리자 위험은 피하지만 자동 배포의 승인과
  재현성이 약해 Local Live에만 한정한다.
- 사용자 소유 별도 저장소는 경계를 만들 수 있지만 저장소를 늘리지 않는 요구와 맞지
  않는다.
- 같은 monorepo의 검증된 Gate/Gateway와 외부 secret store 조합을 선택했다.

무료 데모는 Vercel Hobby, Render Free Singapore의 단일 `all` backend, Neon Free와
Upstash Free를 목표로 한다. 지속 Worker와 무료 compute의 충돌 때문에 이를 production
또는 상시 가용 환경으로 표현하지 않는다.

## 문제 해결 기록

1. 기존 ADR-0007의 GitHub Environment 경계가 공유 Fork 관리자 위험을 제거하지
   못한다는 점을 확인하고 ADR-0009로 대체했다.
2. 자동 회귀와 실제 호환성을 경쟁시키지 않도록 Mock·Local Live·배포 Live의 입력,
   호출 위치와 증거를 분리했다.
3. GitHub OIDC claim과 승인 SHA만으로는 replay·workflow 변조를 막기 부족해 actor,
   workflow hash와 일회성 `jti`까지 Gate 검증 항목으로 고정했다.
4. 무료 플랫폼의 sleep·Worker·SSE·DB·Redis 한도를 공식 문서로 비교하고 ADR-0010의
   데모 topology와 재검토 조건을 선택했다.
5. Naver key 노출 시 값 자체를 기록하지 않고 교체·사용량 확인·재검증만 남기는
   RUN-0001을 작성했다.

## 구현 결과와 검증 증거

신뢰 경계, 무료 demo 결정, 로컬 교체·검증 절차와 Issue 추적성을 반영했다. Gate,
Gateway와 Local Live harness의 코드 자동 검증도 완료했다. 2026-07-14 실제 Naver
Local·Blog는 metadata 호환 경계를 보강한 검토 SHA에서 각각 한 번의 2xx·schema를
통과했다. provider console의 wire 사용량은 독립 대조하지 않았고 Cloudflare 배포는
이 Work Record의 구현 완료와 분리한다.

증거를 다음 세 묶음으로 분리한다.

| 증거 | 현재 상태 | 완료 시 필요한 결과 |
| --- | --- | --- |
| 코드 자동 검증 | 완료 | `npm run edge:check`의 74개 테스트, 두 Worker Wrangler dry-run과 Node 24 clean install 통과 |
| 실제 Naver Local Live | 완료 | 2026-07-14 Local·Blog 각 1회 2xx·schema, 논리 호출 2회와 safe report scan 통과 |
| 클라우드 배포 | 배포 안 됨 | Gate·Gateway와 demo stack 배포, 승인 SHA E2E, secret·비용 검토 |

실제 Naver 응답, secret, 장소명·주소·링크는 검증 증거로 보존하지 않는다. Local Live
성공을 edge 배포 성공으로 승격하지 않고 실제 배포 전에는 cloud 상태를 완료로 표시하지
않는다.

## AI 사용과 사람의 검증

AI에는 저장소 탐색, 공식 플랫폼 문서 비교, Gate·Gateway와 음성 테스트 초안,
문서 정합성 검사를 위임했다. 기억에 의존한 endpoint·한도·claim은 공식 문서 또는
실행 코드와 대조되지 않으면 채택하지 않는다.

사람은 노출 key의 교체, Naver 약관·표시 의무, 사용자 actor·승인 SHA, Cloudflare와
배포 플랫폼 secret, 실제 Local Live·edge·demo 실행을 승인한다. 자동 테스트 통과만으로
실제 호출이나 약관 검토를 완료 처리하지 않는다.

## 남은 위험과 학습

Gate 자체가 배포되지 않은 동안에는 공유 Fork에서 안전한 자동 live 배포 경로가 없다.
로컬 live task도 검토되지 않은 code에서 실행하면 PC의 secret을 노출할 수 있다.
Cloudflare, GitHub OIDC claim, Naver 계약과 무료 플랫폼 정책은 변경될 수 있으므로
실제 배포 시작 시 공식 문서를 다시 확인해야 한다.

Mock이 애매함의 원인은 아니다. 하나의 상태가 자동 회귀, 실제 provider 호환성과
배포 성공을 모두 의미한다고 기록한 것이 문제였다. 세 증거를 분리하면 Mock은 빠르고
결정적인 회귀 검증을 담당하고, Local Live와 Gateway는 각각 현재 계약과 배포 신뢰를
증명한다.
