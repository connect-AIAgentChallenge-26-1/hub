// 날짜 유틸 — 다음 납부일 계산, D-day 계산 (테스트 대상: QA 4단계)

/** 특정 연·월과 dueDay로 실제 납부 Date를 만든다. 말일 초과 시 그 달 말일로 보정 */
export function dueDateFor(year: number, month: number, dueDay: number): Date {
  const lastDay = new Date(year, month, 0).getDate(); // month는 1-based
  const day = Math.min(dueDay, lastDay);
  return new Date(year, month - 1, day);
}

/**
 * 기준일(today) 이후 가장 가까운 dueDay의 납부일을 반환.
 * 이번 달 dueDay가 아직 안 지났으면 이번 달, 지났으면 다음 달.
 */
export function nextDueDate(dueDay: number, today = new Date()): Date {
  const y = today.getFullYear();
  const m = today.getMonth() + 1; // 1-based
  const thisMonth = dueDateFor(y, m, dueDay);
  // 시간 요소 제거 비교
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (thisMonth >= t0) return thisMonth;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return dueDateFor(nextY, nextM, dueDay);
}

/** 오늘 기준 남은 일수(D-day). 오늘이면 0, 지났으면 음수 */
export function daysUntil(date: Date, today = new Date()): number {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

/** D-day 라벨: D-DAY / D-3 / D+2 */
export function ddayLabel(date: Date, today = new Date()): string {
  const d = daysUntil(date, today);
  if (d === 0) return "D-DAY";
  return d > 0 ? `D-${d}` : `D+${-d}`;
}

export function formatWon(n: number | null | undefined): string {
  if (n === null || n === undefined) return "미정";
  return "₩" + n.toLocaleString("ko-KR");
}
