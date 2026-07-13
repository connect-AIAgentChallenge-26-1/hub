import { apiClient } from './client'

export interface Meetup {
  id: string
  creator_id: string
  title: string
  status: string
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
