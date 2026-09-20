import { expect, test } from "@playwright/test"

const MOCK_URL = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"
const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK_HEADERS = { Authorization: `Bearer ${process.env.EXAMPLE_SERVICE_MOCK_TOKEN || "mock-dev-token"}` }
const REAL_HEADERS = {
  "X-User-Id": "no-price-e2e",
  "X-User-Email": "no-price@example.com",
  Authorization: `Bearer ${process.env.EXAMPLE_SERVICE_MOCK_TOKEN || "mock-dev-token"}`,
}

function round2(x) {
  return Math.round(x * 100) / 100
}

test("mock NoPrice portfolio has bond/crypto/fund current-price parity", async ({ request }) => {
  const res = await request.get(`${MOCK_URL}/api/portfolios`, { headers: MOCK_HEADERS })
  expect(res.status()).toBe(200)
  const portfolios = (await res.json()) as Array<{ id: string; name: string }>
  const np = portfolios.find((p) => p.name === "NoPrice")
  expect(np).toBeTruthy()

  const posRes = await request.get(`${MOCK_URL}/api/portfolios/${np!.id}/positions`, { headers: MOCK_HEADERS })
  expect(posRes.status()).toBe(200)
  const positions = (await posRes.json()) as Array<{
    symbol: string
    country: string
    instrumentCurrency: string
    quantity: number
    averageCostBasis: number
    currentPrice: number
    marketValue: number
    unrealizedGainLoss: number
  }>
  expect(positions).toHaveLength(3)
  expect(positions.some((p) => p.symbol === "ROD1033")).toBe(true)
  expect(positions.some((p) => p.symbol === "BTC-USD")).toBe(true)
  expect(positions.some((p) => p.symbol === "NNEP25")).toBe(true)

  for (const p of positions) {
    expect(p.country).toBe("Other")
    expect(p.currentPrice).toBeGreaterThan(0)
    expect(p.marketValue).toBe(round2(p.quantity * p.currentPrice))
    expect(p.unrealizedGainLoss).toBe(round2(p.quantity * (p.currentPrice - p.averageCostBasis)))

    const q = await request.get(`${MOCK_URL}/api/instruments/${encodeURIComponent(p.symbol)}/quote`, { headers: MOCK_HEADERS })
    expect(q.status()).toBe(200)
    const quote = (await q.json()) as { symbol: string; currentPrice: number; currency: string }
    expect(quote.symbol).toBe(p.symbol)
    expect(quote.currentPrice).toBe(p.currentPrice)
    expect(quote.currency).toBe(p.instrumentCurrency)

    const price = await request.get(`${MOCK_URL}/api/instruments/${encodeURIComponent(p.symbol)}/price`, { headers: MOCK_HEADERS })
    expect(price.status()).toBe(200)
    const priceBody = (await price.json()) as { symbol: string; price: number; currency: string }
    expect(priceBody.symbol).toBe(p.symbol)
    expect(priceBody.price).toBe(p.currentPrice)
    expect(priceBody.currency).toBe(p.instrumentCurrency)
  }
})

test("real stack routes the deterministic ROD1033 savings-bond quote", async ({ request }) => {
  const q = await request.get(`${GATEWAY}/api/instruments/ROD1033/quote`, { headers: REAL_HEADERS })
  expect(q.status()).toBe(200)
  const quote = (await q.json()) as { symbol: string; currentPrice: number; currency: string }
  expect(quote.symbol).toBe("ROD1033")
  expect(quote.currentPrice).toBeGreaterThan(100)
  expect(quote.currency).toBe("PLN")

  const price = await request.get(`${GATEWAY}/api/instruments/ROD1033/price`, { headers: REAL_HEADERS })
  expect(price.status()).toBe(200)
  const priceBody = (await price.json()) as { symbol: string; price: number; currency: string | null }
  expect(priceBody.symbol).toBe("ROD1033")
  expect(priceBody.price).toBeGreaterThan(100)
})
