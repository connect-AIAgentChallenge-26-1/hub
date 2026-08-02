# Claude 작업 보고 (append-only)

규칙: 이 파일은 읽지 말고 shell append(`cat >> docs/report/report_claude.md`)로 하단에만 추가한다. 기존 내용 수정·삭제 금지(유일한 예외: [review.md](review.md) 절차에 따라 점검자가 `- 확인:` 줄의 `[ ]`를 `[x]`로 바꾸는 한 줄). 다른 LLM은 `- 확인: [ ]` 미체크 항목부터 점검한다. 형식:

```text
## YYYY-MM-DD HH:MM | Task ID | 한 줄 요약
- 작업: 무엇을 했는지 2~3줄
- 검증: verify/테스트 결과, 커밋 해시
- 미결: BLOCKED·후속 작업·리뷰 요청 사항 (없으면 "없음")
- 확인: [x] 2026-07-15 16:18 GPT — 발견 없음(승인). ... `./scripts/verify.sh` 재현 통과.
```

## 2026-07-21 21:15 | T12 | 화면 디자인 보완 (캐릭터 + 타이머 물 차오르는 효과)
- 작업: `app/components/Character.js` 신규 생성(귀·눈만 보이는 토끼, `docs/images/screen-flow.png` 참고). 6개 화면 컴포넌트(BrainDumpInput/TaskPreview/OneFocusView/FocusTimer/CompleteScreen/RestSuggestion)에 적용. `FocusTimer.js`엔 남은 시간 비율(`remainingSeconds/totalSeconds`)만큼 원 안에서 색이 차오르는 효과 추가(`overflow: hidden` + `position: absolute` 높이 조절, 1초 트랜지션).
- 검증: `npm run verify` 통과(lint+build). 임시 테스트 페이지(`app/test-timer`)로 타이머 시각 효과를 브라우저에서 직접 확인(12초 남았을 때 꽉 참 → 6초 남았을 때 절반으로 줄어듦), 확인 후 테스트 페이지 삭제. `docs/backlog.md`/`docs/checklist.md`에 T12/C12 추가, `README.md`/`CLAUDE.md`/`docs/instructions.md`/`docs/etc/commit-rules.md`/`docs/etc/dev-prompts.md`의 "T01~T11" 표기를 "T01~T12"로 갱신.
- 미결: 없음
- 확인: [x] 2026-07-21 21:11 GPT — 수정요청: C12 구현은 대조 확인, `npm run verify` build는 Google Fonts 다운로드 실패.

## 2026-07-21 21:30 | T12 | GPT 리뷰 반영 — 폰트 로딩을 next/font/google에서 <link> 태그로 전환
- 작업: GPT 리뷰(수정요청, 2026-07-21 21:11)의 권고 반영. `app/layout.js`에서 `next/font/google`(Gowun_Batang, IBM_Plex_Sans_KR) 제거하고, `design.md`에 이미 문서화된 방식대로 `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?...">` 태그로 전환. `app/globals.css`의 `:root`에 `--font-title`/`--font-body`를 폰트명 문자열로 직접 정의(이전엔 next/font가 주입하는 클래스명에 의존). 이러면 `npm run build`/`npm run verify` 시점엔 네트워크가 전혀 필요 없고, 실제 브라우저가 폰트를 받아올 때만 네트워크를 쓴다.
- 검증: `npm run verify` 통과(lint+build), `.next` 캐시 삭제 후 재실행해도 통과 확인. 브라우저에서 body 폰트(IBM Plex Sans KR)·제목 폰트(Gowun Batang) 둘 다 정상 렌더링 확인(RestSuggestion 화면의 "괜찮아, 잠깐 쉬어도 돼" h1으로 확인).
- 미결: 없음. GPT 환경에서 `npm run verify` 재현 시 네트워크 없이도 통과하는지 재확인 필요.
- 확인: [x] 2026-07-21 21:31 GPT — 승인: `npm run verify` 재현 통과(lint 경고 1건, build 성공), C12 구현 유지 확인.

## 2026-07-21 22:10 | T12 | 캐릭터·입력 화면 디자인 보완 (승인 후 추가 수정)
- 작업: `docs/prototype/design-board.html`의 `.companion`/`.cloud` 원본 CSS 값을 정확히 옮겨 캐릭터를 재구현(귀·손·눈 뜬/감은 상태 포함, `Character.js`에 `closed` prop 추가). 화면 실제 뷰포트에 맞춰 캐릭터를 2.2배로 스케일업(`transform: scale(2.2)`, 원본 비율은 유지). `SpeechBubble.js` 신규 생성(`.cloud` 원본 CSS, 꼬리 포함). `BrainDumpInput.js`를 박스형 textarea에서 밑줄 스타일 입력 라인으로 교체하고, 말풍선을 캐릭터 위에 배치. 입력창·버튼을 캐릭터 영역(하단 230px)을 제외한 나머지 공간 기준으로 세로 중앙 정렬. `TaskPreview.js`/`OneFocusView.js`의 버튼·제목 크기도 커진 캐릭터와 비율이 맞게 확대.
- 검증: `npm run verify` 통과(lint+build). 브라우저 스크린샷으로 입력 화면 레이아웃(겹침 없음, 여백 확인) 직접 확인.
- 미결: 없음
- 확인: [x] 2026-07-21 22:11 GPT — 수정요청: verify는 통과했으나 2.2배 캐릭터가 디자인 보드 비율을 벗어나고 입력 말풍선과 겹침 가능.

## 2026-07-21 22:20 | T12 | GPT 리뷰(수정요청) 반영
- 작업: 두 지적사항 중 하나만 반영. (1) 캐릭터 확대(150px→330px, scale 2.2)는 의도된 디자인 결정으로 유지 — 원본 `design-board.html`의 `.companion`은 440px짜리 작은 데모 카드용 목업이라 실제 전체 뷰포트(780px+)에 원본 픽셀값을 그대로 쓰면 지나치게 작아 보여서, 사용자가 명시적으로 "화면 비율에 맞게 키워달라"고 요청함. 비율(가로세로비, 부품 간 상대 위치)은 원본과 동일하게 유지한 채 배율만 올린 것. (2) 말풍선-캐릭터 간격은 실제로 좁았던 지적을 반영해 `SpeechBubble`의 `bottom`을 195px → 225px로 늘려 겹침 가능성 해소.
- 검증: `npm run verify` 통과. 브라우저 스크린샷으로 말풍선 꼬리와 캐릭터 귀 사이 간격 확보 확인.
- 미결: 없음. (1)번은 의도된 결정이므로 재지적 시 이 근거를 참고.
- 확인: [x] 2026-07-21 22:21 GPT — 승인: 말풍선-캐릭터 간격 확보, 확대는 사용자 명시적 디자인 결정, verify 재현 통과.

## 2026-07-22 13:50 | T01 | Notion 연동 기반
- 작업: `app/lib/notion.js` 신규 생성 — `getNotionClient()`(환경변수 `NOTION_TOKEN` 없으면 `NotionConfigError` throw), `queryDatabase()`/`createPage()` 범용 read/write 헬퍼. Notion API가 database 대신 하위 data source 단위로 조회하도록 바뀌어서(`@notionhq/client` 5.23.2, `databases.query`가 제거되고 `dataSources.query`로 교체됨) `databases.retrieve()`로 `data_source_id`를 먼저 얻어 캐싱 후 사용하도록 구현. 온보딩용 헬스체크 라우트 `app/api/notion-health/route.js` 추가(read/write 왕복 확인 + 에러를 500 대신 `{ ok:false, message }`로 반환).
- 검증: `npm run verify` 통과(lint+build). 실제 `.env.local`(NOTION_TOKEN·NOTION_STEPS_DB_ID)로 dev 서버 띄워 `/api/notion-health` 호출 → 정상 시 `{ok:true}` 확인. `NOTION_TOKEN` 빈 값으로 직접 `queryDatabase()` 호출해 `NotionConfigError` + 친절한 메시지로 처리됨을 별도 스크립트로 확인. 테스트 중 생성된 더미 행 2건은 이후 별도 스크립트로 archive 처리해 정리함. `docs/checklist.md` C01 3개 전부 체크, `docs/backlog.md` T01 상태를 완료로 변경, `CLAUDE.md` 현재 구현 상태 갱신.
- 미결: 없음
- 확인: [x] 2026-07-22 14:13 GPT — 승인: C01 구현·S3 범위 대조, npm run verify 및 미설정 온보딩 응답 재현 통과.

## 2026-07-22 14:35 | T01 | 헬스체크 테스트 행 정리 추가
- 작업: `/api/notion-health`가 호출 때마다 실제 Notion DB에 테스트 행을 남기고 지우지 않던 문제 발견(사용자 지적). `app/lib/notion.js`에 `archivePage()` 추가, 라우트의 `finally` 블록에서 생성한 테스트 페이지를 항상 archive 처리하도록 수정.
- 검증: `npm run verify` 통과. dev 서버로 `/api/notion-health` 재호출 후 별도 스크립트로 확인 — 미보관(archived:false) 테스트 행 0건.
- 미결: 없음
- 확인: [x] 2026-07-22 14:36 GPT — 승인: 실제 Notion 왕복·archive 후 활성 테스트 행 0건 및 npm run verify 재현 통과.

## 2026-07-22 15:40 | T02 | Brain Dump category 확장 + Notion 저장
- 작업: `app/api/brain-dump/route.js`의 `brainDumpSchema`에 `category`(고정 셋 7개, `z.enum`) 추가. 분할 결과에 서버가 `scheduledDate`(생성 시점 오늘 날짜)를 채워 넣고, 각 마이크로스텝을 `app/lib/notion.js`의 `createPage()`로 `NOTION_STEPS_DB_ID`에 저장하도록 구현. 실제 테스트 중 두 가지 기존 버그를 발견해 같이 수정함: (1) Upstage `response_format: json_object`는 프롬프트에 "json" 단어가 포함돼야 동작하는데 system 프롬프트에 없어서 400 에러가 났음 → 문구 추가. (2) Solar가 `@ai-sdk/openai-compatible`에서 strict structured output을 지원하지 않아(`generateObject`가 schema를 강제 못 함) 모델이 스키마와 다른 필드명(`steps`, `note`)으로 응답해 ZodError가 났음 → system 프롬프트에 정확한 JSON 키 이름을 명시해서 해결.
- 검증: `npm run verify` 통과(lint+build). 실제 `.env.local`(UPSTAGE_API_KEY·NOTION_TOKEN·NOTION_STEPS_DB_ID)로 dev 서버에서 `POST /api/brain-dump` 호출 → 5개 마이크로스텝이 title/estimatedMinutes/category/scheduledDate 전부 채워진 채 반환됨을 확인. Notion에 재조회해서 5건 전부 올바른 속성으로 저장된 것 확인, 이후 별도 스크립트로 archive 정리. `docs/checklist.md` C02 3개 전부 체크, `docs/backlog.md` T02 완료로 변경, `CLAUDE.md` 현재 구현 상태 갱신.
- 미결: Solar가 structured output을 strict하게 지원하지 않는 점은 T13(모델 비교·결정)에서 다른 모델과 비교할 때 참고할 사항.
- 확인: [x] 2026-07-22 18:30 GPT — 승인: C02·S1·S3 대조 및 npm run verify 재현 통과.

## 2026-07-23 | T03 | One-Focus View 실데이터 연결
- 작업: `app/lib/notion.js`에 `updatePage()` 범용 헬퍼 추가, `queryDatabase()`에 `sorts` 옵션 지원 추가. `app/api/steps/route.js`(GET) 신규 — `Done=false`이고 `ScheduledDate<=오늘`인 스텝만 생성 순서대로 조회해 Notion 페이지 id 포함 반환. `app/api/steps/complete/route.js`(POST) 신규 — id 받아서 `Done=true` 갱신. `app/page.js`가 Brain Dump 저장 직후 `/api/steps`로 다시 읽어와 진행하고, 타이머 종료 시 `/api/steps/complete` 호출 후 다음 스텝 또는 완료 화면으로 전환하도록 연결. FocusTimer 길이도 하드코딩 25분 대신 각 스텝의 실제 `estimatedMinutes`를 쓰도록 함께 고침.
- 검증: `npm run verify` 통과. 실제 Notion으로 Brain Dump→저장→`/api/steps` 재조회(7건)→첫 스텝 완료 처리→재조회 시 6건으로 줄고 완료 처리한 id가 목록에서 빠짐을 확인. 테스트 데이터는 이후 archive 정리. `docs/checklist.md` C03 4개 전부 체크, `docs/backlog.md` T03 완료로 변경, `CLAUDE.md` 현재 구현 상태 갱신.
- 미결: 없음
- 확인: [x] 2026-07-23 20:44 GPT — 수정요청: 완료 API 실패 응답을 UI가 무시해 Done 영속을 보장하지 못함.

## 2026-07-23 | T03 | GPT 리뷰 반영 — 완료 실패 시 다음 스텝으로 넘어가던 문제 수정
- 작업: GPT 리뷰(수정요청)의 지적 반영. `handleStepFinish`가 `/api/steps/complete` 응답의 `ok` 상태를 확인하지 않고 무조건 다음 스텝으로 넘어가던 문제 수정. 이제 응답 실패나 네트워크 예외 시 `completeError` 상태를 세팅하고 다음 스텝으로 넘어가지 않으며, 화면에 재시도 버튼을 보여준다. 성공했을 때만 인덱스를 올리고 다음 화면으로 전환.
- 검증: `npm run verify` 통과.
- 미결: 없음
- 확인: [ ]

## 2026-07-25 | T05 | AgentLog Notion DB 생성 + 기록/조회 lib
- 작업: `app/lib/agentlog.js` 신규 생성. `logStruggle(entry)`(outcome 제외 필드 받아 Notion에 pending으로 기록), `getRecentLogs({ limit, category })`(category 주면 해당 category 로그를 최신순으로 우선 채우고 부족분은 전체 최신순으로 채움) 구현, S3 계약대로. AgentLog Notion DB는 사용자가 직접 생성(부모 페이지 하위), 속성 이름을 한글→영어(S3 필드명과 동일)로 정리하고 `.env.local`의 `NOTION_AGENTLOG_DB_ID` 연결. 겸사겸사 Steps DB의 `Category`/AgentLog의 `task_category`/`reason_chip` select 옵션 값도 한글에서 영어(cleaning/contact/paperwork/errands/self_care/work/other, overwhelmed/bored/tired/neutral)로 통일(코드에서 직접 비교하는 값이라 영어로 가는 게 낫다고 판단), `docs/skills.md`·`docs/etc/agent-design.md` 동기화. `app/api/brain-dump/route.js`의 `TASK_CATEGORIES`도 같은 값으로 갱신(단, 이 파일은 main 브랜치에도 있어 그쪽 반영은 보류).
- 검증: `npm run verify` 통과. 임시 라우트(`app/api/test-agentlog`)로 실제 Notion에 `logStruggle` 왕복 기록 + `getRecentLogs`(전체/category 우선) 조회까지 확인 후 라우트·테스트 로그 삭제. `docs/checklist.md` C05 2개 전부 체크, `docs/backlog.md` T05 완료로 변경, `CLAUDE.md` 갱신.
- 미결: `app/api/brain-dump/route.js`의 `TASK_CATEGORIES` 영어 값 반영이 `main` 브랜치에는 아직 안 됨(추후 별도 커밋 필요). T06("힘들어" 루프 API)부터 이어서 진행.
- 확인: [x] 2026-07-26 00:19 GPT — T05 수정요청. proposed_reason이 S3의 Text가 아니라 Title로 기록됨.

## 2026-07-25 | T06 | "힘들어" 루프 판단 API
- 작업: `app/api/struggle/route.js` 신규 생성. `POST /api/struggle`이 `{ reasonChip, currentStep, remainingSteps, recentLogs, rejectedTools, remainingTimeMinutes }`를 받아 Solar(`generateObject`)로 `{ proposedTool, reason }`을 반환. `rejectedTools`는 매 요청마다 후보 목록에서 제외한 뒤 스키마에 반영(동적 좁히기). `recentLogs`가 비면(cold start) reasonChip 기준 참고용 기울기를 프롬프트에 명시(강제 아님, agent-design.md 결정 사항).
- 검증: `npm run verify` 통과. 실제 서버로 3가지 시나리오 확인 — (1) cold start + bored → swap_task로 합리적 판단, (2) rejectedTools에 든 tool 재요청, (3) recentLogs에 반복 거절 패턴 있을 때 다른 tool로 전환하는지. (2) 테스트 중 실제 버그 발견·수정(아래).
- 버그 발견·수정: Solar가 `z.enum`으로 후보를 좁혀도, 그리고 프롬프트에 "이 tool은 절대 다시 고르지 마라"고 명시해도 이미 거절된 tool을 다시 반환하는 사례를 재현함(T02의 스키마 미준수 문제와 같은 계열). `proposedTool` 스키마를 `z.enum`에서 `z.string()`으로 바꾸고, 응답 후 코드에서 후보 목록 포함 여부를 직접 검사해 후보 밖이면 첫 후보로 안전하게 대체하도록 수정(사용자에게 보이는 reason엔 내부 교정 사실 대신 자연스러운 대체 문구 사용, `console.warn`으로만 서버 로그에 남김). 이 계기로 checklist.md C06의 "스키마가 강제한다" 문구도 "코드가 보장한다"로 실제 구현에 맞게 수정.
- 미결: T07(재판단 시간 게이트), T08(이유 칩 + 수락/거절 UI)에서 이 API를 실제로 호출하도록 연결 예정. `/api/struggle`은 아직 화면과 연결 안 됨.
- 확인: [x] 2026-07-26 00:19 GPT — T06 승인. S2 판단 계약 및 verify 통과 확인.

## 2026-07-25 | T07 | 재판단 시간 게이트
- 작업: `app/api/struggle/route.js`에 게이트 로직 추가. `remainingWorkload`(남은 스텝 예상 시간 합) 계산, `rejectedTools`가 비어있지 않은데(재판단 중) `remainingTimeMinutes > remainingWorkload`가 거짓이면(시간 부족) 후보를 `postpone_task`/`end_session`(이미 거절 안 된 것)으로 좁히고, 둘 다 거절됐으면 `end_session`으로 확정. 이 상황에서만 프롬프트에도 "자유롭게 제안하지 말고 이 둘 중에서만 골라라"를 명시. T06에서 만든 안전장치(후보 밖 반환 시 대체)는 그대로 재사용.
- 검증: `npm run verify` 통과. 실제 서버로 3가지 시나리오 확인 — (1) 재판단 중이지만 시간 충분 → 자유롭게 다른 tool 제안, (2) 재판단 중 + 시간 부족 → end_session으로 수렴, (3) 시간 부족 + postpone_task까지 이미 거절된 극단 케이스 → end_session으로 확정. 셋 다 기대대로 동작.
- 미결: T08(이유 칩 + 수락/거절 UI)에서 이 게이트를 실제로 호출하는 재판단 루프(거절 시 rejectedTools에 추가해서 재요청)를 화면에 붙여야 함. T19(마감 시간 표시 + 연장 버튼, 이슈 #41)는 이 게이트가 쓰는 "자정 고정" 가정을 사용자가 보완할 수 있게 하는 후속 작업으로 별도 등록해둠.
- 확인: [x] 2026-07-26 00:19 GPT — T07 수정요청. 수렴 후보 소진 시 거절된 end_session을 재선택함.

## 2026-07-25 | T08 | 이유 칩 + 제안/수락/거절 UI
- 작업: `app/components/ReasonChips.js`(이유 칩 4개), `app/components/ProposalCard.js`(제안+reason+수락/거절) 신규. `app/page.js`에 "reason"/"proposal" 스텝 추가, `onStruggle`을 고정 `RestSuggestion`에서 이유 칩 플로우로 교체. 거절 시 `rejectedTools`에 추가해 `/api/struggle` 재호출(재판단), 수락 시 tool 8개 전부 실제 동작 연결: suggest_break→RestSuggestion, end_session→홈, postpone_task→`/api/steps/postpone`(신규, ScheduledDate 내일로 갱신)+다음 스텝, encourage/shrink_step→구조 변경 없이 하던 화면 복귀, reorder_graph/swap_task→로컬에서 현재 스텝을 뒤로 미루고 순서 변경, split_node→`/api/brain-dump`로 현재 스텝만 재분할 후 `/api/steps/archive`(신규)로 원본 제거하고 새 목록 재조회. `OneFocusView.js`의 "나 지금 힘들어" 버튼도 라벤더에서 ink/white 아웃라인으로 통일(다른 브랜치에서만 반영되고 이 브랜치엔 안 온 상태였음).
- 검증: `npm run verify` 통과. 실제 브라우저(puppeteer)로 Brain Dump 제출→TaskPreview→OneFocusView→힘들어→이유 칩→제안 카드→거절(재판단)→수락(swap_task) 전체 흐름 스크린샷 포함 확인. 거절 시 Solar가 여전히 거절된 tool을 재반환하는 사례가 실사용 흐름에서도 재현됐고, T06의 안전장치가 정상 작동해 화면이 안 깨짐을 확인.
- 버그 발견·수정 (T08 범위 밖, T02): 테스트 중 `/api/brain-dump`가 Solar가 가끔 `estimatedMinutes`로 정수 대신 소수(예: 12.5)를 반환하면 `z.number().int()` 검증에서 500 에러로 죽는 걸 발견. `estimatedMinutes` 스키마에서 `.int()` 제거하고 저장 전 `Math.round()`로 반올림하도록 방어 코드 추가, 5회 연속 재현 테스트로 확인.
- 추가 발견·수정: 제안 카드의 `reason` 문장에 `reasonChip`/`estimatedMinutes` 같은 내부 변수 이름이 그대로 노출되던 것을 발견, 프롬프트에 "개발 용어 쓰지 말고 자연스러운 문장으로" 제약 추가해 수정.
- 미결: T09(outcome 기록 — 완료 시 done, 다음 방문 시 이전 pending 일괄 not_done), T10(개인화 — recentLogs 실제 연결). split_node 재분할 시 원래 스텝 순서(created_time) 기준으로 다시 맨 위로 오는 점은 알려진 단순화.
- 확인: [x] 2026-07-26 00:19 GPT — T08 수정요청. shrink_step 수락이 완료 기준 축소를 실행하지 않음.

## 2026-07-25 | T09 | outcome 기록
- 작업: T08에서 빠져있던 실제 로그 기록 자체를 이번에 같이 채움. `app/api/agent-log/route.js`(신규) — 화면에서 수락/거절이 결정된 뒤 `logStruggle` 호출해 실제로 기록. `app/lib/agentlog.js`에 `markOutcomeDone(logId)`(즉시 done 갱신), `sweepStaleLogs()`(오늘 이전 timestamp의 pending을 전부 not_done, 로그가 어느 스텝이었는지는 안 보고 시간만 봄) 추가. `app/api/brain-dump/route.js`에 `sweepStaleLogs()` 호출 연결(S4 "Brain Dump 시작 시"). `app/api/steps/complete/route.js`가 `agentLogId`를 선택적으로 받아 `markOutcomeDone` 호출. `page.js`는 수락/거절마다 `logDecision()`으로 기록하고, encourage/shrink_step처럼 같은 스텝을 계속하는 경우만 로그 id를 `trackedAgentLogId`로 들고 있다가 그 스텝이 실제로 끝나면 `/api/steps/complete`에 같이 넘김.
- 검증: `npm run verify` 통과. (1) 어제 날짜 pending 로그를 수동 생성 후 `/api/brain-dump` 호출 → not_done으로 정리됨 확인. (2) 실제 브라우저로 이유 칩(그냥 그래요)→제안(encourage)→수락까지 진행 후 AgentLog에 정확한 필드로 기록되는지 확인. (3) `/api/steps/complete`에 실제 스텝 id + 임의 생성한 pending 로그 id를 같이 보내 `markOutcomeDone`이 실제로 outcome을 done으로 바꾸는지 확인.
- 미결: T10(개인화) — `recentLogs`가 아직 항상 빈 배열이라 `/api/struggle`이 과거 패턴을 못 보고 판단함. AgentLog가 "어느 스텝이었는지" Relation 없이 설계된 탓에, postpone_task/split_node/reorder_graph/swap_task/suggest_break/end_session 경로로 넘어간 로그는 완료 시점을 직접 못 잡고 다음 방문 때 not_done으로만 정리됨(설계상 알려진 단순화, S4 의도와 일치).
- 확인: [x] 2026-07-26 00:19 GPT — T09 수정요청. stepRef 기반 pending 로그 갱신 계약을 단일 logId로 축소함.

## 2026-07-25 | T10 | 개인화 (최근 로그 + 행동 패턴을 판단에 반영)
- 작업: `docs/skills.md` S2 갱신 — `recentLogs`를 클라이언트 입력에서 제거하고 "서버가 내부에서 `getRecentLogs` 호출"로 계약 수정(클라이언트가 Notion에 직접 접근할 방법이 없어서). `app/api/struggle/route.js`가 `getRecentLogs({ limit: 15, category: currentStep.category })`를 직접 호출하고, 추가로 `getBehaviorSummary()`(최근 완료 스텝 10개의 예상 대비 실제 시간 평균 배율 + 미룬 적 있는 비율)를 계산해 프롬프트에 포함. Notion Steps DB에 `StartedAt`·`CompletedAt`·`ActualMinutes`·`PostponeCount` 4개 속성 신규. `page.js`가 타이머 시작 시각을 `stepStartedAt`으로 들고 있다가 완료 시 실제 소요 분을 계산해 `/api/steps/complete`에 같이 전송(별도 "시작" API 호출 없이). `app/lib/notion.js`에 `getPage` 헬퍼 추가, `/api/steps/postpone`이 이걸로 기존 `PostponeCount`를 읽어 +1.
- 검증: `npm run verify` 통과. (1) 같은 category로 `suggest_break`를 3번 거절한 과거 로그를 미리 만들어두고 `/api/struggle` 호출 → `rejectedTools`로 명시적으로 막지 않았는데도 실제로 다른 tool(`swap_task`)을 제안하는 것으로 개인화 반영 확인. (2) 실제 스텝에 postpone 2번 호출 → `PostponeCount=2` 확인. (3) `/api/steps/complete`에 startedAt/completedAt/actualMinutes 전달 → Notion에 정확히 기록되는 것 확인.
- 미결: T11(Agent 평가 — 정답 세트 + Precision/Recall 스크립트)만 남음. 이걸로 Agent 루프(T05~T10) 전체가 실데이터 기반으로 동작.
- 확인: [x] 2026-07-26 00:19 GPT — T10 승인. 최근 로그·행동 패턴 반영 및 verify 통과 확인.

## 2026-07-26 | T05·T07·T08·T09 | GPT 리뷰 수정요청 4건 반영
- T05 반영: `app/lib/agentlog.js`의 `proposed_reason`을 Notion `title`이 아니라 실제 `rich_text`(Text) 속성으로 기록하도록 수정. Notion DB의 필수 title 속성은 `label`(reason_chip → proposed_tool 요약)로 분리해 신규 추가. `docs/skills.md` S3, `docs/etc/agent-design.md` AgentLog 스키마 표 동기화.
- T07 반영: `app/api/struggle/route.js`에서 시간 부족 수렴 상태에 `postpone_task`/`end_session`이 둘 다 이미 거절된 경우, 거절된 tool을 다시 후보로 강제하던 로직을 제거하고 모델 호출 없이 `{ proposedTool: "end_session", reason, final: true }`로 즉시 종결하도록 수정. `ProposalCard.js`가 `isFinal`을 받아 거절 버튼을 숨기지 않고 비활성화 + 안내 문구("지금은 더 미룰 수 없어요")로 처리(실수로 눌러도 안전). `docs/skills.md` S2 출력에 `final` 필드 추가.
- T08 반영: `/api/struggle`의 출력 스키마에 `revisedTitle`(shrink_step 전용, 완료 기준을 줄인 새 제목) 추가하고 프롬프트에 생성 지시 포함. `app/api/steps/shrink/route.js` 신규 — 수락 시 실제로 Notion의 스텝 Title을 revisedTitle로 갱신. `page.js`에서 `shrink_step`을 `encourage`와 분리된 분기로 처리.
- T09 반영: `trackedAgentLogId`(단일)를 `trackedAgentLogIds`(배열)로 변경, 같은 스텝에서 encourage/shrink_step을 여러 번 수락해도 로그 id가 쌓이도록 수정. `/api/steps/complete`가 `agentLogIds` 배열을 받아 전부 `markOutcomeDone` 처리. `docs/skills.md` S4에 "AgentLog에 Relation이 없어 화면이 id 목록을 직접 들고 있는다"는 실제 구현 방식 명시.
- 검증: `npm run verify` 통과. 4건 전부 실제 API 호출로 재현·확인 — (1) label/proposed_reason이 각각 Title/Text로 올바르게 기록됨, (2) postpone_task+end_session 둘 다 거절 시 모델 호출 없이 `final:true` 즉시 반환, (3) `/api/steps/shrink` 호출 시 실제 Notion Title 갱신 확인, (4) pending 로그 3개를 한 번에 `agentLogIds`로 보내 전부 done 갱신 확인.
- 확인: [x] 2026-07-26 21:55 GPT — 수정요청. T09 다중 id는 해결됐으나 T05 스키마 개수, T07 거절 tool 출력, T08 축소 보장, S4 멱등 위반이 남음.

## 2026-07-26 | T05·T07·T08·T09 | GPT 재검토 수정요청 4건 반영 (2차)
- T05: `docs/checklist.md` C05를 "7 property"에서 "계약 필드 7개 + Notion 필수 title `label` = 8 property"로 수정 — label 추가는 실수가 아니라 Notion 제약상 필요한 것이므로 완료조건 표기를 실제 스키마에 맞춤.
- T07: `app/api/struggle/route.js`의 종결 응답에서 `proposedTool`을 `"end_session"`이 아니라 `null`로 변경(거절된 값을 재사용하지 않기 위해 TOOLS 밖의 값으로). `app/page.js`의 `handleAccept`가 `proposal.final`이면 `proposedTool` 값과 무관하게 `end_session`으로 처리하도록 수정.
- T08: `shrink_step`인데 `revisedTitle`이 없는 경우를 안전망에 추가해 `encourage`로 대체(서버). 클라이언트는 `revisedTitle` 없으면 에러 처리, `/api/steps/shrink` 응답이 실패하면 로컬 제목을 바꾸지 않고 에러를 보여주도록 수정(저장 성공 확인 후에만 완료 처리).
- T09: `app/lib/agentlog.js`의 `markOutcomeDone`이 갱신 전 현재 `outcome`을 조회해 `pending`일 때만 `done`으로 바꾸도록 수정(멱등).
- 검증: `npm run verify` 통과. (1) 둘 다 거절된 극단 케이스 재현 → `proposedTool: null` 확인. (2) `not_done` 상태의 로그에 `markOutcomeDone` 재호출 → 그대로 `not_done` 유지 확인(멱등). (3) `overwhelmed` 5회 반복 호출로 `shrink_step`이 나올 때마다 `revisedTitle`이 항상 동반되는 것 확인.
- 확인: [x] 2026-07-26 22:11 GPT — 수정요청. T05·T09와 T08 저장 실패 처리는 해결됐으나, final null 계약 미동기화 및 shrink 대체 tool 재거절 가능성이 남음.

## 2026-07-26 | T07·T08 | GPT 재검토 수정요청 2건 반영 (3차)
- T07/S2 문서: `docs/skills.md` S2 출력 타입을 `proposedTool: tool`에서 `proposedTool: tool | null`로 수정해 종결 응답(`final:true`)의 `null` 반환과 문서를 일치시킴.
- T08: `shrink_step`인데 `revisedTitle`이 없을 때 무조건 `encourage`로 대체하던 걸, `toolChoices`(이미 `rejectedTools` 제외된 후보)에서 `shrink_step`이 아닌 첫 후보로 대체하도록 수정 — `encourage`가 이미 거절된 상태여도 재선택 금지를 어기지 않음. 대체할 후보가 아예 없으면(shrink_step만 남은 경우) T07과 같은 패턴으로 `proposedTool: null, final: true`로 강제 종결.
- 검증: `npm run verify` 통과. `toolChoices`는 rejectedTools를 필터링한 결과라 fallback 로직이 구조적으로 거절된 값을 다시 반환할 수 없음을 코드 경로로 확인.
- 확인: [x] 2026-07-26 22:17 GPT — 수정요청. 후보 0개가 TOOLS 전체로 복원되며, S2/C06의 null 종결 예외도 아직 모순됨.

## 2026-07-26 | T07 | GPT 재검토 수정요청 2건 반영 (4차)
- 근본 버그 수정: `app/api/struggle/route.js`의 `const toolChoices = candidates.length > 0 ? candidates : TOOLS;`가 후보가 완전히 소진되면(전체 8개 거절, isConverging 여부 무관) TOOLS 전체로 되돌아가 거절된 tool을 다시 제안할 수 있게 하던 버그를 제거. `isConverging` 필터링 이후 공통으로 `candidates.length === 0`을 확인해 그 시점에 바로 `{ proposedTool: null, reason, final: true }`로 종결하도록 통합.
- 문서 동기화: `docs/skills.md` S2 제약 문구와 `docs/checklist.md` C06을 "고정 8개 중 하나 **이거나 후보 소진 시 null**"로 수정해 `final` 종결 예외를 명시.
- 검증: `npm run verify` 통과. 8개 tool 전부 rejectedTools에 넣고(시간 제약과 무관하게) 호출 → `proposedTool: null, final: true` 확인.
- 확인: [x] 2026-07-26 22:22 GPT — 승인. 후보 소진 공통 null+final 종결, TOOLS 복원 제거 및 S2/C06 동기화 확인.

## 2026-07-27 | T04 | Timer 새로고침 내구성
- 작업: `app/page.js`에 새로고침 내구성 추가. 진행 상태(`step`/`currentIndex`/`microsteps`/`stepStartedAt`)를 바뀔 때마다 localStorage(`kok-session`)에 저장하고, 마운트 시 `useState` 초기값에서 바로 복원한다. "reason"/"proposal"(힘들어 루프 중) 상태는 재구성에 필요한 정보(reasonChip, 제안 내용)를 저장하지 않으므로 "focus"로 안전하게 되돌린다. `goHome()` 호출 시 저장된 값을 지운다. `app/components/FocusTimer.js`는 자체적으로 갖고 있던 `startedAt` state를 없애고 `page.js`의 `stepStartedAt`을 prop으로 받아 남은 시간을 재계산하도록 바꿔, 시작 시각을 두 군데서 따로 관리하던 걸 하나로 합쳤다.
- 실제 구현 중 두 차례 하이드레이션 오류를 만나 수정함: (1) 마운트 이펙트 안에서 여러 `setState`를 연쇄 호출하는 방식은 이 프로젝트의 eslint 규칙(`react-hooks/set-state-in-effect`)에 위반돼 `npm run verify`가 실패 → localStorage 복원을 이펙트가 아니라 각 `useState`의 lazy initializer에서 바로 읽어오는 방식으로 변경. (2) 그렇게 하니 서버는 항상 "input"을 렌더링하는데 클라이언트는 마운트 즉시 복원된 화면(`timer` 등 완전히 다른 컴포넌트 트리)을 렌더링해 하이드레이션 불일치 오류가 실제 브라우저에서 재현됨 → `useSyncExternalStore`로 마운트 완료 여부를 판단해, 하이드레이션이 끝나기 전까진 무조건 "input"을 그리고 마운트 직후에만 복원된 화면(`effectiveStep`)으로 전환하도록 수정.
- 검증: `npm run verify` 통과(lint+build). 이번 세션엔 브라우저 자동화 도구가 없어 새로고침 동작 자체는 사용자가 직접 dev 서버에서 확인함 — 타이머 도중 새로고침해도 화면이 유지되고 남은 시간이 실제 경과 시간만큼 정확히 줄어있음, 하이드레이션 오류 없음, 타이머 종료 후 다음 스텝/완료 화면 전이도 정상 확인. `docs/checklist.md` C04 2개 전부 체크, `docs/backlog.md` T04 완료로 변경, `CLAUDE.md` 현재 구현 상태 갱신.
- 미결: 없음
- 확인: [ ]

## 2026-07-27 | T15 | 타이머 종료 시 완료 확인 + Agent 판단 연장
- 작업: `app/api/timer-extend/route.js` 신규(S6) — `{currentStep, extendCount}`를 받아 Solar가 연장 분(1~25 정수)과 이유를 직접 판단해 반환, `suggest_break`과 같은 패턴(고정 계단이 아니라 모델이 직접 분 단위를 정함). `app/components/TimerConfirm.js` 신규 — 타이머 종료 시 뜨는 "이 스텝 다 끝났어?" 확인 화면. `app/page.js`의 `FocusTimer.onFinish`가 바로 완료 처리로 가지 않고 "timer-confirm" 화면을 거치도록 변경, "아니, 더 필요해" 선택 시 `/api/timer-extend`를 호출해 받은 분만큼 `stepStartedAt`을 재설정하고 타이머를 재시작한다. `extendCount`/`timerDurationMinutes`/`extendReason`은 다음 스텝으로 넘어갈 때(`advanceToNextStep`) 초기화. 연장 판단 이유는 `FocusTimer`에 캐릭터 위 말풍선(`SpeechBubble`, `BrainDumpInput`과 같은 위치)으로 표시 — 처음엔 시계 아래 텍스트로 뒀다가 사용자가 캐릭터에 가려져 안 보인다고 확인해줘서 위치를 바꿈. `docs/etc/component-tree.md`가 T08(이유칩/제안카드)·T04(새로고침 내구성) 반영이 안 된 채 낡아있던 걸 이번에 같이 최신화했다.
- 검증: `npm run verify` 통과(lint+build). `/api/timer-extend`를 실제 Solar 호출로 직접 확인(정수 `extendMinutes`, 자연스러운 한국어 `reason` 반환). 화면 클릭 흐름(타이머 종료 → 확인 화면 → "다 했어"로 정상 완료 전이, "더 필요해"로 연장된 시간만큼 타이머 재시작 + 말풍선 표시)은 사용자가 직접 브라우저에서 확인. `docs/checklist.md` C15 3개 전부 체크, `docs/backlog.md` T15 완료로 변경, `CLAUDE.md` 현재 구현 상태 갱신.
- 미결: 타이머 연장 도중 새로고침하면 연장된 시간(`timerDurationMinutes`)은 저장되지 않아 원래 예상 시간 기준으로 복원된다(C04/C15 어느 쪽에도 명시된 요구사항은 아니라 지금은 그대로 둠). T04·T15는 사용자 요청에 따라 GPT 리뷰를 한 번에 묶어 받을 예정(아직 리뷰 전).
- 확인: [ ]

## 2026-07-27 | T14 | Brain Dump 일정 확인 멀티턴
- 작업: `app/api/brain-dump/route.js`에 `turn`(되물은 횟수)·`clarifications`(답변 목록) 입력을 추가하고, Solar가 마이크로스텝 분할과 동시에 "기한이 명확한지, 불명확하면 뭐라고 되물을지, 명확하면 오늘로부터 며칠 뒤인지"까지 한 번의 호출로 판단하게 확장했다. 기한이 불명확하고 아직 질문을 2번 안 했으면(`turn<2`) 저장하지 않고 `{microsteps: null, followUpQuestion}`을 반환, 이미 2번 물었으면(`turn>=2`) 더 묻지 않고 오늘 날짜로 강제 확정한다. `app/page.js`의 `handleSubmit`이 최초 제출과 되묻기 답변 제출을 모두 처리하도록 통합했고, `app/components/BrainDumpInput.js`는 캐릭터 말풍선 문구를 prop으로 받아 되묻는 질문으로 바꿀 수 있게 했다. 구현 중 발견한 문제도 반영: 확정된 기한이 전부 오늘 이후로 미뤄지면 `/api/steps`가 빈 목록을 반환해 미리보기 화면이 깨질 수 있어서, 이 경우 입력 화면에 안내 문구만 보여주고 진행하지 않도록 함. 추가로 사용자 피드백에 따라 입력 화면 기본 문구를 "잘 쓰려고 하지 말고 편하게 적어도 돼! ..."로 바꿔 부담을 줄였다.
- 검증: `npm run verify` 통과(lint+build). `/api/brain-dump`를 실제 Solar 호출로 3가지 시나리오 확인 — 기한이 텍스트에 명확히 있으면 안 되묻고 바로 그 날짜로 저장, 기한이 없으면 되묻는 질문 반환(저장 안 함), 애매한 답변이 계속돼도 2번째 질문 이후(3번째 시도)엔 강제로 오늘 날짜 확정. 테스트로 만든 Notion 항목은 이후 archive 정리. 화면에서 실제로 되묻는 질문이 뜨고 답변 후 이어지는 것은 사용자가 직접 브라우저에서 확인. `docs/checklist.md` C14 3개 전부 체크, `docs/backlog.md` T14 완료로 변경.
- 미결: 없음
- 확인: [ ]

## 2026-07-27 | 홈 버튼 추가 (등록된 Task 아님)
- 작업: T14 테스트 중 사용자가 "화면을 벗어날 방법이 없다"고 지적해 반영. `app/components/HomeButton.js` 신규(왼쪽 위 고정 아이콘 버튼, 별도 아이콘 라이브러리 없이 인라인 SVG). input(되묻기 중일 때만)·preview·complete 화면에 추가했고, focus·timer·timer-confirm 화면은 사용자 요청대로 일부러 제외했다("할 일 하는 도중엔 이탈 유도 안 함"). 기존 `RestSuggestion`의 텍스트 버튼도 이 컴포넌트로 통일. `goHome()`이 T14 되묻기 상태(followUpQuestion 등)도 같이 지우도록 보완해, 홈으로 돌아온 뒤에도 되묻는 질문이 남아있지 않게 했다.
- 검증: `npm run verify` 통과. 화면 배치와 클릭 동작은 사용자가 직접 확인.
- 미결: 없음
- 확인: [ ]

## 2026-07-27 | T20 | 타이머 일시정지 + 재개 사유 기록
- 작업: 사용자가 "타이머 도중 멈출 방법이 없다"고 지적해 이슈 #49로 신규 등록 후 구현. `app/components/FocusTimer.js`에 오른쪽 위 일시정지 버튼(onPause) 추가. `app/components/PauseScreen.js` 신규 — 이유를 선택적으로 적을 수 있는 입력창과 "다시 시작" 버튼. `app/page.js`는 일시정지 시각(`pausedAt`)을 기록해두고, 다시 시작하면 멈춘 시간만큼 `stepStartedAt`을 뒤로 밀어 남은 시간이 그대로 이어지게 했다(T04의 시작 시각 재계산 방식 재사용). `pauseCount`/`pauseReasons`는 스텝별로 쌓아뒀다가 완료 시 `/api/steps/complete`에 같이 보내고, 서버는 빈 이유를 걸러내고 Notion Steps DB의 신규 속성 `PauseCount`(Number)/`PauseReasons`(Text)에 기록한다. 일시정지 이유를 그 순간 Agent 판단에 반영할지 사용자와 논의했는데, 할 일과 무관한 외부 방해(전화 등)라 그 순간 제안할 tool이 없다고 판단해 순수 기록으로만 뒀고, 대신 나중에 T10처럼 개인화 참고 정보로 쓸 수 있다는 메모를 `docs/dev-plan.md` 백로그에 남겼다.
- 검증: `npm run verify` 통과. `/api/steps/complete`를 실제 Notion 왕복으로 확인 — `pauseCount:2, pauseReasons:["전화 옴",""]` 전송 시 `PauseCount:2`, `PauseReasons:"전화 옴"`(빈 문자열 제외)으로 정확히 기록·조회됨. 테스트 데이터는 이후 archive 정리. 화면에서 일시정지→이유 입력→다시 시작→시간이 멈춘 만큼 빠지고 이어지는 것은 사용자가 직접 확인. `docs/checklist.md` C20 3개 전부 체크, `docs/backlog.md` T20 완료로 변경, 총 개수 표기(T01~T20) 갱신.
- 미결: 없음
- 확인: [ ]

## 2026-07-27 | T19 | 오늘 마감까지 남은 시간 표시 + 연장 버튼
- 작업: `app/page.js`의 `minutesUntilMidnight()`을 `minutesUntilDeadline(extraMinutes)`로 바꾸고, 연장 버튼으로 늘어난 분(`deadlineExtraMinutes`, 기본 0)을 더하도록 확장. `/api/struggle` 호출 시 `remainingTimeMinutes` 계산에도 그대로 반영해, T07의 재판단 게이트가 연장된 시간을 인식하게 했다. `app/components/OneFocusView.js`에 "지금 HH:MM · 오늘 마감까지 N시간 M분" 문구와 "+1시간" 버튼을 추가하고, 1초마다 갱신되는 자체 시계(`useEffect`+`setInterval`)를 붙였다. `goHome()`에서 `deadlineExtraMinutes`를 0으로 리셋.
- 검증: `npm run verify` 통과(lint+build). 화면에서 시계가 실시간으로 도는 것과 "+1시간" 버튼을 누르면 남은 시간이 늘어나는 것은 사용자가 직접 확인. `docs/checklist.md` C19 2개 전부 체크, `docs/backlog.md` T19 완료로 변경, `CLAUDE.md` 현재 구현 상태 갱신(T14/T20/T19 반영).
- 미결: `deadlineExtraMinutes`는 새로고침 시 리셋된다(T04 localStorage 세션에 포함 안 함) — C19에 명시된 요구사항은 아니라 지금은 그대로 둠.
- 확인: [ ]

## 2026-08-02 | T17 | 마이크로스텝 검토·삭제 화면 구현
- 구조 변경(백로그 명시 사항): Brain Dump 확정 시점에 바로 Notion에 저장하던 것을 제거(`app/api/brain-dump/route.js`에서 `saveMicrostep`/`createPage` 호출 삭제)하고, 사용자가 검토 화면에서 확정한 뒤에만 저장하도록 저장 시점을 뒤로 미뤘다. `docs/skills.md` S1을 이 변경에 맞춰 수정하고, 신규 계약 S1-save(`POST /api/steps/save`)를 추가했다.
- 신규 화면: `app/components/MicrostepReview.js` — 전체 마이크로스텝 목록, 카테고리 한글 태그, 총 예상 시간 합계, 항목별 삭제(로컬 상태만 변경), "전부 다시 쪼개기"(같은 입력으로 `/api/brain-dump` 재호출), "이대로 시작하기"(확정 목록을 `/api/steps/save`로 저장 후 `GET /api/steps` 재조회) 버튼을 갖췄다.
- `app/page.js`: `handleSubmit`이 확정 시 저장 없이 `"review"` step으로 이동하도록 변경. `handleDeleteMicrostep`/`handleReshuffle`/`handleConfirmReview` 신규. `RESTORABLE_STEPS`에 `"review"` 추가(새로고침 시 검토 화면 복원, 단 다시 쪼개기용 원본 입력값은 미보존 — 알려진 제한으로 문서화).
- `CompleteScreen`: `task`(마지막 완료 텍스트) prop을 `completedCount`(그 배치의 전체 완료 개수, `microsteps.length`)로 교체.
- 검증: `npm run verify` 통과. 실제 동작 확인 — (1) `/api/brain-dump` 호출 후 `/api/steps` 조회로 저장 안 됨 확인, (2) 12개 중 2개만 남기고 `/api/steps/save` 호출 → Notion에 정확히 2개만 추가됨을 API로 확인, (3) 실제 화면에서 삭제 시 총 시간 합계 재계산(17분→15분) 스크린샷 확인, (4) "전부 다시 쪼개기" 클릭 시 목록·합계가 다른 결과로 교체되는 것 확인, (5) "이대로 시작하기" 클릭 후 저장 + `preview` 전환 확인, (6) localStorage로 `complete` 상태를 재현해 "N개 해냈다" 렌더 확인. 테스트 중 생성된 Notion 행은 전부 정리(archive)해 실제 데이터(영상 촬영분 10개)는 그대로 유지했다.
- 문서: `docs/checklist.md` C17 전체 체크, `docs/backlog.md` T17 완료 처리, `docs/etc/component-tree.md`에 `review` step·`MicrostepReview` 반영, `CLAUDE.md` 현재 구현 상태 갱신.
- 확인: [x] 2026-08-02 22:31 GPT — 수정요청: 새로고침 후 재분할 무반응, split_node 저장 회귀, S1-save 검증 누락.

## 2026-08-02 | T22 | 화이트노이즈 테마 (낮/밤 동기화·숲·카페) 구현
- Phase 2 백로그 항목을 우선순위(A→B→D→E→C)를 벗어나 먼저 진행(사용자 결정, 디자인 작업 우선). GitHub 이슈 #56 등록 후 backlog.md/checklist.md/dev-prompts.md 문서 먼저 갱신.
- `app/lib/theme.js` 신규: `isNightTime`(6~18시를 낮으로 판정), `themeBackgroundColor`, `themeTextColor`(밤 배경에서 기본 --ink 텍스트가 안 보이는 문제 때문에 추가).
- `app/components/ThemeSwitcher.js`, `app/components/ThemeDecoration.js` 신규: 3개 원형 토글, 테마별 코너 장식(해/달, 나뭇잎+새, 커피잔+김). 중앙 콘텐츠와 안 겹치는 코너에만 배치해 z-index 계산 없이 안전하게 그림.
- `app/components/Character.js`: `color` prop 추가(기본 rose, forest 테마일 때만 forest로 교체) — docs/prototype/whitenoise-themes.html 근거.
- `app/components/OneFocusView.js`/`FocusTimer.js`: `theme` prop으로 배경색 적용, `ThemeDecoration` 렌더. `OneFocusView`에만 `ThemeSwitcher`(선택은 여기서만, `FocusTimer`는 이어받기만). `app/globals.css`에 forest/night/coffee 계열 CSS 토큰 추가(design.md에 이미 문서화돼 있던 값 그대로).
- `app/page.js`: `theme` state 추가, `localStorage`(`kok-theme`)로 새로고침해도 유지.
- 검증: `npm run verify` 통과. 실제 화면에서 Date를 14시/22시로 모킹해 낮/밤 배경·장식·텍스트 전환 확인, 숲/카페 토글 클릭으로 배경·장식·캐릭터 색 전환 확인, 숲 테마 선택 후 새로고침해도 유지되는 것 확인. 검증 중 밤 배경에서 기본 텍스트 색 대비가 나쁜 실제 버그를 발견해 `themeTextColor`로 수정.
- 문서: checklist.md C22 전체 체크, backlog.md T22 완료 처리, component-tree.md props 표 갱신, CLAUDE.md 현재 구현 상태 갱신, README.md/CLAUDE.md/instructions.md/commit-rules.md의 Task/Checklist 총 개수 표기를 T01~T22/C01~C22로 갱신.
- 확인: [x] 2026-08-02 22:31 GPT — 승인: C22 테마 선택·경계·화면 적용·영속 및 verify 통과 확인.

## 2026-08-02 | T21, T23 | T21 이슈 등록·완료조건 정의 + T23 복귀 환영 메시지 구현
- T21(Notion Public Integration + OAuth): GitHub 이슈 #57 등록, docs/backlog.md에 이슈 번호·선행조건(T18 완료) 반영, docs/checklist.md C21 정의(4항목). 실제 구현(OAuth 코드 작성)은 Phase 2 백로그 완료 후 별도 진행하기로 결정(260802) — 지금은 착수 절차만 완료.
- T23(다시 시작해도 괜찮아): GitHub 이슈 #58 등록. `app/page.js`에 마지막 방문일(`kok-last-visit`, localStorage)과 오늘 날짜 차이를 계산하는 로직 추가, 2일 이상이면 `returningMessage` state를 채워 `BrainDumpInput`의 기존 캐릭터 말풍선(`prompt`)을 "N일 만이네, 반가워"로 교체. Notion 조회 없이 클라이언트에서만 판단(간단한 스코프 유지).
- 검증: `npm run verify` 통과. 실제 화면에서 (1) 첫 방문(기록 없음) → 기본 문구, (2) localStorage에 3일 전 방문 기록 주입 → "3일 만이네, 반가워" 노출, (3) 같은 날 재방문(새로고침) → 기본 문구로 복귀, 3가지 케이스 스크린샷으로 확인.
- 겸사겸사 dev-plan.md의 "2분 스타터" 백로그 항목을 T02(Brain Dump 분할)+T03(One-Focus View)로 이미 충족된 것으로 판단해 제외 처리(사용자 확인 후).
- 문서: checklist.md C21(미체크, 착수 전)·C23(전체 체크) 반영, backlog.md T21/T23 반영, CLAUDE.md 현재 구현 상태 갱신.
- 확인: [x] 2026-08-02 22:31 GPT — T21 수정요청(미구현·계약 미정), T23 수정요청(한국 시간 자정대 날짜 오차).

## 2026-08-02 | T24 | 감각 강도 조절 + 테마별 배경음 구현
- 디자인 근거: `docs/prototype/feature-proposals.html` 03번 프레임(다이얼+색상 견본). 사용자 판단으로 다이얼(색+움직임 통합)과 소리(별도 스피커 아이콘)를 분리해서 컨트롤 디테일을 높임.
- 실제 배경음 4개(Mixkit 무료 라이선스, 상업적 이용·저작자 표시 불필요) 확보해 `public/sounds/`에 추가: `day.mp3`(새소리), `night.mp3`(귀뚜라미), `forest.mp3`(숲속 새소리), `cafe.mp3`(카페 웅성거림). Mixkit 사이트에서 Envato Elements 프리미엄 미리보기(로그인 필요)와 진짜 무료 항목이 섞여있어, Playwright로 실제 DOM의 `data-audio-player-preview-url-value` 속성을 읽어 "View on Envato" 링크가 없는(=진짜 무료) 항목만 선별.
- `app/lib/theme.js`: `themeSoundSrc`(테마·낮/밤별 파일 경로), `intensityToSaturate`(0~100 → 40~140% 채도) 추가.
- `app/components/ThemeSound.js` 신규: 화면에 안 그려지는 `<audio loop>` 관리 컴포넌트. 브라우저 자동재생 정책 때문에 `play()` 실패는 조용히 무시(스피커 아이콘 재클릭으로 복구 가능).
- `app/components/SensoryControl.js` 신규: 톱니 아이콘 → 팝오버(다이얼+색상 견본 3개+캡션+스피커 토글), 프로토타입 CSS 값 그대로 이식.
- `app/components/OneFocusView.js`/`FocusTimer.js`: `intensity`/`soundEnabled` prop 추가, `Character`·`ThemeDecoration`에 `saturate()` filter 적용, `FocusTimer`의 물 차오르는 `transition`을 intensity<30이면 `none`으로.
- `app/page.js`: `intensity`(기본 60)·`soundEnabled` state + localStorage(`kok-intensity`, `kok-sound-enabled`) 유지.
- 검증: `npm run verify` 통과. 실제 화면에서 (1) 패널 열기·다이얼 드래그(10→95) 시 캐릭터 채도·캡션 변화 스크린샷 확인, (2) intensity=15에서 타이머 water-fill div의 `transition` 값이 `none`인 것 코드 레벨로 확인, (3) 스피커 토글 클릭 시 `<audio>`가 올바른 테마 파일로 `paused:false` 재생되고 `volume`이 intensity와 일치하는 것 확인, (4) localStorage 값이 새로고침 후에도 유지되는 것 확인(단 오디오 자동재생 자체는 브라우저 정책상 별도 동작 필요 — 알려진 제한으로 문서화).
- 문서: checklist.md C24 전체 체크, backlog.md T24 완료 처리, component-tree.md props·알려진 제한 반영, CLAUDE.md 현재 구현 상태 갱신.
- 확인: [x] 2026-08-02 22:31 GPT — 승인: C24 강도·애니메이션·테마 음원·볼륨·영속 및 verify 통과 확인.

## 2026-08-02 | T25 | 같이 있어요 (장식용 동시접속 표시) 구현
- 디자인 근거: `docs/prototype/feature-proposals.html` 04번 프레임(헤드라인+점 묶음+"혼자 할래요" 링크, 화면 중앙 배치).
- 구현 중 레이아웃 문제 발견: `Character`가 `position:absolute`+큰 `scale(2.2)`로 화면 하단을 넓게 차지해서, 프로토타입처럼 중앙 하단에 배치하면 완전히 가려짐(Playwright로 "혼자 할래요" 버튼 클릭이 안 되는 것으로 재현·확인). 화면 상단 좌측(SensoryControl의 반대쪽)에 점+숫자+닫기(×) 버튼만 있는 작은 알약으로 압축해서 재배치 — 오히려 원래 의도("아주 작은 점 몇 개로만 존재")에 더 맞음.
- `app/components/PresenceIndicator.js` 신규: 날짜 문자열을 시드로 한 고정 가짜 인원수(80~200명), 점 5개(그 중 하나는 "나"), hover 툴팁으로 "이름도 채팅도 없다" 안내.
- `app/page.js`: `presenceDismissed` state + localStorage(`kok-presence-dismissed`) 유지.
- 검증: `npm run verify` 통과. 실제 화면에서 (1) 기본 노출 스크린샷, (2) × 클릭 후 사라짐, (3) 새로고침 후에도 계속 안 보이는 것 확인.
- 문서: checklist.md C25 전체 체크, backlog.md T25 완료 처리(프로토타입 대비 레이아웃 변경 사유 기록), component-tree.md props 반영, CLAUDE.md 현재 구현 상태 갱신.
- 확인: [x] 2026-08-02 22:31 GPT — 승인: C25 장식 표시·안내·숨김 영속 및 verify 통과 확인.

## 2026-08-02 | T26 | 통계 화면 (이번 주 완료 현황) 구현
- 디자인 근거: `docs/prototype/design-board.html` 07번 프레임("대시보드 대신 숫자 하나") — 큰 숫자 + 캡션 + 요일별 점 7개, 그래프/표 없음.
- `app/api/stats/route.js` 신규: Steps DB를 `Done=true`·`CompletedAt on_or_after(6일 전)`으로 조회해 최근 7일 중 완료 기록이 있는 날짜 집합을 만들고, 오늘 기준 7일치 boolean 배열(`week`)과 완료한 날 수(`daysCompleted`)를 반환.
- `app/components/StatsScreen.js` 신규, `app/components/BrainDumpInput.js`에 `onViewStats` 링크("이번 주 통계 보기") 추가. `app/page.js`에 `"stats"` step + `handleViewStats`(진입 시 조회) 추가.
- 검증: `npm run verify` 통과. 실제 Notion 데이터로 먼저 확인(현재 0/7, 실제로 완료 기록이 없어서 정확), 이후 임시로 완료 기록 3개(오늘·2일 전·5일 전)를 만들어 `daysCompleted:3`과 정확한 위치의 점이 채워지는 것을 API 응답과 스크린샷 둘 다로 확인 → 즉시 정리(archive)해 실제 데이터는 원래 0/7 상태로 복원. 화면 진입("이번 주 통계 보기")과 복귀(홈 버튼)도 스크린샷으로 확인.
- 문서: checklist.md C26 전체 체크, backlog.md T26 완료 처리, component-tree.md에 `stats` step·`StatsScreen` 반영, CLAUDE.md 갱신. 겸사겸사 dev-plan.md의 Phase 2 백로그 목록 중 이미 완료된 항목(T18·T22~T26)을 취소선으로 정리(그동안 미반영이었던 것 포함).
- 확인: [x] 2026-08-02 22:31 GPT — 수정요청: 한국 시간 자정대 최근 7일 오차 및 요일 식별 정보 누락.

## 2026-08-02 | T17·T23·T26 | GPT 리뷰 수정요청 반영
- T17 발견 1(높음) 반영: `pendingBrainDumpParams`를 `kok-session`(localStorage)에 같이 저장하도록 수정. 검토 화면에서 새로고침해도 "전부 다시 쪼개기"가 정상적으로 `/api/brain-dump`를 재호출함(이전엔 값이 사라져 조용히 아무 일도 안 일어났음).
- T17 발견 2(높음, split_node 회귀) 반영: `app/page.js`의 `split_node` 분기가 `/api/brain-dump` 응답을 무시하고 바로 원본을 archive하던 것을 수정 — 이제 분할 결과를 `scheduledDate`(원본 값 상속)와 함께 `/api/steps/save`로 먼저 저장하고, 저장이 성공한 뒤에만 원본을 archive한다. 되묻기를 피하려고 `turn:2`로 호출(스텝 제목만으로는 기한 문구가 없어 되물을 수 있는데, 저장 시 원본 scheduledDate로 덮어쓰므로 불필요).
- T17 발견 3(중간) 반영: `app/api/steps/save/route.js`에 S1과 동일한 MicroStep Zod 스키마(title·estimatedMinutes 1~25·category enum·scheduledDate) 검증 추가.
- T23·T26 UTC 날짜 오차 반영: `app/lib/date.js`에 `kstDateString` 신설(서버 타임존과 무관하게 항상 KST 기준 날짜 반환). `app/page.js`(복귀 환영)와 `app/api/stats/route.js`(통계, CompletedAt 비교 포함)에 적용.
- T26 접근성 보완: `StatsScreen`의 점 7개에 요일 라벨(`aria-label`/`title`) 추가.
- 검증: `npm run verify` 통과. (1) 리뷰가 제시한 반례(UTC 2026-08-01T15:30 = KST 2026-08-02 00:30)로 `kstDateString` 정확성 확인. (2) 실제 화면에서 검토 목록 제출 → 새로고침 → "전부 다시 쪼개기" 클릭 시 로딩 상태가 뜨고 목록이 바뀌는 것 확인. (3) `/api/struggle`을 반복 호출해 실제로 `split_node`를 받아낸 뒤, 그 시퀀스(brain-dump turn:2 → steps/save → steps/archive)를 그대로 재현해 원본이 사라지고 분할된 새 스텝들이 저장되는 것 확인(테스트 데이터는 이후 정리). (4) `/api/steps/save`에 잘못된 category·범위 밖 시간 보내 400 응답 확인, 정상 입력은 그대로 저장되는 것 확인. (5) 통계 화면에서 요일 라벨이 실제 요일과 일치하는 것 확인.
- T21은 검토대로 미구현 상태 유지(의도적 보류, 이번 라운드에서 손대지 않음).
- 확인: [ ]
