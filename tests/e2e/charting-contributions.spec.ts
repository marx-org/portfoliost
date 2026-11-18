import { expect, test, type APIRequestContext } from "@playwright/test"

/**
 * Annual net external contributions, end to end against the dockerized stack
 * (feature #253, sub-issue #277).
 *
 * Deposits minus withdrawals is owner funding; BUY/SELL turnover is not funding.
 * A cash transfer between two selected accounts cancels in the whole-scope
 * total, but remains visible as a boundary transfer when only the sending
 * account is selected.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

type Contribution = {
  year: number
  contributions: number
  withdrawals: number
  net: number
  transfers: number
  partial: boolean
  unknown: boolean
}
type Cash = { coverage: { status: string; generation: number }; annualContributions: Contribution[] }

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

test("annual funding is deposits minus withdrawals, with boundary transfers kept separate", async ({ page, request }) => {
  await login(page)
  const headers = await auth(request)

  const run = Date.now()
  const a = await createPortfolio(request, headers, `E2E-Contrib-A-${run}`)
  const b = await createPortfolio(request, headers, `E2E-Contrib-B-${run}`)
  const year = new Date().getUTCFullYear()

  await post(request, headers, `/api/portfolios/${a}/cash/deposits`, {
    amount: 1000,
    currency: "USD",
    transactionDate: `${year}-01-01`,
  })
  await post(request, headers, `/api/portfolios/${a}/cash/withdrawals`, {
    amount: 200,
    currency: "USD",
    transactionDate: `${year}-02-01`,
  })
  await post(request, headers, `/api/portfolios/${b}/cash/deposits`, {
    amount: 50,
    currency: "USD",
    transactionDate: `${year}-01-01`,
  })
  await post(request, headers, `/api/portfolios/${a}/cash/transfers`, {
    toPortfolioId: b,
    amount: 100,
    currency: "USD",
    transactionDate: `${year}-03-01`,
  })

  for (const pf of [a, b]) {
    const recomputed = await request.post(`${GATEWAY}/api/portfolios/${pf}/recompute`, { headers })
    expect(recomputed.status(), await recomputed.text()).toBe(200)
  }

  let both: Cash | null = null
  await expect
    .poll(async () => {
      const c = await cash(request, headers, `accounts=${a},${b}`)
      if (c.coverage.status === "complete" && c.annualContributions.length > 0) {
        both = c
        return true
      }
      return false
    }, { timeout: 30_000 })
    .toBe(true)

  const bothRow = both!.annualContributions.find((p) => p.year === year)
  expect(bothRow, JSON.stringify(both)).toBeTruthy()
  expect(bothRow!.contributions).toBe(1050)
  expect(bothRow!.withdrawals).toBe(200)
  expect(bothRow!.net).toBe(850)
  // A→B is internal for the two-account scope.
  expect(bothRow!.transfers).toBe(0)

  const onlyA = await cash(request, headers, `accounts=${a}`)
  const aRow = onlyA.annualContributions.find((p) => p.year === year)
  expect(aRow, JSON.stringify(onlyA)).toBeTruthy()
  expect(aRow!.contributions).toBe(1000)
  expect(aRow!.withdrawals).toBe(200)
  expect(aRow!.net).toBe(800)
  // The same transfer crosses A's boundary and is not owner funding.
  expect(aRow!.transfers).toBe(-100)

  await page.goto(`/en/charting/cash?accounts=${a}`)
  const table = page.getByTestId("charting-annual-contributions-table")
  await expect(table).toBeVisible()
  await expect(table.locator("tbody tr")).toHaveCount(1)
  await expect(table.locator("tbody tr").first()).toContainText("$800.00")
  await expect(table.locator("tbody tr").first()).toContainText("-$100.00")
})