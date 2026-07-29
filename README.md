# GameForge Agent

Unity 게임 개발을 지원하는 Multi-Agent 기반 AI 개발 지원 도구. 프로젝트 전체 Context를 Markdown으로 유지하며, 9단계 워터폴 워크플로우(요구사항 분석 → 게임 기획 → 게임 시스템 설계 → 클래스 설계 → 프로젝트 구조 설계 → ScriptableObject 설계 → 코드 생성 → 리팩토링 및 코드 리뷰 → 문서화)를 순서대로 진행한다. 자세한 기획/설계는 [`docs/`](docs/) 참고.

## 실행

```
cd server && npm run dev   # http://localhost:4000
cd client && npm run dev   # http://localhost:5173
cd tools/analyzer && dotnet build && dotnet run -- <folder-path>
```

`server/.env.example`을 `server/.env`로 복사하고 값을 채운 뒤 실행합니다 (GitHub OAuth App 클라이언트 ID/Secret, Gemini API Key 등).

## 디렉토리 구조

```
client/                  React + Vite + TypeScript
  src/
    pages/               화면 단위 (RepoConnectPage, AnalysisReportPage, WorkspacePage, CommitReviewPage)
    components/          GithubLoginButton, RepoSelect, BranchSelect, AnalysisPresetPicker,
                          StepSidebar/StepRow, WorkspaceMainPanel, ChatThread/ChatInput,
                          MarkdownViewer/MarkdownEditor, FileChangeList, DiffViewer
    styles/              tokens.css(디자인 토큰) + base.css(공용 컴포넌트 스타일)
    lib/                 API_BASE_URL, 공유 타입(api.ts), 서버 계산 diff 파싱(diff.ts)

server/                  Express + TypeScript
  src/
    routes/              /api/auth, /api/repo(목록/branch/commit-batch), /api/analysis,
                          /api/steps(progress_pct/approve), /api/chat, /api/documents
    utils/                jsonStore(파일 mutex), paths, session, analyzer(dotnet spawn 래퍼),
                          jscpd, refactorTargets, geminiReport,
                          agentPrompts/agentChat(문서형 6개 Agent),
                          fileAgentPrompts/fileAgentChat(코드생성/리팩토링 Agent),
                          fileChanges(파일 변경 저장), diffCompute(서버 계산 diff),
                          github(Contents API PUT/DELETE, sha 재조회)

tools/analyzer/          .NET 콘솔 앱 (Roslyn, Syntax 전용 파싱) — server가 child_process.spawn으로 실행

data/                    JSON 파일 저장소 (session.json은 git에서 제외됨 — access token 보관)
  project.json steps.json
  documents/ messages/ checklist/ file-changes/

docs/                    기획서, UI 설계, 제작계획, 주차별 작업 목록
.claude/skills/gameforge-ui-style/   디자인 시스템 스킬 (프로토타입에서 추출한 토큰/컴포넌트 규칙)
presentation/            발표 자료
```

## 구현 현황 (4주차 완료 기준)

### 되는 것

- **로그인/저장소 연결**: GitHub OAuth 로그인(Authorization Code Flow), 저장소/Branch 목록 조회, 진행형 잠금 UI(저장소 확인 전 Branch/분석 비활성화)
- **정적 분석**: Roslyn 기반 Syntax 전용 분석(클래스/의존성), jscpd 중복 코드 탐지, God Class/순환 의존성 룰 기반 플래그, Gemini 기반 분석 리포트 생성 및 Markdown 뷰어/에디터
- **9단계 워크플로우 전체**:
  - 문서형 6개 Agent(요구사항/게임 기획/게임 시스템/클래스 설계/프로젝트 구조/ScriptableObject) + 문서화 Agent: 채팅형 Q&A → 구조화 출력(Gemini `responseSchema`)으로 Markdown 문서 자동 생성 → 원문 수정 → Approve
  - 코드 생성/리팩토링 Agent(7~8단계): 채팅형 Q&A → 파일별 `{path, changeType, newContent, suggestedCommitMessage}` 구조화 출력 → 서버가 (기존 내용 vs newContent)를 비교해 unified diff 직접 계산 → 커밋 리뷰 화면(체크박스 선택 + 실시간 커밋 개수 카운트 + 커밋 메시지 인라인 수정)
  - 진행형 잠금(완료/진행 중 단계만 열람 가능), Step별 progress_pct(문서형은 체크리스트 기준, 코드형은 승인된 파일 수 기준)
- **실제 GitHub 커밋 연동**: 문서형 Agent의 Approve는 `docs/{path}`를 실제 저장소에 커밋. 코드/리팩토링 단계는 "선택 항목 커밋" 시 선택된 파일만 GitHub Contents API로 파일 단위 원자적 커밋(PUT/DELETE), 커밋 직전 최신 sha 재조회로 충돌 방지, 체크 해제된 파일은 다음 라운드에 다시 노출
- **최소 에러 처리**: 채팅/커밋/데이터 로드 실패 시 "실패했습니다, 다시 시도해주세요" 수준의 안내 메시지, 구조화 JSON 파싱 실패 시 최대 2회 재시도(파일형 Agent)

### 아직 안 되는 것

- Feature Expansion Workflow (기존 프로젝트에 새 기능 추가) — 9단계 워크플로우 완성 이후 다음 사이클
- 자동 테스트 스위트 — 수동 확인으로 대체
- 스트리밍 응답(SSE) — 단발 요청/응답
- 정교한 에러 분기(재시도 정책, 세분화된 에러 코드별 UI) — 최소 수준 메시지만
- 다중 사용자 지원 — 1인 사용 기준
- UML 자동 생성/시각화, Unity Scene 분석, GitHub PR 자동 생성, 다양한 LLM Provider 지원
