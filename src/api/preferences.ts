import { http } from "./client"

/** The shape users_auth stores in `user_preferences.ui_preferences` — a free-form
 * JSON blob. Only the keys this app owns are typed. */
export interface UiPreferences {
  /** §67.1 — the user's Display-currency choice. The SPA's display-currency
   * selector IS this preference; it used to live only in localStorage, so the
   * backend's `preferredBaseCurrency()` could never see it and always fell back
   * to its USD default. Writing it through is what lets `total-metrics`
   * denominate the aggregate in a currency that means something. */
  baseCurrency?: string
  [key: string]: unknown
}

export interface UserPreferences {
  id: string
  userId: string
  uiPreferences: UiPreferences
  createdAt?: string
  updatedAt?: string
}

export function getUserPreferences(): Promise<UserPreferences> {
  return http.get<UserPreferences>("/api/users/preferences")
}

/** Merge `patch` into the stored ui_preferences. */
export function patchUserPreferences(patch: UiPreferences): Promise<UserPreferences> {
  return http.patch<UserPreferences>("/api/users/preferences", { uiPreferences: patch })
}
