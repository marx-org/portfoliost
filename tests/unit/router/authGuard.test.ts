import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RouteLocationNormalized } from "vue-router"
import { authGuard } from "@/router"
import { useAuthStore } from "@/stores/auth"
import * as authApi from "@/api/auth"
import type { AuthMe } from "@/api/types"

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

/**
 * §36 — the guard, on a hard load, is the first thing that reads `isAdmin`. It
 * has to survive `user` still being null (the async /auth/me has not answered
 * yet) without deciding the user is not an admin.
 */
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

/** A resolved navigation target, with only the fields the guard reads. */
function target(
  path: string,
  meta: { admin?: boolean; requiresAuth?: boolean; public?: boolean },
  name?: string,
): RouteLocationNormalized {
  return { path, fullPath: path, name, meta } as unknown as RouteLocationNormalized
}

const adminJobs = target("/en/admin/jobs", { admin: true, requiresAuth: true }, "admin-jobs")
const investments = target("/en/investments", { requiresAuth: true }, "investments")

describe("authGuard (§36)", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    window.__OIDC_CONFIG__ = { issuerUrl: "" }
    vi.clearAllMocks()
  })

  it("lets an admin through to a deep-linked admin route (the bug)", async () => {
    // The hard-load state: a valid session in localStorage, `user` still null
    // because /auth/me has not answered. That is the whole race.
    localStorage.setItem("portfoliost_token", "mock-token")
    mocked.fetchMe.mockResolvedValue(makeMe(["portfoliost_admin"]))

    await expect(authGuard(adminJobs)).resolves.toBe(true)
  })

  it("hydrates the user before deciding, rather than deciding on an empty store", async () => {
    localStorage.setItem("portfoliost_token", "mock-token")
    mocked.fetchMe.mockResolvedValue(makeMe(["portfoliost_admin"]))

    expect(useAuthStore().isAdmin).toBeNull()
    await authGuard(adminJobs)

    expect(mocked.fetchMe).toHaveBeenCalledTimes(1)
    expect(useAuthStore().isAdmin).toBe(true)
  })

  it("still bounces a non-admin off the same route", async () => {
    localStorage.setItem("portfoliost_token", "mock-token")
    mocked.fetchMe.mockResolvedValue(makeMe(["some_other_group"]))

    await expect(authGuard(adminJobs)).resolves.toEqual({ name: "investments" })
  })

  it("bounces a user with no groups at all", async () => {
    localStorage.setItem("portfoliost_token", "mock-token")
    mocked.fetchMe.mockResolvedValue(makeMe())

    await expect(authGuard(adminJobs)).resolves.toEqual({ name: "investments" })
  })

  it("fetches only once when the guard and App.vue both hydrate", async () => {
    localStorage.setItem("portfoliost_token", "mock-token")
    mocked.fetchMe.mockResolvedValue(makeMe(["portfoliost_admin"]))

    const auth = useAuthStore()
    await Promise.all([authGuard(adminJobs), auth.hydrateUser(), auth.hydrateUser()])

    expect(mocked.fetchMe).toHaveBeenCalledTimes(1)
  })

  it("sends an anonymous deep link to login with the path intact", async () => {
    await expect(authGuard(adminJobs)).resolves.toEqual({
      name: "login",
      query: { redirect: "/en/admin/jobs" },
    })
    expect(mocked.fetchMe).not.toHaveBeenCalled()
  })

  it("routes through login when the groups cannot be fetched, keeping the path", async () => {
    // Authenticated but unresolvable: landing on /en/investments would drop the
    // requested path with no way back, which is what made the original bounce
    // destructive.
    localStorage.setItem("portfoliost_token", "mock-token")
    mocked.fetchMe.mockRejectedValue(new Error("server unreachable"))

    await expect(authGuard(adminJobs)).resolves.toEqual({
      name: "login",
      query: { redirect: "/en/admin/jobs" },
    })
  })

  it("does not fetch the user for a non-admin route", async () => {
    localStorage.setItem("portfoliost_token", "mock-token")
    await expect(authGuard(investments)).resolves.toBe(true)
    expect(mocked.fetchMe).not.toHaveBeenCalled()
  })

  it("still sends an anonymous non-admin deep link to login with the path", async () => {
    await expect(authGuard(investments)).resolves.toEqual({
      name: "login",
      query: { redirect: "/en/investments" },
    })
  })

  it("still bounces an authenticated user off /login", async () => {
    localStorage.setItem("portfoliost_token", "mock-token")
    const login = target("/login", { public: true }, "login")

    await expect(authGuard(login)).resolves.toEqual({ name: "investments" })
    expect(mocked.fetchMe).not.toHaveBeenCalled()
  })
})
