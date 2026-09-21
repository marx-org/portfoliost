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