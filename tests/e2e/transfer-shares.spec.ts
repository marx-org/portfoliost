import { expect, test } from "@playwright/test"

/**
 * §74 — the in-kind "Transfer shares" flow against the dockerized stack (real
 * wallets backend): a position moves between portfolios, both legs render in the
 * transactions table, and the cash balance is untouched because a transfer is not
 * a trade.
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

async function getJson(request: import("@playwright/test").APIRequestContext, auth: Record<string, string>, path: string) {
  const res = await request.get(`${GATEWAY}${path}`, { headers: auth })
  expect(res.status()).toBe(200)
  return (await res.json()) as Record<string, unknown>
}

async function balanceOf(request: import("@playwright/test").APIRequestContext, auth: Record<string, string>, id: string, ccy: string) {
  const cash = await getJson(request, auth, `/api/portfolios/${id}/cash`)
  return ((cash.balances as Array<{ currency: string; balance: number }>) ?? []).find((b) => b.currency === ccy)?.balance ?? 0
}

test("transferring shares writes both legs and moves no cash", async ({ page, request }) => {
  const run = Date.now()
  const token = await getBearerToken(request)
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  const post = mk(auth, request)

  const from = await post("/api/portfolios", { name: `E2E Transfer A ${run}`, baseCurrency: "USD" })
  const to = await post("/api/portfolios", { name: `E2E Transfer B ${run}`, baseCurrency: "USD" })
  const fromId = String(from.id)
  const toId = String(to.id)

  await post(`/api/portfolios/${fromId}/cash/deposits`, { amount: 1000, currency: "USD" })
  await post(`/api/portfolios/${fromId}/transactions`, {
    type: "BUY",
    symbol: "AAPL",
    instrumentName: "Apple Inc",
    quantity: 6,
    price: 100,
    currency: "USD",
    assetType: "STOCK",
    executedAt: "2026-01-05T12:00:00Z",
  })
  const cashBefore = await balanceOf(request, auth, fromId, "USD")

  await login(page)
  await page.goto(`/en/portfolios/${fromId}/holdings`)
  await page.getByTestId("transfer-shares-button").click()

  const dialog = page.getByRole("dialog", { name: "Transfer shares" })
  await expect(dialog).toBeVisible({ timeout: 15000 })
  // The instrument list is the portfolio's own holdings, and picking one prefills
  // the whole position — the usual intent.
  await expect(dialog.getByTestId("ts-instrument")).toHaveValue("")
  await dialog.getByTestId("ts-instrument").selectOption("AAPL")
  await expect(dialog.getByTestId("ts-quantity")).toHaveValue("6")

  await dialog.getByTestId("ts-quantity").fill("2")
  await dialog.getByTestId("ts-to-portfolio").selectOption(toId)
  await dialog.getByTestId("ts-notes").fill("moved to IBKR")
  await dialog.getByTestId("ts-submit").click()
  await expect(dialog.getByTestId("ts-result")).toContainText("Moved 2 of AAPL in 1 lot", { timeout: 15000 })
  // The dialog stays open on success so the confirmation is readable; closing it
  // is the user's action.
  await dialog.getByRole("button", { name: "Close modal" }).click()
  await expect(dialog).toBeHidden()

  // No cash moved: a transfer is not a trade.
  expect(await balanceOf(request, auth, fromId, "USD")).toBe(cashBefore)
  expect(await balanceOf(request, auth, toId, "USD")).toBe(0)

  const fromFeed = await getJson(request, auth, `/api/portfolios/${fromId}/transactions?instrumentSymbol=AAPL`)
  const fromTypes = (fromFeed.items as Array<{ type: string }>).map((t) => t.type)
  expect(fromTypes).toContain("TRANSFER_OUT")

  const toFeed = await getJson(request, auth, `/api/portfolios/${toId}/transactions`)
  const inLeg = (toFeed.items as Array<{ type: string; quantity: number; price: number; notes: string | null }>).find((t) => t.type === "TRANSFER_IN")
  expect(inLeg, "the destination got the leg").toBeTruthy()
  expect(inLeg!.quantity).toBe(2)
  // The cost travels with the shares: the source lot was 100.00.
  expect(inLeg!.price).toBe(100)
  expect(inLeg!.notes).toBe("moved to IBKR")

  // Both legs are visible in the tables, labelled as a movement rather than a trade.
  await page.goto(`/en/portfolios/${fromId}/transactions`)
  await expect(page.getByText("Transfer out").first()).toBeVisible({ timeout: 15000 })
  await page.goto(`/en/portfolios/${toId}/transactions`)
  await expect(page.getByText("Transfer in").first()).toBeVisible({ timeout: 15000 })

  // The destination now holds what arrived.
  await page.goto(`/en/portfolios/${toId}/holdings`)
  await expect(page.getByTestId("holdings-row").filter({ hasText: "AAPL" }).first()).toBeVisible({ timeout: 15000 })
})

test("a quantity above the open lots is refused before anything is written", async ({ page, request }) => {
  const run = Date.now()
  const token = await getBearerToken(request)
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  const post = mk(auth, request)

  const from = await post("/api/portfolios", { name: `E2E Transfer Over ${run}`, baseCurrency: "USD" })
  const to = await post("/api/portfolios", { name: `E2E Transfer Over B ${run}`, baseCurrency: "USD" })
  const fromId = String(from.id)
  const toId = String(to.id)
  await post(`/api/portfolios/${fromId}/transactions`, {
    type: "BUY",
    symbol: "MSFT",
    quantity: 4,
    price: 50,
    currency: "USD",
    assetType: "STOCK",
    executedAt: "2026-02-01T12:00:00Z",
  })

  await login(page)
  await page.goto(`/en/portfolios/${fromId}/holdings`)
  await page.getByTestId("transfer-shares-button").click()
  const dialog = page.getByRole("dialog", { name: "Transfer shares" })
  await expect(dialog).toBeVisible({ timeout: 15000 })
  await dialog.getByTestId("ts-instrument").selectOption("MSFT")
  await dialog.getByTestId("ts-quantity").fill("40")
  await dialog.getByTestId("ts-to-portfolio").selectOption(toId)
  await expect(dialog.getByTestId("ts-over-max")).toContainText("Only 4 of MSFT are open")
  await expect(dialog.getByTestId("ts-submit")).toBeDisabled()

  // And the server agrees: the same request rejected by the client is rejected
  // by the backend, with nothing half-written.
  const res = await request.post(`${GATEWAY}/api/portfolios/${fromId}/transfers`, {
    headers: auth,
    data: { symbol: "MSFT", quantity: 40, toPortfolioId: toId },
  })
  expect(res.status()).toBe(422)
  const body = (await res.json()) as { code?: string }
  expect(body.code).toBe("transfer_exceeds_open_lots")

  const feed = await getJson(request, auth, `/api/portfolios/${fromId}/transactions`)
  expect((feed.items as Array<{ type: string }>).some((t) => t.type === "TRANSFER_OUT")).toBe(false)
})
