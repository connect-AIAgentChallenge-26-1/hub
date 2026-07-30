-- Superseded by ../migrations/20260729_photo_navigation_schema_and_seed.sql.
-- Keep this file only as the original small seed reference. Do not run both files.

insert into public.photo_spots (
  name,
  area,
  description,
  place_category,
  address,
  place_tip,
  latitude,
  longitude,
  status,
  image_tone
)
select *
from (
  values
    (
      'NAVER 1784 2-3층 계단',
      '경기도 성남시 분당구',
      '곡선 계단과 유리 외벽을 배경으로 인물 구도를 연습하는 실내 포토스팟입니다.',
      '사옥 · 실내 계단',
      '경기도 성남시 분당구 정자일로 95',
      '계단 중앙의 곡선 난간과 상단 유리 외벽이 함께 보이도록 촬영합니다.',
      37.358800,
      127.105157,
      'official',
      'stage'
    ),
    (
      '스파크랜드 관람차 포토존',
      '대구광역시 중구',
      '붉은 관람차와 하늘을 세로 구도로 담는 야외 포토스팟입니다.',
      '관광 · 전망 · 포토존',
      '대구광역시 중구 동성로6길 61',
      '관람차 원형과 곤돌라가 프레임 안에 충분히 들어오도록 촬영합니다.',
      35.868700,
      128.598768,
      'official',
      'stage'
    ),
    (
      '대구근대역사관 앞',
      '대구광역시 중구',
      '근대 건축물 정면을 배경으로 전신 또는 셀카 구도를 촬영하는 포토스팟입니다.',
      '문화 · 역사 · 건축',
      '대구광역시 중구 경상감영길 67',
      '도로 반대편에서 건물의 모서리와 정면이 함께 보이도록 촬영합니다.',
      35.871467,
      128.590909,
      'official',
      'plaza'
    )
) as seed (
  name,
  area,
  description,
  place_category,
  address,
  place_tip,
  latitude,
  longitude,
  status,
  image_tone
)
where not exists (
  select 1
  from public.photo_spots existing
  where existing.name = seed.name
);

-- Verify the inserted records.
select id, name, latitude, longitude, status
from public.photo_spots
where name in (
  'NAVER 1784 2-3층 계단',
  '스파크랜드 관람차 포토존',
  '대구근대역사관 앞'
)
order by created_at;
