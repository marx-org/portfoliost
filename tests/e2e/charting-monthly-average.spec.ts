import { expect, test, type APIRequestContext } from "@playwright/test"

/**
 * Monthly-equivalent received income, end to end against the dockerized stack
 * (feature #253, sub-issue #262).
 *
 * The monthly-equivalent amount is the annual total ÷ 12 (not elapsed months),
 * the basis/divisor are explicit, and the current year is marked partial. It is
 * the same shared renderer/function as the daily-equivalent chart, configured
 * with unit=month. The UI is checked against the same API dataset.
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

type Average = { year: number; amount: number; divisor: number; basis: string; partial: boolean }

test("monthly-equivalent income is the annual total divided by 12", async ({ page, request }) => {
  await login(page)

  const headers = await auth(request)
  const res = await request.get(`${GATEWAY}/api/portfolios/charting/income?accounts=${TOP10}`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  const body = (await res.json()) as {
    annual: Array<{ year: number; total: number }>
    dailyAverageByYear: Average[]
    monthlyAverageByYear: Average[]
  }
  expect(body.monthlyAverageByYear.length).toBe(body.annual.length)
  for (let i = 0; i < body.annual.length; i++) {
    const annual = body.annual[i]
    const monthly = body.monthlyAverageByYear[i]
    expect(monthly.year).toBe(annual.year)
    expect(monthly.divisor).toBe(12)
    expect(monthly.basis).toBe("months")
    expect(monthly.amount).toBeCloseTo(annual.total / 12, 6)
  }
  // The two variants are configurations of the same renderer/function: the
  // monthly amount is exactly the daily amount × 365 / 12.
  for (let i = 0; i < body.annual.length; i++) {
    expect(body.monthlyAverageByYear[i].amount).toBeCloseTo(body.dailyAverageByYear[i].amount * (365 / 12), 6)
  }

  // The page is loaded with the SAME scope as the API call above.
  await page.goto(`/en/charting/income?accounts=${TOP10}`)
  const chart = page.getByTestId("annual-income-average-month")
  await expect(chart).toBeVisible()
  await page.getByTestId("annual-income-average-month-table-toggle").click()
  await expect(chart.locator("tbody tr")).toHaveCount(body.monthlyAverageByYear.length)
  await expect(chart.getByTestId("annual-average-partial")).toBeVisible()

  for (const monthly of body.monthlyAverageByYear) {
    const row = chart.locator("tbody tr").filter({ hasText: String(monthly.year) })
    await expect(row).toHaveCount(1)
    const cells = row.locator("td")
    await expect(cells.nth(1)).toHaveText(monthly.basis)
    await expect(cells.nth(2)).toHaveText(String(monthly.divisor))
    await expect(cells.nth(3)).toHaveText(String(monthly.amount))
  }
})