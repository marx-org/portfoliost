<script setup lang="ts">
import { onMounted, ref } from "vue"
import { usePortfolioStore } from "@/stores/portfolios"

const store = usePortfolioStore()
const loading = ref(true)

onMounted(async () => {
  try {
    await store.fetchAll()
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <h1 class="text-2xl font-semibold">Investments</h1>
    <p v-if="loading" class="mt-4 text-sm text-slate-500">Loading portfolios...</p>
    <pre v-else class="mt-4 rounded-lg bg-slate-100 p-4 text-xs">{{ JSON.stringify(store.portfolios, null, 2) }}</pre>
  </div>
</template>
