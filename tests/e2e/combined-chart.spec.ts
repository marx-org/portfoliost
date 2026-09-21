import { expect, test } from "@playwright/test"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

test("combined (all-portfolios) chart renders on the investments dashboard (§41.5)", async ({ page }) => {
  await login(page)
  await page.goto("/en/investments")

  const chart = page.locator('[data-testid="combined-chart"] .apexcharts-canvas')
  await expect(chart).toBeVisible({ timeout: 30_000 })
})

test("combined chart shows its currency and selects timeframes (§46.7)", async ({ page }) => {
  await login(page)
  await page.goto("/en/investments")

  const block = page.locator('[data-testid="combined-chart"]')
  await expect(block).toBeVisible({ timeout: 30_000 })
  await expect(block.locator("h2")).toContainText("Portfolio Value: USD")

  const timeframes = block.locator('[data-testid="combined-chart-timeframes"]')
  await expect(timeframes.getByRole("button", { name: "ALL" })).toHaveAttribute("aria-pressed", "true")

  await timeframes.getByRole("button", { name: "1Y" }).click()
  await expect(timeframes.getByRole("button", { name: "1Y" })).toHaveAttribute("aria-pressed", "true")
  await expect(timeframes.getByRole("button", { name: "ALL" })).toHaveAttribute("aria-pressed", "false")
  await expect(block.locator(".apexcharts-canvas")).toBeVisible({ timeout: 30_000 })
})