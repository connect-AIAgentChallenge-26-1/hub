---
name: cheotnal-api-contract
description: '"첫날" 앱(신입 알바 온보딩 AI 매니저)의 Express 백엔드 API를 만들거나 수정할 때, 그리고 프론트엔드에서 API를 호출하는 코드를 쓸 때 반드시 사용하는 API 계약 규칙. 엔드포인트 경로, 요청/응답 JSON 형식, 에러 형식, 상태 코드를 고정한다. server/ 폴더에 라우트를 추가하거나, fetch 코드를 작성하거나, "API", "서버", "라우트", "엔드포인트"가 언급되는 첫날 프로젝트 작업이라면 항상 이 스킬을 먼저 확인한다.'
---

# 첫날 API 계약(Contract) 스킬

**목적**: 프론트와 백엔드가 서로 다른 응답 모양을 가정하는 사고를 막는다. 데이터의 필드 자체는 **cheotnal-mock-data 스킬의 스키마를 그대로** 쓰고, 이 스킬은 그것을 감싸는 봉투(응답 형식)와 경로를 정한다.

## 0. 공통 규칙

- 모든 경로는 `/api/`로 시작한다.
- **성공 응답 봉투** (항상 이 형태):

```json
{ "data": <스키마 객체 또는 배열> }
```

- **에러 응답 봉투** (항상 이 형태):

```json
{ "error": { "code": "NOT_FOUND", "message": "지침을 찾을 수 없어요" } }
```

- `error.code`는 아래 값만 사용: `"NOT_FOUND"`(404) | `"BAD_REQUEST"`(400) | `"SERVER_ERROR"`(500)
- `error.message`는 한국어, 사용자에게 그대로 보여도 되는 문장으로 (어투는 디자인 스킬 4번을 따라 다그치지 않게).
- 상태 코드: 조회 성공 200, 생성 성공 201, 이후는 error.code와 짝.
- 라우트 파일은 `server/routes/` 아래 리소스별 한 파일: `guides.js`, `messages.js`, `questions.js`, `complaints.js`, `roadmap.js`.
- 이번 단계에서 서버는 `server/data/`의 mock을 읽어 내려주기만 한다. DB·LLM 호출 코드를 넣지 않는다 (CLAUDE.md 4번).

## 1. 엔드포인트 정의

### 지침서

| 메서드·경로 | 동작 | 응답 data |
|---|---|---|
| `GET /api/guides` | 전체 목록. `?category=마감` 필터 지원 | Guide 배열 |
| `GET /api/guides/:id` | 단건. 없으면 404 NOT_FOUND | Guide 객체 |

### 채팅 메시지

| 메서드·경로 | 동작 | 응답 data |
|---|---|---|
| `GET /api/messages?thread=staff` | thread별 메시지 목록. thread는 `staff`\|`owner`만 허용, 그 외 400 | Message 배열 (createdAt 오름차순) |
| `POST /api/messages` | 메시지 추가 | 생성된 Message 객체, 201 |

`POST /api/messages` 요청 본문 (이 필드만 받는다):

```json
{ "thread": "staff", "role": "user", "text": "환불 어떻게 해요?" }
```

- 서버가 id, createdAt, `actions: []`를 채워서 반환한다.
- `text`가 비었거나 500자 초과면 400 BAD_REQUEST.
- 이번 단계에선 AI 응답을 만들지 않는다. 필요하면 서버가 고정된 mock AI 답변 1개를 뒤이어 추가하는 것까지만.

### 질문 로그 / 불만 / 로드맵

| 메서드·경로 | 동작 | 응답 data |
|---|---|---|
| `GET /api/questions` | 질문 목록. `?status=gap` 필터 지원 | Question 배열 |
| `POST /api/questions` | 질문 기록. 본문 `{ "text": "..." }`, 서버가 `status: "pending_owner"` 기본값으로 생성 | 생성된 Question, 201 |
| `GET /api/complaints/summary` | 익명 집계만 반환 | Complaint 배열 |
| `GET /api/roadmap` | 30일 로드맵 | RoadmapStep 배열 (day 오름차순) |

### 시각 가이드

| 메서드·경로 | 동작 | 응답 data |
|---|---|---|
| `GET /api/visual-guides/:id` | 단건. 없으면 404 | VisualGuide 객체 |

## 2. 라우트 코드 형태 (이 골격을 그대로 쓴다)

```js
// server/routes/guides.js
const express = require("express");
const router = express.Router();
const { mockGuides } = require("../data/mockGuides");

router.get("/", (req, res) => {
  const { category } = req.query;
  const list = category
    ? mockGuides.filter((g) => g.category === category)
    : mockGuides;
  res.json({ data: list });
});

router.get("/:id", (req, res) => {
  const guide = mockGuides.find((g) => g.id === req.params.id);
  if (!guide) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "지침을 찾을 수 없어요" },
    });
  }
  res.json({ data: guide });
});

module.exports = router;
```

```js
// server/index.js 에서의 연결 형태
app.use("/api/guides", require("./routes/guides"));
```

## 3. 보안 기본값 (mock 단계부터 지킨다)

- POST 본문은 **정의된 필드만 꺼내 쓴다** (`req.body` 통째로 저장 금지).
- 문자열 입력은 길이 제한을 둔다 (text 500자 등, 위 표 기준).
- `/api/complaints/summary`는 집계값만 내려준다 — 개별 불만 원문·작성자 정보를 내려주는 엔드포인트를 만들지 않는다.
- 에러 응답에 스택 트레이스·파일 경로를 절대 담지 않는다.
- API 키·비밀값은 클라이언트 코드와 응답에 등장하지 않는다 (다음 단계 LLM 연동 시에도 서버 환경변수로만).

## 4. 체크리스트 (라우트 만들 때 확인)

1. 응답이 `{ data }` / `{ error: { code, message } }` 봉투를 쓰는가?
2. data 안의 필드가 cheotnal-mock-data 스킬 스키마와 정확히 같은가?
3. 에러 message가 한국어이고 다그치지 않는 어투인가?
4. POST에서 정의된 필드만 받고 길이 검증을 하는가?
5. DB·LLM 연동 코드가 섞여 들어가지 않았는가?
