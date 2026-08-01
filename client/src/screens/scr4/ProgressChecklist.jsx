import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/decor/Icon.jsx'
import { Input } from '../../components/forms/Input.jsx'
import { Checkbox } from '../../components/forms/Checkbox.jsx'
import { Button } from '../../components/forms/Button.jsx'
import { NAV_ITEMS } from '../../mocks/mockData.js'
import { getLetterByToken, getRoles, createRoleTasks, updateRoleTask, deleteRoleTask, updateRole, getSuggestions } from '../../lib/api.js'
import letterBgFloralLace from '../../assets/letter-bg-floral-lace.jpg'
import laceDoily from '../../assets/vintage-lace-doily.png'
import laceTrimStrip from '../../assets/vintage-lace-trim-strip.png'

// SCR4 · 역할 상세·업무 체크리스트(ProgressChecklist) — docs/design 「Letter&Co Design System.zip」
// templates/progress-checklist/ProgressChecklist.dc.html 이식.
// ProgressWorkspace의 "체크리스트 열기"에서 진입한다. 개별 role은 별도 GET 엔드포인트가 없어
// getRoles(token)의 임베드된 role_tasks 목록에서 roleId로 찾아 쓴다.
// 업무 추가/삭제 입력은 원본 목업에는 없는 기능 추가분 — docs/plan.md의 "팀원이 수정·확정" 반영
// (역할별 업무 체크리스트 계획, role_tasks 기능 승인 시 합의됨). 색상·폰트·배경·레이아웃은 원본 그대로.
const ACTIVE_NAV_KEY = 'progress'
const NEAR_WHITE = 'oklch(0.995 0.006 165)'

export function ProgressChecklist() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const roleId = searchParams.get('roleId') ?? ''

  const [loadStatus, setLoadStatus] = useState('loading') // loading | error | ready
  const [errorMsg, setErrorMsg] = useState('')
  const [role, setRole] = useState(null)
  const [tasks, setTasks] = useState([])
  const [newLabel, setNewLabel] = useState('')
  const [suggestStatus, setSuggestStatus] = useState('idle') // idle | loading | fallback | error
  const [suggestNote, setSuggestNote] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!token || !roleId) {
      setLoadStatus('error')
      setErrorMsg('잘못된 링크예요')
      return
    }
    Promise.all([getLetterByToken(token), getRoles(token)]).then(([letterResult, rolesResult]) => {
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
      const found = (rolesResult.data ?? []).find((r) => r.id === roleId)
      if (!found) {
        setLoadStatus('error')
        setErrorMsg('역할을 찾을 수 없어요')
        return
      }
      setRole(found)
      setTasks(found.role_tasks ?? [])
      setLoadStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [token, roleId])

  function toggleTask(task) {
    const nextDone = !task.done
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: nextDone } : t)))
    updateRoleTask(token, roleId, task.id, { done: nextDone }).then((result) => {
      if (result.error) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: task.done } : t)))
      }
    })
  }

  function removeTask(taskId) {
    const prev = tasks
    setTasks((p) => p.filter((t) => t.id !== taskId))
    deleteRoleTask(token, roleId, taskId).then((result) => {
      if (result.error) setTasks(prev)
    })
  }

  function addTask() {
    const label = newLabel.trim()
    if (!label) return
    setNewLabel('')
    createRoleTasks(token, roleId, [label]).then((result) => {
      if (!result.error) setTasks((prev) => [...prev, ...result.data])
    })
  }

  // 이 역할(roleId)분 업무만 AI에게 추천받는다 — suggestForLetter는 이미 업무 있는
  // 역할엔 빈 배열을 주도록 프롬프트가 짜여 있어(server/src/controllers/suggestController.js),
  // 업무가 이미 있는 상태에서 다시 눌러도 안전하게 아무 일도 일어나지 않는다.
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
    const match = (data.role_suggestions ?? []).find((s) => s.role_id === roleId)
    if (!match?.tasks?.length) {
      setSuggestStatus('fallback')
      setSuggestNote('추천할 업무가 없어요')
      return
    }
    const created = await createRoleTasks(token, roleId, match.tasks)
    if (created.error) {
      setSuggestStatus('error')
      setSuggestNote(created.error)
      return
    }
    setTasks((prev) => [...prev, ...created.data])
    setSuggestStatus('idle')
  }

  // 업무 없이 역할 자체만 완료로 표시 — ProgressWorkspace.jsx에서 옮겨온 기능.
  function toggleRoleDone() {
    const nextDone = !role.done
    setRole((prev) => ({ ...prev, done: nextDone }))
    updateRole(token, roleId, { done: nextDone }).then((result) => {
      if (result.error) setRole((prev) => ({ ...prev, done: !nextDone }))
    })
  }

  const total = tasks.length
  const doneCount = tasks.filter((t) => t.done).length

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--paper)',
        fontFamily: 'var(--font-body)',
        color: 'var(--ink)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <img
        src={letterBgFloralLace}
        alt=""
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          width: '100vh',
          height: '100vw',
          minWidth: '100vw',
          minHeight: '100vh',
          transform: 'translate(-50%,-50%) rotate(90deg)',
          objectFit: 'cover',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />

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
          zIndex: 1,
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

      <main style={{ flex: 1, padding: '56px 48px', boxSizing: 'border-box', maxWidth: '920px', display: 'flex', flexDirection: 'column', gap: '32px', alignItems: 'center', position: 'relative', zIndex: 1 }}>
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
            <div style={{ width: '100%', maxWidth: '640px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '16px' }}>
              <div style={{ position: 'relative', padding: '8px 0 4px' }}>
                <div style={{ fontFamily: "'Whispering Signature', var(--font-script)", fontWeight: 400, fontSize: '72px', lineHeight: 0.85, color: NEAR_WHITE }}>Tasks</div>
              </div>
              <Link to={`/scr4/workspace${token ? `?token=${token}` : ''}`} style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: NEAR_WHITE, textDecoration: 'none' }}>
                ‹ 워크스페이스로
              </Link>
            </div>

            <div style={{ position: 'relative', width: '100%', maxWidth: '640px' }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '20px', color: NEAR_WHITE, fontWeight: 600, marginBottom: '4px' }}>{role.name}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {tasks.map((task) => (
                  <div key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 0', borderBottom: '1px dashed var(--line)' }}>
                    <div style={{ flex: 1 }}>
                      <Checkbox
                        checked={task.done}
                        onChange={() => toggleTask(task)}
                        label={task.label}
                        style={{ fontSize: '16px', color: NEAR_WHITE }}
                      />
                    </div>
                    {tasks.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeTask(task.id)}
                        aria-label="업무 삭제"
                        style={{ background: 'none', border: 'none', color: NEAR_WHITE, fontSize: '14px', cursor: 'pointer', padding: '4px' }}
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {tasks.length === 0 ? (
                <Checkbox
                  checked={Boolean(role.done)}
                  onChange={toggleRoleDone}
                  label="업무 없이 역할만 완료 처리"
                  style={{ fontSize: '14px', color: NEAR_WHITE, marginTop: '10px' }}
                />
              ) : null}
            </div>

            <div style={{ width: '100%', maxWidth: '640px', display: 'flex', alignItems: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
              <Button variant="primary" size="sm" onClick={runSuggest} disabled={suggestStatus === 'loading'}>
                {suggestStatus === 'loading' ? '추천을 준비하고 있어요…' : 'AI에게 추천받기'}
              </Button>
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '8px', minWidth: '200px' }}>
                <div style={{ flex: 1 }}>
                  <Input variant="underline" placeholder="업무 추가" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
                </div>
                <Button size="sm" variant="accent" onClick={addTask}>직접 추가</Button>
              </div>
            </div>

            {suggestStatus === 'error' || suggestStatus === 'fallback' ? (
              <div style={{ width: '100%', maxWidth: '640px', fontFamily: 'var(--font-body)', fontSize: '13px', color: NEAR_WHITE }}>{suggestNote}</div>
            ) : null}

            <div style={{ width: '100%', maxWidth: '640px', fontFamily: 'var(--font-body)', fontSize: '13px', color: NEAR_WHITE }}>{`${doneCount}/${total} 완료`}</div>

            <div style={{ width: '100%', maxWidth: '640px' }}>
              <Button variant="primary" onClick={() => navigate(`/scr4/workspace${token ? `?token=${token}` : ''}`)}>
                진행 화면으로
              </Button>
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}
