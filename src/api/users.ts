import { http } from "./client"

export interface UserProfile {
  id: string
  email: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  groups: string[]
  language: string
  createdAt: string
  updatedAt: string
  isDemoUser: boolean
}

export interface UpdateUserProfileInput {
  firstName?: string
  lastName?: string
  language?: string
}

export async function getUserProfile(): Promise<UserProfile> {
  return http.get<UserProfile>("/api/users/profile")
}

export async function updateUserProfile(input: UpdateUserProfileInput): Promise<UserProfile> {
  return http.patch<UserProfile>("/api/users/profile", input)
}

export async function changePassword(newPassword: string): Promise<{ ok: true }> {
  return http.post<{ ok: true }>("/api/users/change-password", { newPassword })
}

export async function clearAllData(): Promise<void> {
  return http.post<void>("/api/users/clear-data")
}

export async function deleteAccount(): Promise<void> {
  return http.delete<void>("/api/users/account")
}
