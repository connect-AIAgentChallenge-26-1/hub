import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { Link, useParams } from 'react-router-dom'
import {
  fetchMeetup,
  inviteParticipant,
  respondToInvite,
  searchUsers,
  type MeetupDetail,
  type UserSearchResult,
} from '../api/meetups'
import { AvailabilitySection } from '../components/AvailabilitySection'
import { useAuth } from '../context/AuthContext'
import './auth.css'
import './home.css'

const STATUS_LABELS: Record<string, string> = {
  pending: '대기 중',
  accepted: '수락',
  declined: '거절',
}

function errorDetail(err: unknown, fallback: string): string {
  const detail = axios.isAxiosError(err) ? err.response?.data?.detail : null
  return typeof detail === 'string' ? detail : fallback
}

function formatConfirmed(startIso: string, endIso: string | null): string {
  const start = new Date(startIso)
  const dateFmt: Intl.DateTimeFormatOptions = {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }
  const timeFmt: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false }
  const base = `${start.toLocaleDateString('ko-KR', dateFmt)} ${start.toLocaleTimeString('ko-KR', timeFmt)}`
  if (!endIso) return base
  const end = new Date(endIso)
  return `${base} ~ ${end.toLocaleTimeString('ko-KR', timeFmt)}`
}

export function MeetupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [meetup, setMeetup] = useState<MeetupDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserSearchResult[]>([])
  const searchTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!id) return
    fetchMeetup(id)
      .then(setMeetup)
      .catch((err) =>
        setLoadError(errorDetail(err, '모임을 불러오지 못했습니다.')),
      )
  }, [id])

  const isCreator = !!meetup && !!user && meetup.creator_id === user.id
  const myParticipation = meetup?.participants.find((p) => p.user_id === user?.id)
  const canRespond = !!myParticipation && !isCreator && myParticipation.invite_status !== 'accepted'
  const invitedIds = new Set(meetup?.participants.map((p) => p.user_id) ?? [])

  function handleSearch(value: string) {
    setQuery(value)
    window.clearTimeout(searchTimer.current)
    if (value.trim().length < 2) {
      setResults([])
      return
    }
    searchTimer.current = window.setTimeout(async () => {
      try {
        setResults(await searchUsers(value.trim()))
      } catch {
        setResults([])
      }
    }, 250)
  }

  async function handleInvite(email: string) {
    if (!id) return
    setBusy(true)
    setActionError(null)
    try {
      setMeetup(await inviteParticipant(id, email))
      setQuery('')
      setResults([])
    } catch (err) {
      setActionError(errorDetail(err, '초대에 실패했습니다.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleRespond(action: 'accept' | 'decline') {
    if (!id) return
    setBusy(true)
    setActionError(null)
    try {
      setMeetup(await respondToInvite(id, action))
    } catch (err) {
      setActionError(errorDetail(err, '응답에 실패했습니다.'))
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <div className="home-page">
        <main className="home-main">
          <p className="auth-error">{loadError}</p>
          <Link className="meetup-back" to="/">
            ← 홈으로
          </Link>
        </main>
      </div>
    )
  }

  if (!meetup) {
    return (
      <div className="home-page">
        <main className="home-main">
          <p className="home-muted">불러오는 중...</p>
        </main>
      </div>
    )
  }

  return (
    <div className="home-page">
      <header className="home-header">
        <Link className="meetup-back" to="/">
          ← 밥약
        </Link>
        <div className="home-user">
          <span>{user?.name}님</span>
        </div>
      </header>

      <main className="home-main">
        <section className="home-card">
          <div className="home-card-head">
            <h2>{meetup.title}</h2>
            <span className={`meetup-status meetup-status-${meetup.status}`}>
              {meetup.status === 'matching'
                ? '매칭 중'
                : meetup.status === 'time_fixed'
                  ? '시간 확정'
                  : meetup.status}
            </span>
          </div>

          {meetup.confirmed_start && (
            <div className="confirmed-banner">
              <span className="confirmed-icon">🗓️</span>
              <div>
                <div className="confirmed-label">확정된 밥약 시간</div>
                <div className="confirmed-time">{formatConfirmed(meetup.confirmed_start, meetup.confirmed_end)}</div>
              </div>
            </div>
          )}

          {canRespond && (
            <div className="invite-banner">
              <span>이 밥약에 초대받았어요. 참여할까요?</span>
              <div className="invite-banner-actions">
                <button className="provider-btn provider-btn-primary" disabled={busy} onClick={() => handleRespond('accept')}>
                  수락
                </button>
                <button className="provider-btn provider-btn-danger" disabled={busy} onClick={() => handleRespond('decline')}>
                  거절
                </button>
              </div>
            </div>
          )}

          <h3 className="meetup-subhead">참여자 {meetup.participants.length}명</h3>
          <ul className="participant-list">
            {meetup.participants.map((p) => (
              <li key={p.user_id}>
                <span className="participant-name">
                  {p.name}
                  {p.user_id === meetup.creator_id && <span className="participant-tag">방장</span>}
                </span>
                <span className={`meetup-status pstatus-${p.invite_status}`}>
                  {STATUS_LABELS[p.invite_status] ?? p.invite_status}
                </span>
              </li>
            ))}
          </ul>

          {actionError && <p className="auth-error">{actionError}</p>}

          {isCreator && (
            <div className="invite-box-wrap">
              <h3 className="meetup-subhead">친구 초대</h3>
              <input
                className="invite-search"
                type="text"
                placeholder="이메일로 검색 (2글자 이상)"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
              />
              {results.length > 0 && (
                <ul className="search-results">
                  {results.map((u) => {
                    const already = invitedIds.has(u.id)
                    return (
                      <li key={u.id}>
                        <span>
                          <b>{u.name}</b> <span className="home-muted">{u.email}</span>
                        </span>
                        <button
                          className="provider-btn provider-btn-primary"
                          disabled={busy || already}
                          onClick={() => handleInvite(u.email)}
                        >
                          {already ? '초대됨' : '초대'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </section>

        {id && (
          <AvailabilitySection
            meetupId={id}
            isCreator={isCreator}
            confirmedStart={meetup.confirmed_start}
            onConfirmed={setMeetup}
          />
        )}
      </main>
    </div>
  )
}
