import { expect, test, type APIRequestContext } from "@playwright/test"

/**
 * Cumulative external owner contributions per account, end to end against the
 * dockerized stack (feature #253, sub-issue #278).
 *
 * Each account gets a running deposits-minus-withdrawals line; the combined
 * total is the per-day sum of every selected account. Internal transfers are
 * excluded because they are not owner funding.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

type ContributionPoint = {
  date: string
  net: number
  contributions: number
  withdrawals: number
  unknown: boolean
}
type ContributionSeries = { key: string; label: string; points: ContributionPoint[] }
type Cash = {
  coverage: { status: string; generation: number }
  cumulativeContributions: ContributionSeries[]
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

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

async function post(request: APIRequestContext, headers: Record<string, string>, path: string, data: unknown) {
  const res = await request.post(`${GATEWAY}${path}`, { headers, data })
  expect(res.status(), await res.text()).toBe(201)
}

async function cash(request: APIRequestContext, headers: Record<string, string>, query: string) {
  const res = await request.get(`${GATEWAY}/api/portfolios/charting/cash?${query}`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()) as Cash
}

test("cumulative contributions run per account and sum to a combined total", async ({ page, request }) => {
  await login(page)
  const headers = await auth(request)

  const run = Date.now()
  const a = await createPortfolio(request, headers, `E2E-Cum-A-${run}`)
  const b = await createPortfolio(request, headers, `E2E-Cum-B-${run}`)
  const year = new Date().getUTCFullYear()

  await post(request, headers, `/api/portfolios/${a}/cash/deposits`, { amount: 1000, currency: "USD", transactionDate: `${year}-01-01` })
  await post(request, headers, `/api/portfolios/${a}/cash/withdrawals`, { amount: 200, currency: "USD", transactionDate: `${year}-02-01` })
  await post(request, headers, `/api/portfolios/${b}/cash/deposits`, { amount: 300, currency: "USD", transactionDate: `${year}-01-15` })

  for (const pf of [a, b]) {
    const recomputed = await request.post(`${GATEWAY}/api/portfolios/${pf}/recompute`, { headers })
    expect(recomputed.status(), await recomputed.text()).toBe(200)
  }

  let both: Cash | null = null
  await expect
    .poll(async () => {
      const c = await cash(request, headers, `accounts=${a},${b}`)
      if (c.coverage.status === "complete" && (c.cumulativeContributions?.length ?? 0) > 0) {
        both = c
        return true
      }
      return false
    }, { timeout: 30_000 })
    .toBe(true)

  const series = both!.cumulativeContributions
  const aLine = series.find((s) => s.key === a)
  expect(aLine, JSON.stringify(series)).toBeTruthy()
  const aPoints = aLine!.points
  expect(aPoints).toEqual([
    { date: `${year}-01-01`, net: 1000, contributions: 1000, withdrawals: 0, unknown: false },
    { date: `${year}-02-01`, net: 800, contributions: 1000, withdrawals: 200, unknown: false },
  ])

  const total = series.find((s) => s.key === "__total__")
  expect(total, JSON.stringify(series)).toBeTruthy()
  expect(total!.points).toEqual([
    { date: `${year}-01-01`, net: 1000, contributions: 1000, withdrawals: 0, unknown: false },
    { date: `${year}-01-15`, net: 1300, contributions: 1300, withdrawals: 0, unknown: false },
    { date: `${year}-02-01`, net: 1100, contributions: 1300, withdrawals: 200, unknown: false },
  ])

  await page.goto(`/en/charting/cash?accounts=${a},${b}`)
  const table = page.getByTestId("charting-cumulative-contributions-table")
  await expect(table).toBeVisible()
  await expect(table.locator("tbody tr")).toHaveCount(3)
  await expect(table.locator("tbody tr").filter({ hasText: "Total" })).toContainText("$1,100.00")
})