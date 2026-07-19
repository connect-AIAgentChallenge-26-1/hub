# NoticePilot Story Appendix v3.5

> Documentation baseline: current default branch after Foundation.25.1 restoration
> Page role: visual companion to the manual-analysis runtime and local reference-feed slice
> Scope caution: production ingestion, account-owned feeds, deployment, and real-client validation remain unfinished.

이 페이지는 NoticePilot의 현재 MVP 흐름과 향후 범위를 시각적으로 설명하기 위한 story appendix다.

이 페이지의 표현이 Architecture Overview, Implementation Plan, 실제 코드 또는 테스트와 충돌하면 해당 근거를 우선한다.

## 상태 범례

```text
Runtime active
- 현재 앱에서 기본 또는 명시적 local reference mode로 도달할 수 있는 기능

Implemented, isolated
- 코드와 테스트는 존재하지만 production root runtime에 배포·운영되지 않는 경로

Pending
- 아직 구현 또는 실제 운영 환경에서 검증되지 않은 production 기능
```

현재 대표 상태:

```text
Runtime active
- manual text / TXT / MD, client mock / Express server mock
- review, editing, evidence, Markdown, selected one-off all-day ICS
- opt-in loopback bridge와 capability URL을 통한 고정 601-event reference feed

Implemented, isolated
- strict root-domain schema와 adapter
- 정확히 복원된 Foundation.25.1 crawler, registry, persistence, projection, delivery package

Pending
- live AI와 scheduled production ingestion
- account-owned durable subscription management와 deployment
- production 경로의 real-client refresh/update/cancellation validation
```

## 기존 v3.5 이미지 해석

색상과 선 스타일은 다음 의미로 읽는다.

```text
- Solid blue/green: implemented current MVP behavior
- Dashed gray: future/planned only
- Orange: current warning, guard, or scope note
```

아래 이미지는 초기 current-MVP/future-only 구분을 위해 제작됐다. 이미지 색상만으로 `Implemented, isolated` 상태를 판정해서는 안 된다. 이미지에는 최신 캘린더 탭, 캠퍼스 설정, Foundation reference feed가 반영되지 않았으므로 위 상태 범례와 상위 문서의 텍스트를 우선한다.

---

## 00. Overview Map

NoticePilot의 핵심 흐름은 긴 공지를 구조화된 분석 결과로 바꾸고, 사용자가 검토/수정한 뒤 체크리스트와 캘린더 후보로 export하는 것이다.

현재 workspace는 `공지 캘린더`와 `단건 공지 분석` 탭으로 나뉜다. 공지 캘린더 탭은 관심 캠퍼스 설정과 로컬 reference 구독형 ICS 생성·복사 상태를 보여준다. 이 구독 경계는 환경변수로 명시적으로 활성화할 때만 복원된 Foundation.25.1의 고정 all-campus reference feed를 사용하며, 캠퍼스 설정은 현재 분석·내보내기·reference feed 결과를 바꾸지 않는 inert metadata로만 저장된다.

![NoticePilot overview map](../assets/wiki/noticepilot-story-appendix-v3-5/noticepilot_story_00_overview_v3_5.png)

---

## 01. Input & Pre-analysis Guards

현재 MVP는 수동 텍스트 붙여넣기와 TXT/MD 파일 업로드를 지원한다. 분석 전에는 추출 텍스트 확인, 덮어쓰기 확인, privacy-like pattern warning 같은 사용자 확인 단계를 둔다.

![Input and pre-analysis guards](../assets/wiki/noticepilot-story-appendix-v3-5/noticepilot_story_01_input_guards_v3_5.png)

---

## 02-A. Analyze Execution

분석 실행은 client-side mock 분석과 Express server mock 분석으로 나뉜다. 실제 AI API 호출은 아직 구현하지 않았고, `mode: "ai"`는 명시적으로 blocked 상태를 반환한다.

![Analyze execution](../assets/wiki/noticepilot-story-appendix-v3-5/noticepilot_story_02A_analyze_execution_v3_5.png)

---

## 02-B. Dashboard Review & Editing

분석 결과는 사용자가 직접 검토하고 수정할 수 있는 dashboard로 표시된다. 항목 수정/삭제, 할 일 완료 체크, calendar event 선택 토글, evidence 확인은 현재 MVP 범위다.

![Dashboard review and editing](../assets/wiki/noticepilot-story-appendix-v3-5/noticepilot_story_02B_dashboard_review_editing_v3_5.png)

---

## 03. Evidence & Export

현재 export/delivery 범위는 Markdown checklist, 선택한 all-day `.ics` 다운로드, 그리고 명시적으로 활성화한 local reference mode의 고정 601-event 구독형 ICS다. 여러 공지의 batch `.ics`, 사용자별 production feed, Google Calendar API 연동은 future scope다.

![Evidence and export](../assets/wiki/noticepilot-story-appendix-v3-5/noticepilot_story_03_evidence_export_v3_5.png)

---

## A1. Current MVP Responsibilities

현재 MVP 책임 범위는 React client, Express mock analyze API, Zod schema validation, validation/normalization, localStorage persistence, campus preference metadata, Markdown export, selected all-day `.ics` export, opt-in local Foundation reference bridge에 집중한다.

![Current MVP responsibilities](../assets/wiki/noticepilot-story-appendix-v3-5/noticepilot_appendix_A1_current_mvp_responsibilities_v3_5.png)

---

## A2. Future Scope Roadmap — Current Interpretation

향후 범위에는 real AI API integration, server-side file extraction, advanced date resolution, school-level parsing, batch calendar export, scheduled production ingestion, account-owned feed persistence와 deployment, real-client subscription validation이 포함된다. local reference feed의 존재는 이 production 범위의 완료를 의미하지 않는다.

![Future scope roadmap](../assets/wiki/noticepilot-story-appendix-v3-5/noticepilot_appendix_A2_future_scope_roadmap_v3_5.png)
