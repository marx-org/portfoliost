// Interim FX source for the mock backend (fees-and-custom-fx proposal D25/D32).
// Stands in for the wallets module's fx_rates table until §11 ships.
// Conversion math comes from the shared @marx2/contracts/fx helper (D27) —
// the mock must never re-implement the formulas locally.
import { convert, crossRate, resolveRate, settleFee } from "@marx2/contracts/fx"
import { CURRENCIES } from "@marx2/contracts/currencies"

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
