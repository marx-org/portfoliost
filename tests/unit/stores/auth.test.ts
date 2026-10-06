import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useAuthStore } from "@/stores/auth"
import * as authApi from "@/api/auth"
import { ApiError, NetworkError } from "@/api/client"
import type { AuthMe, AuthResponse } from "@/api/types"

vi.mock("@/api/auth", () => ({
  login: vi.fn(),
  register: vi.fn(),
  fetchMe: vi.fn(),
  logout: vi.fn(),
  loginWithCode: vi.fn(),
  refresh: vi.fn(),
  buildEndSessionUrl: vi.fn((issuer: string) => `${issuer}/api/oidc/end-session`),
}))

const mocked = vi.mocked(authApi)

function makeResponse(): AuthResponse {
  return {
    access_token: "mock-token",
    token_type: "bearer",
    expires_in: 3600,
    user: {
      id: "00000000-0000-4000-8000-000000000001",
      email: "demo@example.com",
      language: "en",
      role: "user",
      isDemoUser: true,
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-01T10:00:00.000Z",
      lastLoginAt: "2026-08-11T09:00:00.000Z",
    },
  }
}

function makeMe(groups?: string[]): AuthMe {
  return {
    user: {
      id: "00000000-0000-4000-8000-000000000001",
      email: "demo@example.com",
      language: "en",
      role: "user",
      isDemoUser: true,
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-01T10:00:00.000Z",
      lastLoginAt: "2026-08-11T09:00:00.000Z",
      groups,
    },
  }
}

describe("auth store", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    // Clear call counts between tests: the hydration assertions below count
    // /auth/me requests, which would otherwise accumulate across the suite.
    // clearAllMocks keeps mock implementations (buildEndSessionUrl) intact.
    vi.clearAllMocks()
    // Default: OIDC configured, like production. Individual tests override.
    window.__OIDC_CONFIG__ = { issuerUrl: "https://pocket-id.test" }
  })

  afterEach(() => {
    delete window.__OIDC_CONFIG__
  })

  it("starts unauthenticated without a stored token", () => {
    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
  })

  it("logs in, persists token and user", async () => {
    mocked.login.mockResolvedValue(makeResponse())
    const store = useAuthStore()
    await store.login("demo@example.com", "example-service-mock")

    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.email).toBe("demo@example.com")
    expect(localStorage.getItem("portfoliost_token")).toBe("mock-token")
    expect(mocked.login).toHaveBeenCalledWith({ email: "demo@example.com", password: "example-service-mock" })
  })

  it("stores the error and rethrows when login fails", async () => {
    mocked.login.mockRejectedValue(new Error("Invalid email or password"))
    const store = useAuthStore()
    await expect(store.login("x@y.com", "wrong")).rejects.toThrow()
    expect(store.error).toBe("Invalid email or password")
    expect(store.isAuthenticated).toBe(false)
  })

  it("fetches the current user", async () => {
    mocked.fetchMe.mockResolvedValue(makeMe())
    localStorage.setItem("portfoliost_token", "mock-token")
    const store = useAuthStore()
    await store.fetchMe()
    expect(store.user?.email).toBe("demo@example.com")
  })

  // §36 — isAdmin is three-state. Collapsing "not loaded yet" into `false` is
  // what made the router guard bounce every /en/admin/* deep link on a hard
  // load, before the first /auth/me had resolved.
  it("reports isAdmin as unknown until the user is loaded", () => {
    localStorage.setItem("portfoliost_token", "mock-token")
    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(true)
    expect(store.isAdmin).toBeNull()
  })

  it("reports isAdmin true for the admin group, false without it", async () => {
    mocked.fetchMe.mockResolvedValueOnce(makeMe(["portfoliost_admin"]))
    localStorage.setItem("portfoliost_token", "mock-token")
    const store = useAuthStore()
    await store.hydrateUser()
    expect(store.isAdmin).toBe(true)

    mocked.fetchMe.mockResolvedValueOnce(makeMe(["portfoliost_user"]))
    store.user = null
    await store.hydrateUser()
    expect(store.isAdmin).toBe(false)
  })

  it("knows isAdmin immediately after a login, with no extra fetch", async () => {
    mocked.login.mockResolvedValue({ ...makeResponse(), user: { ...makeResponse().user, groups: ["portfoliost_admin"] } })
    const store = useAuthStore()
    await store.login("demo@example.com", "example-service-mock")
    expect(store.isAdmin).toBe(true)
    expect(mocked.fetchMe).not.toHaveBeenCalled()
  })

  it("hydrates once and shares the request between concurrent callers", async () => {
    mocked.fetchMe.mockResolvedValue(makeMe(["portfoliost_admin"]))
    localStorage.setItem("portfoliost_token", "mock-token")
    const store = useAuthStore()
    await Promise.all([store.hydrateUser(), store.hydrateUser(), store.hydrateUser()])
    expect(mocked.fetchMe).toHaveBeenCalledTimes(1)
  })

  it("resolves false rather than rejecting when hydration fails", async () => {
    mocked.fetchMe.mockRejectedValue(new NetworkError())
    localStorage.setItem("portfoliost_token", "mock-token")
    const store = useAuthStore()
    await expect(store.hydrateUser()).resolves.toBe(false)
    // Still unknown — the caller decides, and the session is untouched.
    expect(store.isAdmin).toBeNull()
    expect(store.isAuthenticated).toBe(true)
  })

  it("does not call /auth/me without a session", async () => {
    const store = useAuthStore()
    await expect(store.hydrateUser()).resolves.toBe(false)
    expect(mocked.fetchMe).not.toHaveBeenCalled()
  })

  it("clears state on logout even if the API call fails", async () => {
    mocked.logout.mockRejectedValue(new Error("boom"))
    localStorage.setItem("portfoliost_token", "mock-token")
    const store = useAuthStore()
    await store.logout()
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(localStorage.getItem("portfoliost_token")).toBeNull()
  })

  it("sends the current token so the backend can revoke the refresh session (§77.4)", async () => {
    mocked.logout.mockResolvedValue(undefined)
    localStorage.setItem("portfoliost_token", "the-current-token")
    const store = useAuthStore()
    await store.logout()
    expect(mocked.logout).toHaveBeenCalledWith("the-current-token")
  })

  it("ends the Pocket-ID session by navigating to end-session, not a router push (§77.4)", async () => {
    mocked.logout.mockResolvedValue(undefined)
    localStorage.setItem("portfoliost_token", "tok")
    const assign = vi.fn()
    vi.stubGlobal("location", { ...window.location, origin: "https://app.test", assign })

    const store = useAuthStore()
    await store.logout()

    // A router push would leave Pocket-ID's cookie alive — the whole point is
    // that ending the session needs a real navigation to its origin.
    expect(assign).toHaveBeenCalledTimes(1)
    expect(String(assign.mock.calls[0][0])).toContain("/api/oidc/end-session")
    vi.unstubAllGlobals()
  })

  it("still clears local state when Pocket-ID is not configured (local dev)", async () => {
    mocked.logout.mockResolvedValue(undefined)
    localStorage.setItem("portfoliost_token", "tok")
    window.__OIDC_CONFIG__ = { issuerUrl: "" }
    const assign = vi.fn()
    vi.stubGlobal("location", { ...window.location, origin: "http://localhost:8080", assign })

    const store = useAuthStore()
    await store.logout()

    expect(store.isAuthenticated).toBe(false)
    expect(assign).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it("swaps in the refreshed token and user (§77.5)", async () => {
    mocked.refresh.mockResolvedValue(makeResponse())
    localStorage.setItem("portfoliost_token", "stale")
    const store = useAuthStore()

    await expect(store.refreshSession()).resolves.toBe(true)

    expect(mocked.refresh).toHaveBeenCalledWith("stale")
    expect(localStorage.getItem("portfoliost_token")).toBe("mock-token")
    expect(store.user?.email).toBe("demo@example.com")
  })

  it("clears the session and sends the user to login when the refresh is rejected (§77.5)", async () => {
    mocked.refresh.mockRejectedValue(new ApiError(401, { message: "No active session" }))
    localStorage.setItem("portfoliost_token", "stale")
    const assign = vi.fn()
    vi.stubGlobal("location", { ...window.location, assign })

    const store = useAuthStore()
    await expect(store.refreshSession()).resolves.toBe(false)

    expect(store.isAuthenticated).toBe(false)
    expect(localStorage.getItem("portfoliost_token")).toBeNull()
    expect(assign).toHaveBeenCalledWith("/login")
    vi.unstubAllGlobals()
  })

  it("keeps the session when the refresh fails on a network error (§77.5)", async () => {
    // A transient failure must not sign the user out — only an explicit 401
    // means the session is actually dead.
    mocked.refresh.mockRejectedValue(new NetworkError())
    localStorage.setItem("portfoliost_token", "stale")
    const assign = vi.fn()
    vi.stubGlobal("location", { ...window.location, assign })

    const store = useAuthStore()
    await expect(store.refreshSession()).resolves.toBe(false)

    expect(localStorage.getItem("portfoliost_token")).toBe("stale")
    expect(assign).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it("network error during login forces local logout of a stale session", async () => {
    localStorage.setItem("portfoliost_token", "stale-token")
    mocked.login.mockRejectedValue(new NetworkError())
    const store = useAuthStore()
    await expect(store.login("x@y.com", "pw")).rejects.toThrow(NetworkError)
    expect(localStorage.getItem("portfoliost_token")).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(store.error).toBe("Network error — the server could not be reached")
  })

  it("network error during OIDC token exchange forces local logout too", async () => {
    localStorage.setItem("portfoliost_token", "stale-token")
    mocked.loginWithCode.mockRejectedValue(new NetworkError())
    const store = useAuthStore()
    await expect(store.loginWithCode("code", "verifier", "http://localhost:3000/auth/callback")).rejects.toThrow(
      NetworkError,
    )
    expect(localStorage.getItem("portfoliost_token")).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(store.error).toBe("Network error — the server could not be reached")
  })
})
