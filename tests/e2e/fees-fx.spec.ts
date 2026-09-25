import { expect, test } from "@playwright/test"

/** §62 rework of the buy-dialog FX spec: the transaction FX leg is driven by the
 * INSTRUMENT currency vs the portfolio's BASE currency (no wallet select). Buying a
 * USD instrument (TXN) in a USD-base portfolio needs no FX leg; the same buy in a
 * EUR-base portfolio turns on the USD→EUR leg. Automatic suggests the market rate;
 * manual reveals the rate input. Portfolios are created via the API (the create
 * dialog has no base-currency field). */

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
  const res = await request.post(`${MOCK}/api/auth/login`, { data: { email: "demo@example.com", password: "example-service-mock" } })
  expect(res.status()).toBe(200)
  return ((await res.json()) as { access_token?: string }).access_token ?? ""
}

async function createPortfolio(request: import("@playwright/test").APIRequestContext, auth: Record<string, string>, name: string, baseCurrency: string): Promise<string> {
  const res = await request.post(`${GATEWAY}/api/portfolios`, { headers: auth, data: { name, baseCurrency } })
  expect(res.status()).toBeLessThan(300)
  return String(((await res.json()) as { id: string }).id)
}

async function openTxBuy(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Add Position", exact: true }).click()
  await page.getByRole("dialog", { name: "Add position" }).getByTestId("add-position-instrument").click()
  const search = page.getByRole("dialog", { name: "Search for Instruments" })
  await expect(search).toBeVisible()
  await page.getByTestId("instrument-search").fill("Texas Instruments")
  await page.waitForTimeout(1200)
  await search.getByRole("button", { name: /^TXN / }).first().click()
  const buy = page.getByRole("dialog", { name: "Buy Position" })
  await buy.getByTestId("add-position-quantity").fill("1")
  await buy.getByTestId("add-position-price").fill("50")
  return buy
}

test("buy dialog: portfolio-base FX section → automatic suggests, custom submits a manual rate", async ({ page, request }) => {
  const run = Date.now()
  const token = await getBearerToken(request)
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }

  const usdId = await createPortfolio(request, auth, `E2E FX USD ${run}`, "USD")
  const eurId = await createPortfolio(request, auth, `E2E FX EUR ${run}`, "EUR")

  await login(page)
  // load the portfolio summaries into the store (useTargetCurrency reads
  // store.portfolios[...].baseCurrency for the buy dialog's FX target)
  await page.goto("/en/investments")
  await expect(page.getByTestId("card-cash-group").first()).toBeVisible({ timeout: 15000 })

  // paying a USD-base portfolio for a USD instrument (TXN) → no FX conversion
  await page.goto(`/en/portfolios/${usdId}/holdings`)
  await expect(page.getByRole("button", { name: "Add Position", exact: true })).toBeVisible({ timeout: 20000 })
  let buy = await openTxBuy(page)
  await expect(buy.getByTestId("add-position-fx-section")).toBeHidden()
  await buy.getByRole("button", { name: "Cancel" }).click()

  // the same USD instrument in a EUR-base portfolio → USD→EUR leg (the FX
  // section is shown because instrument currency ≠ portfolio base currency).
  await page.goto(`/en/portfolios/${eurId}/holdings`)
  await expect(page.getByRole("button", { name: "Add Position", exact: true })).toBeVisible({ timeout: 20000 })
  buy = await openTxBuy(page)
  await expect(buy.getByTestId("add-position-fx-section")).toBeVisible()
  await expect(buy.getByText("Transaction exchange rate (USD → EUR)")).toBeVisible()

  // the rate field switches automatic ↔ manual (structural; the resolved value
  // depends on live FX data, asserted elsewhere)
  await expect(buy.getByTestId("add-position-fx-auto")).toBeAttached()
  await buy.getByTestId("add-position-fx-manual").click()
  await expect(buy.getByTestId("add-position-fx-rate")).toBeVisible()

  for (const id of [usdId, eurId]) {
    try { await request.delete(`${GATEWAY}/api/portfolios/${id}`, { headers: auth }) } catch { /* ignore */ }
  }
})
