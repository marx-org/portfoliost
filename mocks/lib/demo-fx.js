// Interim FX source for the mock backend (fees-and-custom-fx proposal D25/D32).
// Stands in for the instruments module's fx_rates table (§48 moved it out of wallets).
// Conversion math comes from the shared @marx-org/contracts/fx helper (D27) —
// the mock must never re-implement the formulas locally.
import { convert, crossRate, resolveRate, settleFee } from "@marx-org/contracts/fx"
import { CURRENCIES } from "@marx-org/contracts/currencies"

export const DEMO_FX_DATE = "2026-08-22"

// EUR-based daily closes (1 EUR = X units).
export const DEMO_RATES = {
  USD: 1.08,
  PLN: 4.3,
  GBP: 0.85,
  CHF: 0.93,
  JPY: 163.2,
  CZK: 24.9,
  SEK: 11.3,
  NOK: 11.8,
  DKK: 7.46,
  HUF: 393.0,
  CNY: 7.8,
}

const series = [{ date: DEMO_FX_DATE, rates: DEMO_RATES }]

/**
 * Plan §48.5 — the mock price endpoints honor ?currency= against a
 * deterministic multi-day demo schedule (test-only, per the §48.4 rule):
 * the last DEMO_FX_DAYS calendar days ending at the SERIES' last date, flat
 * at DEMO_RATES. Flat keeps the converted values a fixed multiple of the
 * native ones, so mock-API expectations are exact.
 */
export const DEMO_FX_DAYS = 30

/**
 * Convert a parallel price array against the demo schedule.
 *
 * §72.17 — **an unconvertible bar is DROPPED, not passed through in the source
 * currency.** This mock used to return the base-currency value for any bar
 * before the schedule floor while still labelling the response with the target
 * currency, which is precisely the defect §72.17 fixed in the real service: it
 * is how Crypto read 85 PLN one day and ~400 the next. Returning a
 * `convertedMask` instead — the same shape the real `convertSeries` returns
 * (`instruments/src/services/fx-convert.ts:60-71`) — lets every caller filter
 * the way the real routes do (`instruments/src/routes/instruments.ts:646-659`).
 *
 * `fxFrom` = first converted bar date (null when nothing converted).
 */
export function convertSeriesAs(dates, prices, baseCcy, targetCcy) {
  const last = dates[dates.length - 1]
  if (!last || !baseCcy || !targetCcy) {
    return { converted: prices.slice(), convertedMask: prices.map(() => true), fxFrom: null }
  }
  const from = new Date(new Date(`${last}T00:00:00Z`).getTime() - (DEMO_FX_DAYS - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const converted = prices.slice()
  const convertedMask = prices.map(() => false)
  let fxFrom = null
  for (let i = 0; i < prices.length; i++) {
    if (dates[i] < from) continue
    const c = convert(prices[i], baseCcy, targetCcy, DEMO_RATES)
    if (c !== undefined) {
      converted[i] = c
      convertedMask[i] = true
      if (fxFrom === null) fxFrom = dates[i]
    }
  }
  return { converted, convertedMask, fxFrom }
}

/**
 * §72.17 — drop every unconvertible bar from a set of parallel arrays, so the
 * response really is in `targetCcy`. Mirrors what the real routes do with
 * `convertedMask` (`instruments/src/routes/instruments.ts:646-659`); kept here
 * so no mock caller can reintroduce the defect by forgetting.
 *
 * `cc` supplies only the mask — the VALUES come from `arrays`, because a
 * converted OHLC response has four different arrays and one shared mask.
 * `dates` is passed inside `arrays` like everything else, so every returned
 * array is index-aligned with every other by construction.
 */
export function dropUnconvertible(cc, arrays) {
  const keys = Object.keys(arrays)
  const out = {}
  for (const key of keys) out[key] = []
  for (let i = 0; i < cc.convertedMask.length; i++) {
    if (!cc.convertedMask[i]) continue
    for (const key of keys) out[key].push(arrays[key][i])
  }
  return out
}

/** Plan §48.5 — ?currency= validation mirroring the real instruments service:
 * 3-letter code from the demo table + the implicit EUR base, else a 400. */
export function targetCurrencyParam(raw) {
  if (raw === undefined || raw === null || raw === "") return { value: null }
  const v = String(raw).trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(v) || !["EUR", ...Object.keys(DEMO_RATES)].includes(v)) {
    return { status: 400, message: `currency not supported: ${raw}` }
  }
  return { value: v }
}

/** tx/display ccy -> display ccy rate (mock display currency is USD). */
export function displayRate(ccy, manualRate) {
  if (manualRate !== undefined && manualRate !== null) {
    if (!(typeof manualRate === "number" && Number.isFinite(manualRate) && manualRate > 0)) {
      return { error: "exchangeRate must be a positive number when rateSource is 'manual'" }
    }
    return { rate: manualRate }
  }
  return { rate: convert(1, ccy, "USD", DEMO_RATES) ?? 1 }
}

/**
 * Resolve + validate all fee/fx fields of a movement request against a wallet
 * or transaction currency. Returns { fields, feesSettled } or { error } (422).
 */
export function resolveFeeFx(body, txCcy, opts = {}) {
  const rateSource = body.rateSource === "manual" ? "manual" : "automatic"
  const feeRateSource = body.feeRateSource === "manual" ? "manual" : "automatic"
  const feeCurrency = (body.fee_currency || body.feeCurrency || txCcy).toUpperCase()

  let exchangeRate
  if (rateSource === "manual") {
    const r = Number(body.exchangeRate)
    if (!Number.isFinite(r) || r <= 0) {
      return { error: "exchangeRate must be a positive number when rateSource is 'manual'" }
    }
    exchangeRate = r
  } else {
    exchangeRate = opts.displayRate ?? convert(1, txCcy, "USD", DEMO_RATES) ?? 1
  }

  const rawFees = Number(body.fees) || 0
  const feesType = body.fees_type || body.feesType || "fixed"
  // pct is materialized on the fly (D28): effective fixed equivalent in feeCurrency
  const notional = opts.notional ?? Number(body.amount) ?? 0
  const feeValue = feesType === "pct" ? (notional * rawFees) / 100 : rawFees

  let feeExchangeRate
  if (feeRateSource === "manual") {
    const fr = Number(body.feeExchangeRate)
    if (!Number.isFinite(fr) || fr <= 0) {
      return { error: "feeExchangeRate must be a positive number when feeRateSource is 'manual'" }
    }
    feeExchangeRate = fr
  } else {
    feeExchangeRate = feeCurrency === txCcy.toUpperCase() ? 1 : crossRate(feeCurrency, txCcy, DEMO_RATES)
  }

  const feesSettled =
    feeValue === 0
      ? 0
      : settleFee(feeValue, feeCurrency, txCcy, DEMO_RATES, feeRateSource === "manual" ? feeExchangeRate : undefined)

  return {
    fields: {
      feeCurrency,
      feesType,
      rateSource,
      exchangeRate,
      feeRateSource,
      feeExchangeRate,
      targetAmount: body.targetAmount ?? null,
      transferFxRate:
        body.targetFxRate ??
        (opts.toCcy ? crossRate(txCcy, opts.toCcy, DEMO_RATES) ?? null : null),
    },
    feesSettled,
  }
}

/** GET /api/currencies payload — availability from the demo table, metadata from contracts. */
export function currenciesPayload() {
  const codes = ["EUR", ...Object.keys(DEMO_RATES)]
  return {
    currencies: codes.map((code) => {
      const meta = CURRENCIES.find((c) => c.code === code)
      return {
        code,
        name: meta?.name ?? code,
        symbol: meta?.symbol ?? code,
        minorUnits: meta?.minorUnits ?? 2,
        popular: meta?.popular ?? false,
      }
    }),
  }
}
