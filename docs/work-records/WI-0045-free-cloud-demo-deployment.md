---
id: WI-0045
title: PP-043 무료 클라우드 데모 배포
type: work-record
status: in-progress
date: 2026-07-16
owners:
  - placepick-team
related:
  - https://github.com/gdh0730/hub/issues/57
  - ../adr/ADR-0010-free-demo-deployment-boundary.md
  - ../adr/ADR-0014-mvp-direct-provider-and-simplified-trust-boundary.md
  - ../runbooks/RUN-0006-free-demo-deployment-and-rollback.md
paths:
  - .github/workflows/deploy-demo.yml
  - Dockerfile
  - frontend/**
  - render.yaml
  - scripts/build-images.sh
---

# WI-0045 PP-043 무료 클라우드 데모 배포

## 문제와 근거

로컬 검증만으로는 PC가 꺼진 뒤 사용자가 서비스를 이용할 수 없다. 현재 무료 플랫폼은
런타임·DB·Redis를 나눠야 하고, 공유 Fork에 Provider 원본 키를 두지 않으면서 같은 승인
SHA의 프런트와 백엔드를 배포해야 한다.

## 목적과 성공 기준

- Java 17 비root 운영 이미지와 Next.js production output을 재현 가능하게 빌드한다.
- Vercel·Render는 정확히 같은 수동 승인 `main` SHA를 보고한다.
- Naver·Elice·Neon·Upstash 자격은 Render에만 저장한다.
- 로컬 PC가 꺼져도 Vercel URL의 익명 세션→추천→투표→확정 흐름이 동작한다.
- 이전 정상 SHA의 재배포로 rollback할 수 있다.

## 범위, 비범위와 제약

저장소 범위는 image, Render Blueprint, Vercel build, GitHub 수동 배포 workflow와 smoke다.
실제 Cloud 계정·project·Environment secret은 소유자가 각 console에서 생성·입력해야 하며
Git에 기록하지 않는다. Render Free의 sleep·cold start를 SLA로 표현하지 않는다.

## 판단 기준과 대안

Vercel은 Next.js, Render는 지속 Java 프로세스, Neon은 30일 만료 없는 PostgreSQL,
Upstash native TLS는 Streams 사용 가능성을 기준으로 선택했다. Render 단일 `all` 역할은
무료 제약에 적합하지만 부하·가용성 요구가 생기면 API와 Worker를 분리한다.

## 문제 해결 기록

수동 `approved_sha`가 `origin/main` 이력인지 확인하고, 같은 detached commit에서 검증·image
build 후 Vercel prebuilt 배포와 Render hook을 실행하도록 구성했다. 두 배포의 build-info를
비교하고 실패 시 자동으로 다른 revision을 활성화하지 않는다.

독립 감사에서 workflow를 feature ref에서 dispatch할 수 있던 경계와 deployment tool 설치
단계까지 Vercel 식별자를 노출하던 범위를 수정했다. workflow 자체는 최신 `origin/main`에서
실행하되 rollback 대상은 과거 main SHA를 허용하고, Vercel·Render 자격은 필요한 step에만
주입한다. Render hook에 기존 `ref`·`imgURL`이 있으면 거부하고, hook과 모든 polling에는
명시적 timeout을 둔다.

배포 smoke는 class 초기화 전에 실행 객체를 생성해 시작조차 못 하는 JavaScript 초기화
순서 결함을 수정했다. 최초 cold start는 90초로 제한하고, Vercel external rewrite의 120초
제한 등으로 SSE가 끝나면 numeric cursor를 사용해 전체 timeout 안에서 다시 연결한다.
Neon wake-up에는 Flyway의 제한된 startup retry를 사용하고 Java heap은 Render Free
512MiB에서 native memory를 남기도록 65%로 조정했다.

production image 실행 감사에서는 Dockerfile의 `SERVER_PORT=8080` 환경 변수가 더 높은
우선순위로 `server.port`를 덮어써 Render가 주입한 `PORT`를 무시하는 결함도 확인했다.
Docker 환경 변수는 제거하고 공통 설정의 로컬 기본값 8080과 production의 `${PORT}` 우선
계약을 사용하도록 수정했다.

배포 smoke를 로컬 same-origin Next 경로와 실제 Provider runtime에 적용해 배포 전에 제품
여정 자체를 검증했다. 첫 시도에서 방 SSE transport는 HTTP 200으로 연결됐지만 smoke가
초기 작은 frame 수신 후에만 투표를 시작하도록 기다려 상호 대기했다. transport 연결
확인 직후 투표를 시작하도록 바꾸되 첫 상태 event `snapshot`, `voteUpdated`, `finalized`
검증을 유지했고, 수정 뒤 Mock과 실제 Provider에서 모두 전체 흐름이 통과했다.

## 구현 결과와 검증 증거

Java 17 production image build와 `USER 10001:10001`, Java 17 runtime을 확인했고 actionlint와
deployment smoke 구문·안전한 설정 실패 경로를 통과했다. Render Blueprint는 Docker,
Singapore, free, auto-deploy off 설정으로 파싱됨을 확인했다. 실제
Vercel·Render·Neon·Upstash 생성, secret 입력과 클라우드 E2E는 계정 설정 후 결과를
추가한다.

수정 image를 512MiB 제한과 production profile로 실행해 임의 `PORT=18080` bind,
PostgreSQL·Redis health `UP`, `/actuator/info`의 40자리 revision 일치, 비root UID/GID
`10001:10001`을 확인했다. 30초 종료 한도 안에서 SIGTERM 후 약 2초에 종료됐고 OOM kill은
발생하지 않았다. 이 검증은 로컬 PostgreSQL·Redis와 Mock Provider를 사용한 packaging
검증이며 Neon·Upstash·실제 Provider 또는 클라우드 배포 성공을 뜻하지 않는다.

실제 Provider를 사용하는 로컬 배포 smoke에서는 익명 세션, 실제 Elice 조건 추출,
사용자 확인 경계, `202 Accepted + Location`, PostgreSQL Outbox와 Redis Worker, 추천 SSE,
실제 Top 3, 방 생성, 별도 참여자 세션의 투표 생성·교체·삭제·재생성, 방 SSE, 주최자 확정과
참여자 결과 조회가 통과했다. 출력은 단계별 성공 코드만 남겼고 검색어, 장소, 응답 body,
Provider routing 정보와 자격은 기록하지 않았다. 이 결과는 배포 artifact가 사용할 정식
서비스 경로의 로컬 사전 검증이며 실제 Vercel·Render·Neon·Upstash 배포 증거는 아니다.

## AI 사용과 사람의 검증

AI에는 image·workflow·구성 초안과 자동 검증을 위임한다. 사람은 Cloud 계정, 비용 한도,
secret, Environment 승인, 실제 URL과 rollback을 직접 검토한다.

## 남은 위험과 학습

공유 Fork 관리자가 악성 코드를 승인·배포하면 Render 자격을 오용할 수 있다. MVP는 수동
SHA·Environment 승인·Provider 키의 GitHub 비저장으로 위험을 줄이되 완전 차단을 주장하지
않는다. Cloud 계정·project·Environment secret이 제공되지 않았으므로 WI-0045와 PP-043은
`in-progress`로 유지한다. 실제 URL의 cold start, 동일 revision, migration, rollback과
로컬 PC 종료 뒤 독립 실행을 검증해야 완료할 수 있다.
