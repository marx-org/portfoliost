<script setup lang="ts">
import { useRoute } from "vue-router"

const route = useRoute()

const currentPath = route?.path ?? (typeof window !== "undefined" ? window.location.pathname : "")

const tabs = [
  {
    // §84 — first in the strip, and the landing page `/` points at.
    label: "Accounts balance",
    to: "/en/investments/accounts-balance",
    match: (path: string) => path.startsWith("/en/investments/accounts-balance"),
  },
  {
    label: "Portfolios",
    to: "/en/investments",
    match: (path: string) => path === "/en/investments",
  },
  {
    label: "Virtual Portfolios",
    to: "/en/investments/virtual-portfolios",
    match: (path: string) => path.startsWith("/en/investments/virtual-portfolios"),
  },
  {
    label: "Consolidated holdings",
    to: "/en/investments/holdings",
    match: (path: string) => path.startsWith("/en/investments/holdings"),
  },
  {
    // §83.6 — the cumulative (all-portfolios) performance tab. After Portfolios
    // because it summarises exactly what those cards summarise.
    label: "Performance",
    to: "/en/investments/performance",
    match: (path: string) => path.startsWith("/en/investments/performance"),
  },
  {
    label: "Transactions",
    to: "/en/investments/transactions",
    match: (path: string) => path.startsWith("/en/investments/transactions"),
  },
  {
    label: "Watchlists",
    to: "/en/investments/watchlist",
    match: (path: string) => path.startsWith("/en/investments/watchlist"),
  },
]
</script>

<template>

  <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
    <nav aria-label="Investment sections" class="flex gap-1 border-b border-slate-200 dark:border-slate-700/60">
      <router-link
        v-for="tab in tabs"
        :key="tab.label"
        :to="tab.to"
        class="border-b-2 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        :class="tab.match(currentPath) ? 'border-blue-600 text-blue-700' : 'border-transparent'"
      >
        {{ tab.label }}
      </router-link>
    </nav>
    <button type="button" class="btn-ghost text-sm" disabled>Import from Broker</button>
  </div>
</template>
