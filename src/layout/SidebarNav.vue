<script setup lang="ts">
import { useRouter } from "vue-router"
import { computed } from "vue"
import { useAuthStore } from "@/stores/auth"

const router = useRouter()
const auth = useAuthStore()

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
    to: { name: "research-overview", params: { symbol: "AAPL" } },
  },
  {
    label: "Charting",
    to: "/en/charting",
  },
  {
    label: "News",
    to: "/en/news-dashboard",
  },
  {
    label: "Wallets",
    to: { name: "wallets" },
  },
]

function isActive(item: { to: unknown; label: string }): boolean {
  return typeof item.to !== "string" && router.currentRoute.value.name === (item.to as { name: string }).name
}
</script>

<template>
  <aside class="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
    <router-link to="/en/investments" class="flex items-center gap-2 px-4 py-5">
      <img src="/favicon.svg" alt="Portfoliost" class="h-7 w-7" />
      <span class="text-lg font-semibold tracking-tight text-slate-900">Portfoliost</span>
    </router-link>

    <nav aria-label="Main navigation" class="flex-1 space-y-1 px-3">
      <router-link
        v-for="item in items"
        :key="item.label"
        :to="item.to"
        class="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        :class="{ 'bg-blue-50 text-blue-700': isActive(item) }"
      >
        <span>{{ item.label }}</span>
        <span v-if="item.sublabel" class="ml-1 text-xs font-normal text-slate-400">/ {{ item.sublabel }}</span>
      </router-link>

      <router-link
        to="/en/investments/watchlist"
        class="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        Alerts
      </router-link>
    </nav>

    <div class="space-y-1 border-t border-slate-200 p-3">
      <button type="button" class="btn-ghost w-full justify-start" @click="handleLogout">
        Logout
      </button>
      <router-link to="/en/investments" class="btn-ghost w-full justify-start"> Settings </router-link>
      <div class="px-3 py-1 text-xs text-slate-400">{{ displayName }}</div>
    </div>
  </aside>
</template>
