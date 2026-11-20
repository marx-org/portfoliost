import { expect, test, type APIRequestContext } from "@playwright/test"
import { login } from "./helpers/login"

/**
 * Monthly dividend-payer coverage for current holdings, end to end against the
 * dockerized stack (feature #253, sub-issue #265).
 *
 * The chart counts DISTINCT currently-held stocks with a recorded dividend in
 * each month — not dividend rows, and not a provider calendar. A stock paying
 * twice in June still counts once; two stocks count two. The exact arithmetic
 * is covered in wallets `payerCoverage.test.ts`; this proves the route and the
 * shared renderer agree on real positions.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

type PayerMonth = { year: number; month: number; count: number; partial: boolean }
type Income = { coverage: { status: string; generation: number }; payerCoverage: PayerMonth[] }

async function auth(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  expect(res.status()).toBe(200)
  const token = ((await res.json()) as { access_token?: string }).access_token ?? ""
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

async function income(request: APIRequestContext, headers: Record<string, string>, pf: string) {
  const res = await request.get(`${GATEWAY}/api/portfolios/charting/income?accounts=${pf}`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()) as Income
}

test("payer coverage counts distinct current holdings per month, not dividend rows", async ({ page, request }) => {
  await login(page)
  const headers = await auth(request)

  const created = await request.post(`${GATEWAY}/api/portfolios`, {
    headers,
    data: { name: `E2E-Payers-${Date.now()}`, baseCurrency: "USD" },
  })
  expect(created.status(), await created.text()).toBeLessThan(300)
  const pf = String((await created.json() as { id: unknown }).id)

  const tx = (data: Record<string, unknown>) =>
    request.post(`${GATEWAY}/api/portfolios/${pf}/transactions`, { headers, data })

  // Two current holdings.
  expect((await tx({ type: "BUY", symbol: "AAPL", quantity: 1, price: 150, currency: "USD", executedAt: "2024-01-02T12:00:00Z" })).status()).toBe(201)
  expect((await tx({ type: "BUY", symbol: "MSFT", quantity: 1, price: 300, currency: "USD", executedAt: "2024-01-02T12:00:00Z" })).status()).toBe(201)

  // Dividends must be linked to their position (the importer sets this; the
  // interactive route needs the id explicitly).
  const positionsRes = await request.get(`${GATEWAY}/api/portfolios/${pf}/positions`, { headers })
  expect(positionsRes.status(), await positionsRes.text()).toBe(200)
  const positionsBody = (await positionsRes.json()) as { positions?: Array<{ id: string; symbol?: string }> } | Array<{ id: string; symbol?: string }>
  const positions = Array.isArray(positionsBody) ? positionsBody : positionsBody.positions ?? []
  const positionId = (symbol: string) => {
    const found = positions.find((p) => p.symbol === symbol)
    expect(found, `position for ${symbol}`).toBeTruthy()
    return found!.id
  }
  const aaplId = positionId("AAPL")
  const msftId = positionId("MSFT")

  // AAPL pays twice in June, MSFT once; July only MSFT.
  for (const [symbol, position, date] of [
    ["AAPL", aaplId, "2024-06-05"],
    ["AAPL", aaplId, "2024-06-20"],
    ["MSFT", msftId, "2024-06-15"],
    ["MSFT", msftId, "2024-07-01"],
  ] as const) {
    const res = await tx({ type: "DIVIDEND", symbol, positionId: position, quantity: 1, price: 10, currency: "USD", executedAt: `${date}T12:00:00Z` })
    expect(res.status(), await res.text()).toBe(201)
  }

  const recomputed = await request.post(`${GATEWAY}/api/portfolios/${pf}/recompute`, { headers })
  expect(recomputed.status(), await recomputed.text()).toBe(200)

  let body: Income | null = null
  await expect
    .poll(async () => {
      const b = await income(request, headers, pf)
      if (b.coverage.status === "complete" && b.coverage.generation >= 1) {
        body = b
        return true
      }
      return false
    }, { timeout: 30_000 })
    .toBe(true)

  const june = body!.payerCoverage.find((m) => m.year === 2024 && m.month === 6)
  const july = body!.payerCoverage.find((m) => m.year === 2024 && m.month === 7)
  expect(june?.count, JSON.stringify(body!.payerCoverage)).toBe(2)
  expect(july?.count).toBe(1)
  // All twelve months are present for the year, including true zeros.
  expect(body!.payerCoverage.filter((m) => m.year === 2024)).toHaveLength(12)
  expect(body!.payerCoverage.find((m) => m.year === 2024 && m.month === 1)?.count).toBe(0)

  // The page renders the same dataset.
  await page.goto(`/en/charting/income?accounts=${pf}`)
  const table = page.getByTestId("charting-payer-coverage-table")
  await page.getByTestId("charting-payer-coverage-table-toggle").click()
  await expect(table).toBeVisible()
  await expect(table.locator("tbody tr")).toHaveCount(12)
  const juneRow = table.locator("tbody tr", { hasText: "Jun" })
  await expect(juneRow).toContainText("2")
})