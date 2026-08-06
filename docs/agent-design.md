# AI Agent 설계

## Summary

Manager LLM v3는 사용자의 자연어 목표를 실행 가능한 장기 계획과 현재 퀘스트로 변환하는 제한형 planning agent다. prompt version은 `manager-api-v3`이며, provider가 없어도 같은 계약을 따르는 strict rule fallback으로 핵심 flow가 계속되어야 한다.

매니저의 성격, 기억, 목표, 계획 상태는 LLM 내부 기억이 아니라 앱 데이터와 snapshot으로 관리한다. LLM은 제안자이며, 서버 schema 검증과 도메인 규칙이 최종 권위다.

## 사용자 입력과 추론 경계

사용자가 계획 생성에 입력하는 값:

- 자연어 목표
- 하루 가능 시간(분)
- 목표일(선택)
- 매니저 말투: 차분함, 친구 같음, 단호함

LLM 또는 fallback이 추론하는 값:

- 목표 영역과 하위 영역
- 목표일까지의 pacing 또는 목표일이 없을 때의 지속 가능한 pacing
- 퀘스트별 difficulty
- milestone, weekly plan, rolling 7-day daily plan
- 수락 시 EXP와 능력치 보상

사용자에게 category, quest size, difficulty를 별도 설정값으로 요구하지 않는다. 추론값은 `GoalBrief`, plan snapshot, quest acceptance decision에 구조화해 남긴다.

## Agent 역할

### 1. GoalBrief 생성

자연어 목표를 `finalGoal`, `inferredDomains`, `assumptions`, `uncertainties`, `confidence`로 정리한다. 목표가 모호해 계획 품질에 큰 영향을 주는 경우에만 clarification 질문을 하나 만들 수 있다.

Clarification 규칙:

- 계획이 수락되기 전에만 질문한다.
- 전체 목표 생성 흐름에서 최대 한 번만 질문한다.
- 사용자가 답한 재요청에는 `clarificationAnswer`를 포함한다.
- 답변 이후 다시 질문하는 provider 출력은 schema 오류로 처리하고 fallback한다.
- 사소한 불확실성은 `assumptions`에 명시하고 계획을 계속 만든다.

### 2. 전체 계획 생성

확정된 GoalBrief를 다음 계층으로 분해한다.

```text
final goal
└─ milestones
   └─ weekly plans for the whole horizon
      └─ rolling focus for the next 7 days
```

- Final goal은 성공 여부를 판단할 기준을 가진다.
- Milestone은 전체 horizon의 중간 성과다.
- Weekly plan은 전체 기간을 검토하되, 주차별 초점과 목표 결과 중심으로 유지한다.
- Rolling day는 다음 7일의 focus만 유지하고 구체적인 퀘스트는 현재 하나만 만든다.
- 7일 이후는 weekly/milestone 수준으로 유지하고 리밸런싱 때 다시 구체화한다.

화면에는 전체 계획을 펼쳐 보이지 않는다. 사용자가 실행할 현재 퀘스트 하나와 그 퀘스트의 보상만 보여 준다.

현재 퀘스트가 끝난 뒤 사용자가 요청할 때만 `next-quest`가 다음 `QuestSpec` 하나를 생성한다. 하루 가능 시간은 계획 기준이지 하드 제한이 아니므로 기준 시간 도달·초과 뒤에도 요청이 있으면 퀘스트를 반환한다. 요청이 없으면 미래 퀘스트나 LLM 호출을 만들지 않는다.

### 3. 통합 퀘스트 수락 결정

`questAcceptancePreview`는 편집된 현재 퀘스트를 수락하기 직전에 호출하는 단일 권위 결정이다. 다음 값을 한 응답으로 확정한다.

- finalized quest
- difficulty
- EXP
- stat evaluation
- manager line
- behavior intent

난이도와 보상은 서버의 고정 범위를 통과해야 한다.

| difficulty | EXP | stat budget |
|---|---:|---:|
| easy | 5..15 | 3 |
| normal | 16..35 | 7 |
| hard | 36..60 | 15 |

Top-level 난이도와 stat evaluation 난이도는 같아야 한다. Finalized quest는 난이도와 보상을 섞지 않은 의미 중심 입력으로 유지한다. `managerLine`과 `behaviorIntent.line`도 같아야 한다. 일부 필드만 유효할 경우 유효한 부분을 섞지 않고 통합 결정 전체를 fallback으로 교체한다.

### 4. 리밸런싱

리밸런싱은 매 render가 아니라 다음 trigger에서만 실행한다.

- 실패 또는 복구 직후: 즉시
- 3회 연속 성공
- 주간 경계
- 계획 대비 시간, 성공률, 난이도 반응이 크게 벗어난 anomaly
- 하루 기준 시간 미달·최초 도달·초과와 프로필 변경

실패 시에는 원인을 우선 반영한다.

- 시간 부족: 다음 퀘스트를 더 짧게 만들고 남은 작업을 재배치한다.
- 너무 어려움: prerequisite를 추가하거나 퀘스트를 더 작은 단계로 나눈다.
- 건너뜀: 무리한 누적을 만들지 않고 rolling 7-day plan을 다시 배치한다.
- 복구 완료: 회복 퀘스트의 결과를 반영해 원래 pacing으로 점진 복귀한다.

매 리밸런싱은 전체 미래 horizon을 검토한다. 다만 완료된 goal, milestone, weekly, daily node는 immutable이다. 완료 node의 id, 내용, 성공 기준, 완료 상태를 바꾸지 않고 현재 진행 중인 node와 미래 node만 조정한다.

응답은 전체 `rebalancedPlan`과 changes를 내부 저장용으로 반환하고, 사용자에게는 다음 current quest와 reward만 보여 준다.

### 5. 피드백과 행동

Manager line과 behavior intent는 같은 현재 상황을 표현해야 한다. 말투는 사용자가 고른 manager tone을 따르되 다음 반응을 금지한다.

- 비난 또는 실패를 벌로 표현
- 과한 감정적 압박
- 근거 없는 성공 보장
- 미래 계획 전체를 한꺼번에 노출해 부담을 주는 표현

실패 후 EXP를 차감하지 않는다. 매니저는 실패 이유를 기록으로 사용하고 즉시 더 실행 가능한 다음 퀘스트를 제안한다.

## 상태와 저장 모델

`manager_goal_plans`는 수락된 `GoalBrief`를 `goal_brief_json`에, 최신 전체 plan snapshot을 `plan_json`에 가진다. `manager_plan_revisions`는 trigger event id, 변경 이유, 변경 후 snapshot을 append-only로 저장한다.

```text
accepted GoalBrief + plan snapshot
              │
              ├─ failure/recovery → immediate revision
              ├─ 3 successes     → revision
              ├─ weekly boundary → revision
              └─ anomaly         → revision
```

Snapshot은 현재 상태를 빠르게 읽기 위한 값이고 revision은 변경 이력의 근거다. `append_manager_plan_revision_v3` RPC가 revision 추가와 `plan_json` 갱신을 한 트랜잭션에서 수행한다. 완료 node 불변은 서버 contract가 provider 출력을 수락하기 전에 검사한다.

`dailyMinutes`는 그날 첫 퀘스트 수락 때 snapshot으로 고정한다. 사용량에는 성공·실패·복구의 실제 시간이 포함되지만 완주 인정 시간은 성공·복구에 대해서만 `min(actualMinutes, acceptedEstimatedMinutes)`로 계산한다. 인정 시간이 기준에 처음 도달하면 `daily_capacity_completed` 보너스를 하루 한 번 지급하고, 이후 퀘스트는 일반 보상을 계속 받는다.

DB 필드와 `005` 마이그레이션 계약은 [DB Schema](db-schema.md)를 따른다.

## Fallback과 비용 통제

- React는 `/api/manager/*` Hono route만 호출한다.
- API key와 provider secret은 server env에만 둔다.
- 기본 모델은 `gpt-5-nano`이며, planning-heavy route만 `OPENAI_FALLBACK_MODEL` 기본값 `gpt-5-mini`를 사용할 수 있다.
- server는 output kind별 minimum interval과 일일 호출 cap을 적용한다.
- client는 동일 request snapshot을 60초 동안 재사용한다.
- provider 비활성화, rate limit, provider 오류, invalid schema는 모두 strict `rule_fallback`으로 전환한다.
- fallback도 GoalBrief, 최대 1회 clarification, 7-day 제한, 완료 node 불변, EXP/stat budget 규칙을 지킨다.
- 저장 실패나 LLM 실패 때문에 퀘스트 수락, 완료, 실패, 복구 flow가 중단되어서는 안 된다.

## 개인정보와 prompt 정책

다음 값은 LLM에 보내거나 DB에 저장하지 않는다.

- API key, Supabase key, token, password
- raw provider prompt와 provider 응답 원문
- raw DB row, DOM state, sprite path, 화면 좌표
- 학교, 위치, 개인 일정 같은 불필요한 민감 정보

저장 가능한 LLM provenance는 `promptVersion`, `source`, `fallbackReason`과 사용자가 실제로 본 최종 결과로 제한한다. 자연어 목표는 계획 입력 데이터로 저장할 수 있지만 provider용 raw prompt 문자열과 혼동하지 않는다.

## Agent처럼 보이기 위한 기준

- 자연어 목표를 해석하고 불확실성을 드러낸다.
- 꼭 필요한 경우에만 한 번 질문한다.
- 전체 목표를 milestone과 주간 계획으로 조직한다.
- 다음 7일만 구체화하고 현재 퀘스트 하나에 집중시킨다.
- 퀘스트 수락 시 난이도, EXP, stats, 대사, 행동을 일관되게 결정한다.
- 실패와 복구에 즉시 반응하고, 누적 성공·주간 경계·anomaly에서 다시 조정한다.
- 완료된 기록은 바꾸지 않고 미래 계획만 적응시킨다.
