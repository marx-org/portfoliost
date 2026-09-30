<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue"
import { useRouter } from "vue-router"
import { useAuthStore } from "@/stores/auth"
import { useThemeStore, type ThemePreference } from "@/stores/theme"
import { researchSymbol } from "@/utils/research"

const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()

const displayName = computed(() => auth.user?.email ?? "")

// auth.logout() ends the Pocket-ID session via a top-level navigation, so
// there is nothing to push afterwards.
async function handleLogout() {
  await auth.logout()
}

const STORAGE_KEY = "sidebar-collapsed"

// On mobile (<768px) the sidebar starts as an overlay (not collapsed, but hidden)
// On desktop it can be collapsed to icon-only mode
const isCollapsed = ref(localStorage.getItem(STORAGE_KEY) === "true")
const isMobileOpen = ref(false)

function toggleSidebar() {
  if (window.innerWidth < 768) {
    isMobileOpen.value = !isMobileOpen.value
  } else {
    isCollapsed.value = !isCollapsed.value
    localStorage.setItem(STORAGE_KEY, String(isCollapsed.value))
  }
}

function closeMobile() {
  isMobileOpen.value = false
}

// Close mobile menu on route change
router.afterEach(() => {
  isMobileOpen.value = false
})

// Close mobile menu on Escape
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") isMobileOpen.value = false
}
onMounted(() => window.addEventListener("keydown", onKeydown))
onUnmounted(() => window.removeEventListener("keydown", onKeydown))

const items = [
  {
    label: "Portfolios",
    sublabel: "Watchlists",
    to: { name: "investments" },
    icon: "briefcase",
  },
  {
    label: "Research",
    to: { name: "research-overview", params: { symbol: researchSymbol("AAPL") } },
    icon: "search",
  },
  {
    label: "Charting",
    to: "/en/charting",
    icon: "chart",
  },
]

function isActive(item: { to: unknown; label: string }): boolean {
  if (typeof item.to === "string") {
    return router.currentRoute.value.path.startsWith(item.to)
  }
  const name = (item.to as { name: string }).name
  // Portfolios tab should also be active on portfolio-* sub-routes
  if (name === "investments") {
    const currentName = router.currentRoute.value.name as string | undefined
    return (
      currentName === "investments" ||
      currentName === "transactions" ||
      currentName === "transactions-cash" ||
      currentName === "watchlist" ||
      (currentName?.startsWith("portfolio-") ?? false)
    )
  }
  if (name === "research-overview") {
    return (router.currentRoute.value.name as string | undefined)?.startsWith("research-") ?? false
  }
  return router.currentRoute.value.name === name
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
  <!-- Mobile hamburger button (only visible on mobile) -->
  <button
    type="button"
    class="fixed left-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
    aria-label="Toggle menu"
    @click="toggleSidebar"
  >
    <svg v-if="!isMobileOpen" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
    <svg v-else class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  </button>

  <!-- Mobile backdrop -->
  <Transition name="fade">
    <div
      v-if="isMobileOpen"
      class="fixed inset-0 z-40 bg-black/40 md:hidden"
      aria-hidden="true"
      @click="closeMobile"
    />
  </Transition>

  <!-- Sidebar -->
  <Transition name="slide">
    <aside
      v-show="isMobileOpen || true"
      :class="[
        // Base
        'flex shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700/60 dark:bg-slate-900',
        // Mobile: fixed overlay drawer
        'fixed inset-y-0 left-0 z-40 md:relative md:inset-auto md:z-auto',
        // Width: collapsed = icon-only (w-16), expanded = w-56
        isCollapsed ? 'w-16' : 'w-56',
        // Mobile: hide when closed
        isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        'transition-[width,transform] duration-200 ease-in-out',
      ]"
    >
      <!-- Logo + collapse toggle -->
      <div class="flex items-center border-b border-slate-200 dark:border-slate-700/60" :class="isCollapsed ? 'justify-center py-4' : 'px-4 py-5'">
        <router-link to="/en/investments" class="flex items-center gap-2 min-w-0" :title="isCollapsed ? 'Portfoliost' : undefined">
          <img src="/favicon.svg" alt="Portfoliost" class="h-7 w-7 shrink-0" />
          <span v-if="!isCollapsed" class="truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">Portfoliost</span>
        </router-link>

        <!-- Collapse toggle (desktop only) -->
        <button
          type="button"
          class="ml-auto hidden shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 md:flex"
          :aria-label="isCollapsed ? 'Expand menu' : 'Collapse menu'"
          @click="toggleSidebar"
        >
          <svg class="h-4 w-4 transition-transform duration-200" :class="isCollapsed ? 'rotate-180' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      </div>

      <!-- Main nav -->
      <nav aria-label="Main navigation" class="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        <router-link
          v-for="item in items"
          :key="item.label"
          :to="item.to"
          class="flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          :class="[
            isActive(item) ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' : '',
            isCollapsed ? 'justify-center' : '',
          ]"
          :title="isCollapsed ? item.label : undefined"
        >
          <!-- Briefcase icon (Portfolios) -->
          <svg v-if="item.icon === 'briefcase'" class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            <line x1="12" y1="12" x2="12" y2="12" />
            <path d="M2 12h20" />
          </svg>
          <!-- Search/magnifying glass icon (Research) -->
          <svg v-else-if="item.icon === 'search'" class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <!-- Line chart icon (Charting) -->
          <svg v-else-if="item.icon === 'chart'" class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>

          <span v-if="!isCollapsed" class="min-w-0 truncate">
            {{ item.label }}
            <span v-if="item.sublabel" class="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">/ {{ item.sublabel }}</span>
          </span>
        </router-link>

        <!-- Admin link -->
        <router-link
          v-if="auth.isAdmin"
          to="/en/admin"
          class="flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          :class="[
            isAdminActive ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' : '',
            isCollapsed ? 'justify-center' : '',
          ]"
          :title="isCollapsed ? 'Admin' : undefined"
        >
          <svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span v-if="!isCollapsed">Admin</span>
        </router-link>
      </nav>

      <!-- Bottom section -->
      <div class="space-y-1 border-t border-slate-200 p-2 dark:border-slate-700/60">
        <!-- Theme picker -->
        <div class="relative">
          <button
            type="button"
            class="btn-ghost w-full dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            :class="isCollapsed ? 'justify-center px-2' : 'justify-between'"
            aria-haspopup="listbox"
            :aria-expanded="themeOpen"
            :title="isCollapsed ? `Theme: ${themeLabel}` : undefined"
            @click="themeOpen = !themeOpen"
          >
            <span class="flex items-center gap-2">
              <!-- Moon icon -->
              <svg v-if="theme.isDark" class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              <!-- Sun icon -->
              <svg v-else class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41" />
              </svg>
              <span v-if="!isCollapsed">Theme</span>
            </span>
            <span v-if="!isCollapsed" class="flex items-center gap-1 text-xs font-normal text-slate-400 dark:text-slate-500">
              {{ themeLabel }}
              <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </button>

          <div
            v-if="themeOpen"
            role="listbox"
            aria-label="Theme"
            class="absolute bottom-full left-0 z-50 mb-1 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
            :class="isCollapsed ? 'w-36' : 'right-0'"
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
              <svg v-if="opt.icon === 'sun'" class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41" />
              </svg>
              <svg v-else-if="opt.icon === 'moon'" class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              <svg v-else class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8m-4-4v4" />
              </svg>
              {{ opt.label }}
            </button>
          </div>
        </div>

        <!-- Logout -->
        <button
          type="button"
          class="btn-ghost w-full dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          :class="isCollapsed ? 'justify-center px-2' : 'justify-start'"
          :title="isCollapsed ? 'Logout' : undefined"
          @click="handleLogout"
        >
          <svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span v-if="!isCollapsed">Logout</span>
        </button>

        <!-- Settings -->
        <router-link
          to="/en/settings/profile"
          class="btn-ghost w-full dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          :class="isCollapsed ? 'justify-center px-2' : 'justify-start'"
          :title="isCollapsed ? 'Settings' : undefined"
        >
          <svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span v-if="!isCollapsed">Settings</span>
        </router-link>

        <!-- User email -->
        <div v-if="!isCollapsed" class="px-3 py-1 text-xs text-slate-400 dark:text-slate-500 truncate">{{ displayName }}</div>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.2s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
}
</style>
