import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar } from '../../components/identity/Avatar.jsx'
import { Icon } from '../../components/decor/Icon.jsx'
import { InfoCard } from '../../components/cards/InfoCard.jsx'
import { EmptyState } from '../../components/feedback/EmptyState.jsx'
import { Chip } from '../../components/forms/Chip.jsx'
import { Button } from '../../components/forms/Button.jsx'
import { NAV_ITEMS } from '../../mocks/mockData.js'
import { getLetterByToken, getResponses } from '../../lib/api.js'
import bgVineWash from '../../assets/bg-vine-wash.jpg'
import laceDoily from '../../assets/vintage-lace-doily.png'
import laceTrimStrip from '../../assets/vintage-lace-trim-strip.png'

// SCR4 · 그룹홈(GroupHome) — docs/design 「Letter&Co Design System.zip」
// templates/group-home/GroupHome.dc.html 이식. 원본의 은쟁반·레이스 리넨 프레임·명찰 장식
// 에셋(vintage-silver-tray.png 등)은 지난 "장식 단순화" 커밋(2325b210e)에서 이미 영구
// 삭제됐다(InviteShare의 은쟁반과 동일한 케이스) — 복구하지 않고 다른 재구현 화면들과
// 통일된 단순 카드 스타일로 대체한다.
// 신규 참여자의 첫 진입 화면이 아니라(그건 여전히 /scr0/join), 이미 참여 중인 모임에
// 돌아왔을 때 보는 허브 화면 — CLAUDE.md 라우트 표에 SCR4(Bloom) 소속으로 이미 정의돼 있다.
// "지난 모임" 이력은 Profile.jsx와 동일하게 로그인 없는 구조라 localStorage 기반으로 집계한다.
const ACTIVE_NAV_KEY = 'home'
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

export function GroupHome() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [loadStatus, setLoadStatus] = useState('loading') // loading | error | ready
  const [errorMsg, setErrorMsg] = useState('')
  const [letter, setLetter] = useState(null)
  const [participants, setParticipants] = useState([])
  const [history, setHistory] = useState([]) // [{ token, title, date }]

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setLoadStatus('error')
      setErrorMsg('모임 링크가 올바르지 않아요')
      return
    }

    const historyTokens = readAllJoinedTokens()
      .map((e) => e.token)
      .filter((t) => t !== token)

    Promise.all([
      getLetterByToken(token),
      getResponses(token),
      Promise.all(historyTokens.map((t) => getLetterByToken(t).then((r) => ({ token: t, result: r })))),
    ]).then(([letterResult, responsesResult, historyResults]) => {
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
      setLetter(letterResult.data)
      setParticipants(responsesResult.data ?? [])
      setHistory(
        historyResults
          .filter((r) => !r.result.error)
          .map((r) => ({ token: r.token, title: r.result.data.title, date: formatDate(r.result.data.confirmed_at || r.result.data.created_at) }))
      )
      setLoadStatus('ready')
    })

    return () => {
      cancelled = true
    }
  }, [token])

  const confirmed = Boolean(letter?.confirmed_at)
  const continueHref = confirmed ? `/scr4/workspace?token=${token}` : `/scr3/confirm?token=${token}`

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

      <main style={{ flex: 1, padding: '56px 48px', boxSizing: 'border-box', maxWidth: '820px', display: 'flex', flexDirection: 'column', gap: '40px' }}>
        <div style={{ fontFamily: "'Whispering Signature', var(--font-script)", fontWeight: 400, fontSize: '88px', lineHeight: 0.85, color: 'oklch(0.995 0.006 165)' }}>Home</div>

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
            <InfoCard style={{ maxWidth: '480px', alignSelf: 'center', width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '8px 0' }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '20px', fontWeight: 600, color: 'var(--ink)' }}>{letter.title}</div>
                <Chip tone="wedgwood">{confirmed ? '확정됨' : '조율 중'}</Chip>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {participants.map((p, i) => (
                    <Avatar key={p.id} name={p.name} index={i} size={24} />
                  ))}
                </div>
                <Link to={continueHref} style={{ textDecoration: 'none' }}>
                  <Button variant="primary" size="sm">조율 이어하기</Button>
                </Link>
              </div>
            </InfoCard>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontFamily: 'var(--font-caption-alt)', fontSize: '12px', letterSpacing: '0.15em', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>지난 모임</div>
              {history.length === 0 ? (
                <EmptyState message="아직 다른 모임에 참여한 적이 없어요, 새 모임에 초대되면 여기에 모여요" style={{ padding: '8px 0' }} />
              ) : (
                history.map((h) => (
                  <InfoCard key={h.token}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '15px', color: 'var(--ink)', fontWeight: 600 }}>{h.title}</div>
                        <div style={{ fontFamily: 'var(--font-caption-alt)', fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>{h.date}</div>
                      </div>
                      <Link to={`/scr4/home?token=${h.token}`} style={{ textDecoration: 'none' }}>
                        <Button variant="accent" size="sm">다시 열기</Button>
                      </Link>
                    </div>
                  </InfoCard>
                ))
              )}
            </div>

            <div style={{ alignSelf: 'flex-start' }}>
              <Link to="/scr0/compose" style={{ textDecoration: 'none' }}>
                <Button variant="primary">✉ 새 모임 초대장 쓰기</Button>
              </Link>
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}
