# API Contracts

## Environment names

Do not commit real values.

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-nano
OPENAI_FALLBACK_MODEL=gpt-5-mini
LLM_MANAGER_ENABLED=
LLM_MANAGER_MIN_INTERVAL_MS=
LLM_MANAGER_DAILY_LIMIT=
```

## GET /api/health

Success `200`:

```json
{
  "ok": true,
  "api": "hono",
  "storageMode": "memory",
  "supabaseConfigured": false
}
```

`storageMode` is `supabase` only when both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured in the local server environment. Do not expose the actual values in screenshots, docs, or PR text.

2026-07-21 local Supabase smoke criteria:

- `GET /api/health` returns `storageMode: "supabase"` and `supabaseConfigured: true`.
- `POST /api/quest-events` returns `201 Created`.
- `GET /api/quest-events?limit=5` returns `200 OK`.
- `GET /api/manager-context` returns `200 OK`.

## POST /api/quest-events

Request:

```json
{
  "type": "quest_completed",
  "quest": {
    "title": "DB concept study",
    "type": "time",
    "amount": 15,
    "unit": "min",
    "difficulty": "normal",
    "deadlineAt": "2026-07-15T14:59:00.000Z"
  },
  "result": "success",
  "expDelta": 20,
  "failureReason": null,
  "previousQuestTitle": null,
  "recoveryFromEventId": null,
  "managerMoodAfter": "happy",
  "managerLine": "The quest event was saved as memory.",
  "clientCreatedAt": "2026-07-15T13:20:00.000Z",
  "metadata": {
    "rewardCandidates": ["character_animation", "desktop_theme", "sound"],
    "futureContextTargets": ["personalized_manager", "web_day_flow", "reward_system"]
  }
}
```

Success `201`:

```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "type": "quest_completed",
    "title": "DB concept study",
    "result": "success",
    "expDelta": 20,
    "failureReason": null,
    "managerMoodAfter": "happy",
    "createdAt": "2026-07-15T13:20:01.000Z",
    "metadata": {}
  },
  "managerContext": {
    "currentMood": "happy",
    "recentEventCount": 1,
    "lastQuestResult": "success",
    "memorySummary": "recent events 1: success 1, failed 0, recovery 0.",
    "rewardHints": ["character_animation"]
  }
}
```

## GET /api/quest-events

Query:

- `limit`: optional, default `20`, max `100`
- `cursor`: optional
- `type`: optional quest event type
- `result`: optional, `success | failed | recovery`

Success `200`:

```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "type": "quest_completed",
      "title": "DB concept study",
      "result": "success",
      "expDelta": 20,
      "failureReason": null,
      "managerMoodAfter": "happy",
      "createdAt": "2026-07-15T13:20:01.000Z",
      "metadata": {}
    }
  ],
  "page": {
    "nextCursor": null
  }
}
```

## GET /api/manager-context

Success `200`:

```json
{
  "ok": true,
  "data": {
    "currentMood": "happy",
    "recentEventCount": 3,
    "lastQuestResult": "recovery",
    "memorySummary": "recent events 3: success 1, failed 1, recovery 1.",
    "rewardHints": ["character_animation", "memory_fragment", "gentle_recovery_tone"]
  }
}
```

## Failure response

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request value is invalid.",
    "details": {
      "field": "result"
    }
  }
}
```

Error codes:

- `VALIDATION_ERROR`
- `DB_INSERT_FAILED`
- `DB_SELECT_FAILED`
- `UNAUTHORIZED`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

## Manager LLM API v3

React는 OpenAI나 다른 LLM provider를 직접 호출하지 않고 다음 Hono route만 호출한다.

- `POST /api/manager/line`
- `POST /api/manager/quest-suggestion`
- `POST /api/manager/difficulty-evaluation`
- `POST /api/manager/stat-evaluation`
- `POST /api/manager/behavior-intent`
- `POST /api/manager/goal-plan`
- `POST /api/manager/next-quest`
- `POST /api/manager/plan-rebalance`
- `POST /api/manager/quest-acceptance-preview`

모든 요청과 응답의 `promptVersion`은 `manager-api-v3`다.

Server env:

- `OPENAI_API_KEY`: 서버 전용 비밀값이다.
- `OPENAI_MODEL`: 기본값 `gpt-5-nano`.
- `OPENAI_FALLBACK_MODEL`: 기본값 `gpt-5-mini`. 계획 생성, 리밸런싱, 통합 수락 결정에만 사용한다.
- `LLM_MANAGER_ENABLED`: server key가 설정된 환경에서만 `true`로 둔다.
- `LLM_MANAGER_MIN_INTERVAL_MS`: output kind별 서버 최소 호출 간격. 기본값 `30000`.
- `LLM_MANAGER_DAILY_LIMIT`: 서버 일일 호출 상한. 기본값 `80`.

### 공통 입력

사용자가 직접 제공하는 계획 입력은 자연어 목표, 하루 가능 시간, 선택 목표일, 매니저 말투다. `category`, `questSize`, 난이도는 입력받지 않고 LLM 또는 strict fallback이 목표 영역, 진행 속도, 퀘스트 난이도를 추론한다.

```json
{
  "promptVersion": "manager-api-v3",
  "outputKind": "goalPlan",
  "managerContext": {
    "currentMood": "waiting",
    "recentEventCount": 0,
    "lastQuestResult": null,
    "memorySummary": "no recent events",
    "rewardHints": []
  },
  "profile": {
    "rawGoalText": "정보처리기사 필기에 합격하고 싶어. 데이터베이스가 약해.",
    "dailyMinutes": 30,
    "targetDate": "2026-10-31",
    "managerTone": "friendly",
    "nickname": "루카스"
  },
  "persona": {
    "petId": "pink-manager",
    "tone": "friendly",
    "questStyle": "balanced",
    "feedbackStyle": "playful",
    "behaviorStyle": "balanced"
  },
  "questState": {
    "status": "draft"
  },
  "managerProgress": { "level": 1, "stats": { "diligence": 0, "persistence": 0, "creativity": 0, "knowledge": 0, "strength": 0, "agility": 0, "stamina": 0, "charm": 0 } },
  "recentEvents": [],
  "dailyCapacity": { "localDate": "2026-08-07", "baselineMinutes": 30, "reservedMinutes": 0, "usedMinutes": 0, "successfulMinutes": 0, "remainingMinutes": 30, "varianceMinutes": -30, "utilizationRatio": 0, "status": "no_activity", "bonusAwarded": false }
}
```

`targetDate`는 선택값이며 없으면 `null`이다. 첫 `goalPlan` 응답에서 보완 질문이 필요하면 `goalBrief.clarificationQuestion`을 최대 하나 반환할 수 있다. 답변 재요청은 `profile.clarificationAnswer`를 포함하며, 이때 추가 질문을 반환한 출력은 거부한다. 질문이 없거나 첫 답변이 반영된 뒤에만 계획을 수락한다.

### POST /api/manager/goal-plan

프로필 생성 또는 목표 변경 시 호출한다. 출력은 `GoalBrief`와 최종 계획 snapshot으로 구성한다.

`GoalBrief`:

- `normalizedGoal`: 자연어 목표를 실행 가능하게 정규화한 문장
- `targetOutcome`, `currentState`, `deadline`: 목표 결과와 현재 상태, 선택 목표일
- `inferredDomains`: LLM이 추론한 목표 영역 목록
- `assumptions`, `uncertainties`, `confidence`
- `clarificationQuestion`: 계획 수락 전 최대 한 번만 허용되는 선택 필드

최종 plan:

- `finalGoal`
- `milestones`: 전체 목표 기간의 중간 성과와 성공 기준
- `weeklyPlans`: 전체 horizon의 주차별 초점과 목표 결과
- `rollingDays`: 다음 7일의 숨은 focus와 intended outcome
- `currentQuest`: 화면에 노출할 현재 `QuestSpec` 하나

`goal-plan` 요청에는 client seed quest를 넣지 않는다. `dailyMinutes`는 하루 계획의 soft baseline이며 단일 퀘스트 길이나 퀘스트 지급 상한으로 변환하지 않는다.

### POST /api/manager/next-quest

현재 퀘스트를 마친 뒤 사용자가 다음 퀘스트를 명시적으로 요청할 때만 호출한다. 응답은 `nextQuest`, 전체 `updatedPlan`, `capacityAssessment`, `managerLine`, `behaviorIntent`를 한 번에 반환한다. `dailyCapacity.status`가 `capacity_reached` 또는 `over_capacity`여도 `day_complete`를 반환하지 않고 다음 퀘스트를 반드시 제공한다. 초과 상태의 미래 계획 검토도 이 호출 안에서 수행하며 별도 LLM 호출을 추가하지 않는다.

`QuestSpec`은 `displayTitle`, `instruction`, `purpose`, `completionCriteria`, `expectedOutput`, `estimatedMinutes`, `tracking`, milestone/weekly 연결을 분리한다. 제목에 시간이나 난이도 템플릿을 합성하지 않는다.

LLM은 `rawGoalText`, `dailyMinutes`, `targetDate`, 최근 성공/실패 기록을 바탕으로 영역, pacing, difficulty를 추론한다. 목표일이 없으면 임의의 강제 마감일을 만들지 않는다. 전체 미래 horizon은 내부 계획으로 검토하지만 화면에는 현재 퀘스트와 보상만 표시한다.

Supabase가 설정되면 `GoalBrief`와 수락된 plan snapshot을 `manager_goal_plans`에 저장한다. 저장 성공 시 `storedPlanId`를 반환한다. 저장 실패는 사용자 flow를 중단하지 않는다.

### POST /api/manager/plan-rebalance

render나 화면 전환이 아니라 다음 사건에서만 호출한다.

- 실패 또는 복구 발생 즉시
- 3회 연속 성공
- 주간 경계 검토
- 계획 대비 소요 시간이나 성공률이 크게 벗어나는 anomaly

실패/복구에서는 시간 부족, 과도한 난이도, 건너뜀 원인에 맞춰 즉시 다음 퀘스트를 축소하거나 재배치한다. 응답은 전체 `rebalancedPlan`, 제한된 `changes`, `nextQuest`를 반환한다.

리밸런싱은 미래의 milestone, weekly plan, rolling 7-day plan을 모두 검토할 수 있다. 단, `completed` 노드의 id, 내용, 성공 기준, 완료 상태는 불변이며 현재 진행 중인 노드와 미래 노드만 조정한다.

UI에는 `nextQuest`와 그 보상만 표시한다. 전체 미래 계획은 내부 snapshot으로 유지한다. Supabase가 설정되면 수정 전후 snapshot과 변경 이유를 `manager_plan_revisions`에 append-only로 추가하며, 저장 성공 시 `storedRevisionId`를 반환한다.

### POST /api/manager/quest-acceptance-preview

현재 퀘스트 초안을 수락하기 직전에 한 번 호출한다. 이 route가 하나의 통합 결정으로 다음 값을 확정한다.

- `finalizedQuest`: 목적, 완료 기준, 예상 시간, milestone/weekly 연결을 포함한 최종 퀘스트
- `difficulty`: `easy | normal | hard`
- `rewardExp`
- `statEvaluation`
- `managerLine`
- `behaviorIntent`

검증 규칙:

- `rewardExp`: `easy=5..15`, `normal=16..35`, `hard=36..60`.
- `statEvaluation.statBudget`: `easy=3`, `normal=7`, `hard=15`.
- top-level `difficulty`와 `statEvaluation.difficulty`는 같아야 한다. `finalizedQuest`는 난이도나 보상을 포함하지 않는 의미 중심 퀘스트다.
- `behaviorIntent.line`과 `managerLine`은 같아야 한다.
- 일부 필드만 유효한 응답은 합성하지 않고 전체 통합 결정을 strict fallback으로 교체한다.

### 세부 평가 route

`quest-suggestion`, `difficulty-evaluation`, `stat-evaluation`, `behavior-intent`, `line` route는 세부 기능과 하위 호환을 위해 유지한다. 새 퀘스트 수락의 권위 있는 결정은 `quest-acceptance-preview` 하나이며, 세부 route 결과를 조합해 수락 결정을 만들지 않는다.

난이도와 보상 범위:

| difficulty | rewardExp | stat budget |
|---|---:|---:|
| `easy` | `5..15` | `3` |
| `normal` | `16..35` | `7` |
| `hard` | `36..60` | `15` |

### Fallback, 비용, 개인정보

Fallback reason:

- `LLM_DISABLED`
- `LLM_PROVIDER_ERROR`
- `INVALID_LLM_OUTPUT`
- `RATE_LIMITED`
- `CLIENT_THROTTLED`

규칙:

- provider 비활성화, rate limit, provider 오류, schema 불일치 중 하나라도 발생하면 bounded `rule_fallback`을 `200`으로 반환한다.
- fallback도 동일 schema, EXP/stat budget, 완료 노드 불변 규칙을 통과해야 한다.
- fallback은 퀘스트 수락, 완료, 실패, 복구 flow를 막지 않는다.
- client는 동일 요청 snapshot을 60초 동안 재사용해 remount, 중복 클릭, context 동기화가 provider 호출을 늘리지 않게 한다.
- 계획 생성, 리밸런싱, 수락 결정만 fallback model을 사용할 수 있다.
- API key, Supabase key, token, raw DB row, raw prompt, provider 응답 원문, DOM 상태, sprite 경로, 좌표, 학교/위치 정보, 개인 일정은 전송하거나 저장하지 않는다.
- DB에는 수락된 snapshot, append-only revision, 최종 사용자 표시 대사와 `source`, `fallbackReason`, `promptVersion` 같은 최소 metadata만 저장한다.
