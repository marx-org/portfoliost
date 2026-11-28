<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useI18n } from "vue-i18n"
import { useRoute } from "vue-router"
import * as instrumentsApi from "@/api/instruments"
import { ApiError } from "@/api/client"
import TickerBadge from "@/components/TickerBadge.vue"
import StatGroup from "@/components/StatGroup.vue"
import PriceChart from "@/components/PriceChart.vue"
import CurrencyWarningBadge from "@/components/CurrencyWarningBadge.vue"
import ResearchSeasonality from "@/modules/instruments/ResearchSeasonality.vue"
import KeyFactsCard from "@/modules/instruments/KeyFactsCard.vue"
import type { InstrumentsMetrics, InstrumentsOverviewMetrics, InstrumentsProfile, IrEventsAapl, QuoteAapl } from "@/api/types"
import { formatAmount, formatCompact, formatNumber, formatPercent } from "@/utils/format"
import { researchSymbol } from "@/utils/research"
import { withSharedChart } from "@/utils/chartOptions"
import { resolveInstrumentCurrency } from "@/utils/instrumentCurrency"

const route = useRoute()
const { t } = useI18n()
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
    // A 404 profile means the provider tier has no profile for this symbol — a
    // fund category (`ING01W`), a delisted line, an unsynced reference row — not
    // that the page cannot be rendered. Treating it as fatal blanked the whole
    // body (`v-if="!loading && !error"` below) and printed the backend's message,
    // which for an upstream miss is the cachest URL itself. The quote and the
    // price bars are separate requests and frequently do work, so this degrades
    // to the same amber banner the page already uses for partial market data.
    // Every other failure (502/503, network, a bare Error) stays fatal.
    const notFound = p.reason instanceof ApiError && p.reason.status === 404
    if (notFound) {
      limitedCoverage.value = true
    } else {
      error.value = p.reason instanceof Error ? p.reason.message : t("research.loadResearchError")
    }
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

/** §47.5 — the instrument's currency + sourcing signal (no "USD" fallback):
 * null + "unknown" when nothing declares one, "estimated" when the backend
 * resolved it locally. */
const currency = computed(() => resolveInstrumentCurrency(profile.value, quote.value))
const instrCcy = computed(() => currency.value.currency)
const currencySource = computed(() => currency.value.currencySource)

const latestEarningsCall = computed(() => {
  if (!irEvents.value.length) return null
  const transcripts = irEvents.value.filter((e) => e.type === "transcript" && (e.title ?? "").toLowerCase().includes("earnings call"))
  return transcripts[0] ?? (irEvents.value[0] as { id: string; title: string; date: string } | null)
})

const profileStats = computed(() => {
  const o = overview.value
  if (!o) return []
  return [
    stat(t("research.statMarketCap"), formatCompact(o.marketCap)),
    stat(t("research.statEv"), formatCompact(o.enterpriseValue)),
    stat(t("research.statSharesOut"), formatCompact(o.sharesOutstanding)),
    stat(t("research.statRevenue"), formatCompact(o.revenue)),
    stat(t("research.statEmployees"), formatCompact(o.employees)),
  ]
})

const marginStats = computed(() => {
  const m = metrics.value
  const margins = m?.margins
  if (!m || !margins) return []
  return [
    stat(t("research.statGross"), formatPercent(margins.grossMargin)),
    stat(t("research.statEbitda"), formatPercent(margins.ebitdaMargin)),
    stat(t("research.statOperating"), formatPercent(margins.operatingMargin)),
    stat(t("research.statNet"), formatPercent(margins.netProfitMargin)),
  ]
})

const returnStats = computed(() => {
  const ce = metrics.value?.capitalEfficiency
  if (!ce) return []
  return [
    stat(t("research.statRoa"), formatPercent(ce.returnOnAssets)),
    stat(t("research.statRota"), formatPercent(ce.returnOnTotalAssets)),
    stat(t("research.statRoe"), formatPercent(ce.returnOnEquity)),
  ]
})

const valuationStats = computed(() => {
  const tv = metrics.value?.trailingValuation
  if (!tv) return []
  return [
    stat(t("research.statPe"), formatNumber(tv.peRatio)),
    stat(t("research.statPb"), formatNumber(tv.pbRatio)),
    stat(t("research.statPfcf"), formatNumber(tv.priceToFcf)),
    stat(t("research.statEvsales"), formatNumber(tv.evToSales)),
    stat(t("research.statEvebitda"), formatNumber(tv.evToEBITDA)),
    stat(t("research.statEvgrossprofit"), formatNumber(tv.evToGrossProfit)),
    stat(t("research.statDivYield"), formatPercent(tv.dividendYield)),
  ]
})

const valuationNtmStats = computed(() => {
  const tv = metrics.value?.trailingValuation
  if (!tv) return []
  return [
    stat(t("research.statPeg"), formatNumber(tv.pegRatio)),
    stat(t("research.statPriceTarget"), formatAmount(tv.priceTarget, instrCcy.value)),
  ]
})

const healthStats = computed(() => {
  const o = overview.value
  const fh = metrics.value?.financialHealth
  if (!o) return []
  return [
    stat(t("research.statCash"), formatCompact(o.cash)),
    stat(t("research.statNetDebt"), formatCompact(o.netDebt)),
    stat(t("research.statCurrentRatio"), formatNumber(fh?.currentRatio)),
    stat(t("research.statQuickRatio"), formatNumber(fh?.quickRatio)),
  ]
})

const dividendStats = computed(() => {
  const tv = metrics.value?.trailingValuation
  if (!tv) return []
  return [
    stat(t("research.statYield"), formatPercent(tv.dividendYield)),
    stat(t("research.statPayoutRatio"), formatPercent(tv.payoutRatio)),
    stat(t("research.statDps"), formatAmount(tv.dividendPerShare, instrCcy.value)),
    stat(t("research.statDpsGrowth5y"), formatPercent(tv.dpsGrowth5yr)),
  ]
})

const growthStats = computed(() => {
  const o = overview.value
  if (!o) return []
  return [
    stat(t("research.statRev3y"), formatPercent(o.revenueGrowth3yr)),
    stat(t("research.statRev5y"), formatPercent(o.revenueGrowth5yr)),
    stat(t("research.statRev10y"), formatPercent(o.revenueGrowth10yr)),
    stat(t("research.statEps3y"), formatPercent(o.epsGrowth3yr)),
    stat(t("research.statEps5y"), formatPercent(o.epsGrowth5yr)),
    stat(t("research.statEps10y"), formatPercent(o.epsGrowth10yr)),
    stat(t("research.statRevFwd"), formatPercent(o.revenueGrowthFwd)),
    stat(t("research.statEpsFwd"), formatPercent(o.epsGrowthFwd)),
  ]
})

const epsChartOptions = computed(() => withSharedChart({
  chart: { type: "bar" as const, height: 260, toolbar: { show: false }, stacked: false },
  colors: ["var(--accent)", "var(--muted)"],
  fill: { type: "solid" as const },
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
    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-danger">{{ error }}</p>
    <div v-if="limitedCoverage && !error" class="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
      <svg class="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0Zm-8-4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" clip-rule="evenodd" />
      </svg>
      <span>
        <span class="font-medium">{{ t("research.limitedData") }}</span>
        {{ t("research.limitedDataBody") }}<template v-if="profile">{{ t("research.limitedDataFacts") }}</template>.
      </span>
    </div>
    <p v-if="loading" class="text-sm text-muted">{{ t("research.loadingResearch") }}</p>

    <template v-if="!loading && !error">
      <div class="flex items-start gap-3">
        <div>
          <TickerBadge
            size="lg"
            title-as="h2"
            testid="overview-ticker"
            :symbol="symbol"
            :name="profile?.name"
            :country-code="profile?.countryCode"
            :asset-type="profile?.assetType"
          />
            <p v-if="quote?.currentPrice" class="flex flex-wrap items-center gap-2 text-sm">
              <span class="font-semibold">{{ formatAmount(quote.currentPrice, instrCcy) }}</span>
              <span :class="quote.change >= 0 ? 'text-emerald' : 'text-danger'" class="ml-0">
                {{ quote.change >= 0 ? "+" : "" }}{{ formatAmount(quote.change, instrCcy) }} ({{ formatPercent(quote.percentChange) }})
              </span>
              <CurrencyWarningBadge :source="currencySource" :currency="instrCcy" />
            </p>
        </div>
      </div>

      <div v-if="descriptionParagraphs.length" class="card p-6">
        <h2 class="card-title mb-3">{{ t("research.aboutName", { name: profile?.name ?? symbol }) }}</h2>
        <p v-for="(p, i) in visibleParagraphs" :key="i" class="mb-3 text-sm leading-relaxed text-text last:mb-0">{{ p }}</p>
        <button
          v-if="descriptionParagraphs.length > 1"
          type="button"
          class="mt-2 text-sm font-medium text-accent-text hover:underline"
          @click="showFullDescription = !showFullDescription"
        >
          {{ showFullDescription ? t("research.showLess") : t("research.showMore") }}
        </button>
      </div>

      <div v-if="priceTarget" class="card p-6">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 class="card-title">{{ t("research.analystPriceTarget") }}</h2>
          <span class="text-xs text-muted">{{ t("research.analystsCount", { count: priceTarget.numberAnalysts, date: priceTarget.lastUpdated }) }}</span>
        </div>
        <div class="flex flex-wrap gap-6 text-sm">
          <div>
            <p class="text-muted">{{ t("research.low") }}</p>
             <p class="font-semibold">{{ formatAmount(priceTarget.targetLow, instrCcy) }}</p>
          </div>
           <div>
             <p class="text-muted">{{ t("research.mean") }}</p>
             <p class="font-semibold">{{ formatAmount(priceTarget.targetMean, instrCcy) }}</p>
          </div>
           <div>
             <p class="text-muted">{{ t("research.median") }}</p>
             <p class="font-semibold">{{ formatAmount(priceTarget.targetMedian, instrCcy) }}</p>
          </div>
           <div>
             <p class="text-muted">{{ t("research.high") }}</p>
             <p class="font-semibold">{{ formatAmount(priceTarget.targetHigh, instrCcy) }}</p>
          </div>
        </div>
        <div class="relative mt-4 h-2 rounded-full bg-border">
          <div class="absolute inset-y-0 rounded-full bg-blue-200" :style="{ left: '0%', width: '100%' }"></div>
          <div
            class="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded bg-slate-700"
            :style="{ left: `calc(${targetSpread.pct}% - 2px)` }"
            :title="t('research.currentPriceTitle', { value: formatAmount(targetSpread.current, instrCcy) })"
          ></div>
        </div>
        <p class="mt-2 text-xs text-muted">{{ t("research.currentPriceLabel", { value: formatAmount(targetSpread.current, instrCcy) }) }}</p>
      </div>

      <!-- §86 — the heading and the card wrapper live in the component, so the
           markup is identical to the hard-coded block it replaces. -->
      <KeyFactsCard v-if="profile" :profile="profile" />

      <div v-if="latestEarningsCall" class="card p-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="card-title">{{ t("research.latestEarningsCall") }}</h2>
            <p class="mt-1 text-sm text-muted">{{ latestEarningsCall.title }}</p>
            <p class="text-xs text-muted">{{ latestEarningsCall.date }}</p>
          </div>
          <router-link
            :to="{
              name: 'research-ir-transcript',
              params: { symbol: researchSymbol(symbol), eventId: latestEarningsCall.id },
            }"
            class="btn-secondary text-sm"
          >
            {{ t("research.openTranscript") }}
          </router-link>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ResearchSeasonality :symbol="symbol" />
        <div class="card p-6">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="card-title">{{ t("research.epsSurprises", { symbol }) }}</h2>
            <select v-model="epsMode" :aria-label="t('research.epsTimeframe')" class="rounded-md border border-border px-2 py-1 text-xs" @change="applyEpsMode(epsMode)">
              <option value="annual">{{ t("research.annual") }}</option>
              <option value="quarterly">{{ t("research.fiveQ") }}</option>
            </select>
          </div>
          <component :is="'apexchart'" v-if="epsSurprises.length" :options="epsChartOptions" :series="epsChartOptions.series" />
          <p v-else class="text-sm text-muted">{{ t("research.noEarningsData") }}</p>
        </div>
      </div>

      <div v-if="metrics" class="card p-6">
        <h2 class="card-title mb-4">{{ t("research.keyStatistics") }}</h2>
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          <StatGroup :title="t('research.groupProfile')" :items="profileStats" />
          <StatGroup :title="t('research.groupMargins')" :items="marginStats" />
          <StatGroup :title="t('research.groupReturns')" :items="returnStats" />
          <StatGroup :title="t('research.groupValuationTtm')" :items="valuationStats" />
          <StatGroup :title="t('research.groupValuationNtm')" :items="valuationNtmStats" />
          <StatGroup :title="t('research.groupFinancialHealth')" :items="healthStats" />
          <StatGroup :title="t('research.groupDividends')" :items="dividendStats" />
          <StatGroup :title="t('research.groupGrowth')" :items="growthStats" />
        </div>
      </div>

      <PriceChart :symbol="symbol" :currency="instrCcy" />
    </template>
  </div>
</template>
