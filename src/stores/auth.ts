import { defineStore } from "pinia"
import { computed, ref } from "vue"
import { ApiError, clearToken, getToken, NetworkError, setRefreshHandler, setToken } from "@/api/client"
import * as authApi from "@/api/auth"
import type { AuthUser } from "@/api/types"
import { getOidcConfig } from "@/runtime-config"

export const useAuthStore = defineStore("auth", () => {
  const token = ref<string | null>(getToken())
  const user = ref<AuthUser | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  /** In-flight hydrateUser(), shared by every caller — see below. */
  let hydration: Promise<boolean> | null = null

  const isAuthenticated = computed(() => Boolean(token.value))

  /**
   * Three-state on purpose (§36): `true` admin, `false` not an admin, `null`
   * groups not known yet.
   *
   * `user` starts null and is only filled by an async /auth/me call, so on a
   * hard load it is null for as long as that request takes. Collapsing that to
   * `false` is what made every /en/admin/* deep link, refresh and bookmark
   * bounce to /en/investments: the router guard runs before the first /auth/me
   * resolves and read "unknown" as "no".
   */
  const isAdmin = computed(() => {
    if (!user.value) return null
    return user.value.groups?.includes("portfoliost_admin") ?? false
  })

  /**
   * Load `user` for an existing session, at most once and at most one request
   * in flight. Resolves true when the groups are known.
   *
   * Never rejects: the caller decides what an unknown user means. The router
   * guard awaits this before judging `/en/admin/*`; App.vue awaits it for
   * everything else. Deduplicated so a deep link does not fetch twice (guard +
   * App.vue both fire on a hard load).
   */
  function hydrateUser(): Promise<boolean> {
    if (!token.value) return Promise.resolve(false)
    if (!hydration) {
      hydration = fetchMe()
        .then(() => true)
        .catch(() => false)
        .finally(() => {
          hydration = null
        })
    }
    return hydration
  }

  // A network failure mid-login usually means the browser holds state from an
  // old session (stale token, dead backend). Force-logout locally so the next
  // attempt starts clean instead of retrying against broken state.
  function handleNetworkError(e: unknown): void {
    if (e instanceof NetworkError) {
      token.value = null
      user.value = null
      clearToken()
      error.value = e.message
      return
    }
    error.value = e instanceof Error ? e.message : "Login failed"
  }

  async function login(email: string, password: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await authApi.login({ email, password })
      token.value = res.access_token
      user.value = res.user
      setToken(res.access_token)
    } catch (err) {
      handleNetworkError(err)
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchMe(): Promise<void> {
    const res = await authApi.fetchMe()
    user.value = res.user
  }

  /**
   * Revoke server-side, then hand the browser to Pocket-ID's end-session.
   *
   * Falls back to a local-only logout if the network is unavailable — better a
   * token cleared on this device than a spinner that never resolves. The
   * refresh session then survives server-side, which is the one case where
   * "logged out" is not final; it expires on its own within 30 days.
   */
  async function logout(): Promise<void> {
    const idToken = token.value
    try {
      await authApi.logout(idToken)
    } catch {
      // ignore — local state is cleared regardless
    }
    token.value = null
    user.value = null
    clearToken()

    const { issuerUrl } = getOidcConfig()
    if (issuerUrl) {
      window.location.assign(authApi.buildEndSessionUrl(issuerUrl, idToken))
    }
  }

  async function loginWithCode(code: string, verifier: string, redirectUri: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = await authApi.loginWithCode({ code, verifier, redirect_uri: redirectUri })
      token.value = res.access_token
      user.value = res.user
      setToken(res.access_token)
    } catch (err) {
      handleNetworkError(err)
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Rotate the session (§77.5). Returns true when a fresh token is in place.
   *
   * Only an explicit 401 from the refresh endpoint means the session is truly
   * dead (logged out, user disabled, refresh revoked) and re-authentication is
   * the only way forward. A network error is transient, so it must not sign
   * the user out — the caller raises the original 401 instead.
   */
  // client.ts cannot import the store (cycle), so it calls back into here.
  setRefreshHandler(refreshSession)

  async function refreshSession(): Promise<boolean> {
    const current = token.value
    if (!current) return false
    try {
      const res = await authApi.refresh(current)
      token.value = res.access_token
      user.value = res.user
      setToken(res.access_token)
      return true
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        token.value = null
        user.value = null
        clearToken()
        // Dead session: a full navigation gives a clean slate, and mirrors what
        // logout already does.
        window.location.assign("/login")
      }
      return false
    }
  }

  return {
    token,
    user,
    loading,
    error,
    isAuthenticated,
    isAdmin,
    login,
    loginWithCode,
    fetchMe,
    hydrateUser,
    logout,
    refreshSession,
  }
})
