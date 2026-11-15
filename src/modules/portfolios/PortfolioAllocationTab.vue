<script setup lang="ts">
/**
 * Portfolio → Allocation tab (feature #253, sub-issue #256).
 *
 * The route/fetch wrapper only: it loads this portfolio's snapshot allocation
 * and mounts the SHARED breakdown renderer, so the sector donut and the
 * sector / asset-type / currency tables are the same components the Charting →
 * Allocation page renders. No allocation maths lives here.
 */
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { getPortfolioAllocation } from "@/api/portfolios"
import AllocationBreakdown, { type AllocationSlice } from "@/components/AllocationBreakdown.vue"
import type { components } from "@/api/types"

const route = useRoute()
const id = String(route.params.id)
const allocation = ref<components["schemas"]["PortfolioSnapshot"]["allocation"] | null>(null)
/** §66.3 — the allocation reports the currency it is denominated in. byCurrency
 * rows are the exception: each is in its own currency, carried as `name`. */
const allocationCcy = computed(() => allocation.value?.currency ?? "")
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    allocation.value = await getPortfolioAllocation(id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load allocation"
  } finally {
    loading.value = false
  }
})

type Row = { name?: string; value?: number }

/** Snapshot rows → shared slices. `currency` is the row's own currency. */
function toSlices(rows: Row[] | undefined, currency: string | null): AllocationSlice[] {
  return (rows ?? []).map((r, i) => {
    const name = r.name ?? ""
    return { key: name || `#${i}`, label: name, value: r.value ?? 0, currency }
  })
}

const bySector = computed(() => toSlices(allocation.value?.bySector, allocationCcy.value || null))
const byAssetType = computed(() => toSlices(allocation.value?.byAssetType, allocationCcy.value || null))
// byCurrency rows are each denominated in their own currency (`name`).
const byCurrency = computed(() =>
  toSlices(allocation.value?.byCurrency, null).map((s) => ({ ...s, currency: s.label ?? null })),
)
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading allocation...</p>

    <AllocationBreakdown
      v-if="!loading && !error"
      :by-sector="bySector"
      :by-asset-type="byAssetType"
      :by-currency="byCurrency"
      :currency="allocationCcy"
      testid="portfolio-allocation"
    />
  </div>
</template>