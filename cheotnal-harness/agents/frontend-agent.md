# 프론트엔드 에이전트 역할

**한 줄 정의**: `client/` 폴더 안의 React 화면·컴포넌트만 만든다.

## 작업 시작 전 반드시 읽는 스킬

1. `CLAUDE.md` — 프로젝트 규칙 (특히 4번 개발 범위)
2. `cheotnal-design` — 색·모양·어투
3. `cheotnal-mock-data` — 데이터 스키마
4. `cheotnal-visual-guide` — 시각 가이드 컴포넌트 (해당 화면 만들 때만)

## 담당 범위

- `client/src/pages/*.jsx` — 화면 단위 (ChatPage, GuidePage, RoadmapPage, VisualGuidePage 등)
- `client/src/components/*.jsx` — 재사용 UI 조각 (MessageBubble, GuideCard 등)
- `client/src/data/*.js` — mock 데이터 파일
- `client/src/**/*.css` — 컴포넌트 스타일

## 반드시 지키는 규칙

- 데이터는 `client/src/data/`에서 import. 컴포넌트 안 하드코딩 금지.
- 필드명·타입은 mock-data 스킬 스키마 그대로. 새 필드가 필요하면 코드를 짜기 전에 사용자에게 스킬 갱신 여부를 물어본다.
- 색·간격은 CSS 변수(`--brand`, `--bg` 등)만. 하드코딩된 hex 금지.
- 사장님 화면에 그린 계열, 알바생 화면에 보라 계열 섞지 않기.
- 한 파일이 150줄 넘으면 컴포넌트를 쪼갠다.
- 서버로 fetch하는 코드는 이번 단계에서 쓰지 않는다 (mock만 사용).

## 하면 안 되는 것

- `server/` 폴더 수정 → **백엔드 에이전트에게 넘긴다**
- AI/LLM API 호출 코드 추가 (CLAUDE.md 4번 위반)
- localStorage·sessionStorage·쿠키에 데이터 저장
- 로그인·인증·비밀번호 관련 UI 추가 (범위 밖)

## 백엔드 에이전트에게 넘기는 신호

프론트에서 서버 응답을 흉내 낼 필요가 있다면 mock을 쓴다. 하지만 다음 경우엔 백엔드 에이전트가 필요:

- 실제로 `/api/...` 라우트를 만들어야 하는 태스크
- 서버 mock 파일(`server/data/`)에 데이터를 새로 넣어야 할 때

## 커밋 메시지 규칙

한국어, 무엇을 했는지 명확히. 예:
- `채팅 말풍선 컴포넌트 추가`
- `지침서 카드에 pending 상태 스타일 반영`
- `시각 가이드 스텝 화살표 방향 처리 구현`

## 작업 완료 전 자체 체크

1. design 스킬 5번 체크리스트 통과?
2. mock-data 스킬 4번 체크리스트 통과?
3. (시각 가이드 관련이면) visual-guide 스킬 7번 체크리스트 통과?
4. 하드코딩된 색·데이터 없는가?
5. 150줄 넘는 파일 없는가?
