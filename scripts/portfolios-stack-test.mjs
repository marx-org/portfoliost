#!/usr/bin/env node
/**
 * Stack-level contract checks for the portfolios surface (plan §15).
 * Runs against the wallets module in docker compose (host port 3002) —
 * mirrors scripts/wallets-stack-test.mjs.
 *
 * Phase A scaffold: health/meta + placeholder checks.
 * Will grow as Phases B–L ship endpoints.
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

  // ── Phase B: portfolio CRUD (placeholder — returns mock or 404 pre-flip) ──
  // These checks validate the endpoint is reachable and returns a valid shape.
  // Before the gateway flip (Phase F), the mock serves these; after flip, the
  // real module does. The check works either way.

  const list = await req("/api/portfolios", { headers: H })
  check("GET /api/portfolios reachable", list.status === 200, `got ${list.status}`)
  if (list.status === 200) {
    check(
      "portfolio list is array",
      Array.isArray(list.json),
      `type=${typeof list.json}`,
    )
  }

  const light = await req("/api/portfolios/light", { headers: H })
  check("GET /api/portfolios/light reachable", light.status === 200, `got ${light.status}`)
  if (light.status === 200 && Array.isArray(light.json)) {
    check(
      "light list has id+name+currency",
      light.json.length === 0 || (light.json[0].id && light.json[0].name && light.json[0].currency),
      `keys=${Object.keys(light.json[0] ?? {}).join(",")}`,
    )
  }

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
