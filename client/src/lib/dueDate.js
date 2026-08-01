// 응답 마감일(responses_due_at)까지 남은 일수 — 마감일이 없으면 null.
export function daysUntilDue(dueAt) {
  if (!dueAt) return null
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.ceil((new Date(dueAt).getTime() - Date.now()) / msPerDay)
}
