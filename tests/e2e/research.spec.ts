import { expect, test } from "@playwright/test"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

test("research overview shows company data", async ({ page }) => {
  await login(page)
  await page.goto("/en/research/AAPL/overview")

  await expect(page.getByRole("heading", { name: "AAPL", exact: true }).first()).toBeVisible()
  await expect(page.getByText("Company Overview")).toBeVisible()
  await expect(page.getByText("Company Statistics")).toBeVisible()
  await expect(page.getByText("Apple Inc").first()).toBeVisible()
  await expect(page.getByText("Price Chart")).toBeVisible()
})

test("research tabs switch between views", async ({ page }) => {
  await login(page)
  await page.goto("/en/research/AAPL/overview")

  const tabs = page.locator("nav").filter({ has: page.getByRole("link", { name: "Projections" }) })

  await tabs.getByRole("link", { name: "News" }).click()
  await expect(page).toHaveURL(/\/en\/research\/AAPL\/news/)
  await expect(page.getByText(/articles for AAPL/)).toBeVisible()

  await tabs.getByRole("link", { name: "Investor Relations" }).click()
  await expect(page).toHaveURL(/\/en\/research\/AAPL\/investor-relations/)
  await expect(page.getByText("All (")).toBeVisible()

  await tabs.getByRole("link", { name: "Projections" }).click()
  await expect(page).toHaveURL(/\/en\/research\/AAPL\/projections/)
  await expect(page.getByText("Price Target")).toBeVisible()
  await expect(page.getByText("Recommendation")).toBeVisible()
})

test("search modal opens and navigates to a popular symbol", async ({ page }) => {
  await login(page)
  await page.goto("/en/research/AAPL/overview")

  await page.getByRole("button", { name: /Search for a stock/ }).click()
  await expect(page.getByRole("dialog")).toBeVisible()

  await page.getByRole("button", { name: "MSFT", exact: true }).click()
  await expect(page).toHaveURL(/\/en\/research\/MSFT\/overview/)
  await expect(page.getByRole("heading", { name: "MSFT", exact: true }).first()).toBeVisible()
})
