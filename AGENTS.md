## 프로젝트

CareerSignal은 채용공고의 직무 공통 기대치와 기업군·개별 공고의 추가 요구를 해석해, 실제로 원하는 수준과 준비 방법을 알려주는 대학생 진로탐색 리서치 에이전트다.

네이버 AI Agent Challenge에서 진행하는 개인 프로젝트다.

- 서비스: https://careersignal-iota.vercel.app
- 정적 프로토타입 데모: https://careersignal-prototype.vercel.app/ — 백엔드 공고 30건을 가정한 mock 데이터로 화면 구성만 담는다.

## 기술 스택과 영역

- `prototype/`: HTML/CSS 전용 정적 프로토타입. JavaScript와 React를 사용하지 않으며 독립적으로 배포한다.
- `project-intro/`: 프로젝트 소개 페이지 React 화면. 실제 서비스와 별개 산출물이며, 자체 `package.json`·`vite.config.js`를 갖는 독립 실행 환경이다.
- `product/`: 실제 서비스 React 코드. 마찬가지로 자체 `package.json`·`vite.config.js`를 갖는 독립 실행 환경이다.
- `server/`: product 전용 Express 백엔드. 역시 별도의 실행 환경·`package.json`을 유지한다.
- `prototype/`, `project-intro/`, `product/`, `server/`는 서로 다른 실행 환경이라 코드를 공유하지 않는다. 두 개 이상에서 실제 재사용이 필요해지면 그때 공유 방법(예: 워크스페이스, 패키지 추출)을 별도로 검토한다.
- `agent/`: AI 에이전트용 Python·FastAPI 서비스. 실행 순서·상태 공유·재시도는 `orchestration/`이 직접 정의하고(docs/adr/0016-no-orchestration-framework.md), Express가 내부 HTTP로 호출한다.
- DB: Supabase(Postgres + pgvector). 일반 화면은 사전 생성된 활성 분석 결과를 조회하고, 에이전트는 데이터 갱신과 사용자 공고 직접 입력 때 실행한다. `server/data/`의 JSON 파일은 샘플 데이터의 원본 fixture다.
- 최종 서비스는 이용 조건을 확인한 실제 자료를 직무별로 축적하고 정기 갱신·사용자 공고 입력 때 배포된 FastAPI 에이전트를 실행한다. 생성 데이터 우선 적용은 이 목표를 바꾸지 않고 자료 확보와 서비스 완성의 순서만 분리한다.

### `agent/` 내부 구조

```text
agent/
├─ pyproject.toml
├─ requirements.txt
├─ alembic.ini
├─ main.py                         `careersignal.api`의 app 을 노출한다
├─ migrations/                     데이터베이스 스키마의 기준
├─ data/manifest/                  수집 대상 목록
├─ data/sources/                   내려받은 원문. 저장소에 두지 않는다
├─ data/demo_seed/                 생성 데이터 CSV 와 그 규약(CONTRACT.md)
├─ scripts/                        연결 점검, 수집·색인 실행, 생성 데이터 적재
├─ src/careersignal/
│  ├─ api/                         FastAPI 라우트. 분석 네 경로와 사용자 공고 분석
│  ├─ contracts/                   Pydantic 공통 실행 계약
│  ├─ domain/                      순수 개념. 저장소·모델을 import하지 않는다
│  ├─ orchestration/               Control Plane. 영향 범위·실행 순서·활성화
│  ├─ agents/                      collector · statistics · interpretation ·
│  │                               strategy · roadmap · knowledge
│  ├─ pipelines/                   결정적 helper. 에이전트를 호출하지 않는다
│  ├─ retrieval/                   라우터·검색·융합·재정렬·근거 집합
│  ├─ verification/                검사 여덟 종과 통합 검증
│  ├─ taxonomy/                    차원 발견·승격·할당
│  ├─ graph/                       온톨로지·그래프 구축·탐색
│  ├─ wiki/                        깊이 기준 생성
│  ├─ metrics/                     지표 정의·실행·정책
│  ├─ repositories/                데이터베이스 접근의 유일한 경로
│  ├─ providers/                   모델 제공자별 어댑터
│  ├─ evaluation/                  평가 세트 적재·채점·비교
│  └─ telemetry/                   실행·검색·도구 호출 기록
└─ tests/
```

세 가지 경계를 지킨다.

- `contracts/`와 `domain/`은 저장소와 모델을 import하지 않는다.
- 데이터베이스 접근은 `repositories/`만 수행한다. 이 경계가 구성요소별 권한을 코드 구조로 강제한다.
- `orchestration/`은 `pipelines/` 밖에 둔다. 오케스트레이터만 에이전트를 스케줄링하고, helper 파이프라인은 에이전트를 시작하지 않는다.

계층의 정의는 docs/architecture.md 2장에 있다.

## 배포

- Vercel 프로젝트는 둘이다. 하나는 `prototype/`을, 하나는 `product/`를 Root Directory로 사용한다. 서비스 주소는 https://careersignal-iota.vercel.app 다.
- Render의 Blueprint(`server/render.yaml`)가 Express와 FastAPI 두 서비스를 띄운다. 브라우저가 부르는 주소는 Express뿐이다.
- 저장소는 Supabase(Postgres + pgvector)다.
- 배포 설정의 기준 문서는 `server/README.md`와 `product/README.md`다.
- 수정은 `day/YYMMDD` 작업 브랜치에 커밋하고 `origin`에 push한 뒤 배포 결과를 확인한다.
- 각 프로젝트는 실행과 배포에서 서로 의존하지 않는다.

## 컨벤션

- 커밋: 영어 Conventional Commit 메시지(`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`)를 사용한다.
- 브랜치: `day/YYMMDD`. 그날 작업 전체를 담고 설명 접미사는 붙이지 않는다.
- PR: upstream의 `N086_박주현` 브랜치로 보낸다. PR 타이틀은 `[N086_박주현] - 요약` 형식이다. 교육 과정 규칙상 **하루에 PR은 한 번만** 보낸다.
- 업스트림 기준 브랜치: 이 교육 프로그램은 학생마다 upstream에 개인 브랜치를 두고 그 브랜치를 `main`처럼 사용한다. 나의 기준 브랜치는 `upstream/N086_박주현`이다. `day/YYMMDD` 브랜치를 새로 만들 때도, 최신화(`fetch`·`merge`)할 때도, PR을 보낼 때도 전부 `upstream/main`이 아니라 `upstream/N086_박주현`을 기준으로 한다.
- 오리진 기준 브랜치: 오리진(개인 GitHub 포크)의 기준 브랜치도 동일하게 `N086_박주현`이다. `day/YYMMDD` 브랜치를 새로 만들기 전에 로컬 `N086_박주현`을 `upstream/N086_박주현`으로 최신화하고, `origin`에도 push해 두 원격을 같은 상태로 맞춘다.
- 로컬 작업 브랜치: `day/YYMMDD`에서 파일을 수정하기 전에 커밋 가능한 작업 단위마다 타입과 맞춘 이름(`feat/<설명>`, `fix/<설명>`, `docs/<설명>`, `chore/<설명>`, `refactor/<설명>`)의 로컬 브랜치를 반드시 만든다. 이 브랜치는 원격에 push하지 않는다. 한 작업 단위를 커밋·병합하기 전에는 다음 작업 단위의 파일을 수정하지 않는다. 작업이 끝나면 `git merge --no-ff`로 `day/YYMMDD`에 병합해 작업 단위 경계를 커밋 그래프에 남기고, 병합 후 로컬 브랜치는 삭제한다. 하루 PR이 한 번이므로 원격에는 병합이 끝난 `day/YYMMDD`만 push하고, 그 브랜치로 PR을 연다.
- git 명령어: 브랜치 전환·생성은 `git switch`(`git switch -c`), 파일 복원은 `git restore`를 쓴다. `git checkout`은 다른 브랜치의 파일 하나만 가져오는 것처럼 switch/restore로 표현이 안 되는 경우에만 쓴다.

### AI 도구의 Git 사용

- 읽기 전용 Git 명령은 `GIT_OPTIONAL_LOCKS=0`을 붙여 실행한다. `git status`와 `git diff`는 인덱스 갱신을 위해 `.git/index.lock`을 생성하는데, AI 도구의 실행 환경이 저장소를 마운트로 접근하면 이 파일을 삭제하지 못한다. 남은 락은 이후 모든 Git 작업을 차단한다.

```bash
GIT_OPTIONAL_LOCKS=0 git status --short --branch
GIT_OPTIONAL_LOCKS=0 git diff --stat
```

PowerShell은 `VAR=value command` 표기를 지원하지 않는다. 세션마다 한 번 환경변수를 설정하고 명령을 실행한다.

```powershell
$env:GIT_OPTIONAL_LOCKS = "0"
git status --short --branch
```

- 저장소 상태를 바꾸는 명령은 사용자가 직접 실행한다.
- Git 명령 출력에 경고가 있으면 그대로 진행하지 않고 사용자에게 알린다. `unable to unlink` 경고는 락이 남았다는 뜻이며, 사용자가 `Remove-Item .git\index.lock`으로 제거한다.

### 하루 작업 흐름

1. `git switch N086_박주현` — 로컬 기준 브랜치로 전환한다.
2. `git pull upstream N086_박주현` — 로컬 기준 브랜치를 upstream 최신 상태로 맞춘다.
3. `git push origin N086_박주현` — 오리진(포크)도 같은 상태로 동기화한다.
4. `git switch -c day/YYMMDD` — 오늘 작업 브랜치를 로컬 `N086_박주현`에서 만든다.
5. 성격이 다른 작업 단위마다 `git switch -c <type>/<설명>`으로 로컬 브랜치를 만들어 커밋한다.
6. 작업이 끝난 로컬 브랜치는 `git switch day/YYMMDD`, `git merge --no-ff <type>/<설명>`, `git branch -d <type>/<설명>` 순서로 병합·삭제한다.
7. 하루 작업이 끝나면 `git push origin day/YYMMDD` 후 upstream의 `N086_박주현`으로 PR을 연다.

## 작업 방식

- 답변은 항상 존댓말로 한다.
- 사용자는 웹 개발이 처음이다. 새 파일·폴더의 위치와 이유를 짧게 설명한다.
- 브랜치 생성·전환, pull·push·merge·commit·rebase·reset 등 저장소 상태를 바꾸는 Git 명령은 사용자가 직접 실행한다. 제시할 때는 실행 순서, 짧은 설명, 예상 결과를 함께 제공하고, PowerShell 기준으로 한 줄씩 제시한다(`&&` 미지원).
- AI 도구는 파일 수정 전에 `git branch --show-current`와 `git status --short --branch`로 작업 브랜치와 변경 상태를 확인한다. `day/YYMMDD`에 있으면 사용자에게 작업 브랜치 생성 명령을 안내하고 전환 결과를 확인한 뒤 파일을 수정한다. `git diff`·`git log`·`git show`·`git remote` 등 다른 읽기 전용 Git 명령도 상태 확인에 사용할 수 있다.
- 화면 구성은 판단용 HTML 시안(레포 밖, 커밋하지 않음)으로 사용자 확정을 받은 뒤 구현한다. `server/`·`agent/` 코드 변경 후에는 재시작이 필요함을 함께 안내한다.
- 파일 수정은 작업 범위 안에서 직접 수행한다. 삭제·이동·rename은 사용자의 명시적 요청과 대상 경로 확인 후 진행한다.
- 파일 작업은 커밋 가능한 단위로 나누고, 각 단위가 끝날 때 변경 범위와 권장 커밋 메시지를 사용자에게 안내한다.
- `.gitkeep`은 빈 디렉터리 자체가 저장소 산출물로 필요한 경우에만 사용한다. 파일이 생긴 디렉터리나 가이드가 빈 디렉터리를 요구하지 않는 위치에는 두지 않는다.
- 정적 프로토타입은 JavaScript·동적 기능 없이 정보·스타일·화면 구성만 다룬다. 실제 동적 기능은 `product/`와 `server/`에서 구현한다.

## 문서 작성 규칙

`docs/`의 기획서·설계서 등 공식 문서에 적용한다.

- 공식 문서는 확정된 설계를 무시제·선언형으로만 기술한다. 작업 일지, 시행착오, 정정 과정, 해명("~가 아니라 ~", "예외 하나", "~를 완료했다", "남은 것은")을 쓰지 않는다.
- 진행 상태 표기(완료·진행 중·예정·확정·유력)는 `backlog.md`와 `checklist.md`에서만 쓴다. 다른 문서에서 상태가 필요하면 백로그를 링크한다.
- 편집자 논평과 수사("정직하게", "제대로", "깊이 있게")를 쓰지 않는다. 설계 근거가 필요하면 한 문장 이내로 남긴다.
- 문서는 작업한 시간 순서가 아니라 구조의 논리 순서(사용자 → 화면 → 백엔드 → 에이전트 → 데이터)로 조직한다.
- 능력을 과장하는 표현을 쓰지 않는다. 대체 불가, 자동 반영, 코드 변경 없음 같은 표현 대신 실제 조건과 제약을 함께 기술한다.
- 문서를 수정하면 수정본 전체를 다시 읽고, 위 규칙 위반과 옛 용어 잔재를 점검한 뒤 마친다.

### 문서 소유권

각 주제에는 기준 문서가 하나만 있다. 다른 문서는 같은 내용을 복사하지 않고 기준 문서를 링크한다.

| 내용 | 기준 문서 |
| --- | --- |
| 실행 계층·구성요소 경계·버전 활성화·계측 | `docs/architecture.md` |
| 에이전트 루프·도구·검증·신뢰도·종료 | `docs/agent-design.md` |
| 데이터 계층·테이블을 나눈 이유·지식 그래프·Wiki | `docs/knowledge-schema.md` |
| 컬럼 타입·기본키·외래키·인덱스·제약 | `docs/erd.md` |
| 그래프 노드·엣지 유형·허용 연결·엣지별 필수 근거 | `docs/ontology-v1.md` |
| 요구 차원 발견과 승격·화면 블록 연결 | `docs/statistics-model.md` |
| 지표 수식·중복 단위·결측 처리·불확실성·정책 버전 | `docs/metric-spec.md` |
| 구성요소별 읽기·쓰기 범위와 강제 수단 | `docs/permission-matrix.md` |
| 자료 계층·출처·허용 용도·평가 세트 | `docs/data-strategy.md` |
| 개발 순서와 상태 | `docs/backlog.md` |
| 수용 기준 | `docs/checklist.md` |
| 설계 결정의 맥락과 근거 | `docs/adr/` |
| `/api/*` 경로별 FastAPI 의존·Express 배포 설정 | `server/README.md` |
| 화면 파일 구성·API 주소 설정·Vercel 배포 | `product/README.md` |
| 생성 데이터의 식별자·테이블·응답 형태 규약 | `agent/data/demo_seed/CONTRACT.md` |

다이어그램에도 소유권 규칙을 적용한다. 하나의 흐름은 한 문서에만 그리고 다른 문서는 링크한다. 같은 구조를 여러 문서에 그리면 수정이 어긋난다.

에이전트별 차이는 다이어그램을 늘리지 않고 입력·출력·도구·근거 슬롯·종료 조건 표로 표현한다.

Mermaid flowchart의 도형은 구성요소의 성격을 나타낸다. 모든 노드를 사각형으로 두지 않는다.

| 도형 | 문법 | 의미 |
| --- | --- | --- |
| 평행사변형 | `id[/"..."/]` | 외부 자료와 입력 이벤트 |
| 육각형 | `id{{"..."}}` | 판단하는 구성요소. 오케스트레이터, 에이전트, 생성 모델을 쓰는 단계 |
| 서브루틴 | `id[["..."]]` | 결정적 helper 파이프라인 |
| 사각형 | `id["..."]` | 단일 처리 단계 |
| 원통 | `id[("...")]` | 저장소와 데이터 계층 |
| 마름모 | `id{"..."}` | 분기와 판정 |
| 스타디움 | `id(["..."])` | 사용자 접점과 종료 상태 |

라벨은 항상 큰따옴표로 감싼다. 도형이 의미를 나타내는 다이어그램에는 범례를 한 표로 붙인다.

| 다이어그램 | 위치 |
| --- | --- |
| 전체 시스템 구조 | `architecture.md` 3장 |
| 분석 실행 순서 | `architecture.md` 7장 |
| 분석 버전 생성과 활성화 | `architecture.md` 8장 |
| 사용자 요청 흐름 | `architecture.md` 9장 |
| 사용자 공고 직접 입력 | `architecture.md` 11장 |
| 에이전트 공통 루프 | `agent-design.md` 5장 |
| 검증 흐름 | `agent-design.md` 9장 |
| 데이터 계층과 계보 | `knowledge-schema.md` 2장 |
| 적재와 인덱싱 | `knowledge-schema.md` 4장 |
| 분류체계 발견과 승격 | `statistics-model.md` 3장 |
| 지표 집계 | `statistics-model.md` 5장 |

### 결정 기록

주요 설계 결정은 `docs/adr/NNNN-제목.md`에 남긴다. 맥락, 결정, 고려한 선택지, 선택 이유, 결과와 제약만 쓴다. 작업 경과와 변경 이력은 쓰지 않는다.

## 참고

- 기획서: docs/plan.md
- 아키텍처: docs/architecture.md
- 에이전트 설계: docs/agent-design.md
- 지식·저장 구조: docs/knowledge-schema.md
- ERD: docs/erd.md
- 온톨로지: docs/ontology-v1.md
- 통계 모델: docs/statistics-model.md
- 지표 명세: docs/metric-spec.md
- 권한 매트릭스: docs/permission-matrix.md
- 데이터 전략: docs/data-strategy.md
- 디자인 컨셉: docs/design-concept.md
- 디자인 토큰: docs/design-tokens.md
- 개발 백로그: docs/backlog.md
- 검증 체크리스트: docs/checklist.md
- 결정 기록: docs/adr/ (0001~0017)
- 평가 세트: docs/eval/

새 작업을 시작할 때는 `AGENTS.md`와 함께 `docs/knowledge-schema.md`, `docs/statistics-model.md`, `docs/architecture.md`, `docs/agent-design.md`를 읽는다.

## 저장소 스키마

데이터베이스 스키마의 기준은 `agent/migrations/`다. Express는 조회 계약만 따르고 스키마를 정의하지 않는다. 근거는 docs/adr/0006-migration-ownership.md에 있다.

키는 서비스별로 분리한다. `server/.env`는 저장소 접속과 에이전트 주소를, `agent/.env`는 저장소 접속과 생성 모델 키를 보유한다. Express는 생성 모델 키를 보유하지 않는다.
