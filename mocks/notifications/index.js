import { requireAuth } from "../lib/auth.js"
import { loadRaw } from "../lib/data.js"
import { paginateCursor } from "../lib/http.js"

let preferences = null
let symbols = null

function getPreferences() {
  if (!preferences) preferences = JSON.parse(JSON.stringify(loadRaw("notifications_preferences.json")))
  return preferences
}

function getSymbols() {
  if (!symbols) symbols = JSON.parse(JSON.stringify(loadRaw("notifications_symbols.json")))
  return symbols
}

function recountSymbols() {
  symbols.totalEnabled = symbols.items.filter((i) => !i.muted).length
  symbols.totalMuted = symbols.items.filter((i) => i.muted).length
}

function userTickerCount() {
  return symbols.items.filter((i) => i.source === "user").length
}

export function register(app) {
  app.get("/api/notifications", (ctx) => {
    if (!requireAuth(ctx)) return
    const { cursor, limit } = ctx.query
    const items = loadRaw("notifications_list.json").items
    if (cursor || limit) {
      const page = paginateCursor(items, cursor, limit || 10, "createdAt")
      ctx.res.json({
        items: page.data,
        nextCursor: page.pagination.next_cursor,
        unreadCount: loadRaw("notifications_list.json").unreadCount,
      })
      return
    }
    ctx.res.json(loadRaw("notifications_list.json"))
  })

  app.get("/api/notifications/unread-count", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("notifications_unread_count.json"))
  })

  app.get("/api/notifications/preferences", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(getPreferences())
  })

  app.patch("/api/notifications/preferences", (ctx) => {
    if (!requireAuth(ctx)) return
    Object.assign(getPreferences(), ctx.body || {})
    ctx.res.json(getPreferences())
  })

  app.get("/api/notifications/symbols", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(getSymbols())
  })

  app.post("/api/notifications/symbols", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = String((ctx.body || {}).symbol || "").toUpperCase().trim()
    if (!symbol) {
      return ctx.res.status(422).json({ error: "ValidationError", message: "symbol is required", statusCode: 422 })
    }
    if (getSymbols().items.some((i) => i.symbol === symbol)) {
      return ctx.res.status(422).json({ error: "Conflict", message: `${symbol} is already tracked`, statusCode: 422 })
    }
    if (userTickerCount() >= 3) {
      return ctx.res.status(422).json({ error: "LimitReached", message: "Tracked ticker limit reached", statusCode: 422 })
    }
    getSymbols().items.push({ symbol, muted: false, source: "user" })
    recountSymbols()
    ctx.res.status(201).json(getSymbols())
  })

  app.patch("/api/notifications/symbols/:symbol", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = ctx.params.symbol.toUpperCase()
    const item = getSymbols().items.find((i) => i.symbol === symbol)
    if (!item) {
      return ctx.res.status(404).json({ error: "NotFound", message: `${symbol} is not tracked`, statusCode: 404 })
    }
    if (typeof (ctx.body || {}).muted === "boolean") item.muted = ctx.body.muted
    recountSymbols()
    ctx.res.json(getSymbols())
  })

  app.delete("/api/notifications/symbols/:symbol", (ctx) => {
    if (!requireAuth(ctx)) return
    const symbol = ctx.params.symbol.toUpperCase()
    const idx = getSymbols().items.findIndex((i) => i.symbol === symbol)
    if (idx < 0) {
      return ctx.res.status(404).json({ error: "NotFound", message: `${symbol} is not tracked`, statusCode: 404 })
    }
    if (getSymbols().items[idx].source === "default") {
      return ctx.res.status(422).json({ error: "Conflict", message: "Default tickers cannot be removed", statusCode: 422 })
    }
    getSymbols().items.splice(idx, 1)
    recountSymbols()
    ctx.res.json(getSymbols())
  })

  app.post("/api/notifications/read-all", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json({ count: 0 })
  })
}
