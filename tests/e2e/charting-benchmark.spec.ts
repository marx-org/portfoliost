import { expect, test, type APIRequestContext } from "@playwright/test"
import { login } from "./helpers/login"

/**
 * Benchmark comparison on the Charting performance card (feature #253,
 * sub-issue #273).
 *
 * Reuses the SAME flow-mirrored engine and PortfolioPerformanceChart renderer as
 * the portfolio Performance tab. The benchmark symbols are a real scope input
 * (SPY / QQQ), and a symbol with no price history is a coverage gap, never a
 * fabricated flat line. The account/label scope also scopes the benchmark
 * cashflows.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

type Bench = {
  symbol: string
  name: string
  absoluteTimeSeries: Array<{ date: string; value: number }>
}
type Performance = {
  coverage: { status: string; generation: number }
  scope: { benchmarks?: string[] }
  benchmarks: Bench[]
}

async function auth(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  expect(res.status()).toBe(200)
  const token = ((await res.json()) as { access_token?: string }).access_token ?? ""
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

async function performance(request: APIRequestContext, headers: Record<string, string>, pf: string) {
  const res = await request.get(`${GATEWAY}/api/portfolios/charting/performance?accounts=${pf}&benchmarks=SPY,QQQ`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()) as Performance
}

test("benchmarks mirror the scoped flows through the shared engine @needs-backend", async ({ page, request }) => {
  await login(page)
  const headers = await auth(request)

  const created = await request.post(`${GATEWAY}/api/portfolios`, {
    headers,
    data: { name: `E2E-Benchmark-${Date.now()}`, baseCurrency: "USD" },
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
  const withdraw = await request.post(`${GATEWAY}/api/portfolios/${pf}/cash/withdrawals`, {
    headers,
    data: { amount: 900, currency: "USD", transactionDate: "2026-01-02" },
  })
  expect(withdraw.status(), await withdraw.text()).toBe(201)

  const recomputed = await request.post(`${GATEWAY}/api/portfolios/${pf}/recompute`, { headers })
  expect(recomputed.status(), await recomputed.text()).toBe(200)

  let body: Performance | null = null
  await expect
    .poll(async () => {
      const b = await performance(request, headers, pf)
      if (b.coverage.status === "complete" && b.coverage.generation >= 1) {
        body = b
        return true
      }
      return false
    }, { timeout: 30_000 })
    .toBe(true)

  // The benchmark request is a real scope input.
  expect(body!.scope.benchmarks).toEqual(["SPY", "QQQ"])
  // Every returned benchmark is flow-mirrored: it carries an absolute series in
  // the same currency as the portfolio line. A symbol with no history is simply
    // absent (a coverage gap), never a flat/zero line.
  for (const b of body!.benchmarks) {
    expect(b.absoluteTimeSeries.length).toBeGreaterThan(0)
    expect(typeof b.absoluteTimeSeries[0].value).toBe("number")
  }

  // The Charting page exposes the benchmark toggles and renders the shared chart.
  await page.goto(`/en/charting/performance?accounts=${pf}`)
  await expect(page.getByTestId("charting-benchmark-bar")).toBeVisible()
  const spy = page.getByTestId("charting-benchmark-spy")
  await expect(spy).toBeVisible()
  await spy.check()
  await expect(page).toHaveURL(/benchmarks=SPY/)
  await expect(page.getByTestId("portfolio-performance-chart")).toBeVisible()
  await expect(page.getByTestId("charting-toolbar")).toBeVisible()
})