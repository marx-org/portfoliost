import { expect, test } from "@playwright/test"

/**
 * §87.5 — the UI-only "also create a cash transaction" switch, end to end against
 * the dockerized stack (real wallets backend).
 *
 * Two halves, and the second is the one that matters:
 *   1. the form's box is pre-ticked from the portfolio's `cashLegOnTrade` flag,
 *      unticking it is honoured, and a ticked buy produces a linked cash row;
 *   2. the IMPORT path never reads the flag — it keeps using the importer's own
 *      kontо list plus the sheet's col 47. A UI toggle that leaked into the import
 *      would silently change what a spreadsheet produces, which is precisely what
 *      §87.5 keeps apart.
 *
 * The flag defaults ON for the seven kontо the importer always funds (wallets
 * `CASH_LEG_DEFAULT_PORTFOLIOS`), so these tests create throwaway portfolios by
 * name rather than relying on any PROD-shaped account.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

async function auth(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  expect(res.status()).toBe(200)
  const token = ((await res.json()) as { access_token?: string }).access_token ?? ""
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

function mk(a: Record<string, string>, request: import("@playwright/test").APIRequestContext) {
  return async (path: string, data: unknown, method = "POST") => {
    const res = await request.fetch(`${GATEWAY}${path}`, { method, headers: a, data })
    expect(res.status(), `${method} ${path}: ${await res.text()}`).toBeLessThan(300)
    return (await res.json()) as Record<string, unknown>
  }
}

async function balance(request: import("@playwright/test").APIRequestContext, a: Record<string, string>, pid: string, ccy: string) {
  const res = await request.get(`${GATEWAY}/api/portfolios/${pid}/cash`, { headers: a })
  expect(res.status()).toBe(200)
  const body = (await res.json()) as { balances: Array<{ currency: string; balance: number }> }
  return body.balances.find((b) => b.currency === ccy)?.balance ?? 0
}

async function cashRows(request: import("@playwright/test").APIRequestContext, a: Record<string, string>, pid: string) {
  const res = await request.get(`${GATEWAY}/api/portfolios/${pid}/cash/transactions`, { headers: a })
  expect(res.status()).toBe(200)
  const body = (await res.json()) as { transactions?: unknown[]; items?: unknown[] }
  return body.transactions ?? body.items ?? []
}

test.describe("§87.5 — cash leg on trade", () => {
  test("the buy form's box is pre-ticked from the portfolio flag, and a ticked buy creates a linked deposit", async ({
    page,
    request,
  }) => {
    const run = Date.now()
    const a = await auth(request)
    const post = mk(a, request)
    const portfolio = await post("/api/portfolios", { name: `E2E CashLeg ${run}`, baseCurrency: "USD" })
    const pid = String(portfolio.id)
    await post(`/api/portfolios/${pid}`, { cashLegOnTrade: true }, "PATCH")
    // seed the holding through the API so the dialog opens straight on the form
    // (the UI path for a NEW position starts at an instrument chooser)
    await post(`/api/portfolios/${pid}/positions`, {
      symbol: "AAPL",
      quantity: 1,
      price: 100,
      currency: "USD",
      instrumentCurrency: "USD",
    })

    await login(page)
    await page.goto(`/en/portfolios/${pid}/holdings`)
    const row = page.locator("tbody tr").filter({ hasText: "AAPL" }).first()
    await row.getByRole("button", { name: "Position actions" }).click()
    await page.getByRole("button", { name: "Buy", exact: true }).click()
    await expect(page.getByRole("dialog", { name: /Buy AAPL/ })).toBeVisible()
    await page.getByTestId("add-position-quantity").fill("2")
    await page.getByTestId("add-position-price").fill("100")

    const box = page.getByTestId("add-position-cash-leg")
    await expect(box).toBeVisible()
    // pre-ticked from the portfolio's flag, not remembered from a previous dialog
    await expect(box).toBeChecked()

    await page.getByRole("button", { name: /Buy for/ }).click()
    await expect(page.getByRole("dialog", { name: /Buy AAPL/ })).toBeHidden({ timeout: 15000 })

    // The cash ledger replays trades too, so the balance is
    //   +200 (the new deposit) − 100 (the seeded position, created with no cash leg)
    //   − 200 (this buy, whose derived BUY debit the deposit offsets)
    // = −100. The DEPOSIT row is the assertion that matters: without it the buy's
    // own debit would stand alone, which is exactly the one-sided round trip §87.1
    // exists to remove.
    await expect
      .poll(async () => balance(request, a, pid, "USD"), { timeout: 15000 })
      .toBeCloseTo(-100, 0)
    const rows = (await cashRows(request, a, pid)) as Array<{ type: string; amount: number }>
    expect(rows.filter((r) => r.type === "DEPOSIT")).toHaveLength(1)
    expect(rows.some((r) => r.type === "DEPOSIT" && Math.abs(r.amount - 200) < 0.01)).toBe(true)

    await request.delete(`${GATEWAY}/api/portfolios/${pid}`, { headers: a })
  })

  test("unticking per transaction is honoured even with the flag ON", async ({ page, request }) => {
    const run = Date.now()
    const a = await auth(request)
    const post = mk(a, request)
    const portfolio = await post("/api/portfolios", { name: `E2E CashLegOff ${run}`, baseCurrency: "USD" })
    const pid = String(portfolio.id)
    await post(`/api/portfolios/${pid}`, { cashLegOnTrade: true }, "PATCH")
    await post(`/api/portfolios/${pid}/positions`, {
      symbol: "MSFT",
      quantity: 1,
      price: 50,
      currency: "USD",
      instrumentCurrency: "USD",
    })

    await login(page)
    await page.goto(`/en/portfolios/${pid}/holdings`)
    const row = page.locator("tbody tr").filter({ hasText: "MSFT" }).first()
    await row.getByRole("button", { name: "Position actions" }).click()
    await page.getByRole("button", { name: "Buy", exact: true }).click()
    await page.getByTestId("add-position-quantity").fill("1")
    await page.getByTestId("add-position-price").fill("50")
    await page.getByTestId("add-position-cash-leg").uncheck()
    await page.getByRole("button", { name: /Buy for/ }).click()
    await expect(page.getByRole("dialog", { name: /Buy MSFT/ })).toBeHidden({ timeout: 15000 })

    // the trade landed, the cash row did not
    await expect.poll(async () => cashRows(request, a, pid).then((r) => r.length), { timeout: 15000 }).toBe(0)

    await request.delete(`${GATEWAY}/api/portfolios/${pid}`, { headers: a })
  })

  test("the CARD's settings dialog carries the same switch (two dialogs, one setting)", async ({ page, request }) => {
    // Regression guard for the gap this found: the app has TWO "Rename portfolio"
    // dialogs — the portfolio page's and the investments card's — and the switch
    // was added to only one of them, so the setting was editable from one route
    // and invisible from the other.
    const run = Date.now()
    const a = await auth(request)
    const post = mk(a, request)
    const portfolio = await post("/api/portfolios", { name: `E2E CashLegCard ${run}`, baseCurrency: "USD" })
    const pid = String(portfolio.id)

    await login(page)
    await page.goto("/en/investments")
    const card = page.locator(".card").filter({ hasText: `E2E CashLegCard ${run}` }).first()
    await card.getByRole("button", { name: "Portfolio actions" }).click()
    await card.getByRole("button", { name: "Edit", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Rename portfolio" })
    await expect(dialog).toBeVisible()
    const flag = dialog.getByTestId("card-cash-leg-on-trade")
    await expect(flag).not.toBeChecked()
    await flag.check()
    await dialog.getByRole("button", { name: "Save" }).click()
    await expect(dialog).toBeHidden()

    const after = await request.get(`${GATEWAY}/api/portfolios/${pid}`, { headers: a })
    expect(((await after.json()) as { cashLegOnTrade?: boolean }).cashLegOnTrade).toBe(true)

    await request.delete(`${GATEWAY}/api/portfolios/${pid}`, { headers: a })
  })

  test("Portfolio settings toggles the flag and the form follows it", async ({ page, request }) => {
    const run = Date.now()
    const a = await auth(request)
    const post = mk(a, request)
    const portfolio = await post("/api/portfolios", { name: `E2E CashLegSettings ${run}`, baseCurrency: "USD", cashLegOnTrade: false })
    const pid = String(portfolio.id)

    await login(page)
    await page.goto(`/en/portfolios/${pid}/holdings`)
    await page.getByRole("button", { name: "Rename" }).click()
    const dialog = page.getByRole("dialog", { name: "Rename portfolio" })
    await expect(dialog).toBeVisible()
    const flag = dialog.getByTestId("cash-leg-on-trade")
    await expect(flag).not.toBeChecked()
    await flag.check()
    await dialog.getByRole("button", { name: "Save" }).click()
    await expect(dialog).toBeHidden()

    const after = await request.get(`${GATEWAY}/api/portfolios/${pid}`, { headers: a })
    expect(((await after.json()) as { cashLegOnTrade?: boolean }).cashLegOnTrade).toBe(true)

    // and the next dialog opens with the box reflecting it
    await post(`/api/portfolios/${pid}/positions`, {
      symbol: "NVDA",
      quantity: 1,
      price: 10,
      currency: "USD",
      instrumentCurrency: "USD",
    })
    await page.reload()
    const row = page.locator("tbody tr").filter({ hasText: "NVDA" }).first()
    await row.getByRole("button", { name: "Position actions" }).click()
    await page.getByRole("button", { name: "Buy", exact: true }).click()
    await expect(page.getByTestId("add-position-cash-leg")).toBeChecked()

    // Clean up like the sibling tests above. Without this every full-suite run
    // leaks a portfolio whose name contains "Settings", which turns
    // settings.spec.ts's getByRole("link", { name: "Settings" }) into a
    // strict-mode violation — an order-dependent failure in an unrelated spec.
    await request.delete(`${GATEWAY}/api/portfolios/${pid}`, { headers: a })
  })

  test("the flag defaults ON for a kontо the importer always funds (name-seeded)", async ({ request }) => {
    const a = await auth(request)
    const post = mk(a, request)
    const run = Date.now()
    // wallets' CASH_LEG_DEFAULT_PORTFOLIOS is a copy of the importer's
    // ALWAYS_CASH_LEG; a portfolio created under one of those exact names must not
    // ship with the box unticked, or the UI would disagree with every import.
    const xtb = await post("/api/portfolios", { name: "XTB", baseCurrency: "PLN" })
    const other = await post("/api/portfolios", { name: `E2E NotOnList ${run}`, baseCurrency: "PLN" })
    expect(xtb.cashLegOnTrade).toBe(true)
    expect(other.cashLegOnTrade).toBe(false)
    // clean up so a re-run does not collide on uq_portfolios_user_name
    await request.delete(`${GATEWAY}/api/portfolios/${xtb.id}`, { headers: a })
    // `other` leaks too, and its name contains no "Settings" — but an
    // ever-growing portfolio list is what made accounts-balance.spec.ts's
    // global row count fail on a second run.
    await request.delete(`${GATEWAY}/api/portfolios/${other.id}`, { headers: a })
  })

  test("INDEPENDENCE: an import row ignores the portfolio flag entirely", async ({ request }) => {
    const run = Date.now()
    const a = await auth(request)
    const post = mk(a, request)
    const portfolio = await post("/api/portfolios", { name: `E2E CashLegImport ${run}`, baseCurrency: "USD" })
    const pid = String(portfolio.id)
    await post(`/api/portfolios/${pid}`, { cashLegOnTrade: true }, "PATCH")

    // The import's idempotency key is (externalSource, externalId), so this shape
    // cannot collide with the UI's rows. A bare trade row with NO cashTx is the
    // AU=0 shape: with the flag ON it must still import with nothing to link.
    const body = await post("/api/import/transactions", {
      source: { externalSource: `e2e-cashleg-${run}`, spreadsheetId: "e2e", sheet: "tx" },
      transactions: [
        {
          externalId: `${run}-1`,
          portfolioName: String(portfolio.name),
          executedAt: "2024-01-02T00:00:00.000Z",
          portfolioTx: { portfolioId: pid, type: "BUY", instrumentSymbol: "AAPL", quantity: 1, price: 10, currency: "USD" },
        },
      ],
    })
    expect((body.errors as unknown[]) ?? []).toEqual([])
    expect((body.inserted as number)).toBe(1)
    expect(await cashRows(request, a, pid)).toHaveLength(0)

    await request.delete(`${GATEWAY}/api/portfolios/${pid}`, { headers: a })
  })
})