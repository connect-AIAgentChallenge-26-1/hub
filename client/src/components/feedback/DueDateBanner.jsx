import { daysUntilDue } from '../../lib/dueDate.js'

// 응답 마감일이 가까워지면(3일 이내) 조용히 알려주는 배너.
// 마감을 이미 지났거나 이미 닫힌 모임에는 표시하지 않는다 — "지연" 강조 금지 규칙(§금지).
export function DueDateBanner({ dueAt, closed }) {
  if (!dueAt || closed) return null
  const days = daysUntilDue(dueAt)
  if (days === null || days < 0 || days > 3) return null

  return (
    <div
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--wedgwood-pale)',
        borderRadius: 'var(--radius-lg)',
        padding: '12px 16px',
        fontFamily: 'var(--font-body)',
        fontSize: '13px',
        color: 'var(--ink-soft)',
      }}
    >
      {days === 0 ? '오늘 응답이 마감돼요' : `${days}일 후 응답이 마감돼요`}
    </div>
  )
}
