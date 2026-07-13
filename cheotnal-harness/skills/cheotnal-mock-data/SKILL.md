---
name: cheotnal-mock-data
description: '"첫날" 앱(신입 알바 온보딩 AI 매니저)에서 가짜데이터(mock)를 만들거나 다루는 모든 작업에 반드시 사용하는 데이터 스키마 규칙. 지침서·채팅 메시지·질문·불만·로드맵·시각 가이드 데이터의 필드명, 타입, 상태값, 파일 위치를 고정한다. 새 화면에 데이터를 채우거나, mock 파일을 만들거나, 컴포넌트에서 데이터를 import하거나, Express 서버가 내려줄 데이터를 정의할 때 항상 이 스킬을 먼저 확인한다. "첫날", "온보딩 앱", "알바 매니저 앱" 프로젝트에서 데이터가 등장하면 무조건 이 스키마를 그대로 쓴다.'
---

# 첫날 가짜데이터(Mock) 스킬

**목적**: 어느 화면·어느 세션에서 만들어도 데이터 모양이 100% 같게 한다. 나중에 `import mock파일` → `fetch('/api/...')`로 바꾸는 것만으로 실 API 전환이 되도록, 필드명·타입·상태값을 여기서 고정한다.

## 0. 공통 규칙 (모든 엔티티에 적용)

- **id**: 문자열, `엔티티약어-숫자3자리`. 예: `"gd-001"`, `"msg-014"`. 숫자 auto-increment 금지(실 DB 전환 시 충돌).
- **날짜**: ISO 8601 문자열. 예: `"2026-07-13T09:30:00+09:00"`. `Date` 객체나 타임스탬프 숫자 금지.
- **상태값(enum)**: 아래 정의된 문자열만 사용. 새 상태가 필요하면 이 스킬을 먼저 수정한다.
- **파일 위치**: 프론트는 `client/src/data/`, 서버는 `server/data/`. 두 곳의 데이터는 **동일한 스키마**를 쓴다.
- **컴포넌트 안 하드코딩 금지**: 데이터는 반드시 data 파일에서 import.
- 각 파일은 named export 배열 하나만 내보낸다. 예: `export const mockGuides = [...]`

## 1. 엔티티별 스키마 (이 필드명을 그대로 쓴다)

### Guide — 지침서 항목 (`mockGuides.js`)

```js
{
  id: "gd-001",
  category: "마감",              // "마감" | "결제" | "위치" | "긴급" | "손님응대" | "기타"
  title: "포스기 환불 절차",
  steps: ["설정 → 결제취소", "주문 선택", "카드 재삽입", "승인 확인"],
  status: "confirmed",           // "confirmed"(확정) | "pending"(사장 확인 대기) — pending이면 카드를 accent-soft 톤으로
  visualGuideId: "vg-001",       // 연결된 시각 가이드. 없으면 null
  updatedAt: "2026-07-10T14:00:00+09:00"
}
```

### Message — 채팅 말풍선 (`mockMessages.js`)

```js
{
  id: "msg-001",
  thread: "staff",               // "staff"(알바생, 그린 톤) | "owner"(사장, 보라 톤)
  role: "ai",                    // "ai" | "user"
  text: "환불은 4단계면 끝나요. 침착하게 따라와요 🙂",
  actions: [                     // 말풍선 안에 박히는 행동 버튼(ChatGPT 패턴). 없으면 빈 배열 []
    { label: "📱 화면 따라하기 가이드", type: "visual_guide", targetId: "vg-001" }
    // type: "visual_guide" | "open_guide" | "ask_owner"
  ],
  createdAt: "2026-07-13T09:31:00+09:00"
}
```

### Question — 알바 질문 로그 (`mockQuestions.js`)

```js
{
  id: "qs-001",
  text: "여분 컵 어디 있어요?",
  status: "answered",            // "answered"(지침으로 답변됨) | "pending_owner"(사장 확인 대기) | "gap"(교육 공백으로 집계)
  guideId: "gd-002",             // 답변에 쓰인 지침. 없으면 null
  askedCount: 3,                 // 같은 질문이 반복된 횟수 (사장 리포트용)
  createdAt: "2026-07-12T18:20:00+09:00"
}
```

### Complaint — 익명 불만 집계 (`mockComplaints.js`)

```js
{
  id: "cp-001",
  topic: "마감 시간이 자주 늦어져요",
  count: 4,                      // 익명 집계 건수
  lastReportedAt: "2026-07-11T22:00:00+09:00"
}
```

> **보안 규칙**: Complaint에는 작성자를 식별할 수 있는 필드(이름, userId, 기기정보, 개별 작성시각 목록)를 **절대 넣지 않는다**. 집계값만 존재한다. 기획서의 익명 보장·개인정보 우려와 직결되는 규칙이다.

### RoadmapStep — 첫 30일 로드맵 (`mockRoadmap.js`)

```js
{
  id: "rm-001",
  day: 1,                        // 근무 일차 (1~30)
  title: "포스기 기본 주문 받기",
  done: false,
  guideId: "gd-003"              // 관련 지침. 없으면 null
}
```

### VisualGuide — 시각 가이드 (`mockVisualGuides.js`)

```js
{
  id: "vg-001",
  title: "포스기 환불하기",
  steps: [
    {
      image: "/images/pos-step1.png",
      marker: { x: 62, y: 78, w: 22, h: 10 },  // 빨간 테두리 위치, 이미지 기준 % 단위
      arrow: "down",             // "up" | "down" | "left" | "right"
      cta: "우측 하단 [설정] 클릭"  // 5단어 이하 (디자인 스킬 3-4 원칙)
    }
  ]
}
```

- 스텝 하나에 marker는 **하나만** (1장 1클릭 원칙).
- marker 좌표는 px가 아니라 **% 단위** — 화면 크기가 달라도 위치가 유지되게.

## 2. 관계 규칙

- `Message.actions[].targetId` → VisualGuide.id 또는 Guide.id
- `Question.guideId` → Guide.id, `Guide.visualGuideId` → VisualGuide.id
- 참조 대상이 mock 안에 실제로 존재해야 한다. 없는 id를 가리키는 데이터를 만들지 않는다.

## 3. 실 API 전환 대비 패턴

컴포넌트에서 데이터를 쓸 때는 아래 형태를 유지한다. 전환 시 import 한 줄만 fetch로 바뀐다.

```js
// 지금 (mock)
import { mockGuides } from "../data/mockGuides";
const guides = mockGuides;

// 나중 (실 API) — 스키마가 같으므로 이 줄만 교체
const guides = await fetch("/api/guides").then(r => r.json()).then(d => d.data);
```

## 4. 체크리스트 (mock 데이터 만들 때 확인)

1. 필드명이 이 문서의 스키마와 글자 하나까지 같은가?
2. id·날짜·enum이 공통 규칙(0번) 형식인가?
3. Complaint에 작성자 식별 정보가 없는가?
4. 참조 id(guideId 등)가 실제 존재하는 데이터를 가리키는가?
5. 데이터가 컴포넌트가 아니라 `data/` 파일에 있는가?
