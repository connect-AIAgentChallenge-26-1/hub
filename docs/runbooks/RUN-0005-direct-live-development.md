---
id: RUN-0005
title: 직접 Provider 개발과 Live Playground
type: runbook
status: verified
date: 2026-07-16
owners:
  - placepick-team
related:
  - ../work-records/WI-0044-live-playground.md
  - ../adr/ADR-0014-mvp-direct-provider-and-simplified-trust-boundary.md
  - ../case-studies/CASE-0002-naver-elice-linked-live-user-flow.md
---

# RUN-0005 직접 Provider 개발과 Live Playground

## 사전 조건

- Docker Desktop과 Dev Container가 실행 중이다.
- Naver·Elice에서 교체한 현재 자격을 Git 제외 `.env.live.local`에 직접 입력했다.
- 실제 사용자·Provider 데이터의 처리 범위와 호출 비용을 담당자가 승인했다.

## Mock 실행

```bash
make setup
make dev
```

`http://localhost:3000`에서 제품 Mock 흐름, `/playground`에서 단계별 trace를 확인한다.
네트워크 오류·fallback을 검증할 때도 먼저 Mock 자동 테스트를 사용한다.

## 실제 개발 실행

```bash
make dev-live
```

Playground에서 자연어를 입력하고 추출 Draft를 검토·수정한 뒤 실행한다. 조건, Local 후보,
필터·완화, Blog 근거, 서버 점수·Top 3, Elice 문장과 evidence 검증 결과를 순서대로 확인한다.
원하지 않는 실행은 삭제 버튼으로 즉시 메모리에서 제거한다.

실제 동적 값을 출력하지 않고 동일한 화면 계약을 확인하려면 서버가 실행 중인 별도 Dev
Container 터미널에서 다음을 실행한다.

```bash
npm run test:e2e:live --workspace @placepick/frontend
```

이 수동 전용 Playwright 검증은 CI에서 실행을 거부하고 trace·screenshot·video를 생성하지
않는다. 성공 여부와 고정 계약 코드만 출력하며 마지막 단계에서 실행 결과와 연결 Draft를
삭제한다.

2026-07-16 실제 브라우저 검증에서는 추출 Draft의 유형 의미는 맞았지만 위치 표현을
확정 전에 사람이 정규화해야 했다. 보정 뒤 Naver evidence, 서버 Top 3, Elice 이유와
evidence 검증, 즉시 삭제까지 통과했다. 따라서 Draft는 Provider가 반환했다는 이유로 자동
확정하지 않고 화면에서 반드시 검토한다.

## 정식 제품 경로 로컬 검증

`make dev-live`가 실행 중일 때 별도 Dev Container 터미널에서 다음을 실행하면 실제 값을
출력하지 않고 same-origin 정식 `/api/v1/**` 전체 흐름을 검증할 수 있다.

```bash
PLACEPICK_PUBLIC_ORIGIN=http://127.0.0.1:3000 \
PLACEPICK_SMOKE_ALLOW_LOOPBACK=true \
node scripts/deployment-smoke.mjs
```

이 로컬 예외는 CI에서는 허용되지 않는다. smoke는 주최자와 참여자의 cookie jar를 분리하고
익명 세션, 조건 추출·확정, `202 + Location`, 추천 SSE와 Top 3, 방 생성,
`LIKE → DISLIKE → DELETE → LIKE`, 방 SSE, 주최자 확정과 참여자 결과 조회를 검사한다.
출력은 `DEPLOYMENT_SMOKE stage=<고정 단계> status=passed`와 최종 안전 요약으로 제한된다.

SSE 검증은 HTTP 200, `text/event-stream`과 body 연결 직후 mutation을 시작한다. Next
rewrite가 작은 초기 frame을 다음 event까지 보류해도 client와 mutation이 상호 대기하지
않게 하기 위함이다. 그와 별개로 첫 non-heartbeat 상태 event는 반드시 `snapshot`이어야
하고, 방 stream에서 `voteUpdated`와 `finalized`를 모두 받아야 성공한다. 2026-07-16 Mock과
실제 Provider 실행에서 이 흐름이 모두 통과했다.

반복 가능한 고정 증거가 필요하면 서버·프런트를 종료한 뒤 다음을 별도로 실행한다.

```bash
make live-evidence
```

이 명령은 고정 합성 시나리오만 사용하고 실제 값 대신 단계·호출 수·후보 수·검증 상태를
safe summary로 남긴다. 성공 판정은 각 시나리오가 `linked=true`, 장소 3개,
`degraded=false`, `reasonFallback=false`이고 종료 뒤 report secret scan이 통과하는 것이다.
2026-07-16 검증에서는 세 시나리오가 각각 7·6·6회 호출로 통과했다. 사용자 여정별 해석은
[CASE-0002](../case-studies/CASE-0002-naver-elice-linked-live-user-flow.md)를 확인한다.

## 중단과 복구

- 401·403: 자동 재시도하지 않고 해당 Provider console에서 자격 상태를 확인한다.
- 429: 호출을 중단하고 quota·비용 한도를 확인한다.
- 5xx·timeout: Mock 회귀가 통과하는지 확인한 뒤 Provider 상태를 분리 진단한다.
- schema·evidence 실패: 응답 원문을 문서나 Issue에 붙이지 말고 안정적인 오류 코드만 남긴다.
- 알려진 유형에 불필요한 `placeTypeDetail`이 있으면 서버 정규화가 적용되는지 확인한다.
  `OTHER` 세부 유형 누락은 정상 실패다.
- 누락 조건 warning은 Provider 문구가 아니라 서버가 조건에서 계산한 code를 기준으로
  판단한다.
- 이유 v2가 자연스러워도 같은 후보의 evidence만 인용하는지와 금지 속성이 없는지를
  서버 검증 결과로 판단한다. 하나라도 실패하면 batch 전체 fallback이 정상 동작이다.
- 자격 노출 의심: 즉시 Provider console에서 폐기·교체하고 `.env.live.local`과 브라우저
  session을 정리한다.

## 종료 확인

`Ctrl+C`로 프런트·백엔드를 종료하고 `make down`으로 인프라를 내린다. 일반 로그, Git diff,
JUnit report에 key·token·routing UUID·Provider 원문이 없는지 확인한다. 2026-07-16의
직접 Live Evidence, Live Playground 브라우저, 정식 제품 API 로컬 Live 흐름과 report
secret scan으로 이 절차를 검증했다. Cloud Demo의 secret 주입·배포·rollback은 이
Runbook이 아니라 RUN-0006의 `planned` 절차다.
