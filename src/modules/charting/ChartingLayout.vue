<script setup lang="ts">
/**
 * Charting layout (feature #253, sub-issue #256).
 *
 * Shared shell for the Charting subpages: a sub-navigation, a scope toolbar
 * (account + label multiselect, All by default, with reset) and the routed
 * child view. The scope lives in the URL via useChartScope, so it persists
 * across subpages and deep links.
 */
import { computed, onMounted } from "vue"
import { useRoute } from "vue-router"
import { storeToRefs } from "pinia"
import { usePortfolioStore } from "@/stores/portfolios"
import LabelFilterBar from "@/components/LabelFilterBar.vue"
import { useChartScope } from "./useChartScope"
import type { ChartCategory } from "./registry"

const route = useRoute()

const scope = useChartScope()
const { selectedAccountIds, selectedLabelIds, allAccounts, allLabels } = scope

const portfolios = usePortfolioStore()
const { portfolios: accountList } = storeToRefs(portfolios)

onMounted(() => {
  if (!accountList.value.length) void portfolios.fetchAll().catch(() => {})
})

const sections: { category: ChartCategory; label: string; to: string }[] = [
  { category: "performance", label: "Performance", to: "/en/charting/performance" },
  { category: "income", label: "Income", to: "/en/charting/income" },
  { category: "allocation", label: "Allocation", to: "/en/charting/allocation" },
  { category: "cash", label: "Cash & funding", to: "/en/charting/cash" },
  { category: "categories", label: "Stock categories", to: "/en/charting/stock-categories" },
]

const active = computed<ChartCategory>(() => {
  const seg = route.path.split("/").filter(Boolean).pop() ?? ""
  if (seg === "stock-categories") return "categories"
  if (seg === "income" || seg === "allocation" || seg === "cash" || seg === "performance") return seg
  return "performance"
})

function toggleAccount(id: string) {
  scope.toggleAccount(id)
}
</script>

<template>
  <div class="space-y-4" data-testid="charting-layout">
    <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
      <router-link
        v-for="s in sections"
        :key="s.category"
        :to="{ path: s.to, query: route.query }"
        class="rounded px-3 py-1 text-sm"
        :class="active === s.category ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'"
        data-testid="charting-nav"
      >
        {{ s.label }}
      </router-link>
    </div>

    <!-- Scope toolbar -->
    <div class="flex flex-wrap items-center gap-3 rounded border border-slate-200 p-3 dark:border-slate-700" data-testid="charting-toolbar">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-medium uppercase text-slate-400 dark:text-slate-500">Accounts</span>
        <span v-if="allAccounts" class="text-xs text-slate-500">All</span>
        <button
          v-for="p in accountList"
          :key="p.id"
          type="button"
          class="rounded border px-2 py-0.5 text-xs"
          :class="selectedAccountIds.includes(p.id) ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'border-slate-300 dark:border-slate-600'"
          @click="toggleAccount(p.id)"
        >
          {{ p.name }}
        </button>
      </div>
      <label-filter-bar :model-value="selectedLabelIds" @update:model-value="scope.setLabels" />
      <span v-if="allLabels" class="text-xs text-slate-500">All labels</span>
      <button type="button" class="btn-ghost text-xs" @click="scope.reset()">Reset</button>
    </div>

    <router-view />
  </div>
</template>