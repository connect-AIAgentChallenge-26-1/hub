import { useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import {
  confirmPlace,
  searchRestaurants,
  FOOD_CATEGORIES,
  type MeetupDetail,
  type Restaurant,
  type RestaurantSearch,
} from '../api/meetups'

function errorDetail(err: unknown, fallback: string): string {
  const detail = axios.isAxiosError(err) ? err.response?.data?.detail : null
  return typeof detail === 'string' ? detail : fallback
}

interface Props {
  meetupId: string
  isCreator: boolean
  confirmedPlace: string | null
  onConfirmed: (meetup: MeetupDetail) => void
}

export function RestaurantSection({ meetupId, isCreator, confirmedPlace, onConfirmed }: Props) {
  const [location, setLocation] = useState('')
  const [category, setCategory] = useState('한식')
  const [result, setResult] = useState<RestaurantSearch | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      setResult(await searchRestaurants(meetupId, location.trim(), category))
    } catch (err) {
      setError(errorDetail(err, '맛집을 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm(r: Restaurant) {
    setConfirming(r.name)
    setError(null)
    try {
      onConfirmed(await confirmPlace(meetupId, r.name, r.category))
    } catch (err) {
      setError(errorDetail(err, '장소 확정에 실패했습니다.'))
    } finally {
      setConfirming(null)
    }
  }

  return (
    <section className="home-card">
      <div className="home-card-head">
        <h2>맛집 추천</h2>
      </div>

      <form className="rest-search" onSubmit={handleSearch}>
        <input
          type="text"
          placeholder="위치 (예: 숭실대, 홍대입구역)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          required
        />
        <button className="auth-submit rest-search-btn" type="submit" disabled={loading || !location.trim()}>
          {loading ? '찾는 중...' : '찾기'}
        </button>
      </form>

      <div className="cat-chips">
        {FOOD_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`cat-chip${category === c ? ' on' : ''}`}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {error && <p className="auth-error">{error}</p>}

      {result?.is_mock && (
        <p className="rest-mock-note">
          ※ 네이버·카카오 API 키가 없어 예시 데이터로 보여드려요. 키를 넣으면 실제 맛집이 나옵니다.
        </p>
      )}

      {result && result.restaurants.length > 0 && (
        <ul className="rest-list">
          {result.restaurants.map((r, i) => {
            const isConfirmed = confirmedPlace === r.name
            return (
              <li key={r.name} className={`rest-card${isConfirmed ? ' rest-card-confirmed' : ''}`}>
                {i === 0 && <span className="rest-ribbon">추천 1위</span>}
                <div className="rest-name">
                  {r.name}
                  {r.sources.includes('naver') && <span className="src-badge src-n">N</span>}
                  {r.sources.includes('kakao') && <span className="src-badge src-k">K</span>}
                </div>
                <div className="rest-meta">
                  <span className="rest-star">★ {r.rating.toFixed(1)}</span>
                  <span>리뷰 {r.review_count}</span>
                  <span>도보 {r.distance_min}분</span>
                </div>
                {isCreator && (
                  <button
                    className={`provider-btn rest-confirm-btn${isConfirmed ? '' : ' provider-btn-primary'}`}
                    disabled={confirming !== null || isConfirmed}
                    onClick={() => handleConfirm(r)}
                  >
                    {isConfirmed ? '✓ 여기로 확정됨' : confirming === r.name ? '확정 중...' : '여기로 확정'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
