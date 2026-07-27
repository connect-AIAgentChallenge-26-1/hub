create table if not exists public.assistant_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  payload_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists assistant_messages_session_id_id_idx
  on public.assistant_messages (session_id, id desc);

alter table public.assistant_messages enable row level security;

revoke all on table public.assistant_messages from anon, authenticated;
grant select, insert on table public.assistant_messages to service_role;
grant usage, select on sequence public.assistant_messages_id_seq to service_role;

comment on table public.assistant_messages is
  'Server-only planner assistant conversation and payload storage.';

create table if not exists public.planner_states (
  session_id uuid primary key,
  state_json jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.planner_states enable row level security;

revoke all on table public.planner_states from anon, authenticated;
grant select, insert, update, delete on table public.planner_states to service_role;

comment on table public.planner_states is
  'Server-only latest planner state for each anonymous browser session.';
