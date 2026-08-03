-- OCR API 연결 전 영수증 원본 저장과 처리 이력 기록을 위한 준비 작업
alter table public.receipts
  add column if not exists file_mime_type text,
  add column if not exists file_size integer,
  add column if not exists ocr_provider text,
  add column if not exists ocr_request_id text,
  add column if not exists ocr_requested_at timestamptz;

alter table public.receipts
  add constraint receipts_file_size_limit
  check (file_size is null or file_size between 1 and 10485760);

create unique index if not exists receipts_ocr_request_idx
  on public.receipts (ocr_provider, ocr_request_id)
  where ocr_provider is not null and ocr_request_id is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipt-images',
  'receipt-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 브라우저 직접 접근 정책은 만들지 않는다. Express의 service role만 원본을 다룬다.
