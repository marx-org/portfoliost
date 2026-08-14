import { defineStore } from "pinia"
import { computed, ref } from "vue"

export type ThemePreference = "light" | "dark" | "system"

const STORAGE_KEY = "portfoliost_theme"

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches
}

function storedPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "light"
}

export const useThemeStore = defineStore("theme", () => {
  const preference = ref<ThemePreference>(storedPreference())
  const systemDark = ref(systemPrefersDark())

  const isDark = computed(() => (preference.value === "system" ? systemDark.value : preference.value === "dark"))

  let mediaQuery: MediaQueryList | null = null
  let mediaHandler: (() => void) | null = null

  function apply(): void {
    const root = document.documentElement
    root.classList.toggle("dark", isDark.value)
    root.style.colorScheme = isDark.value ? "dark" : "light"
  }

  function watchSystem(): void {
    if (typeof window.matchMedia !== "function") return
    mediaQuery?.removeEventListener("change", mediaHandler!)
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    systemDark.value = mediaQuery.matches
    mediaHandler = () => {
      systemDark.value = mediaQuery?.matches ?? false
    }
    mediaQuery.addEventListener("change", mediaHandler)
  }

  function init(): void {
    apply()
    watchSystem()
  }

  function setPreference(next: ThemePreference): void {
    preference.value = next
    localStorage.setItem(STORAGE_KEY, next)
    watchSystem()
    apply()
  }

  return { preference, isDark, init, setPreference }
})
