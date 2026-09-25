import { expect, test } from "@playwright/test"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

const pendingLineText = "Historical data is loading, chart will update in a moment."

test("portfolio recompute: pending line appears, then the chart repopulates (§27.5)", async ({ page }) => {
  await login(page)
  // Seeded Top10 portfolio (id from mocks/shared/data/raw/portfolios_summaries.json)
  await page.goto("/en/portfolios/3cb589d8-f92d-428f-aeab-9ee5d4b9cef2/performance")
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/performance/)

  const chart = page.locator(".apexcharts-canvas").first()
  await expect(chart).toBeVisible({ timeout: 30_000 })

  const recomputeBtn = page.getByTestId("portfolio-chart-recompute")
  const pendingLine = page.getByText(pendingLineText)
  await expect(pendingLine).toBeHidden()

  await recomputeBtn.click()

  // The POST flips the store to pending → the pending line appears…
  await expect(pendingLine).toBeVisible()

  // …and the 5s poll picks up the rebuilt series, clearing it (chart back).
  await expect(pendingLine).toBeHidden({ timeout: 30_000 })
  await expect(chart).toBeVisible()
})

test("cash-tab recompute: balance history re-fetches without error (§27.5)", async ({ page }) => {
  await login(page)
  // Seeded Top10 portfolio cash tab (multi-currency; Top10 is never mutated).
  await page.goto("/en/portfolios/3cb589d8-f92d-428f-aeab-9ee5d4b9cef2/cash")

  const recomputeBtn = page.getByTestId("cash-chart-recompute")
  await expect(recomputeBtn).toBeVisible({ timeout: 30_000 })
  await recomputeBtn.click()

  // No error surfaced and the chart recompute button is still usable.
  await expect(page.getByText("Failed to load balance history")).toHaveCount(0)
  await expect(recomputeBtn).toBeEnabled()
})
