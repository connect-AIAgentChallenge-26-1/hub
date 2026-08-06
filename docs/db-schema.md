# DB Schema

## quest_logs

Recommended database: Supabase Postgres.

Fields:

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `user_id` | uuid nullable | future auth link |
| `anonymous_session_id` | text nullable | MVP anonymous session |
| `quest_id` | uuid nullable | future quest table link |
| `event_type` | text | `quest_completed`, `quest_failed`, `recovery_completed`, etc. |
| `title` | text | quest title at event time |
| `quest_type` | text | `time`, `quantity`, `action` |
| `amount` | integer | quest amount |
| `unit` | text | display unit |
| `difficulty` | text | `easy`, `normal`, `hard` |
| `deadline_at` | timestamptz nullable | quest deadline |
| `result` | text nullable | `success`, `failed`, `recovery`; nullable for non-result events |
| `exp_delta` | integer | EXP change from event |
| `failure_reason` | text nullable | selected failure reason |
| `previous_quest_title` | text nullable | recovery context |
| `recovery_from_event_id` | uuid nullable | future self-reference |
| `manager_mood_after` | text nullable | manager state after event |
| `manager_line` | text nullable | manager reaction text used to summarize the event |
| `client_created_at` | timestamptz nullable | client event time |
| `created_at` | timestamptz | server insert time, default `now()` |
| `visibility` | text | default `private` |
| `event_version` | integer | default `1` |
| `metadata` | jsonb | extension data |

Indexes to add with the real migration:

- `created_at desc`
- `(user_id, created_at desc)`
- `(anonymous_session_id, created_at desc)`
- `(result, created_at desc)`
- `(event_type, created_at desc)`

Data API grants used for local Supabase verification:

```sql
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.quest_logs to service_role;
```

Expansion notes:

- Weekly reports can aggregate by `created_at`, `result`, `exp_delta`, and `failure_reason`.
- Manager memory can summarize from private logs instead of storing prompts.
- Public quest exploration must keep `visibility` defaulted to `private`.
- Camera or gesture features should store settings or consent versions only, not raw frames.

## manager_goal_plans

`supabase/migrations/002_create_manager_goal_plans.sql`이 기본 테이블을 만들고, `supabase/migrations/004_manager_goal_plan_v2.sql`이 v2 입력과 GoalBrief 필드를 추가한다. 마이그레이션 파일은 저장소에만 추가되어 있으며 원격 Supabase에는 별도 승인 후 적용해야 한다.

Fields:

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `user_id` | uuid nullable | future auth link |
| `anonymous_session_id` | text nullable | MVP anonymous session |
| `goal` | text | v1 호환용 목표 문자열 |
| `category` | text nullable | v1 호환용 분류; v2에서는 사용자 입력으로 받지 않음 |
| `status` | text | default `active` |
| `source` | text | `llm` or `rule_fallback` |
| `fallback_reason` | text nullable | fallback reason when applicable |
| `prompt_version` | text | v2 신규 row는 `manager-api-v2` |
| `plan_version` | integer | v1 기본값 `1`; migration 004 적용 후 기본값 `2` |
| `plan_json` | jsonb | 최신 전체 `ManagerGoalPlan` snapshot |
| `created_at` | timestamptz | server insert time |
| `updated_at` | timestamptz | future update marker |

Indexes:

- `created_at desc`
- `(user_id, created_at desc)`
- `(anonymous_session_id, created_at desc)`

### Migration 004 추가 필드

| Table | Field | Type | Notes |
|---|---|---|---|
| `manager_goal_plans` | `raw_goal_text` | text | 사용자가 입력한 자연어 목표. raw provider prompt가 아님 |
| `manager_goal_plans` | `daily_minutes` | integer | 사용자가 입력한 하루 가능 시간 |
| `manager_goal_plans` | `target_date` | date nullable | 사용자가 선택한 목표일 |
| `manager_goal_plans` | `manager_tone` | text | `calm`, `friendly`, `firm` |
| `manager_goal_plans` | `nickname` | text | manager line에 사용할 표시 이름 |
| `manager_goal_plans` | `clarification_answer` | text nullable | 최초 계획 보완 질문에 대한 선택 답변 |
| `manager_goal_plans` | `goal_brief_json` | jsonb | 수락된 `GoalBrief`; 추론 영역, 가정, 불확실성, confidence 포함 |

`plan_json`은 현재 상태를 빠르게 읽기 위한 materialized snapshot이다. v2 row의 `plan_version` 기본값은 `2`다. 계획 변경은 `append_manager_plan_revision_v2` RPC에서 revision 추가와 snapshot 갱신을 한 트랜잭션으로 처리한다.

## manager_plan_revisions

`002`가 기본 테이블을 만들고, 이미 예전 `002`를 적용한 DB에는 `003`이 `next_quest_json`을 보강한다. `004`는 v2 원문 목표와 revision version, 중복 trigger 방지 RPC를 추가한다.

Fields:

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `plan_id` | uuid nullable | references `manager_goal_plans(id)` |
| `trigger_event_id` | uuid nullable | references `quest_logs(id)` |
| `goal` | text | goal at rebalance time |
| `source` | text | `llm` or `rule_fallback` |
| `fallback_reason` | text nullable | fallback reason when applicable |
| `prompt_version` | text | v2 신규 row는 `manager-api-v2` |
| `revision_reason` | text | first change reason |
| `changes_json` | jsonb | bounded `planRebalance.changes` |
| `after_plan_json` | jsonb | v1 호환용 rebalance 결과 |
| `next_quest_json` | jsonb | bounded `planRebalance.nextQuest` shown to the user after rebalancing |
| `raw_goal_text` | text nullable | 재조정 당시 사용한 자연어 목표 |
| `revision_version` | integer | v2 revision schema version, default `2` |
| `created_at` | timestamptz | server insert time |

Indexes:

- `(plan_id, created_at desc)`
- `trigger_event_id`

Revision row는 append-only다. `trigger_event_id`가 있는 row에는 partial unique index를 두어 같은 이벤트 재처리를 막는다. 리밸런싱은 전체 미래 horizon을 검토할 수 있지만 완료된 goal, milestone, weekly, daily node를 바꾸는 provider 출력은 서버 contract에서 거부한다. `next_quest_json`은 화면에 표시할 현재 퀘스트 하나만 담고, 전체 계획은 `after_plan_json`에 둔다.

권장 index:

- `(plan_id, created_at desc)`
- unique partial `(trigger_event_id) where trigger_event_id is not null`

## Manager LLM v3 저장 경계

- 최초 수락: `goal_brief_json`과 `plan_json`을 함께 저장한다. clarification 질문만 있는 미수락 응답은 계획 row로 확정하지 않는다.
- 리밸런싱: 변경 후 snapshot과 변경 이유를 revision에 append하고 같은 RPC에서 최신 `plan_json`을 갱신한다.
- 실패/복구는 즉시 revision을 만들 수 있고, 3회 성공·주간 경계·anomaly는 해당 trigger가 성립할 때만 만든다.
- `quest-acceptance-preview`의 finalized quest, difficulty, EXP, stats, manager line, behavior는 현재 퀘스트 결정에만 사용한다. 미래 퀘스트별 보상을 미리 화면에 노출하거나 별도 비정규화 row로 대량 저장하지 않는다.
- raw prompt, provider 응답 원문, API key, Supabase key, token 또는 다른 secret은 어떤 JSONB에도 저장하지 않는다.
- 저장 가능한 provenance는 `prompt_version`, `source`, `fallback_reason`과 최종 사용자 표시 결과로 제한한다.

### Migration 005

`005_manager_goal_plan_v3.sql`은 새 테이블을 만들지 않는다. goal plan과 revision 기본 version을 `3`으로 올리고 `append_manager_plan_revision_v3` RPC를 추가한다. 기존 v1/v2 row와 `004` RPC는 보존한다.

일일 완주 보너스는 기존 `quest_logs`의 `reward_unlocked` event로 저장한다. metadata에는 `rewardKind=daily_capacity_completed`, `localDate`, `dailyBaselineMinutes`, `successfulMinutes`, `bonusExp`만 저장한다. `(user 또는 anonymous session, localDate, rewardKind)` partial unique index가 하루 한 번 지급을 보장한다.

## Normalization Plan For Remaining Features

`quest_logs`는 현재 수직 슬라이스의 중심 이벤트 테이블이다. 남은 기능을 모두 고려하면 `metadata`는 임시 확장 영역으로만 사용하고, 반복 조회, 권한 제어, 사용자 설정, 보상 인벤토리처럼 독립 수명이 있는 데이터는 단계적으로 별도 테이블로 승격한다.

| Phase | Table or view | Why | Candidate columns | Related tasks |
|---|---|---|---|---|
| 1 | `user_profiles` | 프로필, 목표, 선호 진행 강도, 매니저 톤을 저장 | `id`, `nickname`, `primary_goal`, `category`, `minimum_minutes`, `quest_size`, `manager_tone`, `created_at`, `updated_at` | T-709, T-711 |
| 1 | `manager_personas` | LLM 매니저가 사용할 제한된 Persona와 rule fallback을 저장 | `id`, `profile_id`, `pet_id`, `behavior_style`, `tone`, `voice_id`, `prompt_guardrails`, `created_at`, `updated_at` | T-709, T-711, T-713 |
| 2 | `user_stats` | Quest Event metadata에서 능력치 증가를 반복 조회 가능한 값으로 승격 | `id`, `profile_id`, `stat_key`, `value`, `updated_at` | T-712 |
| 2 | `reward_inventory` | 보상, 테마, sound, accessory 해금 상태를 관리 | `id`, `profile_id`, `reward_id`, `reward_type`, `source_event_id`, `unlocked_at`, `equipped_at` | T-703, T-707 |
| 2 | `pet_appearance_settings` | 해금된 stage 중 사용자가 선택한 외형 회귀 상태를 저장 | `id`, `profile_id`, `pet_id`, `selected_stage`, `unlocked_stages`, `updated_at` | T-703, T-717 |
| 3 | `memory_fragments` | 완료/복구 이벤트를 기억 조각으로 표시 | `id`, `profile_id`, `source_event_id`, `fragment_type`, `title`, `asset_id`, `created_at` | T-706 |
| 3 | `theme_unlocks` | 배경/창 테마 해금과 장착을 관리 | `id`, `profile_id`, `theme_id`, `theme_type`, `source_event_id`, `equipped`, `unlocked_at` | T-704, T-705, T-708 |
| 4 | `public_quest_shards` view | 공개 퀘스트 탐색은 private 기본값을 유지한 익명 view로 제공 | `quest_log_id`, `title`, `quest_type`, `difficulty`, `created_at`, `motif` | T-722 |
| 4 | `device_preferences` | webcam, gesture, projection, sound consent와 fallback 설정 저장 | `id`, `profile_id`, `camera_consent_version`, `gesture_enabled`, `sound_enabled`, `projection_mode_enabled`, `updated_at` | T-713, T-721, T-723, T-724 |

## Normalization Rules

- `quest_logs.metadata`에 한 번만 쓰이고 조회하지 않는 값은 그대로 둔다.
- 여러 화면에서 반복 조회하거나 정렬/필터링할 값은 별도 컬럼 또는 별도 테이블로 승격한다.
- LLM prompt 원문을 장기 저장하지 않는다. 대신 `ManagerContext`, event summary, persona setting을 저장하고, 필요 시 최종 출력에 대한 `promptVersion`, `source`, `fallbackReason` 같은 최소 metadata만 남긴다.
- webcam frame, raw gesture frame, audio recording은 DB에 저장하지 않는다.
- public 기능은 `visibility = 'anonymous_public'`인 이벤트만 별도 view로 노출한다.
- Supabase RLS는 user auth를 붙이는 시점에 `profile_id` 또는 `user_id` 기준으로 작성한다.
