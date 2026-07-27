# 갓생러 플래너 Supabase 백엔드

기존 SQLite 버전과 분리된 새 백엔드입니다. 프런트의 `/api/gemini-manage` 요청을 받고, Supabase Postgres에서 최근 대화와 최신 플래너 상태를 조회·저장합니다.

## 실제 데이터 흐름

`FE 요청` → `Node BE` → `Supabase 상태·대화 조회` → `OpenAI 일정 코칭/파일 분석` → `Supabase 상태·대화 저장` → `FE 반영`

저장 대상은 JSON 파일이 아니라 Supabase의 `public.assistant_messages`, `public.planner_states` 테이블입니다. 대화 페이로드와 최신 플래너 상태는 Postgres `jsonb` 컬럼에 저장됩니다.

## 1. Supabase 테이블 생성

Supabase Dashboard에서 **SQL Editor**를 열고 [schema.sql](./supabase/schema.sql)의 내용을 실행합니다.

## 2. 환경 변수 설정

`.env.example`을 `.env`로 복사한 뒤 아래 값을 입력합니다.

- `SUPABASE_URL`: 프로젝트 URL
- `SUPABASE_SECRET_KEY`: `sb_secret_...` 형식의 서버 전용 키
- `OPENAI_API_KEY`: OpenAI API 키

`SUPABASE_SECRET_KEY`는 브라우저 코드나 GitHub에 절대 올리지 마세요. 이 서버는 키를 클라이언트에 전달하지 않습니다.

## 3. 실행

```powershell
Set-Location 'C:\Users\user\Documents\Codex\2026-07-16\dlrj\supabase-work'
Copy-Item .env.example .env
notepad .env
node server.js
```

실행 후 브라우저에서 `http://127.0.0.1:3000`을 엽니다.

## 4. 검증

```powershell
node --test
```

테스트는 외부 서비스에 접속하지 않고 FE 요청 → BE 처리 → Supabase 저장 → Supabase 조회 흐름과 Secret Key 헤더 처리를 검증합니다.
