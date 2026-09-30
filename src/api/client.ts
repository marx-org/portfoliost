const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ""
const TOKEN_KEY = "portfoliost_token"

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : `Request failed with status ${status}`
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

/** fetch() itself failed (server unreachable, wrong host, offline…). */
export class NetworkError extends Error {
  readonly cause?: unknown

  constructor(cause?: unknown) {
    super("Network error — the server could not be reached")
    this.name = "NetworkError"
    this.cause = cause
  }
}

type RequestOptions = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  url: string
  body?: unknown
}

/**
 * Endpoints that must never trigger the refresh-and-replay path. The refresh
 * call itself answers 401 precisely when the session is dead, so retrying it
 * would recurse; logout is best-effort and its 401 says nothing useful.
 */
const NO_REFRESH_PREFIXES = ["/api/auth/refresh", "/api/auth/logout"]

type RefreshHandler = () => Promise<boolean>

let refreshHandler: RefreshHandler | null = null
let inflight: Promise<boolean> | null = null

/**
 * Registered by the auth store, which owns the token. Kept as a handler rather
 * than an import so this module stays free of a store cycle.
 */
export function setRefreshHandler(fn: RefreshHandler | null): void {
  refreshHandler = fn
}

/**
 * Run at most one refresh at a time, and share it with every caller (§77.5).
 *
 * This is a correctness requirement, not an optimisation. One dashboard load
 * fires ~15 parallel API requests; when the token has lapsed they all 401
 * together. Each calling refresh independently would break all but the first —
 * the server rotates the session, so the other 14 find no session and fail,
 * and the user sees a broken app rather than a silently renewed one.
 */
export function refreshSession(): Promise<boolean> {
  if (!inflight) {
    const run = refreshHandler ? refreshHandler() : Promise.resolve(false)
    // Never rejects: a failed refresh surfaces as `false` so callers can raise
    // the original error instead of an unhandled rejection.
    inflight = run.catch(() => false).finally(() => {
      inflight = null
    })
  }
  return inflight
}

function shouldAttemptRefresh(url: string): boolean {
  return !NO_REFRESH_PREFIXES.some((prefix) => url.startsWith(prefix))
}

async function request<T>({ method, url, body }: RequestOptions, retried = false): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" }
  // Read fresh on every attempt, so a replay after a refresh carries the new
  // token.
  const token = getToken()
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers["content-type"] = "application/json"

  let res: Response
  try {
    res = await fetch(`${API_BASE}${url}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    throw new NetworkError(e)
  }

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!res.ok) {
    // §77.5 — one refresh, one replay. Replay is safe for non-idempotent
    // methods because a 401 is raised by auth middleware *before* any handler
    // runs, so the first attempt caused no side effect.
    if (res.status === 401 && !retried && shouldAttemptRefresh(url)) {
      const renewed = await refreshSession()
      if (renewed) return request<T>({ method, url, body }, true)
    }
    throw new ApiError(res.status, data)
  }
  return data as T
}

export const http = {
  get: <T>(url: string) => request<T>({ method: "GET", url }),
  post: <T>(url: string, body?: unknown) => request<T>({ method: "POST", url, body }),
  patch: <T>(url: string, body?: unknown) => request<T>({ method: "PATCH", url, body }),
  put: <T>(url: string, body?: unknown) => request<T>({ method: "PUT", url, body }),
  delete: <T>(url: string) => request<T>({ method: "DELETE", url }),
}
