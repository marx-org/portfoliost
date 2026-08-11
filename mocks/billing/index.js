import { requireAuth } from "../lib/auth.js"
import { loadRaw } from "../lib/data.js"

export function register(app) {
  app.get("/api/billing/plans", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("billing_plans.json"))
  })

  app.get("/api/billing/subscription", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("billing_subscription.json"))
  })

  app.get("/api/billing/entitlements", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("billing_entitlements.json"))
  })
}
