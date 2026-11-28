import { defineStore } from "pinia"
import { ref } from "vue"
import { i18n, isLocale, DEFAULT_LOCALE, type Locale } from "@/i18n"
import { getUserProfile, updateUserProfile } from "@/api/users"

const STORAGE_KEY = "portfoliost_locale"

function storedLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY)
  return isLocale(stored) ? stored : DEFAULT_LOCALE
}

/** The UI locale. Mirrors `stores/displayCurrency.ts`: a localStorage-backed
 * display preference with best-effort server sync and two-way hydration.
 *
 * It reuses the existing `UserProfile.language` field (already written by the
 * ProfileView selector) rather than a parallel `uiPreferences.locale`, so there
 * is one source of truth for "what language does this user speak". Only en + pl
 * are shipped; a stored value outside that set falls back to en. */
export const useLocaleStore = defineStore("locale", () => {
  const locale = ref<Locale>(storedLocale())

  // Keep the i18n runtime in step with the store from the moment it is created.
  i18n.global.locale.value = locale.value

  function persist(next: Locale): void {
    locale.value = next
    i18n.global.locale.value = next
    localStorage.setItem(STORAGE_KEY, next)
    // Reflect the active language on <html lang> for a11y and CSS :lang().
    if (typeof document !== "undefined") document.documentElement.lang = next
  }

  /** Best-effort write-through to users_auth. A failed write must not break
   * choosing a language, so the local value stands and the next pick retries. */
  async function syncToServer(next: Locale): Promise<void> {
    try {
      await updateUserProfile({ language: next })
    } catch {
      // deliberately silent — see above
    }
  }

  function setLocale(next: Locale): void {
    persist(next)
    void syncToServer(next)
  }

  /** Reconcile the stored locale with the server, both directions:
   *  - server has one, this browser does not → adopt it (follows the user).
   *  - this browser has one, the server does not → write it through.
   * The local value wins on disagreement: it is what the user is looking at now. */
  async function hydrateFromServer(): Promise<void> {
    const local = localStorage.getItem(STORAGE_KEY)
    if (isLocale(local)) {
      try {
        const profile = await getUserProfile()
        if (!isLocale(profile.language)) {
          await syncToServer(local)
        } else if (profile.language !== local) {
          // Server has a different valid locale but this browser already chose
          // one — keep the local choice and push it, matching displayCurrency.
          await syncToServer(local)
        }
      } catch {
        // server unreachable — the local value stands and the next pick retries
      }
      return
    }
    try {
      const profile = await getUserProfile()
      if (isLocale(profile.language)) {
        persist(profile.language)
      }
    } catch {
      // no server preference yet — keep the default (already applied at creation)
    }
  }

  return { locale, setLocale, hydrateFromServer }
})