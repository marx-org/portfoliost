const STORAGE_KEY_VERIFIER = "portfoliost_pkce_verifier"
const STORAGE_KEY_STATE = "portfoliost_pkce_state"

export function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => chars[b % chars.length]).join("")
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

export function saveVerifier(verifier: string): void {
  localStorage.setItem(STORAGE_KEY_VERIFIER, verifier)
}

export function getVerifier(): string | null {
  return localStorage.getItem(STORAGE_KEY_VERIFIER)
}

export function clearVerifier(): void {
  localStorage.removeItem(STORAGE_KEY_VERIFIER)
}

export function generateState(): string {
  const state = generateRandomString(32)
  localStorage.setItem(STORAGE_KEY_STATE, state)
  return state
}

export function validateState(state: string): boolean {
  const stored = localStorage.getItem(STORAGE_KEY_STATE)
  localStorage.removeItem(STORAGE_KEY_STATE)
  return stored === state
}

export async function createAuthorizationUrl(config: {
  issuerUrl: string
  clientId: string
  redirectUri: string
  scope?: string
}): Promise<{ url: string; verifier: string; state: string }> {
  const verifier = generateRandomString(128)
  const challenge = await generateCodeChallenge(verifier)
  const state = generateState()

  saveVerifier(verifier)

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scope || "openid profile email groups",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  })

  return {
    url: `${config.issuerUrl}/authorize?${params.toString()}`,
    verifier,
    state,
  }
}
