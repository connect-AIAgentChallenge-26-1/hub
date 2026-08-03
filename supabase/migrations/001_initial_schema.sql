-- 지금리뷰 초기 데이터베이스 구조
-- 별점은 사용하지 않으며, 인증된 영수증만 리뷰로 연결할 수 있다.

create type public.receipt_status as enum ('pending', 'verified', 'rejected');
create type public.sentiment_bucket as enum (
  'very_positive',
  'positive',
  'neutral',
  'negative',
  'very_negative'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  kakao_place_id text not null unique,
  name text not null,
  category text,
  address text,
  road_address text,
  latitude double precision not null,
  longitude double precision not null,
  phone text,
  kakao_place_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  storage_path text not null,
  image_hash text not null unique,
  approval_number_hash text,
  merchant_name text,
  paid_at timestamptz,
  status public.receipt_status not null default 'pending',
  rejection_reason text,
  ocr_result jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verified_receipt_fields check (
    status <> 'verified'
    or (merchant_name is not null and paid_at is not null and verified_at is not null)
  )
);

create unique index receipts_approval_duplicate_idx
  on public.receipts (place_id, approval_number_hash, paid_at)
  where approval_number_hash is not null and paid_at is not null;

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  receipt_id uuid not null unique references public.receipts(id) on delete restrict,
  content text not null check (char_length(btrim(content)) between 10 and 1000),
  sentiment_score numeric(5, 4) check (sentiment_score between -1 and 1),
  sentiment_bucket public.sentiment_bucket,
  sentiment_keywords jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.review_likes (
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

create index reviews_place_created_idx on public.reviews (place_id, created_at desc);
create index reviews_user_created_idx on public.reviews (user_id, created_at desc);
create index review_likes_review_idx on public.review_likes (review_id);
create index receipts_user_created_idx on public.receipts (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger places_set_updated_at
before update on public.places
for each row execute function public.set_updated_at();

create trigger receipts_set_updated_at
before update on public.receipts
for each row execute function public.set_updated_at();

create trigger reviews_set_updated_at
before update on public.reviews
for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), '지금리뷰 사용자')
  );
  return new;
end;
$$;

create trigger auth_user_created_profile
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create or replace function public.validate_verified_receipt_review()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  receipt_record public.receipts%rowtype;
begin
  if tg_op = 'UPDATE'
     and new.receipt_id = old.receipt_id
     and new.user_id = old.user_id
     and new.place_id = old.place_id then
    return new;
  end if;

  select * into receipt_record
  from public.receipts
  where id = new.receipt_id;

  if not found then
    raise exception '영수증 정보를 찾을 수 없습니다.';
  end if;

  if receipt_record.status <> 'verified' then
    raise exception '인증이 완료된 영수증만 리뷰에 사용할 수 있습니다.';
  end if;

  if receipt_record.user_id <> new.user_id then
    raise exception '영수증 소유자와 리뷰 작성자가 일치하지 않습니다.';
  end if;

  if receipt_record.place_id <> new.place_id then
    raise exception '영수증 업체와 리뷰 업체가 일치하지 않습니다.';
  end if;

  if receipt_record.paid_at < now() - interval '30 days'
     or receipt_record.paid_at > now() + interval '1 day' then
    raise exception '결제일이 30일 이내인 영수증만 사용할 수 있습니다.';
  end if;

  new.created_at = now();
  return new;
end;
$$;

create trigger reviews_require_verified_receipt
before insert or update of receipt_id, user_id, place_id on public.reviews
for each row execute function public.validate_verified_receipt_review();

alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.receipts enable row level security;
alter table public.reviews enable row level security;
alter table public.review_likes enable row level security;

-- 브라우저에서는 DB 테이블을 직접 수정하지 않고 Express API를 사용한다.
-- Secret Key를 사용하는 서버 역할에만 명시적으로 테이블 권한을 부여한다.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.places from anon, authenticated;
revoke all on table public.receipts from anon, authenticated;
revoke all on table public.reviews from anon, authenticated;
revoke all on table public.review_likes from anon, authenticated;

grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.places to service_role;
grant select, insert, update, delete on table public.receipts to service_role;
grant select, insert, update, delete on table public.reviews to service_role;
grant select, insert, update, delete on table public.review_likes to service_role;
