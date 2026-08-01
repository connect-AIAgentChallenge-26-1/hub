import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Avatar } from '../../components/identity/Avatar.jsx'
import { InfoCard } from '../../components/cards/InfoCard.jsx'
import { EmptyState } from '../../components/feedback/EmptyState.jsx'
import { Chip } from '../../components/forms/Chip.jsx'
import { Input } from '../../components/forms/Input.jsx'
import { Button } from '../../components/forms/Button.jsx'
import { SidebarNav } from '../../components/layout/SidebarNav.jsx'
import { getLetterByToken, getResponses, getExpenses, createExpense } from '../../lib/api.js'
import { renderSettlementImage, shareOrDownloadImage } from '../../lib/settlementImage.js'
import bgVineWash from '../../assets/bg-vine-wash.jpg'
import laceTrimStrip from '../../assets/vintage-lace-trim-strip.png'

// SCR5 · 정산 화면(Settlement) — docs/design 「Letter&Co Design System.zip」
// templates/settlement/Settlement.dc.html 이식. 원본 디자인은 지출 목록을 보여주는 정적 화면이라
// "지출 추가" 입력 폼이 없다 — 사용자 승인에 따라 항목명·금액·결제자 선택으로 구성된 폼을 새로 추가했다.
// 금액 계산은 원본 .dc.html의 로직 그대로: 1/N 균등 분배, 잔액 = 낸 금액 − 1인당 금액.
const ACTIVE_NAV_KEY = 'settlement'

export function Settlement() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [loadStatus, setLoadStatus] = useState('loading') // loading | error | ready
  const [errorMsg, setErrorMsg] = useState('')
  const [letter, setLetter] = useState(null)
  const [participants, setParticipants] = useState([])
  const [expenses, setExpenses] = useState([])

  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(null)
  const [addStatus, setAddStatus] = useState('idle') // idle | saving | error
  const [addErrorMsg, setAddErrorMsg] = useState('')
  const [shareStatus, setShareStatus] = useState('idle') // idle | rendering | error

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setLoadStatus('error')
      setErrorMsg('모임 링크가 올바르지 않아요')
      return
    }
    Promise.all([getLetterByToken(token), getResponses(token), getExpenses(token)]).then(([letterResult, responsesResult, expensesResult]) => {
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
      if (expensesResult.error) {
        setLoadStatus('error')
        setErrorMsg(expensesResult.error)
        return
      }
      setLetter(letterResult.data)
      setParticipants(responsesResult.data ?? [])
      setExpenses(expensesResult.data ?? [])
      setLoadStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [token])

  const addDisabled = !label.trim() || !Number(amount) || !paidBy || addStatus === 'saving'

  async function addExpense() {
    if (addDisabled) return
    setAddStatus('saving')
    setAddErrorMsg('')
    const result = await createExpense(token, {
      label: label.trim(),
      amount: Number(amount),
      paid_by_participant_id: paidBy,
    })
    if (result.error) {
      setAddStatus('error')
      setAddErrorMsg(result.error)
      return
    }
    setExpenses((prev) => [...prev, result.data])
    setLabel('')
    setAmount('')
    setPaidBy(null)
    setAddStatus('idle')
  }

  async function handleShareImage() {
    setShareStatus('rendering')
    try {
      const blob = await renderSettlementImage({ title: letter?.title, total, perPerson, balances })
      await shareOrDownloadImage(blob, `${letter?.title || 'settlement'}-정산.png`)
      setShareStatus('idle')
    } catch {
      setShareStatus('error')
    }
  }

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  const n = participants.length || 1
  const perPerson = Math.round(total / n)
  const nameById = Object.fromEntries(participants.map((p) => [p.id, p.name]))
  const balances = participants.map((p) => {
    const paid = expenses.filter((e) => e.paid_by_participant_id === p.id).reduce((sum, e) => sum + e.amount, 0)
    const diff = paid - perPerson
    const balanceLabel =
      diff === 0 ? '정산 완료' : diff > 0 ? `+${diff.toLocaleString()}원 받음` : `${Math.abs(diff).toLocaleString()}원 보낼 차례`
    return { ...p, balanceLabel }
  })

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
          <div style={{ fontFamily: 'var(--font-script)', fontWeight: 700, fontSize: 'var(--text-script-lg)', color: 'oklch(0.995 0.006 165)', lineHeight: 1.2 }}>Split</div>
          <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-h2)', color: 'var(--ink)', margin: '4px 0 0', fontWeight: 700 }}>비용을 나눠요</h2>
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
            {expenses.length === 0 ? <EmptyState message="아직 등록된 지출이 없어요, 첫 지출을 추가해볼까요?" /> : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {expenses.map((e) => (
                <InfoCard key={e.id}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--ink)' }}>{e.label}</div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                        {`${nameById[e.paid_by_participant_id] ?? '알 수 없음'} 결제`}
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--ink)' }}>{e.amount.toLocaleString()}원</div>
                  </div>
                </InfoCard>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-caption-size)', color: 'var(--text-caption)' }}>지출 추가</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ flex: 2, minWidth: '140px' }}>
                  <Input variant="underline" placeholder="항목명" value={label} onChange={(e) => setLabel(e.target.value)} />
                </div>
                <div style={{ flex: 1, minWidth: '90px' }}>
                  <Input variant="underline" placeholder="금액" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <Button size="sm" variant="accent" disabled={addDisabled} onClick={addExpense}>
                  {addStatus === 'saving' ? '추가하는 중…' : '추가'}
                </Button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {participants.map((p) => (
                  <Chip key={p.id} tone="wedgwood" selected={paidBy === p.id} onClick={() => setPaidBy(p.id)}>
                    {p.name}
                  </Chip>
                ))}
              </div>
              {addStatus === 'error' ? (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)' }}>{addErrorMsg}</div>
              ) : null}
            </div>

            <div
              style={{
                background: 'var(--cream)',
                border: '1px solid var(--line)',
                borderRadius: '10px',
                padding: '20px 20px 16px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--ink)' }}>
                <span>총 비용</span>
                <span style={{ fontWeight: 600 }}>{total.toLocaleString()}원</span>
              </div>
              <div style={{ height: '2px', borderRadius: '1px', background: 'var(--lemon-deep)', opacity: 0.6, width: '56px' }} aria-hidden="true" />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--ink-soft)' }}>
                <span>1인당</span>
                <span>{perPerson.toLocaleString()}원</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {balances.map((b, i) => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Avatar name={b.name} index={i} size={28} />
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink)' }}>{b.name}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--ink-soft)' }}>{b.balanceLabel}</span>
                </div>
              ))}
            </div>

            {expenses.length > 0 ? (
              <Button variant="accent" disabled={shareStatus === 'rendering'} onClick={handleShareImage}>
                {shareStatus === 'rendering' ? '이미지 만드는 중…' : '이미지로 공유'}
              </Button>
            ) : null}

            {shareStatus === 'error' ? (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)' }}>이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요</div>
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
