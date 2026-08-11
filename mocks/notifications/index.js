import { requireAuth } from "../lib/auth.js"
import { loadRaw } from "../lib/data.js"
import { paginateCursor, paginatePage, uuid, nowIso } from "../lib/http.js"

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
    ctx.res.json(loadRaw("notifications_preferences.json"))
  })

  app.patch("/api/notifications/preferences", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json({ ...loadRaw("notifications_preferences.json"), ...(ctx.body || {}) })
  })

  app.get("/api/notifications/symbols", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json(loadRaw("notifications_symbols.json"))
  })

  app.post("/api/notifications/read-all", (ctx) => {
    if (!requireAuth(ctx)) return
    ctx.res.json({ count: 0 })
  })
}
