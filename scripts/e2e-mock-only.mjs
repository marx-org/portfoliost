// Runs the full Playwright e2e suite mock-only — no docker, no compose stack.
//
// Purpose (#141): prove as much of the e2e suite as possible passes against the
// static SPA + example-service-mock alone, so e2e can run in CI without the
// heavy wallets/instruments/admin/postgres/redis/openst backend.
//
// The mock is dumb, seed-driven data. Specs that need the backend to *derive*
// a result from positions/transactions the test just created (wallets logic) or
// that need external provider/IdP data are tagged `@needs-backend` and excluded
// here — they run only against the real stack (`npm run test:e2e`). What
// remains is the data-parity set: specs that should pass once the seed fixtures
// mirror the real backend responses.
//
// Usage: `node scripts/e2e-mock-only.mjs` (or `npm run test:e2e:mock`).
// Env: MOCK_ONLY_KEEP=1 to leave the servers up for debugging.

import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { readFile, writeFile, rm } from "node:fs/promises"
import { join, extname } from "node:path"
import { once } from "node:events"

const ROOT = new URL("..", import.meta.url).pathname
const MOCK_PORT = 4010
const STATIC_PORT = 3000
const BASE = `http://localhost:${STATIC_PORT}`
const API = `http://localhost:${MOCK_PORT}`

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2",
  ".ico": "image/x-icon", ".png": "image/png", ".webmanifest": "application/manifest+json",
}

function log(msg) { process.stdout.write(`[e2e-mock] ${msg}\n`) }

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`timed out waiting for ${url}`)
}

// Tiny static server for dist/ with SPA fallback. Also serves a real
// runtime-config.js so the auth spec's route-intercept has JS to extend.
async function serveDist() {
  const dist = join(ROOT, "dist")
  await writeFile(join(dist, "runtime-config.js"), "window.__OIDC_CONFIG__ = {};\n")
  const server = createServer(async (req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0])
    if (p === "/") p = "/index.html"
    // Reject traversal and any character outside a conservative URL-path set
    // before touching the filesystem. This early-return guard is the
    // sanitizer CodeQL's path-injection query recognises: readFile is only
    // reached when p is a safe, relative asset path.
    if (p.includes("..") || !/^\/[A-Za-z0-9._/-]*$/.test(p)) {
      res.statusCode = 403
      return res.end("forbidden")
    }
    const fp = join(dist, p)
    try {
      const buf = await readFile(fp)
      res.setHeader("content-type", MIME[extname(fp)] || "application/octet-stream")
      res.end(buf)
    } catch {
      try {
        const buf = await readFile(join(dist, "index.html"))
        res.setHeader("content-type", "text/html")
        res.end(buf)
      } catch { res.statusCode = 404; res.end("not found") }
    }
  })
  server.listen(STATIC_PORT)
  await once(server, "listening")
  return server
}

const children = []
function spawnBg(cmd, args, env) {
  const c = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: "inherit" })
  children.push(c)
  return c
}

let staticServer
try {
  log("building dist (mock API base, password login on)")
  const build = spawn("npm", ["run", "build:prepared"], {
    cwd: ROOT, stdio: "inherit",
    env: { ...process.env, VITE_API_BASE_URL: API, VITE_PASSWORD_LOGIN_ENABLED: "true" },
  })
  if ((await once(build, "exit"))[0] !== 0) throw new Error("build failed")

  staticServer = await serveDist()
  spawnBg("node", ["mocks/gateway/index.js"], { PORT: String(MOCK_PORT) })
  await waitFor(`${API}/health`)
  await waitFor(`${BASE}/en/login`)
  log(`mock ${API} + static ${BASE} up`)

  log("running e2e mock-only (excluding @needs-backend)")
  const run = spawn("npx", ["playwright", "test", "--grep-invert", "@needs-backend"], {
    cwd: ROOT, stdio: "inherit",
    env: {
      ...process.env,
      PORTFOLIOST_BASE_URL: BASE,
      PORTFOLIOST_GATEWAY_URL: API,
      PORTFOLIOST_MOCK_URL: API,
      // public-share.spec.ts calls the API base directly; point it at the mock.
      PORTFOLIOST_API_BASE_URL: API,
    },
  })
  const [code] = await once(run, "exit")
  process.exitCode = code ?? 1
} finally {
  if (process.env.MOCK_ONLY_KEEP === "1") {
    log("MOCK_ONLY_KEEP=1 — leaving servers up")
  } else {
    for (const c of children) c.kill("SIGTERM")
    staticServer?.close()
  }
}