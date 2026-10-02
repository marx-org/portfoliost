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

test("sidebar matches example-service: no Wallets/News, Report bug; cash as a card + per-portfolio groups", async ({ page }) => {
  await login(page)

  const nav = page.getByRole("navigation", { name: "Main navigation" })
  await expect(nav.getByRole("link", { name: /Wallets/ })).toHaveCount(0)
  await expect(nav.getByRole("link", { name: /News/ })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Report bug" })).toHaveCount(0)

  await expect(page.getByRole("heading", { name: "Investment Portfolios", exact: true })).toBeVisible()
  // the portfolio-native cash summary card (no wallet section anymore)
  await expect(page.getByTestId("cash-balance")).toBeVisible({ timeout: 10000 })
  // a portfolio card carries its own cash group with Deposit/Withdraw/Transfer
  await expect(page.getByTestId("card-cash-group").first()).toBeVisible({ timeout: 10000 })
})

test("portfolio card shows chart, quick links and manage menu", async ({ page }) => {
  await login(page)

  const card = page.locator(".card", { hasText: "Top10" }).first()
  await expect(card.getByRole("button", { name: "Add Position" })).toBeVisible()
  await expect(card.getByRole("link", { name: "Analytics" })).toBeVisible()
  await expect(card.getByRole("link", { name: "News" })).toBeVisible()
  await expect(card.getByRole("link", { name: "Calendar" })).toBeVisible()
  await expect(card.getByText("Performance")).toBeVisible()

  await card.getByRole("button", { name: "Add Position" }).click()
  const dialog = page.getByRole("dialog", { name: "Add Position" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId("add-position-instrument")).toContainText("Stock, ETF or crypto")
  await expect(dialog.getByTestId("add-position-option")).toContainText("Option")
  await expect(dialog.getByTestId("add-position-cfd")).toContainText("CFD")
  await page.getByRole("button", { name: "Close modal" }).click()
  await expect(dialog).toHaveCount(0)

  await card.getByRole("button", { name: "Portfolio actions" }).click()
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Export as CSV" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Export as XML" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Export as JSON" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeVisible()
})

test("card sparkline remounts on timeframe switch (§53.3)", async ({ page }) => {
  await login(page)

  const card = page.locator(".card", { hasText: "Top10" }).first()
  const oldChart = await card.locator(".vue-apexcharts").first().elementHandle()
  expect(oldChart).not.toBeNull()

  await card.getByRole("button", { name: "1Y", exact: true }).click()

  // §48.6e B3: vue3-apexcharts never pushes a prop update into the mounted
  // chart, so the chartKey fingerprint (timeframe + series shape) must replace
  // the running instance — the old chart node detaches from the DOM.
  await expect
    .poll(async () => (oldChart ? await oldChart.evaluate((el) => el.isConnected) : false))
    .toBe(false)
  await expect(card.locator(".vue-apexcharts").first()).toBeVisible()
})

test("create, rename and delete a portfolio from the card manage menu", async ({ page }) => {
  const name = `E2E Manage ${Date.now()}`
  const renamed = `${name} renamed`
  await login(page)

  await page.getByRole("button", { name: "Create Investment Portfolio" }).click()
  await page.getByRole("textbox", { name: "Name" }).fill(name)
  await page.getByRole("button", { name: "Create", exact: true }).click()
  let card = page.locator(".card", { hasText: name })
  await expect(card).toBeVisible()

  await card.getByRole("button", { name: "Portfolio actions" }).click()
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Rename portfolio" })).toBeVisible()
  await page.getByRole("textbox", { name: "Name" }).fill(renamed)
  await page.getByRole("button", { name: "Save" }).click()
  card = page.locator(".card", { hasText: renamed })
  await expect(card).toBeVisible()

  await card.getByRole("button", { name: "Portfolio actions" }).click()
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Delete portfolio" })).toBeVisible()
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(page.locator(".card", { hasText: renamed })).toHaveCount(0)
})

test("holdings: no AI premium banner, customize columns, sort and export", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).first().click()
  await expect(page).toHaveURL(/holdings/)

  await expect(page.getByText("AI Insight")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Upgrade to Premium" })).toHaveCount(0)

  await page.getByRole("button", { name: /Customize/ }).click()
  await page.getByLabel("Market Value").uncheck()
  await expect(page.getByRole("columnheader", { name: "Market Value" })).toHaveCount(0)
  await page.locator("div.fixed.inset-0.z-20").click()

  await page.getByRole("columnheader", { name: /Quantity/ }).click()
  await expect(page.getByRole("columnheader", { name: /Quantity/ })).toHaveAttribute("aria-sort", "ascending")

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export", exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/positions\.csv$/)
})

/** §81.3 — the Drawdown card's Current Drawdown is a peak-to-trough over the
 * flow-neutral TWR index, not over raw portfolio value. Taking the peak over
 * `value` lets every deposit raise the running maximum, so a deposit made
 * during a drawdown *shrinks* the reported drawdown by roughly its own size —
 * and the card's own Max Drawdown tile (fed by the backend's flow-neutral
 * metric) then disagrees with it on one screen.
 *
 * The compose seed has no cash flows at all — every portfolio's net_flow is 0,
 * so value and TWR are proportional and the two paths cannot be told apart from
 * seeded data. The test therefore splices a flow-bearing series into the
 * analytics response the SPA receives:
 *
 *   100 → 50 → +100 → 150 → 75
 *
 * The deposit lands on a flat price day and the portfolio then halves, so the
 * flow-neutral index is [100, 50, 50, 25] → −75%, while the raw-value peak of
 * 150 would report −50%. */
test("performance: Current Drawdown is measured on the TWR index, not raw value (§81.3)", async ({ page, request }) => {
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  const token = ((await res.json()) as { access_token?: string }).access_token ?? ""
  const auth = { Authorization: `Bearer ${token}` }

  const pfRes = await request.get(`${GATEWAY}/api/portfolios`, { headers: auth })
  const top10 = ((await pfRes.json()) as Array<{ id: string; name: string }>).find((p) => p.name === "Top10")
  expect(top10, "seeded Top10 portfolio").toBeTruthy()

  const FLOW_BEARING = [
    { date: "2026-01-01", value: 100, cumulativeTwr: 100 },
    { date: "2026-01-02", value: 50, cumulativeTwr: 50 },
    { date: "2026-01-03", value: 150, cumulativeTwr: 50 },
    { date: "2026-01-04", value: 75, cumulativeTwr: 25 },
  ]
  // Guard the premise: the injected series must make the two paths disagree, or
  // the assertion below would pass on either implementation.
  const drawdownOver = (xs: number[]) => (xs[xs.length - 1] / Math.max(...xs) - 1) * 100
  expect(drawdownOver(FLOW_BEARING.map((p) => p.cumulativeTwr))).toBeCloseTo(-75, 10)
  expect(drawdownOver(FLOW_BEARING.map((p) => p.value))).toBeCloseTo(-50, 10)

  await page.route(`**/api/portfolios/${top10!.id}/analytics*`, async (route) => {
    const upstream = await route.fetch()
    const body = (await upstream.json()) as { performance?: { timeSeries?: unknown[] } }
    body.performance = { ...body.performance, timeSeries: FLOW_BEARING }
    await route.fulfill({ response: upstream, json: body })
  })

  // Max Drawdown comes from a different endpoint. Stub it with the same
  // flow-neutral figure so the cross-tile check below compares like with like:
  // the card must not show two drawdowns measured on different series.
  await page.route(`**/api/portfolios/${top10!.id}/risk-metrics*`, async (route) => {
    const upstream = await route.fetch()
    const body = (await upstream.json()) as { maxDrawdown?: number }
    await route.fulfill({ response: upstream, json: { ...body, maxDrawdown: -0.75 } })
  })

  await login(page)
  await page.goto(`/en/portfolios/${top10!.id}/performance`)

  const current = page.getByTestId("performance-current-drawdown")
  await expect(current).toBeVisible({ timeout: 30_000 })
  await expect(current).toHaveText("-75.00%")

  // The two tiles on the card are now on one series: the current drawdown
  // cannot be deeper than the maximum one.
  const max = page.getByTestId("performance-max-drawdown")
  await expect(max).toBeVisible()
  await expect(max).toHaveText("-75.00%")
})
