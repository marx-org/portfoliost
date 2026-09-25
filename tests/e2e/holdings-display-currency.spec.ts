import { expect, test } from "@playwright/test"

/** §48.6e B2 — holdings `converted*` values are portfolio-base-currency
 * (wallets D21b; each position declares the denomination in
 * `displayCurrency`); the tab converts them to the user's display currency
 * client-side. Self-contained (§48.4 precedent): creates its own portfolio
 * holding SNT.WA (PLN) + AAPL (USD) in fresh wallets — the seeded Top10 is
 * not reliable (other e2e runs mutate it). API-created portfolios default to
 * a USD base, so converted* is USD. Mock FX (DEMO_FX, EUR-based): USD→PLN =
 * 4.3/1.08, PLN→USD = 1.08/4.3. */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"
const USD_PLN = 4.3 / 1.08
const PLN_USD = 1.08 / 4.3

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

async function getBearerToken(request: import("@playwright/test").APIRequestContext): Promise<string> {
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  expect(res.status()).toBe(200)
  const body = (await res.json()) as { access_token?: string }
  return body.access_token ?? ""
}

function parseAmount(line: string): number {
  const m = line.replace(/\u00a0/g, " ").match(/-?[\d,]+\.\d{2}/)
  if (!m) throw new Error(`no amount in "${line}"`)
  return Number(m[0].replace(/,/g, ""))
}

/** Market-value cell of the position row: [primary, sub-line?] — the td also
 * carries a "Cost …" sub-paragraph below the dual-currency cell, so only the
 * first two lines are the cell's value/sub-line. */
async function marketValueCell(page: import("@playwright/test").Page, symbol: string): Promise<{ primary: string; sub: string | null }> {
  const ths = page.locator("thead th")
  const count = await ths.count()
  let mvIdx = -1
  for (let i = 0; i < count; i++) {
    // textContent: the header row is CSS-uppercased, innerText would return "MARKET VALUE".
    if ((await ths.nth(i).textContent())?.toUpperCase().includes("MARKET VALUE")) { mvIdx = i; break }
  }
  expect(mvIdx, "Market Value column header").toBeGreaterThan(-1)
  const cell = page.locator("tbody tr").filter({ hasText: symbol }).locator("td").nth(mvIdx)
  const text = (await cell.innerText()).replace(/\u00a0/g, " ").trim()
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean)
  const sub = lines[1] && !lines[1].startsWith("Cost") ? lines[1] : null
  return { primary: lines[0], sub }
}

test("holdings converts portfolio-base values to the display currency", async ({ page, request }) => {
  const run = Date.now()
  const token = await getBearerToken(request)
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }

  // A fresh portfolio (base defaults to USD) holding SNT.WA (PLN instrument)
  // + AAPL (USD instrument) — cross-currency buys, converted* in the USD base.
  const mk = async (path: string, data: unknown) => {
    const res = await request.post(`${GATEWAY}${path}`, { headers: auth, data })
    expect(res.status(), `POST ${path}: ${await res.text()}`).toBeLessThan(300)
    return res.json() as Promise<Record<string, unknown>>
  }
  const portfolio = await mk("/api/portfolios", { name: `E2E B2 ${run}`, baseCurrency: "USD" })

  const pid = String(portfolio.id)
  await mk(`/api/portfolios/${pid}/positions`, { symbol: "SNT.WA", quantity: 100, price: 100, currency: "PLN" })
  await mk(`/api/portfolios/${pid}/positions`, { symbol: "AAPL", quantity: 10, price: 200, currency: "USD" })

  await login(page)
  await page.goto(`/en/portfolios/${pid}/holdings`)
  await expect(page.locator("thead th").filter({ hasText: "Market Value" })).toBeVisible({ timeout: 20000 })

  // Default display currency USD = the portfolio base: SNT.WA (PLN) shows the
  // PLN primary + its USD-converted sub-line (× 1.08/4.3); AAPL (USD) has no
  // sub-line (same currency as the display).
  let cell = await marketValueCell(page, "SNT.WA")
  expect(cell.primary).toMatch(/^PLN/)
  expect(cell.sub, "SNT.WA sub-line under USD display").toMatch(/^\$/)
  expect(Math.abs(parseAmount(cell.sub!) - parseAmount(cell.primary) * PLN_USD) / parseAmount(cell.sub!)).toBeLessThan(0.002)

  cell = await marketValueCell(page, "AAPL")
  expect(cell.primary).toMatch(/^\$/)
  expect(cell.sub).toBeNull()

  // Switch the display currency to PLN via the header menu.
  await page.getByRole("button", { name: /Display currency:/ }).click()
  await page.locator("div.absolute.right-0").getByRole("button", { name: "PLN", exact: true }).click()

  // SNT.WA (PLN): same-currency as the display → sub-line disappears.
  await expect
    .poll(async () => (await marketValueCell(page, "SNT.WA")).sub, { timeout: 10000 })
    .toBeNull()
  cell = await marketValueCell(page, "SNT.WA")
  expect(cell.primary).toMatch(/^PLN/)

  // AAPL (USD): primary $, converted PLN sub-line (× 4.3/1.08).
  cell = await marketValueCell(page, "AAPL")
  expect(cell.primary).toMatch(/^\$/)
  expect(cell.sub).toMatch(/^PLN/)
  expect(Math.abs(parseAmount(cell.sub!) - parseAmount(cell.primary) * USD_PLN) / parseAmount(cell.sub!)).toBeLessThan(0.002)

  // Total row carries the display currency, never a guessed one.
  const tfoot = page.locator("tfoot")
  await expect(tfoot).toContainText("PLN")
  await expect(tfoot).not.toContainText("$")

  // Best-effort cleanup (leftover "E2E B2*" entities are inert for other specs).
  try { await request.delete(`${GATEWAY}/api/portfolios/${pid}`, { headers: auth }) } catch { /* ignore */ }
})
