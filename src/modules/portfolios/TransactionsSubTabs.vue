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
    label: "Cash Transactions",
    to: "/en/investments/transactions/cash",
    match: (path: string) => path.startsWith("/en/investments/transactions/cash"),
  },
]
</script>

<template>
  <nav aria-label="Transaction types" class="tab-nav mb-6">
    <router-link
      v-for="tab in tabs"
      :key="tab.label"
      :to="tab.to"
      class="tab-link"
      :class="tab.match(currentPath) ? 'tab-link--active' : ''"
    >
      {{ tab.label }}
    </router-link>
  </nav>
</template>
