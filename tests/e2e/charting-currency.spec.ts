import { expect, test, type APIRequestContext } from "@playwright/test"

/**
 * Currency-denomination proportions in comparable market value, end to end
 * against the dockerized stack (feature #253, sub-issue #266).
 *
 * The facts store each position in its account base, so the chart converts to a
 * single display currency BEFORE grouping by denomination — never a sum of
 * native USD + PLN. A USD stock and a PLN stock therefore produce two
 * denomination slices whose values are comparable and sum to the position total.
 * The exact 80/20 arithmetic is covered in wallets `allocation.test.ts`.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

type Slice = { key: string; label: string; value: number; percent: number | null; unknown: boolean }
type Allocation = { coverage: { status: string; generation: number }; byCurrency: Slice[]; byAssetType: Slice[] }

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

async function allocation(request: APIRequestContext, headers: Record<string, string>, pf: string) {
  const res = await request.get(`${GATEWAY}/api/portfolios/charting/allocation?accounts=${pf}`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()) as Allocation
}

test("currency slices are comparable and reconcile to the position total", async ({ page, request }) => {
  await login(page)
  const headers = await auth(request)

  const created = await request.post(`${GATEWAY}/api/portfolios`, {
    headers,
    data: { name: `E2E-Currency-${Date.now()}`, baseCurrency: "USD" },
  })
  expect(created.status(), await created.text()).toBeLessThan(300)
  const pf = String((await created.json() as { id: unknown }).id)

  // A USD stock and a PLN stock on the same USD-base account.
  for (const [symbol, currency, quantity, price] of [
    ["AAPL", "USD", 1, 150],
    ["SNT.WA", "PLN", 1, 100],
  ] as const) {
    const tx = await request.post(`${GATEWAY}/api/portfolios/${pf}/transactions`, {
      headers,
      data: { type: "BUY", symbol, currency, quantity, price, executedAt: "2026-06-01T12:00:00Z" },
    })
    expect(tx.status(), `${symbol}: ${await tx.text()}`).toBe(201)
  }

  const recomputed = await request.post(`${GATEWAY}/api/portfolios/${pf}/recompute`, { headers })
  expect(recomputed.status(), await recomputed.text()).toBe(200)

  let body: Allocation | null = null
  await expect
    .poll(async () => {
      const b = await allocation(request, headers, pf)
      if (b.coverage.status === "complete" && b.coverage.generation >= 1 && b.byCurrency.length >= 2) {
        body = b
        return true
      }
      return false
    }, { timeout: 30_000 })
    .toBe(true)

  const keys = body!.byCurrency.map((s) => s.key)
  expect(keys).toContain("USD")
  expect(keys).toContain("PLN")
  // Comparable values: the currency slices sum to the same position total as
  // byAssetType, and the weights sum to 100%.
  const ccySum = body!.byCurrency.reduce((s, r) => s + r.value, 0)
  const assetSum = body!.byAssetType.reduce((s, r) => s + r.value, 0)
  expect(ccySum).toBeCloseTo(assetSum, 4)
  const percent = body!.byCurrency.reduce((s, r) => s + (r.percent ?? 0), 0)
  expect(percent).toBeCloseTo(100, 1)

  // The page renders the same breakdown.
  await page.goto(`/en/charting/allocation?accounts=${pf}`)
  const table = page.getByTestId("charting-currency-allocation-table")
  await page.getByTestId("charting-currency-allocation-table-toggle").click()
  await expect(table).toBeVisible()
  await expect(table.locator("tbody tr", { hasText: "USD" })).toHaveCount(1)
  await expect(table.locator("tbody tr", { hasText: "PLN" })).toHaveCount(1)
})