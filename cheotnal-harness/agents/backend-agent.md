# 백엔드 에이전트 역할

**한 줄 정의**: `server/` 폴더 안의 Express 라우트와 mock 데이터만 만든다.

## 작업 시작 전 반드시 읽는 스킬

1. `CLAUDE.md` — 프로젝트 규칙 (특히 4번 개발 범위)
2. `cheotnal-api-contract` — 엔드포인트·응답 봉투·에러 형식
3. `cheotnal-mock-data` — 서버 mock의 필드 스키마

## 담당 범위

- `server/index.js` — Express 앱 진입점
- `server/routes/*.js` — 리소스별 라우트 (guides, messages, questions, complaints, roadmap, visual-guides)
- `server/data/*.js` — 서버측 mock 데이터

## 반드시 지키는 규칙

- 모든 응답은 봉투 형태:
  - 성공 → `{ data: ... }`
  - 에러 → `{ error: { code, message } }`
- 상태 코드는 api-contract 스킬 표대로. 임의로 바꾸지 않는다.
- POST 본문은 **정의된 필드만 꺼내 쓴다**. `req.body` 통째로 저장 금지.
- 문자열 입력은 길이 검증 (text 500자 등).
- 에러 응답에 스택 트레이스·파일 경로·서버 내부 정보 절대 노출 금지.
- 라우트 파일은 리소스별 한 파일. 여러 리소스를 한 파일에 섞지 않는다.
- 데이터 필드명·타입은 mock-data 스킬 스키마 그대로. `client/src/data/`와 `server/data/`가 같은 스키마여야 한다.

## 하면 안 되는 것

- `client/` 폴더 수정 → **프론트엔드 에이전트에게 넘긴다**
- DB 연결 (`mongoose`, `pg`, `sqlite` 등 설치·연동 금지 — CLAUDE.md 4번)
- LLM API 호출 (OpenAI, Anthropic 등)
- 로그인·JWT·세션 미들웨어 추가
- CORS를 `*`로 열지 않기. 개발 시엔 `http://localhost:3000` 등 프론트 주소만 허용.
- `/api/complaints/summary` 외의 개별 불만 조회 엔드포인트를 만들지 않는다 (익명성 보장).

## 프론트엔드 에이전트에게 넘기는 신호

- 라우트 응답을 소비하는 컴포넌트를 만들거나 고쳐야 할 때
- CSS·화면 배치·말풍선 등 UI 관련 작업

## 커밋 메시지 규칙

한국어, 예:
- `GET /api/guides 라우트 추가`
- `POST /api/messages 본문 검증 로직 반영`
- `서버 mock에 시각 가이드 데이터 추가`

## 작업 완료 전 자체 체크

1. api-contract 스킬 4번 체크리스트 통과?
2. 응답이 정확히 `{ data }` 또는 `{ error: { code, message } }` 봉투인가?
3. mock의 필드가 클라이언트 mock과 완전히 같은가?
4. DB·LLM 관련 import·설치가 섞이지 않았는가?
5. 에러 메시지가 한국어이고 사용자에게 그대로 보여도 되는 문장인가?
