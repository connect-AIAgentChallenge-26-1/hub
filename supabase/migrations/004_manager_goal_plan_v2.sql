alter table public.manager_goal_plans
  add column if not exists raw_goal_text text,
  add column if not exists daily_minutes integer,
  add column if not exists target_date date,
  add column if not exists manager_tone text,
  add column if not exists nickname text,
  add column if not exists clarification_answer text,
  add column if not exists goal_brief_json jsonb;

alter table public.manager_goal_plans alter column category drop not null;
alter table public.manager_goal_plans alter column plan_version set default 2;

update public.manager_goal_plans
set raw_goal_text = coalesce(raw_goal_text, goal),
    goal_brief_json = coalesce(goal_brief_json, jsonb_build_object(
      'normalizedGoal', goal,
      'constraints', jsonb_build_array(),
      'preferences', jsonb_build_array(),
      'inferredDomains', jsonb_build_array('general'),
      'assumptions', jsonb_build_array('v1 migration snapshot'),
      'uncertainties', jsonb_build_array(),
      'confidence', 0.5
    ))
where raw_goal_text is null or goal_brief_json is null;

alter table public.manager_plan_revisions
  add column if not exists raw_goal_text text,
  add column if not exists revision_version integer not null default 2;

create unique index if not exists manager_plan_revisions_trigger_event_unique_idx
  on public.manager_plan_revisions (trigger_event_id)
  where trigger_event_id is not null;

create or replace function public.append_manager_plan_revision_v2(
  p_plan_id uuid,
  p_trigger_event_id uuid,
  p_raw_goal_text text,
  p_source text,
  p_fallback_reason text,
  p_prompt_version text,
  p_revision_reason text,
  p_changes_json jsonb,
  p_after_plan_json jsonb,
  p_goal_brief_json jsonb,
  p_next_quest_json jsonb
)
returns table (id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  inserted_at timestamptz;
begin
  insert into public.manager_plan_revisions (
    plan_id, trigger_event_id, goal, raw_goal_text, source, fallback_reason,
    prompt_version, revision_reason, changes_json, after_plan_json,
    next_quest_json, revision_version
  ) values (
    p_plan_id, p_trigger_event_id, p_raw_goal_text, p_raw_goal_text, p_source,
    p_fallback_reason, p_prompt_version, p_revision_reason, p_changes_json,
    p_after_plan_json, p_next_quest_json, 2
  )
  returning manager_plan_revisions.id, manager_plan_revisions.created_at
  into inserted_id, inserted_at;

  if p_plan_id is not null then
    update public.manager_goal_plans
    set plan_json = p_after_plan_json,
        goal_brief_json = p_goal_brief_json,
        plan_version = 2,
        updated_at = now()
    where manager_goal_plans.id = p_plan_id;
  end if;

  return query select inserted_id, inserted_at;
end;
$$;

revoke all on function public.append_manager_plan_revision_v2(
  uuid, uuid, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb
) from public;

grant execute on function public.append_manager_plan_revision_v2(
  uuid, uuid, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb
) to service_role;
