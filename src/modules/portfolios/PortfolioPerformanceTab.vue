<script lang="ts">
// §82.3 / D88 — the per-year derivation, as an exported pure function beside the
// component (docs/COMPONENTS.md — shared math goes in a plain `<script>` block).
// Exported so the reconciliation it exists to guarantee can be asserted without
// mounting anything.

export interface YearlyReturnRow {
  /** Calendar year of the row. */
  year: number
  /** Year TWR as a PERCENTAGE (same unit as `performance.timeWeightedReturn`). */
  twrPercent: number
  /** Change in net gain (`value − invested`) over the year, portfolio base currency. */
  gain: number
  /** The current calendar year — a partial year, never annualised. */
  isYtd: boolean
}

export interface YearlyReturnTotals {
  /** Π(1 + twrPercent/100) — the compounded product, NOT the sum of percentages. */
  compounded: number
  /** Σ `gain`. */
  gain: number
}

interface SeriesPoint {
  date?: string
  value?: number
  invested?: number | null
  cumulativeTwr?: number
}

/** One row per calendar year, in ascending order. */
export function yearlyReturns(series: SeriesPoint[], today: Date): YearlyReturnRow[] {
  const points = series
    .filter((p): p is SeriesPoint & { date: string } => typeof p.date === "string" && p.date.length >= 4)
    .sort((a, b) => a.date.localeCompare(b.date))

  const net = (p: SeriesPoint) => (p.value ?? 0) - (p.invested ?? 0)
  const currentYear = today.getFullYear()

  // Last point of each year that actually carries a TWR index. A row without one
  // cannot be differenced, so its year is skipped rather than reported as 0% —
  // 0.00% is a claim about the year, and an absent index supports no claim.
  type YearEnd = SeriesPoint & { date: string; cumulativeTwr: number }
  const yearEnd = new Map<number, YearEnd>()
  for (const p of points) {
    if (typeof p.cumulativeTwr !== "number" || !Number.isFinite(p.cumulativeTwr)) continue
    yearEnd.set(Number(p.date.slice(0, 4)), { ...p, cumulativeTwr: p.cumulativeTwr })
  }

  const first = points[0]
  const rows: YearlyReturnRow[] = []
  let base: YearEnd | undefined = first && typeof first.cumulativeTwr === "number" ? { ...first, cumulativeTwr: first.cumulativeTwr } : undefined

  for (const year of [...yearEnd.keys()].sort((a, b) => a - b)) {
    const end = yearEnd.get(year)!
    // §82.3 — the FIRST year is based on the series' own first point, not on a
    // base the series does not contain: a series starting mid-year reports a
    // partial year as a partial year.
    const from = base
    if (!from || from.cumulativeTwr <= 0) {
      base = end
      continue
    }
    rows.push({
      year,
      twrPercent: (end.cumulativeTwr / from.cumulativeTwr - 1) * 100,
      gain: net(end) - net(from),
      isYtd: year === currentYear,
    })
    base = end
  }
  return rows
}

/** The Σ footer. Deliberately a product for % and a sum for money. */
export function yearlyTotals(rows: YearlyReturnRow[]): YearlyReturnTotals {
  return {
    compounded: rows.reduce((acc, r) => acc * (1 + r.twrPercent / 100), 1),
    gain: rows.reduce((acc, r) => acc + r.gain, 0),
  }
}
</script>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watchEffect } from "vue"
import { useRoute } from "vue-router"
import { usePortfolioStore } from "@/stores/portfolios"
import { getPortfolioAnalytics, getPortfolioRiskMetrics, recomputePortfolio } from "@/api/portfolios"
import type { PortfolioAnalyticsTimeframe } from "@/api/portfolios"
import type { PortfolioPositions } from "@/api/types"
import { formatPercent, formatSignedCurrency } from "@/utils/format"
import { currentDrawdownPercent as currentDrawdownPercentOf } from "@/utils/drawdown"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import { useDisplayConversion } from "@/composables/useDisplayConversion"
import { storeToRefs } from "pinia"
import { getLatestRate } from "@/api/fx"
import TickerBadge from "@/components/TickerBadge.vue"
import InstrumentSearchModal from "@/modules/instruments/InstrumentSearchModal.vue"
import PortfolioPerformanceChart from "@/components/PortfolioPerformanceChart.vue"

const route = useRoute()
const store = usePortfolioStore()
const id = String(route.params.id)
const riskMetrics = ref<Record<string, number | null> | null>(null)
const showCustomTimeframe = ref(false)
const backfillPending = ref(store.analytics?.backfillStatus === "pending")

const timeframes: Array<{ value: PortfolioAnalyticsTimeframe; label: string }> = [
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "1Y", label: "1Y" },
  { value: "2Y", label: "2Y" },
  { value: "ALL", label: "ALL" },
]

const benchmarkOptions = [
  { symbol: "SPY", name: "S&P 500" },
  { symbol: "QQQ", name: "Nasdaq 100" },
  { symbol: "DIA", name: "Dow Jones" },
  { symbol: "IWM", name: "Russell 2000" },
  { symbol: "VTI", name: "Total Stock Market" },
  { symbol: "EFA", name: "EAFE" },
  { symbol: "AGG", name: "Aggregate Bond" },
]

const customizeOpen = ref(false)
const showAddBenchmark = ref(false)

// Draft state — local to the modal, only committed on Apply
const draftBenchmarks = ref<string[]>([])

const knownSymbols = new Set(benchmarkOptions.map((o) => o.symbol))
const customDraftBenchmarks = computed(() => draftBenchmarks.value.filter((s) => !knownSymbols.has(s)))

function openCustomize() {
  draftBenchmarks.value = [...store.analyticsBenchmarks]
  customizeOpen.value = true
}

function closeCustomize() {
  customizeOpen.value = false
}

function toggleDraftBenchmark(symbol: string) {
  const current = new Set(draftBenchmarks.value)
  if (current.has(symbol)) current.delete(symbol)
  else current.add(symbol)
  draftBenchmarks.value = [...current]
}

function removeDraftBenchmark(symbol: string) {
  draftBenchmarks.value = draftBenchmarks.value.filter((s) => s !== symbol)
}

function addBenchmark(symbol: string, _name: string) {
  showAddBenchmark.value = false
  const current = new Set(draftBenchmarks.value)
  current.add(symbol)
  draftBenchmarks.value = [...current]
}

async function applyCustomize() {
  customizeOpen.value = false
  const benchmarksChanged = JSON.stringify([...draftBenchmarks.value].sort()) !== JSON.stringify([...store.analyticsBenchmarks].sort())
  if (benchmarksChanged) {
    await store.setBenchmarks(draftBenchmarks.value, id)
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let pollDeadline = 0

function stopPolling() {
  if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null }
}

function startPolling() {
  stopPolling()
  pollDeadline = Date.now() + 5 * 60 * 1000
  pollTimer = setInterval(async () => {
    if (Date.now() > pollDeadline) { stopPolling(); return }
    try {
      const analytics = await getPortfolioAnalytics(id, store.analyticsTimeframe, store.analyticsBenchmarks, store.analyticsReturnType)
      store.analytics = analytics
      if (analytics.backfillStatus !== "pending") {
        backfillPending.value = false
        stopPolling()
      }
    } catch { stopPolling() }
  }, 5000)
}

onMounted(async () => {
  try {
    riskMetrics.value = (await getPortfolioRiskMetrics(id)) as Record<string, number | null> | null
  } catch {
    riskMetrics.value = null
  }
  if (store.analytics?.backfillStatus === "pending") {
    backfillPending.value = true
    startPolling()
  }
})

onUnmounted(() => stopPolling())

async function changeTimeframe(timeframe: PortfolioAnalyticsTimeframe) {
  await store.setTimeframe(timeframe, id)
  if (store.analytics?.backfillStatus === "pending") {
    backfillPending.value = true
    startPolling()
  } else {
    backfillPending.value = false
    stopPolling()
  }
}

const recomputeBusy = ref(false)

async function handleRecompute() {
  if (recomputeBusy.value) return
  recomputeBusy.value = true
  try {
    await recomputePortfolio(id)
    if (store.analytics) store.analytics.backfillStatus = "pending"
    backfillPending.value = true
    startPolling()
  } catch {
    // network error — stay idle; the user can retry
  } finally {
    recomputeBusy.value = false
  }
}

// Config-only options (no `series`) so a refresh takes the updateSeries() path
// and keeps the axis formatter — see PortfolioPerformanceChart §recompute repro.
const monthlySeries = computed(() => [
  {
    name: "Return %",
    data: (store.analytics?.performance?.monthlyReturns ?? []).map((m) => ({ x: m.month, y: m.returnPercent })),
  },
])
const monthlyOptions = {
  chart: { type: "bar" as const, toolbar: { show: false } },
  colors: ["#2563eb"],
  yaxis: {
    labels: { formatter: (v: number) => `${Math.round(v)}%` },
  },
  plotOptions: { bar: { columnWidth: "50%", borderRadius: 3 } },
  dataLabels: { enabled: false },
  tooltip: {
    y: { formatter: (v: number) => `${v.toFixed(2)}%` },
  },
}

const performanceSeries = computed(() => store.analytics?.performance?.timeSeries ?? [])

const currentDrawdownPercent = computed(() =>
  currentDrawdownPercentOf(performanceSeries.value),
)

const maxDrawdownPercent = computed(() => {
  const v = riskMetrics.value?.["maxDrawdown"]
  // Backend returns a negative fraction (e.g. -0.40); multiply by 100 to get
  // percentage. Do NOT negate — drawdown is inherently negative and is shown
  // in red alongside currentDrawdown which is also negative.
  return typeof v === "number" ? v * 100 : null
})

function gainClass(value: number | undefined): string {
  return (value ?? 0) >= 0 ? "text-green-600" : "text-red-600"
}

const performers = computed(() => {
  const open = store.positions.filter((p) => p.isOpen)
  const sorted = [...open].sort((a, b) => (b.unrealizedGainLoss ?? 0) - (a.unrealizedGainLoss ?? 0))
  return {
    top: sorted.slice(0, 5),
    bottom: [...sorted].reverse().slice(0, 5),
  }
})

// §36 — P/L is denominated in each position's instrumentCurrency. When that
// differs from the display currency, add a converted sub-line using the live
// rate via @marx2/contracts/fx (D27). Rates are fetched once per distinct
// instrument currency that differs from the display currency.
// §48.6e B3 — ref (not snapshot): switching the display currency in place
// must re-convert the chart + P/L sub-lines without a re-mount.
const displayStore = useDisplayCurrencyStore()
const { currency: displayCurrency } = storeToRefs(displayStore)

// instrumentCurrency -> rate (1 unit of instrumentCcy in displayCurrency)
const rateByCcy = ref<Record<string, number>>({})

watchEffect(() => {
  const wanted = new Set<string>()
  for (const p of performers.value.top) {
    const ccy = p.instrumentCurrency?.toUpperCase()
    if (ccy && ccy !== displayCurrency.value.toUpperCase()) wanted.add(ccy)
  }
  for (const ccy of wanted) {
    if (rateByCcy.value[ccy]) continue
    void (async () => {
      const rate = await getLatestRate(ccy, displayCurrency.value)
      if (rate && typeof rate.rate === "number" && rate.rate > 0) {
        rateByCcy.value = { ...rateByCcy.value, [ccy]: rate.rate }
      }
    })()
  }
})

/** P/L converted to the display currency (null when ccy matches or no rate). */
function convertedPnl(p: PortfolioPositions[number]): number | null {
  const ccy = p.instrumentCurrency?.toUpperCase()
  if (!ccy || p.unrealizedGainLoss == null) return null
  if (ccy === displayCurrency.value.toUpperCase()) return null
  const rate = rateByCcy.value[ccy]
  if (!rate) return null
  // getLatestRate(ccy, displayCurrency).rate is a direct 1 ccy = rate display
  return p.unrealizedGainLoss * rate
}

// §41.2/§48.6e B3 — the analytics series (and its benchmark overlays) are
// denominated in the portfolio BASE currency (wallets `baseCurrency` — NOT
// `currency`, which API-created portfolios default to USD while their
// positions declare a different base). Convert once per source currency via
// getLatestRate, then pass the converted series + :currency to the shared
// chart component.
const portfolioCcy = computed(() => {
  const d = store.detail
  return (d?.baseCurrency ?? "").toUpperCase()
})
//
// §67.2 — a FIFTH copy of the same conversion, also degrading an unresolvable
// pair to 1:1. Here that was worse than a rounding issue: the chart is labelled
// `:currency="displayCurrency"`, so an unresolvable pair plotted NATIVE
// portfolio-currency values under the display currency's symbol. The series
// still renders (values are left unscaled) but the LABEL now falls back to the
// portfolio's own currency via displayCurrencyOr() — §66.3's rule 2, which is
// what the composable exists to enforce.
const { rate: chartRate, displayCurrencyOr, convert } = useDisplayConversion(() => portfolioCcy.value)
const chartCcy = computed(() => displayCurrencyOr() ?? undefined)

const chartSeries = computed(() => {
  const rate = chartRate.value ?? 1
  return (store.analytics?.performance?.timeSeries ?? []).map((p) => ({
    ...p,
    value: (p.value ?? 0) * rate,
    invested: p.invested != null ? p.invested * rate : null,
    // §78.5 — the withheld amount is in the same currency as `value`, so it has
    // to be scaled by the same display rate. Spreading `...p` carries the raw
    // number through, and leaving it unscaled would print the gap in PLN inside
    // a USD view — a warning whose units contradict the axis beside it.
    unpricedValue: p.unpricedValue != null ? p.unpricedValue * rate : null,
  }))
})

// Benchmark overlays share the portfolio base currency — same rate.
const chartBenchmarks = computed(() => {
  const rate = chartRate.value ?? 1
  return (store.analytics?.benchmarks ?? []).map((b) => ({
    ...b,
    timeSeries: (b.timeSeries ?? []).map((p) => ({ ...p, value: (p.value ?? 0) * rate })),
  }))
})

// ---------------------------------------------------------------------------
// §82.2 / D85 — the overview card: five tiles answering two questions
// ---------------------------------------------------------------------------
// "How much more cash than I put in?" (tiles 1–4) and "was that because the
// investments worked or because I timed the money well?" (tile 5).
//
// Every field is already on the payload this tab holds — this is a READ, not a
// fetch. `annualizedReturn` / `annualizedReturnWithheldReason` arrived in
// §82.1; before that the contract declared them and nothing returned them.
const perf = computed(() => store.analytics?.performance ?? null)

// The two money tiles ride the SAME conversion as the chart series below them —
// the fifth copy of this path is §67.2's bug (plotting native values under a
// foreign symbol), and §66.3 rule 1 is why `convert()` is used rather than a
// bare `× rate`: no rate yet means no number, never a guess.
const netGain = computed(() => convert(perf.value?.totalReturn))
const netInvested = computed(() => convert(perf.value?.totalInvested))

// Rates, not money — currency-independent, so deliberately NOT converted. A
// converted percentage is a category error, and dividing by a rate would be worse.
const xirr = computed(() => perf.value?.moneyWeightedReturn ?? null)
const xirrWithheld = computed(() => perf.value?.moneyWeightedReturnWithheldReason ?? null)
const twrPa = computed(() => perf.value?.annualizedReturn ?? null)
const twrPaWithheld = computed(() => perf.value?.annualizedReturnWithheldReason ?? null)

// §82.2 — Timing is a DIFFERENCE of two rates, so it exists only when both
// inputs do. `?? null` (never `?? 0`) is the whole point: a withheld TWR p.a.
// must not turn into a confident "your timing was worth +13%".
const TIMING_NEUTRAL_PP = 1
const timing = computed(() => {
  if (xirr.value == null || twrPa.value == null) return null
  const delta = xirr.value - twrPa.value
  return {
    delta,
    // Any tighter threshold would be precision these two figures do not support.
    reading:
      delta > TIMING_NEUTRAL_PP
        ? "adding money helped"
        : delta < -TIMING_NEUTRAL_PP
          ? "adding money hurt"
          : "timing was roughly neutral",
  }
})

/** Sign colouring for a rate/money tile. Absent stays neutral, never "green 0%". */
function signClass(value: number | null): string {
  if (value == null || value === 0) return ""
  return value > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
}

/** Plain-language rendering of the contract's withheld reasons. */
function withheldText(reason: string | null | undefined): string {
  if (reason === "insufficient_history") return "not enough history yet"
  if (reason === "invalid_data") return "history contains gaps"
  return "not available"
}

// ---------------------------------------------------------------------------
// §82.3 / D87 — the Monthly | Yearly toggle on the Returns Chart
// ---------------------------------------------------------------------------
const returnsMode = ref<"monthly" | "yearly">("monthly")

/** `analytics` is timeframe-filtered server-side, so only `ALL` holds a year. */
const yearlyAvailable = computed(() => store.analyticsTimeframe === "ALL")

/** Non-ALL forces Monthly without touching the stored choice, so returning to
 *  `ALL` restores Yearly without a second fetch. */
const activeReturnsMode = computed(() => (yearlyAvailable.value ? returnsMode.value : "monthly"))

const yearlyRows = computed(() => yearlyReturns(store.analytics?.performance?.timeSeries ?? [], new Date()))
const yearlyTotalsRow = computed(() => yearlyTotals(yearlyRows.value))

/** Gain column rides the same `convert()` as the Net gain tile, so the Σ footer
 *  and that tile are the same number on screen by construction. */
const yearlyTotalsGain = computed(() => convert(yearlyTotalsRow.value.gain))
</script>

<template>
  <div class="space-y-6">
    <div class="card p-6" data-testid="perf-overview">
      <h2 class="mb-3 text-base font-semibold">Overview</h2>
      <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
          <dt class="text-sm text-slate-500 dark:text-slate-400">Net gain</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums" :class="signClass(netGain)" data-testid="perf-overview-net-gain">{{ formatSignedCurrency(netGain, chartCcy) }}</dd>
        </div>
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
          <dt class="text-sm text-slate-500 dark:text-slate-400">Net invested</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums" data-testid="perf-overview-net-invested">{{ formatSignedCurrency(netInvested, chartCcy) }}</dd>
        </div>
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
          <dt class="text-sm text-slate-500 dark:text-slate-400">XIRR</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums" :class="signClass(xirr)" data-testid="perf-overview-xirr">{{ formatPercent(xirr, 2, true) }}</dd>
          <p v-if="xirr == null" class="mt-1 text-xs text-slate-400 dark:text-slate-500">{{ withheldText(xirrWithheld) }}</p>
        </div>
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
          <dt class="text-sm text-slate-500 dark:text-slate-400">TWR p.a.</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums" :class="signClass(twrPa)" data-testid="perf-overview-twr-pa">{{ formatPercent(twrPa, 2, true) }}</dd>
          <p v-if="twrPa == null" class="mt-1 text-xs text-slate-400 dark:text-slate-500">{{ withheldText(twrPaWithheld) }}</p>
        </div>

        <div
          v-if="timing"
          class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4 sm:col-span-2"
          data-testid="perf-overview-timing"
        >
          <dt class="text-sm text-slate-500 dark:text-slate-400">Timing (XIRR − TWR p.a.)</dt>
          <dd class="mt-1 flex flex-wrap items-baseline gap-2">
            <span class="text-xl font-semibold tabular-nums" :class="signClass(timing.delta)">{{ formatPercent(timing.delta, 2, true) }}</span>
            <span class="text-sm text-slate-500 dark:text-slate-400">{{ timing.reading }}</span>
          </dd>
        </div>
      </dl>
    </div>

    <div class="card p-6">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-base font-semibold">Performance Chart: {{ chartCcy }}</h2>
        <div class="flex flex-wrap items-center gap-1">
          <button
            v-for="tf in timeframes"
            :key="tf.value"
            type="button"
            class="btn-secondary text-xs"
            :class="store.analyticsTimeframe === tf.value ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-500/10 dark:text-blue-400' : ''"
            :aria-pressed="store.analyticsTimeframe === tf.value"
            :disabled="store.analyticsLoading"
            @click="changeTimeframe(tf.value)"
          >
            {{ tf.label }}
          </button>
          <button type="button" class="btn-secondary text-xs" data-testid="perf-controls-customize" :disabled="store.analyticsLoading" @click="openCustomize">
            Customize
          </button>
        </div>
      </div>
      <PortfolioPerformanceChart
        :time-series="chartSeries"
        :benchmarks="chartBenchmarks"
        :currency="chartCcy"
        :backfill-pending="backfillPending || recomputeBusy"
        :recomputing="recomputeBusy || backfillPending"
        :gap-symbols="store.analytics?.gapSymbols ?? null"
        :held-gap-symbols="store.analytics?.heldGapSymbols ?? null"
        :loading="store.analyticsLoading"
        :height="300"
        @recompute="handleRecompute"
      />
    </div>

    <div class="card p-6">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-base font-semibold">Drawdown</h2>
        <button type="button" class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline" @click="showCustomTimeframe = !showCustomTimeframe">
          {{ showCustomTimeframe ? "Hide custom timeframe" : "Add custom timeframe" }}
        </button>
      </div>
      <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
          <dt class="text-sm text-slate-500 dark:text-slate-400">Max Drawdown</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums text-red-600 dark:text-red-400" data-testid="performance-max-drawdown">{{ formatPercent(maxDrawdownPercent, 2, true) }}</dd>
        </div>
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
          <dt class="text-sm text-slate-500 dark:text-slate-400">Current Drawdown</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums text-red-600 dark:text-red-400" data-testid="performance-current-drawdown">{{ formatPercent(currentDrawdownPercent, 2, true) }}</dd>
        </div>
      </dl>
      <p v-if="showCustomTimeframe" class="mt-3 text-sm text-slate-500 dark:text-slate-400">
        Custom timeframe support is coming soon. Pick one of the built-in ranges above instead.
      </p>
    </div>

    <div class="card p-6" data-testid="perf-returns">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-base font-semibold">Returns Chart</h2>
        <div class="flex items-center gap-1" role="group" aria-label="Returns period">
          <button
            type="button"
            class="btn-secondary text-xs"
            :class="activeReturnsMode === 'monthly' ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-500/10 dark:text-blue-400' : ''"
            :aria-pressed="activeReturnsMode === 'monthly'"
            data-testid="perf-returns-mode-monthly"
            @click="returnsMode = 'monthly'"
          >
            Monthly
          </button>
          <button
            type="button"
            class="btn-secondary text-xs"
            :class="activeReturnsMode === 'yearly' ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-500/10 dark:text-blue-400' : ''"
            :aria-pressed="activeReturnsMode === 'yearly'"
            :disabled="!yearlyAvailable"
            data-testid="perf-returns-mode-yearly"
            @click="returnsMode = 'yearly'"
          >
            Yearly
          </button>
        </div>
      </div>

      <component
        :is="'apexchart'"
        v-if="activeReturnsMode === 'monthly' && monthlySeries[0].data.length"
        :options="monthlyOptions"
        :series="monthlySeries"
        height="220"
      />
      <p v-else-if="activeReturnsMode === 'monthly'" class="text-sm text-slate-500 dark:text-slate-400">No monthly data available.</p>

      <div v-else data-testid="perf-returns-yearly">
        <p v-if="!yearlyRows.length" class="text-sm text-slate-500 dark:text-slate-400">No yearly data available.</p>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th scope="col" class="py-2 pr-3 font-medium">Year</th>
              <th scope="col" class="py-2 pr-3 text-right font-medium">TWR %</th>
              <th scope="col" class="py-2 text-right font-medium">Gain</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in yearlyRows"
              :key="row.year"
              class="border-b border-slate-100 dark:border-slate-800"
              :data-testid="`perf-returns-yearly-row-${row.year}`"
            >
              <td class="py-2 pr-3 tabular-nums">{{ row.year }}<span v-if="row.isYtd" class="ml-1 text-xs text-slate-400 dark:text-slate-500">YTD</span></td>
              <td class="py-2 pr-3 text-right tabular-nums" :class="signClass(row.twrPercent)" :data-testid="`perf-returns-yearly-twr-${row.year}`">{{ formatPercent(row.twrPercent, 2, true) }}</td>
              <td class="py-2 text-right tabular-nums" :class="signClass(row.gain)" :data-testid="`perf-returns-yearly-gain-${row.year}`">{{ formatSignedCurrency(convert(row.gain), chartCcy) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="border-t-2 border-slate-200 dark:border-slate-700" data-testid="perf-returns-yearly-total">
              <td class="py-2 pr-3 font-medium">Σ</td>
              <td class="py-2 pr-3 text-right tabular-nums font-medium" data-testid="perf-returns-yearly-total-product">× {{ yearlyTotalsRow.compounded.toFixed(4) }}</td>
              <td class="py-2 text-right tabular-nums font-medium" data-testid="perf-returns-yearly-total-gain">{{ formatSignedCurrency(yearlyTotalsGain, chartCcy) }}</td>
            </tr>
          </tfoot>
        </table>
        <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Σ shows the compounded product, not the sum of yearly percentages.
        </p>
      </div>

      <p v-if="!yearlyAvailable" class="mt-2 text-xs text-slate-500 dark:text-slate-400" data-testid="perf-returns-yearly-hint">
        Yearly is available on the ALL timeframe only — a shorter window holds no full calendar year.
      </p>
    </div>

    <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div class="card p-6">
        <h2 class="mb-3 text-base font-semibold">Top Performers</h2>
        <p v-if="!performers.top.length" class="text-sm text-slate-500 dark:text-slate-400">No open positions.</p>
        <ul v-else class="divide-y divide-slate-100 dark:divide-slate-800">
          <li v-for="p in performers.top" :key="p.id" class="flex items-center justify-between py-2 text-sm">
            <TickerBadge
              size="sm"
              :symbol="p.symbol"
              :name="p.companyName"
              :country-code="p.country"
              :asset-type="p.assetType"
            />
            <div class="text-right">
              <p class="font-medium tabular-nums" :class="gainClass(p.unrealizedGainLoss)">{{ formatSignedCurrency(p.unrealizedGainLoss, p.instrumentCurrency) }}</p>
              <p class="text-xs tabular-nums" :class="gainClass(p.percentageChange)">
                <span v-if="convertedPnl(p) != null" class="opacity-70">{{ formatSignedCurrency(convertedPnl(p), displayCurrency) }}&nbsp;</span>
                {{ formatPercent(p.percentageChange) }}
              </p>
            </div>
          </li>
        </ul>
      </div>

      <div class="card p-6">
        <h2 class="mb-3 text-base font-semibold">Bottom Performers</h2>
        <p v-if="!performers.bottom.length" class="text-sm text-slate-500 dark:text-slate-400">No open positions.</p>
        <ul v-else class="divide-y divide-slate-100 dark:divide-slate-800">
          <li v-for="p in performers.bottom" :key="p.id" class="flex items-center justify-between py-2 text-sm">
            <TickerBadge
              size="sm"
              :symbol="p.symbol"
              :name="p.companyName"
              :country-code="p.country"
              :asset-type="p.assetType"
            />
            <div class="text-right">
              <p class="font-medium tabular-nums" :class="gainClass(p.unrealizedGainLoss)">{{ formatSignedCurrency(p.unrealizedGainLoss, p.instrumentCurrency) }}</p>
              <p class="text-xs tabular-nums" :class="gainClass(p.percentageChange)">
                <span v-if="convertedPnl(p) != null" class="opacity-70">{{ formatSignedCurrency(convertedPnl(p), displayCurrency) }}&nbsp;</span>
                {{ formatPercent(p.percentageChange) }}
              </p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>

  <div v-if="customizeOpen" class="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-16" @click.self="closeCustomize">
    <div class="card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label="Chart controls">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-base font-semibold">Chart controls</h3>
        <button type="button" class="btn-ghost px-2 py-1" aria-label="Close modal" @click="closeCustomize">✕</button>
      </div>

      <div class="space-y-5">
        <div>
          <div class="mb-2 flex items-center justify-between">
            <p class="text-sm font-medium text-slate-700 dark:text-slate-300">Benchmarks</p>
            <button
              type="button"
              class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              data-testid="perf-controls-add-benchmark"
              @click="showAddBenchmark = true"
            >
              Add Custom
            </button>
          </div>
          <div class="space-y-2">
            <label v-for="opt in benchmarkOptions" :key="opt.symbol" class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                :checked="draftBenchmarks.includes(opt.symbol)"
                @change="toggleDraftBenchmark(opt.symbol)"
              />
              <span class="text-sm text-slate-800 dark:text-slate-200">{{ opt.name }}</span>
              <span class="ml-auto text-xs text-slate-400">{{ opt.symbol }}</span>
            </label>
          </div>
          <div v-if="customDraftBenchmarks.length" class="mt-2 space-y-1">
            <p class="text-xs font-medium text-slate-500 dark:text-slate-400">Custom</p>
            <div v-for="sym in customDraftBenchmarks" :key="sym" class="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <span class="text-sm text-slate-800 dark:text-slate-200">{{ sym }}</span>
              <button type="button" class="ml-2 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300" aria-label="Remove benchmark" @click="removeDraftBenchmark(sym)">Remove</button>
            </div>
          </div>
          <p class="mt-3 text-xs text-slate-500 dark:text-slate-400" data-testid="perf-controls-benchmarks">
            Selected: {{ draftBenchmarks.length ? draftBenchmarks.join(", ") : "None" }}
          </p>
        </div>

        <div>
          <p class="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Positions</p>
          <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-700 dark:text-slate-300">
            {{ store.positions.length ? `${store.positions.length} selected` : "All selected" }}
          </div>
        </div>
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="btn-ghost" @click="closeCustomize">Cancel</button>
        <button type="button" class="btn-primary" @click="applyCustomize">Apply</button>
      </div>
    </div>
  </div>

  <InstrumentSearchModal :open="showAddBenchmark" mode="add" title="Add Custom Benchmark" @close="showAddBenchmark = false" @add="addBenchmark" />
</template>
