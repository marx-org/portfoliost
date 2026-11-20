import { expect, test, type APIRequestContext } from "@playwright/test"

/**
 * Sector weights and values, end to end against the dockerized stack (feature
 * #253, sub-issue #268).
 *
 * The chart uses the same scoped current-position facts as the allocation
 * endpoint: sectors stay separate, the slices sum to the position total, and an
 * unknown sector is exposed. The exact 60/40 arithmetic is covered in wallets
 * `allocation.test.ts`; this proves the route and the shared renderer agree on
 * real prices.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

type Slice = { key: string; label: string; value: number; percent: number | null }
type Allocation = { coverage: { status: string; generation: number }; bySector: Slice[]; byAssetType: Slice[] }

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

test("sector weights split sectors and reconcile to the position total", async ({ page, request }) => {
  await login(page)
  const headers = await auth(request)

  const created = await request.post(`${GATEWAY}/api/portfolios`, {
    headers,
    data: { name: `E2E-Sector-${Date.now()}`, baseCurrency: "USD" },
  })
  expect(created.status(), await created.text()).toBeLessThan(300)
  const pf = String((await created.json() as { id: unknown }).id)

  // AAPL (Consumer Electronics) and JPM (Banks) are different sectors.
  for (const [symbol, quantity, price] of [
    ["AAPL", 1, 150],
    ["JPM", 1, 200],
  ] as const) {
    const tx = await request.post(`${GATEWAY}/api/portfolios/${pf}/transactions`, {
      headers,
      data: { type: "BUY", symbol, quantity, price, currency: "USD", executedAt: "2026-06-01T12:00:00Z" },
    })
    expect(tx.status(), `${symbol}: ${await tx.text()}`).toBe(201)
  }

  const recomputed = await request.post(`${GATEWAY}/api/portfolios/${pf}/recompute`, { headers })
  expect(recomputed.status(), await recomputed.text()).toBe(200)

  let body: Allocation | null = null
  await expect
    .poll(async () => {
      const b = await allocation(request, headers, pf)
      if (b.coverage.status === "complete" && b.coverage.generation >= 1 && b.bySector.length >= 2) {
        body = b
        return true
      }
      return false
    }, { timeout: 30_000 })
    .toBe(true)

  expect(body!.bySector.length).toBeGreaterThanOrEqual(2)
  // The sector slices are a partition of the same position universe as
  // byAssetType, so both sum to the same total.
  const sectorSum = body!.bySector.reduce((s, r) => s + r.value, 0)
  const assetSum = body!.byAssetType.reduce((s, r) => s + r.value, 0)
  expect(sectorSum).toBeCloseTo(assetSum, 4)
  const percent = body!.bySector.reduce((s, r) => s + (r.percent ?? 0), 0)
  expect(percent).toBeCloseTo(100, 1)

  // The page renders the same breakdown.
  await page.goto(`/en/charting/allocation?accounts=${pf}`)
  const table = page.getByTestId("charting-sector-allocation-table")
  // Tables are collapsed by default, so only the chart is visible until expanded.
  await expect(table.locator("tbody")).toBeHidden()
  await page.getByTestId("charting-sector-allocation-table-toggle").click()
  await expect(table).toBeVisible()
  await expect(table.locator("tbody tr")).toHaveCount(body!.bySector.length)
})