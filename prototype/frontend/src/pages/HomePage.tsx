import { CalendarSection } from '../components/CalendarSection'
import { MeetupSection } from '../components/MeetupSection'
import { PlaceSearchSection } from '../components/PlaceSearchSection'
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
        <section className="home-hero">
          <p className="home-kicker">오늘의 밥약 준비</p>
          <h2>좋은 하루예요, {user?.name ?? '사용자'}님 🍽️</h2>
          <p className="home-subtitle">모임, 캘린더, 맛집 검색을 한곳에서 이어서 볼 수 있어요.</p>
        </section>

        <div className="home-grid">
          <MeetupSection />
          <CalendarSection />
        </div>

        <PlaceSearchSection />
      </main>
    </div>
  )
}
