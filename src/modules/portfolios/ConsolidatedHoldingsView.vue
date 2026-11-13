<script setup lang="ts">
import { onMounted, ref } from "vue"
import { getAllPositions } from "@/api/portfolios"
import type { PortfolioPositions } from "@/api/types"
import HoldingsTable from "@/components/HoldingsTable.vue"
import InvestmentsTabs from "@/modules/portfolios/InvestmentsTabs.vue"

const positions = ref<PortfolioPositions>([])
const loading = ref(true)
const error = ref<string | null>(null)

async function refresh() {
  loading.value = true
  error.value = null
  try {
    positions.value = await getAllPositions()
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load consolidated holdings"
  } finally {
    loading.value = false
  }
}

onMounted(() => void refresh())
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold">Consolidated holdings</h1>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Open positions across your investment portfolios, with closed history available.</p>
    </div>

    <InvestmentsTabs />

    // §90 — the loading card only replaces the table when there is nothing to show
    // yet. A refresh triggered by a mutation (label save, buy, dividend) keeps the
    // table mounted, so the page size, search, grouping, sort and columns the user
    // chose are not thrown away mid-edit.
    <p v-if="loading && positions.length" data-testid="holdings-refreshing" class="mb-3 text-sm text-slate-500 dark:text-slate-400">Refreshing…</p>
    <div v-if="loading && !positions.length" class="card p-6 text-sm text-slate-500 dark:text-slate-400">Loading holdings...</div>
    <div v-else-if="error" class="card p-6">
      <p class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
      <button type="button" class="btn-secondary mt-4 text-sm" @click="refresh">Retry</button>
    </div>
    <HoldingsTable
      v-else
      mode="global"
      :positions="positions"
      portfolio-name="consolidated"
      :refresh="refresh"
    />
  </div>
</template>
