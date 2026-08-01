import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SectionTitle } from '../../components/identity/SectionTitle.jsx'
import { Input } from '../../components/forms/Input.jsx'
import { Chip } from '../../components/forms/Chip.jsx'
import { Button } from '../../components/forms/Button.jsx'
import { Toast } from '../../components/feedback/Toast.jsx'
import { createLetter } from '../../lib/api.js'

// SCR0 · 1 초대장 작성 화면 — docs/design 「Letter&Co Design System.zip」
// templates/invite-compose/InviteCompose.dc.html 이식.
// 실사 텍스처·왁스씰·레이스 장식은 걷어내고 둥근 카드 + 은은한 그레인으로 단순화.
// 발송 시 접힘·발송 애니메이션은 CSS 트랜스폼만으로 재구성(타이밍은 유지).
//
// [필수값 임시 기본값] POST /api/letters는 host_name을 필수로 요구하지만
// 이 화면에는 해당 입력란이 없다(디자인 원본 기준). 여기서는 임시 기본값으로 채워 전송한다.
const TEMP_HOST_NAME = '나'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))

export function InviteCompose() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [members, setMembers] = useState([])
  const [memberDraft, setMemberDraft] = useState(null) // null: 입력 없음, string: 입력 중
  const [slots, setSlots] = useState(() => [{ id: uid(), label: '' }])
  const [locations, setLocations] = useState(() => [{ id: uid(), name: '' }])
  const [phase, setPhase] = useState('writing') // writing | sending | sent
  const [errorMsg, setErrorMsg] = useState('')
  const sendDisabled =
    title.trim().length === 0 ||
    !slots.some((s) => s.label.trim()) ||
    !locations.some((l) => l.name.trim())

  function addSlot() {
    setSlots((prev) => [...prev, { id: uid(), label: '' }])
  }
  function updateSlot(id, label) {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)))
  }
  function removeSlot(id) {
    setSlots((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev))
  }

  function addLocation() {
    setLocations((prev) => [...prev, { id: uid(), name: '' }])
  }
  function updateLocation(id, name) {
    setLocations((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)))
  }
  function removeLocation(id) {
    setLocations((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev))
  }

  function addMember() {
    setMemberDraft('')
  }
  function commitMember() {
    const name = memberDraft.trim()
    if (name && !members.includes(name)) {
      setMembers((prev) => [...prev, name])
    }
    setMemberDraft(null)
  }
  function removeMember(name) {
    setMembers((prev) => prev.filter((m) => m !== name))
  }

  async function send() {
    if (sendDisabled) return
    setErrorMsg('')
    setPhase('sending')

    const [result] = await Promise.all([
      createLetter({
        title,
        host_name: TEMP_HOST_NAME,
        topic: note,
        candidate_slots: slots.filter((s) => s.label.trim()).map((s) => ({ id: s.id, label: s.label.trim() })),
        candidate_locations: locations.filter((l) => l.name.trim()).map((l) => ({ id: l.id, name: l.name.trim() })),
        participant_names: members,
      }),
      wait(900),
    ])

    if (result.error) {
      setPhase('writing')
      setErrorMsg(result.error)
      return
    }

    setPhase('sent')
    setTimeout(() => {
      navigate(`/scr0/share?token=${result.data.link_token}`)
    }, 1200)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px',
        position: 'relative',
        overflow: 'hidden',
        background:
          'radial-gradient(ellipse 65% 50% at 82% 0%, rgba(198,218,231,0.20), transparent 62%), radial-gradient(ellipse 60% 50% at 10% 100%, rgba(242,215,116,0.10), transparent 65%), var(--paper-cool)',
      }}
    >
      <style>{`
        @keyframes lco-fold { 0% { transform: scaleY(1); opacity:1; } 100% { transform: scaleY(0.14) translateY(70px); opacity:1; } }
        .lco-letter-folding { animation: lco-fold 0.32s var(--ease-soft, ease) forwards; }
        @keyframes lco-insert { 0% { transform: scaleY(0.14) translateY(70px); opacity:1; } 100% { transform: scaleY(0.08) translateY(6px); opacity:0.1; } }
        .lco-letter-inserting { animation: lco-insert 0.3s var(--ease-soft, ease) 0.32s forwards; opacity:1; }
        @keyframes lco-env-send { 0% { transform: translateY(0) scale(1); opacity:1; } 55% { transform: translateY(-22px) scale(1.03); opacity:1; } 100% { transform: translateY(-96px) scale(0.68); opacity:0; } }
        .lco-envelope-sending { animation: lco-env-send 0.42s cubic-bezier(.3,.9,.4,1) 0.6s forwards; }
        @keyframes lco-fade-up { from { opacity:0; transform:translateY(8px);} to { opacity:1; transform:translateY(0);} }
        .lco-sent-msg { animation: lco-fade-up 0.35s ease 1.1s both; }
      `}</style>

      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'var(--texture-grain)', opacity: 0.5, mixBlendMode: 'overlay', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
        <div style={{ '--text-script-lg': '48px', '--text-h2': '26px' }}>
          <SectionTitle script="Invite" title="초대장을 써볼까요" align="left" />
        </div>

        {phase === 'writing' ? (
          <>
            <div
              style={{
                position: 'relative',
                borderRadius: '20px',
                border: '1px solid var(--wedgwood-pale)',
                boxShadow: '0 2px 10px rgba(74,68,56,0.05)',
                overflow: 'hidden',
                backgroundColor: 'var(--cream)',
                backgroundImage: 'var(--texture-grain)',
                backgroundBlendMode: 'overlay',
              }}
            >
              <div style={{ position: 'relative', padding: '34px 30px 44px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <Input variant="underline" label="모임 이름" placeholder="예: 한강 피크닉 모임" value={title} onChange={(e) => setTitle(e.target.value)} />
                <Input variant="underline" label="함께 전할 한마디" placeholder="예: 오랜만에 다 같이 모여요" value={note} onChange={(e) => setNote(e.target.value)} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-caption-size)', color: 'var(--text-caption)' }}>후보 시간대</div>
                  {slots.map((s) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <Input variant="underline" placeholder="예: 토요일 오후 2시" value={s.label} onChange={(e) => updateSlot(s.id, e.target.value)} />
                      </div>
                      {slots.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeSlot(s.id)}
                          aria-label="시간대 삭제"
                          style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: '14px', cursor: 'pointer', padding: '4px' }}
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <div>
                    <Button size="sm" variant="accent" onClick={addSlot}>+ 추가</Button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-caption-size)', color: 'var(--text-caption)' }}>후보 장소</div>
                  {locations.map((l) => (
                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <Input variant="underline" placeholder="예: 강남역 스터디카페" value={l.name} onChange={(e) => updateLocation(l.id, e.target.value)} />
                      </div>
                      {locations.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeLocation(l.id)}
                          aria-label="장소 삭제"
                          style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: '14px', cursor: 'pointer', padding: '4px' }}
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <div>
                    <Button size="sm" variant="accent" onClick={addLocation}>+ 추가</Button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-caption-size)', color: 'var(--text-caption)' }}>함께할 사람</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                    {members.map((m) => (
                      <Chip key={m} tone="wedgwood" sticker>
                        {m}
                        <button
                          type="button"
                          onClick={() => removeMember(m)}
                          aria-label={`${m} 삭제`}
                          style={{ background: 'none', border: 'none', color: 'inherit', fontSize: '11px', cursor: 'pointer', padding: 0, marginLeft: '2px', lineHeight: 1 }}
                        >
                          ✕
                        </button>
                      </Chip>
                    ))}
                    {memberDraft !== null ? (
                      <Input
                        variant="underline"
                        placeholder="이름을 입력하세요"
                        value={memberDraft}
                        autoFocus
                        onChange={(e) => setMemberDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitMember()
                          } else if (e.key === 'Escape') {
                            setMemberDraft(null)
                          }
                        }}
                        onBlur={() => setMemberDraft(null)}
                        style={{ width: '120px' }}
                      />
                    ) : (
                      <Chip tone="lemon" sticker onClick={addMember}>+ 추가</Chip>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <Button variant="primary" block disabled={sendDisabled} soundType="finish" onClick={send}>
              ✉ 보내기
            </Button>

            {errorMsg ? <Toast icon="leaf">{errorMsg}</Toast> : null}
          </>
        ) : null}

        {phase === 'sending' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0 12px', gap: '16px' }}>
            <div style={{ position: 'relative', width: '200px', height: '130px' }}>
              <div
                className="lco-letter-folding lco-letter-inserting lco-envelope-sending"
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: 'var(--cream)',
                  backgroundImage: 'var(--texture-grain)',
                  backgroundBlendMode: 'overlay',
                  borderRadius: '14px',
                  border: '1px solid var(--wedgwood-pale)',
                  boxSizing: 'border-box',
                  boxShadow: '0 4px 10px rgba(74,68,56,0.08)',
                  transformOrigin: 'top center',
                }}
              />
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)' }}>편지를 접어 보내는 중…</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--ink-soft)' }}>초대장 생성 중… 최대 1분 정도 소요됩니다</div>
          </div>
        ) : null}

        {phase === 'sent' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '24px 0' }}>
            <div className="lco-sent-msg" style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--ink-soft)' }}>초대장을 보냈어요</div>
          </div>
        ) : null}
      </div>

      <div style={{ position: 'fixed', right: '14px', bottom: '14px', fontFamily: "'Signatie', var(--font-script)", fontSize: '13px', color: 'var(--wedgwood-deep)', opacity: 0.5, pointerEvents: 'none', zIndex: 50 }}>
        l
      </div>
    </div>
  )
}
