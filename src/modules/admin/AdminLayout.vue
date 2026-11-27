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
  { name: "admin-listing-overrides", label: "Listing Overrides" },
]
</script>

<template>
  <div>
    <header class="mb-6">
      <p class="text-[10px] font-mono uppercase tracking-[0.2em] text-muted">Portfoliost / Admin</p>
      <h1 class="mt-1 text-2xl font-bold tracking-tight text-text">Admin</h1>
    </header>

    <nav aria-label="Admin tabs" class="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      <router-link
        v-for="tab in tabs"
        :key="tab.name"
        :to="{ name: tab.name }"
        class="whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors"
        :class="route.name === tab.name ? 'border-accent text-accent-text' : 'border-transparent text-muted hover:text-text'"
      >
        {{ tab.label }}
      </router-link>
    </nav>

    <router-view />
  </div>
</template>
