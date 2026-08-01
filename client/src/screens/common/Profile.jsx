import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar } from '../../components/identity/Avatar.jsx'
import { Icon } from '../../components/decor/Icon.jsx'
import { InfoCard } from '../../components/cards/InfoCard.jsx'
import { EmptyState } from '../../components/feedback/EmptyState.jsx'
import { Chip } from '../../components/forms/Chip.jsx'
import { NAV_ITEMS } from '../../mocks/mockData.js'
import { getLetterByToken } from '../../lib/api.js'
import bgVineWash from '../../assets/bg-vine-wash.jpg'
import laceDoily from '../../assets/vintage-lace-doily.png'
import laceTrimStrip from '../../assets/vintage-lace-trim-strip.png'

// 공통 · 내 정보(Profile) — docs/design 「Letter&Co Design System.zip」templates/profile/Profile.dc.html 이식.
// 이 프로젝트는 로그인 계정이 없다(docs/plan.md "로그인 없이 링크 하나로 참여"). 디자인은
// "참여 중인 그룹" 현재+이력을 함께 보여주는데, 이를 뒷받침할 서버 계정 개념이 없어 대신
// InviteJoin.jsx가 토큰별로 이미 남기는 localStorage 기록('letterco:invite-join:{token}')을
// 이 브라우저 안에서만 모아 보여준다(로그인 아님 — 순수 클라이언트 로컬 이력).
// 이름은 되돌려 저장할 계정이 없어 읽기 전용으로 표시한다.
const ACTIVE_NAV_KEY = 'profile'
const STORAGE_PREFIX = 'letterco:invite-join:'

function readAllJoinedTokens() {
  const entries = []
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(STORAGE_PREFIX)) continue
      const token = key.slice(STORAGE_PREFIX.length)
      try {
        const parsed = JSON.parse(localStorage.getItem(key))
        if (parsed?.name) entries.push({ token, name: parsed.name })
      } catch {
        // 손상된 항목은 무시
      }
    }
  } catch {
    // localStorage 접근 불가 환경 — 빈 이력으로 처리
  }
  return entries
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export function Profile() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [loadStatus, setLoadStatus] = useState('loading') // loading | ready
  const [name, setName] = useState('')
  const [current, setCurrent] = useState(null) // { title, confirmed }
  const [history, setHistory] = useState([]) // [{ token, title, date }]

  useEffect(() => {
    let cancelled = false
    const joined = readAllJoinedTokens()
    const currentEntry = joined.find((e) => e.token === token)
    const historyEntries = joined.filter((e) => e.token !== token)

    setName(currentEntry?.name ?? '')

    const tasks = []
    if (token) tasks.push(getLetterByToken(token).then((r) => ({ kind: 'current', result: r })))
    for (const e of historyEntries) {
      tasks.push(getLetterByToken(e.token).then((r) => ({ kind: 'history', token: e.token, result: r })))
    }

    Promise.all(tasks).then((results) => {
      if (cancelled) return
      let nextCurrent = null
      const nextHistory = []
      for (const r of results) {
        if (r.result.error) continue
        if (r.kind === 'current') {
          nextCurrent = { title: r.result.data.title, confirmed: Boolean(r.result.data.confirmed_at) }
        } else {
          nextHistory.push({ token: r.token, title: r.result.data.title, date: formatDate(r.result.data.confirmed_at || r.result.data.created_at) })
        }
      }
      setCurrent(nextCurrent)
      setHistory(nextHistory)
      setLoadStatus('ready')
    })

    return () => {
      cancelled = true
    }
  }, [token])

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
      <aside
        style={{
          width: '240px',
          flexShrink: 0,
          background: 'var(--paper-cool)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          boxSizing: 'border-box',
          position: 'sticky',
          top: 0,
          height: '100vh',
          alignSelf: 'flex-start',
        }}
      >
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 8px 0', overflow: 'visible', height: '150px', flexShrink: 0 }}>
          <img
            src={laceDoily}
            alt=""
            style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '190px', height: '190px', opacity: 0.95, pointerEvents: 'none', zIndex: 0 }}
          />
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'baseline', gap: 0 }}>
            <span style={{ fontFamily: "'Narony', var(--font-script-ornate)", fontSize: '48px', color: 'var(--wedgwood-deep)' }}>L</span>
            <span style={{ fontFamily: "'Signatie', var(--font-script-signature)", fontSize: '21px', color: 'var(--wedgwood-deep)' }}>etter</span>
            <span style={{ fontFamily: "'Narony', var(--font-script-ornate)", fontSize: '48px', color: 'var(--wedgwood-deep)' }}>&amp;</span>
            <span style={{ fontFamily: "'Narony', var(--font-script-ornate)", fontSize: '48px', color: 'var(--wedgwood-deep)' }}>C</span>
            <span style={{ fontFamily: "'Signatie', var(--font-script-signature)", fontSize: '21px', color: 'var(--wedgwood-deep)' }}>o</span>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {NAV_ITEMS.map((item) => {
            const active = item.key === ACTIVE_NAV_KEY
            const itemStyle = {
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              textDecoration: 'none',
              color: 'var(--ink)',
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              background: active ? 'var(--surface-raised)' : 'transparent',
              fontWeight: active ? 600 : 400,
              cursor: 'pointer',
            }
            const content = (
              <>
                <Icon name={item.icon} size={20} />
                {item.label}
              </>
            )
            const href =
              item.key === 'home'
                ? `${item.href}${token ? `?token=${token}` : ''}`
                : item.key === 'participants'
                  ? `${item.href}${token ? `?token=${token}` : ''}`
                  : item.key === 'coordinate'
                    ? `/scr2/roles${token ? `?token=${token}` : ''}`
                    : item.key === 'progress'
                      ? `/scr4/workspace${token ? `?token=${token}` : ''}`
                      : item.key === 'harvest'
                        ? `/scr5/review${token ? `?token=${token}` : ''}`
                        : item.key === 'settlement'
                          ? `/scr5/settlement${token ? `?token=${token}` : ''}`
                          : item.key === 'notifications'
                            ? `/notifications${token ? `?token=${token}` : ''}`
                            : item.key === 'profile'
                              ? `/profile${token ? `?token=${token}` : ''}`
                              : null
            return href ? (
              <Link key={item.key} to={href} style={itemStyle}>
                {content}
              </Link>
            ) : (
              <div key={item.key} style={itemStyle}>
                {content}
              </div>
            )
          })}
        </nav>
      </aside>

      <div
        aria-hidden="true"
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

      <main style={{ flex: 1, padding: '56px 48px', boxSizing: 'border-box', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div style={{ fontFamily: "'Whispering Signature', var(--font-script)", fontWeight: 400, fontSize: '72px', lineHeight: 0.85, color: 'oklch(0.995 0.006 165)' }}>Me</div>

        {loadStatus === 'loading' ? (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body-size)', color: 'var(--text-caption)' }}>불러오는 중…</div>
        ) : null}

        {loadStatus === 'ready' && !name ? (
          <EmptyState message="아직 참여한 모임이 없어요, 초대 링크로 들어오면 여기에 이름이 표시돼요" />
        ) : null}

        {loadStatus === 'ready' && name ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ border: '1px solid var(--wedgwood)', borderRadius: '50%', padding: '5px', display: 'inline-flex', flexShrink: 0 }}>
                <Avatar name={name} index={0} size={48} />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-caption-alt)', fontSize: '11px', letterSpacing: '0.1em', color: 'var(--text-caption)', textTransform: 'uppercase' }}>이름</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '18px', color: 'var(--ink)' }}>{name}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontFamily: 'var(--font-caption-alt)', fontSize: '12px', letterSpacing: '0.15em', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>참여 중인 그룹</div>
              {current ? (
                <InfoCard selected>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--ink)' }}>{current.title}</span>
                    <Chip tone="wedgwood">{current.confirmed ? '확정됨' : '조율 중'}</Chip>
                  </div>
                </InfoCard>
              ) : (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)' }}>지금 보고 있는 모임 링크가 없어요</div>
              )}
              {history.map((h) => (
                <InfoCard key={h.token}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--ink)' }}>{h.title}</span>
                    <span style={{ fontFamily: 'var(--font-caption-alt)', fontSize: '11px', color: 'var(--ink-soft)' }}>{h.date}</span>
                  </div>
                </InfoCard>
              ))}
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}
