import { requireAuth } from "../lib/auth.js"
import { loadRaw, loadResearch } from "../lib/data.js"

function makeCursor(item, field) {
  const payload = {
    id: item.id,
    timestamp: item[field] ?? new Date().toISOString(),
    dir: "next",
    field,
  }
  return Buffer.from(JSON.stringify(payload)).toString("base64url")
}

function findFromCursor(items, cursor) {
  if (!cursor) return 0
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    const idx = items.findIndex((it) => it.id === decoded.id)
    return idx >= 0 ? idx + 1 : 0
  } catch {
    return 0
  }
}

function pageNews(items, cursor, limit, field) {
  const l = Number(limit) || 20
  const from = findFromCursor(items, cursor)
  const slice = items.slice(from, from + l)
  const last = slice[slice.length - 1]
  return {
    data: slice,
    pagination: {
      count: slice.length,
      total_count: items.length,
      has_next_page: from + l < items.length,
      has_previous_page: from > 0,
      next_cursor: last && from + l < items.length ? makeCursor(last, field) : null,
      previous_cursor: from > 0 ? makeCursor(items[from - 1], field) : null,
    },
  }
}

export function register(app) {
  app.get("/api/news/articles", (ctx) => {
    if (!requireAuth(ctx)) return
    const { cursor, limit, ticker } = ctx.query
    const items = ticker
      ? loadRaw("news_articles_ticker.json").data
      : loadRaw("news_articles_all.json").data
    ctx.res.json(pageNews(items, cursor, limit, "published_at"))
  })

  app.get("/api/news/timeline", (ctx) => {
    if (!requireAuth(ctx)) return
    const { cursor, limit } = ctx.query
    const items = loadRaw("news_timeline_20.json").data
    ctx.res.json(pageNews(items, cursor, limit, "event_timestamp"))
  })

  app.get("/api/news/market-contexts", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("news_market_contexts.json"))
  })

  app.get("/api/news/stats", (ctx) => {
    if (!requireAuth(ctx)) return
    const stats = loadRaw("news_stats.json")
    const ticker = (ctx.query.ticker || "AAPL").split(".")[0].toUpperCase()
    const research = loadResearch(ticker)
    if (research && stats.data) {
      ctx.res.json({ ...stats, data: { ...stats.data, ticker, name: research.overview.name } })
      return
    }
    ctx.res.json(stats)
  })

  app.get("/api/news/tracked-tickers", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("news_tracked_tickers.json"))
  })

  app.get("/api/news/livestreams/channels", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("news_livestreams_channels.json"))
  })

  app.get("/api/news/livestreams/live", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("news_livestreams_live.json"))
  })

  app.get("/api/news/insights", (ctx) => {
    if (!requireAuth(ctx)) return
    const insights = loadRaw("news_insights_403.json")
    if (Array.isArray(insights.data) && insights.data.length === 0) {
      return ctx.res.json({ data: [] })
    }
    ctx.res.json(insights)
  })
}
