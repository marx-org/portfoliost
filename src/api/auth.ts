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

export async function logout(idToken: string | null): Promise<void> {
  // Send the current token so the backend can delete the matching refresh
  // session. Omitting it still works, but revokes nothing server-side.
  await http.post("/api/auth/logout", idToken ? { id_token: idToken } : {})
}

/**
 * Pocket-ID's OIDC end-session URL (§77.4).
 *
 * This must be a top-level navigation, not a router push: ending the session
 * means clearing Pocket-ID's cookie, which only happens on a real redirect to
 * its origin. `id_token_hint` is how it knows which session to end — and
 * Pocket-ID deliberately does not validate its expiry, so an already-lapsed
 * token is accepted.
 *
 * `post_logout_redirect_uri` must be one of the client's registered
 * `logoutCallbackUrls` or Pocket-ID ignores it and falls back to its own
 * logout page.
 */
export function buildEndSessionUrl(issuerUrl: string, idToken: string | null): string {
  const params = new URLSearchParams()
  if (idToken) params.set("id_token_hint", idToken)
  params.set("post_logout_redirect_uri", `${window.location.origin}/logout`)
  return `${issuerUrl}/api/oidc/end-session?${params.toString()}`
}
