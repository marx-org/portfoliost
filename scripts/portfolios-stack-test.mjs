#!/usr/bin/env node
/**
 * Stack-level contract checks for the portfolios surface (plan §15).
 * Runs against the wallets module in docker compose (host port 3002) —
 * mirrors scripts/wallets-stack-test.mjs.
 *
 * Phase A+B+C: health/meta + CRUD + transaction round-trips.
 * Will grow as Phases D–L ship endpoints.
 *
 * Usage: node scripts/portfolios-stack-test.mjs [baseUrl]
 */
function localUrl(value, fallback) {
  const url = new URL(value ?? fallback)
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("stack-test endpoints must target the local compose stack")
  }
  return url.origin
}

const BASE = localUrl(process.argv[2], "http://localhost:3002")

let passed = 0
const failures = []

function check(name, cond, detail = "") {
  if (cond) passed++
  else failures.push(name)
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

  // ── Phase C: transaction CRUD round-trip ─────────────────────────────

  // BUY
  const buy = await req(`/api/portfolios/${pid}/transactions`, {
    method: "POST",
    headers: H,
    body: { type: "BUY", symbol: "AAPL", quantity: 10, price: 150, currency: "USD" },
  })
  check("POST /:id/transactions BUY → 201", buy.status === 201, `got ${buy.status}`)
  check("BUY has position created", !!buy.json?.position)
  const buyTxId = buy.json?.id
  check("BUY has id", !!buyTxId)

  // Detail now shows position
  const detailAfterBuy = await req(`/api/portfolios/${pid}`, { headers: H })
  check("position exists after BUY", detailAfterBuy.json?.positions?.length === 1)

  // SELL partial
  const sell = await req(`/api/portfolios/${pid}/transactions`, {
    method: "POST",
    headers: H,
    body: { type: "SELL", symbol: "AAPL", quantity: 5, price: 170, currency: "USD" },
  })
  check("POST /:id/transactions SELL → 201", sell.status === 201, `got ${sell.status}`)
  check("SELL has realizedGainLoss", typeof sell.json?.realizedGainLoss === "number")

  // SELL more than owned → 422
  const sellOver = await req(`/api/portfolios/${pid}/transactions`, {
    method: "POST",
    headers: H,
    body: { type: "SELL", symbol: "AAPL", quantity: 999, price: 170, currency: "USD" },
  })
  check("SELL more than owned → 422", sellOver.status === 422, `got ${sellOver.status}`)

  // PATCH transaction
  if (buyTxId) {
    const patchTx = await req(`/api/portfolios/${pid}/transactions/${buyTxId}`, {
      method: "PATCH",
      headers: H,
      body: { quantity: 12 },
    })
    check("PATCH /:id/transactions/:txId → 200", patchTx.status === 200, `got ${patchTx.status}`)
  }

  // DIVIDEND
  const div = await req(`/api/portfolios/${pid}/transactions`, {
    method: "POST",
    headers: H,
    body: { type: "DIVIDEND", symbol: "AAPL", quantity: 1, price: 2.5, currency: "USD" },
  })
  check("POST /:id/transactions DIVIDEND → 201", div.status === 201, `got ${div.status}`)
  check("DIVIDEND type", div.json?.type === "DIVIDEND")

  // DELETE transaction (DIVIDEND — no position reversal needed)
  if (div.json?.id) {
    const delTx = await req(`/api/portfolios/${pid}/transactions/${div.json.id}`, {
      method: "DELETE",
      headers: H,
    })
    check("DELETE /:id/transactions/:txId → 204", delTx.status === 204, `got ${delTx.status}`)
  }

  // Delete empty portfolio → blocked (has transactions)
  const delBlocked = await req(`/api/portfolios/${pid}`, { method: "DELETE", headers: H })
  check("DELETE portfolio with transactions → 409", delBlocked.status === 409, `got ${delBlocked.status}`)

  // Delete remaining transactions to allow portfolio deletion
  const remaining = await req(`/api/portfolios/${pid}/transactions`, { method: "GET", headers: H })
  // Not listable via GET directly, so use detail
  const detailFinal = await req(`/api/portfolios/${pid}`, { headers: H })

  // Actually clean up: delete portfolio (with transactions) isn't possible, so create a clean one
  const clean = await req("/api/portfolios", {
    method: "POST",
    headers: H,
    body: { name: "Clean", currency: "USD" },
  })
  const cleanPid = clean.json?.id
  if (cleanPid) {
    const delClean = await req(`/api/portfolios/${cleanPid}`, { method: "DELETE", headers: H })
    check("DELETE empty portfolio → 204", delClean.status === 204, `got ${delClean.status}`)
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
