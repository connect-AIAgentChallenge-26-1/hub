import { apiClient } from './client'

export interface User {
  id: string
  name: string
  email: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
}

export async function registerUser(name: string, email: string, password: string): Promise<User> {
  const { data } = await apiClient.post<User>('/auth/register', { name, email, password })
  return data
}

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', { email, password })
  return data
}

export async function fetchCurrentUser(): Promise<User> {
  const { data } = await apiClient.get<User>('/auth/me')
  return data
}
