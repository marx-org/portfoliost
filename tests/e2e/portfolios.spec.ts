import { expect, test } from "@playwright/test"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

test("investments dashboard shows totals and the portfolio", async ({ page }) => {
  await login(page)

  await expect(page.getByRole("heading", { name: "Investments" })).toBeVisible()
  await expect(page.getByText("Total Value")).toBeVisible()
  await expect(page.getByRole("link", { name: /Top10/ })).toBeVisible()
})

test("portfolio detail shows summary, analytics, and positions", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()

  await expect(page).toHaveURL(/\/en\/portfolios\//)
  await expect(page.getByRole("heading", { name: "Top10" })).toBeVisible()
  await expect(page.getByText("Equity Curve")).toBeVisible()
  await expect(page.getByText("Monthly Returns")).toBeVisible()
  await expect(page.getByText("Positions")).toBeVisible()

  const rows = page.locator("tbody tr")
  await expect(rows.first()).toBeVisible()
  await expect(rows.first().getByText("META", { exact: true })).toBeVisible()

  await page.getByRole("link", { name: "META" }).click()
  await expect(page).toHaveURL(/\/en\/research\/META\/overview/)
})

test("transactions page lists transactions with pagination", async ({ page }) => {
  await login(page)
  await page.goto("/en/investments/transactions")

  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()
  await expect(page.locator("tbody tr").first()).toBeVisible()
  await expect(page.getByText(/total transactions/)).toBeVisible()
})

test("creating a new portfolio adds it to the list", async ({ page }) => {
  const name = `E2E Test ${Date.now()}`
  await login(page)

  await page.getByRole("button", { name: "New portfolio" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.getByRole("textbox", { name: "Name" }).fill(name)
  await page.getByRole("button", { name: "Create" }).click()

  await expect(page.getByRole("link", { name })).toBeVisible()
})
