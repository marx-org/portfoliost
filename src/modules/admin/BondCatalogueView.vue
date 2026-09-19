<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import {
  fetchBondCatalogue,
  fetchCpiSeries,
  type BondCatalogueRow,
  type CpiSummary,
} from "@/api/admin"

const bonds = ref<BondCatalogueRow[]>([])
const bondCount = ref(0)
const cpi = ref<CpiSummary | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  loading.value = true
  error.value = null
  try {
    const [bondRes, cpiRes] = await Promise.all([
      fetchBondCatalogue().catch(() => ({ count: 0, rows: [] as BondCatalogueRow[] })),
      fetchCpiSeries().catch(() => null),
    ])
    bondCount.value = bondRes.count
    bonds.value = bondRes.rows
    cpi.value = cpiRes
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load bond catalogue"
  } finally {
    loading.value = false
  }
})

const cpiStale = computed(() => cpi.value?.stale ?? false)
</script>

<template>
  <div class="space-y-8">
    <h1 class="text-xl font-semibold">Bond Catalogue</h1>

    <div v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading…</div>
    <div v-else-if="error" class="text-sm text-red-600">{{ error }}</div>

    <template v-else>
      <!-- Savings-bond series (openst.bond_series) -->
      <div class="card p-6">
        <h2 class="mb-1 text-base font-semibold">Savings-Bond Emissions</h2>
        <p class="mb-4 text-sm text-slate-500 dark:text-slate-400">
          <span class="font-semibold">{{ bondCount.toLocaleString() }}</span> emissions in
          <code class="font-mono text-xs">openst.bond_series</code>
        </p>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700 text-left text-xs text-slate-500 dark:text-slate-400">
                <th class="pb-2 pr-4">Symbol</th>
                <th class="pb-2 pr-4">Name</th>
                <th class="pb-2 pr-4">Issue</th>
                <th class="pb-2 pr-4">Maturity</th>
                <th class="pb-2 pr-4">Rate Rule</th>
                <th class="pb-2">Margin</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in bonds" :key="b.symbol" class="border-b border-slate-100 dark:border-slate-800">
                <td class="py-2 pr-4 font-mono font-semibold">{{ b.symbol }}</td>
                <td class="py-2 pr-4">{{ b.name }}</td>
                <td class="py-2 pr-4">{{ b.issueDate ?? "—" }}</td>
                <td class="py-2 pr-4">{{ b.maturityDate ?? "—" }}</td>
                <td class="py-2 pr-4">{{ b.rateRule ?? "—" }}</td>
                <td class="py-2">{{ b.margin != null && b.margin !== "" ? Number(b.margin).toFixed(4) : "—" }}</td>
              </tr>
              <tr v-if="bonds.length === 0">
                <td colspan="6" class="py-4 text-center text-slate-400 dark:text-slate-500">
                  No bond series imported yet.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 12m CPI (openst.cpi_12m) -->
      <div class="card p-6">
        <h2 class="mb-1 text-base font-semibold">12-Month CPI</h2>
        <p class="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Latest <span class="font-semibold">{{ cpi ? cpi.rowCount : 0 }}</span> readings from
          <code class="font-mono text-xs">openst.cpi_12m</code>
          <template v-if="cpi?.lastDate">
            (latest: <span class="font-semibold">{{ cpi.lastDate }}</span>,
            {{ cpi.ageDays ?? "—" }}d ago)
          </template>
        </p>
        <div
          v-if="cpiStale"
          class="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
        >
          CPI data is stale — latest reading is more than 40 days old.
        </div>
        <template v-if="cpi">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-slate-200 dark:border-slate-700 text-left text-xs text-slate-500 dark:text-slate-400">
                  <th class="pb-2 pr-4">Date</th>
                  <th class="pb-2">CPI 12M (%)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in cpi.rows" :key="row.date" class="border-b border-slate-100 dark:border-slate-800">
                  <td class="py-1 pr-4 font-mono">{{ row.date }}</td>
                  <td class="py-1">{{ Number(row.value).toFixed(4) }}</td>
                </tr>
                <tr v-if="cpi.rows.length === 0">
                  <td colspan="2" class="py-4 text-center text-slate-400 dark:text-slate-500">
                    No CPI data imported yet.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <p v-else class="text-sm text-slate-400 dark:text-slate-500">Unavailable.</p>
      </div>
    </template>
  </div>
</template>
