import { crossRate } from "@marx-org/contracts/fx"
import { requireAuth } from "../lib/auth.js"
import { DEMO_RATES, DEMO_FX_DATE } from "../lib/demo-fx.js"

export function register(app) {
  app.get("/api/fx/latest", (ctx) => {
    if (!requireAuth(ctx)) return
    const from = String(ctx.query.from ?? "").toUpperCase()
    const to = String(ctx.query.to ?? "").toUpperCase()
    if (!from || !to) return ctx.res.status(400).json({ error: "from and to are required" })
    const rate = crossRate(from, to, DEMO_RATES)
    if (rate == null) {
      return ctx.res.status(422).json({ error: `no fx rate for ${from}->${to}` })
    }
    ctx.res.json({ from, to, rate, asOf: DEMO_FX_DATE })
  })
}