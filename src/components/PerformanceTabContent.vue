<script lang="ts">
// §82.3 / D88 — the per-year derivation, as an exported pure function beside the
// component (docs/COMPONENTS.md — shared math goes in a plain `<script>` block).
// Exported so the reconciliation it exists to guarantee can be asserted without
// mounting anything.
//
// §83.1 — this block MOVED here from `modules/portfolios/PortfolioPerformanceTab.vue`
// together with the template that consumes it. The Yearly table below calls
// `yearlyReturns`, so splitting the derivation from its only consumer would
// leave one behaviour with two homes. It is deliberately NOT re-exported from
// the route wrapper: two import paths for one derivation is how two tabs end up
// with two answers.

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

type Indexed = SeriesPoint & { date: string; index: number }

/**
 * The year-boundary walk both derivations share: pick each year's last point that
 * carries a usable index, then difference it against the previous year's end (or
 * the series' own first point, for the first year).
 *
 * `indexOf` is what differs between them — the portfolio's index is the stored
 * flow-neutral `cumulative_twr`, the benchmark's is its normalised `value`. One
 * walk, so the two can never pick different year boundaries, which is the only
 * way a per-year excess number is wrong while both of its inputs look right.
 */
function yearRows(series: SeriesPoint[], today: Date, indexOf: (p: SeriesPoint) => unknown): YearlyReturnRow[] {
  const points = series
    .filter((p): p is SeriesPoint & { date: string } => typeof p.date === "string" && p.date.length >= 4)
    .sort((a, b) => a.date.localeCompare(b.date))

  const net = (p: SeriesPoint) => (p.value ?? 0) - (p.invested ?? 0)
  const currentYear = today.getFullYear()

  // A year whose last point carries no index cannot be differenced, so it is
  // skipped rather than reported as 0% — 0.00% is a claim about the year, and an
  // absent index supports no claim.
  const yearEnd = new Map<number, Indexed>()
  for (const p of points) {
    const index = indexOf(p)
    if (typeof index !== "number" || !Number.isFinite(index)) continue
    yearEnd.set(Number(p.date.slice(0, 4)), { ...p, index })
  }

  const first = points[0]
  const rows: YearlyReturnRow[] = []
  let base: Indexed | undefined = first ? withIndex(first, indexOf) : undefined

  for (const year of [...yearEnd.keys()].sort((a, b) => a - b)) {
    const end = yearEnd.get(year)!
    // §82.3 — the FIRST year is based on the series' own first point, not on a
    // base the series does not contain: a series starting mid-year reports a
    // partial year as a partial year.
    const from = base
    if (!from || from.index <= 0) {
      base = end
      continue
    }
    rows.push({
      year,
      twrPercent: (end.index / from.index - 1) * 100,
      gain: net(end) - net(from),
      isYtd: year === currentYear,
    })
    base = end
  }
  return rows
}

function withIndex(p: SeriesPoint & { date: string }, indexOf: (p: SeriesPoint) => unknown): Indexed | undefined {
  const index = indexOf(p)
  return typeof index === "number" && Number.isFinite(index) ? { ...p, index } : undefined
}

/** One row per calendar year, in ascending order. */
export function yearlyReturns(series: SeriesPoint[], today: Date): YearlyReturnRow[] {
  return yearRows(series, today, (p) => p.cumulativeTwr)
}

/**
 * §82.4 / D89 — the same walk over a benchmark's own series. `value` is already
 * the transaction-mirrored index (normalised to 100 by the route), so it is the
 * benchmark's TWR year by year; `gain` is not meaningful here and nothing reads
 * it.
 */
export function benchmarkYearlyReturns(
  series: SeriesPoint[],
  today: Date,
): Array<Pick<YearlyReturnRow, "year" | "twrPercent">> {
  return yearRows(series, today, (p) => p.value).map(({ year, twrPercent }) => ({ year, twrPercent }))
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
// §83.1 — the tab body, extracted from `modules/portfolios/PortfolioPerformanceTab.vue`
// with no behaviour change, so the same component can be mounted for ONE
// portfolio (from the route wrapper) and for the whole account (from
// `/investments/performance`).
//
// Everything that reaches outside the tab is a prop or an emit. Everything that
// is a pure function of those props — the display-currency conversion, the P/L
// sub-line conversion, the yearly walk, the performers sort — STAYS here, which
// is the entire return on the refactor: the aggregate tab inherits all of it and
// none of it is re-implemented per tab.
import { computed, ref, watchEffect } from "vue"
import { storeToRefs } from "pinia"
import { useRoute } from "vue-router"
import { researchRoute } from "@/utils/research"
import type { PortfolioAnalytics, PortfolioPositions } from "@/api/types"
import type { PortfolioAnalyticsTimeframe } from "@/api/portfolios"
import { formatPercent, formatSignedCurrency } from "@/utils/format"
import { currentDrawdownPercent as currentDrawdownPercentOf } from "@/utils/drawdown"
import { useDisplayCurrencyStore } from "@/stores/displayCurrency"
import { useDisplayConversion } from "@/composables/useDisplayConversion"
import { getLatestRate } from "@/api/fx"
import TickerBadge from "@/components/TickerBadge.vue"
import InstrumentSearchModal from "@/modules/instruments/InstrumentSearchModal.vue"
import PortfolioPerformanceChart from "@/components/PortfolioPerformanceChart.vue"

const props = withDefaults(defineProps<{
  /** `/:id/analytics` or `/merged`, cast to the one `PortfolioAnalytics`. */
  analytics: PortfolioAnalytics | null
  /** `/:id/risk-metrics`, or whatever the aggregate path supplies. */
  riskMetrics: Record<string, number | null> | null
  /** One portfolio's open+closed positions, or the cross-portfolio list. */
  positions: PortfolioPositions
  /** The base currency `analytics.performance` is denominated in. */
  baseCurrency: string
  /** The benchmark selection the fetch was made with. */
  selectedBenchmarks: string[]
  /** The window `analytics` was fetched for. §82.3 gates Yearly on `ALL`. */
  timeframe: PortfolioAnalyticsTimeframe
  loading: boolean
  backfillPending: boolean
  recomputing: boolean
  /**
   * Testid prefix (docs/COMPONENTS.md `${tid}-<field>`). Omitted on the
   * per-portfolio mount, so those ids stay byte-identical —
   * `PortfolioPerformanceTab.test.ts` and two e2e specs select on them. The
   * aggregate mount passes `testid="total"` for `total-perf-overview`.
   */
  testid?: string
  /**
   * §83.6 — print the constant-currency caveat on the Overview card. Set by the
   * aggregate mount only, and deliberately a prop rather than "always": on a
   * single-base portfolio there is no FX omission to disclose, and commentary
   * about a problem the page does not have is noise. On the aggregate it sits
   * ABOVE the two money tiles, because those are the numbers a reader checks
   * against a bank balance.
   */
  fxCaveat?: boolean
  /** Virtual portfolios are views over existing transactions, not cash books. */
  showInvested?: boolean
}>(), { showInvested: true })

const emit = defineEmits<{
  "update:selectedBenchmarks": [value: string[]]
  "update:timeframe": [value: PortfolioAnalyticsTimeframe]
  recompute: []
}>()

const route = useRoute()

/** `${tid}-${field}`, or the bare id when no prefix is passed. */
function tid(id: string): string {
  return props.testid ? `${props.testid}-${id}` : id
}

// ---------------------------------------------------------------------------
// Local UI state — belongs to the tab, not to whoever mounted it
// ---------------------------------------------------------------------------
const showCustomTimeframe = ref(false)
const customizeOpen = ref(false)
const showAddBenchmark = ref(false)
const returnsMode = ref<"monthly" | "yearly">("monthly")

// Draft state — local to the modal, only committed on Apply
const draftBenchmarks = ref<string[]>([])

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

const knownSymbols = new Set(benchmarkOptions.map((o) => o.symbol))
const customDraftBenchmarks = computed(() => draftBenchmarks.value.filter((s) => !knownSymbols.has(s)))

function openCustomize() {
  draftBenchmarks.value = [...props.selectedBenchmarks]
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

/**
 * §83.1 — the modal now only reports a SELECTION; whoever mounted the tab owns
 * the fetch (and therefore the store write). Both paths fetch with the new
 * symbols, so an unchanged selection is still not re-fetched.
 */
function applyCustomize() {
  customizeOpen.value = false
  const changed =
    JSON.stringify([...draftBenchmarks.value].sort()) !== JSON.stringify([...props.selectedBenchmarks].sort())
  if (changed) emit("update:selectedBenchmarks", [...draftBenchmarks.value])
}

// ---------------------------------------------------------------------------
// §82.2 / D85 — the overview card: five tiles answering two questions
// ---------------------------------------------------------------------------
// "How much more cash than I put in?" (tiles 1–4) and "was that because the
// investments worked or because I timed the money well?" (tile 5).
//
// Every field is already on the payload this tab holds — this is a READ, not a
// fetch. `annualizedReturn` / `annualizedReturnWithheldReason` arrived in
// §82.1; before that the contract declared them and nothing returned them.
const perf = computed(() => props.analytics?.performance ?? null)

// The two money tiles ride the SAME conversion as the chart series below them —
// the fifth copy of this path is §67.2's bug (plotting native values under a
// foreign symbol), and §66.3 rule 1 is why `convert()` is used rather than a
// bare `× rate`: no rate yet means no number, never a guess.
const netGain = computed(() => convert(perf.value?.totalReturn))
/**
 * The aggregate endpoint on older wallets builds the same value under its
 * legacy `totalInvested` name, so `capitalBasis` can be absent even though the
 * final series point still carries the invested level. The series is part of
 * the current contract and is the exact source used by the chart below; use
 * its last point as a compatibility fallback rather than rendering a dash for
 * a value the response already contains.
 */
const netInvested = computed(() => {
  const invested = perf.value?.capitalBasis ?? perf.value?.timeSeries?.at(-1)?.invested
  return convert(invested)
})

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
// Performance chart
// ---------------------------------------------------------------------------
// §41.2/§48.6e B3 — the analytics series (and its benchmark overlays) are
// denominated in the portfolio BASE currency (wallets `baseCurrency` — NOT
// `currency`, which API-created portfolios default to USD while their
// positions declare a different base). Convert once per source currency via
// getLatestRate, then pass the converted series + :currency to the shared
// chart component.
const portfolioCcy = computed(() => (props.baseCurrency ?? "").toUpperCase())
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
  return (props.analytics?.performance?.timeSeries ?? []).map((p) => ({
    ...p,
    value: (p.value ?? 0) * rate,
    invested: props.showInvested !== false && p.invested != null ? p.invested * rate : null,
    // §78.5 — the withheld amount is in the same currency as `value`, so it has
    // to be scaled by the same display rate. Spreading `...p` carries the raw
    // number through, and leaving it unscaled would print the gap in PLN inside
    // a USD view — a warning whose units contradict the axis beside it.
    unpricedValue: p.unpricedValue != null ? p.unpricedValue * rate : null,
  }))
})

// Benchmark overlays are a flow-mirrored INDEX (starts at 100) — dimensionless.
// The chart plots them as % change on their own right axis, so they must NOT be
// scaled by the display-currency rate: an index has no currency, and scaling it
// would only rotate the numbers without changing the shape.
const chartBenchmarks = computed(() => {
  return (props.analytics?.benchmarks ?? []).map((b) => ({ ...b }))
})

// Config-only options (no `series`) so a refresh takes the updateSeries() path
// and keeps the axis formatter — see PortfolioPerformanceChart §recompute repro.
const monthlySeries = computed(() => [
  {
    name: "Return %",
    data: (perf.value?.monthlyReturns ?? []).map((m) => ({ x: m.month, y: m.returnPercent })),
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

const performanceSeries = computed(() => perf.value?.timeSeries ?? [])

// ---------------------------------------------------------------------------
// Drawdown
// ---------------------------------------------------------------------------
const currentDrawdownPercent = computed(() =>
  currentDrawdownPercentOf(performanceSeries.value),
)

const maxDrawdownPercent = computed(() => {
  const v = props.riskMetrics?.["maxDrawdown"]
  // Backend returns a negative fraction (e.g. -0.40); multiply by 100 to get
  // percentage. Do NOT negate — drawdown is inherently negative and is shown
  // in red alongside currentDrawdown which is also negative.
  return typeof v === "number" ? v * 100 : null
})

// ---------------------------------------------------------------------------
// §82.3 / D87 — the Monthly | Yearly toggle on the Returns Chart
// ---------------------------------------------------------------------------
/** `analytics` is timeframe-filtered server-side, so only `ALL` holds a year. */
const yearlyAvailable = computed(() => props.timeframe === "ALL")

/** Non-ALL forces Monthly without touching the stored choice, so returning to
 *  `ALL` restores Yearly without a second fetch. */
const activeReturnsMode = computed(() => (yearlyAvailable.value ? returnsMode.value : "monthly"))

const yearlyRows = computed(() => yearlyReturns(performanceSeries.value, new Date()))
const yearlyTotalsRow = computed(() => yearlyTotals(yearlyRows.value))

/** Gain column rides the same `convert()` as the Net gain tile, so the Σ footer
 *  and that tile are the same number on screen by construction. */
const yearlyTotalsGain = computed(() => convert(yearlyTotalsRow.value.gain))

// ---------------------------------------------------------------------------
// §82.4 / D89 — excess per year against the FIRST selected benchmark
// ---------------------------------------------------------------------------
// Benchmarks are a list, so "excess vs all of them" is not a single number. One
// column, for the first, is a deliberate cap.
const firstBenchmark = computed(() => props.analytics?.benchmarks?.[0] ?? null)
const benchmarkSymbol = computed(() => firstBenchmark.value?.symbol ?? null)

const excessByYear = computed(() => {
  const b = firstBenchmark.value
  if (!b) return null
  return new Map(
    benchmarkYearlyReturns(b.timeSeries ?? [], new Date()).map((r) => [r.year, r.twrPercent]),
  )
})

/** null = the benchmark holds no row for that year, which is not the same as 0%. */
function excessPercent(row: YearlyReturnRow): number | null {
  const bench = excessByYear.value
  if (!bench || !bench.has(row.year)) return null
  return row.twrPercent - bench.get(row.year)!
}

// ---------------------------------------------------------------------------
// Top / Bottom performers
// ---------------------------------------------------------------------------
function gainClass(value: number | undefined): string {
  return (value ?? 0) >= 0 ? "text-green-600" : "text-red-600"
}

const performers = computed(() => {
  const open = props.positions.filter((p) => p.isOpen)
  const sorted = [...open].sort((a, b) => (b.unrealizedGainLoss ?? 0) - (a.unrealizedGainLoss ?? 0))
  return {
    top: sorted.slice(0, 5),
    bottom: [...sorted].reverse().slice(0, 5),
  }
})

// §36 — P/L is denominated in each position's instrumentCurrency. When that
// differs from the display currency, add a converted sub-line using the live
// rate via @marx-org/contracts/fx (D27). Rates are fetched once per distinct
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
</script>

<template>
  <div class="space-y-6">
    <div class="card p-6" :data-testid="tid('perf-overview')">
      <h2 class="mb-3 text-base font-semibold">Overview</h2>
      <!-- §83.6 — see the `fxCaveat` prop: this is §68.4 behaviour made VISIBLE
           here, not wrong here. One spot rate per pair is applied across the whole
           history, so the total excludes FX moves between a portfolio's base and
           the aggregate base — material on a multi-currency account, and
           invisible if left implicit next to a number that looks like a bank
           balance. -->
      <p
        v-if="fxCaveat"
        class="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400"
        :data-testid="tid('perf-overview-fx-caveat')"
      >
        Constant currency: these totals are converted at today's rate across the whole
        history, so they exclude currency moves over the period.
      </p>
      <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
          <dt class="text-sm text-slate-500 dark:text-slate-400">Net gain</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums" :class="signClass(netGain)" :data-testid="tid('perf-overview-net-gain')">{{ formatSignedCurrency(netGain, chartCcy) }}</dd>
        </div>
        <div v-if="props.showInvested" class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
          <dt class="text-sm text-slate-500 dark:text-slate-400">Net invested</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums" :data-testid="tid('perf-overview-net-invested')">{{ formatSignedCurrency(netInvested, chartCcy) }}</dd>
        </div>
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
          <dt class="text-sm text-slate-500 dark:text-slate-400">XIRR</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums" :class="signClass(xirr)" :data-testid="tid('perf-overview-xirr')">{{ formatPercent(xirr, 2, true) }}</dd>
          <p v-if="xirr == null" class="mt-1 text-xs text-slate-400 dark:text-slate-500">{{ withheldText(xirrWithheld) }}</p>
        </div>
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
          <dt class="text-sm text-slate-500 dark:text-slate-400">TWR p.a.</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums" :class="signClass(twrPa)" :data-testid="tid('perf-overview-twr-pa')">{{ formatPercent(twrPa, 2, true) }}</dd>
          <p v-if="twrPa == null" class="mt-1 text-xs text-slate-400 dark:text-slate-500">{{ withheldText(twrPaWithheld) }}</p>
        </div>

        <div
          v-if="timing"
          class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4 sm:col-span-2"
          :data-testid="tid('perf-overview-timing')"
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
            :class="props.timeframe === tf.value ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-500/10 dark:text-blue-400' : ''"
            :aria-pressed="props.timeframe === tf.value"
            :disabled="props.loading"
            @click="emit('update:timeframe', tf.value)"
          >
            {{ tf.label }}
          </button>
          <button type="button" class="btn-secondary text-xs" :data-testid="tid('perf-controls-customize')" :disabled="props.loading" @click="openCustomize">
            Customize
          </button>
        </div>
      </div>
      <PortfolioPerformanceChart
        :time-series="chartSeries"
        :benchmarks="chartBenchmarks"
        :currency="chartCcy"
        :backfill-pending="props.backfillPending || props.recomputing"
        :recomputing="props.recomputing || props.backfillPending"
        :gap-symbols="props.analytics?.gapSymbols ?? null"
        :held-gap-symbols="props.analytics?.heldGapSymbols ?? null"
        :show-invested="props.showInvested"
        :loading="props.loading"
        :height="300"
        @recompute="emit('recompute')"
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
          <dd class="mt-1 text-xl font-semibold tabular-nums text-red-600 dark:text-red-400" :data-testid="tid('performance-max-drawdown')">{{ formatPercent(maxDrawdownPercent, 2, true) }}</dd>
        </div>
        <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
          <dt class="text-sm text-slate-500 dark:text-slate-400">Current Drawdown</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums text-red-600 dark:text-red-400" :data-testid="tid('performance-current-drawdown')">{{ formatPercent(currentDrawdownPercent, 2, true) }}</dd>
        </div>
      </dl>
      <p v-if="showCustomTimeframe" class="mt-3 text-sm text-slate-500 dark:text-slate-400">
        Custom timeframe support is coming soon. Pick one of the built-in ranges above instead.
      </p>
    </div>

    <div class="card p-6" :data-testid="tid('perf-returns')">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-base font-semibold">Returns Chart</h2>
        <div class="flex items-center gap-1" role="group" aria-label="Returns period">
          <button
            type="button"
            class="btn-secondary text-xs"
            :class="activeReturnsMode === 'monthly' ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-500/10 dark:text-blue-400' : ''"
            :aria-pressed="activeReturnsMode === 'monthly'"
            :data-testid="tid('perf-returns-mode-monthly')"
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
            :data-testid="tid('perf-returns-mode-yearly')"
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

      <div v-else :data-testid="tid('perf-returns-yearly')">
        <p v-if="!yearlyRows.length" class="text-sm text-slate-500 dark:text-slate-400">No yearly data available.</p>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th scope="col" class="py-2 pr-3 font-medium">Year</th>
              <th scope="col" class="py-2 pr-3 text-right font-medium">TWR %</th>
              <th scope="col" :class="benchmarkSymbol ? 'py-2 pr-3' : 'py-2'" class="text-right font-medium">Gain</th>
              <th v-if="benchmarkSymbol" scope="col" class="py-2 pl-3 text-right font-medium" :data-testid="tid('perf-returns-yearly-excess-header')">
                <span class="text-xs font-normal normal-case">vs </span>
                <router-link :to="researchRoute(benchmarkSymbol, route.fullPath)" class="inline-block align-middle">
                  <TickerBadge size="sm" align="right" :symbol="benchmarkSymbol" />
                </router-link>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in yearlyRows"
              :key="row.year"
              class="border-b border-slate-100 dark:border-slate-800"
              :data-testid="`${tid('perf-returns-yearly-row')}-${row.year}`"
            >
              <td class="py-2 pr-3 tabular-nums">{{ row.year }}<span v-if="row.isYtd" class="ml-1 text-xs text-slate-400 dark:text-slate-500">YTD</span></td>
              <td class="py-2 pr-3 text-right tabular-nums" :class="signClass(row.twrPercent)" :data-testid="`${tid('perf-returns-yearly-twr')}-${row.year}`">{{ formatPercent(row.twrPercent, 2, true) }}</td>
              <td :class="[benchmarkSymbol ? 'pr-3' : '', 'py-2 text-right tabular-nums', signClass(row.gain)]" :data-testid="`${tid('perf-returns-yearly-gain')}-${row.year}`">{{ formatSignedCurrency(convert(row.gain), chartCcy) }}</td>
              <td v-if="benchmarkSymbol" class="py-2 pl-3 text-right tabular-nums" :class="signClass(excessPercent(row))" :data-testid="`${tid('perf-returns-yearly-excess')}-${row.year}`">{{ formatPercent(excessPercent(row), 2, true) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="border-t-2 border-slate-200 dark:border-slate-700" :data-testid="tid('perf-returns-yearly-total')">
              <td class="py-2 pr-3 font-medium">Σ</td>
              <td class="py-2 pr-3 text-right tabular-nums font-medium" :data-testid="tid('perf-returns-yearly-total-product')">× {{ yearlyTotalsRow.compounded.toFixed(4) }}</td>
              <td :class="benchmarkSymbol ? 'py-2 pr-3' : 'py-2'" class="text-right tabular-nums font-medium" :data-testid="tid('perf-returns-yearly-total-gain')">{{ formatSignedCurrency(yearlyTotalsGain, chartCcy) }}</td>
              <td v-if="benchmarkSymbol" class="py-2 pl-3 text-right text-xs text-slate-400 dark:text-slate-500" :data-testid="tid('perf-returns-yearly-excess-total')">no total</td>
            </tr>
          </tfoot>
        </table>
        <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Σ shows the compounded product, not the sum of yearly percentages.
        </p>
      </div>

      <p v-if="!yearlyAvailable" class="mt-2 text-xs text-slate-500 dark:text-slate-400" :data-testid="tid('perf-returns-yearly-hint')">
        Yearly is available on the ALL timeframe only — a shorter window holds no full calendar year.
      </p>
    </div>

    <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div class="card p-6">
        <h2 class="mb-3 text-base font-semibold">Top Performers</h2>
        <p v-if="!performers.top.length" class="text-sm text-slate-500 dark:text-slate-400">No open positions.</p>
        <ul v-else class="divide-y divide-slate-100 dark:divide-slate-800">
          <li v-for="p in performers.top" :key="p.id" class="flex items-center justify-between gap-3 py-2 text-sm">
            <div class="min-w-0">
              <router-link :to="researchRoute(p.symbol, route.fullPath)" class="inline-block">
                <TickerBadge
                  size="sm"
                  :symbol="p.symbol"
                  :name="p.companyName"
                  :country-code="p.country"
                  :asset-type="p.assetType"
                />
              </router-link>
              <!-- §83.5 — which portfolio this row came from. Omitted when null,
                   so the per-portfolio tab (whose whole page is that portfolio)
                   renders exactly what it always did. On the aggregate it is the
                   answer to "I hold this in two places — which one is this?" -->
              <p v-if="p.portfolioName" class="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400" :data-testid="tid(`perf-performer-portfolio-${p.id}`)">
                {{ p.portfolioName }}
              </p>
            </div>
            <div class="shrink-0 text-right">
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
          <li v-for="p in performers.bottom" :key="p.id" class="flex items-center justify-between gap-3 py-2 text-sm">
            <div class="min-w-0">
              <router-link :to="researchRoute(p.symbol, route.fullPath)" class="inline-block">
                <TickerBadge
                  size="sm"
                  :symbol="p.symbol"
                  :name="p.companyName"
                  :country-code="p.country"
                  :asset-type="p.assetType"
                />
              </router-link>
              <p v-if="p.portfolioName" class="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400" :data-testid="tid(`perf-performer-portfolio-${p.id}`)">
                {{ p.portfolioName }}
              </p>
            </div>
            <div class="shrink-0 text-right">
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
              :data-testid="tid('perf-controls-add-benchmark')"
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
              <!-- §85.3 — this row is a <label> wrapping the row's checkbox, so a
                   plain link would toggle the benchmark as a side effect of
                   navigating. `.prevent.stop` keeps the click off the label.
                   The visible option NAME stays as-is: this row reads
                   "SPDR S&P 500 — SPY", and researchRoute needs the symbol, so
                   the badge belongs on this right-hand chip, not on the name. -->
              <router-link
                :to="researchRoute(opt.symbol, route.fullPath)"
                class="ml-auto text-xs text-slate-400"
                @click.prevent.stop
              >{{ opt.symbol }}</router-link>
            </label>
          </div>
          <div v-if="customDraftBenchmarks.length" class="mt-2 space-y-1">
            <p class="text-xs font-medium text-slate-500 dark:text-slate-400">Custom</p>
            <div v-for="sym in customDraftBenchmarks" :key="sym" class="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <!-- §85.3 — no checkbox on this row, only a sibling Remove button,
                   so this is a clean wrap with no propagation to stop. -->
              <router-link :to="researchRoute(sym, route.fullPath)" class="text-sm text-slate-800 dark:text-slate-200">{{ sym }}</router-link>
              <button type="button" class="ml-2 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300" aria-label="Remove benchmark" @click="removeDraftBenchmark(sym)">Remove</button>
            </div>
          </div>
          <p class="mt-3 text-xs text-slate-500 dark:text-slate-400" :data-testid="tid('perf-controls-benchmarks')">
            Selected: {{ draftBenchmarks.length ? draftBenchmarks.join(", ") : "None" }}
          </p>
        </div>

        <div>
          <p class="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Positions</p>
          <div class="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-700 dark:text-slate-300">
            {{ props.positions.length ? `${props.positions.length} selected` : "All selected" }}
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
