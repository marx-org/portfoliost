// §62.9 — portfolio-native cash mock. Replaces the deleted `mocks/wallets/`
// wallet entity: cash now lives on portfolios (per-currency balances derived by
// replaying the cash ledger). Mirrors the wallets backend's cash routes
// (62.1) under `/api/portfolios/.../cash*` and `/api/portfolios/cash/...`.
// Conversion math comes from the shared @marx-org/contracts/fx helper (D27).
import { requireAuth } from "../lib/auth.js"
import { loadRaw } from "../lib/data.js"
import { paginatePage, uuid, nowIso } from "../lib/http.js"
import { currenciesPayload, resolveFeeFx, DEMO_RATES } from "../lib/demo-fx.js"
import { convert } from "@marx-org/contracts/fx"
import { labelsForCashTransaction, matchesCashLabelFilter } from "../labels.js"

const CASH_LABELS = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  TRANSFER: "Transfer",
  INTEREST: "Interest",
  FEE: "Fee",
  FX_CONVERSION: "Conversion",
}

const round2 = (x) => Math.round(x * 100) / 100

// A conversion whose two legs are the same currency is not an exchange: it is a
// correction of one balance. Same distinction as the wallets backend's
// displayLabelFor.
function displayLabel(type, currency, toCurrency) {
  if (type === "FX_CONVERSION") {
    const to = String(toCurrency ?? currency ?? "").toUpperCase()
    return to === String(currency ?? "").toUpperCase() ? "Correction" : "Conversion"
  }
  return CASH_LABELS[type] ?? type
}

// Signed legs of a cash row, keyed by currency — mirrors cashRowLegs in the
// wallets ledger: only a conversion has a second leg.
function legsOf(row) {
  const ccy = String(row.currency || "USD").toUpperCase()
  const legs = { [ccy]: Number(row.amount) || 0 }
  if (String(row.type).toUpperCase() === "FX_CONVERSION" && row.toAmount != null) {
    const to = String(row.toCurrency || ccy).toUpperCase()
    legs[to] = round2((legs[to] ?? 0) + Number(row.toAmount))
  }
  return legs
}

// Canonical conversion legs before writing, mirroring normalizeConversionLegs:
// two legs in one currency collapse to one signed amount, and a conversion with
// nothing handed over is a one-sided credit in the receiving currency.
function normalizeLegs(row) {
  const from = String(row.currency ?? "").toUpperCase()
  const to = String(row.toCurrency ?? row.currency ?? "").toUpperCase()
  const handed = Number(row.amount ?? 0)
  const received = Math.abs(Number(row.toAmount ?? 0))
  if (!from || !to) return null
  if (from === to) {
    const net = round2(handed + received)
    return net === 0 ? null : { currency: from, amount: net, toCurrency: to, toAmount: null }
  }
  if (handed === 0) return received === 0 ? null : { currency: to, amount: received, toCurrency: null, toAmount: null }
  return { currency: from, amount: handed, toCurrency: to, toAmount: received }
}

// ── portfolio resolution ────────────────────────────────────────────────────
// Cash state is keyed by portfolio id. The seeded Top10 is cash-enabled by
// default; portfolios created at runtime (or via a pre-seed call) opt in.
const TOP10_ID = "3cb589d8-f92d-428f-aeab-9ee5d4b9cef2"
const baseCcy = new Map() // portfolioId -> base currency
const margin = new Map() // portfolioId -> bool
const cashBaseOnly = new Map() // portfolioId -> cashBaseCurrencyOnly
const registered = new Set() // portfolioIds created via the API (transfer-eligible)

export function ensurePortfolio(portfolioId, { baseCurrency, isMarginEnabled, cashBaseCurrencyOnly } = {}) {
  registered.add(portfolioId)
  if (baseCurrency) baseCcy.set(portfolioId, String(baseCurrency).toUpperCase())
  else if (!baseCcy.has(portfolioId)) baseCcy.set(portfolioId, "USD")
  if (typeof isMarginEnabled === "boolean") margin.set(portfolioId, isMarginEnabled)
  if (typeof cashBaseCurrencyOnly === "boolean") cashBaseOnly.set(portfolioId, cashBaseCurrencyOnly)
}
export function hasCash(portfolioId) {
  return baseCcy.has(portfolioId) || portfolioId === TOP10_ID
}
function getBaseCcy(portfolioId) {
  return baseCcy.has(portfolioId) ? baseCcy.get(portfolioId) : "USD"
}
function isMargin(portfolioId) {
  return margin.has(portfolioId) ? margin.get(portfolioId) : false
}
export function isCashBaseCurrencyOnly(portfolioId) {
  return cashBaseOnly.get(portfolioId) === true
}

function portfolioName(portfolioId) {
  const raw = loadRaw("portfolios_summaries.json")
  const list = Array.isArray(raw) ? raw : raw?.portfolios ?? []
  for (const p of list) if (p.id === portfolioId) return p.name
  return "Portfolio"
}

// ── per-currency cash ledger ────────────────────────────────────────────────
const balances = new Map() // portfolioId -> { ccy: number }
const txBy = new Map() // portfolioId -> rawRow[]
const overrides = new Map() // txId -> patch | null (tombstone)

function seed() {
  if (balances.size) return
  ensurePortfolio(TOP10_ID)
  const T = "2026-08-05T00:00:00.000Z"
  applyRow(TOP10_ID, { id: "seed-top-dep", type: "DEPOSIT", amount: 1000, currency: "USD", createdAt: T, date: T, description: "Seed deposit" })
  applyRow(TOP10_ID, { id: "seed-top-dep-eur", type: "DEPOSIT", amount: 500, currency: "EUR", createdAt: T, date: T, description: "Seed deposit EUR" })
  applyRow(TOP10_ID, { id: "seed-top-inv", type: "WITHDRAWAL", amount: -300, currency: "USD", createdAt: T, date: T, description: "Opening position (buy)" })
}

function applyRow(portfolioId, row) {
  if (!balances.has(portfolioId)) balances.set(portfolioId, {})
  if (!txBy.has(portfolioId)) txBy.set(portfolioId, [])
  for (const [currency, signed] of Object.entries(legsOf(row))) {
    if (!signed) continue
    balances.get(portfolioId)[currency] = round2((balances.get(portfolioId)[currency] ?? 0) + signed)
  }
  txBy.get(portfolioId).unshift({ ...row, portfolioId, currency: String(row.currency || "USD").toUpperCase() })
}

// Balances are always derived from the rows, so an edit or a delete replays the
// ledger instead of nudging a single currency (as the wallets backend does).
function replayBalances(portfolioId) {
  const acc = {}
  for (const t of liveRows(portfolioId)) {
    const merged = overrides.get(t.id) ? { ...t, ...overrides.get(t.id) } : t
    for (const [currency, signed] of Object.entries(legsOf(merged))) {
      if (!signed) continue
      acc[currency] = round2((acc[currency] ?? 0) + signed)
    }
  }
  balances.set(portfolioId, acc)
}

function balanceOf(portfolioId, currency) {
  seed()
  return balances.get(portfolioId)?.[String(currency).toUpperCase()] ?? 0
}
function balanceRows(portfolioId) {
  seed()
  const raw = balances.get(portfolioId) ?? {}
  if (!isCashBaseCurrencyOnly(portfolioId)) {
    return Object.entries(raw).map(([currency, balance]) => ({ currency, balance }))
  }
  const base = getBaseCcy(portfolioId)
  let total = 0
  for (const [currency, balance] of Object.entries(raw)) {
    const rate = currency === base ? 1 : convert(1, currency, base, DEMO_RATES)
    if (rate == null) throw new Error(`[cash-mock] no FX rate available for ${currency}>${base}`)
    total += balance * rate
  }
  return [{ currency: base, balance: round2(total) }]
}
function totalOf(portfolioId) {
  seed()
  if (isCashBaseCurrencyOnly(portfolioId)) return balanceRows(portfolioId)[0]?.balance ?? 0
  const base = getBaseCcy(portfolioId)
  let total = 0
  for (const [ccy, amt] of Object.entries(balances.get(portfolioId) ?? {})) total += amt * (ccy === base ? 1 : convert(1, ccy, base, DEMO_RATES) ?? 1)
  return round2(total)
}

export function portfolioCash(portfolioId) {
  seed()
  return {
    baseCurrency: getBaseCcy(portfolioId),
    balances: balanceRows(portfolioId),
    total: totalOf(portfolioId),
  }
}

// §62 — a trade row (BUY/SELL/DIVIDEND) moves the portfolio's own cash (derived
// by replay in the real backend; the mock applies it straight to the ledger).
// totalAmount is the net (for DIVIDEND, gross − taxes). No separate cash row is
// stored — the cash effect is derived, like the real service.
export function tradeSigned(type, totalAmount, fees) {
  const t = String(type || "BUY").toUpperCase()
  const amt = Number(totalAmount) || 0
  const f = Number(fees) || 0
  return t === "BUY" ? -(amt + f) : t === "SELL" ? amt - f : t === "DIVIDEND" ? amt - f : 0
}
export function applyTradeCash(portfolioId, currency, signed) {
  if (!signed || !currency) return
  if (!balances.has(portfolioId)) balances.set(portfolioId, {})
  const ccy = String(currency).toUpperCase()
  balances.get(portfolioId)[ccy] = round2((balances.get(portfolioId)[ccy] ?? 0) + signed)
}

function liveRows(portfolioId) {
  seed()
  return (txBy.get(portfolioId) ?? []).filter((t) => !overrides.has(t.id) || overrides.get(t.id) !== null)
}
function toRow(portfolioId, t) {
  const merged = overrides.get(t.id) ? { ...t, ...overrides.get(t.id) } : t
  const type = String(merged.type).toUpperCase()
  return {
    id: merged.id,
    portfolioId,
    portfolioName: portfolioName(portfolioId),
    type,
    instrumentSymbol: merged.instrumentSymbol ?? null,
    instrumentName: merged.instrumentName ?? null,
    displayLabel: merged.displayLabel ?? displayLabel(type, merged.currency, merged.toCurrency),
    amount: Number(merged.amount) || 0,
    currency: merged.currency,
    toCurrency: merged.toCurrency ?? null,
    toAmount: merged.toAmount != null ? Number(merged.toAmount) : null,
    createdAt: merged.createdAt ?? merged.date ?? nowIso(),
    description: merged.description ?? null,
    transactionDate: merged.transactionDate ?? merged.transaction_date ?? null,
    fees: merged.fees ?? null,
    taxes: merged.taxes ?? null,
    feesType: merged.feesType ?? merged.fees_type ?? null,
    feeCurrency: merged.feeCurrency ?? null,
    rateSource: merged.rateSource ?? "automatic",
    exchangeRate: merged.exchangeRate ?? null,
    feeRateSource: merged.feeRateSource ?? "automatic",
    feeExchangeRate: merged.feeExchangeRate ?? null,
    toPortfolioId: merged.toPortfolioId ?? merged.to_portfolio_id ?? null,
    balanceAfter: merged.balanceAfter ?? null,
    isInternalTransfer: Boolean(merged.isInternalTransfer),
    reference: merged.reference ?? null,
    labels: labelsForCashTransaction(merged.id),
  }
}
// Recent feed row: amount is a signed string (contract `RecentCashTransaction.amount`).
function toRecent(portfolioId, t) {
  const row = toRow(portfolioId, t)
  return { ...row, amount: (row.amount || 0).toFixed(8), date: row.transactionDate ?? row.createdAt }
}

function allRecent() {
  seed()
  const out = []
  for (const pid of [...balances.keys()]) for (const t of liveRows(pid)) out.push(toRecent(pid, t))
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return out
}

// ── history ─────────────────────────────────────────────────────────────────
function historyFor(portfolioId) {
  seed()
  const base = getBaseCcy(portfolioId)
  const rows = liveRows(portfolioId).flatMap((t) => {
    const merged = overrides.get(t.id) ? { ...t, ...overrides.get(t.id) } : t
    const ms = new Date(merged.date ?? merged.createdAt).getTime()
    return Object.entries(legsOf(merged)).map(([ccy, signed]) => ({ ms, signed, ccy }))
  })
  const days = 90
  const last = new Date("2026-08-12T00:00:00Z").getTime()
  const data = []
  let running = 0
  let high = -Infinity
  let low = Infinity
  let sum = 0
  for (let i = days - 1; i >= 0; i--) {
    const d = last - i * 86_400_000
    for (const r of rows) if (r.ms > d - 86_400_000 && r.ms <= d) {
      const rate = r.ccy === base ? 1 : convert(1, r.ccy, base, DEMO_RATES)
      if (rate == null && isCashBaseCurrencyOnly(portfolioId)) {
        throw new Error(`[cash-mock] no event-date FX rate available for ${r.ccy}>${base}`)
      }
      running += r.signed * (rate ?? 1)
    }
    const bal = round2(running)
    data.push({ date: new Date(d).toISOString(), balance: bal, change: 0, percentChange: null, high: 0, low: 0 })
    high = Math.max(high, bal)
    low = Math.min(low, bal)
    sum += bal
  }
  for (let i = 1; i < data.length; i++) {
    const change = round2(data[i].balance - data[i - 1].balance)
    data[i].change = change
    data[i].percentChange = data[i - 1].balance !== 0 ? round2((change / Math.abs(data[i - 1].balance)) * 100) : null
  }
  return {
    data,
    meta: {
      period: "90d",
      resolution: "day",
      high: round2(high),
      low: round2(low),
      average: round2(sum / days),
      startDate: data[0].date,
      endDate: data[data.length - 1].date,
    },
  }
}

// ── mutations ───────────────────────────────────────────────────────────────
function makeTx(portfolioId, type, amount, body, extra = {}, fx) {
  return {
    id: uuid(),
    portfolioId,
    type,
    amount,
    currency: String(body.currency || getBaseCcy(portfolioId)).toUpperCase(),
    description: body.description ?? null,
    transactionDate: body.transactionDate ?? body.transaction_date ?? null,
    fees: Number(body.fees) || 0,
    feesType: fx?.fields.feesType ?? (body.feesType ?? body.fees_type ?? "fixed"),
    feeCurrency: fx?.fields.feeCurrency ?? (body.feeCurrency ?? null),
    rateSource: fx?.fields.rateSource ?? (body.rateSource ?? "automatic"),
    exchangeRate: fx?.fields.exchangeRate ?? (body.exchangeRate ?? null),
    feeRateSource: fx?.fields.feeRateSource ?? (body.feeRateSource ?? "automatic"),
    feeExchangeRate: fx?.fields.feeExchangeRate ?? (body.feeExchangeRate ?? null),
    toPortfolioId: extra.toPortfolioId ?? null,
    isInternalTransfer: Boolean(extra.isInternalTransfer),
    createdAt: nowIso(),
    date: nowIso(),
  }
}

function mutateDeposit(portfolioId, body) {
  const ccy = String(body.currency || getBaseCcy(portfolioId)).toUpperCase()
  if (isCashBaseCurrencyOnly(portfolioId) && ccy !== getBaseCcy(portfolioId)) {
    return { error: "validation", message: `Cash currency must be ${getBaseCcy(portfolioId)}` }
  }
  const value = Number(body.amount)
  if (!Number.isFinite(value) || value <= 0) return { error: "validation", message: "amount must be a positive number" }
  const fx = resolveFeeFx(body, ccy, { notional: value })
  if (fx.error) return { error: "validation", message: fx.error }
  const net = round2(value - fx.feesSettled)
  const tx = makeTx(portfolioId, "DEPOSIT", net, body, {}, fx)
  applyRow(portfolioId, tx)
  const after = balanceOf(portfolioId, ccy)
  return { ...toRow(portfolioId, tx), feesSettled: Math.round(fx.feesSettled * 1e8) / 1e8, new_balance: after, remaining_balance: after }
}

function mutateWithdraw(portfolioId, body) {
  const ccy = String(body.currency || getBaseCcy(portfolioId)).toUpperCase()
  if (isCashBaseCurrencyOnly(portfolioId) && ccy !== getBaseCcy(portfolioId)) {
    return { error: "validation", message: `Cash currency must be ${getBaseCcy(portfolioId)}` }
  }
  const value = Number(body.amount)
  if (!Number.isFinite(value) || value <= 0) return { error: "validation", message: "amount must be a positive number" }
  const fx = resolveFeeFx(body, ccy, { notional: value })
  if (fx.error) return { error: "validation", message: fx.error }
  const net = round2(value + fx.feesSettled)
  const tx = makeTx(portfolioId, "WITHDRAWAL", -net, body, {}, fx)
  applyRow(portfolioId, tx)
  const after = balanceOf(portfolioId, ccy)
  return { ...toRow(portfolioId, tx), feesSettled: Math.round(fx.feesSettled * 1e8) / 1e8, new_balance: after, remaining_balance: after }
}

// Interest and charges move the balance without money crossing the account
// boundary: INTEREST keeps the caller's sign (a debit-interest posting is a fact),
// FEE is a magnitude booked as a debit. Mirrors internalCash in the wallets routes.
function mutateInternal(portfolioId, body, kind) {
  const ccy = String(body.currency || getBaseCcy(portfolioId)).toUpperCase()
  if (isCashBaseCurrencyOnly(portfolioId) && ccy !== getBaseCcy(portfolioId)) {
    return { error: "validation", message: `Cash currency must be ${getBaseCcy(portfolioId)}` }
  }
  const raw = Number(body.amount)
  if (!Number.isFinite(raw)) return { error: "validation", message: "amount must be a number" }
  const amount = kind === "FEE" ? -Math.abs(raw) : raw
  if (amount === 0) return { error: "validation", message: "amount must be non-zero" }
  const fx = resolveFeeFx(body, ccy, { notional: Math.abs(amount) })
  if (fx.error) return { error: "validation", message: fx.error }
  const tx = makeTx(portfolioId, kind, amount, body, {}, fx)
  applyRow(portfolioId, tx)
  const after = balanceOf(portfolioId, ccy)
  return { ...toRow(portfolioId, tx), feesSettled: Math.round(fx.feesSettled * 1e8) / 1e8, new_balance: after, remaining_balance: after }
}

// Two legs, one row: `amount` is the signed leg handed over, `toAmount` the
// magnitude received. The charge is netted into the leg it is quoted in by the
// caller; a charge in a third currency is refused rather than dropped.
function mutateConversion(portfolioId, body) {
  const legs = normalizeLegs({
    currency: body.currency || getBaseCcy(portfolioId),
    amount: body.amount,
    toCurrency: body.toCurrency,
    toAmount: body.toAmount,
  })
  if (!legs) return { error: "validation", message: "this conversion changes nothing — both legs are zero" }
  const to = legs.toCurrency ?? legs.currency
  if (isCashBaseCurrencyOnly(portfolioId)) {
    const base = getBaseCcy(portfolioId)
    if (legs.currency !== base && to !== base) {
      return { error: "validation", message: `A conversion in a ${base}-settled portfolio must involve ${base}` }
    }
  }
  const chargeCcy = String(body.feeCurrency ?? legs.currency).toUpperCase()
  if (body.fees != null && Math.abs(Number(body.fees)) > 0 && chargeCcy !== legs.currency && chargeCcy !== to) {
    return {
      error: "validation",
      message: `A conversion charge in ${chargeCcy} belongs to neither leg (${legs.currency} handed over, ${to} received)`,
    }
  }
  const fx = resolveFeeFx(body, legs.currency, { notional: Math.abs(legs.amount) })
  if (fx.error) return { error: "validation", message: fx.error }
  const tx = { ...makeTx(portfolioId, "FX_CONVERSION", legs.amount, body, {}, fx), toCurrency: legs.toCurrency, toAmount: legs.toAmount }
  applyRow(portfolioId, tx)
  const after = balanceOf(portfolioId, legs.currency)
  return { ...toRow(portfolioId, tx), feesSettled: Math.round(fx.feesSettled * 1e8) / 1e8, new_balance: after, remaining_balance: after }
}

function mutateTransfer(portfolioId, body) {
  const toPortfolioId = body.toPortfolioId ?? body.to_portfolio_id
  if (!toPortfolioId || toPortfolioId === portfolioId) return { error: "dest_notfound" }
  if (!registered.has(toPortfolioId) && toPortfolioId !== TOP10_ID) return { error: "dest_notfound" }
  ensurePortfolio(toPortfolioId)
  const ccy = String(body.currency || getBaseCcy(portfolioId)).toUpperCase()
  if (isCashBaseCurrencyOnly(portfolioId) && ccy !== getBaseCcy(portfolioId)) {
    return { error: "validation", message: `Source cash currency must be ${getBaseCcy(portfolioId)}` }
  }
  const value = Number(body.amount)
  if (!Number.isFinite(value) || value <= 0) return { error: "validation", message: "amount must be a positive number" }
  const fx = resolveFeeFx(body, ccy, { notional: value })
  if (fx.error) return { error: "validation", message: fx.error }
  const debit = round2(value + fx.feesSettled)
  const targetBase = getBaseCcy(toPortfolioId)
  const suppliedTarget = body.targetAmount != null ? Number(body.targetAmount) : null
  const resolvedRate = targetBase === ccy
    ? 1
    : body.targetFxRate != null
      ? Number(body.targetFxRate)
      : suppliedTarget != null
        ? suppliedTarget / value
        : convert(1, ccy, targetBase, DEMO_RATES)
  if (
    targetBase !== ccy &&
    (isCashBaseCurrencyOnly(portfolioId) || isCashBaseCurrencyOnly(toPortfolioId)) &&
    (resolvedRate == null || !Number.isFinite(resolvedRate) || resolvedRate <= 0)
  ) {
    return { error: "validation", message: `No transfer FX rate available for ${ccy}>${targetBase}` }
  }
  const autoTarget = value * (resolvedRate ?? 1)
  const targetAmount = body.targetAmount != null ? Number(body.targetAmount) : autoTarget
  const srcTx = makeTx(portfolioId, "TRANSFER", -debit, body, { toPortfolioId, isInternalTransfer: true }, fx)
  const dstTx = makeTx(toPortfolioId, "TRANSFER", round2(targetAmount), { ...body, currency: targetBase }, { toPortfolioId: portfolioId, isInternalTransfer: true })
  applyRow(portfolioId, srcTx)
  applyRow(toPortfolioId, dstTx)
  const after = balanceOf(portfolioId, ccy)
  return { ...toRow(portfolioId, srcTx), targetAmount: round2(targetAmount), new_balance: after, remaining_balance: after }
}

const RECENT_SORT_FIELDS = { date: "createdAt", portfolioName: "portfolioName", type: "type", amount: "amount" }
// Per-portfolio tab: `date` falls back to createdAt when the row has no explicit
// transactionDate, matching the SPA's dateOf() so the arrow order matches what
// the user sees.
const CASH_TX_SORT_FIELDS = {
  date: "transactionDate",
  type: "type",
  amount: "amount",
  balance: "balanceAfter",
  description: "description",
}
const NUMERIC_SORT_FIELDS = new Set(["amount", "balanceAfter"])

function sortValue(row, field) {
  return field === "transactionDate" ? row.transactionDate ?? row.createdAt : row[field]
}

function sortCashRows(items, fields, sortBy, sortOrder) {
  const field = fields[sortBy]
  if (!field) return items
  const dir = String(sortOrder).toLowerCase() === "asc" ? 1 : -1
  return [...items].sort((a, b) => {
    const av = sortValue(a, field)
    const bv = sortValue(b, field)
    if (NUMERIC_SORT_FIELDS.has(field)) return ((Number(av) || 0) - (Number(bv) || 0)) * dir
    return String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true }) * dir
  })
}

function filterCashRows(items, search) {
  if (!search || !String(search).trim()) return items
  const q = String(search).trim().toLowerCase()
  return items.filter((row) =>
    String(row.instrumentSymbol ?? "").toLowerCase().includes(q) ||
    String(row.instrumentName ?? "").toLowerCase().includes(q),
  )
}

function filterCashRowsByLabels(items, raw) {
  return items.filter((row) => matchesCashLabelFilter(row.id, raw))
}

function recentPage(ctx) {
  const items = sortCashRows(filterCashRowsByLabels(filterCashRows(allRecent(), ctx.query.search), ctx.query.labels), RECENT_SORT_FIELDS, ctx.query.sortBy, ctx.query.sortOrder)
  const limit = Number(ctx.query.limit) || 10
  const page = Number(ctx.query.page) || 1
  const total = items.length
  return { data: items.slice((page - 1) * limit, (page - 1) * limit + limit), meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) } }
}

export function register(app) {
  seed()
  app.get("/api/currencies", (ctx) => ctx.res.json(currenciesPayload()))

  app.get("/api/portfolios/cash/recent-transactions", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(recentPage(ctx))
  })

  app.patch("/api/portfolios/cash/transactions/:txId", (ctx) => {
    if (!requireAuth(ctx)) return
    const txId = ctx.params.txId
    const found = allRecent().find((t) => t.id === txId)
    if (!found) return ctx.res.status(404).json({ error: "NotFound", message: "Transaction not found" })
    const body = { ...(ctx.body || {}) }
    if (body.transaction_date && !body.transactionDate) body.transactionDate = body.transaction_date
    delete body.type // the SPA no longer sends a type — the row type is fixed
    const isConversion = String(found.type).toUpperCase() === "FX_CONVERSION"
    const merged = { ...found, ...body }
    if (isCashBaseCurrencyOnly(found.portfolioId)) {
      const base = getBaseCcy(found.portfolioId)
      if (isConversion) {
        // The first leg of a conversion is by definition foreign to the
        // settlement currency; what is not allowed is one that touches neither.
        const to = String(merged.toCurrency ?? merged.currency ?? base).toUpperCase()
        if (String(merged.currency).toUpperCase() !== base && to !== base) {
          return ctx.res.status(422).json({ error: "ValidationError", message: `A conversion in a ${base}-settled portfolio must involve ${base}` })
        }
      } else {
        if (String(found.currency).toUpperCase() !== base) {
          return ctx.res.status(422).json({ error: "ValidationError", message: `Non-base cash rows cannot be edited while cash is limited to ${base}` })
        }
        if (body.currency != null && String(body.currency).toUpperCase() !== base) {
          return ctx.res.status(422).json({ error: "ValidationError", message: `Cash currency must be ${base}` })
        }
      }
    }
    if (isConversion) {
      // Legs are edited as one unit and collapse to the canonical shape, so the
      // stored row never has two legs in one currency or a zero amount.
      const legs = normalizeLegs({
        currency: merged.currency,
        amount: merged.amount,
        toCurrency: merged.toCurrency,
        toAmount: merged.toAmount,
      })
      if (!legs) return ctx.res.status(422).json({ error: "ValidationError", message: "the legs cancel out — delete the row instead" })
      body.amount = legs.amount
      body.currency = legs.currency
      body.toCurrency = legs.toCurrency
      body.toAmount = legs.toAmount
    } else if (typeof body.amount === "number") {
      // sign is re-clamped from the existing row's type (like the real PATCH):
      // WITHDRAWAL → −, DEPOSIT → +. INTEREST and FEE keep the sign they were
      // sent with — flipping a debit-interest row would move the balance twice.
      const t = String(found.type).toUpperCase()
      const abs = Math.abs(body.amount)
      if (t === "WITHDRAWAL") body.amount = -abs
      else if (t === "DEPOSIT") body.amount = abs
      if (body.amount === 0) return ctx.res.status(422).json({ error: "ValidationError", message: "amount must be non-zero (delete the row instead)" })
    }
    overrides.set(txId, { ...overrides.get(txId), ...body })
    replayBalances(found.portfolioId)
    ctx.res.json(allRecent().find((t) => t.id === txId))
  })

  app.delete("/api/portfolios/cash/transactions/:txId", (ctx) => {
    if (!requireAuth(ctx)) return
    const txId = ctx.params.txId
    const found = allRecent().find((t) => t.id === txId)
    if (!found) return ctx.res.status(404).json({ error: "NotFound", message: "Transaction not found" })
    overrides.set(txId, null)
    replayBalances(found.portfolioId)
    ctx.res.status(204).end()
  })

  app.get("/api/portfolios/:id/cash", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(portfolioCash(ctx.params.id))
  })

  app.get("/api/portfolios/:id/cash/balance-history", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(historyFor(ctx.params.id))
  })

  app.get("/api/portfolios/:id/cash/transactions", (ctx) => {
    if (!requireAuth(ctx)) return
    const rows = filterCashRowsByLabels(filterCashRows(liveRows(ctx.params.id).map((t) => toRow(ctx.params.id, t)), ctx.query.search), ctx.query.labels)
    const sorted = sortCashRows(rows, CASH_TX_SORT_FIELDS, ctx.query.sortBy, ctx.query.sortOrder)
    ctx.res.json(paginatePage(ctx.query.page, ctx.query.limit, sorted, sorted.length))
  })

  app.post("/api/portfolios/:id/cash/deposits", (ctx) => {
    if (!requireAuth(ctx)) return
    const res = mutateDeposit(ctx.params.id, ctx.body || {})
    if (res.error === "validation") return ctx.res.status(422).json({ error: "ValidationError", message: res.message })
    ctx.res.status(201).json(res)
  })

  app.post("/api/portfolios/:id/cash/withdrawals", (ctx) => {
    if (!requireAuth(ctx)) return
    const res = mutateWithdraw(ctx.params.id, ctx.body || {})
    if (res.error === "validation") return ctx.res.status(422).json({ error: "ValidationError", message: res.message })
    ctx.res.status(201).json(res)
  })

  app.post("/api/portfolios/:id/cash/transfers", (ctx) => {
    if (!requireAuth(ctx)) return
    const res = mutateTransfer(ctx.params.id, ctx.body || {})
    if (res.error === "validation") return ctx.res.status(422).json({ error: "ValidationError", message: res.message })
    if (res.error === "dest_notfound") return ctx.res.status(404).json({ error: "NotFound", message: "Destination portfolio not found" })
    ctx.res.status(201).json(res)
  })

  app.post("/api/portfolios/:id/cash/interest", (ctx) => {
    if (!requireAuth(ctx)) return
    const res = mutateInternal(ctx.params.id, ctx.body || {}, "INTEREST")
    if (res.error === "validation") return ctx.res.status(422).json({ error: "ValidationError", message: res.message })
    ctx.res.status(201).json(res)
  })

  app.post("/api/portfolios/:id/cash/fees", (ctx) => {
    if (!requireAuth(ctx)) return
    const res = mutateInternal(ctx.params.id, ctx.body || {}, "FEE")
    if (res.error === "validation") return ctx.res.status(422).json({ error: "ValidationError", message: res.message })
    ctx.res.status(201).json(res)
  })

  app.post("/api/portfolios/:id/cash/conversions", (ctx) => {
    if (!requireAuth(ctx)) return
    const res = mutateConversion(ctx.params.id, ctx.body || {})
    if (res.error === "validation") return ctx.res.status(422).json({ error: "ValidationError", message: res.message })
    ctx.res.status(201).json(res)
  })

  // ── §62.5 import API (portfolio-native; the mock state is in-memory) ──────
  const importPortfolios = new Map() // source\0name -> {id,name,baseCurrency}
  const importLabels = new Map() // source\0label -> label
  const importTxs = [] // {externalId, externalSource}
  const importRuns = []
  let importRunSeq = 0

  app.post("/api/import/portfolios/bootstrap", (ctx) => {
    if (!requireAuth(ctx)) return
    const { externalSource, name, baseCurrency, cashBaseCurrencyOnly } = ctx.body || {}
    if (!externalSource || !name || typeof cashBaseCurrencyOnly !== "boolean") {
      return ctx.res.status(422).json({ error: "ValidationError", message: "externalSource, name, and cashBaseCurrencyOnly are required" })
    }
    const key = `${externalSource}\u0000${name}`
    const existing = importPortfolios.get(key)
    const normalizedBase = String(baseCurrency || "USD").toUpperCase()
    if (existing) {
      existing.baseCurrency = normalizedBase
      existing.cashBaseCurrencyOnly = cashBaseCurrencyOnly
      ensurePortfolio(existing.id, { baseCurrency: normalizedBase, cashBaseCurrencyOnly })
      return ctx.res.json({ ...existing, currency: normalizedBase, created: false })
    }
    const row = { id: uuid(), name, baseCurrency: normalizedBase, cashBaseCurrencyOnly }
    importPortfolios.set(key, row)
    ensurePortfolio(row.id, { baseCurrency: normalizedBase, cashBaseCurrencyOnly })
    ctx.res.json({ ...row, currency: normalizedBase, created: true })
  })

  app.post("/api/import/labels/bootstrap", (ctx) => {
    if (!requireAuth(ctx)) return
    const { externalSource, labels } = ctx.body || {}
    if (!externalSource || !Array.isArray(labels)) return ctx.res.status(422).json({ error: "ValidationError", message: "externalSource and labels[] are required" })
    const out = labels.map((l) => {
      const key = `${externalSource}\u0000${l.name}`
      const existing = importLabels.get(key)
      if (existing) return { ...existing, created: false }
      const row = { id: uuid(), name: l.name, color: l.color ?? null }
      importLabels.set(key, row)
      return { ...row, created: true }
    })
    ctx.res.json({ labels: out })
  })

  app.post("/api/import/transactions", (ctx) => {
    if (!requireAuth(ctx)) return
    const { source, transactions } = ctx.body || {}
    if (!source?.externalSource || !Array.isArray(transactions)) return ctx.res.status(422).json({ error: "ValidationError", message: "source and transactions[] are required" })
    const errors = []
    let inserted = 0
    let insertedPtx = 0
    let insertedCash = 0
    let skipped = 0
    for (const t of transactions) {
      if (!t?.externalId) { errors.push({ externalId: null, error: "missing_external_id", message: "externalId is required" }); continue }
      if (importTxs.some((x) => x.externalId === t.externalId && x.externalSource === source.externalSource)) { skipped++; continue }
      importTxs.push({ externalId: t.externalId, externalSource: source.externalSource })
      inserted++
      if (t.portfolioTx) insertedPtx++
      if (t.cashTx) insertedCash++
    }
    let run = importRuns.find((r) => r.externalSource === source.externalSource && r.spreadsheetId === source.spreadsheetId && r.sheet === source.sheet)
    if (!run) {
      run = { id: ++importRunSeq, externalSource: source.externalSource, spreadsheetId: source.spreadsheetId ?? null, sheet: source.sheet ?? null, lastRow: null, status: "pending", startedAt: nowIso(), completedAt: null, error: null, insertedCashTx: 0, insertedPtx: 0, skipped: 0 }
      importRuns.push(run)
    }
    run.insertedCashTx = insertedCash
    run.insertedPtx = insertedPtx
    run.skipped = skipped
    run.status = inserted === 0 && errors.length > 0 ? "failed" : "done"
    run.completedAt = nowIso()
    run.error = errors.length > 0 ? `${errors.length} row(s) failed` : null
    ctx.res.json({ inserted, skipped, errors, syncRun: run })
  })

  app.get("/api/import/sync-runs", (ctx) => {
    if (!requireAuth(ctx)) return
    const limit = Math.min(Math.max(Number(ctx.query.limit) || 25, 1), 100)
    const offset = Math.max(Number(ctx.query.offset) || 0, 0)
    let items = [...importRuns].reverse()
    if (ctx.query.externalSource) items = items.filter((r) => r.externalSource === ctx.query.externalSource)
    const total = items.length
    ctx.res.json({ items: items.slice(offset, offset + limit), total })
  })

  app.delete("/api/import/sync-runs/:id", (ctx) => {
    if (!requireAuth(ctx)) return
    const idx = importRuns.findIndex((r) => r.id === Number(ctx.params.id))
    if (idx === -1) return ctx.res.status(404).json({ error: "NotFound", message: "Run not found" })
    importRuns.splice(idx, 1)
    ctx.res.status(204).end()
  })

  app.delete("/api/import/source/:externalSource", (ctx) => {
    if (!requireAuth(ctx)) return
    const source = ctx.params.externalSource
    const prefix = source + "\u0000"
    let portfolios = 0
    let labels = 0
    for (const k of [...importPortfolios.keys()]) if (k.startsWith(prefix)) { importPortfolios.delete(k); portfolios++ }
    for (const k of [...importLabels.keys()]) if (k.startsWith(prefix)) { importLabels.delete(k); labels++ }
    const cashTransactions = importTxs.filter((t) => t.externalSource === source).length
    for (let i = importTxs.length - 1; i >= 0; i--) if (importTxs[i].externalSource === source) importTxs.splice(i, 1)
    const syncRuns = importRuns.filter((r) => r.externalSource === source).length
    for (let i = importRuns.length - 1; i >= 0; i--) if (importRuns[i].externalSource === source) importRuns.splice(i, 1)
    ctx.res.json({ deleted: { portfolios, labels, cashTransactions, syncRuns } })
  })

  // §62.5 — internal split application (no auth; no-op in the mock)
  app.post("/internal/apply-split", (ctx) => {
    ctx.res.json({ updatedTransactions: 0, affectedPortfolios: 0 })
  })
}
