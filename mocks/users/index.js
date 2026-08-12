import { requireAuth } from "../lib/auth.js"
import { loadRaw } from "../lib/data.js"

let profile = null

function getProfile() {
  if (!profile) profile = JSON.parse(JSON.stringify(loadRaw("users_profile.json")))
  return profile
}

export function register(app) {
  app.get("/api/users/profile", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(getProfile())
  })

  app.patch("/api/users/profile", (ctx) => {
    if (!requireAuth(ctx)) return
    Object.assign(getProfile(), ctx.body || {})
    getProfile().updatedAt = new Date().toISOString()
    ctx.res.json(getProfile())
  })

  app.post("/api/users/change-password", (ctx) => {
    if (!requireAuth(ctx)) return
    const { newPassword } = ctx.body || {}
    if (
      !newPassword ||
      String(newPassword).length < 8 ||
      !/[a-z]/.test(String(newPassword)) ||
      !/[A-Z]/.test(String(newPassword)) ||
      !/\d/.test(String(newPassword))
    ) {
      return ctx.res.status(422).json({
        error: "ValidationError",
        message: "Password must be at least 8 characters with uppercase, lowercase, and number",
        statusCode: 422,
      })
    }
    ctx.res.json({ ok: true })
  })

  app.post("/api/users/clear-data", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.status(204).end()
  })

  app.delete("/api/users/account", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.status(204).end()
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
