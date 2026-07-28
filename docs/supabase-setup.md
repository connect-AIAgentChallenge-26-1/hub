# Supabase 에이전트 상태 스키마 설정

## 적용 전

다음 서버 전용 환경변수를 `.env`에 설정합니다.

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
```

비밀키에 `VITE_` 접두사를 붙이지 않으며 `.env`를 Git에 포함하지 않습니다.

## 마이그레이션

Supabase Dashboard의 SQL Editor 또는 승인된 마이그레이션 실행기에서 다음 파일 전체를 한
번 실행합니다.

```text
backend/migrations/20260728_add_agent_state_system.sql
```

이 마이그레이션은 다음 리소스를 추가합니다.

- `agent_instances`
- `agent_interactions`
- `agent_state_snapshots`
- `experience_memories`
- `is_valid_agent_state`
- `commit_agent_interaction`

네 테이블 모두 RLS가 활성화되며 `anon`, `authenticated` 역할에는 직접 테이블 권한을
부여하지 않습니다. Express 서버의 `service_role`만 읽기·쓰기를 수행합니다.

## 검증

마이그레이션 적용 후 다음 명령을 실행합니다.

```bash
npm run test:agent-schema
npm run test:supabase
```

두 검사가 통과한 뒤에만 실제 환경에 다음 값을 설정합니다.

```text
AGENT_INTERACTIONS_ENABLED=true
```

그다음 서버를 재시작하고 `POST /api/agent-interactions`를 스모크 테스트합니다.

## 데이터 보존

과거 기능에서 생성된 테이블과 마이그레이션은 운영 데이터 보존을 위해 자동 삭제하지
않습니다. 현재 에이전트 상태 스키마와 런타임은 과거 분석 테이블에 의존하지 않습니다.
삭제가 필요하다면 별도 백업·보존 기간·복구 계획을 승인한 후 독립 작업으로 수행합니다.
