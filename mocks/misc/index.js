import { requireAuth } from "../lib/auth.js"
import { loadRaw, logoPath } from "../lib/data.js"
import { existsSync, readFileSync } from "node:fs"

// A 1x1 transparent SVG used for tickers that have no seeded logo asset. The
// real provider tier (openst) returns a placeholder for the long tail rather
// than 404ing, so the mock does the same — a spec asserting "200 + image bytes
// for any symbol" then holds for KTY.WA as well as AAPL.
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"><rect width="1" height="1" fill="none"/></svg>'

export function register(app) {
  // GET /api/logos/:symbol — logo bytes for a ticker (logos.md §12.6).
  // Served unauthenticated like the SPA <img> that loads it.
  app.get("/api/logos/:symbol", (ctx) => {
    const symbol = String(ctx.params.symbol || "")
    const path = logoPath(symbol)
    if (existsSync(path)) {
      const data = readFileSync(path)
      ctx.res.setHeader("content-type", "image/svg+xml")
      ctx.res.setHeader("cache-control", "public, max-age=86400")
      ctx.res.end(data)
      return
    }
    ctx.res.setHeader("content-type", "image/svg+xml")
    ctx.res.setHeader("cache-control", "public, max-age=86400")
    ctx.res.end(PLACEHOLDER_SVG)
  })

  app.get("/api/exchange-rates", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("exchange_rates.json"))
  })

  app.get("/api/snaptrade/status", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("snaptrade_status.json"))
  })
}