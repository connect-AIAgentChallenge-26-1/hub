begin;

create or replace function public.is_valid_agent_state(p_state jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $function$
  select
    jsonb_typeof(p_state) = 'object'
    and p_state <> '{}'::jsonb
    and not exists (
      select 1
      from jsonb_each(p_state) as entry(key, value)
      where
        case
          when jsonb_typeof(value) = 'number'
            then not ((value #>> '{}')::numeric between 0 and 1)
          else true
        end
    );
$function$;

create table public.agent_instances (
  id uuid primary key default gen_random_uuid(),
  browser_binding_id uuid not null unique,
  owner_user_id uuid,
  current_state jsonb not null,
  state_version bigint not null default 0,
  state_profile_version text not null,
  last_state_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,

  constraint agent_instances_current_state_check
    check (public.is_valid_agent_state(current_state)),
  constraint agent_instances_state_version_check
    check (state_version >= 0),
  constraint agent_instances_state_profile_version_check
    check (char_length(btrim(state_profile_version)) between 1 and 50)
);

create table public.agent_interactions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null
    references public.agent_instances(id) on delete cascade,
  client_request_id uuid not null,
  sequence_number bigint not null,
  user_message text not null,
  sensory_observations jsonb not null default '[]'::jsonb,
  chosen_action text not null,
  response_text text not null,
  decision_trace jsonb not null,
  state_before_version bigint not null,
  state_after_version bigint not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,

  constraint agent_interactions_request_unique
    unique (agent_id, client_request_id),
  constraint agent_interactions_sequence_unique
    unique (agent_id, sequence_number),
  constraint agent_interactions_sequence_number_check
    check (sequence_number > 0),
  constraint agent_interactions_user_message_length_check
    check (char_length(btrim(user_message)) between 1 and 1000),
  constraint agent_interactions_sensory_observations_check
    check (
      jsonb_typeof(sensory_observations) = 'array'
      and jsonb_array_length(sensory_observations) <= 6
    ),
  constraint agent_interactions_chosen_action_check
    check (
      chosen_action in (
        'continue_task',
        'request_clarification',
        'verify_context',
        'ask_priority',
        'explore_topic',
        'reduce_scope',
        'pause_or_recover',
        'acknowledge_observation'
      )
    ),
  constraint agent_interactions_response_text_length_check
    check (char_length(btrim(response_text)) between 1 and 2000),
  constraint agent_interactions_decision_trace_check
    check (jsonb_typeof(decision_trace) = 'object'),
  constraint agent_interactions_state_version_check
    check (
      state_before_version >= 0
      and state_after_version = state_before_version + 1
    )
);

create table public.agent_state_snapshots (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null
    references public.agent_instances(id) on delete cascade,
  interaction_id uuid not null unique
    references public.agent_interactions(id) on delete cascade,
  state_version bigint not null,
  state_vector jsonb not null,
  state_delta jsonb not null,
  change_causes jsonb not null default '[]'::jsonb,
  state_profile_version text not null,
  captured_at timestamptz not null default now(),
  expires_at timestamptz,

  constraint agent_state_snapshots_agent_version_unique
    unique (agent_id, state_version),
  constraint agent_state_snapshots_state_version_check
    check (state_version > 0),
  constraint agent_state_snapshots_state_vector_check
    check (public.is_valid_agent_state(state_vector)),
  constraint agent_state_snapshots_state_delta_check
    check (jsonb_typeof(state_delta) = 'object'),
  constraint agent_state_snapshots_change_causes_check
    check (jsonb_typeof(change_causes) = 'array'),
  constraint agent_state_snapshots_profile_version_check
    check (char_length(btrim(state_profile_version)) between 1 and 50)
);

create table public.experience_memories (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null
    references public.agent_instances(id) on delete cascade,
  source_interaction_id uuid not null
    references public.agent_interactions(id) on delete cascade,
  attributes jsonb not null default '{}'::jsonb,
  base_importance numeric(5, 4) not null,
  current_strength numeric(5, 4) not null,
  state_influence jsonb not null default '{}'::jsonb,
  last_reinforced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,

  constraint experience_memories_source_unique
    unique (agent_id, source_interaction_id),
  constraint experience_memories_attributes_check
    check (jsonb_typeof(attributes) = 'object'),
  constraint experience_memories_base_importance_check
    check (base_importance between 0 and 1),
  constraint experience_memories_current_strength_check
    check (current_strength between 0 and 1),
  constraint experience_memories_state_influence_check
    check (jsonb_typeof(state_influence) = 'object')
);

create index agent_instances_owner_user_id_idx
  on public.agent_instances (owner_user_id)
  where owner_user_id is not null;

create index agent_instances_last_state_updated_at_idx
  on public.agent_instances (last_state_updated_at desc);

create index agent_interactions_agent_created_at_idx
  on public.agent_interactions (agent_id, created_at desc);

create index agent_state_snapshots_agent_captured_at_idx
  on public.agent_state_snapshots (agent_id, captured_at desc);

create index experience_memories_agent_strength_idx
  on public.experience_memories (
    agent_id,
    current_strength desc,
    last_reinforced_at desc
  );

create index experience_memories_expires_at_idx
  on public.experience_memories (expires_at)
  where expires_at is not null;

create index experience_memories_attributes_gin_idx
  on public.experience_memories using gin (attributes);

alter table public.agent_instances enable row level security;
alter table public.agent_interactions enable row level security;
alter table public.agent_state_snapshots enable row level security;
alter table public.experience_memories enable row level security;

revoke all on table public.agent_instances from anon, authenticated;
revoke all on table public.agent_interactions from anon, authenticated;
revoke all on table public.agent_state_snapshots from anon, authenticated;
revoke all on table public.experience_memories from anon, authenticated;

grant select, insert, update, delete
  on table public.agent_instances to service_role;
grant select, insert, update, delete
  on table public.agent_interactions to service_role;
grant select, insert, update, delete
  on table public.agent_state_snapshots to service_role;
grant select, insert, update, delete
  on table public.experience_memories to service_role;

create or replace function public.commit_agent_interaction(
  p_agent_id uuid,
  p_expected_state_version bigint,
  p_client_request_id uuid,
  p_user_message text,
  p_sensory_observations jsonb,
  p_chosen_action text,
  p_response_text text,
  p_decision_trace jsonb,
  p_next_state jsonb,
  p_state_delta jsonb,
  p_change_causes jsonb,
  p_state_profile_version text,
  p_created_at timestamptz,
  p_memory_attributes jsonb,
  p_memory_base_importance numeric,
  p_memory_current_strength numeric,
  p_memory_state_influence jsonb,
  p_memory_expires_at timestamptz
)
returns table (
  interaction jsonb,
  replayed boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_agent public.agent_instances%rowtype;
  v_existing public.agent_interactions%rowtype;
  v_created public.agent_interactions%rowtype;
  v_sequence_number bigint;
  v_next_state_version bigint;
begin
  select *
  into v_agent
  from public.agent_instances
  where id = p_agent_id
  for update;

  if not found then
    raise exception 'AGENT_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  select *
  into v_existing
  from public.agent_interactions
  where agent_id = p_agent_id
    and client_request_id = p_client_request_id;

  if found then
    return query
      select to_jsonb(v_existing), true;
    return;
  end if;

  if v_agent.state_version <> p_expected_state_version then
    raise exception 'STATE_VERSION_CONFLICT'
      using
        errcode = '40001',
        detail =
          'The expected agent state version no longer matches the current version.';
  end if;

  select coalesce(max(sequence_number), 0) + 1
  into v_sequence_number
  from public.agent_interactions
  where agent_id = p_agent_id;

  v_next_state_version := p_expected_state_version + 1;

  insert into public.agent_interactions (
    agent_id,
    client_request_id,
    sequence_number,
    user_message,
    sensory_observations,
    chosen_action,
    response_text,
    decision_trace,
    state_before_version,
    state_after_version,
    created_at
  )
  values (
    p_agent_id,
    p_client_request_id,
    v_sequence_number,
    p_user_message,
    p_sensory_observations,
    p_chosen_action,
    p_response_text,
    p_decision_trace,
    p_expected_state_version,
    v_next_state_version,
    p_created_at
  )
  returning *
  into v_created;

  update public.agent_instances
  set
    current_state = p_next_state,
    state_version = v_next_state_version,
    state_profile_version = p_state_profile_version,
    last_state_updated_at = p_created_at,
    updated_at = p_created_at
  where id = p_agent_id;

  insert into public.agent_state_snapshots (
    agent_id,
    interaction_id,
    state_version,
    state_vector,
    state_delta,
    change_causes,
    state_profile_version,
    captured_at
  )
  values (
    p_agent_id,
    v_created.id,
    v_next_state_version,
    p_next_state,
    p_state_delta,
    p_change_causes,
    p_state_profile_version,
    p_created_at
  );

  if p_memory_attributes is not null then
    insert into public.experience_memories (
      agent_id,
      source_interaction_id,
      attributes,
      base_importance,
      current_strength,
      state_influence,
      last_reinforced_at,
      created_at,
      updated_at,
      expires_at
    )
    values (
      p_agent_id,
      v_created.id,
      p_memory_attributes,
      p_memory_base_importance,
      coalesce(p_memory_current_strength, p_memory_base_importance),
      coalesce(p_memory_state_influence, '{}'::jsonb),
      p_created_at,
      p_created_at,
      p_created_at,
      p_memory_expires_at
    );
  end if;

  return query
    select to_jsonb(v_created), false;
end;
$function$;

revoke all on function public.is_valid_agent_state(jsonb)
  from public, anon, authenticated;
grant execute on function public.is_valid_agent_state(jsonb)
  to service_role;

revoke all on function public.commit_agent_interaction(
  uuid,
  bigint,
  uuid,
  text,
  jsonb,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  timestamptz,
  jsonb,
  numeric,
  numeric,
  jsonb,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.commit_agent_interaction(
  uuid,
  bigint,
  uuid,
  text,
  jsonb,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  timestamptz,
  jsonb,
  numeric,
  numeric,
  jsonb,
  timestamptz
) to service_role;

comment on table public.agent_instances is
  '서버가 관리하는 인공 행위자 인스턴스와 현재 내부 상태';
comment on column public.agent_instances.browser_binding_id is
  '인증 도입 전 임시 브라우저 연결 UUID이며 사용자 소유권 증명이 아님';
comment on table public.agent_interactions is
  '입력, 감각 관찰, 선택 행동과 서버 응답의 불변 상호작용 기록';
comment on table public.agent_state_snapshots is
  '상호작용별 내부 상태와 변경 원인을 기록하는 append-only 스냅샷';
comment on table public.experience_memories is
  '원문을 중복 저장하지 않고 원본 상호작용을 참조하는 경험 기억';
comment on function public.commit_agent_interaction is
  '상호작용, 상태 스냅샷, 현재 상태와 선택적 경험 기억을 원자적으로 저장';

commit;
