import { requireAuth } from "../lib/auth.js"
import { loadRaw, loadResearch } from "../lib/data.js"

export function register(app) {
  const presets = (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("charting_presets.json"))
  }
  app.get("/charting/presets", presets)
  app.get("/api/charting/presets", presets)

  const compare = (ctx) => {
    if (!requireAuth(ctx)) return
    const requested = (ctx.query.symbols || "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
    const symbols = requested.length ? requested : ["AAPL"]
    const rows = symbols
      .map((symbol) => {
        const research = loadResearch(symbol)
        if (!research) return null
        return research.compare
      })
      .filter(Boolean)
    ctx.res.json(rows)
  }
  app.get("/charting/compare", compare)
  app.get("/api/charting/compare", compare)
}
