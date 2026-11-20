import { expect, test, type APIRequestContext } from "@playwright/test"
import { login } from "./helpers/login"

/**
 * Cumulative dividends + interest, end to end against the dockerized stack
 * (feature #253, sub-issue #259).
 *
 * A narrow date window must still show the LIFETIME cumulative: the first
 * visible point carries the pre-window opening balance, a zero-receipt month is
 * flat, and options are excluded. The UI is checked against the same shared
 * dataset the API returns, so the two cannot drift.
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

type Cumulative = { date: string; dividends: number; interest: number; total: number; openingBalance: number }

test("cumulative income keeps the pre-window opening and is flat over a zero/options month", async ({
  page,
  request,
}) => {
  await login(page)

  // A window starting at the first of the month two months back leaves the
  // earliest seeded receipt before the window.
  const now = new Date()
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)).toISOString().slice(0, 10)

  const headers = await auth(request)
  const api = await request.get(
    `${GATEWAY}/api/portfolios/charting/income?accounts=${TOP10}&from=${from}`,
    { headers },
  )
  expect(api.status(), await api.text()).toBe(200)
  const body = (await api.json()) as { cumulative: Cumulative[] }
  const series = body.cumulative
  expect(series.length).toBeGreaterThanOrEqual(2)
  expect(series[0].openingBalance).toBeGreaterThan(0)

  // The last cumulative equals the opening plus the cumulative dividends+interest.
  const last = series[series.length - 1]
  expect(last.total).toBe(series[0].openingBalance + last.dividends + last.interest)
  // An in-window month with no dividends/interest leaves the curve flat.
  const flat = series.some((p, i) => i > 0 && p.total === series[i - 1].total)
  expect(flat).toBe(true)

  // The UI renders the same dataset: the opening label and one row per point.
  // Same scope as the API call above: the All page reads every portfolio,
  // including ones earlier specs created, so pin the scope explicitly.
  await page.goto(`/en/charting/income?accounts=${TOP10}&from=${from}`)
  const cumulative = page.getByTestId("cumulative-income-chart")
  await expect(cumulative).toBeVisible()
  await page.getByTestId("cumulative-income-chart-table-toggle").click()
  await expect(cumulative.getByTestId("cumulative-opening")).toContainText(String(series[0].openingBalance))
  await expect(cumulative.locator("tbody tr")).toHaveCount(series.length)
  const uiLastTotal = Number((await cumulative.locator("tbody tr").last().locator("td").nth(3).innerText()).trim())
  expect(uiLastTotal).toBe(last.total)
})