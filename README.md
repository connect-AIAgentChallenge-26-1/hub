# 유닉스 & Git 명령어 사전

| | |
| --- | --- |
| **서비스 배포** | https://c-dict.vercel.app |
| **시연 영상** | https://drive.google.com/file/d/1oeWlIk5HfCXvdG8A6K_mB5vbXs7oWWo8/view?usp=sharing |
| **소스 코드** | https://github.com/connect-AIAgentChallenge-26-1/hub/tree/N80_%EB%B0%95%EC%84%B1%EB%AF%BC |
| **프로젝트 소개 자료** | 이 문서 |

CS 실습을 듣는 대학생이 유닉스/git 명령어를 몰라 헤매는 문제를 해결하기 위한 검색형 명령어 사전입니다. 명령어/카테고리/상황별 묶음 데이터는 Supabase(Postgres)에 저장되고, 검색은 Meilisearch로 처리하며, FE는 Express 백엔드(`server/`)를 거쳐 이 데이터를 가져옵니다. AI 챗봇 등 추가 확장 기능은 아직 미정입니다.

우분투 터미널을 흉내 낸 화면(터미널 창 프레임, 컬러 프롬프트, 깜빡이는 커서) 안에서 카테고리를 고르고, 명령어를 검색하고, 클릭해서 상세 설명을 보는 흐름으로 동작합니다.

## 주요 기능

- **카테고리별 명령어 목록**: Unix / Git 두 카테고리로 나눠서 진입
- **검색**: Meilisearch 기반, 이름·요약 대상 오타 허용 즉시 검색. 매칭 없으면 `command not found` 스타일 에러 표시
- **명령어 상세 보기**: 클릭한 명령어의 설명, 주요 옵션, 터미널 실행 예시를 확인
- **상황별 명령어 찾기**: "과제 제출하기", "권한 오류 해결하기" 같은 실습 시나리오별로 필요한 명령어를 순서대로 묶어서 확인, 명령어 상세 페이지에서도 관련 상황으로 역참조 가능
- **터미널 콘솔 UI**: 우분투 터미널을 흉내 낸 창 프레임, 컬러 프롬프트(`user@host:~$`), 깜빡이는 커서 연출

## 화면 흐름

![화면 흐름 다이어그램](docs/images/screen-flow-diagram.png)

```
/                     → 카테고리 선택 (Unix / Git), "상황별로 찾아보기" 진입 버튼
/unix, /git           → 검색창만 표시 → 입력 즉시 검색
                        → 매칭 있으면 결과 목록, 없으면 "command not found" 에러
/commands/:id         → 명령어 상세 (설명 + 주요 옵션 + 터미널 예시 + 관련 상황)
/scenarios            → 상황별 명령어 묶음 목록
/scenarios/:id        → 시나리오 상세 (순서대로 필요한 명령어)
```

## 아키텍처 / 데이터 흐름

요청이 화면(FE) → 서버(BE) → 외부 저장소(Supabase/Meilisearch)까지 실제로 어떻게 흐르는지 나타낸 다이어그램. 코드(`src/services/`, `server/src/routes|controllers|services/`)를 기준으로 그렸다. 원본 mermaid 소스는 [`docs/plan.md`](docs/plan.md) §5-1에 있다.

![아키텍처 다이어그램](docs/images/architecture-diagram.png)

## 기술 스택

| 영역 | 사용 기술 | 상태 | 비고 |
| --- | --- | --- | --- |
| 프레임워크 | React 19 | 적용됨 | 함수형 컴포넌트 + Hooks (`useState`, `useMemo`)만 사용 |
| 빌드 도구 | Vite | 적용됨 | 개발 서버(HMR) 및 프로덕션 빌드 |
| 라우팅 | react-router-dom v7 | 적용됨 | `BrowserRouter` + 레이아웃 라우트(`Outlet`)로 화면 전환 |
| 스타일 | Plain CSS (`src/index.css`) | 적용됨 | 별도 UI 라이브러리·CSS 프레임워크 없이 CSS 변수로 팔레트 관리 |
| 상태 관리 | React 로컬 상태 | 적용됨 | 전역 상태 관리 라이브러리 없음 (컴포넌트 범위로 충분) |
| 백엔드 | Node.js + Express (`server/`) | 적용됨 | `commands`/`scenarios`/`search` API 라우트. AI 챗봇은 아직 미정, 자세한 내용은 `CLAUDE.md` 참고 |
| DB | Supabase (Postgres) | 적용됨 | `categories`/`commands`/`scenarios` 테이블 |
| 검색엔진 | Meilisearch (Cloud) | 적용됨 | 오타 허용/즉시 검색, Express가 프록시 |

## 시작하기

```bash
npm install
npm run dev      # 개발 서버 실행
npm run build    # 프로덕션 빌드
npm run lint     # eslint 검사
```

## 프로젝트 구조

```
src/
├── App.jsx                         # 라우터 설정
├── data/
│   ├── commands.js                 # 명령어 데이터 (유닉스/git) — Supabase 마이그레이션 소스
│   └── scenarios.js                # 상황별 명령어 묶음 데이터 — Supabase 마이그레이션 소스
├── services/                       # BE API 호출 (commandsService/scenariosService/searchService)
├── components/
│   ├── TerminalFrame.jsx           # 터미널 창 레이아웃 (Outlet)
│   ├── CommandCard.jsx             # 목록 카드
│   ├── SearchBar.jsx / SearchResultList.jsx
└── pages/
    ├── CategoryHomePage.jsx        # 카테고리 선택 화면
    ├── CommandListPage.jsx         # 검색 + 결과 목록 화면
    ├── CommandDetailPage.jsx       # 명령어 상세 화면
    ├── ScenarioHomePage.jsx        # 상황별 명령어 묶음 목록
    └── ScenarioDetailPage.jsx      # 시나리오 상세 화면

server/
└── src/
    ├── routes/         # commandsRouter.js, scenariosRouter.js, search.js
    ├── controllers/, services/
    └── scripts/         # migrateCommandsToSupabase.js, indexCommands.js
```

## 명령어 데이터 구조

`src/data/commands.js`의 각 항목은 아래 형태를 따릅니다.

```js
{
  id: 'unix-grep',            // URL에 그대로 쓰이는 고유 id
  category: 'unix',           // 'unix' | 'git'
  name: 'grep',
  summary: '한 줄 요약',
  description: '자세한 설명',
  options: [{ flag: '-i', desc: '옵션 설명' }],
  examples: [{ command: '실행 예시', desc: '예시 설명' }],
}
```

## 향후 확장 아이디어 (미확정)

- 명령어별 중요도 표시 (가로 막대)
- AI 챗봇을 통한 명령어 질의응답
- 셸 연동 CLI `kman`

## 개발 문서

- [기획서](docs/plan.md) · [작업 체크리스트(완료 이력)](docs/checklist.md) · [Task 관리(백로그/로드맵)](docs/tasks.md)
- [디자인 시스템](docs/design-system/DESIGN.md)
- [개발 워크플로우](docs/workflow.md)
- GitHub Project 칸반 보드: [Week2 - 검색 수직슬라이스](https://github.com/users/ParkSeong-min/projects/2) · [Week3 - 백로그/확장 기능](https://github.com/users/ParkSeong-min/projects/1)
