# 갓생러 플래너 AI 백엔드

이 서버가 `frontend-work/플래너.html`을 제공하며, HTML의 상대 API 경로가 OpenAI·SQLite 백엔드에 연결됩니다.

## 포함된 실제 흐름

`AI 비서에게 요청` → `POST /api/gemini-manage` → SQLite에서 같은 브라우저 세션의 최근 대화 조회 → OpenAI Responses API 호출 → 요청/응답 SQLite 저장 → 프런트가 바로 소비하는 JSON 응답

- 저장 DB: `data/planner.sqlite`
- 조회 API: `GET /api/assistant/history`
- 기존 호환 API: `POST /api/gemini-manage`
- 새 별칭 API: `POST /api/assistant/manage`
- 플래너 상태 저장·조회: `PUT/GET /api/assistant/state`
- 파일·이미지 일정 추출: `POST /api/assistant/upload-parse`
- 승인형 자동 재정렬: `POST /api/assistant/auto-reorder`
- 개인정보·세션 기록 삭제: `DELETE /api/assistant/data`
- Google·카카오 계정 연동: `GET /api/auth/start`, `GET /api/auth/callback/:provider`
- 로그인 상태 확인·로그아웃: `GET /api/auth/session`, `POST /api/auth/logout`

모델에는 다음 시스템 지시가 적용됩니다. 또한 Responses API의 엄격한 JSON Schema와 서버 측 검증을 함께 적용해, 프런트가 기대하는 `reply`, `retrospective`, `nextDaySuggestion`, `planUpdates`, `taskUpdates`, `recommendations` 필드만 반환합니다.

> 너는 일정 관리 코치다. 다른 수다 떨지 말고, 사용자가 준 페이로드 데이터를 분석해서 오직 아래의 JSON 포맷으로만 응답해라. 형식이 틀리면 내 프로그램이 터지니 절대로 빈틈없이 맞춰라.

## 실행

1. `.env.example`을 복사해 파일명을 `.env`로 바꾸고 `OPENAI_API_KEY`를 입력합니다.
2. 아래 명령을 실행합니다.

```powershell
Set-Location 'C:\Users\user\Documents\Codex\2026-07-16\dlrj\work'
node server.js
```

3. 브라우저에서 `http://127.0.0.1:3001`을 엽니다. 데스크톱의 HTML 파일을 직접 열면 서버 주소로 자동 이동합니다.

원본 HTML의 위치가 바뀌면 `.env`의 `PLANNER_HTML_PATH`만 새 절대 경로로 변경하면 됩니다.

## Google·카카오 계정 연동 설정

`.env`에 아래 값을 입력하면 우측 상단의 `계정 연동`에서 공식 OAuth 팝업 로그인이 동작합니다.

```dotenv
APP_BASE_URL=http://127.0.0.1:3001
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=
```

공급자 콘솔에 등록할 Redirect URI:

- Google: `http://127.0.0.1:3001/api/auth/callback/google`
- 카카오: `http://127.0.0.1:3001/api/auth/callback/kakao`

Google에는 웹 애플리케이션 OAuth 클라이언트를 만들고 위 URI를 승인된 리디렉션 URI로 등록합니다. 카카오 Developers에서는 카카오 로그인을 활성화하고 REST API 키를 `KAKAO_CLIENT_ID`로 사용한 뒤, 위 카카오 Redirect URI를 등록합니다. 비밀번호와 공급자 액세스 토큰은 플래너 DB에 저장하지 않습니다.

## 검증

```powershell
node --test
```

커버리지까지 확인하려면 아래 명령을 사용합니다.

```powershell
npm.cmd run test:coverage
```

테스트 범위:

- `test/planner-core.test.js`: 완료율, 미완료 개수, 시간 변환, 작업 정규화, 제목 추출, 개인정보 마스킹 단위 테스트
- `test/frontend-smoke.test.js`: 핵심 UI 요소, 공용 스크립트 로드 순서, 브라우저 JavaScript 문법 스모크 테스트
- `test/server-unit.test.js`: AI JSON 스키마 검증과 DB 저장 전 보안정보 제거 단위 테스트
- `test/server.test.js`: FE 요청 → BE → OpenAI 모킹 → SQLite 저장·조회 통합 테스트

외부 OpenAI API를 실제 호출하지 않고 모킹하므로 API 비용 없이 반복 실행할 수 있습니다.
