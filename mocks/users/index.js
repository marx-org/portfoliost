import { requireAuth } from "../lib/auth.js"
import { loadRaw } from "../lib/data.js"

export function register(app) {
  app.get("/api/users/profile", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("users_profile.json"))
  })

  app.patch("/api/users/profile", (ctx) => {
    if (!requireAuth(ctx)) return
    const p = loadRaw("users_profile.json")
    ctx.res.json({ ...p, ...(ctx.body || {}) })
  })

  app.get("/api/users/preferences", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("users_preferences.json"))
  })

  app.patch("/api/users/preferences", (ctx) => {
    if (!requireAuth(ctx)) return
    const p = loadRaw("users_preferences.json")
    ctx.res.json({ ...p, ...(ctx.body || {}) })
  })

  app.get("/api/users/preferences/custom-benchmarks", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("users_preferences_custom_benchmarks.json"))
  })

  app.get("/api/users/preferences/custom-timeframes", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("users_preferences_custom_timeframes.json"))
  })

  app.get("/api/users/onboarding/status", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("users_onboarding_status.json"))
  })

  app.get("/api/users/onboarding/draft", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("users_onboarding_draft.json"))
  })
}
