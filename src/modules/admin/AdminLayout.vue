<script setup lang="ts">
import { useRoute } from "vue-router"

const route = useRoute()

const tabs = [
  { name: "admin-system",      label: "System" },
  { name: "admin-topology",    label: "Topology" },
  { name: "admin-currencies",  label: "Currency Rates" },
  { name: "admin-users",       label: "Users" },
  { name: "admin-jobs",        label: "Jobs" },
  { name: "admin-market-data", label: "Market Data" },
  { name: "admin-bond-catalogue", label: "Bond Catalogue" },
]
</script>

<template>
  <div>
    <h1 class="mb-6 text-2xl font-bold text-slate-900 dark:text-slate-100">Admin</h1>

    <nav aria-label="Admin tabs" class="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700/60">
      <router-link
        v-for="tab in tabs"
        :key="tab.name"
        :to="{ name: tab.name }"
        class="whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
        :class="route.name === tab.name ? 'border-blue-600 text-blue-700 dark:text-blue-400' : 'border-transparent'"
      >
        {{ tab.label }}
      </router-link>
    </nav>

    <router-view />
  </div>
</template>
