import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { createMeetup, fetchMeetups, type Meetup } from '../api/meetups'

const STATUS_LABELS: Record<string, string> = {
  matching: '매칭 중',
  time_fixed: '시간 확정',
  confirmed: '확정 완료',
  cancelled: '취소됨',
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 생성`
}

export function MeetupSection() {
  const [meetups, setMeetups] = useState<Meetup[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [title, setTitle] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMeetups()
      .then(setMeetups)
      .catch(() => setError('모임 목록을 불러오지 못했습니다.'))
      .finally(() => setIsLoaded(true))
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setIsCreating(true)
    setError(null)
    try {
      const meetup = await createMeetup(title.trim())
      setMeetups((prev) => [meetup, ...prev])
      setTitle('')
    } catch {
      setError('모임 생성에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <section className="home-card">
      <div className="home-card-head">
        <h2>밥약 모임</h2>
      </div>

      <form className="meetup-form" onSubmit={handleCreate}>
        <input
          type="text"
          placeholder="모임 이름 (예: 종강 전 마지막 밥약)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          required
        />
        <button className="auth-submit meetup-create-btn" type="submit" disabled={isCreating || !title.trim()}>
          {isCreating ? '만드는 중...' : '+ 만들기'}
        </button>
      </form>

      {error && <p className="auth-error">{error}</p>}

      {isLoaded && meetups.length === 0 && !error && (
        <p className="home-muted">
          아직 모임이 없습니다. 첫 밥약을 만들어보세요 — 친구 초대와 공강 시간 계산은 곧 추가됩니다.
        </p>
      )}

      {meetups.length > 0 && (
        <ul className="meetup-list">
          {meetups.map((meetup) => (
            <li key={meetup.id}>
              <Link className="meetup-link" to={`/meetups/${meetup.id}`}>
                <span className="meetup-title">{meetup.title}</span>
                <span className={`meetup-status meetup-status-${meetup.status}`}>
                  {STATUS_LABELS[meetup.status] ?? meetup.status}
                </span>
                <span className="meetup-date">{formatCreatedAt(meetup.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
