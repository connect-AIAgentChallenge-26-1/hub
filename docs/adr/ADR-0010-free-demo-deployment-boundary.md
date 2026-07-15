---
id: ADR-0010
title: 무료 포트폴리오 데모 배포 경계
type: adr
status: accepted
date: 2026-07-14
owners:
  - placepick-team
related:
  - ../roadmap.md
  - ../work-records/WI-0043-repository-validation-documentation-simplification.md
  - ADR-0006-api-worker-outbox-events.md
  - ADR-0008-frontend-same-origin-boundary.md
  - ADR-0014-mvp-direct-provider-and-simplified-trust-boundary.md
---

# ADR-0010 무료 포트폴리오 데모 배포 경계

## 맥락과 문제

목표 구조는 Next.js, Java 17 Spring Boot API, 지속 Worker, SSE, PostgreSQL과 Redis
Streams를 사용한다. 사용자는 별도 저장소 없이 GitHub Actions와 Vercel 같은 무료
서비스로 포트폴리오 데모를 배포하고 싶다. 그러나 무료 web compute는 scale-to-zero를
사용하고 무료 전용 background worker를 제공하지 않는 경우가 많다. 무료 데모의
제약을 production 가용성으로 오인하지 않는 플랫폼 경계가 필요하다.

## 판단 기준과 검토 대안

기준은 Java 17 container 실행, 한국 사용자 지연, SSE, 단일 저장소, 무료 한도,
Redis Streams, secret 격리와 유료 전환 시 재설계 비용이다.

- Vercel은 Next.js와 새 Java container 배포가 가능하지만 container가 무트래픽 후
  scale-down되므로 지속 Redis consumer의 실행 위치로 사용하지 않는다.
- Render Free는 Java container를 실행할 수 있지만 무료 background worker가 없고
  idle sleep이 있어 API와 Worker를 항상 분리할 수 없다.
- Koyeb Free도 Java를 지원하지만 Worker Service를 허용하지 않고 무료 지역이
  Frankfurt와 Washington으로 제한된다.
- Cloud Run은 API·SSE와 Worker pool을 지원하지만 한 달 내내 실행하는 Worker는 무료
  사용량을 넘어설 수 있어 완전 무료 목표와 맞지 않는다.

## 결정

향후 포트폴리오 데모의 기본 조합은 다음과 같다.

| 책임 | 서비스 | 선택 이유와 제약 |
| --- | --- | --- |
| Next.js 프런트 | Vercel Hobby | 개인·비상업 데모, same-origin proxy와 preview |
| Java API·Worker | Render Free Singapore | Java container 한 개의 `all` 역할, idle sleep 수용 |
| PostgreSQL | Neon Free | 작은 데모 DB와 scale-to-zero |
| Redis Streams | Upstash Free | 영속 Redis 호환 저장소와 Streams 지원 |
| Provider 비밀 | Render secret store | 프런트·Git·GitHub Actions에 원본 자격 미전달 |

GitHub Actions는 수동 dispatch와 보호된 `main`의 검토된 SHA만 배포한다. Provider key와
Elice token·routing URL은 GitHub repository·Environment secret에 두지 않고 Render runtime
secret store에만 둔다. GitHub에는 Vercel·Render 배포에 필요한 최소 scope credential만
두며 environment approval, 사용량 audit와 rotation을 적용한다. 브라우저 bundle과 Vercel
프런트에는 Provider 자격을 전달하지 않는다.

Vercel·Render의 임의 branch production 배포는 비활성화한다. 배포 결과의 commit SHA와
health를 확인하고 이전 정상 배포로 rollback할 수 있어야 한다. 더 강한 관리자 격리가
필요해지면 [ADR-0014](ADR-0014-mvp-direct-provider-and-simplified-trust-boundary.md)의
재검토 조건에 따라 workload identity 또는 외부 배포 계정을 도입한다.

Render Free의 무료 web service는 512MB RAM과 0.1 CPU이며 15분 동안 요청이 없으면
sleep하고 다음 요청의 기동에 약 1분이 걸릴 수 있다. 무료 background worker가 없으므로
데모에서만 동일 Java artifact의 `all` 역할을 사용한다. 이는 ADR-0006의 단일 artifact
역할 모델을 사용하지만 API와 Worker를 분리하는 상시 운영 배포의 대체물이 아니다.
[Render 무료 제한](https://render.com/docs/free)과
[Render 지역](https://render.com/docs/regions)을 배포 시점에 다시 확인한다.

Vercel 프런트는 브라우저의 `/api`와 SSE를 Render backend로 proxy해 ADR-0008의
same-origin cookie·CSRF 경계를 유지한다. Vercel의 proxy·function 시간 제한 때문에
SSE 연결은 끊길 수 있으며 기존 `Last-Event-ID`와 snapshot-first 재연결 계약으로
복구한다. 실제 배포에서 연결 시간, buffering과 cookie를 검증하기 전에는 SSE 배포
완료를 주장하지 않는다. Vercel Hobby는 개인·비상업 프로젝트 용도이므로 서비스가
상업화되면 계획을 다시 선택한다. [Vercel Container Images](https://vercel.com/docs/functions/container-images),
[Vercel Hobby](https://vercel.com/docs/plans/hobby)

Neon·Upstash는 무료 한도를 초과하거나 정책이 변경되면 중단될 수 있다. 현재 공개
기준은 Neon 프로젝트당 0.5GB와 월 100 CU-hour, Upstash Redis 256MB·월 500,000
command·10GB bandwidth다. Upstash REST는 blocking `XREAD`·`XREADGROUP`을 지원하지
않으므로 Worker의 Streams consumer는 TLS Redis protocol을 사용한다.
[Neon 가격](https://neon.com/pricing), [Upstash 가격](https://upstash.com/pricing/redis),
[Upstash REST 호환성](https://upstash.com/docs/redis/features/restapi)

현재 결정만으로 네 클라우드의 계정, 프로젝트, secret과 DB가 생성되거나 배포된 것은
아니다. PP-043에서 정확한 SHA, 최소 권한 secret, 대표 E2E와 rollback을 실제로 검증한다.

## 결과와 트레이드오프

무료 서비스만으로 전체 사용자 여정을 공개 시연할 경로와 비용 상승 시 교체 지점이
명확해진다. Render Singapore를 선택해 무료 Koyeb 지역보다 한국 사용자와 가까운
backend를 우선한다. 외부 관리형 DB·Redis 때문에 네트워크 지연과 연결 제한을 함께
측정해야 한다.

반면 cold start 동안 사용자가 기다릴 수 있고 sleep 중 Worker는 queue를 자발적으로
처리하지 못한다. 단일 `all` process 장애는 API와 Worker를 함께 중단한다. 이 구성은
포트폴리오 데모이며 상시 운영, 무중단, 처리량 또는 SLA를 보장하지 않는다.

## 검증과 재검토 조건

PP-035에서 Java 17 image의 512MB 제한 기동, Flyway, Neon 연결, Upstash Streams
claim·ACK·복구, Render sleep 전후 Job 처리와 Vercel 경유 SSE 재연결을 검증한다.
실제 배포 전후 비용·사용량과 각 플랫폼의 최신 무료 정책을 다시 기록한다.

무료 한도로 대표 E2E를 안정적으로 완료하지 못하거나 상시 처리, 상업 이용, 다중
instance 또는 SLA가 필요해지면 Render 유료 Worker·Cloud Run worker pool 등 지속
compute로 전환하고 API/Worker 역할을 분리한다. 아직 실제 edge·demo 배포 성공 증거는
없다.
