export function getDaysUntil(examDate, today = new Date()) {
  if (!examDate) {
    return null;
  }

  const target = new Date(`${examDate}T00:00:00`);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffMs = target.getTime() - base.getTime();

  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function formatDday(daysUntil) {
  if (daysUntil === null) {
    return "";
  }

  if (daysUntil === 0) {
    return "D-day";
  }

  if (daysUntil < 0) {
    return `D+${Math.abs(daysUntil)}`;
  }

  return `D-${daysUntil}`;
}
