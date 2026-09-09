import { expect, test } from "@playwright/test"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

async function createEurWallet(page: import("@playwright/test").Page) {
  const name = `E2E FX ${Date.now()}`
  await page.goto("/en/wallets")
  await page.getByRole("button", { name: "New wallet" }).first().click()
  const dialog = page.getByRole("dialog", { name: "Create wallet" })
  await dialog.getByRole("textbox", { name: "Name" }).fill(name)
  await dialog.getByLabel("Wallet currency").selectOption("EUR")
  await dialog.getByRole("button", { name: "Create" }).click()
  await expect(dialog).not.toBeVisible()

  // fund the fresh EUR wallet so the cross-currency buy can settle
  const card = page.locator(".card").filter({ hasText: name })
  await card.getByRole("button", { name: "Deposit", exact: true }).click()
  const cash = page.getByRole("dialog", { name: "Cash movement" })
  await cash.locator("#wc-amount").fill("1000")
  await cash.getByRole("button", { name: "Deposit", exact: true }).click()
  await expect(cash).not.toBeVisible()
  return name
}

test("buy dialog: wallet-driven FX section → automatic suggests, custom submits a manual rate", async ({ page }) => {
  await login(page)
  const walletName = await createEurWallet(page)
  await page.goto("/en/investments")

  // self-contained: create a fresh portfolio so no other spec can touch it
  const portfolioName = `E2E FX Pf ${Date.now()}`
  await page.getByRole("button", { name: "Create Investment Portfolio" }).click()
  await page.getByRole("textbox", { name: "Name" }).fill(portfolioName)
  await page.getByRole("button", { name: "Create", exact: true }).click()
  const portfolioCard = page.locator(".card", { hasText: portfolioName })
  await expect(portfolioCard).toBeVisible()
  await portfolioCard.locator('a[href^="/en/portfolios/"]').first().click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)

  await page.getByRole("button", { name: "Add Position", exact: true }).click()
  await page.getByRole("dialog", { name: "Add position" }).getByTestId("add-position-instrument").click()
  const search = page.getByRole("dialog", { name: "Search for Instruments" })
  await expect(search).toBeVisible()
  await page.getByTestId("instrument-search").fill("Texas Instruments")
  await page.waitForTimeout(1200)
  await search.getByRole("button", { name: /^TXN / }).first().click()

  const buy = page.getByRole("dialog", { name: "Buy Position" })
  await expect(buy).toBeVisible()
  await buy.getByTestId("add-position-quantity").fill("1")
  await buy.getByTestId("add-position-price").fill("50")

  // default cash wallet is USD and TXN settles in USD -> no FX conversion needed
  const fxSection = buy.getByTestId("add-position-fx-section")
  await expect(fxSection).toBeHidden()

  // paying from a EUR wallet turns on the transaction FX leg (wallet-driven target)
  const walletSelect = buy.getByTestId("add-position-wallet")
  const eurOption = walletSelect.locator("option").filter({ hasText: walletName })
  await walletSelect.selectOption((await eurOption.getAttribute("value"))!)
  await expect(fxSection).toBeVisible()
  await expect(buy.getByText("Transaction exchange rate (USD → EUR)")).toBeVisible()

  // automatic: resolved market-rate hint, no manual input
  await expect(buy.getByTestId("add-position-fx-auto-value")).toHaveText(/1 USD = 0\.9259 EUR · market rate on/)
  await expect(buy.getByTestId("add-position-fx-rate")).toBeHidden()

  // custom: rate input prefilled with the suggested market rate
  await buy.getByTestId("add-position-fx-manual").click()
  await expect(buy.getByTestId("add-position-fx-rate")).toBeVisible()
  await expect(buy.getByTestId("add-position-fx-rate")).toHaveValue("0.9259")

  // fee currency select is registry-fed; changing it reveals a fee FX leg
  const feeCcy = buy.getByTestId("add-position-fee-currency")
  await expect(feeCcy.locator("option").filter({ hasText: "USD" }).first()).toBeAttached()
  await expect(feeCcy.locator("option").filter({ hasText: "EUR" }).first()).toBeAttached()
  await feeCcy.selectOption("EUR")
  await expect(buy.getByTestId("add-position-fee-fx-section")).toBeVisible()
  await expect(buy.getByText("Fee exchange rate (EUR → USD)")).toBeVisible()

  await buy.getByTestId("add-position-fx-rate").fill("4.35")
  await buy.getByRole("button", { name: /Buy for/ }).click()
  await expect(buy).toHaveCount(0)

  // the manual rate survives to the transactions tab as the custom-fx badge
  await page.getByRole("navigation", { name: "Portfolio tabs" }).getByRole("link", { name: "Transactions" }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/transactions/)
  await expect(page.getByTestId("custom-fx-badge").first()).toBeVisible({ timeout: 10000 })
})