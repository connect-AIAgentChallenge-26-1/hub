import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Chip } from '../../components/forms/Chip.jsx'
import { Button } from '../../components/forms/Button.jsx'
import { EmptyState } from '../../components/feedback/EmptyState.jsx'
import { SidebarNav } from '../../components/layout/SidebarNav.jsx'
import { getLetterByToken, getResponses, getRoles } from '../../lib/api.js'
import bgVineWash from '../../assets/bg-vine-wash.jpg'
import laceTrimStrip from '../../assets/vintage-lace-trim-strip.png'

// SCR4 · 진행 상황 화면(ProgressWorkspace) — docs/design 「Letter&Co Design System.zip」
// templates/progress-workspace/ProgressWorkspace.dc.html 이식.
// 실제 목업은 터치 스와이프가 아니라 ‹/› 버튼 + dot 페이징으로 카드 한 장씩 넘긴다 — 그대로 구현.
// 역할의 완료 판정: role_tasks(업무)가 있으면 전부 done일 때 완료로 간주하고 "체크리스트 열기"로
// ProgressChecklist(SCR4)에서 업무 단위로 체크한다. 업무가 0개인 역할만 이 화면에서 직접 토글한다.
const ACTIVE_NAV_KEY = 'progress'

function isRoleDone(role) {
  const tasks = role.role_tasks ?? []
  if (tasks.length === 0) return Boolean(role.done)
  return tasks.every((t) => t.done)
}

// 원본 .dc.html의 .lco-vine-petal/.lco-vine-center를 그대로 인라인 스타일로 옮긴 5꽃잎 진행 마커.
function FlowerProgressBar({ pct }) {
  return (
    <div style={{ position: 'relative', flex: 1, height: '16px' }}>
      <div style={{ position: 'absolute', left: 0, top: '50%', height: '4px', borderRadius: '999px 0 0 999px', transform: 'translateY(-50%)', width: `${pct}%`, background: 'var(--wedgwood-pale)' }} />
      <div style={{ position: 'absolute', right: 0, top: '50%', height: '4px', borderRadius: '0 999px 999px 0', transform: 'translateY(-50%)', width: `${100 - pct}%`, background: 'hsl(96,45%,90%)' }} />
      <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%,-50%)', width: '16px', height: '16px' }}>
        {[0, 72, 144, 216, 288].map((rot) => (
          <div
            key={rot}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: '4px',
              height: '7px',
              borderRadius: '60% 60% 6% 6%',
              background: 'var(--wedgwood-deep)',
              transformOrigin: '50% 100%',
              transform: `translate(-50%,-100%) rotate(${rot}deg)`,
            }}
          />
        ))}
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: '4px', height: '4px', margin: '-2px 0 0 -2px', borderRadius: '50%', background: 'var(--wedgwood-deep)' }} />
      </div>
    </div>
  )
}

export function ProgressWorkspace() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [loadStatus, setLoadStatus] = useState('loading') // loading | error | ready
  const [errorMsg, setErrorMsg] = useState('')
  const [participantNameById, setParticipantNameById] = useState({})
  const [roles, setRoles] = useState([])
  const [index, setIndex] = useState(0)

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
      const nameById = {}
      for (const p of responsesResult.data ?? []) {
        nameById[p.id] = p.name
      }
      setParticipantNameById(nameById)
      setRoles(rolesResult.data ?? [])
      setLoadStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [token])

  const total = roles.length
  const doneCount = roles.filter(isRoleDone).length
  const pct = total ? Math.round((doneCount / total) * 100) : 0
  const current = roles[index]
  const atStart = index === 0
  const atEnd = index >= total - 1

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

      <main className="lco-main" style={{ flex: 1, padding: '40px', boxSizing: 'border-box', maxWidth: '560px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
        <div style={{ fontFamily: 'var(--font-script)', fontWeight: 700, fontSize: 'var(--text-script-lg)', lineHeight: 1.2, color: 'oklch(0.995 0.006 165)', textAlign: 'center' }}>
          Bloom
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

        {loadStatus === 'ready' && total === 0 ? (
          <EmptyState
            message="아직 배정된 역할이 없어요, 역할 배정부터 해볼까요?"
            action={
              <Link to={`/scr2/roles${token ? `?token=${token}` : ''}`} style={{ textDecoration: 'none' }}>
                <Button variant="primary">역할 배정하러 가기</Button>
              </Link>
            }
          />
        ) : null}

        {loadStatus === 'ready' && total > 0 ? (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center' }}>
            <div
              style={{
                width: '100%',
                background: 'var(--cream)',
                border: '1px solid var(--line)',
                borderRadius: '10px',
                padding: '16px 20px',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
              }}
            >
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '11px', letterSpacing: '0.1em', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>오늘 할 일</div>
              <FlowerProgressBar pct={pct} />
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                {`${doneCount}/${total} 역할 완료`}
              </div>
            </div>

            {pct === 100 ? (
              <Link to={`/scr5/review${token ? `?token=${token}` : ''}`} style={{ textDecoration: 'none', width: '100%' }}>
                <Button variant="accent" block soundType="finish">결산하러 가기</Button>
              </Link>
            ) : null}

            <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Button variant="primary" size="sm" disabled={atStart} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
                ‹
              </Button>

              <div
                style={{
                  flex: 1,
                  background: 'var(--cream)',
                  border: '1px solid var(--line)',
                  borderRadius: '10px',
                  padding: '24px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  minHeight: '200px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '20px', color: 'var(--ink)' }}>{current.name}</div>
                  {current.assignee_id && participantNameById[current.assignee_id] ? (
                    <Chip tone="wedgwood">{participantNameById[current.assignee_id]}</Chip>
                  ) : (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)' }}>담당자 미정</div>
                  )}
                </div>
                {current.reason ? (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)' }}>{current.reason}</div>
                ) : null}
                {(current.role_tasks?.length ?? 0) > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                    <FlowerProgressBar pct={Math.round((current.role_tasks.filter((t) => t.done).length / current.role_tasks.length) * 100)} />
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--ink-soft)' }}>
                      {`${current.role_tasks.filter((t) => t.done).length}/${current.role_tasks.length} 진행 중`}
                    </div>
                  </div>
                ) : null}
                {/* 업무가 0개여도 체크리스트 화면에서 AI 추천·직접 추가로 업무를 만들 수 있어야 하므로
                    항상 진입 가능하게 한다 — 업무 없이 역할만 완료 처리하는 체크박스는 그 화면으로 옮겼다. */}
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => navigate(`/scr4/checklist?token=${token}&roleId=${current.id}`)}
                  style={{ alignSelf: 'flex-start', marginTop: '8px' }}
                >
                  체크리스트 열기
                </Button>
              </div>

              <Button variant="primary" size="sm" disabled={atEnd} onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}>
                ›
              </Button>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              {roles.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  aria-label={`${i + 1}번째 역할 카드로 이동`}
                  onClick={() => setIndex(i)}
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    background: i === index ? 'var(--wedgwood-deep)' : 'var(--line)',
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </main>

      <div style={{ position: 'fixed', right: '14px', bottom: '14px', fontFamily: "'Signatie', var(--font-script)", fontSize: '13px', color: 'var(--wedgwood-deep)', opacity: 0.5, pointerEvents: 'none', zIndex: 50 }}>
        l
      </div>
    </div>
  )
}
