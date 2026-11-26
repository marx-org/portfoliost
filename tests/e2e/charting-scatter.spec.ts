import { expect, test, type APIRequestContext } from "@playwright/test"
import { login } from "./helpers/login"

/**
 * Market value versus total profit scatter, end to end against the dockerized
 * stack (feature #253, sub-issue #275).
 *
 * x = current market value, y = total profit (realized + unrealized + received
 * dividends), one point per canonical instrument identity. The exact arithmetic
 * (unrealized −10 + realized 30 + dividends 5 = 25; closed at x=0) is covered
 * in wallets \`allocation.test.ts\`; this proves the route and the shared
 * renderer agree on a real holding.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

type Scatter = {
  symbol: string
  name: string | null
  assetType: string | null
  marketValue: number
  totalProfit: number
  realized: number | null
  unrealized: number | null
  dividends: number | null
}
type Performance = { coverage: { status: string; generation: number }; scatter: Scatter[] }

async function auth(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  expect(res.status()).toBe(200)
  const token = ((await res.json()) as { access_token?: string }).access_token ?? ""
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

async function performance(request: APIRequestContext, headers: Record<string, string>, pf: string) {
  const res = await request.get(`${GATEWAY}/api/portfolios/charting/performance?accounts=${pf}`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()) as Performance
}

test("scatter plots market value against realised+unrealized+dividends profit @needs-backend", async ({ page, request }) => {
  await login(page)
  const headers = await auth(request)

  const created = await request.post(`${GATEWAY}/api/portfolios`, {
    headers,
    data: { name: `E2E-Scatter-${Date.now()}`, baseCurrency: "USD" },
  })
  expect(created.status(), await created.text()).toBeLessThan(300)
  const pf = String((await created.json() as { id: unknown }).id)

  const deposit = await request.post(`${GATEWAY}/api/portfolios/${pf}/cash/deposits`, {
    headers,
    data: { amount: 1000, currency: "USD", transactionDate: "2026-01-01" },
  })
  expect(deposit.status(), await deposit.text()).toBe(201)
  const buy = await request.post(`${GATEWAY}/api/portfolios/${pf}/transactions`, {
    headers,
    data: { type: "BUY", symbol: "AAPL", quantity: 1, price: 100, currency: "USD", executedAt: "2026-01-02T12:00:00Z" },
  })
  expect(buy.status(), await buy.text()).toBe(201)

  const positionsRes = await request.get(`${GATEWAY}/api/portfolios/${pf}/positions`, { headers })
  const positionsBody = (await positionsRes.json()) as { positions?: Array<{ id: string; symbol?: string }> } | Array<{ id: string; symbol?: string }>
  const positions = Array.isArray(positionsBody) ? positionsBody : positionsBody.positions ?? []
  const aapl = positions.find((p) => p.symbol === "AAPL")
  expect(aapl, JSON.stringify(positions)).toBeTruthy()

  const div = await request.post(`${GATEWAY}/api/portfolios/${pf}/transactions`, {
    headers,
    data: { type: "DIVIDEND", symbol: "AAPL", positionId: aapl!.id, quantity: 1, price: 5, currency: "USD", executedAt: "2026-02-01T12:00:00Z" },
  })
  expect(div.status(), await div.text()).toBe(201)

  const recomputed = await request.post(`${GATEWAY}/api/portfolios/${pf}/recompute`, { headers })
  expect(recomputed.status(), await recomputed.text()).toBe(200)

  let body: Performance | null = null
  await expect
    .poll(async () => {
      const b = await performance(request, headers, pf)
      if (b.coverage.status === "complete" && b.coverage.generation >= 1 && b.scatter.length > 0) {
        body = b
        return true
      }
      return false
    }, { timeout: 30_000 })
    .toBe(true)

  const point = body!.scatter.find((p) => p.symbol.startsWith("STOCK|AAPL|"))
  expect(point, JSON.stringify(body!.scatter)).toBeTruthy()
  expect(point!.assetType).toBe("STOCK")
  expect(point!.marketValue).toBeGreaterThan(0)
  // profit = realized + unrealized + dividends
  expect(point!.totalProfit).toBeCloseTo(
    (point!.realized ?? 0) + (point!.unrealized ?? 0) + (point!.dividends ?? 0),
    4,
  )
  // The dividend is part of profit.
  expect(point!.dividends).toBeCloseTo(5, 4)

  // The Charting page renders the same table.
  await page.goto(`/en/charting/performance?accounts=${pf}`)
  const table = page.getByTestId("charting-profit-value-scatter-table")
  await page.getByTestId("charting-profit-value-scatter-table-toggle").click()
  await expect(table).toBeVisible()
  const rows = table.locator("tbody tr")
  await expect(rows).toHaveCount(body!.scatter.length)
  await expect(rows.filter({ hasText: "AAPL" })).toHaveCount(1)
})