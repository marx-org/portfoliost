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
  await page.getByRole("dialog", { name: "Create watchlist" }).getByRole("button", { name: "Create", exact: true }).click()

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
  await page.getByRole("dialog", { name: "Create watchlist" }).getByRole("button", { name: "Create", exact: true }).click()

  const card = page.locator(".card", { hasText: name })
  await card.getByLabel("Add symbol").fill("ZZZZ")
  await card.getByRole("button", { name: "Add", exact: true }).click()

  await expect(card.getByText(/Unknown symbol ZZZZ/)).toBeVisible()
})


