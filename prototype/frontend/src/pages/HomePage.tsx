import { CalendarSection } from '../components/CalendarSection'
import { MeetupSection } from '../components/MeetupSection'
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
        <MeetupSection />
        <CalendarSection />
      </main>
    </div>
  )
}
