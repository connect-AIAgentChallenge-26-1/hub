---
id: RUN-0006
title: 무료 데모 배포와 이전 SHA 롤백
type: runbook
status: draft
date: 2026-07-16
owners:
  - placepick-team
related:
  - ../work-records/WI-0045-free-cloud-demo-deployment.md
  - ../adr/ADR-0010-free-demo-deployment-boundary.md
---

# RUN-0006 무료 데모 배포와 이전 SHA 롤백

## 최초 준비

1. Neon에서 같은 DB·role을 사용하는 두 JDBC URL을 준비한다. 애플리케이션용
   `SPRING_DATASOURCE_URL`은 `jdbc:postgresql://...-pooler.../...?sslmode=require`, migration용
   `SPRING_FLYWAY_URL`은 `jdbc:postgresql://...neon.tech/...?...sslmode=require` 형태의 direct
   URL이어야 한다. username과 password는 URL에 중복 삽입하지 않고 별도 Render 변수로
   입력한다.
2. Upstash의 native Redis protocol TLS URL을
   `SPRING_DATA_REDIS_URL=rediss://default:<password>@<endpoint>:<port>` 형태로 준비한다.
   REST URL·REST token은 Redis Streams Worker 연결에 사용하지 않는다.
3. Render Free web service를 `render.yaml`로 만들고 Provider·DB·Redis 자격을 Render에만
   입력한다.
4. Vercel Hobby project를 `frontend/`에 연결하고 Git 자동 배포를 끈다. workflow는
   repository variable `RENDER_PUBLIC_URL`을 server-only `BACKEND_ORIGIN`으로 전달한다.
5. GitHub `production` Environment에 `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
   `VERCEL_PROJECT_ID`, `RENDER_DEPLOY_HOOK_URL`만 secret으로 넣고 배포 승인을 설정한다.
   Render hook에는 console이 발급한 원본 URL만 저장하고 `ref`나 `imgURL`을 미리 붙이지
   않는다.
6. repository variable에 `VERCEL_PRODUCTION_URL`, `RENDER_PUBLIC_URL`을 넣는다.

## 배포

1. 배포할 40자리 SHA가 `main`에 포함됐고 diff·workflow가 검토됐는지 확인한다. 배포
   workflow 자체는 Actions 화면에서 반드시 최신 `main` ref를 선택한다. 이전 정상 SHA
   rollback도 workflow는 최신 `main`에서 실행하고 `approved_sha`만 이전 SHA로 지정한다.
2. Actions의 `Deploy portfolio demo`를 수동 실행하고 `approved_sha`에 소문자 40자리 SHA를
   정확히 넣는다. 실행 중 `main`이 전진하면 안전하게 실패하므로 새 실행을 시작한다.
3. production Environment 배포를 승인한다.
4. 검증, Vercel prebuilt 배포, Render hook, Render와 Vercel production alias의 build-info
   SHA, smoke가 모두 성공할 때까지 기다린다. Render cold start는 최대 약 20분 polling
   범위 안에서만 기다린다.
5. Smoke는 안정된 `VERCEL_PRODUCTION_URL`에서 브라우저와 같은 `Origin`을 보내고 익명
   세션→조건 확인→추천 SSE→결과→두 세션 투표 변경·삭제→최종 확정을 확인한다.
   최초 API는 90초 안에서 502·503·504와 일시 transport 실패만 제한적으로 다시 시도한다.
   SSE가 Vercel proxy 제한이나 네트워크로 끊기면 마지막 numeric event ID를
   `Last-Event-ID`로 보내고 전체 단계 timeout 안에서 재연결한다.

Vercel의 외부 origin rewrite는 요청당 최대 120초 제한이 있으므로 장시간 SSE 연결은
끊길 수 있다. 클라이언트는 EventSource 재연결과 최신 GET snapshot으로 복구하며, 이
동작은 연결이 영구 유지된다는 SLA가 아니다. [Vercel proxied request 제한](https://vercel.com/docs/limits#proxied-request-timeout)

Render는 기동 중 Flyway direct 연결을 5초 간격으로 최대 6회 다시 시도한다. 이는 무료
DB의 일시적인 wake-up을 흡수하기 위한 startup 경계이며 migration 실패나 잘못된 자격을
우회하지 않는다. 컨테이너는 512MiB 안에서 native memory 여유를 남기도록 Java heap
상한을 65%로 두고, Render의 30초 종료 한도 안에서 Spring graceful shutdown 25초를
사용한다.

## 롤백

DB migration이 이전 코드와 호환되는지 확인한 뒤 마지막 정상 `main` SHA로 같은 workflow를
다시 실행한다. 임의 브랜치나 Vercel·Render UI의 서로 다른 revision을 각각 배포하지
않는다. migration은 자동 down하지 않고 expand/contract 후속 migration으로 복구한다.

## 사고 대응

배포 SHA 불일치나 자격 노출 의심 시 Vercel token과 Render hook을 폐기하고, Render의
Naver·Elice 자격도 교체한다. 자동 배포가 켜졌다면 즉시 끄고 Actions·Render audit를
확인한다. 실제 배포·롤백이 검증되기 전에는 이 Runbook을 `verified`로 표시하지 않는다.
