-- 결(結) 앱 데이터 스키마 (Postgres)
--
-- 식별: 로그인 없이 기기별 device_id(UUID). 실제 인증(이메일/OAuth)은 나중에
--       profiles.device_id 를 user_id 로 매핑하는 식으로 얹을 수 있다.
-- 지금 localStorage(uncoach-...)에 있던 profile/history/assets/customSits 를 옮긴다.

create table if not exists profiles (
  device_id   text primary key,
  role        text,                 -- 온보딩 역할(대학생/사회초년생 등)
  goal        text,                 -- 온보딩 목표
  updated_at  timestamptz not null default now()
);

-- 훈련 세션 기록(궤적). 점수는 1~5 척도의 세 축.
create table if not exists sessions (
  id           bigserial primary key,
  device_id    text not null references profiles(device_id) on delete cascade,
  situation_id text not null,
  context      smallint,            -- 맥락·의도 1~5
  register     smallint,            -- 관계·격식 1~5
  strategy     smallint,            -- 전략·표현 1~5
  total        smallint,            -- 총점 0~100
  created_at   timestamptz not null default now()
);
create index if not exists sessions_device_idx on sessions (device_id, created_at desc);

-- 표현 자산집(스스로 완성한 좋은 표현만 저장).
create table if not exists assets (
  id           bigserial primary key,
  device_id    text not null references profiles(device_id) on delete cascade,
  text         text not null,
  situation_id text,
  created_at   timestamptz not null default now()
);
create index if not exists assets_device_idx on assets (device_id, created_at desc);

-- 사용자가 만든 커스텀 상황(AI 생성 rubric 포함).
create table if not exists custom_situations (
  id           text primary key,    -- 클라이언트 생성 id (예: 'c'+timestamp)
  device_id    text not null references profiles(device_id) on delete cascade,
  title        text not null,
  rel          text,
  counterpart  text,
  goal         text,
  tension      text,
  direction    text,
  axis         text,
  sample       text,
  opener       text,
  rubric       jsonb,               -- {context:[3], register:[3], strategy:[3]}
  created_at   timestamptz not null default now()
);
create index if not exists custom_sit_device_idx on custom_situations (device_id, created_at desc);

-- 프로토타입 브리지용: localStorage 전체 blob을 device별로 1:1 미러링.
-- (자체 런타임 프로토타입은 blob 저장 모델이라 세분 테이블 대신 이걸 쓴다.
--  React 재구현은 위 세분 테이블 + /api/data 세분 action을 쓰면 된다.)
create table if not exists app_state (
  device_id  text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
