import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { SectionTitle } from '../../components/identity/SectionTitle.jsx'
import { Button } from '../../components/forms/Button.jsx'
import { Toast } from '../../components/feedback/Toast.jsx'
import silverTray from '../../assets/vintage-silver-tray.png'
import { shareLinkFor } from '../../lib/api.js'

// SCR0 · 1-1 초대장 공유 화면 — docs/design 「Letter&Co Design System.zip」
// templates/invite-share/InviteShare.dc.html 이식.
export function InviteShare() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const shareUrl = shareLinkFor(token)

  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function copyLink() {
    navigator.clipboard?.writeText(shareUrl).catch(() => {})
    setCopied(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ minHeight: '100vh', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', background: 'var(--paper)' }}>
      <div style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
        <SectionTitle script="Sent" title="초대장을 보냈어요" align="center" />

        <div style={{ position: 'relative', width: '100%', height: '340px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src={silverTray}
            alt=""
            style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '110%', maxWidth: '460px', opacity: 0.9, pointerEvents: 'none', zIndex: 0 }}
          />
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              width: '100%',
              background: 'var(--cream)',
              backgroundImage: 'var(--texture-grain)',
              backgroundBlendMode: 'overlay',
              border: '1px solid var(--wedgwood-pale)',
              borderRadius: '20px',
              padding: '16px',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 6px 16px rgba(74,68,56,0.1)',
            }}
          >
            <div style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {shareUrl}
            </div>
            <Button variant="primary" size="sm" onClick={copyLink}>
              {copied ? '복사됨' : '복사'}
            </Button>
          </div>
        </div>

        <Button variant="primary" block onClick={() => navigate(`/scr0/status?token=${token}`)}>현황 보기</Button>

        {copied ? (
          <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)' }}>
            <Toast icon="check">링크를 복사했어요</Toast>
          </div>
        ) : null}
      </div>

      <div style={{ position: 'fixed', right: '14px', bottom: '14px', fontFamily: "'Signatie', var(--font-script)", fontSize: '13px', color: 'var(--wedgwood-deep)', opacity: 0.5, pointerEvents: 'none', zIndex: 50 }}>
        l
      </div>
    </div>
  )
}
