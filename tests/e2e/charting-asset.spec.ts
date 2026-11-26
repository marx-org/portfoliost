import { expect, test, type APIRequestContext } from "@playwright/test"
import { login } from "./helpers/login"

/**
 * Asset-type proportions, end to end against the dockerized stack (feature #253,
 * sub-issue #267).
 *
 * The chart uses the same scoped current-position facts as the allocation
 * endpoint: stocks and bonds stay separate, the slices sum to the position
 * total, and an unknown type would be exposed rather than dropped. The exact
 * 80/20 arithmetic is covered in wallets `allocation.test.ts`; this proves the
 * route and the shared renderer agree on real prices.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

type Slice = { key: string; label: string; value: number; percent: number | null }
type Allocation = { coverage: { status: string; generation: number }; byAssetType: Slice[] }

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

test("asset-type proportions split stocks and bonds and reconcile to the total @needs-backend", async ({ page, request }) => {
  await login(page)
  const headers = await auth(request)

  const created = await request.post(`${GATEWAY}/api/portfolios`, {
    headers,
    data: { name: `E2E-Asset-Type-${Date.now()}`, baseCurrency: "USD" },
  })
  expect(created.status(), await created.text()).toBeLessThan(300)
  const pf = String((await created.json() as { id: unknown }).id)

  for (const [symbol, assetType, quantity, price] of [
    ["AAPL", "STOCK", 1, 150],
    ["BND", "BOND", 10, 100],
  ] as const) {
    const tx = await request.post(`${GATEWAY}/api/portfolios/${pf}/transactions`, {
      headers,
      data: { type: "BUY", symbol, assetType, quantity, price, currency: "USD", executedAt: "2026-06-01T12:00:00Z" },
    })
    expect(tx.status(), `${symbol}: ${await tx.text()}`).toBe(201)
  }

  const recomputed = await request.post(`${GATEWAY}/api/portfolios/${pf}/recompute`, { headers })
  expect(recomputed.status(), await recomputed.text()).toBe(200)

  let body: Allocation | null = null
  await expect
    .poll(async () => {
      const b = await allocation(request, headers, pf)
      if (b.coverage.status === "complete" && b.coverage.generation >= 1 && b.byAssetType.length > 0) {
        body = b
        return true
      }
      return false
    }, { timeout: 30_000 })
    .toBe(true)

  const keys = body!.byAssetType.map((s) => s.key)
  expect(keys).toContain("STOCK")
  expect(keys).toContain("BOND")
  // The asset-type slices are a partition of the position universe.
  const sum = body!.byAssetType.reduce((s, r) => s + r.value, 0)
  const percent = body!.byAssetType.reduce((s, r) => s + (r.percent ?? 0), 0)
  expect(sum).toBeGreaterThan(0)
  expect(percent).toBeCloseTo(100, 1)

  // The page renders the same breakdown.
  await page.goto(`/en/charting/allocation?accounts=${pf}`)
  const table = page.getByTestId("charting-asset-allocation-table")
  await page.getByTestId("charting-asset-allocation-table-toggle").click()
  await expect(table).toBeVisible()
  await expect(table.locator("tbody tr", { hasText: "STOCK" })).toHaveCount(1)
  await expect(table.locator("tbody tr", { hasText: "BOND" })).toHaveCount(1)
})