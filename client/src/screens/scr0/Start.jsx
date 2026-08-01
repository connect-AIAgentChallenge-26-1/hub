import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/forms/Button.jsx'
import { Input } from '../../components/forms/Input.jsx'
import doily from '../../assets/vintage-lace-doily.png'
import waxSeal from '../../assets/vintage-wax-seal-swan.png'

// 전체 공유 URL(https://…/share/{token}, …/scr0/join?token=…)이나 토큰 코드만
// 입력해도 모임 화면(그룹 홈)으로 보낼 수 있게 토큰만 뽑아낸다.
function extractToken(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    const fromQuery = url.searchParams.get('token')
    if (fromQuery) return fromQuery
    const segments = url.pathname.split('/').filter(Boolean)
    return segments[segments.length - 1] ?? ''
  } catch {
    return trimmed
  }
}

// SCR0 · 0 시작 화면 — docs/design 「Letter&Co Design System.zip」templates/start/Start.dc.html 이식.
// 도일리 오벌 프레임 + 왁스씰, 미스트 배경. 장식 요소는 도일리 프레임 1계열만 사용.
export function Start() {
  const navigate = useNavigate()
  const [showJoin, setShowJoin] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const joinDisabled = joinCode.trim().length === 0

  function join() {
    if (joinDisabled) return
    navigate(`/scr4/home?token=${extractToken(joinCode)}`)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        position: 'relative',
        overflow: 'hidden',
        background:
          'radial-gradient(ellipse 70% 55% at 50% 6%, rgba(198,218,231,0.26), transparent 60%), radial-gradient(ellipse 60% 50% at 50% 100%, rgba(242,215,116,0.10), transparent 65%), var(--paper-cool)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'var(--texture-grain)',
          opacity: 0.55,
          mixBlendMode: 'overlay',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '460px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '440px', aspectRatio: '1/1' }}>
          <img
            src={doily}
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 14px 28px rgba(74,68,56,0.14))', pointerEvents: 'none' }}
          />
          <img
            src={waxSeal}
            alt=""
            style={{
              position: 'absolute',
              top: '9%',
              left: '50%',
              transform: 'translateX(-50%) rotate(-4deg)',
              width: '52px',
              height: '52px',
              objectFit: 'contain',
              filter: 'drop-shadow(0 3px 7px rgba(74,68,56,0.28))',
              zIndex: 2,
            }}
          />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '9px', padding: '0 78px', textAlign: 'center', zIndex: 1 }}>
            <div style={{ fontFamily: "'Signatie', var(--font-script)", fontSize: '54px', lineHeight: 1, color: 'var(--wedgwood-deep)', marginTop: '22px' }}>Letter&amp;Co</div>
            <div style={{ width: '34px', height: '1px', background: 'var(--line)', margin: '2px 0' }} />
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '18px', color: 'var(--ink)' }}>모임 조율을 간편하게</div>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '300px', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '38px' }}>
          <Button variant="primary" block onClick={() => navigate('/scr0/compose')} style={{ height: '48px' }}>
            ✉ 초대장 작성 시작
          </Button>
          <Button
            variant="accent"
            block
            onClick={() => setShowJoin((s) => !s)}
            style={{ height: '48px', background: 'transparent', border: '1.5px solid var(--wedgwood-mid)', color: 'var(--wedgwood-deep)' }}
          >
            🌿 링크로 입장
          </Button>
        </div>

        {showJoin ? (
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              width: '100%',
              maxWidth: '300px',
              boxSizing: 'border-box',
              background: 'var(--surface-raised)',
              border: '1px solid var(--line)',
              borderRadius: '10px',
              boxShadow: 'var(--shadow-fold)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              marginTop: '16px',
            }}
          >
            <Input
              variant="box"
              label="초대 링크 또는 코드"
              placeholder="예: hangang-picnic-4x9k"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') join()
              }}
            />
            <Button variant="primary" block disabled={joinDisabled} style={{ height: '44px' }} onClick={join}>
              입장하기
            </Button>
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: 'fixed',
          right: '14px',
          bottom: '14px',
          fontFamily: "'Signatie', var(--font-script)",
          fontSize: '13px',
          color: 'var(--wedgwood-deep)',
          opacity: 0.5,
          pointerEvents: 'none',
          zIndex: 50,
        }}
      >
        l
      </div>
    </div>
  )
}
