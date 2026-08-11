import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import { extname } from "node:path"

const CONTENT_TYPES = {
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".csv": "text/csv",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".html": "text/html",
  ".mp3": "audio/mpeg",
}
export function contentTypeFor(path) {
  return CONTENT_TYPES[extname(path).toLowerCase()] || "application/octet-stream"
}

const METHODS = ["get", "post", "patch", "put", "delete", "options"]

function parseQuery(url) {
  const raw = url.split("?")[1]
  if (!raw) return {}
  const q = {}
  for (const [k, v] of new URLSearchParams(raw)) q[k] = v
  return q
}

function tokenize(path) {
  return path.split("/").filter(Boolean)
}

function matchRoute(routeTokens, pathTokens) {
  if (routeTokens.length !== pathTokens.length) return null
  const params = {}
  for (let i = 0; i < routeTokens.length; i++) {
    const rt = routeTokens[i]
    const pt = pathTokens[i]
    if (rt.startsWith(":")) params[rt.slice(1)] = decodeURIComponent(pt)
    else if (rt !== pt) return null
  }
  return params
}

function jsonBody(raw) {
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function paginatePage(page, limit, items, total) {
  const l = Number(limit) || 10
  const p = Number(page) || 1
  const totalPages = Math.max(1, Math.ceil(total / l))
  const start = (p - 1) * l
  return {
    items: items.slice(start, start + l),
    total,
    page: p,
    limit: l,
    totalPages,
    hasNext: p < totalPages,
    hasPrevious: p > 1,
  }
}

function paginateCursor(items, cursor, limit, field = "published_at") {
  const l = Number(limit) || 20
  const idx = cursor ? items.findIndex((it) => it.id === cursor) : -1
  const from = idx >= 0 ? idx + 1 : 0
  const slice = items.slice(from, from + l)
  return {
    data: slice,
    pagination: {
      count: slice.length,
      total_count: items.length,
      has_next_page: from + l < items.length,
      has_previous_page: from > 0,
      next_cursor: slice.length && from + l < items.length ? slice[slice.length - 1].id : null,
      previous_cursor: from > 0 ? items[from - 1].id : null,
    },
  }
}

function uuid() {
  return crypto.randomUUID()
}

function nowIso() {
  return new Date().toISOString()
}

export function createApp() {
  const routes = new Map()
  const middlewares = []

  function addRoute(method, pattern, handler) {
    const key = method.toUpperCase()
    if (!routes.has(key)) routes.set(key, [])
    routes.get(key).push({ tokens: tokenize(pattern), pattern, handler })
  }

  const app = {
    use(fn) {
      middlewares.push(fn)
      return app
    },
    listen(port, host = "0.0.0.0", cb) {
      const server = createServer(async (req, res) => {
        const url = req.url || "/"
        const path = url.split("?")[0]
        const tokens = tokenize(path)
        const method = (req.method || "GET").toUpperCase()
        const query = parseQuery(url)

        const ctx = { method, path, tokens, query, headers: req.headers }
        ctx.req = req
        ctx.res = res

        let raw = ""
        req.on("data", (c) => {
          raw += c
          if (raw.length > 5 * 1024 * 1024) req.destroy()
        })
        await new Promise((resolve) => req.on("end", resolve))
        ctx.body = jsonBody(raw)

        const send = (status, payload) => {
          if (res.writableEnded) return
          res.statusCode = status
          if (payload === undefined || payload === null) return res.end()
          if (typeof payload === "string") {
            if (!res.getHeader("content-type")) res.setHeader("content-type", "text/plain; charset=utf-8")
            return res.end(payload)
          }
          res.setHeader("content-type", "application/json")
          res.end(JSON.stringify(payload))
        }

        res.status = (s) => ({ json: (p) => send(s, p), end: () => send(s) })
        res.json = (p, s = 200) => send(s, p)
        res.send = (p, s = 200) => send(s, p)
        res.sendFile = (filePath) => {
          try {
            const data = readFileSync(filePath)
            res.setHeader("content-type", contentTypeFor(filePath))
            res.end(data)
          } catch (e) {
            send(404, { error: "Not Found", message: String(e && e.message || e) })
          }
        }

        res.setHeader("access-control-allow-origin", "*")
        res.setHeader("access-control-allow-headers", "content-type, authorization")
        res.setHeader("access-control-allow-methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
        if (method === "OPTIONS") {
          res.statusCode = 204
          return res.end()
        }

        for (const fn of middlewares) {
          if (await fn(ctx) === false) return
        }

        const handlers = routes.get(method) || []
        for (const r of handlers) {
          const params = matchRoute(r.tokens, tokens)
          if (!params) continue
          ctx.params = params
          ctx.route = r.pattern
          try {
            await r.handler(ctx)
          } catch (e) {
            console.error(`[mock] ${method} ${path} ->`, e)
            if (!res.writableEnded) send(500, { error: "Internal Server Error", message: String((e && e.message) || e) })
          }
          return
        }

        send(404, { error: "Not Found", message: `No route for ${method} ${path}` })
      })
      server.listen(port, host, cb)
      return server
    },
  }

  for (const m of METHODS) app[m] = (pattern, handler) => addRoute(m, pattern, handler)

  return app
}

export { paginatePage, paginateCursor, uuid, nowIso, jsonBody }
