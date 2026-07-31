# GameForge Agent — 제작 계획 (Development Plan)

> [GameForge_Agent.md](./GameForge_Agent.md)(기획) · [GameForge_Agent_UI_Spec.md](./GameForge_Agent_UI_Spec.md)(UI 설계)를 실제로 구현하기 위한 작업 계획.
> 대상: 1인 인디 개발자 기준으로 우선순위와 작업 단위를 쪼갰다.

---

## 0. 전제 조건 및 스코프

- 실행 환경: 로컬 우선 (개인 개발 PC에서 구동), 추후 배포는 후순위
- 대상 저장소: 사용자가 소유/쓰기 권한을 가진 GitHub Repository
- AI: Google Gemini API — Agent별로 system prompt만 다르고 동일 모델 사용 (원 기획서 6번 원칙)
- **[v7] 사용자 범위**: 하나의 서버 인스턴스에 **여러 명이 로그인해도 데이터가 서로 격리**된다 (GitHub 계정 = 사용자 식별자). 단, 이번 스코프는 **유저 1명당 프로젝트 1개**로 제한 — 프로젝트 목록·전환 UI는 다음 단계
- 이번 계획의 목표 범위: **UI Spec 문서에 정의된 3개 화면(Repo 연결 / 분석 리포트 / Agent 워크스페이스)까지 동작하는 MVP**. Feature Expansion Workflow(기존 프로젝트에 기능 추가)는 다음 단계로 미룬다.

---

## 1. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| Frontend | React + Vite + TypeScript | 프로토타입 컴포넌트를 그대로 이식하기 쉬움, 타입 안전성 |
| 스타일링 | Plain CSS (CSS 변수 기반, 프로토타입 토큰 그대로 이식) | 이미 `gameforge-ui-style` 스킬로 토큰/컴포넌트 규칙이 정리되어 있어 별도 CSS 프레임워크 불필요 |
| 상태 관리 | React Context + useReducer (Zustand로 확장 가능) | 프로젝트 규모상 Redux는 과함 |
| Backend | Node.js + Express (or Fastify) | GitHub API·Gemini API 프록시, TypeScript 공유 가능 |
| 데이터 저장 | 별도 DB 엔진 없이 **Express가 로컬 JSON 파일을 직접 읽고 씀** (`data/*.json`) | 1인 로컬 사용 기준으로 설치/마이그레이션 부담 없음. 규모가 커지면 SQLite로 교체 가능한 구조로 파일당 스키마를 고정해둔다 |
| 파일 저장 | 실제 대상 저장소의 `docs/*.md` 파일 + JSON에는 메타데이터만 | 원 기획서 7번 "Markdown 기반 Context 관리" 원칙 유지 |
| GitHub 연동 | **GitHub OAuth App** (Authorization Code Flow) — "GitHub로 로그인" 버튼 → 인증 → access token 발급 → 세션/쿠키로 유지 | 사용자가 URL 복붙 없이 저장소/브랜치를 목록에서 바로 선택하게 하기 위한 결정 (v2 변경, PAT 방식 대신 채택) |
| AI 연동 | **Google Gen AI SDK (`@google/genai`)** | 공식 SDK, 스트리밍 지원. **v3: Anthropic Claude API에서 Gemini API로 전환** — 분석 리포트 생성 + 전체 Agent 채팅 Q&A 모두 포함 |
| 코드 분석 엔진 | **.NET 콘솔 앱 (`Microsoft.CodeAnalysis`/Roslyn, Syntax 전용)** — Express가 `child_process.spawn`으로 실행, JSON stdout을 파싱 | C# 코드의 의존성/구조를 정확히 뽑아내려면 Node 생태계 도구로는 부족. 단, Unity 프로젝트를 실제로 컴파일하지 않는 **Syntax 전용 분석**으로 한정 (MSBuildWorkspace 기반 Semantic 분석은 Unity 빌드 환경 재현이 번거로워 이번 스코프 제외) |
| 중복 코드 탐지 | `jscpd` (오픈소스, C# 지원) | 직접 구현 대신 라이브러리 사용 |

> ⚠️ **새 설치 요구사항**: 위 분석 엔진 때문에 개발/실행 환경에 **.NET SDK**가 추가로 필요하다 (Node.js만으로는 부족). 1주차 셋업 체크리스트에 포함.

---

## 2. 시스템 아키텍처

```
[React Client]
     │  (REST + SSE for chat streaming, 세션 쿠키 포함)
     ▼
[API Server: Express]
     ├── [세션 해석 미들웨어] 쿠키의 session_id → sessions/{id}.json → github_user_id 확정
     │     (로그인/콜백 라우트 제외, 이후 모든 라우트는 req.userId로 데이터 경로 스코프)
     │
     ├── /api/auth/github/login     → GitHub OAuth 인증 페이지로 리다이렉트
     ├── /api/auth/github/callback  → code→token 교환, sessions/{id}.json에 저장 + 쿠키 발급
     ├── /api/repo/*                → GitHub API 연동 (내 저장소 목록, branch 목록, 파일 커밋)
     ├── /api/analysis/*            → 저장소 분석 요청 접수 → 분석 엔진 spawn → 결과 JSON을 Gemini에 넘겨 리포트 텍스트화
     ├── /api/steps/*               → 9단계 상태/진행률 CRUD (유저별 격리)
     ├── /api/chat/*                → Agent와의 대화 (Gemini API 프록시, SSE 스트림)
     └── /api/documents/*           → Markdown 문서 조회/저장/버전
     │
     ├──spawn──▶ [.NET 콘솔 앱: Roslyn Syntax 분석기] ──stdout JSON──▶ (의존성 그래프, 메서드 수 등)
     ├──lib────▶ [jscpd] (중복 코드 탐지)
     ▼
[JSON 파일 저장소]              [Target GitHub Repo]         [Gemini API]
 (data/sessions/*.json,          (docs/*.md 커밋,              (Agent 응답 생성 +
  data/users/{id}/steps.json,     소스 코드 읽기)                분석 결과 리포트화)
  data/users/{id}/messages/*.json,
  data/users/{id}/documents/*.json)
```

**분석 파이프라인 흐름**: `분석 요청 → Roslyn 분석기(child process) 실행 → 클래스/의존성 JSON 추출 → jscpd로 중복 블록 탐지 → 두 결과를 합쳐 Gemini API에 전달 → 사람이 읽는 Markdown 리포트로 변환`. 탐지는 결정론적 도구가, 설명은 Gemini가 담당하는 구조.

---

## 3. 데이터 모델 (초안)

DB 엔진 없이 Express 서버가 `data/` 디렉토리 아래 JSON 파일을 직접 읽고 쓰는 구조. 파일당 스키마를 고정해두면 나중에 SQLite/Postgres로 옮길 때도 필드 매핑만 하면 되도록 설계.

> **[v7] 유저별 공간 분리.** 서버 인스턴스 하나에 여러 명이 로그인해도 데이터가 섞이지 않도록, 로그인 이후의 모든 데이터를 `data/users/{github_user_id}/` 아래로 격리한다. 식별자는 GitHub **username이 아니라 숫자 user id**를 쓴다 (username은 바뀔 수 있음). 이번 스코프는 유저 1명당 프로젝트 1개로 제한 — `project.json`은 유저 폴더당 하나뿐이고, 여러 프로젝트를 관리하는 목록/전환 UI는 없다.

```
data/
├── sessions/
│     └── {session_id}.json   -- 브라우저 쿠키(서명된 session_id)에 대응하는 로그인 세션
│           { github_user_id, github_login, github_avatar_url,
│             access_token(암호화 또는 최소 권한 스코프로 저장), created_at, expires_at }
│
└── users/
      └── {github_user_id}/
            ├── project.json              -- 단일 객체
            │     { repo_full_name, branch, connected_at, analysis_preset }
            │
            ├── steps.json                -- 9단계 고정 배열 (seed 데이터)
            │     [{ id(1~9), name, status(pending|active|done), progress_pct, agent_name }]
            │
            ├── documents/
            │     └── {step_id}.json      -- Step별 문서 메타 + 버전 이력
            │           { path, content, version, updated_at, history: [...] }
            │
            ├── messages/
            │     └── {step_id}.json      -- Step별 채팅 로그 배열
            │           [{ id, from(agent|user), text, created_at }]
            │
            ├── checklist/
            │     └── {step_id}.json      -- Document.content 파싱 결과 (파생 데이터, 저장 시 재생성)
            │           [{ label, checked }]
            │
            └── file-changes/
                  └── {step_id}.json      -- 7~8단계 코드 산출물 (Day 12에서 도입)
                        [{ path, changeType(new|modified|deleted), newContent,
                           diff(서버 계산), suggestedCommitMessage,
                           syntaxValid, syntaxErrors, approved(boolean) }]
```

- **세션 해석 미들웨어**: 모든 API 요청은 먼저 요청 쿠키의 `session_id`로 `sessions/{session_id}.json`을 조회해 `github_user_id`를 얻고, 이후 모든 파일 경로를 `data/users/{github_user_id}/...`로 스코프한다. 이 미들웨어를 거치지 않는 라우트가 없도록 한다 (로그인/콜백 라우트 제외).
- `sessions/{id}.json`의 `access_token`은 OAuth 로그인으로 발급받은 토큰 — 평문 저장 금지, 최소한 파일 권한 제한(600) + 가능하면 OS 키체인/암호화 적용 (1주차 확정 필요, 7절 리스크 참고)
- `documents/{step_id}.json`의 `content`는 항상 실제 저장소 `docs/{path}`와 동기화 (저장 시 로컬 캐시 갱신, Approve 시에만 실제 커밋)
- 동시 쓰기 충돌은 **유저별로 독립된 디렉토리**라 유저 간 잠금 경합은 없음. 다만 같은 유저가 여러 탭/기기로 동시에 쓰는 경우는 여전히 낙관적 락 없이 단순 덮어쓰기로 처리 (필요해지면 재검토)
- 파일 I/O는 `fs/promises` + 유저 디렉토리별 락(간단한 mutex)으로 처리해 동시 요청 시 파일 깨짐 방지

---

## 4. 화면별 작업 분해

### 4.1 Repository 연결 화면

**컴포넌트**
- `GithubLoginButton` ("GitHub로 로그인" 버튼, 로그인 후 아바타+계정명 표시로 전환)
- `RepoSelect` (로그인한 계정의 저장소 목록, 검색 가능한 드롭다운)
- `BranchSelect` (저장소 미선택 시 `disabled`)
- `AnalysisPresetPicker` (라디오 카드 3종, Branch 미선택 시 `disabled`)

**GitHub OAuth App 등록 (사전 준비)**
- GitHub Developer Settings에서 OAuth App 생성 — Client ID/Secret 발급
- Authorization callback URL을 로컬 개발 주소(`http://localhost:PORT/api/auth/github/callback`)로 등록
- 요청 스코프: `repo` (private 저장소 read/write 포함) — OAuth App은 저장소 단위로 스코프를 좁힐 수 없어 계정이 접근 가능한 전체 저장소가 범위가 된다는 점을 사용자에게 로그인 전 안내 문구로 고지

**작업 목록**
1. `GET /api/auth/github/login` — GitHub 인증 페이지로 리다이렉트 (`client_id`, `scope=repo`, `redirect_uri` 포함)
2. `GET /api/auth/github/callback` — `code`를 access token으로 교환(`POST https://github.com/login/oauth/access_token`), `GET /user`로 `github_user_id` 조회, `sessions/{session_id}.json`에 저장 + **서명된 `session_id` 쿠키 발급**, `data/users/{github_user_id}/` 디렉토리가 없으면 seed 데이터로 생성, 프론트를 Repo 연결 화면으로 리다이렉트
3. **세션 해석 미들웨어** — 이후의 모든 `/api/*` 요청(로그인/콜백 제외)에서 쿠키의 `session_id`로 `sessions/{id}.json`을 조회해 `req.userId`를 설정. 유효한 세션이 없으면 401 반환
4. `GET /api/repo/list` — 저장된 토큰으로 `GET /user/repos` 호출, 저장소 목록(이름, private 여부, default branch) 반환
5. `GET /api/repo/:fullName/branches` — 저장소 선택 시 branch 목록 조회
6. 프론트: 로그인 전 `RepoSelect`·`BranchSelect`·프리셋·시작 버튼 모두 `disabled` → 로그인 성공 시 `RepoSelect`만 활성화 → 저장소 선택 시 `BranchSelect` 활성화 → Branch 선택 시 프리셋 활성화 (UI Spec 2절의 단계적 잠금 표 그대로 구현)
7. `POST /api/analysis/start` — 프리셋(빠름/기본/상세)에 따라 분석 job 큐잉 (`req.userId` 기준으로 `data/users/{id}/project.json`에 기록)
8. 로그아웃/계정 전환 UI — `sessions/{id}.json` 삭제 + 쿠키 만료 처리 후 로그인 화면으로 복귀 (유저의 `data/users/{id}/` 데이터 자체는 삭제하지 않음 — 다시 로그인하면 이어서 사용)
9. 에러 케이스 UI (로그인 실패, 토큰 만료) — *현재 스코프 밖, Phase 2로 이관*

**의존성**: GitHub OAuth App 등록(Client ID/Secret), access token 저장 방식 확정(3절 `sessions/{id}.json` 참고 — 최소 파일 권한 제한 필요), 쿠키 서명용 시크릿 키 값(`SESSION_SECRET`) 발급

**리스크**: OAuth 플로우는 PAT 입력받는 것보다 구현 항목이 많다 (리다이렉트, 콜백, 토큰 교환, 세션 관리) — 제작계획 5절 마일스톤에서 1주차 비중이 원래 계획보다 커졌음을 인지하고 진행. **[v7] 유저별 데이터 격리까지 추가되면서 모든 API 라우트가 세션 미들웨어를 거쳐야 한다는 제약이 생김** — 미들웨어 적용을 빠뜨린 라우트가 있으면 유저 간 데이터가 섞일 수 있어 라우트 전수 점검 필요 (7절 리스크 참고)

---

### 4.2 분석 리포트 화면

**컴포넌트**
- `AnalysisReportCard` (통계 3종 + md 미리보기)
- `MarkdownViewer` / `MarkdownEditor` (4.4의 공용 컴포넌트 재사용)

**분석 엔진 — `tools/analyzer/` (.NET 콘솔 앱, 별도 서브 프로젝트)**
1. `dotnet new console`로 신규 프로젝트 생성, `Microsoft.CodeAnalysis.CSharp` NuGet 패키지 추가
2. 대상 저장소의 `**/*.cs` 파일을 순회하며 `CSharpSyntaxTree.ParseText()`로 **Syntax 전용 파싱** (컴파일/빌드 없음 — Unity 프로젝트를 외부에서 빌드할 필요가 없어짐)
3. 각 `ClassDeclarationSyntax`에서 추출:
   - 클래스명, 파일 경로, 상속 목록(`BaseList`)
   - 클래스 본문 내 `IdentifierNameSyntax`로 언급된 타입 이름들 (근사 의존성 그래프)
   - 메서드 개수 (God Class 판별용)
4. 결과를 JSON으로 `Console.WriteLine(JsonSerializer.Serialize(...))` → stdout 출력
5. Express에서 `child_process.spawn('dotnet', ['analyzer/GameForgeAnalyzer.dll', repoPath])`로 실행, stdout을 파싱

**중복 코드 탐지**: 별도 구현 없이 `jscpd` npm 패키지 사용 (C# 지원, 토큰 유사도 기반)

**작업 목록**
1. 분석기 JSON + jscpd 결과를 합쳐 Gemini API에 전달 → `00_Analysis_Report.md` 형식의 자연어 리포트로 변환 (탐지는 도구가, 문장화는 Gemini가 담당)
2. 리팩토링 대상 판별은 AI 판단이 아니라 **룰 기반 임계값**으로 계산 (예: 메서드 수 > 30 → God Class 플래그, Gemini에는 이미 플래그된 목록만 전달해 이유를 설명하게 함)
3. `GET /api/analysis/{id}/report` — 통계 + md 반환
4. Approve 액션 → `Step[1]`(요구사항 분석)을 `active`로 전환, 워크스페이스로 라우팅

**정확도 한계 (명시적으로 인지하고 갈 것)**
- Syntax 전용 분석이라 **타입 해석은 근사치** — 같은 이름의 다른 네임스페이스 타입을 구분하지 못하거나, 제네릭/확장 메서드 등 복잡한 케이스에서 오탐 가능
- 완전한 정확도가 필요하면 `MSBuildWorkspace` 기반 Semantic 분석으로 가야 하지만, Unity 프로젝트를 외부 환경에서 실제로 빌드해야 해서 이번 스코프에서는 채택하지 않음
- 리포트 문구에 "정적 분석 기반 추정치이며, 완전한 컴파일 분석은 아님"을 명시

**리스크**
- 새 런타임 의존성: 사용자 로컬에 **.NET SDK 설치**가 필요함 (1주차 셋업 가이드에 설치 확인 스텝 추가)
- 대용량 저장소에서 `dotnet` 프로세스 spawn 비용 + 파싱 시간 미검증 — "상세" 프리셋 성능과 함께 실측 필요

---

### 4.3 Agent 워크스페이스 — 사이드바

**컴포넌트**
- `StepSidebar` (9개 `StepRow`)
- `StepRow` (완료/진행중만 클릭 가능, pending은 disabled + tooltip)

**작업 목록**
1. `GET /api/steps` — 9단계 상태/진행률 조회, 프론트 초기 렌더
2. 클릭 가능 여부는 프론트에서 `status !== 'pending'`으로 판단 (백엔드도 동일 룰로 이동 요청 검증 — 클라이언트만 믿지 않음)
3. `progress_pct` 계산: `ChecklistItem` 체크 비율 기반 자동 계산 (문서 저장 시 재계산)
4. Step 클릭 시 해당 Step의 `Document` + `Message` 로드해서 메인 패널 갱신

---

### 4.4 Agent 워크스페이스 — 채팅형 Q&A

> **v5: 이 절은 1~6단계에만 적용된다.** 7단계(코드 생성)·9단계(문서화)는 채팅이 없는 자동 생성 방식으로 바뀌었다 — 아래 4.4a 참고.

**컴포넌트**
- `ChatThread` (메시지 리스트, 자동 스크롤)
- `ChatInput` (텍스트 입력 + 전송, Enter 지원)
- `TypingIndicator`
- `FinalizeNowButton` — "지금까지 내용으로 문서 만들기" 수동 트리거 버튼

**작업 목록**
1. `POST /api/chat/{step_id}/message` — 사용자 메시지 저장 → Gemini API 호출(해당 Agent의 system prompt + 이전 대화 이력 + 이전 단계 md 컨텍스트) → 응답 스트리밍
2. SSE 또는 WebSocket으로 "입력 중…" → 실제 토큰 스트리밍 반영 (프로토타입의 `setTimeout` 딜레이를 실제 스트림으로 대체)
3. Agent가 질문을 "충분히 모았다"고 판단하면 자동으로 Markdown 문서 초안을 생성하도록 프롬프트 설계 (예: "8개 질문에 답변이 모이면 문서화 단계로 전환한다"는 지침을 system prompt에 명시)
4. 질문 개수는 Agent별로 유동적일 수 있음 — UI의 `질문 N / 전체`는 총량을 Agent가 추정해 알려주는 방식으로 설계 (고정 8개가 아니라 Agent 응답에서 `total_estimate` 필드를 받아 갱신)
5. `POST /api/chat/{step_id}/finalize` — 사용자가 `FinalizeNowButton`을 눌렀을 때, 질문 큐가 남아있어도 지금까지의 대화만으로 문서 생성을 강제 트리거. 3번의 자동 생성과 **같은 문서 생성 함수를 공유**하고, "지금까지의 정보만으로 최선을 다해 작성하라"는 지시만 다르게 전달. 답변이 1개 미만인 상태에서 누르면 프론트에서 확인 한 번 거침

**Agent별 프롬프트 설계 원칙** (1~6단계 Agent 공통)
- Input: 이전 단계 Markdown 문서 전체 + 현재까지의 대화 이력
- Output: 사람이 읽는 응답 텍스트 + (내부적으로) 갱신된 Markdown 문서 초안
- 문서 생성 시점: 사용자가 "이제 정리해줘"(4번 버튼) 또는 Agent가 스스로 판단해 요약 시그널을 보낼 때

---

### 4.4a Agent 워크스페이스 — 자동 생성 단계 (7, 9단계)

> **v5 신설.** 채팅 없이, Step 진입 즉시 Agent가 결과 초안을 만든다.

**7단계 — Code Generation Agent**
- Step 진입 시 자동으로 Agent 호출 (사용자 개입 없음)
- 호출 전, Roslyn 분석 결과에서 **네임스페이스 컨벤션을 감지**해 프롬프트에 "이 규칙을 따르라"고 명시 (분석기가 아직 namespace를 안 뽑고 있었다면 4.2의 분석기에 필드 추가 필요)
- **[v9] 관련 기존 C# 스크립트를 컨텍스트에 포함**: 새 코드를 아무것도 없는 상태에서 만드는 게 아니라, 저장소에 이미 있는 관련 코드를 읽고 그 위에서 이어나가도록 한다.
  1. 4단계(클래스 설계) 문서에서 언급된 클래스명·상속 관계를 파싱
  2. 최초 저장소 분석(4.2절)에서 이미 뽑아둔 클래스 목록과 이름을 대조해, 일치하는 **기존 클래스의 파일 경로**를 찾는다 (예: 설계 문서가 "PlayerController에 Dash 메서드 추가"라고 하면, 분석 결과에서 실제 `PlayerController.cs` 경로를 찾음)
  3. 매칭된 파일들의 현재 전체 내용을 GitHub API로 읽어와 Agent 프롬프트에 포함 (설계 문서 + 네임스페이스 규칙 + 이 기존 코드들)
  4. 저장소 전체를 다 읽는 게 아니라 **설계 문서가 실제로 언급한 클래스만** 골라 읽는다 — 컨텍스트 크기와 토큰 비용을 통제하기 위함
- 이렇게 실제 기존 코드를 보고 나면, Agent가 각 파일의 `changeType`(new/modified)을 더 정확하게 스스로 판단할 수 있다 — 언급된 클래스가 이미 존재하면 `modified`, 없으면 `new`
- 생성 완료 후 결과는 문서 미리보기 없이 바로 4.6 커밋 리뷰 화면으로 연결
- 로딩 상태: "코드를 생성하는 중…" (기존 코드 조회 단계가 추가되어 이전보다 다소 길어질 수 있음)

**9단계 — Documentation Agent**
- Step 진입 시 자동으로 Agent 호출, 1~8단계 전체 산출물(문서 6개 + 7~8단계 커밋된 코드 변경 요약)을 종합
- 톤: PR 설명처럼 — 무엇을 왜 만들었는지, 어떤 파일이 바뀌었는지 사람이 리뷰하기 편하게
- 결과는 4.5의 `MarkdownEditorPane`으로 바로 진입 (채팅으로 되돌아가는 경로 없음)
- 로딩 상태: "문서를 정리하는 중…"

**공통**
- 두 단계 모두 Approve 시 별도 확인 절차 없이 바로 4.5/4.6의 실제 커밋 로직으로 이어진다.

---

### 4.5 Agent 워크스페이스 — Markdown 편집/승인

> 이 절은 문서 1개짜리 산출물(1~6, 9단계)에 적용. 여러 파일이 나오는 7~8단계는 4.6 참고. 1~6단계는 4.4(채팅)를 거쳐, 9단계는 4.4a(자동 생성)를 거쳐 이 화면에 도달한다는 차이가 있을 뿐, 편집/승인 UI 자체는 동일하다.

**컴포넌트**
- `MarkdownPreview` (읽기 전용, `<pre>` 렌더링 or 실제 마크다운 렌더러 선택 필요)
- `MarkdownEditorPane` (textarea, 저장/취소)
- `ApproveBar` (반려/Approve)

**작업 목록**
1. `PUT /api/documents/{id}` — 원문 저장 (버전 증가)
2. Approve 액션:
   - `Document`를 확정 상태로 표시
   - 실제 GitHub 저장소 `docs/` 경로에 커밋 (`POST /api/repo/{id}/commit`, 파일 1개 = 커밋 1개)
   - 다음 `Step`을 `active`로 전환, 현재 `Step`은 `done` + `progress_pct = 100`
3. 반려 액션: MVP 범위에서는 "코멘트 없이 채팅으로 돌아가기" 정도로 단순화 (반려 사유 입력 UI는 Phase 2) — **단, 9단계는 채팅으로 돌아갈 곳이 없으므로 반려 시 그냥 편집 화면에 머무는 것으로 처리**
4. 편집 중 다른 Step으로 이동 시 미저장 변경 폐기 — 프로토타입 로직(`exitEditMode`) 그대로 이식, 다만 실수 방지용 confirm 다이얼로그 추가 검토

---

### 4.6 커밋 리뷰(Diff) 화면 — 코드 생성 / 코드 리뷰 단계 전용 (7~8단계)

**배경**: 7단계(코드 생성), 8단계(코드 리뷰)는 한 번의 Agent 응답으로 여러 파일이 신규/수정된다. 4.5처럼 "Approve = 커밋 1개"로 처리하면 서로 무관한 변경들이 한 커밋에 뭉쳐서, 리뷰도 어렵고 특정 변경만 되돌리기도 어렵다. 그래서 이 두 단계는 **파일 단위로 쪼갠 원자적 커밋 여러 개**를 만든다.

> **v4 변경 — diff는 LLM이 만들지 않는다.** GitHub Contents API로 파일을 커밋할 때는 패치가 아니라 **파일 전체 내용**이 필요하다. LLM이 생성한 "diff" 텍스트는 실제 파일의 정확한 줄 번호·문맥과 어긋날 수 있어 그대로 적용하면 실패하거나 엉뚱한 곳에 적용될 위험이 있다. 그래서 diff는 Agent 출력이 아니라, **서버가 실제 diff 라이브러리로 계산**하는 값으로 바꾼다.

> **v6 변경 — 커밋 직전 최소 문법 검증 추가.** 7~9단계가 채팅 없는 자동 생성(v5)으로 바뀌면서, 8단계가 7단계 산출물의 문제를 자동으로 잡아준다는 보장이 없다는 게 드러났다 (당시 8단계 Refactoring Agent는 *최초 저장소* 분석 리포트를 참고할 뿐, 7단계가 새로 만든 코드를 다시 분석하지 않았음). 근본적인 재분석 파이프라인을 새로 만드는 대신, **가장 저렴한 안전장치로 커밋 직전 Syntax 검증만 추가**했다 — 이미 있는 Roslyn 분석기를 파싱 전용으로 재사용.

> **v8 변경 — 근본 해결: 8단계의 입력 자체를 바꿈.** v6은 임시 안전장치였는데, v8에서 8단계(Code Review Agent, 구 Refactoring Agent)의 입력을 **최초 저장소 분석 리포트 → 7단계가 만든 코드(newContent) 자체**로 바꿨다. 이제 8단계는 "프로젝트 전체를 리팩토링"하는 게 아니라 **7단계 산출물만을 리뷰**하는 단계다. God Class 여부 등 구조적 판단이 필요하면, 8단계 진입 시 7단계 파일들만 대상으로 Roslyn 분석기를 (v6에서 이미 만든 파싱 전용 모드를 확장해) 다시 돌려 메서드 수 등을 뽑아 Agent에 함께 전달한다 — 최초 저장소 전체를 다시 분석하는 무거운 파이프라인은 필요 없다. v6의 Syntax 검증은 커밋 직전 마지막 안전장치로 계속 유지한다 (8단계도 결국 LLM이 코드를 다시 쓰는 것이므로).

**데이터 흐름**
```
[수정 대상 파일의 현재 전체 내용] ──┐
                                    ├─▶ Agent에게 함께 입력
[클래스/구조/ScriptableObject 설계 문서] ─┘
        ↓
Agent 출력: 파일의 "새 전체 내용" (diff 아님)
        ↓
서버가 (현재 내용 vs 새 내용)을 diff 라이브러리로 직접 계산 → 화면 표시용 diff 생성
        ↓
Approve 시: 계산된 새 전체 내용을 GitHub Contents API로 그대로 PUT (패치 적용 아님)
```

**컴포넌트**
- `FileChangeList` (파일 경로, 변경 유형 뱃지(신규/수정/삭제), 체크박스, 커밋 메시지 인라인 편집)
- `DiffViewer` (파일 클릭 시 확장되는 unified diff, 추가/삭제 라인 색상 구분 — **서버가 계산한 diff를 그대로 렌더링**, Agent가 준 diff 아님)
- `CommitSelectionBar` ("선택 항목 커밋 (N개)" 버튼)

**작업 목록**
1. 코드 생성(7단계) Agent 호출 전, **수정 대상이 될 만한 기존 파일의 현재 전체 내용을 GitHub API로 먼저 읽어와 프롬프트 입력에 포함**. 어떤 파일을 미리 읽을지는 4.4a의 v9 로직(설계 문서에서 언급된 클래스명을 최초 분석 결과와 대조)으로 정한다 — 임의로 전체 저장소를 읽지 않는다. **[v8] 8단계(Code Review Agent) 호출 전에는 GitHub에서 다시 읽어올 필요 없이, 7단계가 만든 `newContent`를 그대로 "현재 내용"으로 삼아 입력** — 8단계는 7단계 결과물에 대한 리뷰이기 때문
2. Agent 응답 포맷을 파일 단위 배열로 강제: `[{ path, changeType(new|modified|deleted), newContent, suggestedCommitMessage }]` — `diff` 필드가 아니라 **`newContent`(파일의 새 전체 내용)**로 받는다
3. 서버에서 `oldContent`(7단계는 GitHub에서 읽어온 원본 또는 빈 문자열, 8단계는 7단계의 `newContent`) vs `newContent`를 diff 라이브러리(예: `diff` npm 패키지의 `createPatch`/`diffLines`)로 비교해 unified diff 생성 후 저장
4. **[v6] 커밋 직전 최소 문법(Syntax) 검증**: `newContent`가 있는 각 파일을 `tools/analyzer/`의 Roslyn 분석기로 `CSharpSyntaxTree.ParseText()` 파싱만 돌려서 `GetDiagnostics()`에 Error 레벨 진단이 있는지 확인. (컴파일/타입 체크가 아니라 순수 문법 유효성만 — 4.2절의 "Syntax 전용" 원칙과 동일한 수준) 결과를 `syntaxValid: boolean`, `syntaxErrors: string[]`로 file-changes에 함께 저장
5. **[v8] 8단계 진입 시 구조적 지표 재계산**: 7단계 파일들만 대상으로 Roslyn 분석기(파싱 모드 확장)를 돌려 메서드 수 등을 뽑아 Code Review Agent 프롬프트에 함께 전달 (God Class 등 판단 근거). 최초 저장소 전체 분석과는 별개의 가벼운 호출
6. `GET /api/steps/{id}/file-changes` — 파일 목록 + 서버가 계산한 diff + 문법 검증 결과 조회, 프론트에서 리스트+diff+경고 렌더링
7. 사용자가 파일별 체크박스 선택 + 커밋 메시지 수정 가능. **문법 오류가 있는 파일은 기본적으로 체크 해제 상태로 노출**하고, 경고 뱃지와 에러 메시지를 보여줌 — 사용자가 원하면 체크해서 그대로 커밋할 수도 있지만(강제 진행 허용), 기본값은 안전 쪽
8. `POST /api/repo/{id}/commit-batch` — 선택된 항목의 **`newContent`를 GitHub Contents API로 그대로 PUT** (패치 적용이 아니라 파일 전체 교체), 파일 단위로 순차 커밋 처리, 각각 개별 커밋 메시지 사용
9. 체크 해제되어 이번에 커밋되지 않은 파일은 `pending_changes` 상태로 남아 다음 라운드에 다시 노출
10. 진행률(`progress_pct`) 계산 방식 변경: 이 두 단계에서는 "승인 완료된 파일 수 / 전체 제안된 파일 수"로 계산 (다른 단계의 체크리스트 기반 계산과 다른 룰이므로 `Step` 스키마에 `progress_mode` 필드 추가 검토)

**리스크**
- 수정 대상 파일의 현재 내용을 매번 GitHub API로 읽어와야 해서, Agent 호출 전에 API 호출이 하나 더 늘어남 (파일이 많으면 순차 호출 시간 증가 — 병렬화 검토)
- Agent에게 파일 전체 내용을 새로 통째로 써달라고 요청하면, 수정과 무관한 부분까지 미묘하게 바뀌어 나올 위험이 있음 — 프롬프트에 "변경이 필요 없는 부분은 원본 그대로 유지"를 명시하고, 필요하면 diff 결과를 보고 의도치 않은 변경이 있는지 사용자가 확인하는 절차를 유지
- Agent 프롬프트가 "자연어 설명 + 구조화된 파일 배열(전체 내용 포함)"을 동시에 뽑아내야 해서 응답 길이가 길어짐 — 토큰 비용/속도 증가 가능성

---

## 5. 마일스톤 (4주, 1인 개발 기준)

8주 계획을 4주로 압축한다. 압축의 기본 전략은 "기능을 빼는 것"이 아니라 **주차별 병렬 작업 범위를 넓히는 것** — 다만 반려 사유 입력 UI, 에러 케이스 화면 등은 이번 4주 스코프에서 제외한다(8절 참고). (참고: 유저별 데이터 격리는 v7에서 스코프 안으로 들어옴 — 아래 8절 참고)

| 주차 | 목표 | 산출물 |
|---|---|---|
| **1주차** | 셋업 + Repo 연결 화면 풀 구현 | Express 스캐폴딩, **.NET SDK 설치 확인 + Roslyn 분석기 프로젝트 스캐폴딩**, JSON 파일 저장 구조, **GitHub OAuth App 등록 + 로그인/콜백/토큰 교환 구현**, 로그인→저장소/Branch 선택→프리셋 unlock 동작(4.1) |
| **2주차** | 분석 엔진 MVP + 리포트 화면 + 사이드바/Step 상태 | **Roslyn Syntax 분석기 + jscpd 연동**, 리포트 화면 연동(4.2), 9단계 조회/이동/progress 계산(4.3) |
| **3주차** | 채팅형 Q&A + Gemini API 연동 | 실시간 스트리밍 대화, Agent별 프롬프트 1차 버전(4.4) |
| **4주차** | Markdown 편집/승인 + GitHub 커밋 연동(단일 파일) + 통합 QA | 승인 시 실제 커밋(4.5), 6절 체크리스트 기준 수동 QA, 버그 픽스, README |

**압축을 위해 이번 4주 안에는 하지 않는 것**
- 정교한 자동 테스트 스위트 (수동 QA 체크리스트로 대체, 6절 참고)
- 에러/실패 케이스 UI (잘못된 URL, 권한 없음 등) — 콘솔 로그 + 기본 alert 수준으로 처리
- Agent 질문 총량 동적 추정 고도화 — 1차는 Agent 프롬프트에 "대략 5~8개 질문" 정도로 고정 지시해두고 넘어감
- **4.6 커밋 리뷰(Diff) 화면 — 이번 4주 스코프 밖.** 7~8단계(코드 생성/리팩토링)는 4주 계획에 포함되지 않으므로(마일스톤이 9단계 이전까지만 다룸), 파일 단위 원자적 커밋 로직은 다음 사이클에서 착수 (**이후 v1에서 실제로 구현 완료 — 더 이상 스코프 밖이 아님**)

---

## 6. 테스트 계획

- **단위 테스트**: GitHub URL 파싱, 체크리스트 진행률 계산, Markdown 파싱 유틸
- **통합 테스트**: Repo 연결 → 분석 → Step 진행까지의 API 시나리오 (실제 테스트용 더미 저장소 하나 지정)
- **수동 QA 체크리스트**:
  - 저장소 확인 전 Branch/프리셋/시작 버튼이 정말 비활성화되는가
  - pending 단계 클릭이 실제로 막히는가 (프론트+백엔드 양쪽)
  - 편집 중 저장하지 않고 다른 단계로 이동 시 변경이 폐기되는가
  - Approve 시 실제 GitHub 저장소에 커밋이 생성되는가

---

## 7. 리스크 및 오픈 이슈

| 이슈 | 내용 | 우선순위 |
|---|---|---|
| 정적 분석 정확도 | Roslyn Syntax 전용 분석은 완전한 타입 해석이 아니므로 오탐/누락 가능 (Semantic 분석은 Unity 빌드 환경 재현 문제로 이번 스코프 제외) | 중 (리포트 문구로 기대치 관리, 정확도 개선은 후순위) |
| .NET SDK 의존성 | 분석 엔진이 .NET 콘솔 앱이라 사용자 로컬에 .NET SDK 설치가 추가로 필요함 — Node.js만 있는 환경에서는 바로 안 돌아감 | 중 — 1주차 설치 가이드/문서에 명시, 설치 여부 체크하는 헬스체크 스크립트 고려 |
| GitHub 인증 방식 | **v2: PAT 대신 GitHub OAuth 로그인으로 확정.** OAuth App은 저장소 단위로 권한을 좁힐 수 없어 `repo` 스코프 승인 시 계정이 접근 가능한 **모든** 저장소가 범위에 들어감 — Fine-grained PAT 대비 넓은 권한이라는 트레이드오프를 감수하고 사용자 경험(로그인 한 번, 드롭다운 선택)을 우선한 결정. 로그인 전 안내 문구로 이 범위를 명확히 고지할 것 | 높음 — 1주차에 OAuth App 등록·구현 |
| OAuth 구현 복잡도 | 리다이렉트, 콜백, code→token 교환, 세션 관리까지 PAT 방식보다 구현 항목이 많아 1주차 작업량이 원래 계획보다 늘어남 | 중 — 밀리면 4.6(커밋 리뷰 화면, v1에서 구현 완료)보다 우선순위 낮은 항목부터 조정 |
| Agent 질문 총량의 동적 추정 | "질문 N/전체"가 실제로는 가변적 — UI 문구 오해 소지 | 중 |
| 대용량 저장소 분석 성능 | "상세" 프리셋이 큰 프로젝트에서 얼마나 걸릴지 미검증 | 중 — 실측 후 타임아웃/진행바 설계 필요 |
| Markdown ↔ JSON 저장소 동기화 충돌 | 사용자가 저장소를 외부에서 직접 수정하는 경우 | 낮음 (MVP는 앱 내 편집만 공식 경로로 취급) |
| 4주 압축 일정 | 8주 계획 대비 절반 — 병렬 작업(백엔드/프론트 동시 진행) 전제, 밀리면 4.5(GitHub 커밋 연동)부터 후순위로 미룰 것 | 높음 — 매주 진행 상황 체크 필요 |
| AI 벤더 전환 (Claude → Gemini) | v3에서 확정. Day 7(리포트 생성)까지는 프롬프트가 텍스트 요약 위주라 이식 부담이 적지만, Day 9~10(채팅 Q&A, 스트리밍)은 SDK 호출 방식·스트리밍 API·system prompt 처리 방식이 달라 코드 재작성이 필요함. 이미 Claude 기준으로 작성된 프롬프트/SDK 코드가 있다면 이번 전환 시 재검토 필요 | 높음 — 전환 시점에 영향받는 모든 Day(7, 9, 10) 재점검 |
| 유저별 데이터 격리 누락 (v7) | 세션 미들웨어를 빠뜨린 라우트가 하나라도 있으면, 그 라우트만 `req.userId` 없이 동작해서 다른 유저의 데이터를 읽거나 덮어쓸 위험이 있음. 이미 구현된 라우트가 많은 시점(v7 도입)에 추가하는 거라 누락 가능성이 실재함 | 높음 — 전체 라우트 목록을 두고 미들웨어 적용 여부 전수 점검 필요 |
| 세션 쿠키 보안 | `session_id` 서명 키(`SESSION_SECRET`) 관리, 쿠키 탈취 시 다른 유저 세션으로 위장 가능 — HttpOnly/Secure 플래그, 만료 시간 설정 필요 | 중 — 로컬 개발 단계에선 낮은 우선순위, 배포 시 재점검 필수 |
| 기존 코드 컨텍스트 매칭 정확도 (v9) | 설계 문서의 클래스명과 실제 저장소 클래스명이 표기가 다르면(오탈자, 동의어 등) 매칭 실패 → 존재하는 클래스를 못 찾고 중복 생성(new)해버릴 위험. 완벽한 매칭 로직 없이 문자열 대조 수준이라 한계가 있음 | 중 — 매칭 실패 시 최소한 사용자가 커밋 리뷰 화면에서 "어? 이거 이미 있는 클래스인데 새로 만들었네" 하고 알아챌 수 있게, changeType이 new인 파일 중 저장소에 동일 경로가 있으면 경고 뱃지 추가 검토 |
| 컨텍스트 크기/토큰 비용 (v9) | 설계 문서가 많은 클래스를 언급할수록 함께 읽어오는 기존 파일 수가 늘어나 프롬프트가 커짐 — 응답 속도/비용 증가 | 낮음~중 — 일단 구현 후 실제 크기 보고 필요시 요약·발췌 전략 검토 |

---

## 8. 이번 계획에서 제외한 것 (다음 단계)

- Feature Expansion Workflow (기존 프로젝트에 새 기능 추가, 원 기획서 11번)
- 반려 사유 입력 UI
- UML 자동 생성/시각화, Unity Scene 분석 (Future Work 16번)
- GitHub Pull Request 자동 생성
- 다양한 LLM Provider 지원
- **[v7] 유저 1명당 여러 프로젝트 관리** (프로젝트 목록/전환 UI) — 데이터 격리 자체는 v7에서 구현하지만, "유저당 프로젝트 1개"로 제한. 여러 프로젝트를 만들고 전환하는 기능은 다음 단계
- 세션 만료/재로그인 흐름의 정교한 처리 (지금은 만료되면 그냥 401 → 재로그인 유도 정도)
