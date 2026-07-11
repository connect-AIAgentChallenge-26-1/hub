import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import {
  connectApple,
  connectEverytime,
  deleteIntegration,
  fetchEvents,
  fetchIntegrations,
  googleLoginUrl,
  syncApple,
  syncEverytime,
  syncGoogleCalendar,
  type CalendarEvent,
  type CalendarIntegration,
} from '../api/calendar'

const PROVIDER_LABELS: Record<string, string> = {
  google: '구글 캘린더',
  everytime: '에브리타임',
  apple: '애플 캘린더',
}

const SYNC_HANDLERS: Record<string, () => Promise<CalendarEvent[]>> = {
  google: syncGoogleCalendar,
  everytime: syncEverytime,
  apple: syncApple,
}

function errorDetail(err: unknown, fallback: string): string {
  const detail = axios.isAxiosError(err) ? err.response?.data?.detail : null
  return typeof detail === 'string' ? detail : fallback
}

function formatEventRange(event: CalendarEvent): string {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const dateFmt: Intl.DateTimeFormatOptions = { month: 'numeric', day: 'numeric', weekday: 'short' }
  const timeFmt: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false }
  const sameDay = start.toDateString() === end.toDateString()
  const startText = `${start.toLocaleDateString('ko-KR', dateFmt)} ${start.toLocaleTimeString('ko-KR', timeFmt)}`
  const endText = sameDay
    ? end.toLocaleTimeString('ko-KR', timeFmt)
    : `${end.toLocaleDateString('ko-KR', dateFmt)} ${end.toLocaleTimeString('ko-KR', timeFmt)}`
  return `${startText} ~ ${endText}`
}

export function CalendarSection() {
  const [integrations, setIntegrations] = useState<CalendarIntegration[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openForm, setOpenForm] = useState<'everytime' | 'apple' | null>(null)
  const [etaShareUrl, setEtaShareUrl] = useState('')
  const [appleId, setAppleId] = useState('')
  const [applePassword, setApplePassword] = useState('')

  const reload = useCallback(async () => {
    const [fetchedIntegrations, fetchedEvents] = await Promise.all([
      fetchIntegrations(),
      fetchEvents(),
    ])
    setIntegrations(fetchedIntegrations)
    setEvents(fetchedEvents)
  }, [])

  useEffect(() => {
    reload()
      .catch(() => setError('캘린더 정보를 불러오지 못했습니다.'))
      .finally(() => setIsLoaded(true))
  }, [reload])

  const providerOf = (integrationId: string) =>
    integrations.find((i) => i.id === integrationId)?.provider ?? ''

  function integrationFor(provider: string): CalendarIntegration | undefined {
    return integrations.find((i) => i.provider === provider)
  }

  async function run(provider: string, action: () => Promise<unknown>, fallbackError: string) {
    setBusy(provider)
    setError(null)
    try {
      await action()
      await reload()
      return true
    } catch (err) {
      setError(errorDetail(err, fallbackError))
      return false
    } finally {
      setBusy(null)
    }
  }

  function handleSync(provider: string) {
    run(provider, SYNC_HANDLERS[provider], '동기화에 실패했습니다. 잠시 후 다시 시도해주세요.')
  }

  async function handleDisconnect(provider: string) {
    const integration = integrationFor(provider)
    if (!integration) return
    if (!window.confirm(`${PROVIDER_LABELS[provider]} 연동을 해제할까요? 가져온 일정도 삭제됩니다.`))
      return
    run(provider, () => deleteIntegration(integration.id), '연동 해제에 실패했습니다.')
  }

  async function handleEtaConnect(e: FormEvent) {
    e.preventDefault()
    const ok = await run(
      'everytime',
      () => connectEverytime(etaShareUrl),
      '에브리타임 연동에 실패했습니다.',
    )
    if (ok) {
      setOpenForm(null)
      setEtaShareUrl('')
    }
  }

  async function handleAppleConnect(e: FormEvent) {
    e.preventDefault()
    const ok = await run(
      'apple',
      () => connectApple(appleId, applePassword),
      '애플 캘린더 연동에 실패했습니다.',
    )
    if (ok) {
      setOpenForm(null)
      setApplePassword('')
    }
  }

  function renderProviderRow(provider: 'google' | 'everytime' | 'apple') {
    const integration = integrationFor(provider)
    const isBusy = busy === provider
    return (
      <li className="provider-row" key={provider}>
        <div className="provider-head">
          <span className={`provider-chip provider-chip-${provider}`}>
            {PROVIDER_LABELS[provider]}
          </span>
          {integration ? (
            <span className="provider-status connected">연동됨</span>
          ) : (
            <span className="provider-status">미연동</span>
          )}
          <span className="provider-actions">
            {integration ? (
              <>
                <button
                  className="provider-btn"
                  disabled={isBusy}
                  onClick={() => handleSync(provider)}
                >
                  {isBusy ? '동기화 중...' : '동기화'}
                </button>
                <button
                  className="provider-btn provider-btn-danger"
                  disabled={isBusy}
                  onClick={() => handleDisconnect(provider)}
                >
                  해제
                </button>
              </>
            ) : provider === 'google' ? (
              <button
                className="provider-btn provider-btn-primary"
                onClick={() => {
                  window.location.href = googleLoginUrl()
                }}
              >
                연동하기
              </button>
            ) : (
              <button
                className="provider-btn provider-btn-primary"
                onClick={() => setOpenForm(openForm === provider ? null : provider)}
              >
                연동하기
              </button>
            )}
          </span>
        </div>

        {!integration && openForm === provider && provider === 'everytime' && (
          <form className="provider-form" onSubmit={handleEtaConnect}>
            <input
              type="text"
              placeholder="에타 시간표 공유 링크 (https://everytime.kr/@...)"
              value={etaShareUrl}
              onChange={(e) => setEtaShareUrl(e.target.value)}
              required
            />
            <button className="provider-btn provider-btn-primary" type="submit" disabled={isBusy}>
              {isBusy ? '연결 중...' : '연결'}
            </button>
            <p className="provider-hint">
              에타 앱 → 시간표 → 공유 → URL 복사로 링크를 만들 수 있어요.
            </p>
          </form>
        )}

        {!integration && openForm === provider && provider === 'apple' && (
          <form className="provider-form" onSubmit={handleAppleConnect}>
            <input
              type="email"
              placeholder="Apple ID (이메일)"
              value={appleId}
              onChange={(e) => setAppleId(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="앱 암호 (xxxx-xxxx-xxxx-xxxx)"
              value={applePassword}
              onChange={(e) => setApplePassword(e.target.value)}
              required
            />
            <button className="provider-btn provider-btn-primary" type="submit" disabled={isBusy}>
              {isBusy ? '연결 중...' : '연결'}
            </button>
            <p className="provider-hint">
              앱 암호는 account.apple.com → 로그인 및 보안 → 앱 암호에서 발급할 수 있어요. 애플
              계정 비밀번호가 아닙니다.
            </p>
          </form>
        )}
      </li>
    )
  }

  return (
    <section className="home-card">
      <div className="home-card-head">
        <h2>내 캘린더</h2>
      </div>

      {!isLoaded && !error && <p className="home-muted">불러오는 중...</p>}

      {isLoaded && (
        <ul className="provider-list">
          {renderProviderRow('google')}
          {renderProviderRow('everytime')}
          {renderProviderRow('apple')}
        </ul>
      )}

      {error && <p className="auth-error">{error}</p>}

      {isLoaded && integrations.length > 0 && events.length === 0 && !error && (
        <p className="home-muted">저장된 일정이 없습니다. ‘동기화’를 눌러 일정을 가져와보세요.</p>
      )}

      {events.length > 0 && (
        <ul className="home-events">
          {events.map((event) => (
            <li key={event.id}>
              <span
                className={`event-source event-source-${providerOf(event.integration_id)}`}
                title={PROVIDER_LABELS[providerOf(event.integration_id)]}
              />
              <span className="home-event-title">{event.title}</span>
              <span className="home-event-time">{formatEventRange(event)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
