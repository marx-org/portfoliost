<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import * as instrumentsApi from "@/api/instruments"
import StatGroup from "@/components/StatGroup.vue"
import type { InstrumentsMetrics, InstrumentsOverviewMetrics, InstrumentsProfile, QuoteAapl } from "@/api/types"
import { formatCompact, formatCurrency, formatNumber, formatPercent } from "@/utils/format"

const route = useRoute()
const symbol = String(route.params.symbol).toUpperCase()

const profile = ref<InstrumentsProfile | null>(null)
const metrics = ref<InstrumentsMetrics | null>(null)
const overview = ref<InstrumentsOverviewMetrics | null>(null)
const quote = ref<QuoteAapl | null>(null)
const epsSurprises = ref<Array<{ date?: string; year?: number; eps?: number; epsEstimate?: number }>>([])
const priceHistory = ref<{ dates: string[]; prices: number[] }>({ dates: [], prices: [] })
const error = ref<string | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const [p, m, o, q, eps, hist] = await Promise.all([
      instrumentsApi.getInstrumentProfile(symbol),
      instrumentsApi.getInstrumentMetrics(symbol),
      instrumentsApi.getInstrumentOverviewMetrics(symbol).catch(() => null),
      instrumentsApi.getQuote(symbol),
      instrumentsApi.getEpsSurprises(symbol).catch(() => ({ annual: [] })),
      instrumentsApi.getHistory(symbol, "daily").catch(() => null),
    ])
    profile.value = p
    metrics.value = m
    overview.value = o
    quote.value = q
    const raw = (eps ?? {}) as { annual?: Array<{ date?: string; year?: number; eps?: number; epsEstimate?: number }> }
    epsSurprises.value = Array.isArray(eps) ? (eps as never) : raw.annual ?? []
    if (hist) {
      const h = hist as { timestamps: number[]; closePrices: number[] }
      priceHistory.value = {
        dates: h.timestamps.map((t) => new Date(t * 1000).toLocaleDateString("en-US", { month: "short", year: "2-digit" })),
        prices: h.closePrices,
      }
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load research data"
  } finally {
    loading.value = false
  }
})

function stat(label: string, value: string | null | undefined) {
  return { label, value: value ?? "—" }
}

const profileStats = computed(() => {
  const o = overview.value
  if (!o) return []
  return [
    stat("Market Cap", formatCompact(o.marketCap)),
    stat("EV", formatCompact(o.enterpriseValue)),
    stat("Shares Out", formatCompact(o.sharesOutstanding)),
    stat("Revenue", formatCompact(o.revenue)),
    stat("Employees", formatCompact(o.employees)),
  ]
})

const marginStats = computed(() => {
  const m = metrics.value
  if (!m) return []
  return [
    stat("Gross", formatPercent(m.margins.grossMargin)),
    stat("EBITDA", formatPercent(m.margins.ebitdaMargin)),
    stat("Operating", formatPercent(m.margins.operatingMargin)),
    stat("Net", formatPercent(m.margins.netProfitMargin)),
  ]
})

const returnStats = computed(() => {
  const ce = metrics.value?.capitalEfficiency
  if (!ce) return []
  return [stat("ROA", formatPercent(ce.returnOnAssets)), stat("ROE", formatPercent(ce.returnOnEquity))]
})

const valuationStats = computed(() => {
  const tv = metrics.value?.trailingValuation
  if (!tv) return []
  return [
    stat("P/E", formatNumber(tv.peRatio)),
    stat("P/B", formatNumber(tv.pbRatio)),
    stat("EV/Sales", formatNumber(tv.evToSales)),
    stat("EV/EBITDA", formatNumber(tv.evToEBITDA)),
    stat("Div Yield", formatPercent(tv.dividendYield)),
  ]
})

const healthStats = computed(() => {
  const o = overview.value
  if (!o) return []
  return [stat("Cash", formatCompact(o.cash)), stat("Net Debt", formatCompact(o.netDebt))]
})

const growthStats = computed(() => {
  const o = overview.value
  if (!o) return []
  return [
    stat("Rev 3Yr", formatPercent(o.revenueGrowth3yr)),
    stat("Rev 5Yr", formatPercent(o.revenueGrowth5yr)),
    stat("EPS 5Yr", formatPercent(o.epsGrowth5yr)),
    stat("Rev Fwd", formatPercent(o.revenueGrowthFwd)),
    stat("EPS Fwd", formatPercent(o.epsGrowthFwd)),
  ]
})

const epsChartOptions = computed(() => ({
  chart: { type: "bar" as const, height: 260, toolbar: { show: false }, stacked: false },
  colors: ["#2563eb", "#94a3b8"],
  series: [
    { name: "EPS", data: epsSurprises.value.map((e) => e.eps ?? null) },
    { name: "Estimate", data: epsSurprises.value.map((e) => e.epsEstimate ?? null) },
  ],
  xaxis: { categories: epsSurprises.value.map((e) => String(e.year ?? e.date ?? "")) },
  plotOptions: { bar: { columnWidth: "45%", borderRadius: 3 } },
  dataLabels: { enabled: false },
  legend: { position: "bottom" as const },
}))

const priceChartOptions = computed(() => ({
  chart: { type: "area" as const, height: 300, toolbar: { show: true }, zoom: { enabled: false } },
  colors: ["#2563eb"],
  series: [{ name: "Price", data: priceHistory.value.prices }],
  xaxis: { categories: priceHistory.value.dates, labels: { show: false } },
  stroke: { curve: "smooth" as const, width: 2 },
  dataLabels: { enabled: false },
  fill: { type: "gradient" as const, gradient: { opacityFrom: 0.3, opacityTo: 0 } },
}))
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500">Loading research data...</p>

    <template v-if="!loading && !error">
      <div class="flex items-center gap-3">
        <img :src="`/api/logos/${symbol}`" :alt="profile?.name ?? symbol" class="h-10 w-10 rounded-full bg-slate-100" />
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-semibold">{{ symbol }}</h2>
            <span class="text-sm text-slate-500">{{ profile?.name }}</span>
          </div>
          <p v-if="quote" class="text-sm">
            <span class="font-semibold">{{ formatCurrency(quote.currentPrice) }}</span>
            <span :class="quote.change >= 0 ? 'text-green-600' : 'text-red-600'" class="ml-2">
              {{ quote.change >= 0 ? "+" : "" }}{{ formatCurrency(quote.change) }} ({{ formatPercent(quote.percentChange) }})
            </span>
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div class="card p-6">
          <h2 class="mb-3 text-base font-semibold">Company Overview</h2>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt class="text-slate-500">Name</dt>
            <dd>{{ profile?.name }}</dd>
            <dt class="text-slate-500">Sector</dt>
            <dd>{{ profile?.gicsSector ?? "—" }}</dd>
            <dt class="text-slate-500">Industry</dt>
            <dd>{{ profile?.gicsIndustry ?? "—" }}</dd>
            <dt class="text-slate-500">Country</dt>
            <dd>{{ profile?.country ?? "—" }}</dd>
            <dt class="text-slate-500">Exchange</dt>
            <dd>{{ profile?.exchange ?? "—" }}</dd>
            <dt class="text-slate-500">Employees</dt>
            <dd>{{ profile?.employeeTotal ? formatNumber(profile.employeeTotal, 0) : "—" }}</dd>
            <dt class="text-slate-500">CEO</dt>
            <dd>{{ profile?.ceo ?? "—" }}</dd>
          </dl>
          <a
            v-if="profile?.weburl"
            :href="profile.weburl"
            target="_blank"
            rel="noopener"
            class="mt-3 inline-block text-sm text-blue-600 hover:underline"
          >
            {{ profile.weburl.replace(/^https?:\/\//, "") }}
          </a>
        </div>

        <div class="card p-6 xl:col-span-2">
          <h2 class="mb-3 text-base font-semibold">EPS Surprises - {{ symbol }}</h2>
          <component :is="'apexchart'" v-if="epsSurprises.length" :options="epsChartOptions" :series="epsChartOptions.series" />
          <p v-else class="text-sm text-slate-500">No earnings data available.</p>
        </div>
      </div>

      <div class="card p-6">
        <h2 class="mb-4 text-base font-semibold">Company Statistics</h2>
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          <StatGroup title="Profile" :items="profileStats" />
          <StatGroup title="Margins" :items="marginStats" />
          <StatGroup title="Returns (TTM)" :items="returnStats" />
          <StatGroup title="Valuation (TTM)" :items="valuationStats" />
          <StatGroup title="Financial Health" :items="healthStats" />
          <StatGroup title="Growth (CAGR)" :items="growthStats" />
        </div>
      </div>

      <div class="card p-6">
        <h2 class="mb-3 text-base font-semibold">Price Chart</h2>
        <component :is="'apexchart'" v-if="priceHistory.prices.length" :options="priceChartOptions" :series="priceChartOptions.series" />
        <p v-else class="text-sm text-slate-500">No price history available.</p>
      </div>
    </template>
  </div>
</template>
