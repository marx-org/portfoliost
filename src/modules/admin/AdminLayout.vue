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
    <header class="page-header">
      <div>
        <p class="page-eyebrow"><span class="signal-dot" /> PORTFOLIOST / ADMIN</p>
        <h1 class="page-title">Admin</h1>
      </div>
    </header>

    <nav aria-label="Admin tabs" class="tab-nav mb-6">
      <router-link
        v-for="tab in tabs"
        :key="tab.name"
        :to="{ name: tab.name }"
        class="tab-link"
        :class="route.name === tab.name ? 'tab-link--active' : ''"
      >
        {{ tab.label }}
      </router-link>
    </nav>

    <router-view />
  </div>
</template>
