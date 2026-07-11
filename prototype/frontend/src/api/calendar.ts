import { apiClient, API_BASE_URL } from './client'

export interface CalendarIntegration {
  id: string
  provider: string
  external_calendar_id: string
}

export interface CalendarEvent {
  id: string
  integration_id: string
  title: string
  start_time: string
  end_time: string
}

export function googleLoginUrl(): string {
  return `${API_BASE_URL}/auth/google/login`
}

export async function fetchIntegrations(): Promise<CalendarIntegration[]> {
  const { data } = await apiClient.get<CalendarIntegration[]>('/calendars/integrations')
  return data
}

export async function fetchEvents(): Promise<CalendarEvent[]> {
  const { data } = await apiClient.get<CalendarEvent[]>('/calendars/events')
  return data
}

export async function syncGoogleCalendar(): Promise<CalendarEvent[]> {
  const { data } = await apiClient.post<CalendarEvent[]>('/calendars/google/sync')
  return data
}

export async function connectEverytime(shareUrl: string): Promise<CalendarEvent[]> {
  const { data } = await apiClient.post<CalendarEvent[]>('/calendars/everytime/connect', {
    share_url: shareUrl,
  })
  return data
}

export async function syncEverytime(): Promise<CalendarEvent[]> {
  const { data } = await apiClient.post<CalendarEvent[]>('/calendars/everytime/sync')
  return data
}

export async function connectApple(appleId: string, appPassword: string): Promise<CalendarEvent[]> {
  const { data } = await apiClient.post<CalendarEvent[]>('/calendars/apple/connect', {
    apple_id: appleId,
    app_password: appPassword,
  })
  return data
}

export async function syncApple(): Promise<CalendarEvent[]> {
  const { data } = await apiClient.post<CalendarEvent[]>('/calendars/apple/sync')
  return data
}

export async function deleteIntegration(integrationId: string): Promise<void> {
  await apiClient.delete(`/calendars/integrations/${integrationId}`)
}
