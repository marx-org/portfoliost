import { expect, test, type APIRequestContext } from "@playwright/test"
import { login } from "./helpers/login"

/**
 * Quarterly year-over-year income growth, end to end against the dockerized
 * stack (feature #253, sub-issue #264).
 *
 * A quarter is compared with the SAME quarter of the preceding year using the
 * shared quarterly series: 100→125 is +25%, 100→80 is −20%, and a zero/missing
 * prior quarter is undefined (no bar), never 0% or infinity. The current quarter
 * is shown as year-to-date against the prior full quarter.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

type Quarter = {
  quarter: string
  total: number
  priorYearQuarterTotal: number | null
  yoyChangePercent: number | null
}
type Income = { coverage: { status: string; generation: number }; quarterly: Quarter[] }

async function auth(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  expect(res.status()).toBe(200)
  const token = ((await res.json()) as { access_token?: string }).access_token ?? ""
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

async function income(request: APIRequestContext, headers: Record<string, string>, query: string) {
  const res = await request.get(`${GATEWAY}/api/portfolios/charting/income?${query}`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()) as Income
}

test("quarterly YoY compares the same quarter across years and leaves undefined growth undefined @needs-backend", async ({ page, request }) => {
  await login(page)
  const headers = await auth(request)

  const created = await request.post(`${GATEWAY}/api/portfolios`, {
    headers,
    data: { name: `E2E-Q-YoY-${Date.now()}`, baseCurrency: "USD" },
  })
  expect(created.status(), await created.text()).toBeLessThan(300)
  const pf = String((await created.json() as { id: unknown }).id)

  const tx = (data: Record<string, unknown>) =>
    request.post(`${GATEWAY}/api/portfolios/${pf}/transactions`, { headers, data })

  // Q1 2024 = 100, Q1 2025 = 125 → +25%. Q2 2024 has no receipt (covered zero),
  // Q2 2025 = 40 → undefined because the prior denominator is zero.
  expect((await tx({ type: "BUY", symbol: "AAPL", quantity: 10, price: 100, currency: "USD", executedAt: "2024-01-02T12:00:00Z" })).status()).toBe(201)
  expect((await tx({ type: "DIVIDEND", symbol: "AAPL", quantity: 1, price: 100, currency: "USD", executedAt: "2024-02-01T12:00:00Z" })).status()).toBe(201)
  expect((await tx({ type: "DIVIDEND", symbol: "AAPL", quantity: 1, price: 125, currency: "USD", executedAt: "2025-02-01T12:00:00Z" })).status()).toBe(201)
  expect((await tx({ type: "DIVIDEND", symbol: "AAPL", quantity: 1, price: 40, currency: "USD", executedAt: "2025-05-01T12:00:00Z" })).status()).toBe(201)

  const recomputed = await request.post(`${GATEWAY}/api/portfolios/${pf}/recompute`, { headers })
  expect(recomputed.status(), await recomputed.text()).toBe(200)

  let body: Income | null = null
  await expect
    .poll(async () => {
      const b = await income(request, headers, `accounts=${pf}`)
      if (b.coverage.status === "complete" && b.coverage.generation >= 1) {
        body = b
        return true
      }
      return false
    }, { timeout: 30_000 })
    .toBe(true)

  const q1_2025 = body!.quarterly.find((q) => q.quarter === "2025-Q1")
  expect(q1_2025, JSON.stringify(body!.quarterly)).toMatchObject({
    total: 125,
    priorYearQuarterTotal: 100,
    yoyChangePercent: 25,
  })

  const q2_2025 = body!.quarterly.find((q) => q.quarter === "2025-Q2")
  expect(q2_2025, JSON.stringify(body!.quarterly)).toMatchObject({
    total: 40,
    priorYearQuarterTotal: 0,
    yoyChangePercent: null,
  })

  // The page renders the compared years and the companion amounts.
  await page.goto(`/en/charting/income?accounts=${pf}`)
  const table = page.getByTestId("charting-quarterly-yoy-table")
  await page.getByTestId("charting-quarterly-yoy-table-toggle").click()
  await expect(table).toBeVisible()
  await expect(page.getByText("2025 vs 2024")).toBeVisible()
  await expect(table.locator("tbody tr", { hasText: "Q1" })).toHaveCount(1)
  const q1Row = table.locator("tbody tr", { hasText: "Q1" })
  await expect(q1Row).toContainText("125")
  await expect(q1Row).toContainText("100")
  await expect(q1Row).toContainText("25")
  // Q2 has a zero prior denominator → undefined, shown as an em dash.
  const q2Row = table.locator("tbody tr", { hasText: "Q2" })
  await expect(q2Row).toContainText("—")
})