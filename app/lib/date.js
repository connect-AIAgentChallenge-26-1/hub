// 리뷰 발견(T23/T26): `toISOString().slice(0, 10)`는 UTC 기준 날짜라서, 한국 시간 자정~오전
// 9시(UTC로는 전날 15:00~23:59)에는 실제 한국 날짜보다 하루 이전 값이 나온다. 서버 실행 환경의
// 타임존(Vercel은 기본 UTC)과 무관하게 항상 한국 시간(KST, UTC+9) 기준 날짜를 반환한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function kstDateString(date = new Date()) {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}
