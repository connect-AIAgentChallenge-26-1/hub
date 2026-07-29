# GameForge Agent — 제작 계획 (Development Plan)

> [GameForge_Agent.md](./GameForge_Agent.md)(기획) · [GameForge_Agent_UI_Spec.md](./GameForge_Agent_UI_Spec.md)(UI 설계)를 실제로 구현하기 위한 작업 계획.
> 대상: 1인 인디 개발자 기준으로 우선순위와 작업 단위를 쪼갰다.

---

## 0. 전제 조건 및 스코프

- 실행 환경: 로컬 우선 (개인 개발 PC에서 구동), 추후 배포는 후순위
- 대상 저장소: 사용자가 소유/쓰기 권한을 가진 GitHub Repository
- AI: Google Gemini API — Agent별로 system prompt만 다르고 동일 모델 사용 (원 기획서 6번 원칙)
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
     │  (REST + SSE for chat streaming)
     ▼
[API Server: Express]
     ├── /api/auth/github/login     → GitHub OAuth 인증 페이지로 리다이렉트
     ├── /api/auth/github/callback  → code→token 교환, 세션에 access token 저장
     ├── /api/repo/*                → GitHub API 연동 (내 저장소 목록, branch 목록, 파일 커밋)
     ├── /api/analysis/*            → 저장소 분석 요청 접수 → 분석 엔진 spawn → 결과 JSON을 Gemini에 넘겨 리포트 텍스트화
     ├── /api/steps/*               → 9단계 상태/진행률 CRUD
     ├── /api/chat/*                → Agent와의 대화 (Gemini API 프록시, SSE 스트림)
     └── /api/documents/*           → Markdown 문서 조회/저장/버전
     │
     ├──spawn──▶ [.NET 콘솔 앱: Roslyn Syntax 분석기] ──stdout JSON──▶ (의존성 그래프, 메서드 수 등)
     ├──lib────▶ [jscpd] (중복 코드 탐지)
     ▼
[JSON 파일 저장소]     [Target GitHub Repo]         [Gemini API]
 (data/steps.json,      (docs/*.md 커밋,              (Agent 응답 생성 +
  data/messages/*.json,  소스 코드 읽기)                분석 결과 리포트화)
  data/documents/*.json)
```

**분석 파이프라인 흐름**: `분석 요청 → Roslyn 분석기(child process) 실행 → 클래스/의존성 JSON 추출 → jscpd로 중복 블록 탐지 → 두 결과를 합쳐 Gemini API에 전달 → 사람이 읽는 Markdown 리포트로 변환`. 탐지는 결정론적 도구가, 설명은 Gemini가 담당하는 구조.

---

## 3. 데이터 모델 (초안)

DB 엔진 없이 Express 서버가 `data/` 디렉토리 아래 JSON 파일을 직접 읽고 쓰는 구조. 파일당 스키마를 고정해두면 나중에 SQLite/Postgres로 옮길 때도 필드 매핑만 하면 되도록 설계.

```
data/
├── session.json              -- 단일 객체 (OAuth 로그인 세션)
│     { github_login, github_avatar_url, access_token(암호화 또는 최소 권한 스코프로 저장), expires_at }
│
├── project.json              -- 단일 객체
│     { id, repo_full_name, branch, connected_at, analysis_preset }
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
└── checklist/
      └── {step_id}.json      -- Document.content 파싱 결과 (파생 데이터, 저장 시 재생성)
            [{ label, checked }]
```

- `session.json`의 `access_token`은 OAuth 로그인으로 발급받은 토큰 — 평문 저장 금지, 최소한 파일 권한 제한(600) + 가능하면 OS 키체인/암호화 적용 (1주차 확정 필요, 7절 리스크 참고)
- `documents/{step_id}.json`의 `content`는 항상 실제 저장소 `docs/{path}`와 동기화 (저장 시 로컬 캐시 갱신, Approve 시에만 실제 커밋)
- 동시 쓰기 충돌은 1인 사용 기준이라 낙관적 락 없이 단순 덮어쓰기로 처리 (다중 사용자 지원 시점에 재검토)
- 파일 I/O는 `fs/promises` + 디렉토리별 락(간단한 mutex)으로 처리해 동시 요청 시 파일 깨짐 방지

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
2. `GET /api/auth/github/callback` — `code`를 access token으로 교환(`POST https://github.com/login/oauth/access_token`), `session.json`에 저장, 프론트를 Repo 연결 화면으로 리다이렉트
3. `GET /api/repo/list` — 저장된 토큰으로 `GET /user/repos` 호출, 저장소 목록(이름, private 여부, default branch) 반환
4. `GET /api/repo/:fullName/branches` — 저장소 선택 시 branch 목록 조회
5. 프론트: 로그인 전 `RepoSelect`·`BranchSelect`·프리셋·시작 버튼 모두 `disabled` → 로그인 성공 시 `RepoSelect`만 활성화 → 저장소 선택 시 `BranchSelect` 활성화 → Branch 선택 시 프리셋 활성화 (UI Spec 2절의 단계적 잠금 표 그대로 구현)
6. `POST /api/analysis/start` — 프리셋(빠름/기본/상세)에 따라 분석 job 큐잉
7. 로그아웃/계정 전환 UI — `session.json` 삭제 후 로그인 화면으로 복귀 (최소 기능만)
8. 에러 케이스 UI (로그인 실패, 토큰 만료) — *현재 스코프 밖, Phase 2로 이관*

**의존성**: GitHub OAuth App 등록(Client ID/Secret), access token 저장 방식 확정(3절 `session.json` 참고 — 최소 파일 권한 제한 필요)

**리스크**: OAuth 플로우는 PAT 입력받는 것보다 구현 항목이 많다 (리다이렉트, 콜백, 토큰 교환, 세션 관리) — 제작계획 5절 마일스톤에서 1주차 비중이 원래 계획보다 커졌음을 인지하고 진행 (7절 리스크 참고)

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

**컴포넌트**
- `ChatThread` (메시지 리스트, 자동 스크롤)
- `ChatInput` (텍스트 입력 + 전송, Enter 지원)
- `TypingIndicator`

**작업 목록**
1. `POST /api/chat/{step_id}/message` — 사용자 메시지 저장 → Gemini API 호출(해당 Agent의 system prompt + 이전 대화 이력 + 이전 단계 md 컨텍스트) → 응답 스트리밍
2. SSE 또는 WebSocket으로 "입력 중…" → 실제 토큰 스트리밍 반영 (프로토타입의 `setTimeout` 딜레이를 실제 스트림으로 대체)
3. Agent가 질문을 "충분히 모았다"고 판단하면 자동으로 Markdown 문서 초안을 생성하도록 프롬프트 설계 (예: "8개 질문에 답변이 모이면 문서화 단계로 전환한다"는 지침을 system prompt에 명시)
4. 질문 개수는 Agent별로 유동적일 수 있음 — UI의 `질문 N / 전체`는 총량을 Agent가 추정해 알려주는 방식으로 설계 (고정 8개가 아니라 Agent 응답에서 `total_estimate` 필드를 받아 갱신)

**Agent별 프롬프트 설계 원칙** (모든 Agent 공통)
- Input: 이전 단계 Markdown 문서 전체 + 현재까지의 대화 이력
- Output: 사람이 읽는 응답 텍스트 + (내부적으로) 갱신된 Markdown 문서 초안
- 문서 생성 시점: 사용자가 "이제 정리해줘" 또는 Agent가 스스로 판단해 요약 시그널을 보낼 때

---

### 4.5 Agent 워크스페이스 — Markdown 편집/승인

> 이 절은 문서 1개짜리 산출물(1~6, 9단계)에 적용. 여러 파일이 나오는 7~8단계는 4.6 참고.

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
3. 반려 액션: MVP 범위에서는 "코멘트 없이 채팅으로 돌아가기" 정도로 단순화 (반려 사유 입력 UI는 Phase 2)
4. 편집 중 다른 Step으로 이동 시 미저장 변경 폐기 — 프로토타입 로직(`exitEditMode`) 그대로 이식, 다만 실수 방지용 confirm 다이얼로그 추가 검토

---

### 4.6 커밋 리뷰(Diff) 화면 — 코드 생성 / 리팩토링 단계 전용 (7~8단계)

**배경**: 7단계(코드 생성), 8단계(리팩토링 및 코드 리뷰)는 한 번의 Agent 응답으로 여러 파일이 신규/수정된다. 4.5처럼 "Approve = 커밋 1개"로 처리하면 서로 무관한 변경들이 한 커밋에 뭉쳐서, 리뷰도 어렵고 특정 변경만 되돌리기도 어렵다. 그래서 이 두 단계는 **파일 단위로 쪼갠 원자적 커밋 여러 개**를 만든다.

> **v4 변경 — diff는 LLM이 만들지 않는다.** GitHub Contents API로 파일을 커밋할 때는 패치가 아니라 **파일 전체 내용**이 필요하다. LLM이 생성한 "diff" 텍스트는 실제 파일의 정확한 줄 번호·문맥과 어긋날 수 있어 그대로 적용하면 실패하거나 엉뚱한 곳에 적용될 위험이 있다. 그래서 diff는 Agent 출력이 아니라, **서버가 실제 diff 라이브러리로 계산**하는 값으로 바꾼다.

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
1. 코드 생성/리팩토링 Agent 호출 전, **수정 대상 파일의 현재 전체 내용을 GitHub API로 먼저 읽어와 프롬프트 입력에 포함** (신규 파일은 해당 없음)
2. Agent 응답 포맷을 파일 단위 배열로 강제: `[{ path, changeType(new|modified|deleted), newContent, suggestedCommitMessage }]` — `diff` 필드가 아니라 **`newContent`(파일의 새 전체 내용)**로 받는다
3. 서버에서 `oldContent`(위 1번에서 읽어온 현재 내용, 신규 파일은 빈 문자열) vs `newContent`를 diff 라이브러리(예: `diff` npm 패키지의 `createPatch`/`diffLines`)로 비교해 unified diff 생성 후 저장
4. `GET /api/steps/{id}/file-changes` — 파일 목록 + 서버가 계산한 diff 조회, 프론트에서 리스트+diff 렌더링
5. 사용자가 파일별 체크박스 선택 + 커밋 메시지 수정 가능
6. `POST /api/repo/{id}/commit-batch` — 선택된 항목의 **`newContent`를 GitHub Contents API로 그대로 PUT** (패치 적용이 아니라 파일 전체 교체), 파일 단위로 순차 커밋 처리, 각각 개별 커밋 메시지 사용
7. 체크 해제되어 이번에 커밋되지 않은 파일은 `pending_changes` 상태로 남아 다음 라운드에 다시 노출
8. 진행률(`progress_pct`) 계산 방식 변경: 이 두 단계에서는 "승인 완료된 파일 수 / 전체 제안된 파일 수"로 계산 (다른 단계의 체크리스트 기반 계산과 다른 룰이므로 `Step` 스키마에 `progress_mode` 필드 추가 검토)

**리스크**
- 수정 대상 파일의 현재 내용을 매번 GitHub API로 읽어와야 해서, Agent 호출 전에 API 호출이 하나 더 늘어남 (파일이 많으면 순차 호출 시간 증가 — 병렬화 검토)
- Agent에게 파일 전체 내용을 새로 통째로 써달라고 요청하면, 수정과 무관한 부분까지 미묘하게 바뀌어 나올 위험이 있음 — 프롬프트에 "변경이 필요 없는 부분은 원본 그대로 유지"를 명시하고, 필요하면 diff 결과를 보고 의도치 않은 변경이 있는지 사용자가 확인하는 절차를 유지
- Agent 프롬프트가 "자연어 설명 + 구조화된 파일 배열(전체 내용 포함)"을 동시에 뽑아내야 해서 응답 길이가 길어짐 — 토큰 비용/속도 증가 가능성

---

## 5. 마일스톤 (4주, 1인 개발 기준)

8주 계획을 4주로 압축한다. 압축의 기본 전략은 "기능을 빼는 것"이 아니라 **주차별 병렬 작업 범위를 넓히는 것** — 다만 3.2 다중 사용자 대비, 반려 사유 입력 UI, 에러 케이스 화면 등은 이번 4주 스코프에서 제외한다(8절 참고).

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
| OAuth 구현 복잡도 | 리다이렉트, 콜백, code→token 교환, 세션 관리까지 PAT 방식보다 구현 항목이 많아 1주차 작업량이 원래 계획보다 늘어남 | 중 — 밀리면 4.6(커밋 리뷰 화면, 이미 4주 스코프 밖)보다 우선순위 낮은 항목부터 조정 |
| Agent 질문 총량의 동적 추정 | "질문 N/전체"가 실제로는 가변적 — UI 문구 오해 소지 | 중 |
| 대용량 저장소 분석 성능 | "상세" 프리셋이 큰 프로젝트에서 얼마나 걸릴지 미검증 | 중 — 실측 후 타임아웃/진행바 설계 필요 |
| Markdown ↔ JSON 저장소 동기화 충돌 | 사용자가 저장소를 외부에서 직접 수정하는 경우 | 낮음 (MVP는 앱 내 편집만 공식 경로로 취급) |
| 4주 압축 일정 | 8주 계획 대비 절반 — 병렬 작업(백엔드/프론트 동시 진행) 전제, 밀리면 4.5(GitHub 커밋 연동)부터 후순위로 미룰 것 | 높음 — 매주 진행 상황 체크 필요 |
| AI 벤더 전환 (Claude → Gemini) | v3에서 확정. Day 7(리포트 생성)까지는 프롬프트가 텍스트 요약 위주라 이식 부담이 적지만, Day 9~10(채팅 Q&A, 스트리밍)은 SDK 호출 방식·스트리밍 API·system prompt 처리 방식이 달라 코드 재작성이 필요함. 이미 Claude 기준으로 작성된 프롬프트/SDK 코드가 있다면 이번 전환 시 재검토 필요 | 높음 — 전환 시점에 영향받는 모든 Day(7, 9, 10) 재점검 |

---

## 8. 이번 계획에서 제외한 것 (다음 단계)

- Feature Expansion Workflow (기존 프로젝트에 새 기능 추가, 원 기획서 11번)
- 반려 사유 입력 UI
- UML 자동 생성/시각화, Unity Scene 분석 (Future Work 16번)
- GitHub Pull Request 자동 생성
- 다양한 LLM Provider 지원
