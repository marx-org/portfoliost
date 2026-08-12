import { requireAuth } from "../lib/auth.js"
import { loadRaw, loadUniverse } from "../lib/data.js"
import { uuid, nowIso } from "../lib/http.js"

const watchlists = new Map()

export function register(app) {
  app.get("/api/watchlists", (ctx) => {
    if (!requireAuth(ctx)) return
    const base = loadRaw("watchlists.json")
    ctx.res.json(base.concat([...watchlists.values()]))
  })

  app.post("/api/watchlists", (ctx) => {
    if (!requireAuth(ctx)) return
    const { name, description } = ctx.body || {}
    if (!name) return ctx.res.status(422).json({ error: "ValidationError", message: "name is required" })
    const wl = { id: uuid(), name, description: description ?? null, createdAt: nowIso(), updatedAt: nowIso(), items: [] }
    watchlists.set(wl.id, wl)
    ctx.res.status(201).json(wl)
  })

  function find(id) {
    const base = loadRaw("watchlists.json")
    if (Array.isArray(base)) {
      const existing = base.find((w) => w.id === id)
      if (existing) return existing
    }
    return watchlists.get(id)
  }

  app.get("/api/watchlists/:id", (ctx) => {
    if (!requireAuth(ctx)) return
    const wl = find(ctx.params.id)
    if (!wl) return ctx.res.status(404).json({ error: "NotFound", message: "Watchlist not found" })
    ctx.res.json(wl)
  })

  app.delete("/api/watchlists/:id", (ctx) => {
    if (!requireAuth(ctx)) return
    watchlists.delete(ctx.params.id)
    ctx.res.status(204).end()
  })

  app.post("/api/watchlists/:id/items", (ctx) => {
    if (!requireAuth(ctx)) return
    const wl = find(ctx.params.id)
    if (!wl) return ctx.res.status(404).json({ error: "NotFound", message: "Watchlist not found" })
    const { symbol } = ctx.body || {}
    const universe = loadUniverse()
    const inst = universe.find((u) => u.symbol === String(symbol).toUpperCase())
    if (!inst) return ctx.res.status(422).json({ error: "ValidationError", message: `Unknown symbol ${symbol}` })
    if (!Array.isArray(wl.items)) wl.items = []
    if (!wl.items.some((i) => i.symbol === inst.symbol)) {
      wl.items.push({ symbol: inst.symbol, name: inst.name, type: inst.type, addedAt: nowIso() })
    }
    wl.updatedAt = nowIso()
    ctx.res.status(201).json(wl)
  })

  app.delete("/api/watchlists/:id/items/:symbol", (ctx) => {
    if (!requireAuth(ctx)) return
    const wl = find(ctx.params.id)
    if (!wl) return ctx.res.status(404).json({ error: "NotFound", message: "Watchlist not found" })
    const symbol = ctx.params.symbol.toUpperCase()
    if (Array.isArray(wl.items)) wl.items = wl.items.filter((i) => i.symbol !== symbol)
    wl.updatedAt = nowIso()
    ctx.res.json(wl)
  })
}
