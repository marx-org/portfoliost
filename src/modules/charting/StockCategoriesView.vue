<script setup lang="ts">
/** Charting → Stock categories (feature #253, sub-issue #258). Placeholder shell. */
import { onMounted, ref } from "vue"
import { getStockChartCategories } from "@/api/charting"
import type { components } from "@/api/types"
import { useChartScope } from "./useChartScope"

type Assignment = components["schemas"]["StockChartCategoryAssignment"]

const scope = useChartScope()
const rows = ref<Assignment[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    rows.value = await getStockChartCategories(scope.scopeQuery.value)
  } finally {
    loading.value = false
  }
}
onMounted(() => void load())
</script>

<template>
  <div class="space-y-3" data-testid="charting-categories">
    <p v-if="loading" class="text-sm text-slate-500">Loading…</p>
    <p v-else-if="!rows.length" class="text-sm text-slate-500">No stock categories assigned yet.</p>
    <table v-else class="w-full text-sm">
      <thead><tr class="text-left text-slate-400"><th class="py-1">Symbol</th><th>Name</th><th>Category</th></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.symbol" class="border-t border-slate-100 dark:border-slate-800">
          <td class="py-1">{{ r.symbol }}</td><td>{{ r.name ?? "—" }}</td><td>{{ r.category }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>