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
