-- 리뷰 감성 분석의 처리 상태와 재현 정보를 저장한다.
create type public.review_analysis_status as enum ('pending', 'completed', 'failed');

alter table public.reviews
  add column analysis_status public.review_analysis_status not null default 'pending',
  add column analysis_confidence numeric(5, 4) check (analysis_confidence between 0 and 1),
  add column analysis_model text,
  add column analysis_version text not null default 'v1',
  add column analyzed_at timestamptz,
  add column analysis_error text;

alter table public.reviews
  add constraint completed_review_analysis_fields check (
    analysis_status <> 'completed'
    or (
      sentiment_bucket is not null
      and sentiment_score is not null
      and analysis_confidence is not null
      and analysis_model is not null
      and analyzed_at is not null
    )
  );

create index reviews_place_sentiment_idx
  on public.reviews (place_id, sentiment_bucket)
  where analysis_status = 'completed';
