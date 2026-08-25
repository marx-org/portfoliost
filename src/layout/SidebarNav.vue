<script setup lang="ts">
import { computed, ref } from "vue"
import { useRouter } from "vue-router"
import { useAuthStore } from "@/stores/auth"
import { useThemeStore, type ThemePreference } from "@/stores/theme"
import { researchSymbol } from "@/utils/research"

const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()

const displayName = computed(() => auth.user?.email ?? "")

async function handleLogout() {
  await auth.logout()
  router.push({ name: "login" })
}

const items = [
  {
    label: "Portfolios",
    sublabel: "Watchlists",
    to: { name: "investments" },
  },
  {
    label: "Research",
    to: { name: "research-overview", params: { symbol: researchSymbol("AAPL") } },
  },
  {
    label: "Charting",
    to: "/en/charting",
  },
]

function isActive(item: { to: unknown; label: string }): boolean {
  return typeof item.to !== "string" && router.currentRoute.value.name === (item.to as { name: string }).name
}

const isAdminActive = computed(() => router.currentRoute.value.path.startsWith("/en/admin"))

const themeOpen = ref(false)
const themeOptions: { value: ThemePreference; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "monitor" },
]

const themeLabel = computed(() => themeOptions.find((o) => o.value === theme.preference)?.label ?? "Light")

function selectTheme(value: ThemePreference) {
  theme.setPreference(value)
  themeOpen.value = false
}
</script>

<template>
  <aside class="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700/60 dark:bg-slate-900">
    <router-link to="/en/investments" class="flex items-center gap-2 px-4 py-5">
      <img src="/favicon.svg" alt="Portfoliost" class="h-7 w-7" />
      <span class="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">Portfoliost</span>
    </router-link>

    <nav aria-label="Main navigation" class="flex-1 space-y-1 px-3">
      <router-link
        v-for="item in items"
        :key="item.label"
        :to="item.to"
        class="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        :class="{ 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400': isActive(item) }"
      >
        <span>{{ item.label }}</span>
        <span v-if="item.sublabel" class="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">/ {{ item.sublabel }}</span>
      </router-link>

      <router-link
        v-if="auth.isAdmin"
        to="/en/admin"
        class="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        :class="{ 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400': isAdminActive }"
      >
        <span class="flex items-center gap-2">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Admin
        </span>
      </router-link>
    </nav>

    <div class="space-y-1 border-t border-slate-200 p-3 dark:border-slate-700/60">
      <div class="relative">
        <button
          type="button"
          class="btn-ghost w-full justify-between dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          aria-haspopup="listbox"
          :aria-expanded="themeOpen"
          @click="themeOpen = !themeOpen"
        >
          <span class="flex items-center gap-2">
            <svg
              v-if="theme.isDark"
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            <svg
              v-else
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41" />
            </svg>
            <span>Theme</span>
          </span>
          <span class="flex items-center gap-1 text-xs font-normal text-slate-400 dark:text-slate-500">
            {{ themeLabel }}
            <svg
              class="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>

        <div
          v-if="themeOpen"
          role="listbox"
          aria-label="Theme"
          class="absolute bottom-full left-0 right-0 z-50 mb-1 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          <button
            v-for="opt in themeOptions"
            :key="opt.value"
            type="button"
            role="option"
            :aria-selected="theme.preference === opt.value"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
            :class="{ 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-slate-100': theme.preference === opt.value }"
            @click="selectTheme(opt.value)"
          >
            <svg v-if="opt.icon === 'sun'" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41" />
            </svg>
            <svg v-else-if="opt.icon === 'moon'" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            <svg v-else class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8m-4-4v4" />
            </svg>
            {{ opt.label }}
          </button>
        </div>
      </div>

      <button type="button" class="btn-ghost w-full justify-start dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100" @click="handleLogout">
        Logout
      </button>
      <router-link to="/en/settings/profile" class="btn-ghost w-full justify-start dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"> Settings </router-link>
      <div class="px-3 py-1 text-xs text-slate-400 dark:text-slate-500">{{ displayName }}</div>
    </div>
  </aside>
</template>
