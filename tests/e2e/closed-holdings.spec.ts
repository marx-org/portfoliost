import { expect, test } from "@playwright/test"

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

async function getBearerToken(request: import("@playwright/test").APIRequestContext): Promise<string> {
  const response = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  expect(response.status()).toBe(200)
  const body = (await response.json()) as { access_token?: string }
  return body.access_token ?? ""
}

const usd = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)

test("closed positions stay hidden by default and can be revealed in portfolio and consolidated Holdings", async ({ page, request }) => {
  test.setTimeout(120_000)
  const run = Date.now()
  const token = await getBearerToken(request)
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  const portfolioName = `E2E closed history ${run}`

  const portfolioResponse = await request.post(`${GATEWAY}/api/portfolios`, {
    headers: auth,
    data: { name: portfolioName, baseCurrency: "USD" },
  })
  expect(portfolioResponse.status(), await portfolioResponse.text()).toBeLessThan(300)
  const portfolioId = String((await portfolioResponse.json() as { id: unknown }).id)

  async function trade(type: "BUY" | "SELL", symbol: string, quantity = 1, price = 100) {
    const response = await request.post(`${GATEWAY}/api/portfolios/${portfolioId}/transactions`, {
      headers: auth,
      data: { type, symbol, quantity, price, currency: "USD" },
    })
    expect(response.status(), `${type} ${symbol}: ${await response.text()}`).toBe(201)
  }

  try {
    await trade("BUY", "E2EOPEN", 2, 100)
    await trade("SELL", "E2EOPEN", 1, 125)
    await trade("BUY", "E2ECLOSED", 2, 100)
    await trade("SELL", "E2ECLOSED", 1, 150)
    await trade("SELL", "E2ECLOSED", 1, 140)

    const positionsResponse = await request.get(`${GATEWAY}/api/portfolios/${portfolioId}/positions`, { headers: auth })
    expect(positionsResponse.status()).toBe(200)
    const positions = (await positionsResponse.json()) as Array<{
      symbol: string
      isOpen: boolean
      marketValue: number
      realizedGainLoss: number
    }>
    const open = positions.find((position) => position.symbol === "E2EOPEN")
    const closed = positions.find((position) => position.symbol === "E2ECLOSED")
    expect(open?.isOpen).toBe(true)
    expect(closed?.isOpen).toBe(false)
    expect(open?.realizedGainLoss).toBe(25)
    expect(closed?.realizedGainLoss).toBe(90)
    const openTotal = open?.marketValue ?? 0

    await login(page)

    // The portfolio surface shows only open positions until the native checkbox
    // is enabled, and retained history does not change the current total.
    await page.goto(`/en/portfolios/${portfolioId}/holdings`)
    const rows = page.locator('[data-testid="holdings-row"]')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText("E2EOPEN")
    await expect(rows.first().getByTestId("holdings-cell-realized")).toContainText("+$25.00")
    await expect(page.locator("tfoot")).toContainText(usd(openTotal))
    await expect(page.getByTestId("holdings-total-realized")).toContainText("USD +$25.00")
    const closedFilter = page.getByRole("checkbox", { name: "Show closed positions" })
    await closedFilter.focus()
    await closedFilter.press("Space")
    await expect(closedFilter).toBeChecked()
    await expect(rows).toHaveCount(2)
    const closedRow = rows.filter({ hasText: "E2ECLOSED" })
    await expect(closedRow).toContainText("Closed")
    await expect(closedRow).toContainText(/\d{4}/)
    await expect(closedRow.getByTestId("holdings-cell-realized")).toContainText("+$90.00")
    await expect(page.locator("tfoot")).toContainText(usd(openTotal))
    await expect(page.getByTestId("holdings-total-realized")).toContainText("USD +$115.00")

    // The consolidated route uses the same filter pipeline and retains the
    // owning portfolio name on the revealed membership row.
    await page.goto("/en/investments/holdings")
    await page.getByTestId("holdings-search").fill("E2ECLOSED")
    await expect(page.locator('[data-testid="holdings-row"]')).toHaveCount(0)
    await page.getByRole("checkbox", { name: "Show closed positions" }).check()
    const consolidatedClosed = page.locator('[data-testid="holdings-row"]').filter({ hasText: "E2ECLOSED" })
    await expect(consolidatedClosed).toHaveCount(1)
    await expect(consolidatedClosed).toContainText(portfolioName)
    await expect(consolidatedClosed).toContainText("Closed")
    await expect(consolidatedClosed.getByTestId("holdings-cell-realized")).toContainText("+$90.00")

    await page.getByTestId("holdings-search").fill("E2EOPEN")
    const consolidatedOpen = page.locator('[data-testid="holdings-row"]').filter({ hasText: "E2EOPEN" })
    await expect(consolidatedOpen).toHaveCount(1)
    await expect(consolidatedOpen.getByTestId("holdings-cell-realized")).toContainText("+$25.00")
  } finally {
    try { await request.delete(`${GATEWAY}/api/portfolios/${portfolioId}`, { headers: auth }) } catch { /* best-effort cleanup */ }
  }
})
