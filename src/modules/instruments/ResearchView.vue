<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"

const route = useRoute()
const symbol = computed(() => String(route.params.symbol).toUpperCase())

const tabs = [
  { name: "research-overview", label: "Overview" },
  { name: "research-news", label: "News" },
  { name: "research-ir", label: "Investor Relations" },
  { name: "research-projections", label: "Projections" },
]
</script>

<template>
  <div>
    <div class="mb-6 flex items-center gap-3">
      <router-link to="/en/investments" class="btn-ghost">&larr; Go back</router-link>
      <h1 class="text-2xl font-semibold">{{ symbol }}</h1>
      <span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">{{ symbol }}.US</span>
    </div>

    <nav class="mb-6 flex gap-1 border-b border-slate-200">
      <router-link
        v-for="tab in tabs"
        :key="tab.name"
        :to="{ name: tab.name, params: { symbol } }"
        class="border-b-2 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        :class="route.name === tab.name ? 'border-blue-600 text-blue-700' : 'border-transparent'"
      >
        {{ tab.label }}
      </router-link>
    </nav>

    <router-view />
  </div>
</template>
