import { expect, test } from "@playwright/test"

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

test("the Yearly view is available on ALL and reconciles to the Net gain tile", async ({ page }) => {
  await login(page)
  await openTab(page)

  const yearly = page.getByTestId("total-perf-returns-mode-yearly")
  await expect(yearly).toBeEnabled()
  await yearly.click()

  const total = page.getByTestId("total-perf-returns-yearly-total-gain")
  await expect(total).toBeVisible({ timeout: 30_000 })

  // The Σ footer is the same number as the Net gain tile by construction (both
  // ride `convert()`), so a divergence is a real inconsistency.
  const gain = await page.getByTestId("total-perf-overview-net-gain").innerText()
  expect(total.innerText()).toBe(gain)

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