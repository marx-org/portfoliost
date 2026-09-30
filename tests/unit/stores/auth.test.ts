import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useAuthStore } from "@/stores/auth"
import * as authApi from "@/api/auth"
import { NetworkError } from "@/api/client"
import type { AuthMe, AuthResponse } from "@/api/types"

vi.mock("@/api/auth", () => ({
  login: vi.fn(),
  register: vi.fn(),
  fetchMe: vi.fn(),
  logout: vi.fn(),
  loginWithCode: vi.fn(),
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

function makeMe(): AuthMe {
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
    },
  }
}

describe("auth store", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
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
    const assign = vi.fn()
    vi.stubGlobal("location", { ...window.location, origin: "http://localhost:8080", assign })

    const store = useAuthStore()
    await store.logout()

    expect(store.isAuthenticated).toBe(false)
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
