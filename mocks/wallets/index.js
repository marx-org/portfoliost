import { requireAuth } from "../lib/auth.js"
import { loadRaw } from "../lib/data.js"
import { paginatePage, uuid, nowIso } from "../lib/http.js"

const wallets = new Map()
const cashTx = new Map()

export function register(app) {
  app.get("/api/wallets", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("wallets.json").concat([...wallets.values()]))
  })

  app.get("/api/wallets/total-balance", (ctx) => {
    if (!requireAuth(ctx)) return
    const base = loadRaw("wallets_total_balance.json")
    const extra = [...wallets.values()]
    if (!extra.length) return ctx.res.json(base)
    const extraValue = extra.reduce((s, w) => s + w.balance, 0)
    ctx.res.json({
      ...base,
      totalBalance: base.totalBalance + extraValue,
      totalAvailableBalance: base.totalAvailableBalance + extraValue,
      walletBreakdown: [
        ...(base.walletBreakdown || []),
        ...extra.map((w) => ({ id: w.id, name: w.name, balance: w.balance, availableBalance: w.availableBalance, currency: w.currency })),
      ],
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

  function mutate(id, kind) {
    const wallet = loadRaw("wallets.json").find((w) => w.id === id) || wallets.get(id)
    if (!wallet) return null
    const { amount, description } = ctx_body_store.lastBody || {}
    const value = Number(amount) || 0
    const signed = kind === "withdrawals" ? -value : value
    wallet.balance = round2(wallet.balance + signed)
    wallet.availableBalance = round2(wallet.availableBalance + signed)
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

  app.get("/api/wallets/:id/transactions", (ctx) => {
    if (!requireAuth(ctx)) return
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
