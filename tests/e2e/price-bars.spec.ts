import { expect, test } from "@playwright/test"

// price-data-architecture H3 — GET /api/instruments/:symbol/price-bars
// Verifies the read-through daily close-price series endpoint against the
// full compose stack (instruments container + pricebars-sim seeded stooq stand-in).
//
// The sim seeds: AAPL stooq_daily_us rows with a 4:1 split_adjustment (factor 0.25),
// so the view returns split-adjusted closes.  Cachest is unavailable for the mock
// symbols, so `stale: true` is expected (gap-fill attempted, circuit-breaker trips,
// stale DB data served — this is the correct fallback).

function localUrl(value: string | undefined, fallback: string): string {
  const url = new URL(value || fallback)
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("E2E endpoints must target the local compose stack")
  }
  return url.origin
}

const GATEWAY = localUrl("http://localhost:8080", "http://localhost:8080")

async function getBearerToken(): Promise<string> {
  const MOCK_URL = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"
  const res = await fetch(`${MOCK_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo@example.com", password: "example-service-mock" }),
  })
  const body = (await res.json()) as { access_token?: string }
  return body.access_token ?? ""
}

test("GET /api/instruments/AAPL/price-bars returns a valid series", async ({ request }) => {
  const token = await getBearerToken()
  const res = await request.get(
    `${GATEWAY}/api/instruments/AAPL/price-bars?from=2026-07-28&to=2026-07-31`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(res.status()).toBe(200)

  const body = (await res.json()) as {
    symbol: string
    timeframe: string
    stale: boolean
    currency: string | null
    dates: string[]
    closes: number[]
  }

  expect(body.symbol).toBe("AAPL")
  expect(body.timeframe).toBe("daily")
  expect(typeof body.stale).toBe("boolean")
  expect(Array.isArray(body.dates)).toBe(true)
  expect(Array.isArray(body.closes)).toBe(true)
  expect(body.dates.length).toBe(body.closes.length)

  // pricebars-sim seeds AAPL with a 4:1 split_adjustment (factor 0.25):
  //   2026-07-29: 230.5 * 0.25 = 57.625
  //   2026-07-30: 232.1 * 0.25 = 58.025
  const idx29 = body.dates.indexOf("2026-07-29")
  expect(idx29).toBeGreaterThanOrEqual(0)
  expect(body.closes[idx29]).toBeCloseTo(57.625, 3)

  const idx30 = body.dates.indexOf("2026-07-30")
  expect(idx30).toBeGreaterThanOrEqual(0)
  expect(body.closes[idx30]).toBeCloseTo(58.025, 3)
})

test("GET /api/instruments/AAPL/price-bars returns 401 without auth", async ({ request }) => {
  const res = await request.get(
    `${GATEWAY}/api/instruments/AAPL/price-bars?from=2026-07-28&to=2026-07-31`,
  )
  expect(res.status()).toBe(401)
})

test("GET /api/instruments/AAPL/price-bars returns 400 for invalid date params", async ({
  request,
}) => {
  const token = await getBearerToken()
  const res = await request.get(
    `${GATEWAY}/api/instruments/AAPL/price-bars?from=bad&to=date`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(res.status()).toBe(400)
})
