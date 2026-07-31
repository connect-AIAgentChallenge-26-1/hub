# 진로 에이전트 서비스 (링커리어 공고 추천 & 자소서 초안 Agent)

**배포된 서비스**: [hub-two-rosy.vercel.app](https://hub-two-rosy.vercel.app) (Frontend, Vercel) · [hub-071a.onrender.com](https://hub-071a.onrender.com) (Backend, Render)

> 무단 API 호출로 인한 Claude 비용 발생을 막기 위해 단일 계정 로그인 게이트가 걸려 있습니다. 직접 체험해보시려면 아래 계정으로 로그인해주세요(평가 기간 이후 비활성화 예정입니다).
> - 아이디: `admin`
> - 비밀번호: `1234`

## 문제 정의

대학생은 신입 공채·인턴십·공모전·대외활동 공고 중 자신에게 맞는 것을 고르기 어렵고, 자기소개서 문항에 맞춰 자기 경험을 정리해 쓰는 데도 어려움을 겪는다.

→ 전공·경험 기반 맞춤 추천 + AI 자소서 초안 생성으로 해결

## 핵심 기능

1. **전공·학점·자격증·경험 기반 맞춤 공고 추천** — 추천 이유와 주요 조건을 함께 제공
2. **선택한 공고의 자소서 문항 분석 → 경험을 반영한 문항별 초안 생성**
3. **생성된 초안을 화면에서 바로 수정·저장** — 재방문 시 저장된 초안이 그대로 불러와짐(Supabase `drafts` 테이블)

기획은 [docs/plan.md](docs/plan.md), 4주 개발 Task는 [docs/checklist.md](docs/checklist.md) 참고.

이번 주 작업 현황은 [GitHub Issues](https://github.com/dohyeon-k/hub/issues)에서 확인할 수 있다(우선순위는 `P0`/`P1`/`P2` 라벨로 표시). 진행 상황은 Project 보드에서도 칸반 형태로 볼 수 있다: [2주차 - 공고 추천 슬라이스](https://github.com/users/dohyeon-k/projects/1), [3주차 - 자소서 초안 생성 슬라이스](https://github.com/users/dohyeon-k/projects/2), [4주차 - 크롤링 및 데모 준비](https://github.com/users/dohyeon-k/projects/3).

## 기술 스택

| 영역 | 스택 |
|---|---|
| Frontend | Vite 8 + React 19 (순수 CSS, 별도 UI/상태관리 라이브러리 없음) |
| Backend | Node.js + Express |
| DB | Supabase (`profiles`, `drafts` 테이블) |
| AI | Anthropic Claude API (`claude-haiku-4-5`) |
| 공고 데이터 | `backend/data/postings.json` 링커리어 실제 채용/인턴/공모전/대외활동 공고 100건 (이슈 [#23](https://github.com/dohyeon-k/hub/issues/23)) |
| 테스트 | vitest (backend 서비스 로직 + frontend 컴포넌트), Playwright(E2E, 임시 스크립트) |
| 인증 | 단일 계정 HTTP Basic Auth (`requireAuth` 미들웨어) |

## 화면

|정보입력 → 추천목록|자소서 초안 (저장됨)|
|---|---|
|![추천 목록 화면](docs/screenshots/recommend-list.png)|![자소서 초안 저장 화면](docs/screenshots/draft-saved.png)|

## 실행 방법

로컬에서 프론트엔드와 백엔드를 각각 띄워야 한다(별도 패키지, 모노레포 툴 없음).

### 준비물
- Node.js 20 이상
- Supabase 프로젝트 (`profiles`, `drafts` 테이블 — [docs/data-model.md](docs/data-model.md)의 SQL로 생성)
- Anthropic API 키 (선택 — 없으면 추천 이유/자소서 초안이 템플릿 문구로 폴백됨)
- 로그인 게이트용 아이디/비밀번호 (직접 정하면 됨)

### 1. 백엔드

```bash
cd backend
npm install
cp .env.example .env
# .env를 열어 SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY, APP_LOGIN_ID, APP_LOGIN_PASSWORD 채우기
npm run dev
```

`http://localhost:4000`에서 대기한다.

### 2. 프론트엔드 (새 터미널)

```bash
npm install
cp .env.example .env   # 기본값(http://localhost:4000)이면 그대로 둬도 됨
npm run dev
```

`http://localhost:5173` 접속 → 로그인 화면(방금 정한 아이디/비밀번호) → 정보입력부터 시작.

### 테스트 실행

```bash
npm test              # 루트: React 컴포넌트 단위 테스트
cd backend && npm test  # 백엔드: 서비스 로직 단위 테스트
```

## 아키텍처

화면(로그인+4개) → Express 라우트 → 서비스 로직 → 데이터(Supabase/목업 JSON)로 이어지는 전체 구조. 로그인 흐름, 추천 흐름(정보입력→추천), 자소서 흐름(공고상세→초안) 세 개의 수직 슬라이스가 있다:

```mermaid
flowchart LR
    subgraph Frontend["React (src/)"]
        LoginScreen["로그인\nLoginScreen.jsx"]
        InfoInput["정보입력\nInfoInput.jsx"]
        RecommendList["추천목록\nRecommendList.jsx"]
        JobDetail["공고상세\nJobDetail.jsx"]
        DraftEditor["자소서초안\nDraftEditor.jsx"]
        Api["api.js"]
    end

    subgraph Backend["Express (backend/src/)"]
        RequireAuth{{"requireAuth 미들웨어\nHTTP Basic Auth"}}
        AuthRoute["routes/auth.js\nGET /api/auth/check"]
        ProfilesRoute["routes/profiles.js\nPOST /api/profiles"]
        DraftsRoute["routes/drafts.js\nPOST /api/postings/:id/draft"]
        Matching["services/matching.js\nscoreAndRank"]
        Claude["services/claude.js\ngenerateReasons"]
        EssayAnalysis["services/essayAnalysis.js\nanalyzeEssayQuestion"]
        DraftGen["services/draftGeneration.js\ngenerateDrafts"]
    end

    subgraph Data["데이터"]
        Profiles[("Supabase\nprofiles 테이블")]
        Drafts[("Supabase\ndrafts 테이블")]
        Postings[["postings.json\n(목업 공고 10건)"]]
    end

    LoginScreen -->|"아이디/비밀번호"| Api --> RequireAuth --> AuthRoute
    AuthRoute -->|"200이면 인증 헤더를\n이후 모든 요청에 첨부"| Api --> InfoInput

    InfoInput -->|"제출"| Api --> RequireAuth --> ProfilesRoute
    ProfilesRoute -->|"프로필 저장"| Profiles
    ProfilesRoute -->|"공고 조회"| Postings
    ProfilesRoute --> Matching
    Matching --> Claude
    Claude -->|"추천 이유 + 공고 목록"| ProfilesRoute
    ProfilesRoute -->|"201 profileId + recommendations"| Api
    Api --> RecommendList --> JobDetail

    JobDetail -->|"자소서 초안 생성 클릭\n(profileId만 전송)"| Api --> RequireAuth --> DraftsRoute
    DraftsRoute -->|"공고 조회"| Postings
    DraftsRoute -->|"profileId로 프로필 재조회"| Profiles
    DraftsRoute -->|"저장된 초안 있는지 조회 (병렬)"| Drafts
    DraftsRoute --> EssayAnalysis
    EssayAnalysis -->|"문항별 분석"| DraftGen
    DraftGen -->|"저장된 게 없을 때만: 문항별 초안 생성\n(LLM 또는 템플릿 폴백)"| DraftsRoute
    DraftsRoute -->|"200 essayQuestions + isSaved"| Api --> DraftEditor
    DraftEditor -->|"저장 클릭"| Api --> RequireAuth --> DraftsRoute
    DraftsRoute -->|"upsert(profile_id, posting_id)"| Drafts
```

로그인 성공 여부와 이후 모든 화면/데이터 상태(`step`/`profileId`/`jobs`/`selectedJob`/`isDraftSaved`/`authHeader`)는 `sessionStorage`에 저장돼, 새로고침해도 로그인부터 다시 할 필요가 없다.

요청 하나가 실제로 어떻게 도는지(수직 슬라이스)는 시퀀스로 보면 더 명확하다. 가장 먼저 로그인:

```mermaid
sequenceDiagram
    participant U as 사용자
    participant F as React (LoginScreen → App.jsx)
    participant E as Express (requireAuth)

    U->>F: 아이디/비밀번호 입력 후 로그인
    F->>E: GET /api/auth/check (Authorization: Basic ...)
    alt 아이디/비밀번호 일치
        E-->>F: 200 { ok: true }
        F-->>U: authHeader를 sessionStorage에 저장, 정보입력 화면으로 이동
    else 불일치
        E-->>F: 401
        F-->>U: 에러 문구 표시, 로그인 화면 유지
    end
```

그 다음 추천 흐름:

```mermaid
sequenceDiagram
    participant U as 사용자
    participant F as React (InfoInput)
    participant E as Express (/api/profiles)
    participant S as Supabase (profiles)
    participant M as matching.js
    participant C as claude.js

    U->>F: 정보 입력 후 제출
    F->>E: POST /api/profiles
    E->>S: insert(profile)
    S-->>E: profileId
    E->>E: postings.json 로드
    E->>M: scoreAndRank(profile, postings)
    M-->>E: 점수순 공고 목록
    E->>C: generateReasons(profile, postings)
    C-->>E: 추천 이유 (LLM 또는 템플릿 폴백)
    E-->>F: 201 {profileId, recommendations}
    F-->>U: 추천 목록 화면 렌더
```

그리고 자소서 초안 흐름 — 저장된 초안이 있으면 재생성 없이 그대로 돌려주고, 없을 때만 LLM을 부른다:

```mermaid
sequenceDiagram
    participant U as 사용자
    participant F as React (JobDetail → App.jsx)
    participant E as Express (/api/postings/:id/draft)
    participant SP as Supabase (profiles)
    participant SD as Supabase (drafts)
    participant A as essayAnalysis.js
    participant D as draftGeneration.js

    U->>F: "자소서 초안 생성" 클릭
    F->>E: POST /api/postings/:id/draft { profileId }
    E->>E: postings.json에서 공고 조회
    par 병렬 조회 (Promise.all)
        E->>SP: select (id = profileId)
        SP-->>E: 프로필 (major/certificates/experience 등)
    and
        E->>SD: select (profile_id, posting_id)
        SD-->>E: 저장된 answers 또는 null
    end
    E->>A: analyzeEssayQuestion(question, profile) (문항별)
    A-->>E: 문항 유형별 분석 텍스트
    alt 저장된 초안 있음
        E-->>F: 200 { essayQuestions, isSaved: true }
    else 저장된 초안 없음
        E->>D: generateDrafts(profile, posting, essayQuestions)
        D-->>E: 문항별 초안 (LLM 또는 템플릿 폴백)
        E-->>F: 200 { essayQuestions, isSaved: false }
    end
    F-->>U: 자소서 초안 화면 렌더 (isSaved면 잠긴 채로 시작)
```

저장 자체는 별도 엔드포인트다:

```mermaid
sequenceDiagram
    participant U as 사용자
    participant F as React (DraftEditor → App.jsx)
    participant E as Express (/api/postings/:id/draft/save)
    participant S as Supabase (drafts)

    U->>F: "저장 / 완료" 클릭
    F->>E: POST /api/postings/:id/draft/save { profileId, answers }
    E->>S: upsert({ profile_id, posting_id, answers }, onConflict: profile_id+posting_id)
    S-->>E: 저장 완료
    E-->>F: 200 { saved: true }
    F-->>U: textarea 잠금 + "저장됨" 배지 표시
```

### 인증

회원가입 없이 서버 환경변수(`backend/.env`의 `APP_LOGIN_ID`/`APP_LOGIN_PASSWORD`)로 정한 단일 계정만 통과하는 로그인 게이트가 있다. 배포 후 아무나 백엔드를 호출해 Claude API 비용이 나가는 걸 막기 위해 배포 전에 미리 만들어뒀다. 로컬에서 처음 띄울 때도 이 두 값을 채워야 로그인할 수 있다.

### 알려진 제약

- 라우터 라이브러리는 쓰지 않기로 한 결정(`CLAUDE.md`)에 따라 URL 딥링크·브라우저 뒤로가기는 지원하지 않는다. 대신 새로고침하면 화면 상태가 다 날아가던 문제는 `step`/`profileId`/`jobs`/`selectedJob`/`isDraftSaved`/`authHeader`를 `sessionStorage`에 저장해뒀다가 마운트 시 복원하는 것으로 해결했다. (참고로 자소서 초안 생성 시 프론트가 `profile` 전체를 재전송하던 구조는 이슈 [#26](https://github.com/dohyeon-k/hub/issues/26)으로 개선해, 이제 서버가 `profileId`로 Supabase에서 직접 재조회한다.)
- 공고 데이터(`postings.json`)는 링커리어 실제 채용/인턴/공모전/대외활동 공고 100건이다 — 자소서 문항·글자수 제한까지 실제 값 그대로 크롤링했다(이슈 [#23](https://github.com/dohyeon-k/hub/issues/23)).
- 배포됐다 — 프론트엔드는 [Vercel](https://hub-two-rosy.vercel.app), 백엔드는 [Render](https://hub-071a.onrender.com)(이슈 [#25](https://github.com/dohyeon-k/hub/issues/25)). Render 무료 티어 특성상 일정 시간 요청이 없으면 서버가 잠들었다가 첫 요청에 재기동 지연이 있을 수 있다.

## Agent 협업 워크플로우

4주 동안 AI(Claude Code)와 일한 기본 사이클이다. 이슈·Project 보드·`CLAUDE.md`·Skill·Agent가 각 단계에서 어떻게 맞물리는지는 아래 그림 참고, 자세한 서술은 [docs/workflow.md](docs/workflow.md)에 정리했다.

```mermaid
flowchart TD
    Mission["데일리 미션 확인"] --> Rule["CLAUDE.md 규칙 확인"]
    Rule --> IssueCheck{"새 기능 / 확장인가?"}
    IssueCheck -- "예" --> IssueReg["GitHub 이슈 등록\n(무엇을/왜, DoD, 목표일)"]
    IssueCheck -- "아니오\n(기존 태스크 이어가기)" --> PlanAgent
    IssueReg --> PlanAgent["planning-agent\n요일별 작업 단위로 분해"]
    PlanAgent --> Strategy["구현 전 전략·트레이드오프\n확인 (설계 결정은 사용자에게 확인)"]
    Strategy --> Impl["구현"]
    Impl -->|"화면/스타일 작업"| DesignSkill["design-review 스킬\n(디자인 시스템 토큰 강제)"]
    Impl -->|"테스트 작성"| TestSkill["test-writer 스킬\n(vitest·컴포넌트·E2E 컨벤션)"]
    DesignSkill --> Verify
    TestSkill --> Verify["대상별 검증\n(vitest 단위 / curl 통합 / Playwright E2E)"]
    Verify --> VerifyAgent["verification-agent\n실제 앱 구동으로 DoD 재검증"]
    VerifyAgent --> Docs["문서 갱신\n(checklist.md · README.md · workflow.md)"]
    Docs --> Commit["커밋 · 푸시\n(사용자가 명시적으로 요청했을 때만)"]
```
