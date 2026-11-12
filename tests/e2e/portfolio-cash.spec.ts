import { expect, test } from "@playwright/test"

/** §62.8/62.9 — per-portfolio cash tab against the dockerized stack (real wallets
 * backend, plan §62.3). Cash now lives on the portfolio: deposit/withdraw/transfer
 * move the per-currency ledger, the balance block + history chart + transactions
 * table reflect it, and the global cash feed lists cross-portfolio rows.
 * Self-owned portfolios (Top10 is never mutated). */

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

function mk(auth: Record<string, string>, request: import("@playwright/test").APIRequestContext) {
  return async (path: string, data: unknown) => {
    const res = await request.post(`${GATEWAY}${path}`, { headers: auth, data })
    expect(res.status(), `POST ${path}: ${await res.text()}`).toBeLessThan(300)
    return (await res.json()) as Record<string, unknown>
  }
}

async function cashOf(request: import("@playwright/test").APIRequestContext, auth: Record<string, string>, id: string) {
  const res = await request.get(`${GATEWAY}/api/portfolios/${id}/cash`, { headers: auth })
  expect(res.status()).toBe(200)
  return (await res.json()) as { balances: Array<{ currency: string; balance: number }> }
}
async function balanceOf(request: import("@playwright/test").APIRequestContext, auth: Record<string, string>, id: string, ccy: string) {
  const cash = await cashOf(request, auth, id)
  return cash.balances.find((b) => b.currency === ccy)?.balance ?? 0
}

test("cash tab: deposit moves the balance and lists a row", async ({ page, request }) => {
  const run = Date.now()
  const token = await getBearerToken(request)
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  const post = mk(auth, request)

  const portfolio = await post("/api/portfolios", { name: `E2E Cash ${run}`, baseCurrency: "USD" })
  const pid = String(portfolio.id)
  // fund so a later over-withdrawal can go negative
  await post(`/api/portfolios/${pid}/cash/deposits`, { amount: 500, currency: "USD" })
  expect(await balanceOf(request, auth, pid, "USD")).toBe(500)

  await login(page)
  await page.goto(`/en/portfolios/${pid}/cash`)
  await expect(page.getByTestId("cash-tab-total")).toBeVisible({ timeout: 15000 })
  // per-currency balance row
  await expect(page.getByTestId("cash-balance-USD")).toContainText("500")

  // deposit via the modal
  await page.getByTestId("cash-tab-deposit").click()
  const dialog = page.getByRole("dialog", { name: "Cash movement" })
  await expect(dialog).toBeVisible()
  await dialog.getByTestId("pc-amount").fill("100")
  await dialog.getByRole("button", { name: "Deposit", exact: true }).click()
  await expect(dialog).not.toBeVisible({ timeout: 10000 })

  // the deposit row appears and the balance moves
  await expect(page.getByTestId("cash-balance-USD")).toContainText("600", { timeout: 10000 })
  await expect(page.locator("tbody tr", { hasText: "Deposit" }).first()).toBeVisible({ timeout: 10000 })
  expect(await balanceOf(request, auth, pid, "USD")).toBe(600)

  // history chart renders (a recompute button on the chart)
  await expect(page.getByTestId("cash-chart-recompute")).toBeVisible()

  await request.delete(`${GATEWAY}/api/portfolios/${pid}`, { headers: auth }).catch(() => {})
})

test("cash settlement currency: an account displayed in PLN that settles in USD", async ({ page, request }) => {
  test.setTimeout(120_000)
  const run = Date.now()
  const token = await getBearerToken(request)
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  const post = mk(auth, request)

  // IBKR-shaped: the portfolio is displayed in PLN, the account holds USD.
  const portfolio = await post("/api/portfolios", { name: `E2E USD settlement ${run}`, baseCurrency: "PLN" })
  const pid = String(portfolio.id)

  try {
    await login(page)
    await page.goto(`/en/portfolios/${pid}`)
    await page.getByRole("button", { name: "Rename", exact: true }).click()
    const settings = page.getByRole("dialog", { name: "Rename portfolio" })
    await expect(settings).toBeVisible()
    await settings.getByTestId("cash-settlement-currency").selectOption("USD")
    await settings.getByRole("button", { name: "Save", exact: true }).click()
    await expect(settings).not.toBeVisible({ timeout: 10_000 })

    const detail = await request.get(`${GATEWAY}/api/portfolios/${pid}`, { headers: auth })
    expect((await detail.json()).cashCurrency).toBe("USD")

    // The deposit modal offers only the settlement currency.
    await page.goto(`/en/portfolios/${pid}/cash`)
    await expect(page.getByTestId("cash-tab-total")).toBeVisible({ timeout: 15000 })
    await page.getByTestId("cash-tab-deposit").click()
    const dialog = page.getByRole("dialog", { name: "Cash movement" })
    const currency = dialog.getByTestId("pc-currency")
    await expect(currency.locator("option")).toHaveCount(1)
    await expect(currency).toHaveValue("USD")

    await dialog.getByTestId("pc-amount").fill("100")
    await dialog.getByTestId("pc-description").fill(`settlement ${run}`)
    await dialog.getByRole("button", { name: "Deposit", exact: true }).click()
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })

    // One balance, in the settlement currency; the total is that balance revalued
    // to the display base.
    const cash = await cashOf(request, auth, pid)
    expect(cash.balances).toEqual([{ currency: "USD", balance: 100 }])
    expect(cash.baseCurrency).toBe("PLN")

    const rejected = await request.post(`${GATEWAY}/api/portfolios/${pid}/cash/deposits`, {
      headers: auth,
      data: { amount: 50, currency: "PLN" },
    })
    expect(rejected.status()).toBe(422)
  } finally {
    await request.delete(`${GATEWAY}/api/portfolios/${pid}`, { headers: auth }).catch(() => {})
  }
})

test("cash kinds: interest, charge and conversion move the ledger and render in the table", async ({ page, request }) => {
  test.setTimeout(120_000)
  const run = Date.now()
  const token = await getBearerToken(request)
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  const post = mk(auth, request)

  const portfolio = await post("/api/portfolios", { name: `E2E Cash Kinds ${run}`, baseCurrency: "USD" })
  const pid = String(portfolio.id)
  await post(`/api/portfolios/${pid}/cash/deposits`, { amount: 1000, currency: "USD" })

  try {
    await login(page)
    await page.goto(`/en/portfolios/${pid}/cash`)
    await expect(page.getByTestId("cash-tab-total")).toBeVisible({ timeout: 15000 })
    const dialog = page.getByRole("dialog", { name: "Cash movement" })

    // Interest is signed: the same form accepts a credit and a charge.
    await page.getByTestId("cash-tab-interest").click()
    await expect(dialog).toBeVisible()
    await dialog.getByTestId("pc-amount").fill("12.5")
    await dialog.getByRole("button", { name: "Interest", exact: true }).click()
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })
    expect(await balanceOf(request, auth, pid, "USD")).toBe(1012.5)

    await page.getByTestId("cash-tab-interest").click()
    await dialog.getByTestId("pc-amount").fill("-3")
    await dialog.getByRole("button", { name: "Interest", exact: true }).click()
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })
    expect(await balanceOf(request, auth, pid, "USD")).toBe(1009.5)

    // A charge attached to no transaction is booked as a debit from its magnitude.
    await page.getByTestId("cash-tab-fee").click()
    await dialog.getByTestId("pc-amount").fill("7.4")
    await dialog.getByRole("button", { name: "Charge", exact: true }).click()
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })
    expect(await balanceOf(request, auth, pid, "USD")).toBe(1002.1)

    // A conversion is two legs: 1000 EUR handed over, 1100 USD received.
    await page.getByTestId("cash-tab-conversion").click()
    await dialog.getByTestId("pc-currency").selectOption("EUR")
    await dialog.getByTestId("pc-amount").fill("1000")
    await dialog.getByTestId("pc-to-currency").selectOption("USD")
    await dialog.getByTestId("pc-to-amount").fill("1100")
    await dialog.getByTestId("pc-description").fill(`conversion ${run}`)
    await dialog.getByRole("button", { name: "Conversion", exact: true }).click()
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })
    expect(await balanceOf(request, auth, pid, "USD")).toBe(2102.1)
    expect(await balanceOf(request, auth, pid, "EUR")).toBe(-1000)

    // The broker's own conversion residual is a correction of one balance.
    await page.getByTestId("cash-tab-conversion").click()
    await dialog.getByTestId("pc-amount").fill("60.5")
    await dialog.getByTestId("pc-description").fill(`residual ${run}`)
    await dialog.getByRole("button", { name: "Conversion", exact: true }).click()
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })
    expect(await balanceOf(request, auth, pid, "USD")).toBe(2041.6)

    // The table shows the kind and, for a real exchange, the leg received.
    const rows = page.locator("tbody tr")
    await expect(rows.filter({ hasText: "Interest" }).first()).toBeVisible({ timeout: 10_000 })
    await expect(rows.filter({ hasText: "Fee" }).first()).toBeVisible({ timeout: 10_000 })
    await expect(rows.filter({ hasText: `conversion ${run}` }).first()).toContainText("→")
    // The correction has no second leg, so it shows no arrow.
    await expect(rows.filter({ hasText: `residual ${run}` }).first()).not.toContainText("→")

    const list = await request.get(`${GATEWAY}/api/portfolios/${pid}/cash/transactions?limit=50`, { headers: auth })
    expect(list.status()).toBe(200)
    const items = ((await list.json()) as { items: Array<Record<string, unknown>> }).items
    const kinds = new Set(items.map((t) => t.type))
    expect(kinds.has("INTEREST")).toBe(true)
    expect(kinds.has("FEE")).toBe(true)
    expect(kinds.has("FX_CONVERSION")).toBe(true)
    const conversion = items.find((t) => t.type === "FX_CONVERSION" && t.toCurrency === "USD" && String(t.currency) === "EUR")
    expect(Number(conversion!.toAmount)).toBe(1100)
    expect(Number(conversion!.amount)).toBe(-1000)
  } finally {
    await request.delete(`${GATEWAY}/api/portfolios/${pid}`, { headers: auth }).catch(() => {})
  }
})

test("cash-base-only settings restrict cash, keep foreign trades, and transfer in the destination base", async ({ page, request }) => {
  test.setTimeout(120_000)
  const run = Date.now()
  const token = await getBearerToken(request)
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  const post = mk(auth, request)
  const source = await post("/api/portfolios", { name: `E2E PLN cash only ${run}`, baseCurrency: "PLN" })
  const destination = await post("/api/portfolios", { name: `E2E USD destination ${run}`, baseCurrency: "USD" })
  const sourceId = String(source.id)
  const destinationId = String(destination.id)
  let tradeId: string | null = null

  try {
    await login(page)
    await page.goto(`/en/portfolios/${sourceId}`)
    await page.getByRole("button", { name: "Rename", exact: true }).click()
    const settings = page.getByRole("dialog", { name: "Rename portfolio" })
    await expect(settings).toBeVisible()
    await settings.getByTestId("cash-base-currency-only").check()
    await settings.getByRole("button", { name: "Save", exact: true }).click()
    await expect(settings).not.toBeVisible()

    const detail = await request.get(`${GATEWAY}/api/portfolios/${sourceId}`, { headers: auth })
    expect(detail.status()).toBe(200)
    expect((await detail.json()).cashBaseCurrencyOnly).toBe(true)

    await page.goto(`/en/portfolios/${sourceId}/cash`)
    await expect(page.getByTestId("cash-tab-total")).toBeVisible({ timeout: 15000 })
    const rejectedDeposit = await request.post(`${GATEWAY}/api/portfolios/${sourceId}/cash/deposits`, {
      headers: auth,
      data: { amount: 100, currency: "USD" },
    })
    expect(rejectedDeposit.status()).toBe(422)

    await page.getByTestId("cash-tab-deposit").click()
    const depositDialog = page.getByRole("dialog", { name: "Cash movement" })
    const sourceCurrency = depositDialog.getByTestId("pc-currency")
    await expect(sourceCurrency.locator("option")).toHaveCount(1)
    await expect(sourceCurrency).toHaveValue("PLN")
    await depositDialog.getByTestId("pc-description").fill(`cash-only ${run}`)
    await depositDialog.getByTestId("pc-amount").fill("50")
    await depositDialog.getByTestId("pc-submit").click()
    await expect(depositDialog).not.toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId("cash-balance-PLN")).toContainText("50")

    const depositRow = page.locator("tbody tr", { hasText: "Deposit" }).first()
    await expect(depositRow).toBeVisible({ timeout: 10000 })
    await depositRow.getByRole("button", { name: "Edit" }).click()
    const editDialog = page.getByRole("dialog", { name: "Cash movement" })
    await expect(editDialog.getByTestId("pc-currency").locator("option")).toHaveCount(1)
    await expect(editDialog.getByTestId("pc-currency")).toHaveValue("PLN")
    await editDialog.getByRole("button", { name: "Cancel", exact: true }).click()

    await page.goto("/en/investments/transactions/cash")
    const globalRow = page.locator("tbody tr", { hasText: `cash-only ${run}` }).first()
    await expect(globalRow).toBeVisible({ timeout: 10000 })
    await globalRow.getByRole("button", { name: "Edit" }).click()
    const globalEdit = page.getByRole("dialog", { name: "Cash movement" })
    await expect(globalEdit.getByTestId("pc-currency").locator("option")).toHaveCount(1)
    await expect(globalEdit.getByTestId("pc-currency")).toHaveValue("PLN")
    await globalEdit.getByRole("button", { name: "Cancel", exact: true }).click()

    await page.goto(`/en/portfolios/${sourceId}/cash`)
    await page.getByTestId("cash-tab-transfer").click()
    const transferDialog = page.getByRole("dialog", { name: "Cash movement" })
    const targetSelect = transferDialog.getByTestId("pc-to-portfolio")
    await targetSelect.selectOption(destinationId)
    await transferDialog.getByTestId("pc-amount").fill("4")
    await transferDialog.getByTestId("pc-leg-fx-manual").click()
    await transferDialog.getByTestId("pc-target-rate").fill("0.25")
    await expect(transferDialog.getByTestId("pc-submit")).toBeEnabled()
    await transferDialog.getByTestId("pc-submit").click()
    await expect(transferDialog).not.toBeVisible({ timeout: 10000 })

    const sourceCash = await cashOf(request, auth, sourceId)
    expect(sourceCash.balances).toHaveLength(1)
    expect(sourceCash.balances[0]).toMatchObject({ currency: "PLN", balance: 46 })
    const destinationCash = await cashOf(request, auth, destinationId)
    expect(destinationCash.balances).toEqual([{ currency: "USD", balance: 1 }])

    // The cash policy must not leak into the separate investment transaction form/API.
    const foreignTrade = await request.post(`${GATEWAY}/api/portfolios/${sourceId}/transactions`, {
      headers: auth,
      data: { type: "BUY", symbol: "AAPL", quantity: 1, price: 10, currency: "USD", rateSource: "manual", exchangeRate: 4 },
    })
    expect(foreignTrade.status(), await foreignTrade.text()).toBe(201)
    const body = await foreignTrade.json() as { id?: string }
    tradeId = body.id ?? null
  } finally {
    if (tradeId) await request.delete(`${GATEWAY}/api/portfolios/${sourceId}/transactions/${tradeId}`, { headers: auth }).catch(() => {})
    await request.delete(`${GATEWAY}/api/portfolios/${sourceId}`, { headers: auth }).catch(() => {})
    await request.delete(`${GATEWAY}/api/portfolios/${destinationId}`, { headers: auth }).catch(() => {})
  }
})

test("cash tab: transfer moves both portfolios' balances", async ({ page, request }) => {
  const run = Date.now()
  const token = await getBearerToken(request)
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  const post = mk(auth, request)

  const src = await post("/api/portfolios", { name: `E2E Cash src ${run}`, baseCurrency: "USD" })
  const dst = await post("/api/portfolios", { name: `E2E Cash dst ${run}`, baseCurrency: "USD" })
  const srcId = String(src.id)
  const dstId = String(dst.id)
  await post(`/api/portfolios/${srcId}/cash/deposits`, { amount: 400, currency: "USD" })

  await login(page)
  // visit the investments list first so the store loads every portfolio (the
  // transfer modal lists store.portfolios as target candidates)
  await page.goto("/en/investments")
  await expect(page.getByTestId("card-cash-group").first()).toBeVisible({ timeout: 15000 })
  await page.goto(`/en/portfolios/${srcId}/cash`)
  await expect(page.getByTestId("cash-tab-total")).toBeVisible({ timeout: 15000 })

  await page.getByTestId("cash-tab-transfer").click()
  const dialog = page.getByRole("dialog", { name: "Cash movement" })
  await expect(dialog).toBeVisible()
  await dialog.getByTestId("pc-amount").fill("150")
  const toSel = dialog.getByTestId("pc-to-portfolio")
  const dstOption = toSel.locator("option", { hasText: `E2E Cash dst ${run}` })
  await expect(dstOption).toBeAttached({ timeout: 10000 })
  await toSel.selectOption({ label: `E2E Cash dst ${run}` })
  await dialog.getByRole("button", { name: "Transfer", exact: true }).click()
  await expect(dialog).not.toBeVisible({ timeout: 10000 })

  await expect.poll(async () => balanceOf(request, auth, dstId, "USD"), { timeout: 15000 }).toBe(150)
  await expect.poll(async () => balanceOf(request, auth, srcId, "USD"), { timeout: 15000 }).toBe(250)
  // the source tab shows a Transfer row
  await expect(page.locator("tbody tr", { hasText: "Transfer" }).first()).toBeVisible()

  await request.delete(`${GATEWAY}/api/portfolios/${srcId}`, { headers: auth }).catch(() => {})
  await request.delete(`${GATEWAY}/api/portfolios/${dstId}`, { headers: auth }).catch(() => {})
})

test("cash tab: over-withdrawal shows the negative-cash badge on a non-margin portfolio", async ({ page, request }) => {
  const run = Date.now()
  const token = await getBearerToken(request)
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  const post = mk(auth, request)

  const portfolio = await post("/api/portfolios", { name: `E2E Cash neg ${run}`, baseCurrency: "USD", isMarginEnabled: false })
  const pid = String(portfolio.id)
  await post(`/api/portfolios/${pid}/cash/deposits`, { amount: 100, currency: "USD" })

  await login(page)
  await page.goto(`/en/portfolios/${pid}/cash`)
  await expect(page.getByTestId("cash-tab-total")).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId("cash-negative-badge")).toBeHidden()

  // withdraw more than held → negative balance
  await page.getByTestId("cash-tab-withdraw").click()
  const dialog = page.getByRole("dialog", { name: "Cash movement" })
  await dialog.getByTestId("pc-amount").fill("500")
  await dialog.getByRole("button", { name: "Withdraw", exact: true }).click()
  await expect(dialog).not.toBeVisible({ timeout: 10000 })

  await expect(page.getByTestId("cash-negative-badge")).toBeVisible({ timeout: 10000 })
  expect(await balanceOf(request, auth, pid, "USD")).toBe(-400)

  await request.delete(`${GATEWAY}/api/portfolios/${pid}`, { headers: auth }).catch(() => {})
})

test("cash tab: edit + delete a cash row", async ({ page, request }) => {
  const run = Date.now()
  const token = await getBearerToken(request)
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  const post = mk(auth, request)

  const portfolio = await post("/api/portfolios", { name: `E2E Cash ed ${run}`, baseCurrency: "USD" })
  const pid = String(portfolio.id)
  const ts = Date.now()
  await post(`/api/portfolios/${pid}/cash/deposits`, { amount: 100, currency: "USD", description: `sal ${ts}` })
  await post(`/api/portfolios/${pid}/cash/deposits`, { amount: 100, currency: "USD", description: `bon ${ts}` })

  await login(page)
  await page.goto(`/en/portfolios/${pid}/cash`)
  await expect(page.locator("tbody tr", { hasText: `sal ${ts}` })).toBeVisible({ timeout: 15000 })

  // edit — the full Deposit/Withdraw/Transfer modal in edit mode
  await page.locator("tbody tr", { hasText: `sal ${ts}` }).getByRole("button", { name: "Edit" }).click()
  const edit = page.getByTestId("pc-form")
  await expect(edit).toBeVisible()
  await edit.getByTestId("pc-description").fill(`sal ${ts} edited`)
  await edit.getByTestId("pc-amount").fill("250")
  await edit.getByTestId("pc-submit").click()
  await expect(page.locator("tbody tr", { hasText: `sal ${ts} edited` })).toBeVisible({ timeout: 10000 })
  await expect(page.locator("tbody tr", { hasText: `sal ${ts} edited` })).toContainText("$250.00")

  // delete the bond row
  await page.locator("tbody tr", { hasText: `bon ${ts}` }).getByRole("button", { name: "Delete" }).click()
  const confirm = page.getByRole("dialog", { name: /Delete/ })
  await confirm.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(page.locator("tbody tr", { hasText: `bon ${ts}` })).toHaveCount(0, { timeout: 10000 })

  await request.delete(`${GATEWAY}/api/portfolios/${pid}`, { headers: auth }).catch(() => {})
})

test("global cash feed lists cross-portfolio rows with the portfolio name", async ({ page, request }) => {
  const run = Date.now()
  const token = await getBearerToken(request)
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  const post = mk(auth, request)

  const a = await post("/api/portfolios", { name: `E2E Feed A ${run}`, baseCurrency: "USD" })
  await post(`/api/portfolios/${String(a.id)}/cash/deposits`, { amount: 100, currency: "USD", description: `feedA ${run}` })

  await login(page)
  await page.goto("/en/investments/transactions/cash")
  await expect(page.getByTestId("table-th-portfolioName")).toBeVisible({ timeout: 15000 })
  await expect(page.locator("tbody tr", { hasText: `feedA ${run}` })).toBeVisible({ timeout: 10000 })
  await expect(page.locator("tbody tr", { hasText: `feedA ${run}` })).toContainText(`E2E Feed A ${run}`)

  await request.delete(`${GATEWAY}/api/portfolios/${String(a.id)}`, { headers: auth }).catch(() => {})
})

test("cash tab: the transactions table has a Date column and sorts on every column", async ({ page, request }) => {
  const run = Date.now()
  const token = await getBearerToken(request)
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  const post = mk(auth, request)

  const portfolio = await post("/api/portfolios", { name: `E2E Sort ${run}`, baseCurrency: "USD" })
  const pid = String(portfolio.id)
  // explicit transactionDates so both the date and the amount orders are
  // deterministic
  await post(`/api/portfolios/${pid}/cash/deposits`, { amount: 300, currency: "USD", description: `big ${run}`, transactionDate: "2026-05-01" })
  await post(`/api/portfolios/${pid}/cash/deposits`, { amount: 100, currency: "USD", description: `small ${run}`, transactionDate: "2026-06-01" })
  await post(`/api/portfolios/${pid}/cash/deposits`, { amount: 200, currency: "USD", description: `mid ${run}`, transactionDate: "2026-07-01" })

  await login(page)
  await page.goto(`/en/portfolios/${pid}/cash`)
  await expect(page.getByTestId("cash-tab-total")).toBeVisible({ timeout: 15000 })

  // the date column the tab used to be missing
  await expect(page.getByTestId("table-th-date")).toBeVisible()
  await expect(page.getByTestId("table-th-date")).toContainText("↓")
  await expect(page.getByTestId("table-th-balance")).toBeVisible()
  // no Portfolio column in a single-portfolio tab
  await expect(page.getByTestId("table-th-portfolioName")).toHaveCount(0)
  // the date cell is populated on a real row
  await expect(page.locator("tbody tr", { hasText: `small ${run}` })).toContainText("Jun 1, 2026")

  // default order is date desc → mid (2026-07-01) first
  await expect(page.locator("tbody tr").nth(0)).toContainText(`mid ${run}`)

  // sorting actually reorders the rows
  await page.getByTestId("table-th-amount").locator("button").click()
  await expect(page.getByTestId("table-th-amount")).toContainText("↑")
  await expect(page.locator("tbody tr").nth(0)).toContainText(`small ${run}`)
  await expect(page.locator("tbody tr").nth(2)).toContainText(`big ${run}`)

  // every other data column is sortable too
  for (const key of ["date", "type", "balance"]) {
    await page.getByTestId(`table-th-${key}`).locator("button").click()
    await expect(page.getByTestId(`table-th-${key}`)).toContainText("↑")
  }

  await request.delete(`${GATEWAY}/api/portfolios/${pid}`, { headers: auth }).catch(() => {})
})
