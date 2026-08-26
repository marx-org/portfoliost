#!/usr/bin/env node
/**
 * Stack-level contract checks for the portfolios surface (plan §15).
 * Runs against the wallets module in docker compose (host port 3002) —
 * mirrors scripts/wallets-stack-test.mjs.
 *
 * Phase A+B: health/meta + CRUD round-trip.
 * Will grow as Phases C–L ship endpoints.
 *
 * Usage: node scripts/portfolios-stack-test.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://localhost:3002"

let passed = 0
const failures = []

function check(name, cond, detail = "") {
  if (cond) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

async function req(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {}
  return { status: res.status, json }
}

async function main() {
  console.log(`# portfolios stack test against ${BASE}`)

  // ── identity + health ────────────────────────────────────────────────
  const meta = await req("/__meta")
  check("meta.service=wallets", meta.json?.service === "wallets", JSON.stringify(meta.json))
  check("meta.impl=real", meta.json?.impl === "real")

  const health = await fetch(`${BASE}/health`)
  check("health 200", health.status === 200)

  const H = {
    "X-User-Id": "00000000-0000-4000-8000-000000000001",
    "X-User-Email": "stack@test.dev",
  }

  // auth required on portfolio endpoints
  const noAuth = await req("/api/portfolios")
  check("portfolios require identity", noAuth.status === 401, `got ${noAuth.status}`)

  // ── Phase B: portfolio CRUD round-trip ───────────────────────────────

  // Create
  const create = await req("/api/portfolios", {
    method: "POST",
    headers: H,
    body: { name: "Stack Test Portfolio", currency: "USD" },
  })
  check("POST /api/portfolios → 201", create.status === 201, `got ${create.status}`)
  const pid = create.json?.id
  check("created portfolio has id", !!pid)
  check("created portfolio has currency USD", create.json?.currency === "USD")

  // Missing currency → 422
  const noCurrency = await req("/api/portfolios", {
    method: "POST",
    headers: H,
    body: { name: "No CCY" },
  })
  check("POST without currency → 422", noCurrency.status === 422, `got ${noCurrency.status}`)

  // List
  const list = await req("/api/portfolios", { headers: H })
  check("GET /api/portfolios → 200", list.status === 200, `got ${list.status}`)
  check("list is array", Array.isArray(list.json), `type=${typeof list.json}`)
  check("list contains created", list.json?.some((p) => p.id === pid))

  // Light
  const light = await req("/api/portfolios/light", { headers: H })
  check("GET /api/portfolios/light → 200", light.status === 200, `got ${light.status}`)
  check("light contains created", Array.isArray(light.json) && light.json.some((p) => p.id === pid))

  // Detail
  const detail = await req(`/api/portfolios/${pid}`, { headers: H })
  check("GET /:id → 200", detail.status === 200, `got ${detail.status}`)
  check("detail has metrics", !!detail.json?.metrics)
  check("detail has positions array", Array.isArray(detail.json?.positions))

  // Patch
  const patch = await req(`/api/portfolios/${pid}`, {
    method: "PATCH",
    headers: H,
    body: { name: "Renamed" },
  })
  check("PATCH /:id → 200", patch.status === 200, `got ${patch.status}`)
  check("name updated", patch.json?.name === "Renamed")

  // Delete empty → 204
  const del = await req(`/api/portfolios/${pid}`, { method: "DELETE", headers: H })
  check("DELETE empty → 204", del.status === 204, `got ${del.status}`)

  // Confirm gone
  const gone = await req(`/api/portfolios/${pid}`, { headers: H })
  check("after DELETE → 404", gone.status === 404, `got ${gone.status}`)

  console.log(`\n[stack] portfolios: ${passed} passed, ${failures.length} failed`)
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
