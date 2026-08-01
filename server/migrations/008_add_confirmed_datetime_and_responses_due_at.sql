-- 캘린더(.ics) 내보내기와 응답 마감일 배너 — 작업지시 2026-08-01 폴리싱 작업 5
-- confirmed_slot_id/candidate_slots는 자유 텍스트 label이라 실제 날짜가 없어 별도 컬럼으로 받는다.
-- Supabase 대시보드 SQL Editor에서 실행

alter table letters add column confirmed_datetime timestamptz;
alter table letters add column responses_due_at timestamptz;
