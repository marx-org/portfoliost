import { expect, test, type APIRequestContext } from "@playwright/test"
import { login } from "./helpers/login"

/**
 * Remaining cost basis versus market value by position label, end to end against
 * the dockerized stack (feature #253, sub-issue #270).
 *
 * The sheet grouped holdings by hardcoded strategy flags; this groups by the
 * user's own labels. A labelled holding shows its basis/value under the label,
 * an unlabelled holding lands in a display-only `Unlabelled` bucket, and a label
 * filter narrows the groups (the rows are independent, not a partition).
 *
 * The exact cost-basis arithmetic is covered in wallets `allocation.test.ts`; this
 * proves the route, the shared renderer and the label assignment agree on real
 * positions.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

type CostValue = { key: string; label: string; costBasis: number; value: number; unknown: boolean }
type Allocation = {
  coverage: { generation: number; status: string }
  byCostBasis: CostValue[]
}
type Position = { id: string; symbol?: string }

async function auth(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  expect(res.status()).toBe(200)
  const token = ((await res.json()) as { access_token?: string }).access_token ?? ""
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

async function allocation(request: APIRequestContext, headers: Record<string, string>, query: string) {
  const res = await request.get(`${GATEWAY}/api/portfolios/charting/allocation?${query}`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()) as Allocation
}

test("cost basis vs market value is grouped by label, with an unlabelled bucket", async ({ page, request }) => {
  await login(page)
  const headers = await auth(request)

  const created = await request.post(`${GATEWAY}/api/portfolios`, {
    headers,
    data: { name: `E2E-Strategy-${Date.now()}`, baseCurrency: "USD" },
  })
  expect(created.status(), await created.text()).toBeLessThan(300)
  const pf = String((await created.json() as { id: unknown }).id)

  // One AAPL (to be labelled) and ten MSFT (left unlabelled).
  for (const [symbol, quantity, price] of [["AAPL", 1, 150], ["MSFT", 10, 450]] as const) {
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
      const b = await allocation(request, headers, `accounts=${pf}`)
      if (b.coverage.status === "complete" && b.coverage.generation >= 1) {
        body = b
        return true
      }
      return false
    }, { timeout: 30_000 })
    .toBe(true)

  // Before any label is attached the whole scope is the display-only bucket:
  // AAPL (1 × 150) + MSFT (10 × 450) = 4650 cost basis.
  expect(body!.byCostBasis.map((r) => r.label)).toEqual(["Unlabelled"])
  const unlabelled = body!.byCostBasis[0]
  expect(unlabelled.costBasis).toBeCloseTo(4650, 4)
  expect(unlabelled.value).toBeGreaterThan(0)

  // Label the AAPL position through the real wallets API.
  const labelRes = await request.post(`${GATEWAY}/api/labels`, {
    headers,
    data: { name: `E2E-STRAT-${Date.now()}` },
  })
  expect(labelRes.status(), await labelRes.text()).toBeLessThan(300)
  const label = (await labelRes.json()) as { id: string; name: string }

  const positionsRes = await request.get(`${GATEWAY}/api/portfolios/${pf}/positions`, { headers })
  expect(positionsRes.status(), await positionsRes.text()).toBe(200)
  const positionsBody = (await positionsRes.json()) as { positions?: Position[] } | Position[]
  const positions = Array.isArray(positionsBody) ? positionsBody : positionsBody.positions ?? []
  const aapl = positions.find((p) => p.symbol === "AAPL")
  expect(aapl, JSON.stringify(positions)).toBeTruthy()

  const assigned = await request.post(`${GATEWAY}/api/positions/${aapl!.id}/labels`, {
    headers,
    data: { labelIds: [label.id] },
  })
  expect(assigned.status(), await assigned.text()).toBe(200)

  const labelled = await allocation(request, headers, `accounts=${pf}`)
  const core = labelled.byCostBasis.find((r) => r.label === label.name)
  expect(core, JSON.stringify(labelled.byCostBasis)).toBeTruthy()
  // AAPL: 1 × 150 = 150 cost basis, value from the provider.
  expect(core!.costBasis).toBeCloseTo(150, 4)
  expect(core!.value).toBeGreaterThan(0)
  expect(labelled.byCostBasis.some((r) => r.label === "Unlabelled"), JSON.stringify(labelled.byCostBasis)).toBe(true)

  // Selecting the label narrows to its group only; the unlabelled bucket is not All.
  const filtered = await allocation(request, headers, `accounts=${pf}&labels=${label.id}`)
  expect(filtered.byCostBasis.map((r) => r.label)).toEqual([label.name])

  // The Charting page renders the same paired data.
  await page.goto(`/en/charting/allocation?accounts=${pf}`)
  const table = page.getByTestId("charting-label-cost-value-table")
  await page.getByTestId("charting-label-cost-value-table-toggle").click()
  await expect(table).toBeVisible()
  await expect(table.locator("tbody tr", { hasText: label.name })).toHaveCount(1)
  await expect(table.locator("tbody tr", { hasText: "Unlabelled" })).toHaveCount(1)
})