import { expect, test, type APIRequestContext } from "@playwright/test"

/**
 * Annual dividends/interest + YoY, end to end against the dockerized stack
 * (feature #253, sub-issue #260).
 *
 * The annual totals must equal the monthly and quarterly sums for the same
 * scope (one shared aggregation), the current year is labelled YTD, and a
 * missing prior-year denominator is shown as "—" rather than a fabricated 0%.
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

type Annual = { year: number; total: number; yoyChangePercent: number | null }

test("annual totals match the monthly/quarterly sums and the current year is YTD", async ({
  page,
  request,
}) => {
  await login(page)

  const headers = await auth(request)
  const res = await request.get(`${GATEWAY}/api/portfolios/charting/income?accounts=${TOP10}`, {
    headers,
  })
  expect(res.status(), await res.text()).toBe(200)
  const body = (await res.json()) as {
    annual: Annual[]
    monthly: Array<{ total: number }>
    quarterly: Array<{ total: number }>
  }
  expect(body.annual.length).toBeGreaterThan(0)

  const annualTotal = body.annual.reduce((s, p) => s + p.total, 0)
  const monthlyTotal = body.monthly.reduce((s, p) => s + p.total, 0)
  const quarterlyTotal = body.quarterly.reduce((s, p) => s + p.total, 0)
  expect(annualTotal).toBe(monthlyTotal)
  expect(annualTotal).toBe(quarterlyTotal)

  const currentYear = new Date().getUTCFullYear()
  const current = body.annual.find((p) => p.year === currentYear)
  expect(current, `no annual row for ${currentYear}`).toBeTruthy()
  // The seed has no prior-year facts, so the ratio must be undefined, not 0.
  expect(current!.yoyChangePercent).toBeNull()

  await page.goto("/en/charting/income")
  const chart = page.getByTestId("annual-income-chart")
  await expect(chart).toBeVisible()
  await expect(chart.locator("tbody tr")).toHaveCount(body.annual.length)
  await expect(chart.getByTestId("annual-ytd-note")).toBeVisible()

  const lastRow = chart.locator("tbody tr").last()
  await expect(lastRow).toContainText(String(currentYear))
  await expect(lastRow).toContainText("YTD")
  await expect(lastRow).toContainText("—")
})