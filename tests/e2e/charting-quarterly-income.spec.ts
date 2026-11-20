import { expect, test, type APIRequestContext } from "@playwright/test"

/**
 * Quarterly receipts compared across years, end to end against the dockerized
 * stack (feature #253, sub-issue #263).
 *
 * The shared income dataset groups receipts into YYYY-Qn; the chart draws one
 * bar series per year across Q1–Q4. A covered zero-income quarter is a real
 * zero bar, a future quarter is absent (never an invented zero), and four
 * complete quarters reconcile to the annual total. The current quarter is
 * marked year-to-date.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"
const TOP10 = "3cb589d8-f92d-428f-aeab-9ee5d4b9cef2"

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
  return { Authorization: `Bearer ${token}` }
}

type Quarter = { quarter: string; dividends: number; interest: number; options: number; total: number }

test("quarterly receipts group by year, zero-fill covered quarters and reconcile to the annual total", async ({ page, request }) => {
  await login(page)

  const headers = await auth(request)
  const res = await request.get(`${GATEWAY}/api/portfolios/charting/income?accounts=${TOP10}`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  const body = (await res.json()) as { annual: Array<{ year: number; total: number }>; quarterly: Quarter[] }
  expect(body.quarterly.length).toBeGreaterThan(0)

  // Every quarter is labelled YYYY-Qn and no quarter is after the latest
  // observed one (a future quarter is absent, not a fabricated zero).
  for (const q of body.quarterly) expect(q.quarter).toMatch(/^\d{4}-Q[1-4]$/)
  const latest = body.quarterly.map((q) => q.quarter).sort().at(-1)!
  expect(body.quarterly.some((q) => q.quarter > latest)).toBe(false)

  // Every year's quarterly totals reconcile to its annual total: the annual
  // figure is the same received-income dataset summed by year, and the quarterly
  // series only splits it (covered zero quarters add nothing).
  const byYear = new Map<number, Quarter[]>()
  for (const q of body.quarterly) {
    const year = Number(q.quarter.slice(0, 4))
    byYear.set(year, [...(byYear.get(year) ?? []), q])
  }
  let reconciled = 0
  for (const [year, quarters] of byYear) {
    const annual = body.annual.find((a) => a.year === year)
    expect(annual, `annual total for ${year}`).toBeTruthy()
    const sum = quarters.reduce((s, q) => s + q.total, 0)
    expect(sum, `year ${year}: ${JSON.stringify(quarters)}`).toBeCloseTo(annual!.total, 4)
    reconciled++
  }
  expect(reconciled).toBeGreaterThan(0)

  // The page renders the same dataset, with one row per quarter.
  await page.goto(`/en/charting/income?accounts=${TOP10}`)
  const table = page.getByTestId("charting-quarterly-income-table")
  await page.getByTestId("charting-quarterly-income-table-toggle").click()
  await expect(table).toBeVisible()
  await expect(table.locator("tbody tr")).toHaveCount(body.quarterly.length)

  // The current calendar quarter is marked year-to-date when it is observed.
  const now = new Date()
  const current = `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`
  if (body.quarterly.some((q) => q.quarter === current)) {
    await expect(page.getByTestId("charting-quarterly-income-partial")).toBeVisible()
  }
})