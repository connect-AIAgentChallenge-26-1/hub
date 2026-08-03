# AGENTS — 작업 가이드

에이전트·개발자용 실행 규칙. 제품 맥락은 [`CONTEXT.md`](CONTEXT.md), 문서 지도는
[`README.md`](README.md) 먼저 참고. 코드 작업 전 `CONTEXT.md`와 `docs/plan.md`를 먼저 읽을 것.

## 작업 유형별 확인할 것

| 작업 유형 | 먼저 확인할 것 |
|---|---|
| UI 작업 | `.cursor/skills/gov-subsidy-design/SKILL.md` 로드, 수정 시 `design-tokens.md`/`screens.md` 동기화 |
| 기능 범위 판단 | `docs/plan.md`의 "MVP 범위" — 구현할지 말지 애매하면 여기부터 |
| 공유 타입 변경 | `shared/`부터 수정 → client/server 반영 |
| GitHub 이슈 작업(계획→구현→검증→커밋→PR) | `issue-workflow` Skill 사용 |
| 크롤러 작업 | `docs/week3_plan.md` + `docs/week3/*.md`, 응답 필드는 실제 API로 재확인(문서 추정치 믿지 말 것) |
| DB 스키마 변경 | `supabase/schema.sql` + `server/src/db/mappers.ts` 함께 갱신 |
| 문서 작성/갱신 | 아래 "문서 일관성 원칙" 반드시 준수 |

## 문서 일관성 원칙 (중복 방지)

- **사실 종류별 유일한 소스를 지킨다** — 다른 문서에서 언급할 땐 링크만, 재서술 금지.
  이슈 상태 → `docs/weekN_plan.md` / 제품 범위 → `docs/plan.md` / 구현 세부 → 해당
  `docs/weekN/dayN-*.md` / 회고 → `docs/weekN/retrospective.md`.
- **히스토리 로그**(day-N 계획·검증 문서)는 한 번 쓰고 끝 — 이후 바뀌어도 본문을 고치지 않고
  "작성 시점" 주석 + 최신 문서 링크만 추가한다.
- **살아있는 문서**(`weekN_plan.md`, `plan.md`, `CONTEXT.md`, `AGENTS.md`)는 항상 최신 유지 —
  이슈 끝날 때마다 한 줄만 갱신.
- 초안은 최종본이 나오면 즉시 삭제 ("나중에 정리" 미루지 않기).
- 결정 필요 사항은 `docs/weekN_plan.md`의 리스크 표에만 둔다 — `CONTEXT.md`/`AGENTS.md`엔 최소
  잔여 항목만 (자세한 건 위 문서 일관성 원칙 참고).

## 디렉토리 구조

```
hub/
├── src/                    # React 클라이언트 (Vite)
│   └── prototype/          # HTML 와이어프레임 (수정 시 Skill도 갱신)
├── server/                 # Express API
├── shared/                 # 프론트·백 공유 타입
├── crawler/                # 기업마당 크롤러 (Week 3 구축 완료)
├── supabase/schema.sql     # DB 스키마
├── docs/                   # 기획·주차별 계획/회고/검증 문서
│   └── exhibition/         # 부스 전시 자료 (posters/monitor/final)
├── showcase/               # 캠퍼스 챌린지 쇼케이스 등록용 (thumbnail/screenshots/showcase.json)
├── .github/workflows/      # crawler.yml (cron)
├── CONTEXT.md / AGENTS.md  # 제품 맥락 / 작업 가이드 (CLAUDE.md는 AGENTS.md 심볼릭 링크)
└── package.json            # workspaces: server, shared, crawler
```

## 로컬 개발

```bash
npm install
cp .env.example .env        # server/ 에서 dotenv 로드
npm run dev                 # client + server 동시 실행
```

- 클라이언트 API 호출: `/api/*` → Vite proxy → `http://localhost:3001`
- 헬스체크: `GET /api/health`
- 크롤러 수동 실행: `npm run run -w @hub/crawler`

## 테스트

- `npm test` — Vitest (`src/**/*.test.ts`, `server/src/**/*.test.ts`, `crawler/src/**/*.test.ts`)
- 경계값·404·잘못된 입력 등 **엣지 케이스** 위주로 작성 (해피패스는 최소한만)
- 서버 라우트 테스트는 `vi.mock`으로 repo/데이터 레이어 대체 (DB/네트워크 의존 제거)

## API 설계

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/health` | 상태 확인 |
| GET | `/api/subsidies` | 목록 (query: sort) |
| GET | `/api/subsidies/:id` | 상세 |
| POST | `/api/match` | 온보딩 프로필 기준 매칭 + 정렬, `match_requests`에 조건 저장 |

조건 필터(업종/지역)는 스키마에 구조화 컬럼이 없어 아직 정렬 위주로만 동작 — 매칭 알고리즘은
후속 이슈 범위.

## 코딩 컨벤션

### 일반
- **언어**: 코드·변수·주석은 영어, **UI 카피는 한국어** (와이어프레임 문구 유지)
- **TypeScript strict** — `any` 지양, 공유 타입은 `shared/`에 정의
- **포맷**: oxlint (`npm run lint`)

### 파일·네이밍

| 대상 | 규칙 | 예 |
|------|------|-----|
| React 컴포넌트 | PascalCase | `SubsidyCard.tsx` |
| hooks | camelCase, `use` prefix | `useOnboarding.ts` |
| API routes | kebab 또는 resource | `subsidies.ts` |
| CSS | co-located `.css` 또는 `.module.css` | `SubsidyCard.css` |
| 상수 | SCREAMING_SNAKE | `SORT_OPTIONS` |

### React
- 함수형 컴포넌트 + hooks, **React Router**, 서버 상태는 **TanStack Query**
- 온보딩 state: Context + sessionStorage

### Express
- 라우터는 `server/src/routes/`에 분리
- 요청 검증: **zod**
- 에러 응답: `{ error: string }` + 적절한 HTTP status
- DB row ↔ 앱 타입 변환은 `server/src/db/mappers.ts` 재사용

## 커밋 메시지 규칙

[Conventional Commits](https://www.conventionalcommits.org/) + 한글 본문 허용:

```
<type>(<scope>): <한 줄 요약>

[선택 본문]
```

| type | 용도 |
|------|------|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `docs` | 문서만 |
| `style` | 포맷·UI (로직 변경 없음) |
| `refactor` | 리팩터 |
| `chore` | 빌드·deps·설정 |
| `test` | 테스트 |

**scope 예**: `client`, `server`, `shared`, `crawler`, `design`

**예시**:
```
feat(client): 온보딩 step1 업종 선택 UI 구현
fix(server): subsidies 404 응답 형식 통일
docs: CLAUDE.md API 초안 추가
```

## PR 규칙

`.github/pull_request_template.md`는 **존재하지 않음** — 아래 형식을 수동으로 따른다
(템플릿 파일은 `issue-workflow` Skill의 `pr-body-template.md` 참고):
- 타이틀: `[신서연] 작업 한 줄 요약`
- 주요 작업 리스트
- 설명 가능한 부분 / 이해 못 한 부분 / 새로 알게 된 것
- 이슈 자동 종료용 `Closes #N` 포함

브랜치 전략(이슈 단위 + 하루 단위 병행), 캠퍼스 레포 동기화 절차는 `issue-workflow` Skill 참고.
