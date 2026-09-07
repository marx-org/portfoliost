<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import * as instrumentsApi from "@/api/instruments"
import StatGroup from "@/components/StatGroup.vue"
import ResearchPriceChart from "@/modules/instruments/ResearchPriceChart.vue"
import ResearchSeasonality from "@/modules/instruments/ResearchSeasonality.vue"
import type { InstrumentsMetrics, InstrumentsOverviewMetrics, InstrumentsProfile, IrEventsAapl, QuoteAapl } from "@/api/types"
import { formatCompact, formatCurrency, formatNumber, formatPercent } from "@/utils/format"
import { researchSymbol } from "@/utils/research"

const route = useRoute()
const symbol = String(route.params.symbol).toUpperCase()

const profile = ref<InstrumentsProfile | null>(null)
const metrics = ref<InstrumentsMetrics | null>(null)
const overview = ref<InstrumentsOverviewMetrics | null>(null)
const quote = ref<QuoteAapl | null>(null)
const epsSurprises = ref<Array<{ date?: string; year?: number; quarter?: number; eps?: number; epsEstimate?: number }>>([])
const epsMode = ref<"annual" | "quarterly">("annual")
const rawEps = ref<{ annual: Array<Record<string, never>>; quarterly: Array<Record<string, never>> }>({ annual: [], quarterly: [] })
const irEvents = ref<IrEventsAapl>([])
const showFullDescription = ref(false)
const error = ref<string | null>(null)
const limitedCoverage = ref(false)
const loading = ref(true)

onMounted(async () => {
  // Degrade per section: symbols the provider tier doesn't cover (e.g. WSE)
  // still render identity data (Key Facts from profile + ticker reference).
  const [p, m, o, q, eps, ir] = await Promise.allSettled([
    instrumentsApi.getInstrumentProfile(symbol),
    instrumentsApi.getInstrumentMetrics(symbol),
    instrumentsApi.getInstrumentOverviewMetrics(symbol),
    instrumentsApi.getQuote(symbol),
    instrumentsApi.getEpsSurprises(symbol),
    instrumentsApi.getInvestorRelations(symbol),
  ])
  if (p.status === "fulfilled") profile.value = p.value
  if (m.status === "fulfilled") metrics.value = m.value
  if (o.status === "fulfilled") overview.value = o.value
  if (q.status === "fulfilled") quote.value = q.value
  const raw = (eps.status === "fulfilled" ? eps.value : {}) as { annual?: Array<Record<string, never>>; quarterly?: Array<Record<string, never>> }
  rawEps.value = { annual: raw.annual ?? [], quarterly: raw.quarterly ?? [] }
  applyEpsMode("annual")
  irEvents.value = ir.status === "fulfilled" && Array.isArray(ir.value) ? (ir.value as unknown as IrEventsAapl) : []
  if (p.status === "rejected") {
    error.value = p.reason instanceof Error ? p.reason.message : "Failed to load research data"
  } else {
    // Provider tier has no market data for this market (e.g. WSE) — identity
    // data from the ticker reference is still shown.
    limitedCoverage.value = [m, q].some((r) => r.status === "rejected")
  }
  loading.value = false
})

function applyEpsMode(mode: "annual" | "quarterly"): void {
  epsMode.value = mode
  epsSurprises.value = (rawEps.value[mode] ?? []) as never
}

function epsLabel(e: { date?: string; year?: number; quarter?: number }): string {
  if (epsMode.value === "quarterly" && e.quarter) return `Q${e.quarter} ${e.year ?? ""}`.trim()
  return String(e.year ?? e.date ?? "")
}

function stat(label: string, value: string | null | undefined) {
  return { label, value: value ?? "—" }
}

const descriptionParagraphs = computed(() => {
  const text = profile.value?.description ?? ""
  return text ? text.split("\n\n").filter(Boolean) : []
})
const visibleParagraphs = computed(() => (showFullDescription.value ? descriptionParagraphs.value : descriptionParagraphs.value.slice(0, 1)))

const priceTarget = computed(() => metrics.value?.priceTarget ?? null)

/** Instrument's native currency — from profile or quote; fallback USD */
const instrCcy = computed(() =>
  (profile.value?.currency ?? quote.value?.currency ?? "USD").toUpperCase()
)

const latestEarningsCall = computed(() => {
  if (!irEvents.value.length) return null
  const transcripts = irEvents.value.filter((e) => e.type === "transcript" && (e.title ?? "").toLowerCase().includes("earnings call"))
  return transcripts[0] ?? (irEvents.value[0] as { id: string; title: string; date: string } | null)
})

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
  const margins = m?.margins
  if (!m || !margins) return []
  return [
    stat("Gross", formatPercent(margins.grossMargin)),
    stat("EBITDA", formatPercent(margins.ebitdaMargin)),
    stat("Operating", formatPercent(margins.operatingMargin)),
    stat("Net", formatPercent(margins.netProfitMargin)),
  ]
})

const returnStats = computed(() => {
  const ce = metrics.value?.capitalEfficiency
  if (!ce) return []
  return [
    stat("ROA", formatPercent(ce.returnOnAssets)),
    stat("ROTA", formatPercent(ce.returnOnTotalAssets)),
    stat("ROE", formatPercent(ce.returnOnEquity)),
  ]
})

const valuationStats = computed(() => {
  const tv = metrics.value?.trailingValuation
  if (!tv) return []
  return [
    stat("P/E", formatNumber(tv.peRatio)),
    stat("P/B", formatNumber(tv.pbRatio)),
    stat("P/FCF", formatNumber(tv.priceToFcf)),
    stat("EV/Sales", formatNumber(tv.evToSales)),
    stat("EV/EBITDA", formatNumber(tv.evToEBITDA)),
    stat("EV/Gross Profit", formatNumber(tv.evToGrossProfit)),
    stat("Div Yield", formatPercent(tv.dividendYield)),
  ]
})

const valuationNtmStats = computed(() => {
  const tv = metrics.value?.trailingValuation
  if (!tv) return []
  return [
    stat("PEG", formatNumber(tv.pegRatio)),
    stat("Price Target", formatCurrency(tv.priceTarget, instrCcy.value)),
  ]
})

const healthStats = computed(() => {
  const o = overview.value
  const fh = metrics.value?.financialHealth
  if (!o) return []
  return [
    stat("Cash", formatCompact(o.cash)),
    stat("Net Debt", formatCompact(o.netDebt)),
    stat("Current Ratio", formatNumber(fh?.currentRatio)),
    stat("Quick Ratio", formatNumber(fh?.quickRatio)),
  ]
})

const dividendStats = computed(() => {
  const tv = metrics.value?.trailingValuation
  if (!tv) return []
  return [
    stat("Yield", formatPercent(tv.dividendYield)),
    stat("Payout Ratio", formatPercent(tv.payoutRatio)),
    stat("DPS", formatCurrency(tv.dividendPerShare, instrCcy.value)),
    stat("DPS Growth 5Yr", formatPercent(tv.dpsGrowth5yr)),
  ]
})

const growthStats = computed(() => {
  const o = overview.value
  if (!o) return []
  return [
    stat("Rev 3Yr", formatPercent(o.revenueGrowth3yr)),
    stat("Rev 5Yr", formatPercent(o.revenueGrowth5yr)),
    stat("Rev 10Yr", formatPercent(o.revenueGrowth10yr)),
    stat("EPS 3Yr", formatPercent(o.epsGrowth3yr)),
    stat("EPS 5Yr", formatPercent(o.epsGrowth5yr)),
    stat("EPS 10Yr", formatPercent(o.epsGrowth10yr)),
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
  xaxis: { categories: epsSurprises.value.map(epsLabel) },
  plotOptions: { bar: { columnWidth: "45%", borderRadius: 3 } },
  dataLabels: { enabled: false },
  legend: { position: "bottom" as const },
}))

const targetSpread = computed(() => {
  const t = priceTarget.value
  if (!t) return { low: 0, high: 0, current: 0, pct: 0 }
  const low = t.targetLow ?? 0
  const high = t.targetHigh ?? 0
  const current = quote.value?.currentPrice ?? 0
  const span = high - low || 1
  return { low, high, current, pct: Math.min(100, Math.max(0, ((current - low) / span) * 100)) }
})
</script>

<template>
  <div class="space-y-6">
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <div v-if="limitedCoverage && !error" class="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
      <svg class="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0Zm-8-4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" clip-rule="evenodd" />
      </svg>
      <span>
        <span class="font-medium">Limited data availability.</span>
        Market data for this listing is not covered by our data providers yet — basic instrument facts below come from the ticker reference database.
      </span>
    </div>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading research data...</p>

    <template v-if="!loading && !error">
      <div class="flex items-center gap-3">
        <img :src="`/api/logos/${symbol}`" :alt="profile?.name ?? symbol" class="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800" />
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-semibold">{{ symbol }}</h2>
            <span class="text-sm text-slate-500 dark:text-slate-400">{{ profile?.name }}</span>
          </div>
           <p v-if="quote?.currentPrice" class="text-sm">
             <span class="font-semibold">{{ formatCurrency(quote.currentPrice, instrCcy) }}</span>
             <span :class="quote.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'" class="ml-2">
               {{ quote.change >= 0 ? "+" : "" }}{{ formatCurrency(quote.change, instrCcy) }} ({{ formatPercent(quote.percentChange) }})
             </span>
           </p>
        </div>
      </div>

      <div v-if="descriptionParagraphs.length" class="card p-6">
        <h2 class="mb-3 text-base font-semibold">About {{ profile?.name ?? symbol }}</h2>
        <p v-for="(p, i) in visibleParagraphs" :key="i" class="mb-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200 last:mb-0">{{ p }}</p>
        <button
          v-if="descriptionParagraphs.length > 1"
          type="button"
          class="mt-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          @click="showFullDescription = !showFullDescription"
        >
          {{ showFullDescription ? "Show less" : "Show more" }}
        </button>
      </div>

      <div v-if="priceTarget" class="card p-6">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-base font-semibold">Analyst Price Target</h2>
          <span class="text-xs text-slate-500 dark:text-slate-400">{{ priceTarget.numberAnalysts }} analysts · {{ priceTarget.lastUpdated }}</span>
        </div>
        <div class="flex flex-wrap gap-6 text-sm">
          <div>
            <p class="text-slate-500 dark:text-slate-400">Low</p>
             <p class="font-semibold">{{ formatCurrency(priceTarget.targetLow, instrCcy) }}</p>
          </div>
           <div>
             <p class="text-slate-500 dark:text-slate-400">Mean</p>
             <p class="font-semibold">{{ formatCurrency(priceTarget.targetMean, instrCcy) }}</p>
          </div>
           <div>
             <p class="text-slate-500 dark:text-slate-400">Median</p>
             <p class="font-semibold">{{ formatCurrency(priceTarget.targetMedian, instrCcy) }}</p>
          </div>
           <div>
             <p class="text-slate-500 dark:text-slate-400">High</p>
             <p class="font-semibold">{{ formatCurrency(priceTarget.targetHigh, instrCcy) }}</p>
          </div>
        </div>
        <div class="relative mt-4 h-2 rounded-full bg-slate-200 dark:bg-slate-700/70">
          <div class="absolute inset-y-0 rounded-full bg-blue-200" :style="{ left: '0%', width: '100%' }"></div>
          <div
            class="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded bg-slate-700"
            :style="{ left: `calc(${targetSpread.pct}% - 2px)` }"
            :title="`Current ${formatCurrency(targetSpread.current, instrCcy)}`"
          ></div>
        </div>
        <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">Current price: {{ formatCurrency(targetSpread.current, instrCcy) }}</p>
      </div>

      <div class="card p-6">
        <h2 class="mb-3 text-base font-semibold">Key Facts</h2>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt class="text-slate-500 dark:text-slate-400">Name</dt>
          <dd>{{ profile?.name }}</dd>
          <dt class="text-slate-500 dark:text-slate-400">Sector</dt>
          <dd>{{ profile?.gicsSector ?? "—" }}</dd>
          <dt class="text-slate-500 dark:text-slate-400">Industry</dt>
          <dd>{{ profile?.gicsIndustry ?? "—" }}</dd>
          <dt class="text-slate-500 dark:text-slate-400">Country</dt>
          <dd class="flex items-center gap-1.5">
            <img
              v-if="profile?.countryCode"
              :src="`https://flagcdn.com/w40/${profile.countryCode.toLowerCase()}.png`"
              :alt="profile.country ?? ''"
              class="h-3 w-[18px] rounded-[1px] object-cover"
              loading="lazy"
            />
            <span>{{ profile?.country ?? "—" }}</span>
          </dd>
          <dt class="text-slate-500 dark:text-slate-400">ISIN</dt>
          <dd class="tabular-nums">{{ profile?.isin ?? "—" }}</dd>
          <dt class="text-slate-500 dark:text-slate-400">Exchange</dt>
          <dd>{{ profile?.exchange ?? "—" }}</dd>
          <dt class="text-slate-500 dark:text-slate-400">Employees</dt>
          <dd>{{ profile?.employeeTotal ? formatNumber(profile.employeeTotal, 0) : "—" }}</dd>
          <dt class="text-slate-500 dark:text-slate-400">CEO</dt>
          <dd>{{ profile?.ceo ?? "—" }}</dd>
        </dl>
        <a
          v-if="profile?.weburl"
          :href="profile.weburl"
          target="_blank"
          rel="noopener"
          class="mt-3 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          {{ profile.weburl.replace(/^https?:\/\//, "") }}
        </a>
      </div>

      <div v-if="latestEarningsCall" class="card p-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold">Latest Earnings Call</h2>
            <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">{{ latestEarningsCall.title }}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">{{ latestEarningsCall.date }}</p>
          </div>
          <router-link
            :to="{
              name: 'research-ir-transcript',
              params: { symbol: researchSymbol(symbol), eventId: latestEarningsCall.id },
            }"
            class="btn-secondary text-sm"
          >
            Open transcript
          </router-link>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ResearchSeasonality :symbol="symbol" />
        <div class="card p-6">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-base font-semibold">EPS Surprises - {{ symbol }}</h2>
            <select v-model="epsMode" aria-label="EPS timeframe" class="rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1 text-xs" @change="applyEpsMode(epsMode)">
              <option value="annual">Annual</option>
              <option value="quarterly">5Q</option>
            </select>
          </div>
          <component :is="'apexchart'" v-if="epsSurprises.length" :options="epsChartOptions" :series="epsChartOptions.series" />
          <p v-else class="text-sm text-slate-500 dark:text-slate-400">No earnings data available.</p>
        </div>
      </div>

      <div v-if="metrics" class="card p-6">
        <h2 class="mb-4 text-base font-semibold">Key Statistics</h2>
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          <StatGroup title="Profile" :items="profileStats" />
          <StatGroup title="Margins" :items="marginStats" />
          <StatGroup title="Returns (TTM)" :items="returnStats" />
          <StatGroup title="Valuation (TTM)" :items="valuationStats" />
          <StatGroup title="Valuation (NTM)" :items="valuationNtmStats" />
          <StatGroup title="Financial Health" :items="healthStats" />
          <StatGroup title="Dividends" :items="dividendStats" />
          <StatGroup title="Growth (CAGR)" :items="growthStats" />
        </div>
      </div>

      <ResearchPriceChart :symbol="symbol" />
    </template>
  </div>
</template>
