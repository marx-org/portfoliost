import { createI18n } from "vue-i18n"
import en from "./locales/en.json"
import pl from "./locales/pl.json"

/** The locales that ship today. The architecture allows more (add a JSON file
 * and register it here); only en + pl are translated. */
export const SUPPORTED_LOCALES = ["en", "pl"] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "en"

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: { en, pl },
})