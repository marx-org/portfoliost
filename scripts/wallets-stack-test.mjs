#!/usr/bin/env node
/**
 * Stack-level contract checks for the wallets module (plan §11.11).
 * Runs against the REAL module in docker compose (host port 3002) —
 * mirrors scripts/instruments-stack-test.mjs.
 *
 * Usage: node scripts/wallets-stack-test.mjs [baseUrl]
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
  // identity (D4)
  const meta = await req("/__meta")
  check("meta.service=wallets", meta.json?.service === "wallets", JSON.stringify(meta.json))
  check("meta.impl=real", meta.json?.impl === "real")

  // health
  const health = await fetch(`${BASE}/health`)
  check("health 200", health.status === 200)

  const H = { "X-User-Id": "stack-test-user", "X-User-Email": "stack@test.dev" }

  // auth required
  const noAuth = await req("/api/wallets")
  check("wallets require identity", noAuth.status === 401, `got ${noAuth.status}`)

  // CRUD round-trip
  const create = await req("/api/wallets", {
    method: "POST",
    headers: H,
    body: { name: "Stack PLN", currency: "PLN" },
  })
  check("create 201", create.status === 201, `got ${create.status}`)
  const wid = create.json?.id
  check("currency echoed upper", create.json?.currency === "PLN")

  const list = await req("/api/wallets", { headers: H })
  check("list contains created", Array.isArray(list.json) && list.json.some((w) => w.id === wid))

  const deposit = await req(`/api/wallets/${wid}/deposits`, {
    method: "POST",
    headers: H,
    body: { amount: 500 },
  })
  check("deposit 201", deposit.status === 201, `got ${deposit.status} ${JSON.stringify(deposit.json)}`)

  // delete guard: non-empty wallet → 409
  const delBlocked = await req(`/api/wallets/${wid}`, { method: "DELETE", headers: H })
  check("guarded delete → 409", delBlocked.status === 409, `got ${delBlocked.status}`)

  // registry endpoint exists on the real module too
  const currencies = await req("/api/currencies")
  check(
    "currencies shape",
    currencies.json?.currencies?.length >= 1 && currencies.json.currencies[0].code,
    JSON.stringify(currencies.json)?.slice(0, 120),
  )

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
