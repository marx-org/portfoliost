<script setup lang="ts">
import { useRoute } from "vue-router"

const route = useRoute()

const currentPath = route?.path ?? (typeof window !== "undefined" ? window.location.pathname : "")

const tabs = [
  {
    label: "Portfolio Transactions",
    to: "/en/investments/transactions",
    match: (path: string) => path === "/en/investments/transactions",
  },
  {
    label: "Wallet Transactions",
    to: "/en/investments/transactions/cash",
    match: (path: string) => path.startsWith("/en/investments/transactions/cash"),
  },
]
</script>

<template>
  <nav aria-label="Transaction types" class="mb-6 flex gap-1 border-b border-slate-200 dark:border-slate-700/60">
    <router-link
      v-for="tab in tabs"
      :key="tab.label"
      :to="tab.to"
      class="border-b-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
      :class="tab.match(currentPath) ? 'border-blue-600 text-blue-700 dark:text-blue-400' : 'border-transparent'"
    >
      {{ tab.label }}
    </router-link>
  </nav>
</template>
