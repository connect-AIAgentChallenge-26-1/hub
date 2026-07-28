# 로봇 내부 상태 에이전트

이 프로젝트는 로봇 고유의 내부 상태가 시간과 상호작용에 따라 변하고, 그 상태가 다음 행동
선택에 영향을 주는 과정을 구현합니다.

실제 생성형 AI API는 연결하지 않습니다. 현재 응답 문장은 선택된 행동에 대응하는 규칙
기반 템플릿입니다.

## 핵심 흐름

```text
사용자 메시지
→ 관찰값과 처리 부하를 기계 요인으로 변환
→ 이전 내부 상태에 시간 감쇠 적용
→ 여섯 상태 차원 갱신
→ 행동 후보 점수 계산
→ 하나의 행동 선택
→ 응답·상태 스냅샷·경험 기억을 원자적으로 저장
```

내부 상태 차원은 서로 독립적인 0~1 값입니다.

- `predictionError`: 입력과 예상의 불일치
- `resourcePressure`: 현재 처리 부담
- `goalConflict`: 동시에 경쟁하는 목표
- `continuityIntegrity`: 이전 맥락과의 연결
- `interactionSynchrony`: 입력과 처리 흐름의 정합성
- `explorationDrive`: 새 방향을 조사하려는 경향

클라이언트는 내부 상태값, 변화량, 판단 추적을 직접 지정하거나 조회할 수 없습니다. 공개
응답에는 선택된 행동과 응답 문장만 포함됩니다.

## 현재 기능

- 브라우저별 에이전트 인스턴스 식별
- 메시지 기반 내부 상태 갱신과 시간 감쇠
- 상태에 따른 결정론적 행동 선택
- 동일 요청 ID의 멱등 재생
- 상태 버전 충돌 감지와 제한된 재계산
- 상호작용·상태 스냅샷·경험 기억의 원자적 저장
- 서버 전용 Supabase 접근과 RLS
- JSON 크기 제한, CORS, 요청 횟수 제한, 보안 헤더
- React 메시지 입력, 행동 결과, 시스템 상태 표시

## 실행

```bash
npm install
npm run dev
```

API 서버는 별도 터미널에서 실행합니다.

```bash
npm start
```

프런트엔드 기본 주소는 `http://127.0.0.1:5173`, API 기본 주소는
`http://127.0.0.1:3000`입니다.

## 환경변수

루트 `.env.example`을 참고합니다. 실제 비밀값이 있는 `.env`는 Git에 포함하지 않습니다.

| 환경변수 | 기본값 | 용도 |
|---|---:|---|
| `PORT` | `3000` | Express 포트 |
| `CLIENT_URL` | 로컬 Vite 주소 | CORS 허용 출처 |
| `API_RATE_LIMIT_WINDOW_MS` | `900000` | 요청 제한 시간 범위 |
| `API_RATE_LIMIT_MAX` | `100` | IP별 최대 요청 수 |
| `JSON_BODY_LIMIT` | `100kb` | JSON 본문 제한 |
| `AGENT_INTERACTIONS_ENABLED` | `false` | 신규 상호작용 API 활성화 |
| `VITE_API_BASE_URL` | `http://127.0.0.1:3000` | 공개 API 주소 |
| `SUPABASE_URL` | 없음 | Supabase 프로젝트 URL |
| `SUPABASE_SECRET_KEY` | 없음 | 서버 전용 비밀키 |

신규 DB 마이그레이션을 적용하고 검증하기 전에는
`AGENT_INTERACTIONS_ENABLED=false`를 유지합니다.

## 배포

프런트엔드는 Vercel, 백엔드는 Render에 배포합니다. 두 서비스 모두 저장소 루트를
프로젝트 루트로 사용합니다.

### Render

루트 `render.yaml`을 Blueprint로 사용합니다.

- 빌드 명령: `npm ci --omit=dev`
- 시작 명령: `npm start`
- 헬스체크: `GET /healthz`
- 비밀 환경변수: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`
- CORS 환경변수: `CLIENT_URL=https://<Vercel 운영 도메인>`

DB 마이그레이션과 스키마 검증이 끝난 뒤에만 Render에서
`AGENT_INTERACTIONS_ENABLED=true`로 변경합니다. Render가 제공하는 `PORT`는 직접
고정하지 않습니다.

### Vercel

루트 `vercel.json`이 Vite 빌드와 `dist` 출력 디렉터리를 지정합니다. Vercel에는 공개
환경변수인 `VITE_API_BASE_URL=https://<Render 서비스 도메인>`만 설정합니다.
`SUPABASE_SECRET_KEY`는 Vercel에 설정하지 않습니다.

### 배포 순서

1. Supabase에 현재 마이그레이션을 적용하고 검증합니다.
2. Render 서비스를 생성하고 서버 전용 환경변수를 설정합니다.
3. Render `/healthz`가 `200`을 반환하는지 확인합니다.
4. Render URL을 Vercel의 `VITE_API_BASE_URL`에 설정하고 배포합니다.
5. Vercel 운영 도메인을 Render의 `CLIENT_URL`에 설정합니다.
6. Render에서 상호작용 기능 플래그를 활성화하고 실제 요청을 점검합니다.

`main` push와 pull request에서는 GitHub Actions가 전체 테스트와 프런트엔드 빌드를
실행합니다.

## 데이터베이스

현재 스키마는 다음 네 테이블과 하나의 원자적 RPC를 사용합니다.

- `agent_instances`
- `agent_interactions`
- `agent_state_snapshots`
- `experience_memories`
- `commit_agent_interaction`

적용 파일:

```text
backend/migrations/20260728_add_agent_state_system.sql
```

저장소에는 현재 내부 상태 스키마를 생성하는 마이그레이션만 유지합니다. 외부 DB에 남아
있는 과거 테이블이나 데이터는 코드 배포와 분리해 백업 및 삭제 승인을 거쳐 정리합니다.

자세한 적용 순서는 [Supabase 설정](docs/supabase-setup.md)을 참고합니다.

## API

```http
GET /healthz
```

외부 의존성 없이 서버 프로세스의 생존 상태를 반환합니다.

```http
POST /api/agent-interactions
```

요청은 브라우저 바인딩 UUID, 요청 UUID, 메시지, 선택적 제한 관찰값으로 구성됩니다.
계약과 응답 예시는 [에이전트 상호작용 API](docs/agent-interaction-api.md)에 있습니다.

## 검증

```bash
npm run test:run
npm run test:e2e
npm run build
npm run test:agent-schema
npm run test:supabase
```

- `test:run`: 상태 엔진, 계약, 저장소, API, React 단위·통합 테스트
- `test:e2e`: 화면 → Express → 상태 전이 → 테스트 저장소 수직 슬라이스
- `test:agent-schema`: Supabase에 네 테이블과 RPC가 노출되는지 읽기 전용 확인
- `test:supabase`: 적용된 `agent_instances` 읽기 확인

## 주요 구조

```text
backend/
  features/internal-state/
  features/agent-interactions/
  repositories/agentInteractionRepository.js
  migrations/20260728_add_agent_state_system.sql
frontend/src/
  features/agent-session/
  features/conversation/
shared/contracts/
  agentInteractionContract.js
  sensoryObservationContract.js
```

## 현재 제한

- 실제 생성형 AI API를 사용하지 않습니다.
- 사용자 인증과 사용자별 소유권 RLS는 아직 없습니다.
- 기능 플래그 기본값은 비활성입니다.
- 실제 Supabase 적용은 프로젝트 관리 권한이 있는 환경에서 수행해야 합니다.
- 장기 기억 검색과 자동 만료 작업은 후속 범위입니다.
