<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { getHistory } from "@/api/instruments"
import type { HistoryCompareSeries } from "@/api/instruments"
import { getAllTransactions, getPortfolioTransactions } from "@/api/portfolios"
import { usePortfolioStore } from "@/stores/portfolios"
import { formatCurrency, formatNumber } from "@/utils/format"
import type { components } from "../../generated/api-types"

type Transaction = components["schemas"]["Transaction"]

const props = defineProps<{
  symbol: string
  portfolioId?: string | null
  defaultShowTransactions?: boolean
  maxTransactions?: number
}>()

type Timeframe = "1D" | "5D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "10Y" | "YTD" | "MAX"
type Mode = "Price" | "Percent" | "Drawdowns"
type CompareKey = "none" | "spy" | "qqq" | "iwm"

const timeframes: Timeframe[] = ["1D", "5D", "1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "10Y", "YTD", "MAX"]
const modes: Mode[] = ["Price", "Percent", "Drawdowns"]
const compareOptions: { key: CompareKey; label: string }[] = [
  { key: "none", label: "No comparison" },
  { key: "spy", label: "S&P 500" },
  { key: "qqq", label: "Nasdaq 100" },
  { key: "iwm", label: "Russell 2000" },
]

const timeframe = ref<Timeframe>("1Y")
const mode = ref<Mode>("Price")
const compare = ref<CompareKey>("none")
const showCompare = ref(false)
const fullscreen = ref(false)
const loading = ref(true)
const error = ref<string | null>(null)

const timestamps = ref<number[]>([])
const prices = ref<number[]>([])
const bench = ref<HistoryCompareSeries | null>(null)
const loadedCompare = ref<CompareKey>("none")

const portfolioStore = usePortfolioStore()
const showTransactions = ref(props.defaultShowTransactions ?? false)
const txPortfolioId = ref<string | "all">("all")
const transactions = ref<Transaction[]>([])
const transactionsLoading = ref(false)
const transactionsError = ref<string | null>(null)
const hasMoreTransactions = ref(false)
const maxTxs = ref(props.maxTransactions ?? 500)

async function fetchTransactions(): Promise<void> {
  transactionsLoading.value = true
  transactionsError.value = null
  try {
    const limit = maxTxs.value
    const symbol = props.symbol
    let result
    if (props.portfolioId) {
      result = await getPortfolioTransactions(props.portfolioId, 1, limit, "date", "asc", undefined, undefined, symbol)
    } else if (txPortfolioId.value !== "all") {
      result = await getPortfolioTransactions(txPortfolioId.value, 1, limit, "date", "asc", undefined, undefined, symbol)
    } else {
      result = await getAllTransactions(1, limit, "date", "asc", undefined, symbol)
    }
    transactions.value = result.items
    hasMoreTransactions.value = result.hasNext
  } catch (err) {
    transactionsError.value = err instanceof Error ? err.message : "Failed to load transactions"
    transactions.value = []
    hasMoreTransactions.value = false
  } finally {
    transactionsLoading.value = false
  }
}

async function ensurePortfoliosLoaded(): Promise<void> {
  if (!props.portfolioId && portfolioStore.portfolios.length === 0) {
    try {
      await portfolioStore.fetchAll()
    } catch {
      // Non-fatal: the selector simply stays on "All portfolios".
    }
  }
}

function toggleTransactions(checked: boolean): void {
  showTransactions.value = checked
  if (checked) {
    void ensurePortfoliosLoaded()
    fetchTransactions()
  } else {
    transactions.value = []
    hasMoreTransactions.value = false
  }
}

async function load(compareKey: CompareKey) {
  loading.value = true
  error.value = null
  try {
    const h = await getHistory(props.symbol, "daily", compareKey === "none" ? undefined : compareKey)
    timestamps.value = h.timestamps
    prices.value = h.closePrices
    bench.value = h.compare ?? null
    loadedCompare.value = compareKey
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load price history"
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load("none")
  if (showTransactions.value) void ensurePortfoliosLoaded()
})
watch(compare, (k) => {
  if (k !== loadedCompare.value) load(k)
})

watch(
  () => props.symbol,
  () => {
    if (showTransactions.value) fetchTransactions()
  },
)
watch(timeframe, () => {
  if (showTransactions.value) fetchTransactions()
})
watch(txPortfolioId, () => {
  if (showTransactions.value) fetchTransactions()
})

const slicePoints = computed(() => {
  const n = timestamps.value.length
  switch (timeframe.value) {
    case "1D":
      return 2
    case "5D":
      return Math.min(5, n)
    case "1W":
      return Math.min(5, n)
    case "1M":
      return Math.min(21, n)
    case "3M":
      return Math.min(63, n)
    case "6M":
      return Math.min(126, n)
    case "1Y":
      return Math.min(252, n)
    case "3Y":
      return Math.min(756, n)
    case "5Y":
      return Math.min(1260, n)
    case "10Y":
      return Math.min(2520, n)
    case "MAX":
      return n
    case "YTD": {
      const yearStart = new Date(timestamps.value[n - 1] * 1000).getFullYear()
      let start = 0
      for (let i = 0; i < n; i++) {
        if (new Date(timestamps.value[i] * 1000).getFullYear() === yearStart) {
          start = i
          break
        }
      }
      return n - start
    }
  }
})

function pickCompare(key: CompareKey): void {
  compare.value = key
  showCompare.value = false
}

const compareLabel = computed(() =>
  compare.value === "none" ? "Add comparison" : (compareOptions.find((o) => o.key === compare.value)?.label ?? "Add comparison"),
)

const series = computed(() => {
  const n = timestamps.value.length
  const count = slicePoints.value
  const startIdx = n - count
  const dates = timestamps.value.slice(startIdx).map((t) =>
    new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }),
  )

  function transform(data: number[]): number[] {
    const slice = data.slice(startIdx)
    if (mode.value === "Price") return slice
    const base = slice[0] || 0
    if (mode.value === "Percent") return slice.map((p) => (base ? ((p - base) / base) * 100 : 0))
    let runningMax = -Infinity
    return slice.map((p) => {
      runningMax = Math.max(runningMax, p)
      return runningMax ? ((p - runningMax) / runningMax) * 100 : 0
    })
  }

  const out: Array<{ name: string; data: number[] }> = [{ name: props.symbol, data: transform(prices.value) }]
  if (bench.value && compare.value !== "none") {
    const benchSlice = bench.value.closePrices.slice(startIdx)
    const bBase = benchSlice[0] || 0
    const bData =
      mode.value === "Price"
        ? benchSlice
        : benchSlice.map((p) => (bBase ? ((p - bBase) / bBase) * 100 : 0))
    out.push({ name: bench.value.name, data: bData })
  }
  return { dates, data: out }
})

function isoDate(ms: number): string {
  const d = new Date(ms)
  const m = `${d.getMonth() + 1}`.padStart(2, "0")
  const day = `${d.getDate()}`.padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

// The API returns transaction types as uppercase ("BUY" | "SELL" | "DIVIDEND").
function txType(tx: Transaction): string {
  return (tx.type ?? "").toUpperCase()
}

// Only transactions belonging to the charted instrument count for markers,
// tooltips, and the Low/High/Avg reference lines. This guards against any
// other instrument's transactions leaking into the feed.
const scopedTransactions = computed<Transaction[]>(() =>
  transactions.value.filter((tx) => String(tx.instrumentSymbol ?? "").toUpperCase() === props.symbol.toUpperCase()),
)

const txByDate = computed<Map<string, Transaction[]>>(() => {
  const map = new Map<string, Transaction[]>()
  for (const tx of scopedTransactions.value) {
    const type = txType(tx)
    if (type !== "BUY" && type !== "SELL") continue
    const key = isoDate(new Date(tx.executedAt).getTime())
    const group = map.get(key)
    if (group) group.push(tx)
    else map.set(key, [tx])
  }
  for (const group of map.values()) {
    group.sort((a, b) => {
      const typeDiff = (txType(a) === "BUY" ? 0 : 1) - (txType(b) === "BUY" ? 0 : 1)
      if (typeDiff !== 0) return typeDiff
      return new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime()
    })
  }
  return map
})

const fifoReferenceLines = computed(() => {
  if (!showTransactions.value || mode.value !== "Price") return []
  if (scopedTransactions.value.length === 0) return []

  const n = timestamps.value.length
  const count = slicePoints.value
  const startIdx = n - count
  const startTs = timestamps.value[startIdx]
  const endTs = timestamps.value[n - 1]

  const buyPrices: number[] = []
  const lots: Array<{ qty: number; price: number }> = []
  let remainingQty = 0
  let totalCost = 0

  for (const tx of scopedTransactions.value) {
    const txTs = new Date(tx.executedAt).getTime() / 1000
    if (txTs < startTs || txTs > endTs) continue

    const type = txType(tx)
    if (type === "BUY") {
      buyPrices.push(tx.price)
      lots.push({ qty: tx.quantity, price: tx.price })
      remainingQty += tx.quantity
      totalCost += tx.quantity * tx.price
    } else if (type === "SELL") {
      let sellQty = tx.quantity
      while (sellQty > 0 && lots.length > 0) {
        const lot = lots[0]
        if (lot.qty <= sellQty) {
          totalCost -= lot.qty * lot.price
          remainingQty -= lot.qty
          sellQty -= lot.qty
          lots.shift()
        } else {
          totalCost -= sellQty * lot.price
          remainingQty -= sellQty
          lot.qty -= sellQty
          sellQty = 0
        }
      }
    }
  }

  const lines: Array<{
    y: number
    borderColor: string
    strokeDashArray: number
    label: { borderColor: string; style: { color: string; background: string }; text: string }
  }> = []

  if (buyPrices.length === 0) return lines

  const low = Math.min(...buyPrices)
  const high = Math.max(...buyPrices)

  if (remainingQty > 0) {
    const avgCost = totalCost / remainingQty
    lines.push({
      y: avgCost,
      borderColor: "#2563eb",
      strokeDashArray: 6,
      label: { borderColor: "#2563eb", style: { color: "#fff", background: "#2563eb" }, text: `Avg $${avgCost.toFixed(2)}` },
    })
  }

  lines.push({
    y: low,
    borderColor: "#16a34a",
    strokeDashArray: 4,
    label: { borderColor: "#16a34a", style: { color: "#fff", background: "#16a34a" }, text: `Low $${low.toFixed(2)}` },
  })

  lines.push({
    y: high,
    borderColor: "#dc2626",
    strokeDashArray: 4,
    label: { borderColor: "#dc2626", style: { color: "#fff", background: "#dc2626" }, text: `High $${high.toFixed(2)}` },
  })

  return lines
})

interface BarTxEntry { index: number; group: Transaction[] }

const barDateTxMap = computed<Map<string, BarTxEntry[]>>(() => {
  const map = new Map<string, BarTxEntry[]>()
  const n = timestamps.value.length
  const startIdx = n - slicePoints.value
  if (startIdx < 0) return map
  const startDateStr = isoDate(timestamps.value[startIdx] * 1000)
  const endDateStr = isoDate(timestamps.value[n - 1] * 1000)
  const dateIndexMap = new Map<string, number>()
  series.value.dates.forEach((_, i) => {
    const iso = isoDate(timestamps.value[startIdx + i] * 1000)
    if (!dateIndexMap.has(iso)) dateIndexMap.set(iso, i)
  })
  function nearestBarIndex(dateStr: string): number | undefined {
    const targetMs = Date.parse(dateStr + "T00:00:00Z")
    let best: { i: number; dist: number } | null = null
    for (let i = 0; i < series.value.dates.length; i++) {
      const dist = Math.abs(timestamps.value[startIdx + i] * 1000 - targetMs)
      if (best === null || dist < best.dist) best = { i, dist }
    }
    if (best && best.dist <= 7 * 86400_000) return best.i
    return undefined
  }
  for (const [dateStr, group] of txByDate.value) {
    if (dateStr < startDateStr || dateStr > endDateStr) continue
    const index = dateIndexMap.get(dateStr) ?? nearestBarIndex(dateStr)
    if (index === undefined) continue
    const barDate = isoDate(timestamps.value[startIdx + index] * 1000)
    const entries = map.get(barDate)
    if (entries) {
      const last = entries[entries.length - 1]
      if (last.index === index) last.group.push(...group)
      else entries.push({ index, group })
    } else {
      map.set(barDate, [{ index, group }])
    }
  }
  return map
})

const transactionAnnotations = computed(() => {
  if (!showTransactions.value) return []
  const points: Array<{
    x: number
    y: number
    marker: { size: number; fillColor: string; strokeColor: string; offsetY: number }
    label: { borderColor: string; style: { color: string; background: string }; text: string }
  }> = []
  for (const entries of barDateTxMap.value.values()) {
    for (const { index, group } of entries) {
      const lineValue = series.value.data[0]?.data?.[index]
      if (typeof lineValue !== "number") continue
      group.forEach((tx, i) => {
        const isBuy = txType(tx) === "BUY"
        const color = isBuy ? "#16a34a" : "#dc2626"
        points.push({
          x: index,
          y: lineValue,
          marker: { size: 5, fillColor: color, strokeColor: color, offsetY: i === 0 ? 0 : -8 * i },
          label: { borderColor: color, style: { color: "#fff", background: color }, text: isBuy ? "▲" : "▼" },
        })
      })
    }
  }
  return points
})

function tooltipCustom({ series, dataPointIndex, w }: {
  series: number[][]
  dataPointIndex: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  w: any
}): string {
  const n = timestamps.value.length
  const startIdx = n - slicePoints.value
  const lines: string[] = []
  for (let s = 0; s < w.config.series.length; s++) {
    const name = w.config.series[s].name ?? ""
    const value = series[s]?.[dataPointIndex]
    const formatted = typeof value === "number" ? (mode.value === "Price" ? formatCurrency(value) : `${value.toFixed(2)}%`) : "—"
    lines.push(`<div class="apexcharts-tooltip-series-group"><span>${name}: ${formatted}</span></div>`)
  }
  let txHtml = ""
  if (showTransactions.value && dataPointIndex >= 0 && startIdx >= 0 && startIdx + dataPointIndex < n) {
    const dateStr = isoDate(timestamps.value[startIdx + dataPointIndex] * 1000)
    const entries = barDateTxMap.value.get(dateStr)
    if (entries && entries.length) {
      const rows = entries
        .flatMap((e) => e.group)
        .map((tx) => {
          const isBuy = txType(tx) === "BUY"
          const icon = isBuy ? "▲" : "▼"
          const label = isBuy ? "Buy" : "Sell"
          const fee = tx.fees ? ` (fees ${formatCurrency(tx.fees, tx.currency)})` : ""
          return `<div>${icon} ${label} ${formatNumber(tx.quantity)} @ ${formatCurrency(tx.price, tx.priceCurrency)} = ${formatCurrency(tx.totalAmount, tx.currency)}${fee}</div>`
        })
        .join("")
      txHtml = `<div class="apexcharts-tooltip-transactions"><div><strong>Transactions:</strong></div>${rows}</div>`
    }
  }
  return `<div class="apexcharts-tooltip-custom">${lines.join("")}${txHtml}</div>`
}

const chartOptions = computed(() => ({
  chart: {
    type: "area" as const,
    height: fullscreen.value ? window.innerHeight - 80 : 380,
    toolbar: { show: false },
    zoom: { enabled: true },
    animations: { enabled: true },
    fontFamily: "inherit",
  },
  colors: mode.value === "Drawdowns" ? ["#dc2626", "#94a3b8"] : ["#2563eb", "#94a3b8"],
  series: series.value.data,
  xaxis: {
    categories: series.value.dates,
    labels: { show: !fullscreen.value, datetimeUTC: false },
    tickAmount: Math.min(12, series.value.dates.length),
  },
  yaxis: {
    labels: {
      formatter: (v: number) => (mode.value === "Price" ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `${v.toFixed(2)}%`),
    },
  },
  stroke: { curve: "smooth" as const, width: 2 },
  dataLabels: { enabled: false },
  fill: { type: "gradient" as const, gradient: { opacityFrom: 0.25, opacityTo: 0 } },
  legend: { position: "top" as const, horizontalAlign: "right" as const },
  grid: { borderColor: "#e2e8f0" },
    annotations: { points: transactionAnnotations.value, yaxis: fifoReferenceLines.value },
  tooltip: { custom: tooltipCustom },
}))

const summary = computed(() => {
  const n = timestamps.value.length
  const count = slicePoints.value
  const startIdx = n - count
  const base = prices.value[startIdx]
  const last = prices.value[n - 1]
  if (typeof base !== "number" || typeof last !== "number" || !base) return null
  const change = last - base
  const changePct = (last / base - 1) * 100
  const years = (timestamps.value[n - 1] - timestamps.value[startIdx]) / (365.25 * 86400)
  const cagr = years > 0.5 ? (Math.pow(last / base, 1 / years) - 1) * 100 : null
  const display = mode.value === "Price" ? change : changePct
  return { change, changePct, cagr, display }
})

function signed(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`
}

function downloadCsv(): void {
  const { dates, data } = series.value
  const header = ["Date", ...data.map((d) => d.name)]
  const rows = dates.map((date, i) => [date, ...data.map((d) => d.data[i] ?? "")].join(","))
  const csv = [header.join(","), ...rows].join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${props.symbol}_${timeframe.value}_${mode.value.toLowerCase()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="card p-6">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-base font-semibold">Price Chart</h2>
      <div class="flex items-center gap-2">
        <button
          v-for="t in timeframes"
          :key="t"
          type="button"
          class="rounded px-2 py-1 text-xs font-medium"
          :class="timeframe === t ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'"
          @click="timeframe = t"
        >
          {{ t }}
        </button>
      </div>
    </div>

    <div class="mb-4 flex flex-wrap items-center gap-3 text-xs">
      <div class="flex overflow-hidden rounded-md border border-slate-300 dark:border-slate-600">
        <button
          v-for="m in modes"
          :key="m"
          type="button"
          class="px-3 py-1.5 font-medium"
          :class="mode === m ? 'bg-slate-800 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'"
          @click="mode = m"
        >
          {{ m }}
        </button>
      </div>

      <div class="relative">
        <button
          type="button"
          class="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          @click="showCompare = !showCompare"
        >
          {{ compareLabel }} <span class="text-slate-400 dark:text-slate-500">&#9662;</span>
        </button>
        <div v-if="showCompare" class="absolute left-0 z-20 mt-1 w-52 rounded-md border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-1 shadow-lg">
          <button
            v-for="o in compareOptions"
            :key="o.key"
            type="button"
            class="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            @click="pickCompare(o.key)"
          >
            <span>{{ o.label }}</span>
            <span v-if="compare === o.key" class="text-blue-600 dark:text-blue-400">&#10003;</span>
          </button>
        </div>
      </div>

      <label class="flex cursor-pointer items-center gap-1.5 select-none">
        <input
          type="checkbox"
          class="h-3.5 w-3.5 accent-blue-600"
          :checked="showTransactions"
          @change="toggleTransactions(($event.target as HTMLInputElement).checked)"
        />
        <span>Transactions</span>
      </label>

      <select
        v-if="!portfolioId && showTransactions"
        v-model="txPortfolioId"
        class="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
      >
        <option value="all">All portfolios</option>
        <option v-for="p in portfolioStore.portfolios" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>

      <div v-if="summary" class="ml-auto flex items-center gap-4 text-sm">
        <span class="text-slate-500 dark:text-slate-400">Total Chg</span>
        <span class="font-semibold" :class="summary.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
          {{
            mode === "Price"
              ? `$${signed(summary.change, 2)}`
              : `${signed(summary.changePct)}%`
          }}
        </span>
        <span v-if="mode === 'Price'" class="text-xs text-slate-400 dark:text-slate-500">{{ signed(summary.changePct) }}%</span>
        <span v-if="mode === 'Price'" class="text-slate-500 dark:text-slate-400">CAGR</span>
        <span
          v-if="mode === 'Price' && summary.cagr !== null"
          class="font-semibold tabular-nums"
          :class="summary.cagr >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
        >
          {{ signed(summary.cagr) }}%
        </span>
      </div>

      <div class="ml-auto flex items-center gap-1">
        <button
          type="button"
          class="rounded px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          :title="fullscreen ? 'Exit fullscreen' : 'Fullscreen'"
          @click="fullscreen = !fullscreen"
        >
          {{ fullscreen ? "Exit fullscreen" : "Fullscreen" }}
        </button>
        <button type="button" class="rounded px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800" title="Download CSV" @click="downloadCsv">
          Download
        </button>
      </div>
    </div>

    <p v-if="error" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500 dark:text-slate-400">Loading price history...</p>

    <p v-if="showTransactions && transactionsError" class="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{{ transactionsError }}</p>
    <p v-if="showTransactions && transactionsLoading" class="text-sm text-slate-500 dark:text-slate-400">Loading transactions...</p>
    <p v-if="showTransactions && !transactionsLoading && hasMoreTransactions" class="text-sm text-slate-500 dark:text-slate-400">
      Showing first {{ maxTxs }} transactions &mdash; some may be missing.
    </p>

    <div v-if="fullscreen" class="fixed inset-0 z-50 overflow-auto bg-white dark:bg-slate-900 p-6" @dblclick="fullscreen = false">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-base font-semibold">{{ symbol }} - {{ timeframe }} ({{ mode }})</h2>
        <button type="button" class="btn-secondary text-sm" @click="fullscreen = false">Close</button>
      </div>
      <component
        :is="'apexchart'"
        v-if="series.data.length && series.data[0].data.length"
        :options="chartOptions"
        :series="series.data"
      />
    </div>
    <component
      :is="'apexchart'"
      v-else-if="series.data.length && series.data[0].data.length"
      :options="chartOptions"
      :series="series.data"
    />
    <p v-else class="text-sm text-slate-500 dark:text-slate-400">No price history available.</p>
    <p class="mt-2 text-right text-xs text-slate-400 dark:text-slate-500">Powered by Example service</p>
  </div>
</template>
