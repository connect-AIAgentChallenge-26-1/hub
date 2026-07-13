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

export async function fetchMeetups(): Promise<Meetup[]> {
  const { data } = await apiClient.get<Meetup[]>('/meetups')
  return data
}

export async function createMeetup(title: string): Promise<Meetup> {
  const { data } = await apiClient.post<Meetup>('/meetups', { title })
  return data
}
