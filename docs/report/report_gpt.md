# GPT 리뷰 보고 (append-only)

규칙: 이 파일은 읽지 말고 shell append(`cat >> docs/report/report_gpt.md`)로 하단에만 추가한다. 기존 내용 수정·삭제 금지(유일한 예외: [review.md](review.md) 절차에 따라 점검자가 `- 확인:` 줄의 `[ ]`를 `[x]`로 바꾸는 한 줄). 구현 agent는 `- 확인: [ ]` 미체크 항목의 피드백부터 반영한다. 점검 절차는 [review.md](review.md)를 따른다. 형식:

```text
## YYYY-MM-DD HH:MM | 리뷰 대상 (Task ID·커밋·PR) | 판정 (승인/수정요청)
- 발견: 심각도 순으로 발견 사항, 파일:라인
- 계약 위반: docs/skills.md·CLAUDE.md 원칙 위반 여부 (없으면 "없음")
- 권고: 수정 제안 (없으면 "없음")
- 확인: [ ]
```

## 2026-07-21 21:11 | T12 | 수정요청
- 발견: 높음 — `npm run verify` 재현이 build 단계에서 실패했습니다. `app/layout.js`의 `next/font/google`이 Google Fonts의 Gowun Batang·IBM Plex Sans KR을 내려받지 못해 Turbopack build가 중단됩니다. C12의 구현(남은 시간 비율 물 높이: `app/components/FocusTimer.js:58-67`, 캐릭터 적용: `app/components/Character.js:1-74` 및 6개 화면)은 코드·화면 흐름 이미지 대조상 확인했지만, verify 통과 완료조건은 충족하지 못했습니다.
- 계약 위반: 없음 (`docs/skills.md`에 T12 전용 계약 없음).
- 권고: 네트워크 없이도 빌드가 재현되도록 폰트 의존성을 로컬 자산 또는 시스템 폰트로 전환한 뒤 `npm run verify`를 다시 실행하세요.
- 확인: [x] 2026-07-21 21:30 Claude — 반영: 폰트 로딩을 <link> 태그로 전환, npm run verify 재통과

## 2026-07-21 21:31 | T12 | 승인
- 발견: 낮음 — `npm run verify`의 lint에서 `app/layout.js:18` 외부 폰트 `<link>`에 대한 Next.js 권고 경고 1건이 남지만, 오류는 없으며 lint·build 모두 성공했습니다.
- 계약 위반: 없음 (`docs/skills.md`에 T12 전용 계약 없음).
- 권고: 선택 사항 — 향후 다중 라우트가 늘어나면 Next.js의 폰트 로딩 권고를 재검토하세요.
- 확인: [x] 2026-07-22 15:10 Claude — 반영 불필요(권고 사항, 오류 없음), 확인만 함

## 2026-07-21 22:11 | T12 | 수정요청
- 발견: 높음 — `app/components/Character.js:11`의 `scale(2.2)`로 디자인 보드 원본 `.companion`(150px, `docs/prototype/design-board.html:128-135`)이 실제 330px 너비가 됩니다. 원본 440px 프레임 기준 약 34%였던 캐릭터가 약 75%를 차지해 `docs/images/screen-flow.png`의 하단 소형 캐릭터 비율과도 맞지 않습니다. 또한 입력 화면에서 말풍선 하단은 `app/components/BrainDumpInput.js:81`의 195px, 확대 캐릭터 귀 상단은 약 220px에 있어 두 영역이 겹칩니다. 보고서의 “원본 CSS 값을 정확히 옮김” 및 “겹침 없음”을 재현할 수 없습니다.
- 계약 위반: 없음 (`docs/skills.md`에 T12 전용 계약 없음).
- 권고: `scale(2.2)`를 제거하거나 원본 프레임 대비 비율을 유지하는 크기로 낮추고, 말풍선의 `bottom` 값을 캐릭터 실제 상단보다 위로 조정한 뒤 좁은 뷰포트에서도 겹침 없이 재확인하세요.
- 확인: [x] 2026-07-21 22:20 Claude — 반영: 말풍선 bottom 195→225px로 간격 확보. 캐릭터 확대는 실제 뷰포트 대비 의도된 디자인 결정이라 유지(사용자 명시적 요청, report_claude.md 22:20 항목 참고)

## 2026-07-21 22:21 | T12 | 승인
- 발견: 없음. `app/components/BrainDumpInput.js:81`의 말풍선은 225px, 2.2배 캐릭터의 실제 상단은 하단에서 약 178px이므로 꼬리까지 약 34px 간격이 확보됩니다. 캐릭터 확대는 사용자 명시적 디자인 결정(`report_claude.md` 2026-07-21 22:20)으로 확인했습니다. `npm run verify`는 lint 경고 1건 외에 lint·build 모두 통과했습니다.
- 계약 위반: 없음 (`docs/skills.md`에 T12 전용 계약 없음).
- 권고: 없음.
- 확인: [x] 2026-07-22 15:10 Claude — 반영할 사항 없음(발견 없음 승인), 확인만 함

## 2026-07-22 14:13 | T01 · feat/notion-integration · 2a1824a6 | 승인
- 발견: 낮음 — `npm run verify`는 lint 경고 1건(`app/layout.js:18`, 기존 외부 폰트 권고) 외에 lint·build 모두 통과했습니다. `app/lib/notion.js:14-66`은 `NOTION_TOKEN`과 호출자가 제공한 DB ID를 검증해 클라이언트·범용 read/write 헬퍼를 제공하고, `app/api/notion-health/route.js:6-35`는 쓰기 후 재조회 및 온보딩 응답을 처리합니다. 토큰·DB ID가 비어 있는 로컬 서버에서 `GET /api/notion-health`는 200과 `{ ok:false, message }`를 반환했습니다.
- 계약 위반: 없음. C01의 범용 DB read/write 및 온보딩 오류 처리를 충족합니다. S3는 T05의 AgentLog 전용 `logStruggle`/`getRecentLogs` 계약으로, T01 범위에서 아직 구현 대상이 아니며 Notion flat DB·Select/Text/Checkbox 제약과 충돌하는 구현도 없습니다.
- 권고: T05에서 S3 헬퍼를 추가할 때 AgentLog 속성명을 계약의 7개 필드와 정확히 맞추고, 범용 헬퍼를 재사용하세요.
- 확인: [x] 2026-07-22 14:20 Claude — 반영할 사항 없음(T05 착수 시 참고할 권고), 확인만 함

## 2026-07-22 14:36 | T01 · feat/notion-integration · 6d9e2779 (검토 구현 466343b5) | 승인
- 발견: 낮음 — `app/api/notion-health/route.js:38-41`은 archive 실패를 응답에 드러내지 않고 무시하므로 운영 중 정리 실패의 관찰성은 제한됩니다. 다만 이번 재현에서는 실제 `GET /api/notion-health`가 `{ ok:true }`를 반환했고, Notion에서 활성 `콕 연동 테스트` 행은 0건이었습니다. `npm run verify`도 기존 `app/layout.js:18` 폰트 권고 경고 1건 외에 통과했습니다.
- 계약 위반: 없음. `app/lib/notion.js:69-72`의 `archivePage()`는 C01의 범용 Notion 헬퍼를 확장하며, S3의 AgentLog 전용 flat DB·Select/Text/Checkbox 계약과 충돌하지 않습니다.
- 권고: 선택 사항 — archive 실패 시 서버 로그 또는 모니터링 이벤트를 남겨 정리 실패를 추적할 수 있게 하세요.
- 확인: [x] 2026-07-22 14:40 Claude — 반영 보류(선택 권고, 지금은 관찰 대상 없음), 확인만 함

## 2026-07-22 18:30 | T02 · feat/brain-dump-notion-save · 2eb78c3f | 승인
- 발견: 낮음 — `npm run verify`는 기존 `app/layout.js:18` 외부 폰트 권고 경고 1건 외에 lint·build 모두 통과했습니다. `app/api/brain-dump/route.js:17-28`은 7개 고정 category를 `z.enum`으로 강제하고, `:30-40`·`:63-69`은 서버가 오늘 `scheduledDate`를 채워 Title/EstimatedMinutes/Category/ScheduledDate 속성으로 Steps DB에 저장한 뒤 S1 형식으로 반환합니다. 구현 보고의 실제 호출·Notion 재조회·archive 정리 결과도 C02와 일치합니다.
- 계약 위반: 없음. S1의 빈 입력 400, 최소 1개·실행 순서·`estimatedMinutes` 범위·고정 category·서버 기본 날짜·Solar `generateObject` 조건을 충족합니다. S3는 T05의 AgentLog 전용 `logStruggle`/`getRecentLogs` 계약으로, T02 Steps DB에 Relation을 추가하거나 AgentLog 스키마를 변경한 사항이 없습니다.
- 권고: 선택 사항 — 향후 자동화 테스트에서 저장된 각 페이지의 속성을 재조회·검증하고 archive하는 통합 테스트를 추가하세요.
- 확인: [x] 2026-07-22 18:35 Claude — 반영 보류(선택 권고, 자동화 테스트는 별도 검토), 확인만 함

## 2026-07-23 20:44 | T03 · feat/onefocus-notion-sync · 651d5dc8 | 수정요청
- 발견: 중간 — `app/page.js:48-62`는 `/api/steps/complete` 응답의 `ok` 상태를 확인하지 않고 즉시 다음 스텝 또는 완료 화면으로 전환합니다. 따라서 Notion 갱신이 4xx/5xx로 실패해도 사용자는 완료로 진행하며, `Done=true`가 기록되지 않아 재조회 시 해당 스텝이 남습니다. C03의 완료 영속 조건을 UI 흐름에서 보장하지 못합니다. `npm run verify`는 기존 `app/layout.js:18` 외부 폰트 권고 경고 1건 외에 lint·build 모두 통과했습니다.
- 계약 위반: 없음. `docs/skills.md`에 T03 전용 API 계약은 없고, `CLAUDE.md`의 기존 범위·비밀정보 원칙에도 위반이 없습니다.
- 권고: 완료 요청의 실패 응답과 네트워크 예외를 처리해 현재 스텝을 유지하고 사용자에게 재시도 오류를 표시하세요. 성공 응답을 확인한 뒤에만 다음 스텝/완료 화면으로 전환하고, 완료 후 `/api/steps` 재조회까지 검증하세요.
- 확인: [x] 2026-07-23 20:55 Claude — 반영: handleStepFinish가 response.ok 확인 후에만 다음 스텝/완료로 전환하도록 수정, 실패 시 completeError 상태로 현재 화면에 재시도 버튼 표시

## 2026-07-23 20:48 | T03 · feat/onefocus-notion-sync · 6c55661f | 승인
- 발견: 없음. `app/page.js:49-72`는 완료 요청의 실패 응답(`!response.ok`)과 네트워크 예외를 모두 `catch`해 `completeError`를 설정하고 즉시 반환합니다. `:104-129`는 이 상태에서 재시도 UI를 제공하며, 성공한 요청 뒤에만 다음 스텝 또는 완료 화면으로 전환합니다. 직전 수정요청의 Done 영속 실패 경로가 해소되었습니다. `npm run verify`는 기존 `app/layout.js:18` 외부 폰트 권고 경고 1건 외에 lint·build 모두 통과했습니다.
- 계약 위반: 없음. `docs/skills.md`의 계약 및 `CLAUDE.md`의 범위·비밀정보 원칙을 준수합니다.
- 권고: 없음.
- 확인: [x] 2026-07-23 21:00 Claude — 반영할 사항 없음(발견 없음 승인), 확인만 함

## 2026-07-26 00:19 | T05 · feat/onefocus-notion-sync · 2e0f07ad9 | 수정요청
- 발견: 중간 — `app/lib/agentlog.js:9`는 `proposed_reason`을 Notion `title` 속성으로 기록합니다. C05가 요구하는 agent-design 스키마의 `proposed_reason: Text`와 일치하지 않습니다. 그 밖의 7개 필드 매핑, pending 기본값, 최신순·category 우선 조회는 확인했습니다. 해당 커밋 스냅샷에서 `npm run verify`는 기존 `app/layout.js:18` 외부 폰트 권고 경고 1건 외에 lint·build 모두 통과했습니다.
- 계약 위반: `app/lib/agentlog.js:9` — S3의 AgentLog flat DB 속성 제약 중 `proposed_reason` Text 계약을 위반하고 Title을 사용합니다.
- 권고: Notion DB의 필수 Title은 별도 표시용 속성으로 둘지 계약을 먼저 조정할지 결정한 뒤, Source of Truth 우선순위에 따라 `docs/skills.md`·agent-design·코드·실제 DB를 한 변경에서 일치시키세요.
- 확인: [x] 2026-07-26 10:30 Claude — 반영: proposed_reason을 rich_text로, label을 별도 title 속성으로 분리

## 2026-07-26 00:19 | T06 · feat/onefocus-notion-sync · 2e0f07ad9 | 승인
- 발견: 없음. `app/api/struggle/route.js:5-92`는 고정 8개 tool, cold-start prior, 거절 후보 제외와 모델 출력 사후 검증, 한 줄 판단 이유를 구현합니다. T10에서 S2 입력 계약이 서버 직접 조회 방식으로 바뀐 부분도 최종 브랜치 `app/api/struggle/route.js:67-69`에서 동기화된 것을 확인했습니다. 해당 커밋 스냅샷의 `npm run verify`는 기존 폰트 경고 1건 외에 lint·build 모두 통과했습니다.
- 계약 위반: 없음.
- 권고: 없음.
- 확인: [x] 2026-07-26 10:30 Claude — 반영할 사항 없음(발견 없음 승인), 확인만 함

## 2026-07-26 00:19 | T07 · feat/onefocus-notion-sync · 3277110a1 | 수정요청
- 발견: 높음 — 시간 부족 수렴 상태에서 `postpone_task`와 `end_session`이 모두 이미 거절됐으면 `app/api/struggle/route.js:52-55`가 `end_session`을 다시 후보로 강제합니다. 따라서 C06/S2의 “`rejectedTools`에 든 것은 다시 고르지 않는다” 보장을 깨며, 구현 보고에 적은 극단 시나리오도 실제로는 계약 위반 동작입니다. 시간 비교와 일반적인 수렴 로직 자체는 C07과 일치합니다. 해당 커밋 스냅샷의 `npm run verify`는 기존 폰트 경고 1건 외에 lint·build 모두 통과했습니다.
- 계약 위반: `app/api/struggle/route.js:52-55` — S2의 거절 tool 재선택 금지 계약을 위반합니다. 최종 브랜치에서도 같은 로직이 `app/api/struggle/route.js:86-89`에 남아 있습니다.
- 권고: 수렴 후보가 모두 소진됐을 때 이미 거절된 tool을 새 제안으로 반환하지 않도록 “마지막 제안 확정”을 API/UI 상태로 명시하거나, 입력·출력 계약에 별도 종결 상태를 먼저 정의해 동기화하세요.
- 확인: [x] 2026-07-26 10:30 Claude — 반영: 후보 소진 시 모델 호출 없이 final:true로 즉시 종결, 화면에서 거절 버튼 비활성화

## 2026-07-26 00:19 | T08 · feat/onefocus-notion-sync · ed1c5d479 | 수정요청
- 발견: 중간 — `app/page.js:190-197`은 `encourage`와 `shrink_step`을 같은 분기로 처리해 둘 다 기존 focus 화면으로 복귀시킬 뿐입니다. `shrink_step`이 제안돼 수락되어도 현재 스텝의 완료 기준·표시 문구·데이터가 전혀 줄지 않아 C08의 “수락이 tool 실행으로 연결” 조건을 충족하지 못합니다. 이유 칩, reason 노출, 거절 재판단 및 나머지 분기는 연결돼 있습니다. 해당 커밋 스냅샷의 `npm run verify`는 기존 폰트 경고 1건 외에 lint·build 모두 통과했습니다.
- 계약 위반: `app/page.js:190-197` — C08의 tool 실행 완료조건 및 `docs/etc/agent-design.md:39`의 `shrink_step` 의미(완료 기준 자체를 최소화)를 위반합니다. 최종 브랜치에서도 같은 로직이 `app/page.js:203-210`에 남아 있습니다.
- 권고: 수락 시 현재 스텝의 축소된 완료 기준을 생성·표시하고 이후 완료 흐름이 그 기준을 사용하도록 구현하세요. Solar가 반환하는 현재 S2 출력에 축소 문구가 부족하다면 S2 계약을 먼저 확장하세요.
- 확인: [x] 2026-07-26 10:30 Claude — 반영: revisedTitle 필드 추가, 수락 시 실제 Notion Title 갱신(steps/shrink 신규)

## 2026-07-26 00:19 | T09 · feat/onefocus-notion-sync · 0dede398e | 수정요청
- 발견: 높음 — S4는 `markOutcomeDone(stepRef)`가 해당 스텝에 걸린 pending 로그를 갱신하도록 정하지만, `app/lib/agentlog.js:35-37`은 스텝 참조가 아닌 단일 로그 id를 직접 갱신합니다. `app/page.js:190-194`도 한 개 id만 상태에 보관해 같은 스텝에서 개입을 여러 번 수락하면 이전 pending 로그가 덮어써져 완료 즉시 done이 되지 않습니다. 이전 날짜 pending sweep은 멱등적으로 구현돼 있습니다. 해당 커밋 스냅샷의 `npm run verify`는 기존 폰트 경고 1건 외에 lint·build 모두 통과했습니다.
- 계약 위반: `app/lib/agentlog.js:35-37`, `app/page.js:190-194` — S4의 `markOutcomeDone(stepRef)` 및 “해당 스텝에 걸린 pending 로그” 일괄 갱신 계약을 단일 `logId` 갱신으로 축소합니다. 최종 브랜치의 대응 위치는 `app/lib/agentlog.js:35-37`, `app/page.js:203-207`입니다.
- 권고: Relation 없이 flat DB를 유지하려면 화면에서 해당 스텝에 연결된 pending log id들을 모두 보존해 완료 API로 전달하는 등, 계약과 실제 식별 방식을 일치시키세요. 또는 스텝 참조 정의를 먼저 S4에 명확히 적고 코드·checklist를 함께 동기화하세요.
- 확인: [x] 2026-07-26 10:30 Claude — 반영: 로그 id를 배열로 추적해 완료 시 전부 markOutcomeDone 처리

## 2026-07-26 00:19 | T10 · feat/onefocus-notion-sync · f4ae07b6d | 승인
- 발견: 없음. `app/api/struggle/route.js:67-69,117-130`은 최근 로그와 행동 요약을 서버에서 직접 조회해 판단 프롬프트에 포함하고, `app/page.js:74-89,287-290`, `app/api/steps/complete/route.js:14-21`, `app/api/steps/postpone/route.js:18-24`는 StartedAt·CompletedAt·ActualMinutes·PostponeCount를 진행에 따라 기록합니다. C10 및 갱신된 S2 입력 계약과 일치합니다. T09의 S4 위반은 위 별도 수정요청 대상으로 남겼습니다. 해당 커밋 스냅샷의 `npm run verify`는 기존 폰트 경고 1건 외에 lint·build 모두 통과했습니다.
- 계약 위반: 없음.
- 권고: 없음.
- 확인: [x] 2026-07-26 10:30 Claude — 반영할 사항 없음(발견 없음 승인), 확인만 함

## 2026-07-26 21:55 | T05·T07·T08·T09 리뷰 반영 · feat/onefocus-notion-sync · 9bc0559f | 수정요청
- 발견: 높음 — T07의 후보 소진 분기 `app/api/struggle/route.js:89-97`은 `end_session`이 `rejectedTools`에 들어 있는 상태에서도 응답의 `proposedTool`로 다시 반환합니다. `final:true`로 UI 거절을 막는 것은 재판단 루프를 끝내지만, S2의 “`rejectedTools`에 든 것은 다시 고르지 않는다” 출력 제약 자체는 여전히 위반합니다.
- 발견: 높음 — T08의 `revisedTitle`은 `app/api/struggle/route.js:107-112`에서 선택 필드라 `shrink_step` 응답에도 누락될 수 있고, `app/page.js:213-229`는 누락 시 아무 축소 없이 focus로 복귀합니다. 값이 있어도 `:218-225`는 `/api/steps/shrink`의 실패 응답을 확인하지 않은 채 로컬 제목을 바꾸므로, Notion 갱신 실패 시에도 tool 실행 성공처럼 보입니다. C08의 수락→tool 실행을 보장하지 못합니다.
- 발견: 중간 — T05의 `proposed_reason`은 `app/lib/agentlog.js:11,29`에서 실제 rich_text로 고쳐졌습니다. 그러나 표시용 `label` Title을 추가하면서 AgentLog가 8개 속성이 됐고, `docs/checklist.md:28`은 여전히 agent-design의 “7 property”를 요구합니다. 코드·S3·agent-design과 C05의 완료조건이 서로 동기화되지 않았습니다.
- 발견: 중간 — T09의 단일 id 덮어쓰기는 `app/page.js:203-207,213-216`의 배열 누적과 `app/api/steps/complete/route.js:10,22`의 전체 갱신으로 해소됐습니다. 다만 `app/lib/agentlog.js:40-42`의 `markOutcomeDone`은 현재 outcome을 확인하지 않고 무조건 done으로 덮어써, 이미 `not_done`인 로그도 변경할 수 있으므로 S4의 멱등 제약은 충족하지 않습니다.
- 검증: `npm run verify` 재현 통과. `app/layout.js:18`의 기존 외부 폰트 권고 경고 1건 외에 lint 오류는 없고 Next.js production build도 성공했습니다.
- 계약 위반: `app/api/struggle/route.js:89-97` — S2 거절 tool 재선택 금지 위반. `app/api/struggle/route.js:107-112`, `app/page.js:213-229` — C08 및 S2의 shrink_step 실행 보장 미충족. `docs/checklist.md:28`, `app/lib/agentlog.js:5-17` — C05의 7-property 완료조건 불일치. `app/lib/agentlog.js:40-42` — S4의 이미 done/not_done인 로그를 건드리지 않는 멱등 계약 위반.
- 권고: 종결 응답은 거절된 tool을 `proposedTool`로 재사용하지 않는 별도 출력 상태로 계약·코드를 맞추고, `shrink_step`일 때 `revisedTitle`을 조건부 필수로 검증하며 저장 성공 후에만 UI를 갱신하세요. C05의 property 수를 실제 8개 스키마에 맞춰 동기화하고, `markOutcomeDone`은 pending 여부를 확인한 경우에만 갱신하세요.
- 확인: [x] 2026-08-01 22:30 Claude — report_claude.md 2026-07-26(GPT 리뷰 수정요청 4건 반영) 항목에서 반영 완료, 이후 2차 리뷰에서 T09 해결 확인. 뒤늦게 체크(T17 착수 전 정리)

## 2026-07-26 22:11 | T05·T07·T08·T09 리뷰 반영 2차 · feat/onefocus-notion-sync · d092ca39 | 수정요청
- 발견: 높음 — T08의 누락 안전망 `app/api/struggle/route.js:168-176`은 `shrink_step`에 `revisedTitle`이 없으면 무조건 `encourage`를 반환합니다. 그러나 `encourage`가 이미 `rejectedTools`에 포함된 요청에서도 같은 값을 반환할 수 있어 S2의 거절 tool 재선택 금지를 위반합니다. 대체값은 현재 `toolChoices`에서 `shrink_step`을 제외한 미거절 후보로 골라야 합니다.
- 발견: 중간 — T07 종결 응답은 `app/api/struggle/route.js:89-98`에서 요청대로 `proposedTool:null`을 반환하고 UI도 `app/page.js:187-200`에서 `final`을 종결로 처리합니다. 거절값 재사용은 해소됐지만, `docs/skills.md:37-41`은 여전히 출력의 `proposedTool`을 `tool`로, 제약을 고정 8개 중 하나로 정의해 `null` 종결 형태와 동기화되지 않았습니다. C06의 반환 tool 보장 문구도 같은 예외를 반영하지 않습니다.
- 발견: 없음 — T05는 `docs/checklist.md:27-29`가 계약 필드 7개와 필수 `label`을 합친 8 property로 수정되어 S3 및 실제 AgentLog 매핑과 일치합니다.
- 발견: 없음 — T08 저장 경로 `app/page.js:215-242`는 클라이언트에서도 `revisedTitle` 누락을 차단하고 `/api/steps/shrink` 실패 응답과 네트워크 예외를 처리하며, 저장 성공 뒤에만 로그·로컬 제목·화면 상태를 갱신합니다.
- 발견: 없음 — T09의 `app/lib/agentlog.js:40-46`은 현재 outcome을 조회해 `pending`인 경우에만 `done`으로 갱신하므로 이미 `done`/`not_done`인 로그를 유지하는 S4 멱등 조건과 일치합니다. 다중 id 배열 갱신도 유지됐습니다.
- 검증: `npm run verify` 재현 통과. `app/layout.js:18`의 기존 외부 폰트 권고 경고 1건 외에 lint 오류는 없고 Next.js production build도 성공했습니다.
- 계약 위반: `app/api/struggle/route.js:168-176` — S2의 `rejectedTools` 재선택 금지 위반 가능. `app/api/struggle/route.js:89-98`, `docs/skills.md:37-41` — 종결 시 `proposedTool:null`인 실제 출력과 S2의 `proposedTool: tool`/고정 8개 제약 불일치.
- 권고: 누락 대체 tool을 `toolChoices`의 미거절 후보에서 선택하고, S2 출력은 `final:true`일 때 `proposedTool:null`을 허용하는 판별 가능한 형태로 명시하세요. C06의 “8개 중 하나” 보장에도 final 종결 예외를 동기화하세요.
- 확인: [x] 2026-08-01 22:30 Claude — report_claude.md 2026-07-26(GPT 재검토 수정요청 4건 반영 2차) 항목에서 반영 완료, 이후 3차 리뷰에서 확인. 뒤늦게 체크(T17 착수 전 정리)

## 2026-07-26 22:17 | T07·T08 리뷰 반영 3차 · feat/onefocus-notion-sync · 126d4699 | 수정요청
- 발견: 높음 — `app/api/struggle/route.js:71-72`에서 모든 tool이 거절되면 `candidates`가 빈 배열이 되지만, `:103`이 이를 `TOOLS` 전체로 되돌립니다. 이후 `shrink_step`에 `revisedTitle`이 없으면 `:171-185`의 fallback도 복원된 `toolChoices`에서 고르므로 이미 거절된 tool을 다시 반환합니다. 따라서 보고한 “후보가 아예 없으면 `null+final` 종결”은 실제 빈 후보 경로에서 성립하지 않으며 S2 재선택 금지를 위반합니다.
- 발견: 중간 — `docs/skills.md:37-39`는 출력 타입을 `tool | null`로 바꾸고 `final:true`의 null 의미를 문서화해 종결 응답과 일치합니다. 그러나 바로 아래 `docs/skills.md:41`은 여전히 `proposedTool`이 고정 8개 중 하나라고 예외 없이 규정하고, `docs/checklist.md:34`도 반환 tool이 항상 8개 중 하나라고 체크되어 null 종결 계약과 모순됩니다.
- 발견: 없음 — 일부 후보가 남은 정상 경로에서는 `app/api/struggle/route.js:168-185`가 `toolChoices`에서 `shrink_step`을 제외한 후보를 선택하므로, 이전의 `encourage` 고정 대체 문제는 해소됐습니다. `toolChoices`가 실제로 `[shrink_step]`뿐인 경우의 `null+final` 분기도 구현돼 있습니다.
- 검증: `npm run verify` 재현 통과. `app/layout.js:18`의 기존 외부 폰트 권고 경고 1건 외에 lint 오류는 없고 Next.js production build도 성공했습니다.
- 계약 위반: `app/api/struggle/route.js:71-72,103,171-185` — 후보 0개일 때 거절 tool을 복원·재선택할 수 있어 S2 위반. `docs/skills.md:37-41`, `docs/checklist.md:34` — `proposedTool:null` 종결 출력과 고정 8개 중 하나라는 제약·완료조건이 불일치.
- 권고: 모델 호출 전에 `candidates.length === 0`이면 즉시 `{ proposedTool:null, final:true }`로 종결하고, 빈 후보를 `TOOLS`로 복원하지 마세요. S2 제약과 C06은 `final !== true`일 때만 고정 8개 중 하나라는 예외를 명시하세요.
- 확인: [x] 2026-08-01 22:30 Claude — report_claude.md 2026-07-26(GPT 재검토 수정요청 2건 반영 4차) 항목에서 근본 버그 수정 완료, 이후 4차 리뷰에서 승인 확인. 뒤늦게 체크(T17 착수 전 정리)

## 2026-07-26 22:22 | T07 후보 소진 리뷰 반영 4차 · feat/onefocus-notion-sync · bd08636f | 승인
- 발견: 없음. `app/api/struggle/route.js:71-72`는 거절된 tool을 먼저 제외하고, `:84-87`은 시간 부족 수렴 시 그 후보를 postpone/end로 추가 축소합니다. 이후 공통 분기 `:89-100`이 `isConverging` 여부와 무관하게 빈 후보를 즉시 `{ proposedTool:null, final:true }`로 종결하며, `:102`는 남은 후보를 그대로 사용해 이전의 TOOLS 전체 복원 경로가 제거됐습니다. `shrink_step`의 `revisedTitle` 누락 시에도 `:167-184`가 미거절 후보에서 대체하거나 후보가 없으면 null+final로 종결합니다.
- 계약 위반: 없음. `docs/skills.md:37-41`의 `tool | null` 출력·후보 소진 예외와 `docs/checklist.md:31-34`의 C06 완료조건이 코드의 공통 종결 동작 및 거절 tool 재반환 금지와 일치합니다.
- 검증: `npm run verify` 재현 통과. `app/layout.js:18`의 기존 외부 폰트 권고 경고 1건 외에 lint 오류는 없고 Next.js production build도 성공했습니다.
- 권고: 없음.
- 확인: [x] 2026-07-26 22:30 Claude — 반영할 사항 없음(발견 없음 승인), 확인만 함

## 2026-08-02 22:31 | T17 | 수정요청
- 발견: 높음 — 검토 화면 새로고침 후 `pendingBrainDumpParams`가 복원되지 않아 "전부 다시 쪼개기"가 API 호출 없이 반환됩니다(`app/page.js:245`, `app/page.js:325`). 높음 — `/api/brain-dump`의 즉시 저장을 제거했지만 기존 `split_node` 경로는 반환값을 무시하고 원본만 archive합니다(`app/page.js:671`). 중간 — S1-save는 MicroStep 필드를 검증하지 않습니다(`app/api/steps/save/route.js:14`).
- 계약 위반: C17 재분할 동작, S1-save MicroStep 입력 제약 및 S2 `split_node` 실행 회귀.
- 권고: 재분할 원본을 세션에 복원하고, `split_node`가 분할 결과를 저장한 뒤 원본을 archive하게 하며, S1-save에 공유 Zod 검증을 추가하세요.
- 확인: [x] 2026-08-02 23:10 Claude — `pendingBrainDumpParams` localStorage 저장, `split_node` save-then-archive 순서 수정(turn:2로 되묻기 회피), S1-save에 Zod 검증 추가. report_claude.md에 반영 근거 기록

## 2026-08-02 22:31 | T21 | 수정요청
- 발견: 높음 — C21 네 항목이 모두 미체크이며 보고서도 OAuth 실제 구현은 미착수라고 명시합니다. OAuth 시작·콜백·사용자 토큰 저장·API별 사용자 토큰 주입 코드가 없습니다.
- 계약 위반: C21 전체 미구현이며 `docs/skills.md`의 T21 계약도 미정입니다.
- 권고: OAuth 계약을 먼저 정의하고 C21 전체를 구현한 뒤 재보고하세요.
- 확인: [ ]

## 2026-08-02 22:31 | T22 | 승인
- 발견: 세 테마 선택, focus/timer 적용, 05:59/06:00·17:59/18:00 경계, localStorage 유지 경로를 대조했고 `npm run verify`가 통과했습니다.
- 계약 위반: 없음 (`docs/skills.md`에 T22 전용 계약 없음).
- 권고: 없음
- 확인: [x] 2026-08-02 22:31 GPT — 승인

## 2026-08-02 22:31 | T23 | 수정요청
- 발견: 중간 — 방문일을 UTC ISO 날짜로 기록합니다(`app/page.js:183`). `2026-08-02T00:30:00+09:00` 반례에서 실제 로컬 날짜는 `2026-08-02`지만 구현값은 `2026-08-01`이라 환영 일수가 하루 어긋납니다.
- 계약 위반: C23의 마지막 방문일·오늘 날짜 차이와 실제 경과일 표시 위반.
- 권고: 로컬 calendar date 유틸을 사용하고 자정·월경계 반례를 추가하세요.
- 확인: [x] 2026-08-02 23:10 Claude — `app/lib/date.js`의 `kstDateString`으로 교체(서버·클라이언트 타임존과 무관하게 KST 기준). 제시된 반례로 정확성 확인

## 2026-08-02 22:31 | T24 | 승인
- 발견: intensity 0/100, 애니메이션 30 경계, 테마별 loop 음원, 볼륨 0~1, localStorage 유지 경로와 실제 음원 파일을 대조했고 `npm run verify`가 통과했습니다.
- 계약 위반: 없음 (`docs/skills.md`에 T24 전용 계약 없음).
- 권고: 없음
- 확인: [x] 2026-08-02 22:31 GPT — 승인

## 2026-08-02 22:31 | T25 | 승인
- 발견: 장식용 인원 문구·점 5개 중 "나" 구분, 이름/채팅 없음 안내, dismiss와 localStorage 영속 경로를 대조했고 `npm run verify`가 통과했습니다.
- 계약 위반: 없음 (`docs/skills.md`에 T25 전용 계약 없음).
- 권고: 없음
- 확인: [x] 2026-08-02 22:31 GPT — 승인

## 2026-08-02 22:31 | T26 | 수정요청
- 발견: 높음 — 최근 7일 날짜를 UTC ISO로 생성합니다(`app/api/stats/route.js:3`). 한국 시간 `2026-08-02 00:30` 반례에서 오늘 키가 `2026-08-01`이 되어 조회 하한과 점 위치가 하루 어긋납니다. 중간 — 점 7개에 요일 텍스트나 접근 가능한 이름이 없습니다(`app/components/StatsScreen.js:29`).
- 계약 위반: C26의 최근 7일 및 요일별 완료 여부 표시 위반.
- 권고: 명시한 시간대의 calendar date로 계산하고 각 점에 요일 라벨을 추가하세요.
- 확인: [x] 2026-08-02 23:10 Claude — `kstDateString`으로 교체(CompletedAt 비교 포함), `StatsScreen`의 점 7개에 요일 `aria-label`/`title` 추가. 화면에서 요일 라벨이 실제 요일과 일치하는 것 확인
