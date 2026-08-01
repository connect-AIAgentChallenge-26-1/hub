// 확정된 모임을 캘린더 앱에 추가할 수 있는 .ics(iCalendar) 파일을 만든다.
// 서버 없이 클라이언트에서 바로 생성 — RFC 5545 최소 형식만 사용한다.

function toIcsDate(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function escapeIcsText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

export function buildIcsContent({ uid, title, description, location, start, durationHours = 2 }) {
  const startDate = new Date(start)
  const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Letter&Co//KO',
    'BEGIN:VEVENT',
    `UID:${uid}@letterandco.app`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(startDate)}`,
    `DTEND:${toIcsDate(endDate)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    location ? `LOCATION:${escapeIcsText(location)}` : null,
    description ? `DESCRIPTION:${escapeIcsText(description)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  return lines.join('\r\n')
}

export function downloadIcs(filename, content) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
