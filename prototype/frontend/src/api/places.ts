import { apiClient } from './client'

export type Place = {
  name: string
  category: string
  address: string
  road_address: string
  telephone: string
  link: string
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const { data } = await apiClient.get<{ items: Place[] }>('/places/search', {
    params: { query },
  })
  return data.items
}
