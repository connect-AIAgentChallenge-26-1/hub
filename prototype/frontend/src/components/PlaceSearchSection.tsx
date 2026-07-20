import { useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import { searchPlaces, type Place } from '../api/places'

function errorDetail(error: unknown): string {
  const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null
  return typeof detail === 'string' ? detail : '맛집을 검색하지 못했습니다. 잠시 후 다시 시도해주세요.'
}

export function PlaceSearchSection() {
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<Place[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const keyword = query.trim()
    if (keyword.length < 2) {
      setError('두 글자 이상 입력해주세요.')
      return
    }

    setIsSearching(true)
    setError(null)
    try {
      setPlaces(await searchPlaces(keyword))
      setHasSearched(true)
    } catch (err) {
      setError(errorDetail(err))
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <section className="home-card place-search">
      <div className="home-card-head">
        <div>
          <h2>어디서 먹을까요?</h2>
          <p className="home-muted">장소나 메뉴를 입력해 맛집을 찾아보세요.</p>
        </div>
      </div>

      <form className="place-search-form" onSubmit={handleSubmit}>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="예: 학교 앞 파스타, 강남역 국밥"
          aria-label="맛집 검색어"
        />
        <button className="provider-btn provider-btn-primary" type="submit" disabled={isSearching}>
          {isSearching ? '검색 중...' : '검색'}
        </button>
      </form>

      {error && <p className="auth-error">{error}</p>}

      {hasSearched && !error && places.length === 0 && (
        <p className="home-muted">검색 결과가 없습니다. 다른 검색어로 시도해보세요.</p>
      )}

      {places.length > 0 && (
        <ul className="place-list">
          {places.map((place, index) => (
            <li key={`${place.name}-${place.address}-${index}`}>
              <div>
                <strong>{place.name}</strong>
                {place.category && <span className="place-category">{place.category}</span>}
                <p>{place.road_address || place.address}</p>
                {place.telephone && <p>{place.telephone}</p>}
              </div>
              {place.link && (
                <a href={place.link} target="_blank" rel="noreferrer">
                  자세히 보기
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
