-- Photo Navigation: spots, frames, guides, participation, and moderation.
-- Apply in the Supabase SQL Editor or through \`supabase db push\`.

create extension if not exists pgcrypto;

do $$ begin
  create type public.member_role as enum ('user', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.content_status as enum ('draft', 'candidate', 'official', 'rejected');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 40),
  role public.member_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.photo_spots (
  id uuid primary key default gen_random_uuid(),
  external_key text not null unique check (external_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  address text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  description text,
  status public.content_status not null default 'draft',
  place_source jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists photo_spots_status_idx on public.photo_spots(status);
create index if not exists photo_spots_location_idx on public.photo_spots(latitude, longitude);

create table if not exists public.photo_frames (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.photo_spots(id) on delete cascade,
  external_key text not null unique check (external_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null,
  frame_type text not null check (frame_type in ('solo', 'couple')),
  shooting_tip text,
  reference_image_path text not null,
  overlay_image_path text not null,
  pose_guide_json jsonb not null default '{}'::jsonb,
  background_guide_json jsonb not null default '{"backgroundLines": []}'::jsonb,
  analysis_metadata jsonb not null default '{}'::jsonb,
  status public.content_status not null default 'draft',
  like_count integer not null default 0 check (like_count >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (spot_id, title)
);

create index if not exists photo_frames_spot_status_idx on public.photo_frames(spot_id, status);
create index if not exists photo_frames_popularity_idx on public.photo_frames(status, like_count desc);

-- The app reads this view as the approved, combined comparison contract.
-- Source artifacts stay separate so a background line can be corrected
-- without regenerating the YOLO Pose + SAM2 result.
create or replace view public.photo_frame_guides
with (security_invoker = true) as
select
  frame.*,
  coalesce(frame.pose_guide_json, '{}'::jsonb)
    || jsonb_build_object(
      'backgroundLines', coalesce(frame.background_guide_json -> 'backgroundLines', '[]'::jsonb),
      'backgroundGuideVersion', frame.background_guide_json -> 'version'
    ) as guide_json
from public.photo_frames frame;

create table if not exists public.frame_likes (
  id uuid primary key default gen_random_uuid(),
  frame_id uuid not null references public.photo_frames(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (frame_id, user_id)
);

create index if not exists frame_likes_frame_idx on public.frame_likes(frame_id);

create table if not exists public.spot_proposals (
  id uuid primary key default gen_random_uuid(),
  proposed_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  address text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  frame_type text not null check (frame_type in ('solo', 'couple')),
  note text,
  status public.content_status not null default 'candidate',
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
  frame_id uuid references public.photo_frames(id) on delete cascade,
  proposal_id uuid references public.spot_proposals(id) on delete cascade,
  admin_id uuid not null references auth.users(id) on delete restrict,
  result public.content_status not null check (result in ('official', 'rejected')),
  note text,
  reviewed_at timestamptz not null default now(),
  check (num_nonnulls(frame_id, proposal_id) = 1)
);

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

create or replace function public.sync_photo_frame_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.photo_frames set like_count = like_count + 1 where id = new.frame_id;
    return new;
  end if;

  update public.photo_frames set like_count = greatest(like_count - 1, 0) where id = old.frame_id;
  return old;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists photo_spots_set_updated_at on public.photo_spots;
create trigger photo_spots_set_updated_at before update on public.photo_spots
for each row execute function public.set_updated_at();

drop trigger if exists photo_frames_set_updated_at on public.photo_frames;
create trigger photo_frames_set_updated_at before update on public.photo_frames
for each row execute function public.set_updated_at();

drop trigger if exists spot_proposals_set_updated_at on public.spot_proposals;
create trigger spot_proposals_set_updated_at before update on public.spot_proposals
for each row execute function public.set_updated_at();

drop trigger if exists frame_likes_sync_count on public.frame_likes;
create trigger frame_likes_sync_count
after insert or delete on public.frame_likes
for each row execute function public.sync_photo_frame_like_count();

alter table public.profiles enable row level security;
alter table public.photo_spots enable row level security;
alter table public.photo_frames enable row level security;
alter table public.frame_likes enable row level security;
alter table public.spot_proposals enable row level security;
alter table public.proposal_images enable row level security;
alter table public.moderation_reviews enable row level security;

-- Public reads are restricted to currently visible official and candidate content.
create policy "profiles read own" on public.profiles
  for select to authenticated using (id = auth.uid());

create policy "visible spots are readable" on public.photo_spots
  for select to anon, authenticated using (status in ('candidate', 'official'));

create policy "visible frames are readable" on public.photo_frames
  for select to anon, authenticated using (status in ('candidate', 'official'));

create policy "likes are readable for visible frames" on public.frame_likes
  for select to anon, authenticated using (
    exists (select 1 from public.photo_frames frame where frame.id = frame_likes.frame_id and frame.status in ('candidate', 'official'))
  );

create policy "authenticated users add only their like" on public.frame_likes
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.photo_frames frame
      where frame.id = frame_likes.frame_id
        and frame.status in ('candidate', 'official')
    )
  );

create policy "authenticated users remove only their like" on public.frame_likes
  for delete to authenticated using (user_id = auth.uid());

create policy "proposal author reads own proposal" on public.spot_proposals
  for select to authenticated using (proposed_by = auth.uid());

create policy "proposal author creates own proposal" on public.spot_proposals
  for insert to authenticated with check (proposed_by = auth.uid() and status = 'candidate');

create policy "proposal author reads own images" on public.proposal_images
  for select to authenticated using (
    exists (select 1 from public.spot_proposals proposal where proposal.id = proposal_images.proposal_id and proposal.proposed_by = auth.uid())
  );

-- No client policy is granted for spot/frame creation, approval, role changes, or reviews.
-- Those writes are deliberately limited to Express with SUPABASE_SERVICE_ROLE_KEY.

insert into storage.buckets (id, name, public)
values ('photo-guides', 'photo-guides', true)
on conflict (id) do update set public = excluded.public;

create policy "public reads guide assets" on storage.objects
  for select to anon, authenticated using (bucket_id = 'photo-guides');

-- Direct Storage uploads are deliberately denied. The server creates signed uploads
-- after checking the authenticated user and the allowed proposal/frame path.

comment on column public.photo_frames.pose_guide_json is
  'YOLO Pose keypoints, person frames, and optional SAM2 outlines. Coordinates are normalized to 0..1.';
comment on column public.photo_frames.background_guide_json is
  'Administrator-approved building, stairs, or landmark lines. Coordinates are normalized to 0..1.';
