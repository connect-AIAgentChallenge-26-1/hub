import { useEffect, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { InfoCard } from '../../components/cards/InfoCard.jsx'
import { Button } from '../../components/forms/Button.jsx'
import { SidebarNav } from '../../components/layout/SidebarNav.jsx'
import { getLetterByToken, getRoles, getResponses, getSuggestions, confirmLetter } from '../../lib/api.js'
import { countResponded, getSelectedLocationIds, getSelectedSlotIds, tallyVotes } from '../../lib/participantStatus.js'
import bgVineWash from '../../assets/bg-vine-wash.jpg'
import laceTrimStrip from '../../assets/vintage-lace-trim-strip.png'
import laceFrameRect from '../../assets/lace-frame-rect.png'

// SCR3 · 확정 화면 — docs/design 「Letter&Co Design System.zip」
// templates/coordinate-confirm/CoordinateConfirm.dc.html 이식.
// 화면 진입 시 자동으로 추천을 부르지 않는다(자동확정 UI 금지) — "추천받기"를 눌러야 POST /suggest 호출.
// 추천은 시간·장소 후보 선택값을 채워줄 뿐이고, 최종 저장은 "확정하기" 클릭으로 PATCH /confirm 호출.
const ACTIVE_NAV_KEY = 'coordinate'

export function CoordinateConfirm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [loadStatus, setLoadStatus] = useState('loading') // loading | error | ready
  const [errorMsg, setErrorMsg] = useState('')
  const [letter, setLetter] = useState(null)
  const [roles, setRoles] = useState([])
  const [participants, setParticipants] = useState([])
  const [confirmed, setConfirmed] = useState(false)

  const [selectedSlotId, setSelectedSlotId] = useState(null)
  const [selectedLocationId, setSelectedLocationId] = useState(null)
  const [slotVoteCounts, setSlotVoteCounts] = useState({})
  const [locationVoteCounts, setLocationVoteCounts] = useState({})
  const [slotTieBroken, setSlotTieBroken] = useState(false)
  const [locationTieBroken, setLocationTieBroken] = useState(false)

  const [suggestStatus, setSuggestStatus] = useState('idle') // idle | loading | done | fallback | error
  const [suggestion, setSuggestion] = useState(null)
  const [suggestNote, setSuggestNote] = useState('')

  const [saveStatus, setSaveStatus] = useState('idle') // idle | saving | error
  const [saveErrorMsg, setSaveErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setLoadStatus('error')
      setErrorMsg('모임 링크가 올바르지 않아요')
      return
    }

    async function load() {
      const [letterResult, rolesResult, responsesResult] = await Promise.all([
        getLetterByToken(token),
        getRoles(token),
        getResponses(token),
      ])
      if (cancelled) return
      if (letterResult.error) {
        setLoadStatus('error')
        setErrorMsg(letterResult.error)
        return
      }
      if (rolesResult.error) {
        setLoadStatus('error')
        setErrorMsg(rolesResult.error)
        return
      }
      if (responsesResult.error) {
        setLoadStatus('error')
        setErrorMsg(responsesResult.error)
        return
      }

      const letterData = letterResult.data
      const participantsData = responsesResult.data ?? []
      setLetter(letterData)
      setRoles(rolesResult.data ?? [])
      setParticipants(participantsData)
      setConfirmed(Boolean(letterData.confirmed_at))

      // 이미 확정된 모임이면 확정된 값을 그대로 보여준다 — 투표 재집계로 덮어쓰지 않는다.
      if (letterData.confirmed_slot_id || letterData.confirmed_location_id) {
        setSelectedSlotId(letterData.confirmed_slot_id ?? null)
        setSelectedLocationId(letterData.confirmed_location_id ?? null)
        setLoadStatus('ready')
        return
      }

      const slotIds = (letterData.candidate_slots ?? []).map((s) => s.id)
      const locationIds = (letterData.candidate_locations ?? []).map((l) => l.id)
      const slotCounts = tallyVotes(participantsData, slotIds, getSelectedSlotIds)
      const locationCounts = tallyVotes(participantsData, locationIds, getSelectedLocationIds)
      setSlotVoteCounts(slotCounts)
      setLocationVoteCounts(locationCounts)

      const slotWinners = topCandidates(slotCounts)
      const locationWinners = topCandidates(locationCounts)
      const needsTieBreak = slotWinners.ids.length > 1 || locationWinners.ids.length > 1

      let tieSuggestion = null
      if (needsTieBreak) {
        setSuggestStatus('loading')
        const suggestResult = await getSuggestions(token)
        if (cancelled) return
        if (!suggestResult.error && !suggestResult.data?.fallback) {
          tieSuggestion = suggestResult.data
          setSuggestion(tieSuggestion)
          setSuggestStatus('done')
        } else {
          // 동점 해소용 자동 호출이라 실패해도 에러로 보여주지 않고 조용히 첫 후보로 폴백한다.
          setSuggestStatus('idle')
        }
      }

      if (slotWinners.max > 0) {
        if (slotWinners.ids.length === 1) {
          setSelectedSlotId(slotWinners.ids[0])
        } else {
          const aiPick = tieSuggestion?.suggested_slot_id
          setSelectedSlotId(slotWinners.ids.includes(aiPick) ? aiPick : slotWinners.ids[0])
          setSlotTieBroken(true)
        }
      }
      if (locationWinners.max > 0) {
        if (locationWinners.ids.length === 1) {
          setSelectedLocationId(locationWinners.ids[0])
        } else {
          const aiPick = tieSuggestion?.suggested_location_id
          setSelectedLocationId(locationWinners.ids.includes(aiPick) ? aiPick : locationWinners.ids[0])
          setLocationTieBroken(true)
        }
      }

      setLoadStatus('ready')
    }

    load()
    return () => {
      cancelled = true
    }
  }, [token])

  async function runSuggest() {
    setSuggestStatus('loading')
    setSuggestNote('')
    const result = await getSuggestions(token)
    if (result.error) {
      setSuggestStatus('error')
      setSuggestNote(result.error)
      return
    }
    const data = result.data
    if (data?.fallback) {
      setSuggestStatus('fallback')
      setSuggestNote(data.reason || '추천을 만들 수 없어요')
      return
    }
    setSuggestion(data)
    setSuggestStatus('done')
    if (data?.suggested_slot_id && (letter.candidate_slots ?? []).some((s) => s.id === data.suggested_slot_id)) {
      setSelectedSlotId(data.suggested_slot_id)
    }
    if (data?.suggested_location_id && (letter.candidate_locations ?? []).some((l) => l.id === data.suggested_location_id)) {
      setSelectedLocationId(data.suggested_location_id)
    }
  }

  async function confirm() {
    if (!selectedSlotId || !selectedLocationId || !letter?.responses_closed || saveStatus === 'saving') return
    setSaveStatus('saving')
    setSaveErrorMsg('')
    const result = await confirmLetter(token, {
      confirmed_slot_id: selectedSlotId,
      confirmed_location_id: selectedLocationId,
    })
    if (result.error) {
      setSaveStatus('error')
      setSaveErrorMsg(result.error)
      return
    }
    setLetter(result.data)
    setSaveStatus('idle')
    setConfirmed(true)
  }

  const slots = letter?.candidate_slots ?? []
  const locations = letter?.candidate_locations ?? []
  const selectedSlot = slots.find((s) => s.id === selectedSlotId)
  const selectedLocation = locations.find((l) => l.id === selectedLocationId)
  const roleSummary = roles.length ? `${roles.length}명 배정 완료` : '역할 미정'
  const totalParticipants = participants.length
  const respondedCount = countResponded(participants)
  const responsesClosed = Boolean(letter?.responses_closed)
  const canConfirm = Boolean(selectedSlotId && selectedLocationId) && responsesClosed

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
      <style>{`
        @keyframes lco-bloom-petal { 0% { transform: translate(-50%,-100%) rotate(var(--rot)) scale(0); opacity: 0; } 60% { transform: translate(-50%,-100%) rotate(var(--rot)) scale(1.15); opacity: 1; } 100% { transform: translate(-50%,-100%) rotate(var(--rot)) scale(1); opacity: 1; } }
        .lco-bloom-petal { position:absolute; top:50%; left:50%; width:13px; height:21px; border-radius:60% 60% 6% 6%; background:color-mix(in srgb, var(--wedgwood) 85%, white); box-shadow:0 1px 3px rgba(74,68,56,0.18); transform-origin:50% 100%; animation: lco-bloom-petal 0.6s ease both; }
        @keyframes lco-pop { from { opacity:0; transform:scale(0.3);} to { opacity:1; transform:scale(1);} }
      `}</style>

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

      <main className="lco-main" style={{ flex: 1, padding: '56px 48px', boxSizing: 'border-box', maxWidth: '900px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px' }}>
        <div style={{ position: 'relative', padding: '8px 0 4px', width: '100%', maxWidth: '560px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Whispering Signature', var(--font-script)", fontWeight: 400, fontSize: '72px', lineHeight: 0.85, color: 'oklch(0.995 0.006 165)' }}>
            Confirm
          </div>
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
            {/* 레이스 프레임 안의 편지 카드 — 이 화면의 단일 장식 요소 */}
            <div style={{ position: 'relative', width: '100%', maxWidth: '900px', aspectRatio: '675/1200', containerType: 'inline-size' }}>
              <img
                src={laceFrameRect}
                alt=""
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none', zIndex: 0, filter: 'drop-shadow(0 6px 16px rgba(74,68,56,0.14))' }}
              />
              <div style={{ position: 'absolute', inset: '29% 21% 26%', zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '20px' }}>
                <LetterRow label="모임" value={letter.title} />
                <LetterRow label="시간" value={selectedSlot?.label ?? '아직 선택되지 않았어요'} />
                <LetterRow label="장소" value={selectedLocation?.name ?? '아직 선택되지 않았어요'} />
                <LetterRow label="역할" value={roleSummary} />
              </div>
            </div>

            {!confirmed ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', width: '100%', maxWidth: '560px' }}>
                {suggestStatus === 'idle' || suggestStatus === 'loading' || suggestStatus === 'error' ? (
                  <Button variant="primary" onClick={runSuggest} disabled={suggestStatus === 'loading'}>
                    {suggestStatus === 'loading' ? '추천을 준비하고 있어요…' : '추천받기'}
                  </Button>
                ) : null}

                {suggestStatus === 'error' ? (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)' }}>{suggestNote}</div>
                ) : null}

                {suggestStatus === 'fallback' ? (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)', textAlign: 'center' }}>
                    {suggestNote} — 아래에서 직접 골라주세요
                  </div>
                ) : null}

                <CandidatePicker
                  label="시간"
                  items={slots.map((s) => ({ id: s.id, label: s.label }))}
                  selectedId={selectedSlotId}
                  onSelect={setSelectedSlotId}
                  voteCounts={slotVoteCounts}
                  note={slotTieBroken ? '동점이라 자동으로 골랐어요 — 아래에서 바로 바꿀 수 있어요' : ''}
                  reason={suggestStatus === 'done' ? suggestion?.suggested_slot_reason : ''}
                  emptyMessage="후보 시간이 없어요"
                />

                <CandidatePicker
                  label="장소"
                  items={locations.map((l) => ({ id: l.id, label: l.name }))}
                  selectedId={selectedLocationId}
                  onSelect={setSelectedLocationId}
                  voteCounts={locationVoteCounts}
                  note={locationTieBroken ? '동점이라 자동으로 골랐어요 — 아래에서 바로 바꿀 수 있어요' : ''}
                  reason={suggestStatus === 'done' ? suggestion?.suggested_location_reason : ''}
                  emptyMessage="후보 장소가 없어요"
                />

                {suggestStatus === 'done' && suggestion?.role_suggestions?.length ? (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontFamily: 'var(--font-caption-alt)', fontSize: '11px', letterSpacing: '0.15em', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>역할 배정 추천</div>
                    {/* 역할은 이미 SCR2(Assign)에서 사람이 만들어둔 것 — 여기서는 배정 추천만 참고용으로 보여준다.
                        실제 배정 수락/변경은 SCR2 몫. */}
                    {suggestion.role_suggestions.map((s) => {
                      const role = roles.find((r) => r.id === s.role_id)
                      if (!role) return null
                      const assignee = participants.find((p) => p.id === s.assignee_participant_id)
                      return (
                        <InfoCard key={s.role_id}>
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--ink)' }}>
                            {role.name}{assignee ? ` → ${assignee.name}` : ''}
                          </div>
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--ink-soft)', marginTop: '4px' }}>{s.reason}</div>
                        </InfoCard>
                      )
                    })}
                  </div>
                ) : null}

                <Button variant="primary" block disabled={!canConfirm || saveStatus === 'saving'} soundType="finish" onClick={confirm}>
                  {saveStatus === 'saving' ? '확정하는 중…' : '확정하기'}
                </Button>

                <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)', textAlign: 'center' }}>
                  {responsesClosed
                    ? `${respondedCount}/${totalParticipants}명 투표 완료`
                    : (
                      <>
                        {`${respondedCount}/${totalParticipants}명 투표 완료 · 아직 마감되지 않았어요 — `}
                        <Link to={`/scr0/status${token ? `?token=${token}` : ''}`} style={{ color: 'var(--wedgwood-deep)' }}>
                          참가자 현황에서 마감할 수 있어요
                        </Link>
                      </>
                    )}
                </div>

                {saveStatus === 'error' ? (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)' }}>{saveErrorMsg}</div>
                ) : null}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ position: 'relative', width: '64px', height: '64px' }}>
                  <div className="lco-bloom-petal" style={{ '--rot': '0deg' }} />
                  <div className="lco-bloom-petal" style={{ '--rot': '72deg', animationDelay: '0.05s' }} />
                  <div className="lco-bloom-petal" style={{ '--rot': '144deg', animationDelay: '0.1s' }} />
                  <div className="lco-bloom-petal" style={{ '--rot': '216deg', animationDelay: '0.15s' }} />
                  <div className="lco-bloom-petal" style={{ '--rot': '288deg', animationDelay: '0.2s' }} />
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      width: '12px',
                      height: '12px',
                      margin: '-6px 0 0 -6px',
                      borderRadius: '50%',
                      background: 'color-mix(in srgb, var(--lemon) 90%, white)',
                      boxShadow: '0 1px 3px rgba(74,68,56,0.18)',
                      animation: 'lco-pop 0.3s ease 0.4s both',
                    }}
                  />
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--ink-soft)' }}>모두에게 확정 소식을 전했어요</div>
                <Button variant="accent" onClick={() => navigate(`/scr4/workspace${token ? `?token=${token}` : ''}`)}>
                  진행 화면으로
                </Button>
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  )
}

function LetterRow({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '2.4cqw', padding: '1.8cqw 0', borderBottom: '1px dashed var(--line)' }}>
      <span style={{ width: '7.4cqw', flexShrink: 0, fontFamily: 'var(--font-caption-alt)', fontSize: 'clamp(11px, 2.1cqw, 15px)', color: 'var(--ink-soft)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 'clamp(14px, 2.8cqw, 20px)', color: 'var(--ink)' }}>{value}</span>
    </div>
  )
}

// 후보 id별 득표 수(counts)에서 최다 득표 후보 id들과 득표 수를 반환한다.
// 아무도 투표하지 않았으면(max === 0) ids는 빈 배열 — 이 경우 자동 선택하지 않는다.
function topCandidates(counts) {
  const values = Object.values(counts)
  const max = values.length ? Math.max(0, ...values) : 0
  if (max === 0) return { max: 0, ids: [] }
  return { max, ids: Object.keys(counts).filter((id) => counts[id] === max) }
}

function CandidatePicker({ label, items, selectedId, onSelect, voteCounts, note, reason, emptyMessage }) {
  if (!items.length) {
    return (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontFamily: 'var(--font-caption-alt)', fontSize: '11px', letterSpacing: '0.15em', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)' }}>{emptyMessage}</div>
      </div>
    )
  }
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontFamily: 'var(--font-caption-alt)', fontSize: '11px', letterSpacing: '0.15em', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>{label}</div>
      {items.map((item) => {
        const count = voteCounts?.[item.id] ?? 0
        return (
          <InfoCard key={item.id} selected={item.id === selectedId} onClick={() => onSelect(item.id)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--ink)' }}>{item.label}</div>
              {count > 0 ? (
                <div style={{ fontFamily: 'var(--font-caption-alt)', fontSize: '11px', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{`${count}표`}</div>
              ) : null}
            </div>
          </InfoCard>
        )
      })}
      {note ? (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--ink-soft)' }}>{note}</div>
      ) : null}
      {reason && selectedId ? (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--ink-soft)' }}>{reason}</div>
      ) : null}
    </div>
  )
}
