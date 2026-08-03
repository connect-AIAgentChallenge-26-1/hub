# 작업 체크리스트

`docs/plan.md` 기획서를 실행 가능한 작업 단위로 쪼갠 체크리스트. 완료 항목은 커밋 이력에 근거가 있는 것만 `[x]`로 표시한다.

## 완료된 작업

### 기능 A: 실시간 필터링 — `df5d771` 커밋으로 완료
- [x] 검색 입력창 UI
- [x] 입력값 변화 감지 (이벤트 처리)
- [x] 입력값 소문자 변환 처리
- [x] name 필드 매칭
- [x] summary 필드 매칭
- [x] 매칭 결과 카드 형태 표시
- [x] 매칭 결과 목록 렌더링
- [x] 매칭 실패 시 에러 메시지 표시 (터미널 에러 연출, 한글 메시지로 갱신됨 — 아래 "검색/에러 화면 UX 개선" 참고)

### 그 외 완료 항목
- [x] 터미널 콘솔 UI 구현 — 터미널 창 프레임, 컬러 프롬프트, 깜빡이는 커서 — `df5d771` 커밋으로 완료
- [x] Unix/Git 명령어 데이터 49개 구축 (Unix 28 + Git 21) — `7d61260`, `912e61b`, `ffa543b`, `b367e9b`, `32668ae` 커밋으로 완료
- [x] 파비콘 터미널 스타일 변경 및 카테고리 뱃지 제거 — `f55344d` 커밋으로 완료

### 검색 결과 우선순위 정렬 — `9781e44` 커밋으로 완료

실시간 필터링(기능 A) 결과에 관련도 기반 정렬이 없어서, 짧은 검색어 입력 시 이름과 무관한 설명 매칭이 섞이고 이름이 검색어로 시작하는 명령어가 우선적으로 안 나오던 문제를 해결. `src/utils/commandSort.js` 신규 작성.

- [x] 이름 시작 매칭 > 이름 포함 매칭 > 설명 매칭, 3단계 우선순위 정렬 구현
- [x] 동일 우선순위 그룹 내 이름 알파벳순 정렬
- [x] git 카테고리 하위 명령어(`git commit` 등) 접두사 분리 처리 — `command.category` 필드 기반으로 판정
- [x] 26개 알파벳 x 2개 카테고리 전수조사로 회귀 없음 확인, lint 통과

### 검색 대상에서 description 필드 제외 — `320f190` 커밋으로 완료

목록 카드 화면에는 `name`/`summary`만 보이는데 `description`(상세 페이지 전용 긴 설명문)까지 검색 대상이라, `q`/`x`/`b` 같은 글자나 숫자를 입력하면 화면에 안 보이는 텍스트 때문에 매칭 근거를 알 수 없는 결과가 섞여 나오던 문제를 해결. `description`을 필터 조건에서 제외해 목록에 나오는 모든 결과가 화면에 보이는 텍스트(name/summary)로 설명 가능하도록 함.

- [x] `CommandListPage.jsx` 필터 조건에서 `description.includes(...)` 제거
- [x] q/x/b, 숫자 0~9 등으로 데이터 검증 — description 제외 시 모두 사라지거나 name/summary로 설명 가능한 결과만 남는지 확인
- [x] lint 통과

### 검색/에러 화면 UX 개선 — `bf9fd19` 커밋으로 완료

접근성 미비(장식 요소가 스크린리더에 잡음으로 읽힘), 명령어/카테고리 없음 처리가 컨셉과 불일치, 문장부호 단독 입력 시 의미 없는 결과 노출, 에러 메시지가 영어라 "번역 부담을 줄인다"는 본래 취지와 배치되던 문제들을 함께 해결.

- [x] 장식용 요소(커서 깜빡임, 터미널 창 점 3개)에 `aria-hidden="true"` 추가 — `TerminalFrame.jsx`, `CategoryHomePage.jsx`, `CommandListPage.jsx`, `CommandDetailPage.jsx`
- [x] 명령어/카테고리 없음 처리를 터미널 에러 연출로 통일
- [x] 검색어에 글자(영문/한글)가 하나도 없으면(문장부호만 입력 시) 검색 무효 처리
- [x] 에러/안내 메시지를 한글로 변경, "에러:" 명시 (`-bash: {query}: 에러: 찾을 수 없는 명령어입니다` 등 셸 접두사는 유지)
- [x] 검색 안내 문구를 "명령어 이름이나 설명을 입력해 검색하세요" → "검색할 명령어 이름을 입력해 보세요"로 변경 (description 제외 이후 문구와 실제 동작 일치시킴)
- [x] lint 통과

## 기능 B: 클립보드 복사 — 완료

상세 페이지의 명령어 예시에 복사 버튼을 추가하는 작은 스코프. 동료 피드백 목록 항목은 아니며, 사용자 아이디어와 Agent 제안이 겹쳐 결정된 기능. 디자인 시스템 정리 과정에서 확정된 아이콘 버튼 스타일(`docs/design-system/DESIGN.md` 5-1장)의 첫 적용 사례로 함께 구현.

- [x] `CommandDetailPage.jsx`에 아이콘 복사 버튼 추가(`ClipboardIcon`), `navigator.clipboard.writeText`로 예시 명령어 복사
- [x] 복사 성공 시 체크 아이콘(`CheckIcon`)으로 1.5초간 전환
- [x] `src/index.css`에 `.example-command-row`, `.copy-button` 스타일 추가 (아이콘 버튼)

## 기능 C: Supabase 연동 (정적 데이터 → DB 이전) — `67579c0`, `3a03d53`, `3ec6a33` 커밋으로 완료 (GitHub #22, #23, #24 close)

원래 3주차로 미뤄뒀던 Supabase 이전을 앞당겨 진행. `commands`/`categories` 테이블로 정적 데이터를 옮기고, 대문/상세 페이지를 API로 연결했다. 검색 랭킹 우선순위도 Meilisearch 설정으로 명시화.

- [x] Supabase 테이블 설정, `server/.env` 연결 정보 구성 (`SUPABASE__KEY` → `SUPABASE_KEY` 오타 수정)
- [x] `migrateCommandsToSupabase.js`로 categories 2개 / commands 49개 업로드 확인
- [x] `commandsRouter.js` → `controllers` → `services` → Supabase 조회 경로 구축, `GET /api/commands`, `GET /api/commands/:id` 성공/404/네트워크 실패 3경로 검증
- [x] `src/services/commandsService.js`(FE) 작성, `CategoryHomePage.jsx`/`CommandDetailPage.jsx`가 `src/data/commands.js` 직접 import 대신 API 사용하도록 교체
- [x] BE 다운 시에도 대문 화면 카드/링크는 유지되고 개수만 실패 표시되도록 처리 (graceful degradation)
- [x] `indexCommands.js`에 `updateRankingRules` 추가 — "이름 일치 우선" 랭킹을 searchableAttributes 순서 암묵 의존 대신 명시적으로 설정
- [x] 더 이상 안 쓰는 `commandSort.js`(compareByRelevance/getMatchRank)와 관련 테스트를 삭제 대신 주석 처리, `eslint.config.js`에 `server/**` 전용 Node 환경 블록 추가해 기존 lint 에러 14건 해소
- [x] `npm run lint`, `npm run test` 저장소 전체 기준 통과 확인

## 기능 D: 상황별 명령어 묶음 (Week 3 "다음 기능 설계하고 나누기" 미션) — 로컬 작업 완료, 커밋 예정 (GitHub #25, #35 close)

동료 피드백 1번(GitHub #25, "상세설명 내 상황별 명령어 링크 연결")의 원문("이 상황이면 이 명령어도 필요")이 "향후 확장"에 있던 "과제 제출하기 상황별 명령어 묶음" 아이디어(GitHub #35)와 사실상 같은 것으로 판단해 하나로 통합 구현. 화면→데이터→흐름 순서로 설계(`.claude/plans/spicy-cooking-neumann.md`)한 뒤 작업을 작게 나눠 진행했다.

- [x] `scenarios` 테이블 설계/생성(`id`, `title`, `description`, `command_ids` jsonb) — `commands`와 마찬가지로 조인 테이블 없이 배열 유지
- [x] 시나리오 데이터 12개 작성 — 원래 Claude API 구조화된 출력으로 초안을 생성할 계획이었으나, 이 한 번을 위해 별도 API 결제 수단을 새로 등록하는 비용이 커서 사람이 직접 작성(`server/src/scripts/generateScenarios.js`는 도구로 남겨둠, 이번엔 미사용)
- [x] BE `scenariosRouter.js`/`Controller`/`Service` — `commandsRouter.js`와 동일한 계층 패턴, `GET /api/scenarios`, `GET /api/scenarios/:id` 성공/404/네트워크 실패 경로 검증
- [x] FE `scenariosService.js` + 테스트 8개(`searchService.test.js` 패턴), `ScenarioHomePage.jsx`(메뉴 목록형, 카드 그리드 아님 — 시나리오는 설명 문장이 길어 카드보다 구분선 목록이 더 정돈되어 보임), `ScenarioDetailPage.jsx`(순서대로 명령어, 단계 사이 화살표 아이콘)
- [x] `CommandDetailPage.jsx`에 "관련 상황" 배지 섹션 추가(부가 정보라 실패해도 상세 페이지 자체엔 영향 없게 처리)
- [x] `CategoryHomePage.jsx`에 "상황별로 찾아보기" 진입 버튼(아이콘+텍스트, 기존 텍스트 링크 스타일 대신)
- [x] 명령어 커버리지 재점검 중 에디터 명령어 부재 발견 → `nano` 추가(50번째 명령어), `compile-run-c` 시나리오를 `nano → gcc`로 정리
- [x] `CORS_ORIGIN` 콤마 다중 origin 지원 (Vite가 5173 사용 중이면 5174로 넘어가는 경우 대비)
- [x] 카테고리 카드 이모지(🖥️/🔀) → SVG 아이콘(터미널 프롬프트, git 로고 실루엣 모방), 배지 색상 조정
- [x] `npm run lint`, `npm run test` 저장소 전체 기준 통과 확인, Edge headless 스크린샷으로 성공/실패(404·네트워크) 경로 모두 확인

> 위 항목은 로컬 작업/검증까지 끝난 상태이고 아직 커밋 전이라, 커밋되면 이 절 제목의 "커밋 예정"을 실제 커밋 해시로 교체할 것.

## 카테고리 라벨 출처 일원화 — 로컬 작업 완료, 커밋 예정

"향후 확장" 절에 있던 미확정 아이디어였는데(4주차), Supabase 이전 이후에도 `CommandListPage.jsx`/`CommandDetailPage.jsx`가 여전히 `src/data/commands.js`의 정적 `CATEGORY_LABELS`를 참조하던 이중 관리 문제를 실제로 해결했다.

- [x] `server/src/services/commandsService.js` — `listCommands`/`getCommandById`가 `commands` 테이블 조회 시 FK(`commands.category → categories.key`)를 통해 `categories(label)`를 함께 조회하도록 변경, 응답에 평평한 `category_label` 필드로 포함
- [x] `CommandDetailPage.jsx` — `CATEGORY_LABELS` import 제거, 이미 fetch된 `command.category_label`을 그대로 사용 (로딩 게이트가 이미 있어 타이밍 리스크 없음)
- [x] `CommandListPage.jsx` — `CATEGORY_LABELS`를 쓰던 동기적 카테고리 유효성 판단을, 이미 돌고 있던 전체 목록 fetch(#36 알파벳 인덱스용)에서 `category_label`을 같이 받아오는 방식으로 전환. 판단 시점이 늦어지는 만큼 로딩 → 조회 실패(네트워크 오류) → 존재하지 않는 카테고리, 3단계로 상태를 나눠 순서대로 처리하도록 렌더링 로직 재구성
- [x] `CATEGORY_LABELS`는 이제 시드 스크립트(`migrateCommandsToSupabase.js`)에서만 참조 — 실제 화면 쪽 라벨 출처는 DB 하나로 통일됨
- [x] `npm run lint`, `npm run test` 통과 확인, Edge headless로 `/unix`·`/git`(정상)·`/docker`(존재하지 않는 카테고리)·`/commands/unix-ls`(상세 페이지 breadcrumb) 4개 경로 스크린샷 확인

> 커밋되면 이 절 제목의 "커밋 예정"을 실제 커밋 해시로 교체할 것.

## 동료 피드백 반영 (실행 후보)

- [ ] AI 챗봇 API 연동 방식 조사 — 정적인 터미널 UI에 챗봇을 붙이는 방법, API 선택지 비교 (동료 피드백 5번, 실행 후보)

## 동료 피드백 반영 (blocked / 보류)

- [ ] "저장소 링크 추가" 의도 재확인 — blocked: 제안 의도(피드백 수집 목적?)가 불확실해 사용자/제안자 재확인 필요
- [ ] 명령어 추가 목록 확정 — blocked: 방향성만 있고 구체 목록 미정, 후보 목록 정리 후 논의 필요
- [ ] 재미요소 구체안 확정 — blocked: 형태 미정(이스터에그/애니메이션/게임화 등 예시만 언급된 상태)
- [ ] C/Python 명령어 확장 — 보류, 실행 안 함: 본래 취지(Unix/Git 실습 명령어 사전) 이탈 + 작업량 증가 우려로 스코프 아웃 결정됨

## 데이터 품질

- [ ] 명령어 커버리지 재점검 — 현재 50개 목록에서 빠진 실습 필수 명령어(예비 후보 조사)가 있는지 재검토. 1차로 에디터 명령어가 전혀 없다는 게 발견되어 `nano`를 우선 추가함(초보자 친화적이라 vim/emacs보다 먼저 선택) — vim/emacs 등 추가 여부는 아직 미정, 계속 열어둠

## 향후 확장 (README 확장 아이디어)

- [ ] 명령어별 중요도 표시 기능 — 가로 막대 형태, 우선순위 낮음 (미확정 아이디어)
- [ ] 상세 페이지 "보충 설명" 접기/펴기 섹션 — chmod처럼 옵션 표 안에 개념 설명(권한 표기법 등)까지 욱여넣은 명령어를 위해, 실제 플래그 목록과 개념 설명을 분리해 접기/펴기로 보여주는 안. 스키마 변경(nullable 컬럼 추가) + 새 UI 컴포넌트(아코디언)가 필요해 스코프가 있음, 지금 49개 중 chmod 1건만 해당돼 우선순위 낮음 (미확정 아이디어)
- [x] 알파벳 두문자 인덱스 탐색 (A, B, C… 점프) — 목록 화면에 사전식 알파벳 인덱스 추가, Git 명령어는 `git ` 접두사를 뗀 뒤 비교해 인덱싱(예: `git commit`은 "C")
- [ ] 셸 연동 CLI `kman` (브라우저 오픈형, 방향 확정) — 유닉스 터미널(가상머신/SSH 등)에 패키지로 설치해두고 `kman <command>` 입력 시 배포된 상세 페이지 URL을 브라우저로 열어줌. `gh repo view --web`, `npm docs <package>`, `heroku open` 등과 같은 흔한 CLI 패턴. 명령어 이름만으로 URL 패턴(`/commands/unix-grep`)을 계산해서 여는 방식이라, 데이터를 CLI 안에 복제하거나 별도 조회 API를 만들 필요가 없어 구현·유지보수 부담이 적음(터미널에 내용을 직접 렌더링하는 방식은 데이터 동기화/API 의존이 생겨서 기각함). 직접 URL 접속 방식을 대체하는 게 아니라 그 위에 얹는 편의 계층 — 기본 접근은 URL 직접 접속, CLI는 터미널 사용자를 위한 단축 경로.
  - **이름을 `kman`(한국어 man)으로 정함** — 실제 `man` 명령어는 전혀 건드리지 않으면서(파이프/옵션 깨짐 등 부작용 위험 없음) 이름만으로 "man의 한국어/웹 버전"이라는 연상을 주기 위함. `man` 자체를 셸 함수로 오버라이드하는 안(A)은 `man ls | grep`류의 파이프 활용이 깨지는 리스크 + 예외 처리 복잡도 때문에 기각.
  - **`--man` 플래그** — `kman grep`은 기본적으로 웹(브라우저)을 열지만, `kman grep --man`은 내부적으로 진짜 `man grep`을 실행해 원래 man 페이지를 그대로 보여줌. 실제 `man` 명령어는 여전히 안 건드림.
  - **남은 갭 (미해결, 논의만 됨)**: `kman`을 만들어도 사용자가 습관적으로 그냥 `man ls`를 직접 치는 경우는 못 잡음. 후보안은 `MANPAGER` 환경변수를 커스텀 스크립트로 설정해 사람이 터미널에서 직접 볼 때만(파이프 사용 시는 미적용) 맨 끝에 "웹 버전: kman ls" 안내를 덧붙이는 것 — `man` 명령어 자체 동작·파이프 활용은 안 건드리지만 `.bashrc` 등 페이저 설정은 바뀜. 이 갭을 기술적으로 메울지, 아니면 README 안내만으로 감수할지는 아직 결정 안 됨.
  - 설치 방식(curl\|bash 스크립트 vs npm 전역 설치, 진짜 apt 패키지/PPA는 인프라 부담이 커서 기각)은 대상 실습 환경에 Node가 기본 설치되어 있는지에 따라 결정 예정, 아직 미정. FE 배포(URL 확정)가 선행되어야 함
  - **(심화 버전, 로그인 이후 확장 후보) 북마크 목록 셸 내보내기** — 사용자가 즐겨찾기한 명령어 목록을 `kman`으로 셸에 내보내기. 기본 `kman <command>`는 URL만 계산해서 열기 때문에 로그인/데이터 조회가 필요 없지만, "내 북마크"는 사용자별 실제 데이터라 이 단순함이 깨짐 — 로그인/계정 시스템(선행 필요) + 북마크 테이블/조회 API(`GET /api/users/:id/bookmarks`) + CLI 인증(`kman login`류로 API 키/토큰을 로컬에 저장, `gh auth login`과 유사)까지 필요한 kman의 확장판. 로그인 기능이 먼저 생긴 뒤에 착수
