import { expect, test, type APIRequestContext } from "@playwright/test"
import { login } from "./helpers/login"

/**
 * Current composition of all holdings, end to end against the dockerized stack
 * (feature #253, sub-issue #271).
 *
 * The composition is market value per instrument identity plus the scoped cash
 * balance, sorted descending. The same stock in two accounts aggregates, and the
 * table keeps every holding (including cash) even when the donut shows a top-N
 * plus Other. The exact grouping/negative-cash arithmetic is covered in wallets
 * `allocation.test.ts` and the SPA unit test.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

type Slice = { key: string; label: string; value: number; percent: number | null; unknown: boolean }
type Allocation = { coverage: { status: string; generation: number }; positions: Slice[] }

async function auth(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  expect(res.status()).toBe(200)
  const token = ((await res.json()) as { access_token?: string }).access_token ?? ""
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

async function allocation(request: APIRequestContext, headers: Record<string, string>, pf: string) {
  const res = await request.get(`${GATEWAY}/api/portfolios/charting/allocation?accounts=${pf}`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()) as Allocation
}

test("composition lists instrument identities plus cash, sorted descending @needs-backend", async ({ page, request }) => {
  await login(page)
  const headers = await auth(request)

  const created = await request.post(`${GATEWAY}/api/portfolios`, {
    headers,
    data: { name: `E2E-Composition-${Date.now()}`, baseCurrency: "USD" },
  })
  expect(created.status(), await created.text()).toBeLessThan(300)
  const pf = String((await created.json() as { id: unknown }).id)

  // Fund the account, then buy two stocks.
  const deposit = await request.post(`${GATEWAY}/api/portfolios/${pf}/cash/deposits`, {
    headers,
    data: { amount: 1000, currency: "USD", transactionDate: "2026-06-01" },
  })
  expect(deposit.status(), await deposit.text()).toBe(201)
  for (const [symbol, quantity, price] of [
    ["AAPL", 1, 150],
    ["MSFT", 1, 300],
  ] as const) {
    const tx = await request.post(`${GATEWAY}/api/portfolios/${pf}/transactions`, {
      headers,
      data: { type: "BUY", symbol, quantity, price, currency: "USD", executedAt: "2026-06-02T12:00:00Z" },
    })
    expect(tx.status(), `${symbol}: ${await tx.text()}`).toBe(201)
  }

  const recomputed = await request.post(`${GATEWAY}/api/portfolios/${pf}/recompute`, { headers })
  expect(recomputed.status(), await recomputed.text()).toBe(200)

  let body: Allocation | null = null
  await expect
    .poll(async () => {
      const b = await allocation(request, headers, pf)
      if (b.coverage.status === "complete" && b.coverage.generation >= 1 && b.positions.length > 0) {
        body = b
        return true
      }
      return false
    }, { timeout: 30_000 })
    .toBe(true)

  const keys = body!.positions.map((p) => p.key)
  expect(keys.some((k) => k.startsWith("STOCK|AAPL|"))).toBe(true)
  expect(keys.some((k) => k.startsWith("STOCK|MSFT|"))).toBe(true)
  expect(keys).toContain("CASH")
  // Sorted descending by value.
  for (let i = 1; i < body!.positions.length; i++) {
    expect(body!.positions[i - 1].value).toBeGreaterThanOrEqual(body!.positions[i].value)
  }

  // The page renders the full table.
  await page.goto(`/en/charting/allocation?accounts=${pf}`)
  const table = page.getByTestId("charting-holdings-composition-table")
  await page.getByTestId("charting-holdings-composition-table-toggle").click()
  await expect(table).toBeVisible()
  await expect(table.locator("tbody tr")).toHaveCount(body!.positions.length)
})