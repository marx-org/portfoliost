import { defineStore } from "pinia"
import { computed, ref } from "vue"
import { clearToken, getToken, NetworkError, setToken } from "@/api/client"
import * as authApi from "@/api/auth"
import type { AuthUser } from "@/api/types"
import { getOidcConfig } from "@/runtime-config"

export const useAuthStore = defineStore("auth", () => {
  const token = ref<string | null>(getToken())
  const user = ref<AuthUser | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => Boolean(token.value))
  const isAdmin = computed(() => user.value?.groups?.includes("portfoliost_admin") ?? false)

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

  return { token, user, loading, error, isAuthenticated, isAdmin, login, loginWithCode, fetchMe, logout }
})
