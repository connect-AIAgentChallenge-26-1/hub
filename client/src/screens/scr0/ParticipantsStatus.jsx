import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar } from '../../components/identity/Avatar.jsx'
import { Chip } from '../../components/forms/Chip.jsx'
import { InfoCard } from '../../components/cards/InfoCard.jsx'
import { EmptyState } from '../../components/feedback/EmptyState.jsx'
import { DueDateBanner } from '../../components/feedback/DueDateBanner.jsx'
import { Button } from '../../components/forms/Button.jsx'
import { SidebarNav } from '../../components/layout/SidebarNav.jsx'
import { getLetterByToken, getResponses, closeResponses } from '../../lib/api.js'
import { countResponded, getSelectedSlotIds, isResponded } from '../../lib/participantStatus.js'
import bgVineWash from '../../assets/bg-vine-wash.jpg'
import laceTrimStrip from '../../assets/vintage-lace-trim-strip.png'

// SCR0 · 참가자 현황 화면 — docs/design 「Letter&Co Design System.zip」
// templates/participants-status/ParticipantsStatus.dc.html 이식.
// GET /api/letters/:token, GET /api/letters/:token/responses로 실데이터 연동.
// 초대된 참가자 전원을 표시하며, 미응답자는 강조 없는 '응답 대기' 칩으로 조용히 표시한다.
const ACTIVE_NAV_KEY = 'participants'

export function ParticipantsStatus() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [status, setStatus] = useState('loading') // loading | error | ready
  const [errorMsg, setErrorMsg] = useState('')
  const [letter, setLetter] = useState(null)
  const [participants, setParticipants] = useState([])
  const [slotLabelById, setSlotLabelById] = useState({})
  const [closeStatus, setCloseStatus] = useState('idle') // idle | closing | error
  const [closeErrorMsg, setCloseErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setStatus('error')
      setErrorMsg('모임 링크가 올바르지 않아요')
      return
    }
    Promise.all([getLetterByToken(token), getResponses(token)]).then(([letterResult, responsesResult]) => {
      if (cancelled) return
      if (letterResult.error) {
        setStatus('error')
        setErrorMsg(letterResult.error)
        return
      }
      if (responsesResult.error) {
        setStatus('error')
        setErrorMsg(responsesResult.error)
        return
      }
      const labelById = {}
      for (const slot of letterResult.data.candidate_slots ?? []) {
        labelById[slot.id] = slot.label
      }
      setSlotLabelById(labelById)
      setLetter(letterResult.data)
      setParticipants(responsesResult.data ?? [])
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [token])

  async function handleClose() {
    setCloseStatus('closing')
    setCloseErrorMsg('')
    const result = await closeResponses(token)
    if (result.error) {
      setCloseStatus('error')
      setCloseErrorMsg(result.error)
      return
    }
    setLetter(result.data)
    setCloseStatus('idle')
  }

  const total = participants.length
  const respondedCount = countResponded(participants)
  const pct = total ? Math.round((respondedCount / total) * 100) : 0
  const waitingCount = total - respondedCount

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

      <main className="lco-main" style={{ flex: 1, padding: '56px 48px', boxSizing: 'border-box', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div style={{ position: 'relative', padding: '8px 0 4px' }}>
          <div style={{ fontFamily: "'Whispering Signature', var(--font-script)", fontWeight: 400, fontSize: '72px', lineHeight: 0.85, color: 'oklch(0.995 0.006 165)' }}>
            Status
          </div>
        </div>

        {status === 'loading' ? (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body-size)', color: 'var(--text-caption)' }}>불러오는 중…</div>
        ) : null}

        {status === 'error' ? (
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

        {status === 'ready' ? <DueDateBanner dueAt={letter?.responses_due_at} closed={letter?.responses_closed} /> : null}

        {status === 'ready' && total === 0 ? <EmptyState message="아직 참가자가 없어요, 초대장을 보내볼까요?" /> : null}

        {status === 'ready' && total > 0 ? (
          <>
            <div
              style={{
                background: 'var(--cream)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px 20px',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              <div style={{ flex: 1, height: '6px', borderRadius: 'var(--radius-pill)', background: 'var(--wedgwood-pale)', overflow: 'hidden', position: 'relative' }}>
                <div
                  style={{
                    height: '100%',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--wedgwood-deep)',
                    width: `${pct}%`,
                    transition: 'width var(--dur-progress) var(--ease-soft)',
                  }}
                />
              </div>
              {pct === 100 ? (
                <span
                  aria-hidden="true"
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'var(--lemon-deep)',
                    border: '1px solid var(--lemon-pale)',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-on-deep)" strokeWidth="2" strokeLinecap="round">
                    <path d="M5 12.5L10 17.5L19 6.5" />
                  </svg>
                </span>
              ) : null}
              <div style={{ fontFamily: 'var(--font-caption-alt)', fontSize: '11px', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                {`${total}명 중 ${respondedCount}명 응답 완료`}
              </div>
            </div>

            <div
              style={{
                background: 'var(--cream)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px 20px',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
              }}
            >
              {letter.responses_closed ? (
                <>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)' }}>응답을 마감했어요</div>
                  <Link to={`/scr3/confirm${token ? `?token=${token}` : ''}`} style={{ textDecoration: 'none' }}>
                    <Button variant="primary" size="sm">조율 화면으로</Button>
                  </Link>
                </>
              ) : (
                <>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)' }}>
                    {waitingCount > 0 ? `${waitingCount}명이 아직 응답하지 않았어요` : '모두 응답했어요'}
                  </div>
                  <Button variant="primary" size="sm" soundType="finish" disabled={closeStatus === 'closing'} onClick={handleClose}>
                    {closeStatus === 'closing' ? '마감하는 중…' : '응답 마감하기'}
                  </Button>
                </>
              )}
            </div>

            {closeStatus === 'error' ? (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)' }}>{closeErrorMsg}</div>
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {participants.map((p, i) => {
                const responded = isResponded(p)
                const slotIds = getSelectedSlotIds(p)
                const slotLabels = slotIds.map((id) => slotLabelById[id]).filter(Boolean).join(', ')
                return (
                  <InfoCard key={p.id}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Avatar name={p.name} index={i} size={32} />
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--ink)' }}>{p.name}</div>
                      </div>
                      {responded ? (
                        <Chip tone={i % 2 === 0 ? 'wedgwood' : 'lemon'}>{slotLabels || '응답 완료'}</Chip>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            fontFamily: 'var(--font-body)',
                            fontSize: '12px',
                            padding: '5px 12px',
                            borderRadius: 'var(--radius-pill)',
                            background: 'var(--paper-cool)',
                            color: 'var(--ink-soft)',
                            border: '1px solid var(--line)',
                          }}
                        >
                          응답 대기
                        </span>
                      )}
                    </div>
                  </InfoCard>
                )
              })}
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}
