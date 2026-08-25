import { expect, test } from "@playwright/test"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

test("buy dialog: fee currency registry + custom FX rate flow", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)

  await page.getByRole("button", { name: "Add Position", exact: true }).click()
  const chooser = page.getByRole("dialog", { name: "Add position" })
  await chooser.getByTestId("add-position-instrument").click()
  const search = page.getByRole("dialog", { name: "Search for Instruments" })
  await expect(search).toBeVisible()
  await page.getByTestId("instrument-search").fill("Intel")
  await page.waitForTimeout(1200)
  await search.getByRole("button", { name: /^INTC Intel Corporation/ }).first().click()

  const buy = page.getByRole("dialog", { name: "Buy Position" })
  await expect(buy).toBeVisible()
  await buy.getByTestId("add-position-quantity").fill("1")
  await buy.getByTestId("add-position-price").fill("50")

  // fee currency select is registry-fed: contains EUR and PLN beyond USD
  const feeCcy = buy.getByTestId("add-position-fee-currency")
  await expect(feeCcy).toBeVisible()
  const options = feeCcy.locator("option")
  await expect(options.filter({ hasText: "USD" }).first()).toBeAttached()
  await expect(options.filter({ hasText: "EUR" }).first()).toBeAttached()
  await feeCcy.selectOption("EUR")

  // fx disclosure: automatic by default, custom reveals the rate input
  await buy.getByTestId("add-position-fx-toggle").click()
  await expect(buy.getByTestId("add-position-fx-rate")).toBeHidden()
  await buy.getByTestId("add-position-fx-manual").click()
  await expect(buy.getByTestId("add-position-fx-rate")).toBeVisible()
  await buy.getByTestId("add-position-fx-rate").fill("4.35")
  await buy.getByRole("button", { name: /Buy for/ }).click()
  await expect(buy).toHaveCount(0)

  // edit a seeded transaction to mark it custom-rated
  await page.getByRole("link", { name: /Transactions|History/ }).first().click().catch(() => {})
})

test("transactions table shows custom fx badge after editing with a manual rate", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)
  await page.getByRole("link", { name: /Transactions/i }).first().click().catch(async () => {
    await page.goto("/en/portfolios")
  })

  // open the first editable transaction and set a custom rate
  const rows = page.locator("tbody tr")
  await expect(rows.first()).toBeVisible({ timeout: 10000 })
  await rows.first().getByRole("button", { name: "Edit transaction" }).click()
  const modal = page.getByRole("dialog", { name: /^Edit/ })
  await expect(modal).toBeVisible()
  // section may already be open when the row persists a manual rate
  if (!(await modal.getByTestId("edit-tx-fx-manual").isVisible())) {
    await modal.getByTestId("edit-tx-fx-toggle").click()
  }
  await modal.getByTestId("edit-tx-fx-manual").click()
  await modal.getByTestId("edit-tx-fx-rate").fill("0.92")
  await modal.getByRole("button", { name: "Save" }).click()
  await expect(modal).toHaveCount(0)

  await expect(page.getByTestId("custom-fx-badge").first()).toBeVisible({ timeout: 10000 })
})
