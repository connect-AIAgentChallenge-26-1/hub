# Supabase 에이전트 상태 스키마 설정

## 적용 전

다음 서버 전용 환경변수를 `.env`에 설정합니다.

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
```

비밀키에 `VITE_` 접두사를 붙이지 않으며 `.env`를 Git에 포함하지 않습니다.

## 마이그레이션

프로젝트에는 Supabase CLI `2.110.0`이 개발 의존성으로 고정되어 있습니다. 원격
프로젝트에 적용하기 전에 CLI에 로그인하고 프로젝트를 연결합니다.

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
```

로그인에는 Supabase 개인 액세스 토큰, 프로젝트 연결에는 데이터베이스 비밀번호가
필요합니다. 두 값은 Git이나 `.env.example`에 기록하지 않습니다.

연결 후 원격 변경 없이 적용 대상을 먼저 확인하고, 결과가 맞을 때만 실제 적용합니다.

```bash
npm run db:push:dry-run
npm run db:push
```

CLI는 다음 마이그레이션을 원격 마이그레이션 이력과 비교해 아직 적용되지 않은 경우에만
실행합니다.

```text
supabase/migrations/20260728000000_add_agent_state_system.sql
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
