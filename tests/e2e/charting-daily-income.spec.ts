import { expect, test, type APIRequestContext } from "@playwright/test"
import { login } from "./helpers/login"

/**
 * Daily-equivalent received income, end to end against the dockerized stack
 * (feature #253, sub-issue #261).
 *
 * The daily-equivalent amount is the annual total ÷ 365 (not elapsed days), the
 * basis/divisor are explicit, and the current year is marked partial. The UI is
 * checked against the same API dataset.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"
const TOP10 = "3cb589d8-f92d-428f-aeab-9ee5d4b9cef2"

async function auth(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  expect(res.status()).toBe(200)
  const token = ((await res.json()) as { access_token?: string }).access_token ?? ""
  return { Authorization: `Bearer ${token}` }
}

type Average = { year: number; amount: number; divisor: number; basis: string; partial: boolean }

test("daily-equivalent income is the annual total divided by 365", async ({ page, request }) => {
  await login(page)

  const headers = await auth(request)
  const res = await request.get(`${GATEWAY}/api/portfolios/charting/income?accounts=${TOP10}`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  const body = (await res.json()) as {
    annual: Array<{ year: number; total: number }>
    dailyAverageByYear: Average[]
  }
  expect(body.dailyAverageByYear.length).toBe(body.annual.length)
  for (let i = 0; i < body.annual.length; i++) {
    const annual = body.annual[i]
    const daily = body.dailyAverageByYear[i]
    expect(daily.year).toBe(annual.year)
    expect(daily.divisor).toBe(365)
    expect(daily.basis).toBe("days")
    expect(daily.amount).toBeCloseTo(annual.total / 365, 6)
  }

  // The page is loaded with the SAME scope as the API call above. Leaving the
  // scope at "All" makes this spec read whatever portfolios previous specs
  // created (plan §48.4c isolation rule), so the UI and the API would not be
  // describing the same dataset.
  await page.goto(`/en/charting/income?accounts=${TOP10}`)
  const chart = page.getByTestId("annual-income-average-day")
  await expect(chart).toBeVisible()
  await page.getByTestId("annual-income-average-day-table-toggle").click()
  await expect(chart.locator("tbody tr")).toHaveCount(body.dailyAverageByYear.length)
  await expect(chart.getByTestId("annual-average-partial")).toBeVisible()

  for (const daily of body.dailyAverageByYear) {
    const row = chart.locator("tbody tr").filter({ hasText: String(daily.year) })
    await expect(row).toHaveCount(1)
    const cells = row.locator("td")
    await expect(cells.nth(1)).toHaveText(daily.basis)
    await expect(cells.nth(2)).toHaveText(String(daily.divisor))
    await expect(cells.nth(3)).toHaveText(String(daily.amount))
  }
})