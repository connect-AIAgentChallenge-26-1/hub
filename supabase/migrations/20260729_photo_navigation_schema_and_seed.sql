-- Photo Navigation: current-project compatible schema extension + initial spot seed.
-- Safe to run after the existing `photo_spots` and `photo_guides` tables exist.
-- This migration intentionally keeps `photo_guides`; do not create a parallel
-- `photo_frames` table because the current Express API already reads photo_guides.

create extension if not exists pgcrypto;

do $$ begin
  create type public.member_role as enum ('user', 'admin');
exception when duplicate_object then null;
end $$;

-- Existing table compatibility -------------------------------------------------
-- Keep previous columns such as area, place_category, place_tip, image_tone,
-- layout_json, background_guide_json, and pose_guide_json intact.

alter table public.photo_spots add column if not exists external_key text;
alter table public.photo_spots add column if not exists place_source jsonb not null default '{}'::jsonb;
alter table public.photo_spots add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Backfill old records before making the external key unique.
update public.photo_spots
set external_key = 'legacy-' || id::text
where external_key is null;

alter table public.photo_spots alter column external_key set not null;
create unique index if not exists photo_spots_external_key_key on public.photo_spots(external_key);
create index if not exists photo_spots_status_idx on public.photo_spots(status);
create index if not exists photo_spots_location_idx on public.photo_spots(latitude, longitude);

alter table public.photo_guides add column if not exists external_key text;
alter table public.photo_guides add column if not exists analysis_metadata jsonb not null default '{}'::jsonb;
alter table public.photo_guides add column if not exists like_count integer not null default 0 check (like_count >= 0);
alter table public.photo_guides add column if not exists created_by uuid references auth.users(id) on delete set null;

update public.photo_guides
set external_key = 'legacy-guide-' || id::text
where external_key is null;

alter table public.photo_guides alter column external_key set not null;
create unique index if not exists photo_guides_external_key_key on public.photo_guides(external_key);
create index if not exists photo_guides_spot_status_idx on public.photo_guides(spot_id, status);
create index if not exists photo_guides_popularity_idx on public.photo_guides(status, like_count desc);

-- Login-ready profile table. It remains unused until Naver login is added.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 40),
  role public.member_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One user can like one approved/candidate guide once.
create table if not exists public.guide_likes (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.photo_guides(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (guide_id, user_id)
);

create index if not exists guide_likes_guide_idx on public.guide_likes(guide_id);

create table if not exists public.spot_proposals (
  id uuid primary key default gen_random_uuid(),
  proposed_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  address text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  frame_type text not null check (frame_type in ('solo', 'couple')),
  note text,
  status text not null default 'candidate' check (status in ('draft', 'candidate', 'official', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proposal_images (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.spot_proposals(id) on delete cascade,
  storage_path text not null,
  sort_order smallint not null default 0 check (sort_order between 0 and 3),
  created_at timestamptz not null default now(),
  unique (proposal_id, sort_order)
);

create table if not exists public.moderation_reviews (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid references public.photo_guides(id) on delete cascade,
  proposal_id uuid references public.spot_proposals(id) on delete cascade,
  admin_id uuid not null references auth.users(id) on delete restrict,
  result text not null check (result in ('official', 'rejected')),
  note text,
  reviewed_at timestamptz not null default now(),
  check (num_nonnulls(guide_id, proposal_id) = 1)
);

-- Shared helpers ---------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_guide_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.photo_guides set like_count = like_count + 1 where id = new.guide_id;
    return new;
  end if;

  update public.photo_guides set like_count = greatest(like_count - 1, 0) where id = old.guide_id;
  return old;
end;
$$;

drop trigger if exists photo_spots_set_updated_at on public.photo_spots;
create trigger photo_spots_set_updated_at before update on public.photo_spots
for each row execute function public.set_updated_at();

drop trigger if exists photo_guides_set_updated_at on public.photo_guides;
create trigger photo_guides_set_updated_at before update on public.photo_guides
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists spot_proposals_set_updated_at on public.spot_proposals;
create trigger spot_proposals_set_updated_at before update on public.spot_proposals
for each row execute function public.set_updated_at();

drop trigger if exists guide_likes_sync_count on public.guide_likes;
create trigger guide_likes_sync_count
after insert or delete on public.guide_likes
for each row execute function public.sync_guide_like_count();

-- RLS: no client-side creation, approval, role change, or review is granted.
-- Express uses service_role server-side only and must enforce its own checks.
alter table public.profiles enable row level security;
alter table public.photo_spots enable row level security;
alter table public.photo_guides enable row level security;
alter table public.guide_likes enable row level security;
alter table public.spot_proposals enable row level security;
alter table public.proposal_images enable row level security;
alter table public.moderation_reviews enable row level security;

drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "visible spots are readable" on public.photo_spots;
create policy "visible spots are readable" on public.photo_spots
  for select to anon, authenticated using (status in ('candidate', 'official'));

drop policy if exists "visible guides are readable" on public.photo_guides;
create policy "visible guides are readable" on public.photo_guides
  for select to anon, authenticated using (status in ('candidate', 'approved'));

drop policy if exists "likes are readable for visible guides" on public.guide_likes;
create policy "likes are readable for visible guides" on public.guide_likes
  for select to anon, authenticated using (
    exists (
      select 1 from public.photo_guides guide
      where guide.id = guide_likes.guide_id
        and guide.status in ('candidate', 'approved')
    )
  );

drop policy if exists "authenticated users add only their like" on public.guide_likes;
create policy "authenticated users add only their like" on public.guide_likes
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.photo_guides guide
      where guide.id = guide_likes.guide_id
        and guide.status in ('candidate', 'approved')
    )
  );

drop policy if exists "authenticated users remove only their like" on public.guide_likes;
create policy "authenticated users remove only their like" on public.guide_likes
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "proposal author reads own proposal" on public.spot_proposals;
create policy "proposal author reads own proposal" on public.spot_proposals
  for select to authenticated using (proposed_by = auth.uid());

drop policy if exists "proposal author creates own proposal" on public.spot_proposals;
create policy "proposal author creates own proposal" on public.spot_proposals
  for insert to authenticated with check (proposed_by = auth.uid() and status = 'candidate');

drop policy if exists "proposal author reads own images" on public.proposal_images;
create policy "proposal author reads own images" on public.proposal_images
  for select to authenticated using (
    exists (
      select 1 from public.spot_proposals proposal
      where proposal.id = proposal_images.proposal_id
        and proposal.proposed_by = auth.uid()
    )
  );

-- Keep the bucket private. Express will issue signed URLs after authorization.
insert into storage.buckets (id, name, public)
values ('photo-guides', 'photo-guides', false)
on conflict (id) do nothing;

comment on column public.photo_guides.pose_guide_json is
  'YOLO Pose keypoints, person frames, and optional SAM2 outlines. Coordinates are normalized to 0..1.';
comment on column public.photo_guides.background_guide_json is
  'Administrator-approved building, stairs, or landmark lines. Coordinates are normalized to 0..1.';

-- Initial photo spots ----------------------------------------------------------
-- Existing records are preserved. Re-running this block updates coordinates and
-- metadata for the four external keys instead of creating duplicate spots.
-- This also adopts rows created by the earlier name-based seed, if it was run.
update public.photo_spots
set external_key = case name
  when 'NAVER 1784 2-3층 계단' then 'naver-1784-stairs'
  when '스파크랜드 관람차 포토존' then 'daegu-sparkland-wheel'
  when '대구근대역사관 앞' then 'daegu-modern-history-museum'
  when '대구 옥상 포토스팟 (사진 등록 예정)' then 'daegu-rooftop-pending'
  else external_key
end
where external_key like 'legacy-%'
  and name in (
    'NAVER 1784 2-3층 계단',
    '스파크랜드 관람차 포토존',
    '대구근대역사관 앞',
    '대구 옥상 포토스팟 (사진 등록 예정)'
  );

insert into public.photo_spots (
  external_key,
  name,
  area,
  description,
  place_category,
  address,
  place_tip,
  latitude,
  longitude,
  status,
  image_tone,
  place_source
)
values
  (
    'naver-1784-stairs',
    'NAVER 1784 2-3층 계단',
    '경기도 성남시 분당구',
    '곡선 계단과 유리 외벽을 배경으로 인물 구도를 연습하는 실내 포토스팟입니다.',
    '사옥 · 실내 계단',
    '경기도 성남시 분당구 정자일로 95',
    '계단 중앙의 곡선 난간과 상단 유리 외벽이 함께 보이도록 촬영합니다.',
    37.358800,
    127.105157,
    'official',
    'stage',
    '{"source":"admin_coordinate_picker","dataset":"naver-1784-stairs"}'::jsonb
  ),
  (
    'daegu-sparkland-wheel',
    '스파크랜드 관람차 포토존',
    '대구광역시 중구',
    '붉은 관람차와 하늘을 세로 구도로 담는 야외 포토스팟입니다.',
    '관광 · 전망 · 포토존',
    '대구광역시 중구 동성로6길 61',
    '관람차 원형과 곤돌라가 프레임 안에 충분히 들어오도록 촬영합니다.',
    35.868700,
    128.598768,
    'official',
    'stage',
    '{"source":"admin_coordinate_picker","dataset":"daegu-sparkland-wheel"}'::jsonb
  ),
  (
    'daegu-modern-history-museum',
    '대구근대역사관 앞',
    '대구광역시 중구',
    '근대 건축물 정면을 배경으로 전신 또는 셀카 구도를 촬영하는 포토스팟입니다.',
    '문화 · 역사 · 건축',
    '대구광역시 중구 경상감영길 67',
    '도로 반대편에서 건물의 모서리와 정면이 함께 보이도록 촬영합니다.',
    35.871467,
    128.590909,
    'official',
    'plaza',
    '{"source":"admin_coordinate_picker","dataset":"daegu-modern-history-museum"}'::jsonb
  ),
  (
    'daegu-rooftop-pending',
    '대구 옥상 포토스팟 (사진 등록 예정)',
    '대구광역시',
    '옥상에서 도시 풍경을 배경으로 촬영할 후보 포토스팟입니다. 예시 사진과 프레임 등록 전 단계입니다.',
    '후보 · 옥상 · 전망',
    '촬영 지점 좌표로 등록',
    '예시 사진, 배경선, 인물 프레임을 검수한 뒤 공식 포토스팟으로 전환합니다.',
    35.894076,
    128.605574,
    'candidate',
    'plaza',
    '{"source":"admin_coordinate_picker","dataset":null}'::jsonb
  )
on conflict (external_key) do update
set
  name = excluded.name,
  area = excluded.area,
  description = excluded.description,
  place_category = excluded.place_category,
  address = excluded.address,
  place_tip = excluded.place_tip,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  status = excluded.status,
  image_tone = excluded.image_tone,
  place_source = excluded.place_source,
  updated_at = now();

select id, external_key, name, latitude, longitude, status
from public.photo_spots
where external_key in (
  'naver-1784-stairs',
  'daegu-sparkland-wheel',
  'daegu-modern-history-museum',
  'daegu-rooftop-pending'
)
order by external_key;
