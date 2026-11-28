<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { useAuthStore } from "@/stores/auth"
import { useThemeStore, type ThemePreference } from "@/stores/theme"
import { useLocaleStore } from "@/stores/locale"
import { SUPPORTED_LOCALES, isLocale, type Locale } from "@/i18n"
import { changePassword, clearAllData, deleteAccount, getUserProfile, updateUserProfile } from "@/api/users"
import type { UserProfile } from "@/api/users"

const { t } = useI18n()
const auth = useAuthStore()
const theme = useThemeStore()
const localeStore = useLocaleStore()

const profile = ref<UserProfile | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

const form = ref({ firstName: "", lastName: "" })
const saving = ref(false)
const saveError = ref<string | null>(null)

const LANGUAGE_LABELS: Record<Locale, string> = {
  en: "🇺🇸 English",
  pl: "🇵🇱 Polski",
}

// Derived from what actually ships, so registering a new locale in
// SUPPORTED_LOCALES (plus its label) is enough to surface it here.
const languages: { value: Locale; label: string }[] = SUPPORTED_LOCALES.map((value) => ({
  value,
  label: LANGUAGE_LABELS[value],
}))

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

const password = ref({ newPassword: "", confirm: "" })
const passwordBusy = ref(false)
const passwordError = ref<string | null>(null)
const passwordOk = ref(false)

const dangerDialog = ref<"clear" | "delete" | null>(null)
const dangerBusy = ref(false)
const dangerError = ref<string | null>(null)

const changed = computed(() => {
  if (!profile.value) return false
  return form.value.firstName !== profile.value.firstName || form.value.lastName !== profile.value.lastName
})

const passwordValid = computed(() => {
  const p = password.value.newPassword
  return p.length >= 8 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && p === password.value.confirm
})

async function load() {
  loading.value = true
  error.value = null
  try {
    profile.value = await getUserProfile()
    form.value.firstName = profile.value.firstName ?? ""
    form.value.lastName = profile.value.lastName ?? ""
  } catch (err) {
    error.value = err instanceof Error ? err.message : t("settings.profile.loadProfileError")
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function saveProfile() {
  if (!profile.value || !changed.value) return
  saving.value = true
  saveError.value = null
  try {
    profile.value = await updateUserProfile({ firstName: form.value.firstName.trim(), lastName: form.value.lastName.trim() })
    form.value.firstName = profile.value.firstName ?? ""
    form.value.lastName = profile.value.lastName ?? ""
    notice.value = t("settings.profile.profileSaved")
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : t("settings.profile.saveProfileError")
  } finally {
    saving.value = false
  }
}

async function changeLanguage(e: Event) {
  const next = (e.target as HTMLSelectElement).value
  if (!isLocale(next)) return
  // The store persists, applies to i18n immediately, and writes through to the
  // server (UserProfile.language). Update the local profile copy for the UI.
  localeStore.setLocale(next)
  if (profile.value) profile.value = { ...profile.value, language: next }
  notice.value = t("settings.profile.languageSaved")
}

async function submitPassword() {
  if (!passwordValid.value) return
  passwordBusy.value = true
  passwordError.value = null
  passwordOk.value = false
  try {
    await changePassword(password.value.newPassword)
    password.value.newPassword = ""
    password.value.confirm = ""
    passwordOk.value = true
    notice.value = t("settings.profile.passwordUpdated")
  } catch (err) {
    passwordError.value = err instanceof Error ? err.message : t("settings.profile.updatePasswordError")
  } finally {
    passwordBusy.value = false
  }
}

async function confirmDanger() {
  if (!dangerDialog.value) return
  dangerBusy.value = true
  dangerError.value = null
  try {
    if (dangerDialog.value === "clear") {
      await clearAllData()
      notice.value = t("settings.profile.allDataCleared")
    } else {
      await deleteAccount()
      await auth.logout()
      return
    }
    dangerDialog.value = null
  } catch (err) {
    dangerError.value = err instanceof Error ? err.message : t("settings.profile.operationFailed")
  } finally {
    dangerBusy.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="notice" class="rounded-lg bg-green-50 dark:bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">{{ notice }}</p>
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">{{ t("settings.profile.loading") }}</p>

    <template v-if="profile">
      <section class="card p-6">
        <h2 class="mb-4 text-base font-semibold">{{ t("settings.profile.profileSettings") }}</h2>
        <div class="flex items-center gap-4 mb-6">
          <img
            v-if="profile.avatarUrl"
            :src="profile.avatarUrl"
            :alt="`${profile.firstName || ''} ${profile.lastName || ''}`.trim() || t('settings.profile.avatarAlt')"
            class="h-16 w-16 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700"
          />
          <div
            v-else
            class="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20 text-xl font-semibold text-blue-600 dark:text-blue-400 ring-2 ring-slate-200 dark:ring-slate-700"
          >
            {{ (profile.firstName?.[0] || profile.email[0] || "?").toUpperCase() }}
          </div>
          <div>
            <p class="text-sm text-slate-500 dark:text-slate-400">{{ t("settings.profile.avatarManaged") }}</p>
          </div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="first-name" class="label">{{ t("settings.profile.firstName") }}</label>
            <input id="first-name" v-model="form.firstName" type="text" class="input" />
          </div>
          <div>
            <label for="last-name" class="label">{{ t("settings.profile.lastName") }}</label>
            <input id="last-name" v-model="form.lastName" type="text" class="input" />
          </div>
          <div class="sm:col-span-2">
            <label for="email" class="label">{{ t("settings.profile.email") }}</label>
            <input id="email" :value="profile.email" type="email" disabled class="input cursor-not-allowed bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400" />
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ t("settings.profile.emailLocked") }}</p>
          </div>
          <div class="sm:col-span-2">
            <label class="label">{{ t("settings.profile.groups") }}</label>
            <div class="flex flex-wrap gap-2 mt-1">
              <span
                v-for="group in profile.groups"
                :key="group"
                class="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400"
              >{{ group }}</span>
              <span v-if="!profile.groups?.length" class="text-sm text-slate-500 dark:text-slate-400">{{ t("settings.profile.noGroups") }}</span>
            </div>
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ t("settings.profile.groupsManaged") }}</p>
          </div>
        </div>
        <p v-if="saveError" class="mt-3 text-sm text-red-600 dark:text-red-400">{{ saveError }}</p>
        <div class="mt-4">
          <button type="button" class="btn-primary" :disabled="!changed || saving" @click="saveProfile">
            {{ saving ? t("settings.profile.saving") : t("settings.profile.saveChanges") }}
          </button>
        </div>
      </section>

      <section class="card p-6">
        <h3 class="text-base font-semibold">{{ t("settings.profile.languagePreference") }}</h3>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ t("settings.profile.languageHelp") }}</p>
        <select class="input mt-4 max-w-xs" :aria-label="t('settings.profile.languageAria')" :value="localeStore.locale" @change="changeLanguage">
          <option v-for="lang in languages" :key="lang.value" :value="lang.value">{{ lang.label }}</option>
        </select>
      </section>

      <section class="card p-6">
        <h3 class="text-base font-semibold">{{ t("settings.profile.appearance") }}</h3>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ t("settings.profile.appearanceHelp") }}</p>
        <div class="mt-4 flex gap-2" role="group" :aria-label="t('shell.theme')">
          <button
            v-for="opt in themeOptions"
            :key="opt.value"
            type="button"
            class="rounded-lg border px-4 py-2 text-sm font-medium"
            :class="
              theme.preference === opt.value
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400'
                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            "
            @click="theme.setPreference(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </section>

      <section class="card p-6">
        <h3 class="text-base font-semibold">{{ t("settings.profile.changePassword") }}</h3>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ t("settings.profile.changePasswordHelp") }}</p>
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label for="new-password" class="label">{{ t("settings.profile.newPassword") }}</label>
            <input
              id="new-password"
              v-model="password.newPassword"
              type="password"
              class="input"
              :placeholder="t('settings.profile.newPasswordPlaceholder')"
            />
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ t("settings.profile.passwordRequirements") }}</p>
          </div>
          <div>
            <label for="confirm-password" class="label">{{ t("settings.profile.confirmPassword") }}</label>
            <input
              id="confirm-password"
              v-model="password.confirm"
              type="password"
              class="input"
              :placeholder="t('settings.profile.confirmPasswordPlaceholder')"
            />
          </div>
        </div>
        <p v-if="passwordError" class="mt-3 text-sm text-red-600 dark:text-red-400">{{ passwordError }}</p>
        <p v-if="passwordOk" class="mt-3 text-sm text-green-600 dark:text-green-400">{{ t("settings.profile.passwordUpdated") }}</p>
        <div class="mt-4">
          <button type="button" class="btn-primary" :disabled="!passwordValid || passwordBusy" @click="submitPassword">
            {{ passwordBusy ? t("settings.profile.updating") : t("settings.profile.updatePassword") }}
          </button>
        </div>
      </section>

      <section class="card border-red-100 dark:border-red-500/30 p-6">
        <h3 class="text-base font-semibold">{{ t("settings.profile.dangerZone") }}</h3>
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <div class="rounded-lg border border-slate-200 dark:border-slate-700/60 p-4">
            <h4 class="font-semibold text-slate-900 dark:text-slate-100">{{ t("settings.profile.clearAllData") }}</h4>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ t("settings.profile.clearAllDataHelp") }}</p>
            <button type="button" class="btn-red-ghost mt-3" @click="dangerDialog = 'clear'">{{ t("settings.profile.clearAccount") }}</button>
          </div>
          <div class="rounded-lg border border-slate-200 dark:border-slate-700/60 p-4">
            <h4 class="font-semibold text-slate-900 dark:text-slate-100">{{ t("settings.profile.deleteAccount") }}</h4>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ t("settings.profile.deleteAccountHelp") }}</p>
            <button type="button" class="btn-danger mt-3" @click="dangerDialog = 'delete'">{{ t("settings.profile.deleteAccount") }}</button>
          </div>
        </div>
      </section>
    </template>

    <div
      v-if="dangerDialog"
      class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24"
      @click.self="dangerDialog = null"
    >
      <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" :aria-label="dangerDialog === 'clear' ? t('settings.profile.clearDialogAria') : t('settings.profile.deleteDialogAria')">
        <h3 class="mb-2 text-base font-semibold">
          {{ dangerDialog === "clear" ? t("settings.profile.clearDialogTitle") : t("settings.profile.deleteDialogTitle") }}
        </h3>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          {{ dangerDialog === "clear" ? t("settings.profile.clearDialogBody") : t("settings.profile.deleteDialogBody") }}
        </p>
        <p v-if="dangerError" class="mt-3 text-sm text-red-600 dark:text-red-400">{{ dangerError }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="btn-ghost" @click="dangerDialog = null">{{ t("settings.profile.cancel") }}</button>
          <button type="button" class="btn-danger" :disabled="dangerBusy" @click="confirmDanger">
            {{ dangerBusy ? t("settings.profile.pleaseWait") : dangerDialog === "clear" ? t("settings.profile.clearAccount") : t("settings.profile.deleteAccount") }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
