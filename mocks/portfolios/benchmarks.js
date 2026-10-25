import { loadBenchmarks } from "../lib/data.js"

const DISPLAY_NAMES = {
  SPY: "S&P 500 ETF",
  QQQ: "Nasdaq 100 ETF",
  IWM: "Russell 2000 ETF",
}

const START_BY_TIMEFRAME = {
  "6M": "2026-02-09",
  "1Y": "2025-08-11",
  "2Y": "2024-08-12",
  ALL: "2025-08-11",
}

const END_DATE = "2026-08-10"

const DEFAULT_VOL = {
  SPY: 15.4,
  QQQ: 19.2,
  IWM: 21.5,
}

export function benchmarkSymbols() {
  return Object.keys(loadBenchmarks() || {})
}

export function benchmarkName(symbol) {
  return DISPLAY_NAMES[symbol] || loadBenchmarks()?.[symbol]?.name || symbol
}

function weekdayAfter(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  const day = d.getUTCDay()
  if (day === 6) d.setUTCDate(d.getUTCDate() + 2)
  else if (day === 0) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function businessDaysBetween(start, end) {
  const days = []
  let cur = start
  while (cur <= end) {
    days.push(cur)
    cur = weekdayAfter(cur)
  }
  return days
}

export function benchmarkSeries(symbol, timeframe = "1Y", performance = null) {
  const start = START_BY_TIMEFRAME[timeframe] || START_BY_TIMEFRAME["1Y"]
  const days = businessDaysBetween(start, END_DATE)
  const rng = mulberry32(hashSeed(symbol + ":" + timeframe))
  const vol = DEFAULT_VOL[symbol] || 15
  const dailyVol = vol / Math.sqrt(252) / 100

  let value = 100
  const timeSeries = days.map((date) => {
    const shock = (rng() - 0.5) * 2
    value = value * (1 + dailyVol * shock)
    return { date, value: Math.round(value * 100) / 100 }
  })

  const first = timeSeries[0]?.value ?? 100
  const last = timeSeries[timeSeries.length - 1]?.value ?? 100
  const returnPercent = (last / first - 1) * 100

  // Keep the mock response aligned with the live contract: `timeSeries` is the
  // indexed return line, while the chart consumes an absolute flow-mirrored
  // value line. The fixture's investedCapital is the cumulative cash schedule.
  const investedRows = (performance?.timeSeries ?? [])
    .map((p) => ({ date: p.date, invested: Number(p.invested ?? p.investedCapital ?? 0) }))
    .filter((p) => typeof p.date === "string")
    .sort((a, b) => a.date.localeCompare(b.date))
  const absoluteTimeSeries = []
  let row = 0
  let previousInvested = 0
  let units = 0
  for (const point of timeSeries) {
    while (row < investedRows.length && investedRows[row].date <= point.date) {
      const flow = investedRows[row].invested - previousInvested
      if (flow !== 0) units = Math.max(0, units + flow / point.value)
      previousInvested = investedRows[row].invested
      row++
    }
    absoluteTimeSeries.push({ date: point.date, value: Math.round(units * point.value * 100) / 100 })
  }

  // A fixture without investedCapital still needs a visible absolute line.
  if (absoluteTimeSeries.every((p) => p.value === 0)) {
    const seed = Number(performance?.capitalBasis ?? 0)
    for (let i = 0; i < absoluteTimeSeries.length; i++) {
      absoluteTimeSeries[i].value = Math.round(seed * (timeSeries[i].value / first) * 100) / 100
    }
  }

  return {
    symbol,
    name: benchmarkName(symbol),
    timeSeries,
    absoluteTimeSeries,
    returnPercent: Math.round(returnPercent * 100) / 100,
    volatility: vol,
  }
}
