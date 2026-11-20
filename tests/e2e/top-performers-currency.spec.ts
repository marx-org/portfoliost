import { expect, test } from "@playwright/test"
import { login } from "./helpers/login"

/**
 * §36.4 — Top/Bottom Performers show unrealized P/L in each position's
 * instrument currency (not a hardcoded USD), with an optional converted
 * sub-line to the display currency for cross-currency positions.
 */

test("top performers show P/L in the instrument currency (PLN position)", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()
  await page.getByRole("navigation", { name: "Portfolio tabs" }).getByRole("link", { name: "Performance" }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/performance/)

  await expect(page.getByRole("heading", { name: "Top Performers" })).toBeVisible({ timeout: 20000 })

  // Scope to the Top Performers card, then the SNT.WA row (PLN position).
  const topCard = page.locator('[class*="card"]').filter({ has: page.getByRole("heading", { name: "Top Performers" }) })
  const sntRow = topCard.locator("li", { hasText: "SNT.WA" }).first()
  await expect(sntRow).toBeVisible()

  // Primary P/L is in the instrument currency (PLN) — not a hardcoded USD.
  await expect(sntRow).toContainText(/PLN\s+\d[\d,.]*/)
  // Cross-currency display also shows a converted sub-line in the display
  // currency (USD renders via the "$" symbol in the en-US Intl format).
  await expect(sntRow).toContainText(/\+\$\d[\d,.]*/)
})
