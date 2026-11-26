import { expect, test, type APIRequestContext } from "@playwright/test"
import { login } from "./helpers/login"

/**
 * Dividend-stock category allocation, end to end against the dockerized stack
 * (feature #253, sub-issue #269).
 *
 * The category pie is VALUE-weighted over the STOCK-only universe: a stock the
 * user has not assigned lands in `not_classified`, and editing an assignment
 * moves exactly that stock's value between slices after a reload. The exact
 * 90/10 arithmetic is covered in wallets `allocation.test.ts`; this proves the
 * route, the shared renderer and the editor agree on real prices.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

async function auth(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  expect(res.status()).toBe(200)
  const token = ((await res.json()) as { access_token?: string }).access_token ?? ""
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

type Slice = { key: string; label: string; value: number; percent: number | null; unknown: boolean }
type Allocation = {
  coverage: { generation: number; status: string; missing: unknown[] }
  byAssetType: Slice[]
  byCategory: Slice[]
}

async function allocation(request: APIRequestContext, headers: Record<string, string>, pf: string) {
  const res = await request.get(`${GATEWAY}/api/portfolios/charting/allocation?accounts=${pf}`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()) as Allocation
}

test("category allocation is value-weighted, editable and survives a reload @needs-backend", async ({ page, request }) => {
  await login(page)
  const headers = await auth(request)

  const created = await request.post(`${GATEWAY}/api/portfolios`, {
    headers,
    data: { name: `E2E-Category-Alloc-${Date.now()}`, baseCurrency: "USD" },
  })
  expect(created.status(), await created.text()).toBeLessThan(300)
  const pf = String((await created.json() as { id: unknown }).id)

  // One AAPL and ten MSFT: one stock per category, but clearly different values
  // (MSFT's price is an order of magnitude above AAPL's), so a count pie would
  // show 50/50 while the value pie must not.
  for (const [symbol, quantity, price] of [["AAPL", 1, 150], ["MSFT", 10, 450]] as const) {
    const tx = await request.post(`${GATEWAY}/api/portfolios/${pf}/transactions`, {
      headers,
      data: { type: "BUY", symbol, quantity, price, currency: "USD", executedAt: "2026-06-01T12:00:00Z" },
    })
    expect(tx.status(), `${symbol}: ${await tx.text()}`).toBe(201)
  }

  const recomputed = await request.post(`${GATEWAY}/api/portfolios/${pf}/recompute`, { headers })
  expect(recomputed.status(), await recomputed.text()).toBe(200)

  // The rebuild runs behind the snapshot pass; poll the chart coverage.
  let initial: Allocation | null = null
  await expect
    .poll(async () => {
      const body = await allocation(request, headers, pf)
      if (body.coverage.status === "complete" && body.coverage.generation >= 1) {
        initial = body
        return true
      }
      return false
    }, { timeout: 30_000 })
    .toBe(true)

  const stockTotal = initial!.byAssetType.find((s) => s.key === "STOCK")?.value ?? 0
  expect(stockTotal).toBeGreaterThan(0)

  // Start from a known state: assignments are per user and other specs (or an
  // earlier run) may have set these symbols. `not_classified` is a real stored
  // category, so both stocks land in the bucket the unassigned state uses.
  const put = (symbol: string, category: string) =>
    request.put(`${GATEWAY}/api/portfolios/charting/stock-categories`, {
      headers,
      data: { symbol, instrumentCurrency: "USD", category },
    })
  for (const symbol of ["AAPL", "MSFT"]) {
    const res = await put(symbol, "not_classified")
    expect(res.status(), `${symbol}: ${await res.text()}`).toBe(200)
  }

  // Every unassigned/unclassified stock is exposed in not_classified, not
  // dropped, and the bucket covers the whole STOCK universe.
  const unclassified = await allocation(request, headers, pf)
  const notClassified = unclassified.byCategory.find((s) => s.key === "not_classified")
  expect(notClassified, JSON.stringify(unclassified.byCategory)).toBeTruthy()
  expect(notClassified!.value).toBeCloseTo(stockTotal, 4)

  const aaplPut = await put("AAPL", "balanced")
  expect(aaplPut.status(), await aaplPut.text()).toBe(200)
  const msftPut = await put("MSFT", "high_yield")
  expect(msftPut.status(), await msftPut.text()).toBe(200)

  const split = await allocation(request, headers, pf)
  const balanced = split.byCategory.find((s) => s.key === "balanced")
  const highYield = split.byCategory.find((s) => s.key === "high_yield")
  expect(balanced, JSON.stringify(split.byCategory)).toBeTruthy()
  expect(highYield, JSON.stringify(split.byCategory)).toBeTruthy()
  expect(balanced!.value).toBeGreaterThan(0)
  expect(highYield!.value).toBeGreaterThan(0)
  // Value-weighted: the slices sum to the STOCK total and are NOT 50/50 even
  // though each category holds exactly one stock.
  expect(balanced!.value + highYield!.value).toBeCloseTo(stockTotal, 4)
  expect(Math.abs((balanced!.percent ?? 0) - 50)).toBeGreaterThan(5)

  // The page renders the same dataset.
  await page.goto(`/en/charting/allocation?accounts=${pf}`)
  const table = page.getByTestId("charting-stock-category-allocation-table")
  await page.getByTestId("charting-stock-category-allocation-table-toggle").click()
  await expect(table).toBeVisible()
  await expect(table.locator("tbody tr", { hasText: "Balanced" })).toHaveCount(1)
  await expect(table.locator("tbody tr", { hasText: "High yield" })).toHaveCount(1)
  await expect(table.locator("tbody tr", { hasText: "Not classified" })).toHaveCount(0)

  // Editing a category moves exactly that stock's value, and the page keeps it
  // after a reload.
  expect((await put("MSFT", "high_growth")).status()).toBe(200)
  await page.reload()
  // A reload remounts the view, so the section is collapsed again.
  await page.getByTestId("charting-stock-category-allocation-table-toggle").click()
  await expect(table).toBeVisible()
  await expect(table.locator("tbody tr", { hasText: "High growth" })).toHaveCount(1)
  await expect(table.locator("tbody tr", { hasText: "High yield" })).toHaveCount(0)

  const moved = await allocation(request, headers, pf)
  const highGrowth = moved.byCategory.find((s) => s.key === "high_growth")
  expect(highGrowth, JSON.stringify(moved.byCategory)).toBeTruthy()
  expect(highGrowth!.value).toBeCloseTo(highYield!.value, 4)
  expect(moved.byCategory.some((s) => s.key === "high_yield")).toBe(false)
})