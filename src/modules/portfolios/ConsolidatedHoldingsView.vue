<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { getAllPositions } from "@/api/portfolios"
import type { PortfolioPositions } from "@/api/types"
import HoldingsTable from "@/components/HoldingsTable.vue"
import InvestmentsTabs from "@/modules/portfolios/InvestmentsTabs.vue"

const { t } = useI18n()
const positions = ref<PortfolioPositions>([])
const loading = ref(true)
const error = ref<string | null>(null)

async function refresh() {
  loading.value = true
  error.value = null
  try {
    positions.value = await getAllPositions()
  } catch (err) {
    error.value = err instanceof Error ? err.message : t("portfolios.loadConsolidatedError")
  } finally {
    loading.value = false
  }
}

onMounted(() => void refresh())
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <p class="page-eyebrow"><span class="signal-dot" /> {{ t("portfolios.eyebrowPortfolios") }}</p>
        <h1 class="page-title">{{ t("portfolios.consolidatedHoldings") }}</h1>
        <p class="page-description">{{ t("portfolios.consolidatedDescription") }}</p>
      </div>
    </div>

    <InvestmentsTabs />

    <!-- §90 — the loading card only replaces the table when there is nothing to show
         yet. A refresh triggered by a mutation (label save, buy, dividend) keeps the
         table mounted, so the page size, search, grouping, sort and columns the user
         chose are not thrown away mid-edit. -->
    <p v-if="loading && positions.length" data-testid="holdings-refreshing" class="mb-3 text-sm text-muted">{{ t("portfolios.refreshing") }}</p>
    <div v-if="loading && !positions.length" class="card p-6 text-sm text-muted">{{ t("portfolios.loadingHoldings") }}</div>
    <div v-else-if="error" class="card p-6">
      <p class="text-sm text-danger">{{ error }}</p>
      <button type="button" class="btn-secondary mt-4 text-sm" @click="refresh">{{ t("portfolios.retry") }}</button>
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
