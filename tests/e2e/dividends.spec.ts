import { expect, test } from "@playwright/test"

/** §49.7 — end-to-end DIVIDEND flow against the dockerized stack (real wallets
 * backend, plan §49.3): record a dividend in the UI → the portfolio is credited
 * the NET amount (gross − withholding tax), the Dividends tab lists the real row
 * (gross / tax / net), and the Transactions tab gains the Tax column. Self-owned
 * portfolio + wallet so no other spec can touch the seeded Top10. */

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
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  expect(res.status()).toBe(200)
  const body = (await res.json()) as { access_token?: string }
  return body.access_token ?? ""
}

test("record dividend nets the wallet and populates Dividends + Transactions Tax column", async ({ page, request }) => {
  const run = Date.now()
  const token = await getBearerToken(request)
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }

  const mk = async (path: string, data: unknown, expected = 299) => {
    const res = await request.post(`${GATEWAY}${path}`, { headers: auth, data })
    expect(res.status(), `POST ${path}: ${await res.text()}`).toBeLessThan(expected)
    return res.json() as Promise<Record<string, unknown>>
  }

  const portfolio = await mk("/api/portfolios", { name: `E2E DIV ${run}`, baseCurrency: "USD" })
  const pid = String(portfolio.id)
  // 10 × $50 buy = 500, leaving the buy-funded cash to be credited +80 net by
  // the dividend (the portfolio's own cash, not a wallet — §62).
  await mk(`/api/portfolios/${pid}/positions`, { symbol: "AAPL", quantity: 10, price: 50, currency: "USD" })

  await login(page)
  await page.goto(`/en/portfolios/${pid}/holdings`)

  const cashUsd = async (): Promise<number | undefined> => {
    const res = await request.get(`${GATEWAY}/api/portfolios/${pid}/cash`, { headers: auth })
    if (res.status() !== 200) return undefined
    const body = (await res.json()) as { balances: Array<{ currency: string; balance: number }> }
    return body.balances.find((b) => b.currency === "USD")?.balance
  }
  // The buy already debited the portfolio's own cash; capture the pre-dividend
  // baseline and assert the dividend credits the NET amount on top of it (§62).
  const before = await cashUsd()
  expect(before, "pre-dividend cash baseline").not.toBeUndefined()

  const row = page.locator("tbody tr").filter({ hasText: "AAPL" }).first()
  await expect(row).toBeVisible({ timeout: 20000 })
  await row.getByRole("button", { name: "Position actions" }).click()
  await page.getByRole("button", { name: "Dividend", exact: true }).click()

  const dialog = page.getByRole("dialog", { name: "Record Dividend" })
  await expect(dialog).toBeVisible()

  // §50.6 — example-service parity: title, shares-held header row, notes textarea
  await expect(dialog.getByTestId("dividend-title")).toHaveText("Record dividend")
  await expect(dialog.getByTestId("dividend-shares-held")).toContainText("Shares held:")
  await expect(dialog.getByTestId("dividend-shares-held")).toContainText("10")
  await expect(dialog.locator("textarea[data-testid='dividend-notes']")).toHaveCount(1)

  // §50.6 — per-share mode: two-column row prefilled with the held quantity
  await dialog.getByTestId("dividend-mode-pershare").click()
  await expect(dialog.getByText("Dividend per share")).toBeVisible()
  await expect(dialog.getByText("Shares receiving dividend")).toBeVisible()
  await expect(dialog.getByTestId("dividend-shares")).toHaveValue("10")
  await dialog.getByTestId("dividend-mode-total").click()

  // §62 — the dividend is paid into the portfolio (no wallet select); the FX
  // leg converts into the portfolio's base currency automatically.

  // tax can never exceed gross → inline error + disabled submit
  await dialog.getByTestId("dividend-gross").fill("10")
  await dialog.getByTestId("dividend-tax").fill("20")
  await expect(dialog.getByTestId("dividend-tax-error")).toBeVisible()
  await expect(dialog.getByTestId("dividend-submit")).toBeDisabled()
  // §50.6 — summary shows the tax minus-signed (example-service: "-0,00 USD" red)
  await expect(dialog.getByTestId("dividend-tax-total")).toHaveText("-20.00 USD")

  // gross 100, tax 20 → net 80.00 USD
  await dialog.getByTestId("dividend-gross").fill("100")
  await dialog.getByTestId("dividend-tax").fill("20")
  await dialog.getByTestId("dividend-notes").fill("Q2 payout")
  await expect(dialog.getByTestId("dividend-tax-error")).toBeHidden()
  await expect(dialog.getByTestId("dividend-submit")).toBeEnabled()
  await expect(dialog.getByTestId("dividend-net")).toHaveText("80.00 USD")
  await dialog.getByTestId("dividend-submit").click()
  await expect(dialog).not.toBeVisible({ timeout: 10000 })

  // The portfolio's cash was credited the NET amount (dividend-derived by
  // replay, not a stored wallet ledger — §62).
  // The portfolio's cash was credited the NET dividend amount (dividend-derived
  // by replay, not a stored wallet ledger — §62): before + net(80).
  await expect
    .poll(async () => {
      const after = await cashUsd()
      return after != null && before != null ? after - before : undefined
    }, { timeout: 15000 })
    .toBe(80)

  // Dividends tab aggregates the real transaction row (gross / tax / net)
  await page.goto(`/en/portfolios/${pid}/dividends`)
  const table = page.getByTestId("dividends-table")
  await expect(table).toBeVisible({ timeout: 15000 })
  const drow = table.locator("tbody tr").filter({ hasText: "AAPL" })
  await expect(drow).toContainText("100")
  await expect(drow).toContainText("20")
  await expect(drow.getByTestId("dividend-net-AAPL")).toContainText("80")

  // §85 — the symbol cell is now a link into research. Proved here rather than
  // in research.spec.ts because this is the only spec that actually records a
  // dividend: the seeded portfolio has no dividend rows, so elsewhere there is
  // nothing to click. Asserted as the full round trip, because an href proves
  // the link and only coming back proves `from` was carried.
  const divPath = `/en/portfolios/${pid}/dividends`
  const researchLink = drow.locator("a[href^='/en/research/']")
  await expect(researchLink).toHaveAttribute("href", "/en/research/AAPL/overview?from=/en/portfolios/" + pid + "/dividends")
  await researchLink.click()
  await expect(page).toHaveURL(/\/en\/research\/AAPL\/overview/)
  await page.getByTestId("research-back").click()
  await expect(page).toHaveURL(new RegExp(`${divPath}$`))

  // Transactions tab shows the Tax column (DIVIDEND row present) with the net amount
  await page.goto(`/en/portfolios/${pid}/transactions`)
  await expect(page.getByTestId("table-th-tax")).toBeVisible({ timeout: 15000 })
  const trow = page.locator("tbody tr").filter({ hasText: "AAPL" }).filter({ hasText: "Dividend" })
  await expect(trow).toBeVisible()
  await expect(trow).toContainText("80")

  // best-effort cleanup (leftover "E2E DIV*" entities are inert for other specs)
  try { await request.delete(`${GATEWAY}/api/portfolios/${pid}`, { headers: auth }) } catch { /* ignore */ }
})