import { useEffect, useState } from 'react'
import { fetchAvailableTimes, type AvailableSlot } from '../api/meetups'

type Filter = 'all' | 'lunch' | 'dinner'

function formatSlot(slot: AvailableSlot): { date: string; time: string; len: string } {
  const start = new Date(slot.start)
  const end = new Date(slot.end)
  const dateFmt: Intl.DateTimeFormatOptions = { month: 'numeric', day: 'numeric', weekday: 'short' }
  const timeFmt: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false }
  const h = Math.floor(slot.duration_min / 60)
  const m = slot.duration_min % 60
  const len = h > 0 ? `${h}시간${m > 0 ? ` ${m}분` : ''}` : `${m}분`
  return {
    date: start.toLocaleDateString('ko-KR', dateFmt),
    time: `${start.toLocaleTimeString('ko-KR', timeFmt)} ~ ${end.toLocaleTimeString('ko-KR', timeFmt)}`,
    len,
  }
}

export function AvailabilitySection({ meetupId }: { meetupId: string }) {
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [acceptedCount, setAcceptedCount] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    fetchAvailableTimes(meetupId)
      .then((data) => {
        setSlots(data.slots)
        setAcceptedCount(data.accepted_count)
      })
      .catch(() => setError('공강 시간을 계산하지 못했습니다.'))
      .finally(() => setIsLoaded(true))
  }, [meetupId])

  const filtered = slots.filter((s) => {
    if (filter === 'lunch') return s.overlaps_lunch
    if (filter === 'dinner') return s.overlaps_dinner
    return true
  })

  return (
    <section className="home-card">
      <div className="home-card-head">
        <h2>공강 시간</h2>
      </div>

      {!isLoaded && !error && <p className="home-muted">계산 중...</p>}

      {isLoaded && acceptedCount < 2 && !error && (
        <p className="home-muted">
          수락한 참여자가 {acceptedCount}명이에요. 2명 이상이 참여를 수락하면 공통 공강 시간을 찾아드립니다.
        </p>
      )}

      {error && <p className="auth-error">{error}</p>}

      {isLoaded && acceptedCount >= 2 && (
        <>
          <div className="slot-filters">
            <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
              전체
            </button>
            <button className={filter === 'lunch' ? 'on' : ''} onClick={() => setFilter('lunch')}>
              점심
            </button>
            <button className={filter === 'dinner' ? 'on' : ''} onClick={() => setFilter('dinner')}>
              저녁
            </button>
          </div>

          {filtered.length === 0 ? (
            <p className="home-muted">앞으로 2주 동안 조건에 맞는 공통 공강 시간이 없어요.</p>
          ) : (
            <ul className="slot-list">
              {filtered.map((slot, i) => {
                const f = formatSlot(slot)
                return (
                  <li key={i} className="slot-card">
                    <span className="slot-date">{f.date}</span>
                    <span className="slot-time">{f.time}</span>
                    <span className="slot-meta">
                      {f.len}
                      {slot.overlaps_lunch && <span className="slot-tag slot-tag-lunch">점심</span>}
                      {slot.overlaps_dinner && <span className="slot-tag slot-tag-dinner">저녁</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
