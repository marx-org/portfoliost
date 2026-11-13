import { expect, test } from "@playwright/test"

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"

/**
 * §83.6 — the combined (all-portfolios) chart moved from the investments
 * dashboard to its own tab at `/en/investments/performance`, which renders the
 * same endpoint through the same chart component. Both original cases are kept;
 * what is added is the check that the tab is NOT a page of dashes.
 *
 * That last one matters more than it looks: every step of §83 could "succeed"
 * while the aggregate returned nulls, and a tab that renders four `—` looks
 * exactly like a working page. §83.6's own note calls this the failure mode.
 */
async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

async function openTab(page: import("@playwright/test").Page) {
  await page.goto("/en/investments/performance")
  await expect(page.getByTestId("total-perf-overview")).toBeVisible({ timeout: 30_000 })
}

/**
 * The Performance Chart card, scoped by its own Customize button. The page hosts
 * several charts (the value chart, the Returns Chart's apexchart), so a bare
 * `.apexcharts-canvas` would measure the wrong one — the same trap §59.2 fell
 * into with a tooltip query.
 */
function chartCard(page: import("@playwright/test").Page) {
  return page.locator("div.card").filter({ has: page.getByTestId("total-perf-controls-customize") })
}

test("combined (all-portfolios) chart renders on the cumulative performance tab", async ({ page }) => {
  await login(page)
  await openTab(page)

  await expect(chartCard(page).locator(".apexcharts-canvas").first()).toBeVisible({ timeout: 30_000 })
})

test("the cumulative tab shows its currency and selects timeframes (§46.7)", async ({ page }) => {
  await login(page)
  await openTab(page)

  const block = chartCard(page)
  await expect(block.locator("h2")).toContainText("Performance Chart: USD")

  const all = block.getByRole("button", { name: "ALL" })
  await expect(all).toHaveAttribute("aria-pressed", "true")

  await block.getByRole("button", { name: "1Y" }).click()
  await expect(block.getByRole("button", { name: "1Y" })).toHaveAttribute("aria-pressed", "true")
  await expect(all).toHaveAttribute("aria-pressed", "false")
  await expect(block.locator(".apexcharts-canvas").first()).toBeVisible({ timeout: 30_000 })
})

test("every §82 tile renders a NUMBER on the aggregate, not a dash", async ({ page }) => {
  await login(page)
  await openTab(page)

  // The seeded compose portfolios carry 49 snapshot points — below §82.1's
  // 60-point withholding floor — so TWR p.a. may legitimately be withheld HERE.
  // The others are not withheld by any predicate and a dash would be a bug.
  for (const id of [
    "total-perf-overview-net-gain",
    "total-perf-overview-net-invested",
    "total-perf-overview-xirr",
    "total-performance-max-drawdown",
    "total-performance-current-drawdown",
  ]) {
    const tile = page.getByTestId(id)
    await expect(tile, id).toBeVisible({ timeout: 30_000 })
    await expect(tile, id).not.toHaveText("—")
  }
})

test("the Yearly view is available on ALL and reconciles to the Net gain tile", async ({ page, request }) => {
  await login(page)
  await openTab(page)

  const yearly = page.getByTestId("total-perf-returns-mode-yearly")
  await expect(yearly).toBeEnabled()
  await yearly.click()

  const totalEl = page.getByTestId("total-perf-returns-yearly-total-gain")
  await expect(totalEl).toBeVisible({ timeout: 30_000 })
  const total = await totalEl.innerText()

  const gain = await page.getByTestId("total-perf-overview-net-gain").innerText()

  /**
   * §82.5 (PROD): the Σ of the yearly rows is `net(last) − net(first)` while the
   * tile is gain since inception, so they are the same number only when the
   * series opens at net 0. Asserting equality outright passed on the seeded
   * compose data and is false on any account whose first snapshot already
   * carries a net — which is what the unit tests call out. The honest invariant
   * is the difference: Σ − tile = −openingNet.
   */
  const token = await page.evaluate(() => localStorage.getItem("portfoliost_token"))
  const res = await request.get(`${GATEWAY}/api/portfolios/merged?timeframe=ALL`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), await res.text()).toBe(true)
  const perf = (await res.json() as { performance?: { timeSeries?: Array<{ value?: number; invested?: number | null }> } }).performance
  const series = perf?.timeSeries ?? []
  expect(series.length).toBeGreaterThan(0)
  const openingNet = (series[0].value ?? 0) - (series[0].invested ?? 0)

  const money = (s: string): number => Number(s.replace(/[^0-9.,-]/g, "").replace(/,/g, ""))
  if (Math.abs(openingNet) < 0.005) {
    expect(total).toBe(gain)
  } else {
    // Both sides are rendered amounts: the yearly Σ and the tile are each rounded
    // to cents for display, so the identity can be off by up to one cent. Measured
    // on this stack: Σ 309.01, tile 309.01, openingNet -0.00999999999999994 — a
    // strict 2-dp comparison failed on 0.005000000001587068.
    expect(Math.abs(money(total) - money(gain) + openingNet)).toBeLessThanOrEqual(0.01)
  }

  // …and a shorter window holds no full calendar year, so Yearly disables itself.
  await chartCard(page).getByRole("button", { name: "1Y" }).click()
  await expect(page.getByTestId("total-perf-returns-mode-yearly")).toBeDisabled()
  await expect(page.getByTestId("total-perf-returns-yearly-hint")).toBeVisible()
})

test("the constant-currency caveat is stated on the aggregate (§83.6)", async ({ page }) => {
  await login(page)
  await openTab(page)
  await expect(page.getByTestId("total-perf-overview-fx-caveat")).toContainText("Constant currency")
})

test("the dashboard links to the tab instead of repeating the curve", async ({ page }) => {
  await login(page)
  await page.goto("/en/investments")
  await expect(page.getByTestId("combined-chart")).toHaveCount(0)
  const link = page.getByTestId("combined-chart-link")
  await expect(link).toBeVisible({ timeout: 30_000 })
  await link.click()
  await expect(page).toHaveURL(/\/en\/investments\/performance/)
  await expect(page.getByTestId("total-perf-overview")).toBeVisible({ timeout: 30_000 })
})