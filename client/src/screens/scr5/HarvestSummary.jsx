import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/decor/Icon.jsx'
import { PostcardCard, PostcardRow } from '../../components/cards/PostcardCard.jsx'
import { Button } from '../../components/forms/Button.jsx'
import { NAV_ITEMS } from '../../mocks/mockData.js'
import { getLetterByToken, getHarvestReviews, getResponses } from '../../lib/api.js'
import bgVineWash from '../../assets/bg-vine-wash.jpg'
import laceDoily from '../../assets/vintage-lace-doily.png'
import laceTrimStrip from '../../assets/vintage-lace-trim-strip.png'

// SCR5 · 4-2 결산 요약 화면(HarvestSummary) — docs/design 「Letter&Co Design System.zip」
// templates/harvest-summary/HarvestSummary.dc.html 이식.
// 디자인의 날짜(예: 2026.07.18)는 실제 모임 일시 필드가 없어 letters.confirmed_at으로 대체한다.
const ACTIVE_NAV_KEY = 'harvest'

function leafLabel(avg) {
  const filled = Math.round(avg)
  return `${'🍃'.repeat(Math.max(0, Math.min(5, filled)))} ${avg.toFixed(1)}`
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export function HarvestSummary() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [loadStatus, setLoadStatus] = useState('loading') // loading | error | ready
  const [errorMsg, setErrorMsg] = useState('')
  const [letter, setLetter] = useState(null)
  const [reviews, setReviews] = useState([])
  const [totalParticipants, setTotalParticipants] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setLoadStatus('error')
      setErrorMsg('모임 링크가 올바르지 않아요')
      return
    }
    Promise.all([getLetterByToken(token), getHarvestReviews(token), getResponses(token)]).then(([letterResult, reviewsResult, responsesResult]) => {
      if (cancelled) return
      if (letterResult.error) {
        setLoadStatus('error')
        setErrorMsg(letterResult.error)
        return
      }
      if (reviewsResult.error) {
        setLoadStatus('error')
        setErrorMsg(reviewsResult.error)
        return
      }
      setLetter(letterResult.data)
      setReviews(reviewsResult.data ?? [])
      setTotalParticipants((responsesResult.data ?? []).length)
      setLoadStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [token])

  const reviewCount = reviews.length
  const avg = (key) => (reviewCount ? reviews.reduce((sum, r) => sum + r[key], 0) / reviewCount : 0)
  const timeAvg = avg('time_rating')
  const placeAvg = avg('place_rating')
  const roleAvg = avg('role_rating')
  const participationLabel =
    reviewCount === 0
      ? '아직 응답이 없어요'
      : reviewCount >= totalParticipants
        ? `${reviewCount}명 모두 응답`
        : `${totalParticipants}명 중 ${reviewCount}명 응답`

  const locations = letter?.candidate_locations ?? []
  const confirmedLocation = locations.find((l) => l.id === letter?.confirmed_location_id)

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

      <main style={{ flex: 1, padding: '56px 40px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
          <div style={{ width: '100%', maxWidth: '460px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
            <div style={{ fontFamily: 'var(--font-script)', fontWeight: 700, fontSize: 'var(--text-script-lg)', color: 'oklch(0.995 0.006 165)', lineHeight: 1.2, textAlign: 'center' }}>
              Harvest
            </div>
            <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-h2)', color: 'var(--ink)', margin: 0, fontWeight: 700, textAlign: 'center' }}>모임을 잘 마쳤어요</h2>

            <PostcardCard stamp style={{ width: '100%' }}>
              <PostcardRow label="시간 적합도">{leafLabel(timeAvg)}</PostcardRow>
              <PostcardRow label="장소 적합도">{leafLabel(placeAvg)}</PostcardRow>
              <PostcardRow label="역할 분배">{leafLabel(roleAvg)}</PostcardRow>
              <PostcardRow label="참여">{participationLabel}</PostcardRow>
            </PostcardCard>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontFamily: 'var(--font-caption-alt)', fontSize: '11px', letterSpacing: '0.08em', color: 'var(--ink-soft)' }}>
              <span>{letter.title}</span>
              {letter.confirmed_at ? (
                <>
                  <span>·</span>
                  <span>{formatDate(letter.confirmed_at)}</span>
                </>
              ) : null}
              {confirmedLocation ? (
                <>
                  <span>·</span>
                  <span>{confirmedLocation.name}</span>
                </>
              ) : null}
            </div>

            <div style={{ width: '100%', display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <Link to={`/scr5/settlement${token ? `?token=${token}` : ''}`} style={{ textDecoration: 'none', display: 'block' }}>
                  <Button variant="accent" block>정산하러 가기</Button>
                </Link>
              </div>
              <div style={{ flex: 1 }}>
                <Link to={`/scr4/home${token ? `?token=${token}` : ''}`} style={{ textDecoration: 'none', display: 'block' }}>
                  <Button variant="primary" block>그룹 홈으로</Button>
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
