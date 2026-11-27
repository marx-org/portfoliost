<script lang="ts">
/** One scatter point, as the shared performance dataset reports it. */
export interface ProfitValuePoint {
  symbol: string
  name?: string | null
  assetType?: string | null
  accounts?: string[]
  marketValue: number
  totalProfit: number
  realized?: number | null
  unrealized?: number | null
  dividends?: number | null
}
</script>

<script setup lang="ts">
/**
 * Holding market value versus total profit (feature #253, sub-issue #275).
 *
 * Scatter x = current market value, y = total profit (realized + unrealized +
 * received dividends). Points are canonical instrument identities (a same-ticker
 * option stays distinct). A search box and a sortable table keep crowded
 * scatters legible; zero/closed-value holdings stay in the table and can be
 * toggled into the plot. Presentation only.
 */
import { computed, ref } from "vue"
import { formatCurrency } from "@/utils/format"
import CollapsibleSection from "@/components/CollapsibleSection.vue"
import { axisTitle, chartTitle, withSharedChart } from "./chartFormat"

const props = withDefaults(
  defineProps<{
    points?: ProfitValuePoint[]
    currency?: string
    testid?: string
  }>(),
  { points: () => [], currency: "", testid: "charting-profit-value-scatter" },
)

const search = ref("")
const showZero = ref(false)
const expanded = ref(false)
type SortKey = "marketValue" | "totalProfit"
const sortKey = ref<SortKey>("marketValue")

const all = computed(() => props.points ?? [])
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return all.value
  return all.value.filter(
    (p) =>
      (p.name ?? "").toLowerCase().includes(q) ||
      p.symbol.toLowerCase().includes(q) ||
      (p.assetType ?? "").toLowerCase().includes(q),
  )
})
const sorted = computed(() =>
  [...filtered.value].sort((a, b) => (b[sortKey.value] ?? 0) - (a[sortKey.value] ?? 0)),
)
const plotted = computed(() => sorted.value.filter((p) => showZero.value || p.marketValue > 0))

function label(p: ProfitValuePoint): string {
  return p.name || p.symbol
}

/** The raw ticker from the canonical `assetType|symbol|currency` identity. */
function displaySymbol(p: ProfitValuePoint): string {
  return p.symbol.includes("|") ? p.symbol.split("|")[1] ?? p.symbol : p.symbol
}

const chartOptions = computed(() => withSharedChart({
  chart: {
    type: "scatter" as const,
    // Expandable + zoomable: most holdings crowd into one corner, so the plot
    // needs pan/zoom and a full-window mode to separate them.
    height: expanded.value ? 720 : 420,
    toolbar: { show: true, autoSelected: "zoom" },
    zoom: { enabled: true, type: "xy" as const },
  },
  title: chartTitle("Market Value vs Total Profit"),
  xaxis: {
    title: axisTitle(`Market value (${props.currency})`),
    labels: { formatter: (v: number) => formatCurrency(v, props.currency) },
  },
  yaxis: {
    title: axisTitle(`Total profit (${props.currency})`),
    labels: { formatter: (v: number) => formatCurrency(v, props.currency) },
  },
  tooltip: {
    custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
      const p = plotted.value[dataPointIndex]
      if (!p) return ""
      const accounts = (p.accounts ?? []).join(", ")
      return [
        `<b>${label(p)}</b>`,
        `${p.symbol}${p.assetType ? ` · ${p.assetType}` : ""}`,
        accounts ? `Accounts: ${accounts}` : "",
        `Market value: ${formatCurrency(p.marketValue, props.currency)}`,
        `Total profit: ${formatCurrency(p.totalProfit, props.currency)}`,
        `Realized ${formatCurrency(p.realized ?? 0, props.currency)} · Unrealized ${formatCurrency(p.unrealized ?? 0, props.currency)} · Dividends ${formatCurrency(p.dividends ?? 0, props.currency)}`,
      ]
        .filter(Boolean)
        .join("<br/>")
    },
  },
  markers: { size: 6, colors: ["var(--accent)"] },
  fill: { type: "solid" as const },
}))
const chartSeries = computed(() => [
  { name: "Holdings", data: plotted.value.map((p) => [p.marketValue, p.totalProfit]) },
])
</script>

<template>
  <div class="space-y-3" :data-testid="testid">
    <template v-if="all.length">
      <div class="flex flex-wrap items-center gap-3 text-xs" :data-testid="`${testid}-controls`">
        <input v-model="search" type="search" class="input w-56" placeholder="Search holdings" :data-testid="`${testid}-search`" />
        <label class="inline-flex items-center gap-1">
          <input v-model="showZero" type="checkbox" :data-testid="`${testid}-show-zero`" />
          Show zero/closed
        </label>
        <label class="inline-flex items-center gap-1">
          Sort
          <select v-model="sortKey" class="input w-auto" :data-testid="`${testid}-sort`">
            <option value="marketValue">Market value</option>
            <option value="totalProfit">Total profit</option>
          </select>
        </label>
      </div>
      <div
        class="card p-6"
        :class="expanded ? 'fixed inset-4 z-50 overflow-auto' : ''"
        :data-testid="`${testid}-chart`"
      >
        <h2 class="sr-only">Market Value vs Total Profit</h2>
        <div class="mb-2 flex items-center justify-between gap-3">
          <button
            type="button"
            class="btn-secondary text-xs"
            :data-testid="`${testid}-expand`"
            @click="expanded = !expanded"
          >
            {{ expanded ? "Close" : "Expand" }}
          </button>
        </div>
        <component :is="'apexchart'" :options="chartOptions" :series="chartSeries" />
      </div>
      <CollapsibleSection title="Holdings" :testid="`${testid}-table`">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border text-left text-xs uppercase text-muted dark:border-slate-800 dark:text-muted">
              <th class="px-5 py-2.5 font-medium">Holding</th>
              <th class="px-5 py-2.5 text-right font-medium">Market value</th>
              <th class="px-5 py-2.5 text-right font-medium">Total profit</th>
              <th class="px-5 py-2.5 text-right font-medium">Realized</th>
              <th class="px-5 py-2.5 text-right font-medium">Unrealized</th>
              <th class="px-5 py-2.5 text-right font-medium">Dividends</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="p in sorted" :key="p.symbol" class="hover:bg-surface-2 dark:hover:bg-slate-800/50">
              <td class="px-5 py-3 font-medium text-text">
                {{ label(p) }}
                <span class="ml-1 text-xs font-normal text-muted">{{ displaySymbol(p) }}</span>
                <span v-if="p.assetType && p.assetType !== 'STOCK'" class="ml-1 text-xs text-muted">{{ p.assetType }}</span>
                <span v-if="(p.accounts ?? []).length" class="block text-xs font-normal text-muted">{{ (p.accounts ?? []).join(", ") }}</span>
              </td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(p.marketValue, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(p.totalProfit, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(p.realized ?? 0, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(p.unrealized ?? 0, currency) }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ formatCurrency(p.dividends ?? 0, currency) }}</td>
            </tr>
          </tbody>
        </table>
      </CollapsibleSection>
    </template>
    <p v-else class="text-sm text-muted">No holdings for this scope.</p>
  </div>
</template>