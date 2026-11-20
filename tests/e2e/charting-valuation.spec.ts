import { expect, test, type APIRequestContext } from "@playwright/test"
import { login } from "./helpers/login"

/**
 * Valuation, capital and cumulative income overlays, end to end against the
 * dockerized stack (feature #253, sub-issue #272).
 *
 * The chart is the SHARED PortfolioPerformanceChart with the informative
 * capital/income/option overlays. A 100 dividend paid into cash increases the
 * income overlay once and is NOT added again to portfolio value. The existing
 * value/invested series keep their meaning: invested is cumulative external net
 * contributions, not remaining basis.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

type Point = {
  date: string
  value: number
  invested: number | null
  capitalBasis: number | null
  cumulativeIncome: number | null
  cumulativeOptions: number | null
}
type Performance = { coverage: { status: string; generation: number }; series: Point[] }

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

test("valuation chart shows capital, invested and cumulative income overlays", async ({ page, request }) => {
  await login(page)
  const headers = await auth(request)

  const created = await request.post(`${GATEWAY}/api/portfolios`, {
    headers,
    data: { name: `E2E-Valuation-${Date.now()}`, baseCurrency: "USD" },
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

  // Withdraw the uninvested cash so the account opens at net zero and does not
  // perturb the All-scope combined-chart reconciliation.
  const withdraw = await request.post(`${GATEWAY}/api/portfolios/${pf}/cash/withdrawals`, {
    headers,
    data: { amount: 900, currency: "USD", transactionDate: "2026-01-02" },
  })
  expect(withdraw.status(), await withdraw.text()).toBe(201)

  const positionsRes = await request.get(`${GATEWAY}/api/portfolios/${pf}/positions`, { headers })
  const positionsBody = (await positionsRes.json()) as { positions?: Array<{ id: string; symbol?: string }> } | Array<{ id: string; symbol?: string }>
  const positions = Array.isArray(positionsBody) ? positionsBody : positionsBody.positions ?? []
  const aapl = positions.find((p) => p.symbol === "AAPL")
  expect(aapl, JSON.stringify(positions)).toBeTruthy()

  // A 100 dividend paid into cash.
  const div = await request.post(`${GATEWAY}/api/portfolios/${pf}/transactions`, {
    headers,
    data: { type: "DIVIDEND", symbol: "AAPL", positionId: aapl!.id, quantity: 1, price: 100, currency: "USD", executedAt: "2026-02-01T12:00:00Z" },
  })
  expect(div.status(), await div.text()).toBe(201)

  const recomputed = await request.post(`${GATEWAY}/api/portfolios/${pf}/recompute`, { headers })
  expect(recomputed.status(), await recomputed.text()).toBe(200)

  let body: Performance | null = null
  await expect
    .poll(async () => {
      const b = await performance(request, headers, pf)
      if (b.coverage.status === "complete" && b.coverage.generation >= 1 && b.series.length > 0) {
        body = b
        return true
      }
      return false
    }, { timeout: 30_000 })
    .toBe(true)

  const last = body!.series[body!.series.length - 1]
  // Invested is cumulative external net contributions (deposit 1000 − the 900
  // withdrawn after the buy), not remaining basis.
  expect(last.invested).toBe(100)
  // Capital basis is the remaining cost of the holding.
  expect(last.capitalBasis).toBeCloseTo(100, 4)
  // The dividend appears once in the income overlay...
  expect(last.cumulativeIncome).toBeCloseTo(100, 4)
  // ...and is NOT added again to portfolio value (value is the market value).
  expect(last.value).toBeGreaterThan(0)
  expect(last.value).not.toBeCloseTo((last.capitalBasis ?? 0) + (last.cumulativeIncome ?? 0), 2)

  // The Charting page renders the SHARED renderer with overlays.
  await page.goto(`/en/charting/performance?accounts=${pf}`)
  await expect(page.getByTestId("charting-valuation")).toBeVisible()
  await expect(page.getByTestId("portfolio-performance-chart")).toBeVisible()
  await expect(page.getByTestId("charting-toolbar")).toBeVisible()
})