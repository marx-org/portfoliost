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

  const walletName = `E2E DIV USD ${run}`
  const wallet = await mk("/api/wallets", { name: walletName, currency: "USD" })
  const walletId = String(wallet.id)
  await mk(`/api/wallets/${walletId}/deposits`, { amount: 1000 })
  const portfolio = await mk("/api/portfolios", { name: `E2E DIV ${run}`, currency: "USD", walletId })
  const pid = String(portfolio.id)
  // 10 × $50 buy = 500, leaving 500 cash; the dividend credits +80 net.
  await mk(`/api/portfolios/${pid}/positions`, { symbol: "AAPL", quantity: 10, price: 50, currency: "USD", walletId })

  await login(page)
  await page.goto(`/en/portfolios/${pid}/holdings`)

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

  // pick the funded wallet explicitly (the dialog prefers the portfolio-linked
  // wallet; it loads asynchronously, so select it deterministically)
  const walletSelect = dialog.getByTestId("dividend-wallet")
  await expect(walletSelect.locator("option", { hasText: walletName })).toHaveCount(1, { timeout: 10000 })
  await walletSelect.selectOption(walletId)

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

  // wallet credited the NET amount (1000 deposited − 500 buy + 80 net dividend)
  await expect
    .poll(async () => {
      const res = await request.get(`${GATEWAY}/api/wallets`, { headers: auth })
      if (res.status() !== 200) return undefined
      const rows = (await res.json()) as Array<{ id?: string; balance?: number }>
      return rows.find((w) => w.id === walletId)?.balance
    }, { timeout: 15000 })
    .toBe(580)

  const wtx = await request.get(`${GATEWAY}/api/wallets/${walletId}/transactions`, { headers: auth })
  expect(wtx.status()).toBe(200)
  const wtxBody = (await wtx.json()) as { items?: Array<{ type?: string; amount?: number }> }
  const dividendCash = wtxBody.items?.find((t) => t.type === "INVEST" && t.amount === 80)
  expect(dividendCash, "wallet ledger row for the dividend").toBeTruthy()

  // Dividends tab aggregates the real transaction row (gross / tax / net)
  await page.goto(`/en/portfolios/${pid}/dividends`)
  const table = page.getByTestId("dividends-table")
  await expect(table).toBeVisible({ timeout: 15000 })
  const drow = table.locator("tbody tr").filter({ hasText: "AAPL" })
  await expect(drow).toContainText("100")
  await expect(drow).toContainText("20")
  await expect(drow.getByTestId("dividend-net-AAPL")).toContainText("80")

  // Transactions tab shows the Tax column (DIVIDEND row present) with the net amount
  await page.goto(`/en/portfolios/${pid}/transactions`)
  await expect(page.getByTestId("table-th-tax")).toBeVisible({ timeout: 15000 })
  const trow = page.locator("tbody tr").filter({ hasText: "AAPL" }).filter({ hasText: "Dividend" })
  await expect(trow).toBeVisible()
  await expect(trow).toContainText("80")

  // best-effort cleanup: the portfolio still holds a live position, so drop the
  // wallet ledger + transactions first is overkill — entities are inert leftovers
  for (const del of [`${GATEWAY}/api/portfolios/${pid}`, `${GATEWAY}/api/wallets/${walletId}`]) {
    try { await request.delete(del, { headers: auth }) } catch { /* ignore */ }
  }
})