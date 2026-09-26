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
