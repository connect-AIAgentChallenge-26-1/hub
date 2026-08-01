import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../decor/Icon.jsx'
import { NAV_ITEMS } from '../../mocks/mockData.js'
import laceDoily from '../../assets/vintage-lace-doily.png'

// 모임 화면 공통 좌측 사이드바 — 로고 + 내비게이션.
// 768px 미만에서는 햄버거 버튼으로 여닫는 오프캔버스 서랍으로 접힌다(styles/responsive.css 참고).
// 데스크톱(768px 이상)에서는 항상 펼쳐진 고정 사이드바로 보인다.
export function SidebarNav({ activeKey, token }) {
  const [open, setOpen] = useState(false)

  function hrefFor(item) {
    switch (item.key) {
      case 'home':
      case 'participants':
        return `${item.href}${token ? `?token=${token}` : ''}`
      // NAV_ITEMS의 coordinate.href는 아직 없는 SCR1 스케줄 화면(/scr1/schedule)을 가리키므로,
      // 여기서는 SCR2 역할 배정 화면(/scr2/roles)으로 직접 연결한다(SCR2가 SCR3보다 앞선 단계).
      case 'coordinate':
        return `/scr2/roles${token ? `?token=${token}` : ''}`
      case 'progress':
        return `/scr4/workspace${token ? `?token=${token}` : ''}`
      case 'harvest':
        return `/scr5/review${token ? `?token=${token}` : ''}`
      case 'settlement':
        return `/scr5/settlement${token ? `?token=${token}` : ''}`
      case 'notifications':
        return `/notifications${token ? `?token=${token}` : ''}`
      case 'profile':
        return `/profile${token ? `?token=${token}` : ''}`
      default:
        return null
    }
  }

  return (
    <>
      <button
        type="button"
        className="lco-hamburger"
        aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7H20M4 12H20M4 17H20" />
        </svg>
      </button>

      {open ? <div className="lco-scrim" onClick={() => setOpen(false)} /> : null}

      <aside className={`lco-aside${open ? ' lco-aside--open' : ''}`} style={{ background: 'var(--paper-cool)', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '24px', boxSizing: 'border-box' }}>
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
            const active = item.key === activeKey
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
            const href = hrefFor(item)
            return href ? (
              <Link key={item.key} to={href} style={itemStyle} onClick={() => setOpen(false)}>
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
    </>
  )
}
