import { requireAuth } from "../lib/auth.js"
import { loadRaw } from "../lib/data.js"
import { paginatePage, uuid, nowIso } from "../lib/http.js"

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
    date: tx.date ?? tx.executedAt ?? tx.createdAt,
    description: tx.description ?? null,
    createdAt: tx.createdAt ?? tx.date ?? tx.executedAt ?? nowIso(),
    portfolioId: tx.portfolioId ?? null,
    fees: tx.fees ?? null,
    taxes: tx.taxes ?? null,
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
    walletOverrides.set(ctx.params.id, null)
    cashTx.delete(ctx.params.id)
    ctx.res.status(204).end()
  })

  function mutate(id, kind) {
    const wallet = resolveWallet(id)
    if (!wallet) return null
    const { amount, description } = ctx_body_store.lastBody || {}
    const value = Number(amount) || 0
    const signed = kind === "withdrawals" ? -value : value
    const updated = {
      ...wallet,
      balance: round2(wallet.balance + signed),
      availableBalance: round2(wallet.availableBalance + signed),
    }
    walletOverrides.set(id, updated)
    const tx = {
      id: uuid(),
      walletId: id,
      type: kind === "deposits" ? "DEPOSIT" : kind === "withdrawals" ? "WITHDRAWAL" : "TRANSFER",
      amount: value,
      currency: wallet.currency,
      status: "completed",
      createdAt: nowIso(),
      description: description ?? null,
    }
    const list = cashTx.get(id) || []
    list.unshift(tx)
    cashTx.set(id, list)
    return tx
  }

  const ctx_body_store = {}
  app.post("/api/wallets/:id/deposits", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx_body_store.lastBody = ctx.body || {}
    const tx = mutate(ctx.params.id, "deposits")
    if (!tx) return ctx.res.status(404).json({ error: "NotFound", message: "Wallet not found" })
    ctx.res.status(201).json(tx)
  })
  app.post("/api/wallets/:id/withdrawals", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx_body_store.lastBody = ctx.body || {}
    const tx = mutate(ctx.params.id, "withdrawals")
    if (!tx) return ctx.res.status(404).json({ error: "NotFound", message: "Wallet not found" })
    ctx.res.status(201).json(tx)
  })
  app.post("/api/wallets/:id/transfers", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx_body_store.lastBody = ctx.body || {}
    const tx = mutate(ctx.params.id, "transfers")
    if (!tx) return ctx.res.status(404).json({ error: "NotFound", message: "Wallet not found" })
    ctx.res.status(201).json(tx)
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
    if (!list.length) {
      return ctx.res.json({ items: [], total: 0, page: 1, limit: 10, totalPages: 1, hasNext: false, hasPrevious: false })
    }
    ctx.res.json(paginatePage(ctx.query.page, ctx.query.limit, list, list.length))
  })
}

function round2(x) {
  return Math.round(x * 100) / 100
}
