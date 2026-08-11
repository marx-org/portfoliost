import { requireAuth } from "../lib/auth.js"
import { loadRaw } from "../lib/data.js"

export function register(app) {
  app.get("/api/exchange-rates", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("exchange_rates.json"))
  })

  app.get("/api/snaptrade/status", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("snaptrade_status.json"))
  })
}
