import { expect, test, type APIRequestContext } from "@playwright/test"
import { login } from "./helpers/login"

/**
 * Broker cash balances through time, end to end against the dockerized stack
 * (feature #253, sub-issue #276).
 *
 * One line per selected real account from the canonical cashLedger replay, plus
 * a combined total. An internal A→B transfer reduces A and increases B while the
 * total is unchanged; an opening balance before the window is retained. The
 * exact opening/negative arithmetic is covered in wallets `cash.test.ts`.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

type Point = { date: string; balance: number }
type Series = { key: string; label: string; points: Point[] }
type Cash = { coverage: { status: string; generation: number }; balanceHistory: Point[]; series: Series[] }

async function auth(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  expect(res.status()).toBe(200)
  const token = ((await res.json()) as { access_token?: string }).access_token ?? ""
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

async function createPortfolio(request: APIRequestContext, headers: Record<string, string>, name: string) {
  const res = await request.post(`${GATEWAY}/api/portfolios`, { headers, data: { name, baseCurrency: "USD" } })
  expect(res.status(), await res.text()).toBeLessThan(300)
  return String((await res.json() as { id: unknown }).id)
}

async function deposit(request: APIRequestContext, headers: Record<string, string>, pf: string, amount: number) {
  const res = await request.post(`${GATEWAY}/api/portfolios/${pf}/cash/deposits`, {
    headers,
    data: { amount, currency: "USD", transactionDate: "2026-01-01" },
  })
  expect(res.status(), await res.text()).toBe(201)
}

async function cash(request: APIRequestContext, headers: Record<string, string>, query: string) {
  const res = await request.get(`${GATEWAY}/api/portfolios/charting/cash?${query}`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()) as Cash
}

test("per-account cash lines plus a total, with internal transfers cancelling", async ({ page, request }) => {
  await login(page)
  const headers = await auth(request)

  const run = Date.now()
  const a = await createPortfolio(request, headers, `E2E-Cash-A-${run}`)
  const b = await createPortfolio(request, headers, `E2E-Cash-B-${run}`)
  await deposit(request, headers, a, 100)
  await deposit(request, headers, b, 50)

  // A sends 40 to B.
  const transfer = await request.post(`${GATEWAY}/api/portfolios/${a}/cash/transfers`, {
    headers,
    data: { toPortfolioId: b, amount: 40, currency: "USD", transactionDate: "2026-02-01" },
  })
  expect(transfer.status(), await transfer.text()).toBe(201)

  // Publish charting facts for both accounts (the route reads the account set
  // from the projection).
  for (const pf of [a, b]) {
    const recomputed = await request.post(`${GATEWAY}/api/portfolios/${pf}/recompute`, { headers })
    expect(recomputed.status(), await recomputed.text()).toBe(200)
  }

  let body: Cash | null = null
  await expect
    .poll(async () => {
      const c = await cash(request, headers, `accounts=${a},${b}`)
      const total = c.series.find((s) => s.key === "__total__")
      if (c.coverage.status === "complete" && total && total.points.length > 0) {
        body = c
        return true
      }
      return false
    }, { timeout: 30_000 })
    .toBe(true)

  const seriesA = body!.series.find((s) => s.key === a)!
  const seriesB = body!.series.find((s) => s.key === b)!
  const total = body!.series.find((s) => s.key === "__total__")!
  expect(seriesA.points.at(-1)!.balance).toBe(60)
  expect(seriesB.points.at(-1)!.balance).toBe(90)
  // Internal transfer: total unchanged at 150.
  expect(total.points.at(-1)!.balance).toBe(150)
  expect(body!.balanceHistory).toEqual(total.points)

  // The Charting page renders the per-account lines.
  await page.goto(`/en/charting/cash?accounts=${a},${b}`)
  await expect(page.getByTestId("charting-cash-history")).toBeVisible()
  await expect(page.getByTestId("charting-cash-history-table").locator("tbody tr")).toHaveCount(3)
  await expect(page.getByTestId("charting-toolbar")).toBeVisible()
})