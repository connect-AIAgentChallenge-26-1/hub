# 오늘 할 일 — PR마다 test/lint 자동 실행하는 CI 파이프라인 추가 (이슈 #137)

> 작성일: 2026-08-05 (수) · 대상 이슈: [#137 PR마다 test/lint 자동 실행하는 CI 파이프라인 추가](https://github.com/syd348/hub/issues/137)

## 오늘의 목표 (한 줄)

**PR 생성/업데이트 시 `npm test` → `npm run lint`를 자동 실행하는 GitHub Actions 워크플로우를 추가해, 검증 없이 머지되는 상태를 막는다.**

## 현재 상태 (전환 전)

- `.github/workflows/`에는 `crawler.yml`(cron 크롤링)과 `deploy-pages.yml`(push to main 시 배포)만 있음 — `pull_request` 트리거 워크플로우가 전혀 없다.
- 두 기존 워크플로우 모두 `actions/setup-node@v4` + `node-version: 24` + `cache: npm` 패턴을 쓴다.
- 루트 `package.json`: `npm test` = `vitest run` (client/server/crawler 전체), `npm run lint` = `oxlint && npm run lint -w @hub/server && npm run lint -w @hub/crawler`.
- `server/src/db/supabase.ts`, `crawler/src/supabase.ts`는 모듈 로드 시점에 `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`가 없으면 즉시 throw. `crawler/src/env.ts`도 `BIZINFO_API_KEY`/`GEMINI_API_KEY` 없으면 throw.
- 로컬에서 env 변수 없이 `npm test` 실행 결과(worktree에서 `env -i`로 실측, 2026-08-05):
  - **19/20 테스트 파일 통과, `server/src/routes/subsidies.test.ts` 1개만 실패.**
  - 원인: `subsidies.test.ts`는 `../db/subsidies-repo.js`만 `vi.mock`하는데, import하는 `app.js`가 `routes/match.ts` → `db/match-requests-repo.ts` → `db/supabase.ts`로 이어지는 체인을 함께 로드한다. 이 체인은 `subsidies.test.ts`에서 mock되지 않아 실제 `supabase.ts`가 로드되며 throw한다.
  - `bizinfo-client.test.ts`/`gemini-extract.test.ts` 등 `env.ts`에 의존하는 크롤러 테스트는 이미 `vi.mock('./env.js', ...)`로 자체 mock하고 있어 env 변수 없이도 통과함(추가 조치 불필요).
  - 더미 `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`만 프로세스 env로 넣으면 **20/20 테스트 파일, 198개 테스트 전부 통과** 확인(`createClient`가 URL 형식만 검사하고 실제 네트워크 호출은 mock된 repo 레이어가 가로채 발생하지 않음).
- `npm run lint`는 현재 clean (에러 0).

## 범위

### 포함 (오늘)

- `.github/workflows/ci.yml` 신규 추가
  - 트리거: `pull_request` (모든 브랜치 대상 — main 브랜치 정체성 관련 결정 불필요, PR이면 항상 실행)
  - `actions/checkout@v4` → `actions/setup-node@v4`(`node-version: 24`, `cache: npm`) → `npm ci` → `npm test` → `npm run lint`
  - `npm test` 단계에 더미 `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` 환경변수 설정(실제 시크릿 아님, `subsidies.test.ts`의 모듈 로드 시점 throw 회피용)
- worktree에서 `.env` 복사 후 로컬 `npm test`/`npm run lint` 재확인(CI 재현용, 커밋 대상 아님)

### 제외 (오늘 아님)

- `subsidies.test.ts`가 `match-requests-repo.js`까지 mock하도록 테스트 자체를 고치는 것 — CI가 더미 env로 우회 가능하니 이번 이슈 범위 밖. 필요하면 별도 이슈로 등록.
- pre-commit/pre-push 훅에 test/lint 게이트 추가 — 이슈 본문 목표는 PR 파이프라인이지 로컬 훅이 아님.
- 대상 브랜치를 `main`이 아닌 다른 브랜치로 제한하는 것 — 이슈 본문의 "main 브랜치 정체 확인 이슈에 종속" 우려는 현재 `syd348/hub`의 `main`이 실제 운영 브랜치임이 최근 커밋(`Merge pull request #144`)으로 확인되어 해소됨. 트리거를 특정 base 브랜치로 좁히지 않고 모든 PR에 적용.
- 커버리지 리포트, 캐시 최적화, matrix 빌드 등 CI 고도화 — 최소 요구사항(test+lint 게이트)만 충족.

## 실행 순서

### 묶음 1 — `.github/workflows/ci.yml` 작성 및 로컬 검증 (20분)

- [ ] `crawler.yml` 패턴을 따라 `ci.yml` 작성 (`pull_request` 트리거, node 24, npm ci)
- [ ] `npm test` step에 더미 Supabase env var 추가
- [ ] `npm run lint` step 추가
- [ ] worktree에 `.env` 복사 후 `npm test`/`npm run lint` 로컬 재확인
- [ ] `env -i`로 CI와 동일한 무env 조건 재현해 더미 값만으로 통과하는지 재확인

## 완료 기준

- [ ] `.github/workflows/ci.yml` 추가 — `pull_request` 트리거, `npm ci` → `npm test` → `npm run lint` 순서
- [ ] 대상 브랜치 확정 — 모든 PR 대상으로 적용(범위 제외 항목 참고, main이 실제 운영 브랜치임을 확인했으므로 별도 제한 불필요)
- [ ] 실패 시 PR에 상태 표시되는지 확인 — GitHub Actions는 `pull_request` 트리거 워크플로우를 PR checks에 자동 노출하므로 별도 설정 없이 충족(PR 생성 후 Checks 탭에서 실제 확인)

## 리스크 / 결정 필요

| 항목 | 내용 | 기본 방침 |
|------|------|-----------|
| 더미 Supabase 값 vs 테스트 mock 보강 | `subsidies.test.ts`가 `match-requests-repo`를 안 거치도록 고치는 게 더 근본적이지만 범위가 커짐 | 이번 이슈는 CI 추가가 목적이므로 더미 env로 우회, 테스트 보강은 후속 이슈로 분리 |
| BIZINFO_API_KEY/GEMINI_API_KEY 더미값 필요 여부 | 실측 결과 이 두 값에 의존하는 테스트는 이미 `vi.mock('./env.js')`로 자체 격리됨 | CI에 추가하지 않음(불필요한 env 노출 최소화) |
| PR 트리거 대상 브랜치 제한 여부 | 이슈 본문은 "main 브랜치 정체" 우려를 언급하나 이미 해소됨(#135 PR #144로 워크플로우 복원 확인) | 모든 `pull_request`에 적용, 브랜치 필터 생략 |

## 오늘 끝나면 다음 (참고)

- 이번 조사에서 드러난 `subsidies.test.ts`의 mock 범위 부족(모듈 로드 체인 전체를 안 덮음)은 테스트 안정성 관점에서 별도 이슈로 등록할 만함 — 사용자와 상의 후 결정.
