import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/decor/Icon.jsx'
import { Chip } from '../../components/forms/Chip.jsx'
import { EmptyState } from '../../components/feedback/EmptyState.jsx'
import { SidebarNav } from '../../components/layout/SidebarNav.jsx'
import { getLetterByToken, getResponses, getRoles } from '../../lib/api.js'
import bgVineWash from '../../assets/bg-vine-wash.jpg'
import laceTrimStrip from '../../assets/vintage-lace-trim-strip.png'

// 공통 · 알림함(Notifications) — docs/design 「Letter&Co Design System.zip」
// templates/notifications/Notifications.dc.html 이식. 별도 알림 테이블 없이 기존 데이터
// (참여자 응답 제출, 역할 배정, 모임 확정)의 타임스탬프에서 이벤트를 파생해 보여준다.
// 역할 배정 시점은 roles.created_at으로 근사(재배정 시각은 별도로 기록하지 않음).
const ACTIVE_NAV_KEY = 'notifications'

const FILTER_DEFS = [
  { key: 'all', label: '전체' },
  { key: 'confirm', label: '확정' },
  { key: 'role', label: '역할' },
  { key: 'invite', label: '초대' },
]

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 60) return `${Math.max(1, minutes)}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days === 1) return '어제'
  return `${days}일 전`
}

export function Notifications() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [loadStatus, setLoadStatus] = useState('loading') // loading | error | ready
  const [errorMsg, setErrorMsg] = useState('')
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setLoadStatus('error')
      setErrorMsg('모임 링크가 올바르지 않아요')
      return
    }
    Promise.all([getLetterByToken(token), getResponses(token), getRoles(token)]).then(([letterResult, responsesResult, rolesResult]) => {
      if (cancelled) return
      if (letterResult.error) {
        setLoadStatus('error')
        setErrorMsg(letterResult.error)
        return
      }
      if (responsesResult.error) {
        setLoadStatus('error')
        setErrorMsg(responsesResult.error)
        return
      }
      if (rolesResult.error) {
        setLoadStatus('error')
        setErrorMsg(rolesResult.error)
        return
      }

      const derived = []
      for (const p of responsesResult.data ?? []) {
        if (p.responses?.created_at) {
          derived.push({ id: `invite-${p.id}`, icon: 'envelope', type: 'invite', text: `${p.name}님이 참가 정보를 보냈어요`, time: p.responses.created_at })
        }
      }
      for (const r of rolesResult.data ?? []) {
        if (r.assignee_id) {
          const assignee = (responsesResult.data ?? []).find((p) => p.id === r.assignee_id)
          derived.push({
            id: `role-${r.id}`,
            icon: 'leaf',
            type: 'role',
            text: `${r.name} 역할에 ${assignee?.name ?? '누군가'}님이 배정됐어요`,
            time: r.created_at,
          })
        }
      }
      if (letterResult.data.confirmed_at) {
        derived.push({ id: 'confirm', icon: 'check', type: 'confirm', text: '모임 일정이 확정됐어요', time: letterResult.data.confirmed_at })
      }
      derived.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

      setItems(derived)
      setLoadStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [token])

  const visible = filter === 'all' ? items : items.filter((n) => n.type === filter)
  const filters = FILTER_DEFS.map((d) => ({ ...d, active: filter === d.key, tone: filter === d.key ? 'wedgwood' : 'lemon' }))

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: `var(--paper) url(${bgVineWash}) center top / cover no-repeat`,
        fontFamily: 'var(--font-body)',
        color: 'var(--ink)',
        position: 'relative',
      }}
    >
      <SidebarNav activeKey={ACTIVE_NAV_KEY} token={token} />

      <div
        aria-hidden="true"
        className="lco-lace-strip"
        style={{
          width: '140px',
          flexShrink: 0,
          background: `url(${laceTrimStrip}) repeat-y center / 140px auto`,
          marginLeft: '-70px',
          marginRight: '-70px',
          position: 'sticky',
          top: 0,
          height: '100vh',
          alignSelf: 'flex-start',
          zIndex: 5,
          pointerEvents: 'none',
        }}
      />

      <main className="lco-main" style={{ flex: 1, padding: '40px', boxSizing: 'border-box', maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-script)', fontWeight: 700, fontSize: 'var(--text-script-lg)', color: 'oklch(0.995 0.006 165)', lineHeight: 1.2 }}>Notes</div>
          <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-h2)', color: 'var(--ink)', margin: '4px 0 0', fontWeight: 700 }}>알림함</h2>
        </div>

        {loadStatus === 'loading' ? (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body-size)', color: 'var(--text-caption)' }}>불러오는 중…</div>
        ) : null}

        {loadStatus === 'error' ? (
          <div
            style={{
              background: 'var(--surface-raised)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-fold)',
              padding: '24px',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-body-size)',
              color: 'var(--ink-soft)',
            }}
          >
            {errorMsg}
          </div>
        ) : null}

        {loadStatus === 'ready' ? (
          <>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {filters.map((f) => (
                <Chip key={f.key} tone={f.tone} sticker={f.active} onClick={() => setFilter(f.key)}>
                  {f.label}
                </Chip>
              ))}
            </div>

            {visible.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {visible.map((n) => (
                  <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', background: 'var(--cream)', border: '1px solid var(--line)', borderRadius: '10px', padding: '16px', boxSizing: 'border-box' }}>
                    <Icon name={n.icon} size={24} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--ink)' }}>{n.text}</div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--ink-soft)', marginTop: '4px' }}>{relativeTime(n.time)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="아직 알림이 없어요, 조율이 시작되면 소식을 모아드릴게요" />
            )}
          </>
        ) : null}
      </main>

      <div style={{ position: 'fixed', right: '14px', bottom: '14px', fontFamily: "'Signatie', var(--font-script)", fontSize: '13px', color: 'var(--wedgwood-deep)', opacity: 0.5, pointerEvents: 'none', zIndex: 50 }}>
        l
      </div>
    </div>
  )
}
