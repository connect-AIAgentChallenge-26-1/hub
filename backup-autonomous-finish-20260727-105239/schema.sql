-- 갓생러 플래너 Supabase/PostgreSQL schema
-- Supabase Dashboard > SQL Editor에서 실행합니다.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  user_name text not null default '',
  persona text not null default 'student'
    check (persona in ('student', 'worker')),
  subscription_plan text not null default 'free'
    check (subscription_plan in ('free', 'basic', 'pro', 'team')),
  streak_count integer not null default 0
    check (streak_count >= 0),
  god_points integer not null default 0
    check (god_points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_email_lower_uidx
  on public.users (lower(email))
  where email <> '';

create table if not exists public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  date_key date not null,
  day_of_week text not null
    check (day_of_week in ('mon', 'tue', 'wed', 'thu', 'fri')),
  planned_start time,
  planned_end time,
  actual_end time,
  energy_level text not null default 'mid'
    check (energy_level in ('high', 'mid', 'low')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_plans_user_date_unique unique (user_id, date_key),
  constraint daily_plans_time_window_check check (
    planned_start is null
    or planned_end is null
    or planned_end > planned_start
  )
);

create index if not exists daily_plans_user_date_idx
  on public.daily_plans (user_id, date_key desc);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  daily_plan_id uuid not null
    references public.daily_plans (id) on delete cascade,
  task_text text not null check (length(btrim(task_text)) > 0),
  is_done boolean not null default false,
  urgency_score integer not null default 2
    check (urgency_score between 1 and 5),
  duration_minutes integer not null default 25
    check (duration_minutes between 1 and 1440),
  details jsonb not null default '[]'::jsonb
    check (jsonb_typeof(details) = 'array'),
  source text not null default 'manual'
    check (source in ('manual', 'upload')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_daily_plan_done_idx
  on public.tasks (daily_plan_id, is_done, urgency_score desc);

create table if not exists public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  daily_plan_id uuid not null
    references public.daily_plans (id) on delete cascade,
  start_time time not null,
  end_time time not null,
  priority text not null default 'Medium'
    check (priority in ('High', 'Medium', 'Low')),
  is_overflow boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_blocks_time_order_check check (
    is_overflow or end_time > start_time
  )
);

create index if not exists time_blocks_daily_plan_start_idx
  on public.time_blocks (daily_plan_id, start_time);

create table if not exists public.chat_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  message text not null check (length(btrim(message)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists chat_logs_user_created_idx
  on public.chat_logs (user_id, created_at desc);

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  device_id text not null check (length(btrim(device_id)) between 8 and 200),
  token text not null check (length(btrim(token)) between 20 and 4096),
  platform text not null check (platform in ('ios', 'android', 'web')),
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_user_device_unique unique (user_id, device_id),
  constraint push_tokens_token_unique unique (token)
);

create index if not exists push_tokens_user_enabled_idx
  on public.push_tokens (user_id, enabled)
  where enabled = true;

-- 빌링키는 카드번호를 대신하는 결제 수단이므로 authenticated 역할에 직접 공개하지 않습니다.
-- 조회와 변경은 service_role을 사용하는 결제 Route Handler에서만 수행합니다.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  plan text not null check (plan in ('basic', 'pro')),
  customer_key text not null unique,
  billing_key text not null,
  status text not null default 'active'
    check (status in ('active', 'past_due', 'canceled')),
  amount integer not null check (amount in (4900, 9900)),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  next_billing_at timestamptz not null,
  last_payment_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_due_idx
  on public.subscriptions (status, next_billing_at)
  where status = 'active';

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  order_id text not null unique,
  payment_key text unique,
  plan text not null check (plan in ('basic', 'pro')),
  amount integer not null check (amount in (4900, 9900)),
  status text not null,
  paid_at timestamptz,
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_transactions_user_created_idx
  on public.payment_transactions (user_id, created_at desc);

-- 이미 배포된 DB에도 Basic 플랜 제약조건을 반영합니다.
alter table public.users
  drop constraint if exists users_subscription_plan_check;
alter table public.users
  add constraint users_subscription_plan_check
  check (subscription_plan in ('free', 'basic', 'pro', 'team'));

-- 결제 승인 후 구독, 거래 이력, 사용자 플랜을 하나의 DB 트랜잭션으로 기록합니다.
-- 중간 저장 실패로 결제만 승인되고 구독이 누락되는 상태를 방지합니다.
create or replace function public.record_subscription_payment(
  p_user_id uuid,
  p_plan text,
  p_customer_key text,
  p_billing_key text,
  p_amount integer,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_payment_key text,
  p_order_id text,
  p_payment_status text,
  p_paid_at timestamptz,
  p_raw_response jsonb
)
returns table (
  id uuid,
  plan text,
  amount integer,
  status text,
  current_period_end timestamptz,
  next_billing_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_subscription public.subscriptions;
begin
  if p_plan not in ('basic', 'pro')
    or (p_plan = 'basic' and p_amount <> 4900)
    or (p_plan = 'pro' and p_amount <> 9900) then
    raise exception 'Invalid subscription plan or amount';
  end if;

  insert into public.subscriptions (
    user_id,
    plan,
    customer_key,
    billing_key,
    status,
    amount,
    current_period_start,
    current_period_end,
    next_billing_at,
    last_payment_key
  )
  values (
    p_user_id,
    p_plan,
    p_customer_key,
    p_billing_key,
    'active',
    p_amount,
    p_period_start,
    p_period_end,
    p_period_end,
    p_payment_key
  )
  on conflict (user_id) do update set
    plan = excluded.plan,
    customer_key = excluded.customer_key,
    billing_key = excluded.billing_key,
    status = 'active',
    amount = excluded.amount,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    next_billing_at = excluded.next_billing_at,
    last_payment_key = excluded.last_payment_key
  returning * into saved_subscription;

  insert into public.payment_transactions (
    user_id,
    subscription_id,
    order_id,
    payment_key,
    plan,
    amount,
    status,
    paid_at,
    raw_response
  )
  values (
    p_user_id,
    saved_subscription.id,
    p_order_id,
    p_payment_key,
    p_plan,
    p_amount,
    p_payment_status,
    p_paid_at,
    coalesce(p_raw_response, '{}'::jsonb)
  )
  on conflict (order_id) do update set
    payment_key = excluded.payment_key,
    status = excluded.status,
    paid_at = excluded.paid_at,
    raw_response = excluded.raw_response;

  update public.users
  set subscription_plan = p_plan
  where public.users.id = p_user_id;

  return query
  select
    saved_subscription.id,
    saved_subscription.plan,
    saved_subscription.amount,
    saved_subscription.status,
    saved_subscription.current_period_end,
    saved_subscription.next_billing_at;
end;
$$;

revoke all on function public.record_subscription_payment(
  uuid, text, text, text, integer, timestamptz, timestamptz,
  text, text, text, timestamptz, jsonb
) from public, anon, authenticated;

grant execute on function public.record_subscription_payment(
  uuid, text, text, text, integer, timestamptz, timestamptz,
  text, text, text, timestamptz, jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- Grants
-- RLS 정책을 통과한 authenticated 사용자만 CRUD할 수 있습니다.
-- service_role은 Supabase에서 RLS를 우회하므로 서버에서만 사용해야 합니다.
-- ---------------------------------------------------------------------------

revoke all on table
  public.users,
  public.daily_plans,
  public.tasks,
  public.time_blocks,
  public.chat_logs,
  public.push_tokens,
  public.subscriptions,
  public.payment_transactions
from anon;

grant select, insert, update, delete on table
  public.users,
  public.daily_plans,
  public.tasks,
  public.time_blocks,
  public.chat_logs,
  public.push_tokens
to authenticated;

grant select, insert, update, delete on table public.push_tokens
to service_role;

revoke all on table public.subscriptions, public.payment_transactions
from authenticated;

grant select, insert, update, delete on table
  public.subscriptions,
  public.payment_transactions
to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.users force row level security;
alter table public.daily_plans enable row level security;
alter table public.daily_plans force row level security;
alter table public.tasks enable row level security;
alter table public.tasks force row level security;
alter table public.time_blocks enable row level security;
alter table public.time_blocks force row level security;
alter table public.chat_logs enable row level security;
alter table public.chat_logs force row level security;
alter table public.push_tokens enable row level security;
alter table public.push_tokens force row level security;
alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_transactions force row level security;

-- subscriptions와 payment_transactions에는 authenticated 정책을 의도적으로 만들지 않습니다.
-- service_role만 접근하여 billing_key 및 결제 이력을 브라우저에서 격리합니다.

-- users: users.id가 인증 사용자의 user_id 역할을 합니다.
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
on public.users for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own"
on public.users for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
on public.users for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "users_delete_own" on public.users;
create policy "users_delete_own"
on public.users for delete
to authenticated
using ((select auth.uid()) = id);

-- daily_plans: 직접 user_id 소유권 검사
drop policy if exists "daily_plans_select_own" on public.daily_plans;
create policy "daily_plans_select_own"
on public.daily_plans for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "daily_plans_insert_own" on public.daily_plans;
create policy "daily_plans_insert_own"
on public.daily_plans for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "daily_plans_update_own" on public.daily_plans;
create policy "daily_plans_update_own"
on public.daily_plans for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "daily_plans_delete_own" on public.daily_plans;
create policy "daily_plans_delete_own"
on public.daily_plans for delete
to authenticated
using ((select auth.uid()) = user_id);

-- tasks에는 user_id를 중복 저장하지 않고 부모 daily_plans.user_id로 검증합니다.
drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own"
on public.tasks for select
to authenticated
using (
  exists (
    select 1
    from public.daily_plans as plan
    where plan.id = tasks.daily_plan_id
      and plan.user_id = (select auth.uid())
  )
);

drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own"
on public.tasks for insert
to authenticated
with check (
  exists (
    select 1
    from public.daily_plans as plan
    where plan.id = tasks.daily_plan_id
      and plan.user_id = (select auth.uid())
  )
);

drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own"
on public.tasks for update
to authenticated
using (
  exists (
    select 1
    from public.daily_plans as plan
    where plan.id = tasks.daily_plan_id
      and plan.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.daily_plans as plan
    where plan.id = tasks.daily_plan_id
      and plan.user_id = (select auth.uid())
  )
);

drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_delete_own"
on public.tasks for delete
to authenticated
using (
  exists (
    select 1
    from public.daily_plans as plan
    where plan.id = tasks.daily_plan_id
      and plan.user_id = (select auth.uid())
  )
);

-- time_blocks도 부모 daily_plans.user_id로 소유권을 검증합니다.
drop policy if exists "time_blocks_select_own" on public.time_blocks;
create policy "time_blocks_select_own"
on public.time_blocks for select
to authenticated
using (
  exists (
    select 1
    from public.daily_plans as plan
    where plan.id = time_blocks.daily_plan_id
      and plan.user_id = (select auth.uid())
  )
);

drop policy if exists "time_blocks_insert_own" on public.time_blocks;
create policy "time_blocks_insert_own"
on public.time_blocks for insert
to authenticated
with check (
  exists (
    select 1
    from public.daily_plans as plan
    where plan.id = time_blocks.daily_plan_id
      and plan.user_id = (select auth.uid())
  )
);

drop policy if exists "time_blocks_update_own" on public.time_blocks;
create policy "time_blocks_update_own"
on public.time_blocks for update
to authenticated
using (
  exists (
    select 1
    from public.daily_plans as plan
    where plan.id = time_blocks.daily_plan_id
      and plan.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.daily_plans as plan
    where plan.id = time_blocks.daily_plan_id
      and plan.user_id = (select auth.uid())
  )
);

drop policy if exists "time_blocks_delete_own" on public.time_blocks;
create policy "time_blocks_delete_own"
on public.time_blocks for delete
to authenticated
using (
  exists (
    select 1
    from public.daily_plans as plan
    where plan.id = time_blocks.daily_plan_id
      and plan.user_id = (select auth.uid())
  )
);

-- chat_logs: 직접 user_id 소유권 검사
drop policy if exists "chat_logs_select_own" on public.chat_logs;
create policy "chat_logs_select_own"
on public.chat_logs for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "chat_logs_insert_own" on public.chat_logs;
create policy "chat_logs_insert_own"
on public.chat_logs for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "chat_logs_update_own" on public.chat_logs;
create policy "chat_logs_update_own"
on public.chat_logs for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "chat_logs_delete_own" on public.chat_logs;
create policy "chat_logs_delete_own"
on public.chat_logs for delete
to authenticated
using ((select auth.uid()) = user_id);

-- push_tokens: 각 사용자는 본인 기기의 토큰만 관리할 수 있습니다.
drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own"
on public.push_tokens for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "push_tokens_insert_own" on public.push_tokens;
create policy "push_tokens_insert_own"
on public.push_tokens for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "push_tokens_update_own" on public.push_tokens;
create policy "push_tokens_update_own"
on public.push_tokens for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "push_tokens_delete_own" on public.push_tokens;
create policy "push_tokens_delete_own"
on public.push_tokens for delete
to authenticated
using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- 변경 가능한 테이블의 updated_at을 서버 시각으로 관리합니다.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists daily_plans_set_updated_at on public.daily_plans;
create trigger daily_plans_set_updated_at
before update on public.daily_plans
for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

drop trigger if exists time_blocks_set_updated_at on public.time_blocks;
create trigger time_blocks_set_updated_at
before update on public.time_blocks
for each row execute function public.set_updated_at();

drop trigger if exists push_tokens_set_updated_at on public.push_tokens;
create trigger push_tokens_set_updated_at
before update on public.push_tokens
for each row execute function public.set_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

-- Supabase Auth 회원가입이 완료되면 public.users 프로필을 자동 생성합니다.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_persona text;
begin
  requested_persona := new.raw_user_meta_data ->> 'persona';

  insert into public.users (
    id,
    email,
    user_name,
    persona
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'user_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    case
      when requested_persona in ('student', 'worker')
        then requested_persona
      else 'student'
    end
  )
  on conflict (id) do update
  set
    email = excluded.email,
    user_name = case
      when public.users.user_name = '' then excluded.user_name
      else public.users.user_name
    end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Auth 이메일이 변경되면 공개 프로필 이메일도 동기화합니다.
create or replace function public.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users
  set email = coalesce(new.email, '')
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.sync_auth_user_email();

comment on table public.users is
  'Supabase Auth 사용자와 1:1로 연결되는 플래너 프로필';
comment on table public.daily_plans is
  '사용자별 날짜 단위 계획 및 예상·실제 시간창';
comment on table public.tasks is
  'daily_plans에 속한 체크리스트 작업';
comment on table public.time_blocks is
  'daily_plans에 속한 자동·수동 타임블록';
comment on table public.chat_logs is
  '사용자별 AI 비서 대화 이력';
comment on table public.push_tokens is
  '사용자 기기별 FCM 등록 토큰';
