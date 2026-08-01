import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LeafRating } from '../../components/feedback/LeafRating.jsx'
import { Input } from '../../components/forms/Input.jsx'
import { Button } from '../../components/forms/Button.jsx'
import { SidebarNav } from '../../components/layout/SidebarNav.jsx'
import { getLetterByToken, createHarvestReview } from '../../lib/api.js'
import bgVineWash from '../../assets/bg-vine-wash.jpg'
import laceTrimStrip from '../../assets/vintage-lace-trim-strip.png'

// SCR5 · 4-1 결산 평가 화면(HarvestReview) — docs/design 「Letter&Co Design System.zip」
// templates/harvest-review/HarvestReview.dc.html 이식. 원본은 리프 평점형/태그 선택형 두 입력
// 모드를 토글하지만, 태그 선택은 숫자 평점으로 변환하는 규칙이 정의돼 있지 않아(데모용 장식) 여기서는
// docs/plan.md가 명시한 리프 평점(1~5) 입력만 구현한다.
// 참여자 식별: 로그인이 없으므로 InviteJoin.jsx와 동일하게 localStorage에 저장된 이름을 프리필한다.
const ACTIVE_NAV_KEY = 'harvest'
const submissionKey = (token) => `letterco:invite-join:${token}`

function readStoredName(token) {
  if (!token) return ''
  try {
    const raw = localStorage.getItem(submissionKey(token))
    return raw ? JSON.parse(raw)?.name ?? '' : ''
  } catch {
    return ''
  }
}

export function HarvestReview() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [loadStatus, setLoadStatus] = useState('loading') // loading | error | ready
  const [errorMsg, setErrorMsg] = useState('')
  const [letter, setLetter] = useState(null)

  const [name, setName] = useState(() => readStoredName(token))
  const [timeRating, setTimeRating] = useState(4)
  const [placeRating, setPlaceRating] = useState(4)
  const [roleRating, setRoleRating] = useState(4)
  const [comment, setComment] = useState('')

  const [saveStatus, setSaveStatus] = useState('idle') // idle | saving | error
  const [saveErrorMsg, setSaveErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setLoadStatus('error')
      setErrorMsg('모임 링크가 올바르지 않아요')
      return
    }
    getLetterByToken(token).then((result) => {
      if (cancelled) return
      if (result.error) {
        setLoadStatus('error')
        setErrorMsg(result.error)
        return
      }
      setLetter(result.data)
      setLoadStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [token])

  const submitDisabled = name.trim().length === 0 || saveStatus === 'saving'

  async function submit() {
    if (submitDisabled) return
    setSaveStatus('saving')
    setSaveErrorMsg('')
    const result = await createHarvestReview(token, {
      participant_name: name.trim(),
      time_rating: timeRating,
      place_rating: placeRating,
      role_rating: roleRating,
      comment: comment.trim() || null,
    })
    if (result.error) {
      setSaveStatus('error')
      setSaveErrorMsg(result.error)
      return
    }
    navigate(`/scr5/summary${token ? `?token=${token}` : ''}`)
  }

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

      <main className="lco-main" style={{ flex: 1, padding: '40px', boxSizing: 'border-box', maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-script)', fontWeight: 700, fontSize: 'var(--text-script-lg)', color: 'oklch(0.995 0.006 165)', lineHeight: 1.2 }}>Harvest</div>
          <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-h2)', color: 'var(--ink)', margin: '4px 0 0', fontWeight: 700 }}>이번 모임, 어땠나요</h2>
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

        {loadStatus === 'ready' && !letter.confirmed_at ? (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)' }}>
            {'아직 확정되지 않았어요 — '}
            <Link to={`/scr3/confirm${token ? `?token=${token}` : ''}`} style={{ color: 'var(--wedgwood-deep)' }}>
              조율 화면에서 먼저 확정해주세요
            </Link>
          </div>
        ) : null}

        {loadStatus === 'ready' && letter.confirmed_at ? (
          <>
            <div
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                background: 'var(--cream)',
                border: '1px solid var(--line)',
                borderRadius: '10px',
                padding: '20px',
                boxSizing: 'border-box',
              }}
            >
              <Input variant="underline" label="이름" placeholder="이름을 입력하세요" value={name} onChange={(e) => setName(e.target.value)} />
              <LeafRating label="시간 적합도" value={timeRating} max={5} onChange={setTimeRating} />
              <LeafRating label="장소 적합도" value={placeRating} max={5} onChange={setPlaceRating} />
              <LeafRating label="역할 분배" value={roleRating} max={5} onChange={setRoleRating} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '11px', letterSpacing: '0.15em', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>한마디 남기기 (선택)</div>
              <Input variant="underline" placeholder="다음 모임을 위한 메모" value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>

            <div style={{ alignSelf: 'flex-start' }}>
              <Button variant="primary" disabled={submitDisabled} soundType="finish" onClick={submit}>
                {saveStatus === 'saving' ? '제출하는 중…' : '평가 제출하기'}
              </Button>
            </div>

            {saveStatus === 'error' ? (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)' }}>{saveErrorMsg}</div>
            ) : null}
          </>
        ) : null}
      </main>

      <div style={{ position: 'fixed', right: '14px', bottom: '14px', fontFamily: "'Signatie', var(--font-script)", fontSize: '13px', color: 'var(--wedgwood-deep)', opacity: 0.5, pointerEvents: 'none', zIndex: 50 }}>
        l
      </div>
    </div>
  )
}
