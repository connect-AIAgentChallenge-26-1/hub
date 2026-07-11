import { CalendarSection } from '../components/CalendarSection'
import { useAuth } from '../context/AuthContext'
import './auth.css'
import './home.css'

export function HomePage() {
  const { user, logout } = useAuth()

  return (
    <div className="home-page">
      <header className="home-header">
        <h1>밥약</h1>
        <div className="home-user">
          <span>{user?.name}님</span>
          <button className="home-logout" onClick={logout}>
            로그아웃
          </button>
        </div>
      </header>

      <main className="home-main">
        <CalendarSection />

        <section className="home-card home-card-dim">
          <h2>밥약 모임</h2>
          <p className="home-muted">3주차에 만들 예정입니다 — 모임 생성과 공강 시간 자동 계산.</p>
        </section>
      </main>
    </div>
  )
}
