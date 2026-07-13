import { apiClient } from './client'

export interface Meetup {
  id: string
  creator_id: string
  title: string
  status: string
  confirmed_start: string | null
  confirmed_end: string | null
  location_name: string | null
  food_category: string | null
  created_at: string
}

export interface Participant {
  user_id: string
  name: string
  email: string
  invite_status: string
}

export interface MeetupDetail extends Meetup {
  participants: Participant[]
}

export interface UserSearchResult {
  id: string
  name: string
  email: string
}

export async function fetchMeetups(): Promise<Meetup[]> {
  const { data } = await apiClient.get<Meetup[]>('/meetups')
  return data
}

export async function createMeetup(title: string): Promise<Meetup> {
  const { data } = await apiClient.post<Meetup>('/meetups', { title })
  return data
}

export async function fetchMeetup(id: string): Promise<MeetupDetail> {
  const { data } = await apiClient.get<MeetupDetail>(`/meetups/${id}`)
  return data
}

export async function searchUsers(email: string): Promise<UserSearchResult[]> {
  const { data } = await apiClient.get<UserSearchResult[]>('/users/search', {
    params: { email },
  })
  return data
}

export async function inviteParticipant(id: string, email: string): Promise<MeetupDetail> {
  const { data } = await apiClient.post<MeetupDetail>(`/meetups/${id}/participants`, { email })
  return data
}

export async function respondToInvite(
  id: string,
  action: 'accept' | 'decline',
): Promise<MeetupDetail> {
  const { data } = await apiClient.post<MeetupDetail>(`/meetups/${id}/respond`, { action })
  return data
}

export interface AvailableSlot {
  start: string
  end: string
  duration_min: number
  overlaps_lunch: boolean
  overlaps_dinner: boolean
}

export interface AvailableTimes {
  accepted_count: number
  slots: AvailableSlot[]
}

export async function fetchAvailableTimes(id: string): Promise<AvailableTimes> {
  const { data } = await apiClient.get<AvailableTimes>(`/meetups/${id}/available-times`)
  return data
}

export async function confirmTime(
  id: string,
  start: string,
  end: string,
): Promise<MeetupDetail> {
  const { data } = await apiClient.post<MeetupDetail>(`/meetups/${id}/confirm-time`, { start, end })
  return data
}
