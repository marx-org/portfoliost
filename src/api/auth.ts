import { http } from "./client"
import type { AuthMe, AuthResponse } from "./types"

export type LoginPayload = {
  email: string
  password: string
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  return http.post<AuthResponse>("/api/auth/login", payload)
}

export async function register(payload: LoginPayload): Promise<AuthResponse> {
  return http.post<AuthResponse>("/api/auth/register", payload)
}

export async function fetchMe(): Promise<AuthMe> {
  return http.get<AuthMe>("/api/auth/me")
}

export async function logout(): Promise<void> {
  await http.delete("/api/auth/logout")
}
