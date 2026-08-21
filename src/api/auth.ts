import { http } from "./client"
import type { components } from "../../generated/api-types"

type AuthMe = components["schemas"]["MeResponse"]
type AuthResponse = components["schemas"]["AuthResponse"]

export type LoginPayload = {
  email: string
  password: string
}

export type LoginWithCodePayload = {
  code: string
  verifier: string
  redirect_uri: string
}

export async function loginWithCode(payload: LoginWithCodePayload): Promise<AuthResponse> {
  return http.post<AuthResponse>("/api/auth/token", payload)
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
  await http.post("/api/auth/logout")
}
