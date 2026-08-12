import { expect, test } from "@playwright/test"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

test("watchlists: create, add item, and remove item", async ({ page }) => {
  const name = `E2E Tech ${Date.now()}`
  await login(page)
  await page.goto("/en/investments/watchlist")

  await expect(page.getByRole("heading", { name: "Watchlists" })).toBeVisible()
  await page.getByRole("button", { name: "New watchlist" }).first().click()
  await page.getByRole("textbox", { name: "Name" }).fill(name)
  await page.getByRole("button", { name: "Create" }).click()

  const card = page.locator(".card", { hasText: name })
  await expect(card).toBeVisible()

  await card.getByLabel("Add symbol").fill("NVDA")
  await card.getByRole("button", { name: "Add", exact: true }).click()

  await expect(card.getByRole("link", { name: "NVDA" })).toBeVisible()
  await expect(card.getByText("NVIDIA")).toBeVisible()

  await card.getByRole("button", { name: "Remove" }).click()
  await expect(card.getByRole("link", { name: "NVDA" })).not.toBeVisible()
})

test("watchlists: rejects an unknown symbol", async ({ page }) => {
  const name = `E2E Validation ${Date.now()}`
  await login(page)
  await page.goto("/en/investments/watchlist")

  await page.getByRole("button", { name: "New watchlist" }).first().click()
  await page.getByRole("textbox", { name: "Name" }).fill(name)
  await page.getByRole("button", { name: "Create" }).click()

  const card = page.locator(".card", { hasText: name })
  await card.getByLabel("Add symbol").fill("ZZZZ")
  await card.getByRole("button", { name: "Add", exact: true }).click()

  await expect(card.getByText(/Unknown symbol ZZZZ/)).toBeVisible()
})

test("wallets: shows balance and deposits cash", async ({ page }) => {
  await login(page)
  await page.goto("/en/wallets")

  await expect(page.getByRole("heading", { name: "Wallets" })).toBeVisible()
  await expect(page.getByText("Total Balance")).toBeVisible()
  await expect(page.getByText("Portfel USD 1")).toBeVisible()

  await page.getByRole("button", { name: "Deposit" }).first().click()
  const dialog = page.getByRole("dialog", { name: "Cash movement" })
  await dialog.getByRole("spinbutton", { name: "Amount" }).fill("100")
  await dialog.getByRole("button", { name: "Deposit", exact: true }).click()

  await page.getByRole("button", { name: "Transactions" }).first().click()
  await expect(page.getByText("DEPOSIT").first()).toBeVisible()
})

test("wallets: creates a new wallet", async ({ page }) => {
  const name = `E2E Savings ${Date.now()}`
  await login(page)
  await page.goto("/en/wallets")

  await page.getByRole("button", { name: "New wallet" }).first().click()
  const dialog = page.getByRole("dialog", { name: "Create wallet" })
  await dialog.getByRole("textbox", { name: "Name" }).fill(name)
  await dialog.getByRole("button", { name: "Create" }).click()

  await expect(page.locator(".card", { hasText: name })).toBeVisible()
})

test("wallets: History opens wallet detail screen", async ({ page }) => {
  await login(page)

  await page.getByRole("button", { name: "History", exact: true }).first().click()
  await expect(page).toHaveURL(/\/en\/portfolios\/wallets\/1a1f2d68-686c-4f8b-ba34-a67846163275/)

  await expect(page.getByRole("heading", { name: "Portfel USD 1" })).toBeVisible()
  await expect(page.getByText("Balance", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("Available", { exact: true })).toBeVisible()
  await expect(page.getByText("Currency", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Deposit", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Transfer", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Withdraw", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Delete wallet" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Balance History" })).toBeVisible()
  await expect(page.getByRole("button", { name: "1W" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Recent Transactions" })).toBeVisible()

  await page.getByRole("button", { name: "Go back" }).click()
  await expect(page).toHaveURL(/\/en\/investments/)
})

test("wallets: clicking the wallet card opens wallet detail screen", async ({ page }) => {
  await login(page)

  await page.locator(".card", { hasText: "Portfel USD 1" }).first().click()
  await expect(page).toHaveURL(/\/en\/portfolios\/wallets\/1a1f2d68-686c-4f8b-ba34-a67846163275/)
})
