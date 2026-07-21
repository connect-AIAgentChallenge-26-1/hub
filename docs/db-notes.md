# db-notes.md — 연구결과 DB 정리 · 쿼리 학습 노트

> 목적: 연구 저장 테이블(`research_results`)의 구조·의미·쿼리를 한 곳에 정리해, DB 기본(table/query/RLS)을 학습하며 이해한다. 스키마 원본은 [backend/db/schema.sql](../backend/db/schema.sql), 연동 절차는 [supabase-setup.md](./supabase-setup.md), 원칙은 ADR-001(비식별)·ADR-002(저장소).

## 1. 테이블 한 장 요약

`public.research_results` — 앱이 만든 **비식별 파생값만** 담는 단일 테이블. 이름·자유응답·PII 컬럼은 없다. 식별은 브라우저가 만든 가명 `anon_id` 하나뿐(계정·로그인과 무관).

| 그룹 | 컬럼 | 타입 | 의미 |
|---|---|---|---|
| 키 | `id` | uuid (PK) | 행 고유 ID(자동 생성) |
| 식별(가명) | `anon_id` | text | 브라우저 생성 가명. PII 아님. 조회·삭제 기준 |
| 평가 | `mbti` | text | 사용자가 입력한 공식 결과 or null |
| 평가 | `temperament` | text | 기질코드(SJ/SP/NT/NF) 파생값 |
| 결정 | `matched_methods` | jsonb | MBTI 힌트 포함 TOP 방법 id[] |
| 결정 | `baseline_methods` | jsonb | task/state baseline 방법 id[] |
| 결정 | `algorithm_version` | text | 추천 알고리즘 버전 |
| 맥락 | `task_type` | text | memorize / understand / practice |
| 맥락 | `deadline` | text | today / thisWeek / flexible |
| 맥락 | `available_minutes` | integer | 가용시간(분) |
| 수용지표 | `fit_score`·`understanding`·`actionability`·`focus`·`fatigue` | integer | 1..5 자기평가 |
| 수용지표 | `calibration_error` | integer | \|예측−실제\| 회상 보정오차 |
| 시간 | `created_at` | timestamptz | 생성 시각(기본 now()) |

> **간이 MBTI 추정 채팅(ADR-008) 원문은 이 테이블에 저장하지 않는다.** 채팅 경로(`/api/mbti-chat`)는 저장소를 호출하지 않는다 — 연구 저장 경로와 분리.

## 2. 기본 쿼리 학습 (Supabase SQL Editor에서 실행)

```sql
-- (a) 최근 저장 10건 보기
select id, anon_id, temperament, fit_score, created_at
from research_results
order by created_at desc
limit 10;

-- (b) 특정 가명의 기록만(앱의 "내 기록 보기"와 같은 필터)
select * from research_results
where anon_id = '<브라우저 anon_id>'
order by created_at desc;

-- (c) 기질별 분포(집계 — GROUP BY)
select temperament, count(*) as n
from research_results
group by temperament
order by n desc;

-- (d) 평균 적합도·평균 보정오차(수용지표 요약)
select
  round(avg(fit_score), 2)        as avg_fit,
  round(avg(calibration_error), 2) as avg_calibration_error,
  count(*)                         as n
from research_results
where fit_score > 0;

-- (e) MBTI 힌트가 baseline과 달라진 비율(매칭 추가효과 관찰)
select
  count(*) filter (where matched_methods::text <> baseline_methods::text) as differs,
  count(*)                                                                as total
from research_results;
```

- `where`(필터) → `order by`(정렬) → `limit`(개수) → `group by`+집계함수(`count`/`avg`) 순으로 익히면 백엔드 `analyze()`(`backend/src/index.js`)가 코드로 하는 일을 SQL로 재현하는 셈이다.
- `jsonb` 컬럼(`matched_methods`)은 `::text` 캐스팅으로 단순 비교하거나, 심화 시 `jsonb_array_elements`로 펼칠 수 있다.

## 3. 접근 제어(RLS·GRANT) 개념

- **RLS(Row Level Security) 활성**: 정책을 추가하지 않았으므로 `service_role` 외 모든 접근이 기본 거부된다(의도된 최소 노출).
- **GRANT 별도 계층**: RLS와 별개로 `grant all ... to service_role`이 없으면 service_role도 403을 받는다(연동 중 실제로 겪어 `schema.sql`에 명시됨).
- 백엔드는 **service_role 키**로만 접근하고, 프런트는 서버(`/api/*`)를 통해서만 접근한다 — 프런트에 어떤 Supabase 키도 노출하지 않는다.

## 4. 개선 제안 (설계만 — 적용은 사용자가 대시보드에서)

> 지금 코드로 바꾸지 않는다. 필요 시 사용자가 Supabase SQL Editor에서 검토 후 실행.

- **집계 성능:** 대시보드성 조회가 잦아지면 `created_at` 인덱스 추가 검토(`create index ... on research_results (created_at desc)`).
- **읽기 편의:** 기질별 요약을 자주 본다면 뷰(`create view research_summary as select ...`) 고려. 원본 테이블 스키마는 불변 유지.
- **보존정책:** 파일럿 종료 후 오래된 행 정리 기준(예: N개월) 문서화 — 삭제권(ADR-006)과 별개의 운영 정책.

관련: [supabase-setup.md](./supabase-setup.md) · [evidence-data-roadmap.md](./evidence-data-roadmap.md) §8 · [decisions.md](./decisions.md) ADR-001/002/006.
