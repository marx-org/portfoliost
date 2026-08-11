import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAuthStore } from "@/stores/auth"
import * as authApi from "@/api/auth"
import type { AuthMe, AuthResponse } from "@/api/types"

vi.mock("@/api/auth", () => ({
  login: vi.fn(),
  register: vi.fn(),
  fetchMe: vi.fn(),
  logout: vi.fn(),
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
})
