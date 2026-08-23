#!/usr/bin/env node
// Step I9 — module stack test: contract-shape checks for every instruments
// endpoint through the nginx gateway, plus a distinguishing check that
// detects whether /api/instruments is served by the real module stack
// (instruments+cachest+openst) or by example-service-mock.
//
// Usage:
//   node scripts/instruments-stack-test.mjs [real|mock|any]
//
// Prereqs: docker compose up -d gateway (and, for real mode,
// instruments openst cachest redis). Gateway listens on :8080.

const GATEWAY = process.env.STACK_TEST_GATEWAY ?? "http://localhost:8080"
const SYMBOL = process.env.STACK_TEST_SYMBOL ?? "AAPL"
const expectedMode = process.argv[2] ?? "any"
if (!["real", "mock", "any"].includes(expectedMode)) {
  console.error(`usage: node scripts/instruments-stack-test.mjs [real|mock|any]`)
  process.exit(2)
}

const HEADERS = {
  // Real module stack authenticates via X-User-* headers in compose; the
  // example-service-mock authenticates via its static bearer token. Send both.
  "X-User-Id": "stack-test-user",
  "X-User-Email": "stack-test@example.com",
  Authorization: `Bearer ${process.env.EXAMPLE_SERVICE_MOCK_TOKEN ?? "mock-dev-token"}`,
}

let failures = 0
let checks = 0

function check(name, ok, detail = "") {
  checks++
  if (ok) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

async function get(path) {
  const res = await fetch(`${GATEWAY}${path}`, { headers: HEADERS })
  let body = null
  try {
    body = await res.json()
  } catch {
    /* non-json */
  }
  return { status: res.status, body }
}

function expectKeys(name, body, keys) {
  const missing = keys.filter((k) => !(k in (body ?? {})))
  check(name, missing.length === 0, `missing keys: ${missing.join(", ")}`)
}

function expectArray(name, body, path, minLength) {
  const value = path.split(".").reduce((acc, k) => acc?.[k], body)
  check(
    name,
    Array.isArray(value) && value.length >= minLength,
    `expected array.${path} length >= ${minLength}, got ${Array.isArray(value) ? value.length : typeof value}`,
  )
}

async function main() {
  console.log(`# instruments stack test against ${GATEWAY} (expect upstream: ${expectedMode})`)

  // ── core instrument surface ──────────────────────────────────────────
  let r = await get(`/api/instruments/${SYMBOL}`)
  if (r.status !== 200 || !r.body) {
    console.error(`FATAL: GET /api/instruments/${SYMBOL} → ${r.status}; is the stack up?`)
    process.exit(1)
  }
  expectKeys("detail keys", r.body, ["symbol", "name"])
  r = await get(`/api/instruments/${SYMBOL}/profile`)
  expectKeys("profile keys", r.body, ["ticker", "name", "country", "currency"])
  r = await get(`/api/instruments/${SYMBOL}/quote`)
  expectKeys("quote keys", r.body, ["symbol", "currentPrice"])
  check("quote has a price", Number.isFinite(r.body?.currentPrice))
  r = await get(`/api/instruments/${SYMBOL}/metrics`)
  expectKeys("metrics keys", r.body, ["metrics"])
  check("metrics payload has symbol", typeof r.body?.metrics?.metric === "object")
  r = await get(`/api/instruments/${SYMBOL}/overview-metrics`)
  expectKeys("overview-metrics keys", r.body, ["symbol", "marketCap"])
  r = await get(`/api/instruments/search?q=apple`)
  expectKeys("search keys", r.body, ["count", "results"])
  expectArray("search results", r.body, "results", 1)
  r = await get(`/api/instruments/${SYMBOL}/history?resolution=daily`)
  expectKeys("history keys", r.body, ["symbol", "closePrices", "timestamps"])

  // ── research endpoints (pt1/pt2/pt2b) ────────────────────────────────
  r = await get(`/api/instruments/${SYMBOL}/fundamentals`)
  expectKeys("fundamentals keys", r.body, ["financialHighlights"])
  expectArray("fundamentals incomeStatement", r.body, "financialHighlights.incomeStatement", 1)

  r = await get(`/api/instruments/${SYMBOL}/calendar`)
  expectKeys("calendar keys", r.body, ["earnings", "exDividend"])
  check("calendar arrays", Array.isArray(r.body?.earnings) && Array.isArray(r.body?.exDividend))

  r = await get(`/api/instruments/${SYMBOL}/dividends`)
  expectKeys("dividends keys", r.body, ["history"])
  const firstDiv = r.body?.history?.[0]
  check(
    "dividends row shape",
    firstDiv && typeof firstDiv.date === "string" && typeof firstDiv.amount === "number",
    JSON.stringify(firstDiv),
  )

  r = await get(`/api/instruments/${SYMBOL}/projections`)
  expectKeys("projections keys", r.body, ["priceTarget"])
  expectKeys("priceTarget keys", r.body?.priceTarget ?? {}, ["low", "mean", "high"])

  r = await get(`/api/instruments/${SYMBOL}/compare`)
  expectKeys("compare keys", r.body, ["symbol", "marketCap"])

  r = await get(`/api/instruments/${SYMBOL}/seasonality?years=5&metric=avg`)
  expectKeys("seasonality keys", r.body, ["symbol", "years", "metric", "monthly_returns"])
  check("12 monthly buckets", r.body?.monthly_returns?.length === 12)

  r = await get(`/api/instruments/${SYMBOL}/eps-surprises?quarters=8`)
  expectKeys("eps-surprises keys", r.body, ["annual", "quarterly"])

  r = await get(`/api/instruments/${SYMBOL}/peers`)
  expectKeys("peers keys", r.body, ["symbol", "items"])
  check("peers include self", r.body?.items?.[0]?.symbol === SYMBOL.toUpperCase())

  const irEvents = await get(`/api/instruments/${SYMBOL}/investor-relations`)
  check("ir events array", Array.isArray(irEvents.body))
  const irEvent = irEvents.body?.[0]
  if (irEvent) {
    expectKeys("ir event keys", irEvent, ["type", "id", "title", "date", "symbol"])
    const transcript = await get(
      `/api/instruments/${SYMBOL}/investor-relations/${encodeURIComponent(irEvent.id)}/transcript`,
    )
    expectKeys("ir transcript keys", transcript.body, ["id", "symbol", "participant", "transcript"])
  } else {
    check("ir event keys", false, "no events returned")
  }

  r = await get(`/api/instruments/${SYMBOL}/price?date=2026-08-19`)
  expectKeys("historical price keys", r.body, ["symbol", "date", "price"])

  // ── distinguishing check: real module vs mock ────────────────────────
  // The mock serves dividend history derived from seeded research data
  // (recent years only); the real stack serves full history from openst.
  const divs = await get(`/api/instruments/${SYMBOL}/dividends`)
  const dates = (divs.body?.history ?? []).map((h) => String(h.date)).filter((d) => /^\d{4}-/.test(d)).sort()
  const detected = dates.length > 0 && dates[0] < "2000-01-01" ? "real" : "mock"
  console.log(`# detected upstream: ${detected}`)
  if (expectedMode !== "any") {
    check(`upstream mode is ${expectedMode}`, detected === expectedMode)
  }

  console.log(`\n${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ""}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
