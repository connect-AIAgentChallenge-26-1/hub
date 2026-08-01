import { useEffect, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/decor/Icon.jsx'
import { InfoCard } from '../../components/cards/InfoCard.jsx'
import { Chip } from '../../components/forms/Chip.jsx'
import { Button } from '../../components/forms/Button.jsx'
import { Input } from '../../components/forms/Input.jsx'
import { EmptyState } from '../../components/feedback/EmptyState.jsx'
import { NAV_ITEMS } from '../../mocks/mockData.js'
import { getLetterByToken, getResponses, getRoles, createRole, updateRole, getSuggestions, createRoleTasks } from '../../lib/api.js'
import bgVineWash from '../../assets/bg-vine-wash.jpg'
import laceDoily from '../../assets/vintage-lace-doily.png'
import laceTrimStrip from '../../assets/vintage-lace-trim-strip.png'

// SCR2 · 역할 배정 화면 — docs/design 「Letter&Co Design System.zip」
// templates/coordinate-roles/CoordinateRoles.dc.html 이식.
// AI 역할 추천(role_suggestions)은 저장되지 않는 휘발성 데이터라, "AI 역할 추천 받기"를
// 눌러야 POST /suggest를 호출하고(자동 확정 UI 금지 — CoordinateConfirm.jsx와 동일 원칙) 그
// 결과를 실제 roles 행으로 생성한다. 이미 역할이 있으면 추천 버튼 없이 바로 목록을 보여준다.
const ACTIVE_NAV_KEY = 'coordinate'

export function Assign() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [loadStatus, setLoadStatus] = useState('loading') // loading | error | ready
  const [errorMsg, setErrorMsg] = useState('')
  const [letter, setLetter] = useState(null)
  const [participants, setParticipants] = useState([])
  const [roles, setRoles] = useState([])

  const [suggestStatus, setSuggestStatus] = useState('idle') // idle | loading | fallback | error
  const [suggestNote, setSuggestNote] = useState('')

  const [roleDraft, setRoleDraft] = useState(null) // null: 입력 없음, string: 입력 중 (InviteCompose.jsx의 memberDraft와 동일 패턴)
  const [roleAddStatus, setRoleAddStatus] = useState('idle') // idle | saving | error
  const [roleAddErrorMsg, setRoleAddErrorMsg] = useState('')

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
      setLetter(letterResult.data)
      setParticipants(responsesResult.data ?? [])
      setRoles(rolesResult.data ?? [])
      setLoadStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [token])

  // 역할 목록은 이미 사람이 만들어둔 상태 — AI는 새 역할을 만들지 않고 기존 역할에
  // 누구를 배정하면 좋을지만 추천한다(server/src/controllers/suggestController.js 참고).
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
    // AI가 존재하지 않는 role_id를 말하는 경우를 방어적으로 걸러낸다.
    const suggestions = (data?.role_suggestions ?? []).filter((s) => roles.some((r) => r.id === s.role_id))
    if (!suggestions.length) {
      setSuggestStatus('fallback')
      setSuggestNote('배정 추천을 만들 수 없어요')
      return
    }

    const updated = await Promise.all(
      suggestions.map((s) => updateRole(token, s.role_id, { assignee_id: s.assignee_participant_id ?? null, reason: s.reason }))
    )
    const failed = updated.find((r) => r.error)
    if (failed) {
      setSuggestStatus('error')
      setSuggestNote(failed.error)
      return
    }

    // 아직 업무가 없는 역할에만 AI 제안 업무(tasks)를 추가 — 실패해도 배정 자체는 이미 끝났으니 화면은 진행시킨다.
    await Promise.all(
      suggestions.map((s) => {
        const role = roles.find((r) => r.id === s.role_id)
        const hasTasks = (role?.role_tasks?.length ?? 0) > 0
        return !hasTasks && s.tasks?.length ? createRoleTasks(token, s.role_id, s.tasks) : Promise.resolve(null)
      })
    )
    const refreshed = await getRoles(token)
    if (!refreshed.error) setRoles(refreshed.data ?? [])
    setSuggestStatus('idle')
  }

  function reassign(roleId, participantId) {
    setRoles((prev) => prev.map((r) => (r.id === roleId ? { ...r, assignee_id: participantId } : r)))
    updateRole(token, roleId, { assignee_id: participantId }).then((result) => {
      if (result.error) {
        // 저장 실패 — 서버 재조회로 되돌린다.
        getRoles(token).then((r) => {
          if (!r.error) setRoles(r.data ?? [])
        })
      }
    })
  }

  // 역할 추가는 항상 사람이 먼저 하는 1단계 기본 기능 — InviteCompose.jsx의 "함께할 사람"
  // 추가(addMember/commitMember)와 동일한 패턴이지만, 로컬 상태가 아니라 즉시 서버에 저장한다.
  function startAddRole() {
    setRoleDraft('')
  }
  async function commitRole() {
    const name = roleDraft.trim()
    if (!name) {
      setRoleDraft(null)
      return
    }
    setRoleAddStatus('saving')
    setRoleAddErrorMsg('')
    const result = await createRole(token, { name, source: 'manual', position: roles.length })
    if (result.error) {
      setRoleAddStatus('error')
      setRoleAddErrorMsg(result.error)
      return
    }
    setRoles((prev) => [...prev, result.data])
    setRoleDraft(null)
    setRoleAddStatus('idle')
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
            // 참가자 현황·조율·진행만 실제 라우팅 — 나머지 미구현 화면 항목은 동일한 스타일의 비활성 div.
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

      <main style={{ flex: 1, padding: '56px 48px', boxSizing: 'border-box', maxWidth: '900px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px' }}>
        <div style={{ position: 'relative', padding: '8px 0 4px', width: '100%', maxWidth: '560px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Whispering Signature', var(--font-script)", fontWeight: 400, fontSize: '72px', lineHeight: 0.85, color: 'oklch(0.995 0.006 165)' }}>
            Assign
          </div>
          {letter ? (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body-size)', color: 'var(--text-caption)', marginTop: '24px' }}>{letter.title}</div>
          ) : null}
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
          <div style={{ width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {participants.length === 0 ? (
              <EmptyState message="아직 응답한 참여자가 없어요, 참여자 응답을 기다려볼까요?" />
            ) : (
              <>
                {/* 역할은 항상 사람이 먼저 추가하는 1단계 기본 기능 — InviteCompose.jsx의
                    "함께할 사람" + 추가(memberDraft)와 동일한 패턴, 다만 즉시 서버에 저장한다. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-caption-size)', color: 'var(--text-caption)' }}>필요한 역할</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                    {roleDraft !== null ? (
                      <Input
                        variant="underline"
                        placeholder="역할 이름을 입력하세요"
                        value={roleDraft}
                        autoFocus
                        onChange={(e) => setRoleDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitRole()
                          } else if (e.key === 'Escape') {
                            setRoleDraft(null)
                          }
                        }}
                        onBlur={() => {
                          if (roleAddStatus !== 'error') setRoleDraft(null)
                        }}
                        style={{ width: '160px' }}
                      />
                    ) : (
                      <Chip tone="lemon" sticker onClick={startAddRole}>+ 역할 추가</Chip>
                    )}
                  </div>
                  {roleAddStatus === 'error' ? (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)' }}>{roleAddErrorMsg}</div>
                  ) : null}
                </div>

                {roles.length === 0 ? (
                  <EmptyState message="아직 추가된 역할이 없어요, 위에서 역할을 추가해볼까요?" style={{ padding: '8px 0' }} />
                ) : (
                  roles.map((role) => (
                    <InfoCard key={role.id} title={role.name}>
                      {role.reason ? (
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '10px' }}>{role.reason}</div>
                      ) : null}
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-caption-size)', color: 'var(--text-caption)', marginBottom: '6px' }}>담당자</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {participants.map((p) => (
                          <Chip key={p.id} tone="wedgwood" selected={role.assignee_id === p.id} onClick={() => reassign(role.id, p.id)}>
                            {p.name}
                          </Chip>
                        ))}
                      </div>
                    </InfoCard>
                  ))
                )}

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <Button variant="primary" onClick={runSuggest} disabled={roles.length === 0 || suggestStatus === 'loading'}>
                    {suggestStatus === 'loading' ? '배정을 준비하고 있어요…' : '배정 추천받기'}
                  </Button>
                  {suggestStatus === 'error' || suggestStatus === 'fallback' ? (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--ink-soft)', textAlign: 'center' }}>{suggestNote}</div>
                  ) : null}
                </div>

                {roles.length > 0 ? (
                  <Button variant="primary" block soundType="finish" onClick={() => navigate(`/scr3/confirm${token ? `?token=${token}` : ''}`)}>
                    확정하러 가기
                  </Button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </main>

      <div style={{ position: 'fixed', right: '14px', bottom: '14px', fontFamily: "'Signatie', var(--font-script)", fontSize: '13px', color: 'var(--wedgwood-deep)', opacity: 0.5, pointerEvents: 'none', zIndex: 50 }}>
        l
      </div>
    </div>
  )
}
