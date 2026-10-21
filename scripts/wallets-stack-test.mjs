#!/usr/bin/env node
/**
 * Stack-level contract checks for the wallets module (plan §11.11, §62).
 * Runs against the REAL module in docker compose (host port 3002) —
 * mirrors scripts/portfolios-stack-test.mjs.
 *
 * §62 moved cash from the (removed) `wallets`/`wallet_transactions` tables to
 * the portfolio-owned cash ledger (`portfolios.portfolio_cash_transactions`),
 * so this smoke now exercises the module's live surface: identity + health,
 * auth enforcement, and a portfolio cash-ledger round-trip (the module's
 * signature feature). The deeper portfolio/transaction CRUD lives in
 * scripts/portfolios-stack-test.mjs.
 *
 * Usage: node scripts/wallets-stack-test.mjs [baseUrl]
 */
function localUrl(value, fallback) {
  const url = new URL(value ?? fallback)
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("stack-test endpoints must target the local compose stack")
  }
  return url.origin
}

const BASE = localUrl("http://localhost:3002", "http://localhost:3002")

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
  console.log(`# wallets stack test against ${BASE}`)

  // identity (D4)
  const meta = await req("/__meta")
  check("meta.service=wallets", meta.json?.service === "wallets", JSON.stringify(meta.json))
  check("meta.impl=real", meta.json?.impl === "real")

  // health
  const health = await fetch(`${BASE}/health`)
  check("health 200", health.status === 200)

  const H = { "X-User-Id": "stack-test-user", "X-User-Email": "stack@test.dev" }

  // auth required
  const noAuth = await req("/api/portfolios")
  check("portfolios require identity", noAuth.status === 401, `got ${noAuth.status}`)

  // create a throwaway portfolio (base_currency is the single portfolio currency, §62)
  const create = await req("/api/portfolios", {
    method: "POST",
    headers: H,
    body: { name: "Stack Cash Smoke", baseCurrency: "USD" },
  })
  check("POST /api/portfolios → 201", create.status === 201, `got ${create.status}`)
  const pid = create.json?.id
  check("created portfolio has id", !!pid)
  check("created portfolio baseCurrency USD", create.json?.baseCurrency === "USD")

  // list contains created
  const list = await req("/api/portfolios", { headers: H })
  check("list contains created", Array.isArray(list.json) && list.json.some((p) => p.id === pid))

  // cash-ledger round-trip: deposit → balance reflects it (derived, never stored)
  const deposit = await req(`/api/portfolios/${pid}/cash/deposits`, {
    method: "POST",
    headers: H,
    body: { amount: 500, currency: "USD" },
  })
  check("POST /:id/cash/deposits → 201", deposit.status === 201, `got ${deposit.status} ${JSON.stringify(deposit.json)}`)
  check("deposit is a DEPOSIT", deposit.json?.type === "DEPOSIT")

  const cash = await req(`/api/portfolios/${pid}/cash`, { headers: H })
  check("GET /:id/cash → 200", cash.status === 200, `got ${cash.status}`)
  check("cash baseCurrency USD", cash.json?.baseCurrency === "USD")
  const usd = cash.json?.balances?.find((b) => b.currency === "USD")
  check("cash balance reflects the deposit (500)", usd != null && Math.abs(usd.balance - 500) < 1e-6, JSON.stringify(cash.json?.balances))
  check("cash total ≈ 500", cash.json != null && Math.abs((cash.json.total ?? 0) - 500) < 1e-6)

  // best-effort cleanup: remove the cash leg, then the (now empty) portfolio
  if (deposit.json?.id) {
    await req(`/api/portfolios/cash/transactions/${deposit.json.id}`, { method: "DELETE", headers: H })
  }
  await req(`/api/portfolios/${pid}`, { method: "DELETE", headers: H })

  console.log(`\n[stack] wallets: ${passed} passed, ${failures.length} failed`)
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
