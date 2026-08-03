-- 로그인 사용자가 관심 장소를 저장하고 다시 조회한다.

create table public.saved_places (
  user_id uuid not null references public.profiles(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create index saved_places_user_created_idx
  on public.saved_places (user_id, created_at desc);

alter table public.saved_places enable row level security;

-- 브라우저에서 테이블을 직접 수정하지 않고 Express API를 사용한다.
revoke all on table public.saved_places from anon, authenticated;
grant select, insert, delete on table public.saved_places to service_role;

