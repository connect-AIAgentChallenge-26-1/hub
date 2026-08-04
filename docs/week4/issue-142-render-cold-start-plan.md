# 오늘 할 일 — Render 무료 플랜 콜드스타트 대응 (이슈 #142)

> 작성일: 2026-08-05 (수) · 대상 이슈: [#142 Render 무료 플랜 콜드스타트 대응 방안 검토](https://github.com/syd348/hub/issues/142)

## 오늘의 목표 (한 줄)

**GitHub Actions 크론으로 `/api/health`를 주기적으로 호출해 Render 무료 플랜 서버가 슬립되지 않게 한다.**

## 현재 상태 (전환 전)

- `render.yaml`: `hub-server`를 Render 무료 웹 서비스(`plan: free`)로 배포, `healthCheckPath: /api/health`.
  실제 배포 URL은 `hub-server-vers.onrender.com`.
- `.github/workflows/crawler.yml`: 매일 00:00 UTC 1회만 실행 — 크론이 서버 헬스체크를 호출하지
  않고(크롤러는 Supabase에 직접 쓰기 때문), 실행 빈도도 하루 1번이라 슬립 방지에 부족하다.
- Render 무료 플랜은 약 15분 유휴 시 슬립되며, 슬립 후 첫 요청에서 수십 초 콜드스타트 지연이
  발생한다.
- 현재(작성 시점) `curl -w "%{time_total}"`로 직접 확인한 결과 `hub-server-vers.onrender.com/api/health`는
  0.26초로 응답 — 즉 지금은 서버가 깨어있는 상태(콜드스타트 재현 안 됨). 워크플로우 배포 후
  충분한 유휴 시간(15분+)이 지나야 슬립 상태 진입 여부를 실측할 수 있다.

## 범위

### 포함 (오늘)

- 새 GitHub Actions 워크플로우 `.github/workflows/keep-alive.yml` 추가:
  - `schedule` cron (10분 간격) + `workflow_dispatch` 수동 트리거
  - `curl`로 `https://hub-server-vers.onrender.com/api/health` 호출, 실패 시 워크플로우 실패
    처리(상태 코드 체크)
- `workflow_dispatch`로 수동 실행해 성공 여부 확인 (`gh workflow run` → `gh run watch`)
- 가능하면 콜드스타트 전/후 응답 지연 실측 비교

### 제외 (오늘 아님)

- 유료 플랜 전환 — 비용 발생, 사용자 결정 필요 사안이라 이슈 #142 범위에서 제외 (이슈 본문에서도
  "결정한 방식 적용"은 크론 핑으로 확정됨).
- 외부 헬스체크 서비스(UptimeRobot 등) 연동 — 외부 계정 가입이 필요해 에이전트가 직접 수행 불가.
- 캠퍼스 레포(`connect-AIAgentChallenge-26-1/hub`) 동기화 — `AGENTS.md` 7번 규칙에 따라
  `.github/` 변경은 캠퍼스 PR에 포함하지 않으므로 이번 작업은 `syd348/hub`에만 적용.

## 실행 순서

### 묶음 1 — keep-alive 워크플로우 추가 (15분)
- [ ] `.github/workflows/keep-alive.yml` 작성: schedule cron `*/10 * * * *` + `workflow_dispatch`,
      `curl -sf`로 `/api/health` 호출 (실패 시 non-zero exit → 워크플로우 실패로 알림 가능)
- [ ] `npm run lint` 확인 (yml만 추가하는 작업이라 영향 없을 것으로 예상되나 재확인)

### 묶음 2 — 검증 (10분)
- [ ] `git push`로 브랜치 원격에 올린 뒤 `gh workflow run keep-alive.yml --repo syd348/hub`로
      수동 실행 트리거
- [ ] `gh run list --workflow=keep-alive.yml`/`gh run watch`로 성공(success) 확인
- [ ] `curl -s -o /dev/null -w "%{time_total}"`로 헬스체크 URL 직접 호출해 정상 응답 확인
      (콜드스타트 재현 여부는 배포 후 자연 경과 시간에 의존 — 재현 안 되면 워크플로우 성공
      여부로 대체 검증)

## 완료 기준

- [x] 옵션 중 방향 결정 (크론 핑 방식 — 사용자 지시로 확정됨, 재검토 불필요)
- [ ] `.github/workflows/keep-alive.yml` 추가 — schedule cron + workflow_dispatch, curl 헬스체크
- [ ] 워크플로우 수동 실행 성공 확인 + 헬스체크 응답 실측

## 리스크 / 결정 필요

| 항목 | 내용 | 기본 방침 |
|------|------|-----------|
| 크론 간격 | GitHub Actions `schedule` 최소 간격은 5분, Render 무료 플랜 슬립 기준은 통상 15분 유휴 | 10분 간격(`*/10 * * * *`)으로 설정 — 슬립 기준보다 충분히 짧고, GitHub Actions 크론 지연(예약 대비 수 분 밀릴 수 있음) 여유도 확보 |
| GitHub Actions 크론 정시성 | GitHub 공식 문서상 `schedule` 이벤트는 정확한 시각 보장이 없고 부하 시 지연될 수 있음 | 10분 간격이면 다소 지연되어도 15분 슬립 기준 내에 들어올 가능성이 높음 — 완벽한 보장은 아니므로 이슈에 한계로 명시 |
| 콜드스타트 실측 재현 | 작성 시점에 서버가 이미 깨어있어 콜드스타트를 바로 재현하기 어려움 | 워크플로우 배포·수동 실행 성공을 1차 검증으로 삼고, 가능하면 유휴 후 재확인 |

## 오늘 끝나면 다음 (참고)

- 없음 (이슈 #142는 이 작업으로 완료)
