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

const CASH_LABELS = { DEPOSIT: "Deposit", WITHDRAWAL: "Withdrawal", TRANSFER: "Transfer" }

const round2 = (x) => Math.round(x * 100) / 100

// ── portfolio resolution ────────────────────────────────────────────────────
// Cash state is keyed by portfolio id. The seeded Top10 is cash-enabled by
// default; portfolios created at runtime (or via a pre-seed call) opt in.
const TOP10_ID = "3cb589d8-f92d-428f-aeab-9ee5d4b9cef2"
const baseCcy = new Map() // portfolioId -> base currency
const margin = new Map() // portfolioId -> bool
const registered = new Set() // portfolioIds created via the API (transfer-eligible)

export function ensurePortfolio(portfolioId, { baseCurrency, isMarginEnabled } = {}) {
  registered.add(portfolioId)
  if (!baseCcy.has(portfolioId)) baseCcy.set(portfolioId, String(baseCurrency || "USD").toUpperCase())
  if (typeof isMarginEnabled === "boolean") margin.set(portfolioId, isMarginEnabled)
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
  const ccy = String(row.currency || "USD").toUpperCase()
  balances.get(portfolioId)[ccy] = round2((balances.get(portfolioId)[ccy] ?? 0) + (Number(row.amount) || 0))
  txBy.get(portfolioId).unshift({ ...row, portfolioId, currency: ccy })
}

function balanceOf(portfolioId, currency) {
  seed()
  return balances.get(portfolioId)?.[String(currency).toUpperCase()] ?? 0
}
function totalOf(portfolioId) {
  seed()
  const base = getBaseCcy(portfolioId)
  let total = 0
  for (const [ccy, amt] of Object.entries(balances.get(portfolioId) ?? {})) total += amt * (ccy === base ? 1 : convert(1, ccy, base, DEMO_RATES) ?? 1)
  return round2(total)
}

export function portfolioCash(portfolioId) {
  seed()
  const c = balances.get(portfolioId) ?? {}
  return {
    baseCurrency: getBaseCcy(portfolioId),
    balances: Object.entries(c).map(([currency, balance]) => ({ currency, balance })),
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
    displayLabel: merged.displayLabel ?? CASH_LABELS[type] ?? type,
    amount: Number(merged.amount) || 0,
    currency: merged.currency,
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
  const rows = (txBy.get(portfolioId) ?? []).map((t) => ({ ms: new Date(t.date ?? t.createdAt).getTime(), signed: Number(t.amount) || 0, ccy: t.currency }))
  const days = 90
  const last = new Date("2026-08-12T00:00:00Z").getTime()
  const data = []
  let running = 0
  let high = -Infinity
  let low = Infinity
  let sum = 0
  for (let i = days - 1; i >= 0; i--) {
    const d = last - i * 86_400_000
    for (const r of rows) if (r.ms > d - 86_400_000 && r.ms <= d) running += r.ccy === base ? r.signed : r.signed * (convert(1, r.ccy, base, DEMO_RATES) ?? 1)
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

function mutateTransfer(portfolioId, body) {
  const toPortfolioId = body.toPortfolioId ?? body.to_portfolio_id
  if (!toPortfolioId || toPortfolioId === portfolioId) return { error: "dest_notfound" }
  if (!registered.has(toPortfolioId) && toPortfolioId !== TOP10_ID) return { error: "dest_notfound" }
  ensurePortfolio(toPortfolioId)
  const ccy = String(body.currency || getBaseCcy(portfolioId)).toUpperCase()
  const value = Number(body.amount)
  if (!Number.isFinite(value) || value <= 0) return { error: "validation", message: "amount must be a positive number" }
  const fx = resolveFeeFx(body, ccy, { notional: value })
  if (fx.error) return { error: "validation", message: fx.error }
  const debit = round2(value + fx.feesSettled)
  const targetBase = getBaseCcy(toPortfolioId)
  const autoTarget = targetBase === ccy ? value : value * (convert(1, ccy, targetBase, DEMO_RATES) ?? 1)
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
    if (typeof body.amount === "number") {
      // sign is re-clamped from the existing row's type (like the real PATCH):
      // WITHDRAWAL → −, DEPOSIT → +
      const t = String(found.type).toUpperCase()
      const abs = Math.abs(body.amount)
      body.amount = t === "WITHDRAWAL" ? -abs : abs
    }
    overrides.set(txId, { ...overrides.get(txId), ...body })
    ctx.res.json(allRecent().find((t) => t.id === txId))
  })

  app.delete("/api/portfolios/cash/transactions/:txId", (ctx) => {
    if (!requireAuth(ctx)) return
    const txId = ctx.params.txId
    if (!allRecent().some((t) => t.id === txId)) return ctx.res.status(404).json({ error: "NotFound", message: "Transaction not found" })
    overrides.set(txId, null)
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

  // ── §62.5 import API (portfolio-native; the mock state is in-memory) ──────
  const importPortfolios = new Map() // source\0name -> {id,name,baseCurrency}
  const importLabels = new Map() // source\0label -> label
  const importTxs = [] // {externalId, externalSource}
  const importRuns = []
  let importRunSeq = 0

  app.post("/api/import/portfolios/bootstrap", (ctx) => {
    if (!requireAuth(ctx)) return
    const { externalSource, name, baseCurrency } = ctx.body || {}
    if (!externalSource || !name) return ctx.res.status(422).json({ error: "ValidationError", message: "externalSource and name are required" })
    const key = `${externalSource}\u0000${name}`
    const existing = importPortfolios.get(key)
    if (existing) return ctx.res.json({ ...existing, created: false })
    const row = { id: uuid(), name, baseCurrency: String(baseCurrency || "USD").toUpperCase() }
    importPortfolios.set(key, row)
    ctx.res.json({ ...row, created: true })
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
