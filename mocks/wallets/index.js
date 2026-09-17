import { requireAuth } from "../lib/auth.js"
import { loadRaw } from "../lib/data.js"
import { paginatePage, uuid, nowIso } from "../lib/http.js"
import { currenciesPayload, resolveFeeFx } from "../lib/demo-fx.js"

const wallets = new Map()
const cashTx = new Map()
const walletOverrides = new Map()

const SEED_CASH = [
  { type: "DEPOSIT", amount: 2500, daysAgo: 30, description: "Monthly transfer" },
  { type: "WITHDRAWAL", amount: 383.4, daysAgo: 21, description: "Buy EUR bonds" },
  { type: "DEPOSIT", amount: 1500, daysAgo: 12, description: "Salary deposit" },
  { type: "DEPOSIT", amount: 2000, daysAgo: 6, description: "Cash dividend income" },
  { type: "WITHDRAWAL", amount: 600, daysAgo: 2, description: "EUR transfer" },
]

function seedCashTransactions() {
  for (const w of loadRaw("wallets.json")) {
    if (cashTx.has(w.id)) continue
    const list = []
    for (const seed of SEED_CASH) {
      const d = new Date(Date.now() - seed.daysAgo * 24 * 60 * 60 * 1000)
      list.push({
        id: `seed-${w.id.slice(0, 8)}-${seed.type.toLowerCase()}-${seed.daysAgo}`,
        walletId: w.id,
        type: seed.type,
        amount: seed.amount,
        currency: w.currency,
        status: "completed",
        createdAt: d.toISOString(),
        description: seed.description,
      })
    }
    cashTx.set(w.id, list)
  }
}

function allCashTransactions() {
  seedCashTransactions()
  const items = []
  for (const [id, list] of cashTx) {
    const wallet = resolveWallet(id)
    for (const tx of list) items.push({ ...tx, walletId: id, walletName: wallet?.name ?? id })
  }
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return items
}

const CASH_LABELS = { DEPOSIT: "Deposit", WITHDRAWAL: "Withdrawal", TRANSFER: "Transfer" }
const recentOverrides = new Map()

function toRecentCash(tx) {
  const type = String(tx.type).toUpperCase()
  const amount = Number(tx.amount) || 0
  const signed =
    type === "WITHDRAWAL" ? -amount
    : type === "SELL" ? amount
    : type === "DEPOSIT" ? amount
    : type === "INVEST" ? -amount
    : amount
  return {
    id: tx.id,
    walletId: tx.walletId,
    walletName: tx.walletName,
    type,
    displayLabel: tx.displayLabel ?? CASH_LABELS[type] ?? type,
    amount: signed.toFixed(8),
    currency: tx.currency ?? "USD",
    exchangeRate: tx.exchangeRate ?? null,
    reference: tx.reference ?? null,
    date: tx.date ?? tx.transaction_date ?? tx.executedAt ?? tx.createdAt,
    description: tx.description ?? null,
    createdAt: tx.createdAt ?? tx.date ?? tx.executedAt ?? nowIso(),
    portfolioId: tx.portfolioId ?? null,
    fees: tx.fees ?? null,
    taxes: tx.taxes ?? null,
    feesType: tx.fees_type ?? tx.feesType ?? null,
    feeCurrency: tx.feeCurrency ?? null,
    rateSource: tx.rateSource ?? "automatic",
    exchangeRate: tx.exchangeRate ?? null,
    feeRateSource: tx.feeRateSource ?? "automatic",
    feeExchangeRate: tx.feeExchangeRate ?? null,
    paymentMethod: tx.payment_method ?? null,
    toWalletId: tx.to_wallet_id ?? null,
    isInternalTransfer: Boolean(tx.isInternalTransfer),
  }
}

function recentCashTransactions() {
  const items = []
  const walletsByName = new Map(allWallets().map((w) => [w.id, w.name]))
  for (const t of loadRaw("portfolios_transactions.json")?.items ?? []) {
    items.push(
      toRecentCash({
        id: `cash-${t.id}`,
        walletId: t.walletId,
        walletName: walletsByName.get(t.walletId) ?? null,
        type: "INVEST",
        displayLabel: "Investment",
        amount: (t.totalAmount ?? 0) + (t.fees ?? 0),
        currency: t.currency ?? "USD",
        reference: `PORTFOLIO_${String(t.type).toUpperCase()}_${t.instrumentSymbol}_${t.id}`,
        date: t.executedAt,
        description: `Portfolio investment: ${t.instrumentSymbol}`,
        createdAt: t.createdAt,
        portfolioId: t.portfolioId,
        fees: t.fees ?? null,
        taxes: null,
        isInternalTransfer: false,
      }),
    )
  }
  for (const tx of allCashTransactions()) items.push(toRecentCash(tx))
  return items
    .filter((tx) => !recentOverrides.has(tx.id) || recentOverrides.get(tx.id) !== null)
    .map((tx) => (recentOverrides.has(tx.id) ? { ...tx, ...recentOverrides.get(tx.id) } : tx))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

const RECENT_SORT_FIELDS = { date: "date", walletName: "walletName", type: "type", amount: "amount" }

function recentTransactionsPage(ctx) {
  const items = recentCashTransactions()
  const field = RECENT_SORT_FIELDS[ctx.query.sortBy]
  if (field) {
    const dir = String(ctx.query.sortOrder).toLowerCase() === "asc" ? 1 : -1
    items.sort((a, b) => {
      if (field === "amount") return (Number(a.amount) - Number(b.amount)) * dir
      return String(a[field]).localeCompare(String(b[field]), undefined, { numeric: true }) * dir
    })
  }
  const limit = Number(ctx.query.limit) || 10
  const page = Number(ctx.query.page) || 1
  const total = items.length
  const start = (page - 1) * limit
  return {
    data: items.slice(start, start + limit),
    meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
  }
}

function resolveWallet(id) {
  if (walletOverrides.has(id)) return walletOverrides.get(id) ?? null
  const base = loadRaw("wallets.json").find((w) => w.id === id)
  if (base) return base
  return wallets.get(id) || null
}

// Mirrors the real wallets module (`assertDeletable`): a wallet with any cash or
// investment (portfolio) ledger row cannot be deleted. Tombstoned recent txs
// (recentOverrides == null) stop counting, so deleting them first unlocks delete.
function walletHasTransactions(id) {
  seedCashTransactions()
  const cash = (cashTx.get(id) || []).some((tx) => !recentOverrides.has(tx.id) || recentOverrides.get(tx.id) !== null)
  if (cash) return true
  return (loadRaw("portfolios_transactions.json")?.items ?? []).some((t) => t.walletId === id)
}

function allWallets() {
  const merged = []
  const seen = new Set()
  for (const w of [...loadRaw("wallets.json"), ...wallets.values()]) {
    if (seen.has(w.id)) continue
    seen.add(w.id)
    const over = walletOverrides.has(w.id) ? walletOverrides.get(w.id) : w
    if (over) merged.push(over)
  }
  return merged
}

export function register(app) {
  app.get("/api/currencies", (ctx) => {
    ctx.res.json(currenciesPayload())
  })

  app.get("/api/wallets", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(allWallets())
  })

  app.get("/api/wallets/total-balance", (ctx) => {
    if (!requireAuth(ctx)) return
    const all = allWallets()
    if (!all.length) return ctx.res.json(loadRaw("wallets_total_balance.json"))
    const totalBalance = all.reduce((s, w) => s + w.balance, 0)
    const totalAvailableBalance = all.reduce((s, w) => s + w.availableBalance, 0)
    ctx.res.json({
      ...loadRaw("wallets_total_balance.json"),
      totalBalance: round2(totalBalance),
      totalAvailableBalance: round2(totalAvailableBalance),
      walletBreakdown: all.map((w) => ({
        id: w.id,
        name: w.name,
        balance: w.balance,
        availableBalance: w.availableBalance,
        currency: w.currency,
      })),
    })
  })

  app.post("/api/wallets", (ctx) => {
    if (!requireAuth(ctx)) return
    const { name, currency = "USD" } = ctx.body || {}
    if (!name) return ctx.res.status(422).json({ error: "ValidationError", message: "name is required" })
    const wallet = {
      id: uuid(),
      userId: ctx.user.id,
      name,
      currency,
      balance: 0,
      availableBalance: 0,
      isDefault: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    wallets.set(wallet.id, wallet)
    ctx.res.status(201).json(wallet)
  })

  app.patch("/api/wallets/:id", (ctx) => {
    if (!requireAuth(ctx)) return
    const wallet = resolveWallet(ctx.params.id)
    if (!wallet) return ctx.res.status(404).json({ error: "NotFound", message: "Wallet not found" })
    const updated = { ...wallet, ...(ctx.body || {}), updatedAt: nowIso() }
    walletOverrides.set(ctx.params.id, updated)
    ctx.res.json(updated)
  })

  app.delete("/api/wallets/:id", (ctx) => {
    if (!requireAuth(ctx)) return
    const wallet = resolveWallet(ctx.params.id)
    if (!wallet) return ctx.res.status(404).json({ error: "NotFound", message: "Wallet not found" })
    if (walletHasTransactions(ctx.params.id)) {
      return ctx.res.status(409).json({ error: "Conflict", message: "Wallet has transactions and cannot be deleted" })
    }
    walletOverrides.set(ctx.params.id, null)
    cashTx.delete(ctx.params.id)
    ctx.res.status(204).end()
  })

  function mutate(id, kind) {
    const wallet = resolveWallet(id)
    if (!wallet) return { error: "notfound" }
    const body = ctx_body_store.lastBody || {}
    const { amount, description, transaction_date, payment_method, to_wallet_id } = body
    const value = Number(amount) || 0

    const dest = kind === "transfers" && to_wallet_id ? resolveWallet(to_wallet_id) : null
    if (kind === "transfers" && to_wallet_id && !dest) return { error: "dest_notfound" }

    // Fee/FX resolution (fees-and-custom-fx D28/D32): pct materialized on the
    // fly, foreign fee currency settled into the wallet currency, manual rates
    // validated (422).
    const fx = resolveFeeFx(body, wallet.currency, {
      notional: value,
      displayRate: undefined,
      toCcy: dest?.currency,
    })
    if (fx.error) return { error: "validation", message: fx.error }
    const cashFee = fx.feesSettled
    const signed = kind === "deposits" ? value : -(value + cashFee)

    let creditedAmount = null
    let destUpdated = null
    if (kind === "transfers" && dest && dest.id !== id) {
      const manualTarget = body.targetAmount != null ? Number(body.targetAmount) : null
      creditedAmount =
        manualTarget ??
        (fx.fields.transferFxRate != null ? Math.round(value * fx.fields.transferFxRate * 1e8) / 1e8 : value)
      destUpdated = {
        ...dest,
        balance: round2(dest.balance + creditedAmount),
        availableBalance: round2(dest.availableBalance + creditedAmount),
      }
      walletOverrides.set(to_wallet_id, destUpdated)
    }

    const updated = {
      ...wallet,
      balance: round2(wallet.balance + signed),
      availableBalance: round2(wallet.availableBalance + signed),
    }
    walletOverrides.set(id, updated)
    const rawFees = Number(body.fees) || 0
    const tx = {
      id: uuid(),
      walletId: id,
      type: kind === "deposits" ? "DEPOSIT" : kind === "withdrawals" ? "WITHDRAWAL" : "TRANSFER",
      amount: value,
      currency: wallet.currency,
      status: "completed",
      transaction_date: transaction_date ?? null,
      payment_method: payment_method ?? null,
      fees: rawFees,
      fees_settled: Math.round(fx.feesSettled * 1e8) / 1e8,
      fees_type: fx.fields.feesType,
      feeCurrency: fx.fields.feeCurrency,
      rateSource: fx.fields.rateSource,
      exchangeRate: fx.fields.exchangeRate,
      feeRateSource: fx.fields.feeRateSource,
      feeExchangeRate: fx.fields.feeExchangeRate,
      target_amount: creditedAmount,
      transfer_fx_rate: fx.fields.transferFxRate,
      to_wallet_id: to_wallet_id ?? null,
      createdAt: nowIso(),
      description: description ?? null,
      new_balance: updated.balance,
      remaining_balance: updated.availableBalance,
    }
    const list = cashTx.get(id) || []
    list.unshift(tx)
    cashTx.set(id, list)
    if (kind === "transfers" && dest && dest.id !== id) {
      const destTx = {
        ...tx,
        id: uuid(),
        walletId: to_wallet_id,
        type: "TRANSFER",
        to_wallet_id: id,
        amount: creditedAmount,
        remaining_balance: destUpdated.availableBalance,
        description: description ?? `Transfer from ${wallet.name}`,
      }
      const destList = cashTx.get(to_wallet_id) || []
      destList.unshift(destTx)
      cashTx.set(to_wallet_id, destList)
    }
    return tx
  }

  const ctx_body_store = {}
  app.post("/api/wallets/:id/deposits", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx_body_store.lastBody = ctx.body || {}
    const res = mutate(ctx.params.id, "deposits")
    if (!res || res.error === "notfound") return ctx.res.status(404).json({ error: "NotFound", message: "Wallet not found" })
    if (res.error === "validation") return ctx.res.status(422).json({ error: "ValidationError", message: res.message })
    ctx.res.status(201).json(res)
  })
  app.post("/api/wallets/:id/withdrawals", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx_body_store.lastBody = ctx.body || {}
    const res = mutate(ctx.params.id, "withdrawals")
    if (!res || res.error === "notfound") return ctx.res.status(404).json({ error: "NotFound", message: "Wallet not found" })
    if (res.error === "validation") return ctx.res.status(422).json({ error: "ValidationError", message: res.message })
    ctx.res.status(201).json(res)
  })
  app.post("/api/wallets/:id/transfers", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx_body_store.lastBody = ctx.body || {}
    const res = mutate(ctx.params.id, "transfers")
    if (!res || res.error === "notfound") return ctx.res.status(404).json({ error: "NotFound", message: "Wallet not found" })
    if (res.error === "validation") return ctx.res.status(422).json({ error: "ValidationError", message: res.message })
    if (res.error === "dest_notfound") return ctx.res.status(404).json({ error: "NotFound", message: "Destination wallet not found" })
    ctx.res.status(201).json(res)
  })

  app.get("/api/wallets/:id/balance-history", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("wallet_balance_history.json"))
  })

  app.get("/api/wallets/transactions", (ctx) => {
    if (!requireAuth(ctx)) return
    const all = allCashTransactions()
    ctx.res.json(paginatePage(ctx.query.page, ctx.query.limit, all, all.length))
  })

  app.get("/api/wallets/recent-transactions", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(recentTransactionsPage(ctx))
  })

  app.patch("/api/wallets/transactions/:txId", (ctx) => {
    if (!requireAuth(ctx)) return
    const txId = ctx.params.txId
    const found = recentCashTransactions().find((tx) => tx.id === txId)
    if (!found) return ctx.res.status(404).json({ error: "NotFound", message: "Transaction not found" })
    const body = { ...(ctx.body || {}) }
    if (body.date && !body.transaction_date) {
      body.transaction_date = body.date
    }
    if (body.type) {
      const t = String(body.type).toUpperCase()
      body.type = t
      body.displayLabel = t === "INVEST" ? "Investment" : CASH_LABELS[t] ?? t
    }
    if (typeof body.amount === "number") {
      const t = String(body.type ?? found.type).toUpperCase()
      const abs = Math.abs(body.amount)
      body.amount = (t === "WITHDRAWAL" || t === "INVEST" ? -abs : abs).toFixed(8)
    }
    recentOverrides.set(txId, { ...recentOverrides.get(txId), ...body })
    ctx.res.json(recentCashTransactions().find((tx) => tx.id === txId))
  })

  app.delete("/api/wallets/transactions/:txId", (ctx) => {
    if (!requireAuth(ctx)) return
    const txId = ctx.params.txId
    if (!recentCashTransactions().some((tx) => tx.id === txId)) {
      return ctx.res.status(404).json({ error: "NotFound", message: "Transaction not found" })
    }
    recentOverrides.set(txId, null)
    ctx.res.status(204).end()
  })

  app.get("/api/wallets/:id/transactions", (ctx) => {
    if (!requireAuth(ctx)) return
    seedCashTransactions()
    const list = cashTx.get(ctx.params.id) || []
    const items = list
      .filter((tx) => !recentOverrides.has(tx.id) || recentOverrides.get(tx.id) !== null)
      .map((tx) => {
        if (!recentOverrides.has(tx.id)) return tx
        const merged = { ...tx, ...recentOverrides.get(tx.id) }
        const type = String(merged.type).toUpperCase()
        merged.amount = Math.abs(Number(merged.amount) || 0)
        merged.type = type
        return merged
      })
    if (!items.length) {
      return ctx.res.json({ items: [], total: 0, page: 1, limit: 10, totalPages: 1, hasNext: false, hasPrevious: false })
    }
    ctx.res.json(paginatePage(ctx.query.page, ctx.query.limit, items, items.length))
  })

  // ── §23 — import API (mock state is in-memory per process) ────────────────
  const importWallets = new Map()
  const importPortfolios = new Map()
  const importRuns = []
  let importRunSeq = 0
  const importTxs = []

  app.post("/api/import/wallets/bootstrap", (ctx) => {
    if (!requireAuth(ctx)) return
    const { externalSource, wallets } = ctx.body || {}
    if (!externalSource || !Array.isArray(wallets) || wallets.length === 0) {
      return ctx.res.status(422).json({ error: "ValidationError", message: "externalSource and wallets[] are required" })
    }
    const out = []
    for (const w of wallets) {
      const key = `${externalSource}\u0000${w.name}`
      const existing = importWallets.get(key)
      if (existing) {
        out.push({ ...existing, created: false })
      } else {
        const row = { id: uuid(), name: w.name, currency: String(w.currency || "USD").toUpperCase(), baseCurrency: String(w.baseCurrency || "USD").toUpperCase() }
        importWallets.set(key, row)
        out.push({ ...row, created: true })
      }
    }
    ctx.res.json({ wallets: out })
  })

  app.post("/api/import/portfolios/bootstrap", (ctx) => {
    if (!requireAuth(ctx)) return
    const { externalSource, name, currency, baseCurrency } = ctx.body || {}
    if (!externalSource || !name || !currency) {
      return ctx.res.status(422).json({ error: "ValidationError", message: "externalSource, name and currency are required" })
    }
    const key = `${externalSource}\u0000${name}`
    const existing = importPortfolios.get(key)
    if (existing) return ctx.res.json({ ...existing, created: false })
    const row = { id: uuid(), name, currency: String(currency).toUpperCase(), baseCurrency: String(baseCurrency || "USD").toUpperCase() }
    importPortfolios.set(key, row)
    ctx.res.json({ ...row, created: true })
  })

  app.post("/api/import/transactions", (ctx) => {
    if (!requireAuth(ctx)) return
    const { source, transactions } = ctx.body || {}
    if (!source?.externalSource || !Array.isArray(transactions)) {
      return ctx.res.status(422).json({ error: "ValidationError", message: "source and transactions[] are required" })
    }
    const errors = []
    let inserted = 0
    let insertedPtx = 0
    let skipped = 0
    for (const t of transactions) {
      if (!t?.externalId) {
        errors.push({ externalId: null, error: "missing_external_id", message: "externalId is required" })
        continue
      }
      if (importTxs.some((x) => x.externalId === t.externalId && x.externalSource === source.externalSource)) {
        skipped++
        continue
      }
      importTxs.push({ externalId: t.externalId, externalSource: source.externalSource, hasPortfolioTx: Boolean(t.portfolioTx) })
      inserted++
      if (t.portfolioTx) insertedPtx++
    }

    let run = importRuns.find(
      (r) =>
        r.externalSource === source.externalSource &&
        r.spreadsheetId === source.spreadsheetId &&
        r.sheet === source.sheet,
    )
    if (!run) {
      run = {
        id: ++importRunSeq,
        externalSource: source.externalSource,
        spreadsheetId: source.spreadsheetId ?? null,
        sheet: source.sheet ?? null,
        lastRow: null,
        status: "pending",
        startedAt: nowIso(),
        completedAt: null,
        error: null,
        insertedWtx: 0,
        insertedPtx: 0,
        skipped: 0,
      }
      importRuns.push(run)
    }
    run.insertedWtx = inserted
    run.insertedPtx = insertedPtx
    run.skipped = skipped
    run.status = inserted === 0 && errors.length > 0 ? "failed" : "done"
    run.completedAt = nowIso()
    run.error = errors.length > 0 ? `${errors.length} row(s) failed` : null

    ctx.res.json({ inserted, skipped, errors, syncRun: run })
  })

  app.get("/api/import/sync-runs", (ctx) => {
    if (!requireAuth(ctx)) return
    const externalSource = ctx.query.externalSource
    const limit = Math.min(Math.max(Number(ctx.query.limit) || 25, 1), 100)
    const offset = Math.max(Number(ctx.query.offset) || 0, 0)
    let items = [...importRuns].reverse()
    if (externalSource) items = items.filter((r) => r.externalSource === externalSource)
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
    const deleted = { walletTransactions: 0, portfolios: 0, wallets: 0, syncRuns: 0 }
    for (const [k] of [...importWallets]) {
      if (k.startsWith(source + "\u0000")) {
        importWallets.delete(k)
        deleted.wallets++
      }
    }
    for (const [k] of [...importPortfolios]) {
      if (k.startsWith(source + "\u0000")) {
        importPortfolios.delete(k)
        deleted.portfolios++
      }
    }
    deleted.walletTransactions = importTxs.filter((t) => t.externalSource === source).length
    for (let i = importTxs.length - 1; i >= 0; i--) {
      if (importTxs[i].externalSource === source) importTxs.splice(i, 1)
    }
    deleted.syncRuns = importRuns.filter((r) => r.externalSource === source).length
    for (let i = importRuns.length - 1; i >= 0; i--) {
      if (importRuns[i].externalSource === source) importRuns.splice(i, 1)
    }
    ctx.res.json({ deleted })
  })

  // §23.6 — internal split application (no auth; no-op in the mock)
  app.post("/internal/apply-split", (ctx) => {
    ctx.res.json({ updatedTransactions: 0, affectedPortfolios: 0 })
  })
}

function round2(x) {
  return Math.round(x * 100) / 100
}
