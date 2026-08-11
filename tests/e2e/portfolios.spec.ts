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

  await expect(page.getByRole("heading", { name: "Portfolios" })).toBeVisible()
  await expect(page.getByText("Total Value")).toBeVisible()
  await expect(page.getByRole("link", { name: /Top10/ })).toBeVisible()
})

test("investments tabs switch between portfolios, transactions, and watchlists", async ({ page }) => {
  await login(page)

  const tabs = page.getByRole("navigation", { name: "Investment sections" })
  await expect(tabs.getByRole("link", { name: "Portfolios" })).toHaveClass(/border-blue-600/)
  await expect(page.getByRole("button", { name: "Import from Broker" })).toBeVisible()

  await tabs.getByRole("link", { name: "Transactions" }).click()
  await expect(page).toHaveURL(/\/en\/investments\/transactions/)
  await expect(tabs.getByRole("link", { name: "Transactions" })).toHaveClass(/border-blue-600/)

  await tabs.getByRole("link", { name: "Watchlists" }).click()
  await expect(page).toHaveURL(/\/en\/investments\/watchlist/)
  await expect(tabs.getByRole("link", { name: "Watchlists" })).toHaveClass(/border-blue-600/)
})

test("portfolio detail shows metric strip, tabbed sections, and positions", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()

  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)
  await expect(page.getByRole("heading", { name: "Top10" })).toBeVisible()
  await expect(page.getByText("Total Value")).toBeVisible()

  const tabs = page.getByRole("navigation", { name: "Portfolio tabs" })
  await expect(tabs.getByRole("link", { name: "Holdings" })).toHaveClass(/border-blue-600/)

  const rows = page.locator("tbody tr")
  await expect(rows.first()).toBeVisible()
  await expect(rows.first().getByText("META", { exact: true })).toBeVisible()

  await tabs.getByRole("link", { name: "Analytics" }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/analytics/)
  await expect(tabs.getByRole("link", { name: "Analytics" })).toHaveClass(/border-blue-600/)
  await expect(page.getByText("Equity Curve")).toBeVisible()
  await expect(page.getByText("Monthly Returns")).toBeVisible()

  const sections: Array<[string, string]> = [
    ["Allocation", /\/allocation/],
    ["Dividends", /\/dividends/],
    ["Calendar", /\/calendar/],
    ["News", /\/news/],
    ["Compare", /\/compare/],
    ["Transactions", /\/transactions/],
  ]
  for (const [label, url] of sections) {
    await tabs.getByRole("link", { name: label }).click()
    await expect(page).toHaveURL(url)
    await expect(tabs.getByRole("link", { name: label })).toHaveClass(/border-blue-600/)
  }

  await tabs.getByRole("link", { name: "Holdings" }).click()
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

test("position actions menu: buy updates quantity, research navigates, remove deletes a row", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)

  const metaRow = page.locator("tbody tr").first()
  const metaQty = await metaRow.locator("td").nth(1).innerText()

  await metaRow.getByRole("button", { name: "Position actions" }).click()
  await expect(page.getByRole("button", { name: "Buy", exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Buy", exact: true }).click()
  await expect(page.getByRole("dialog", { name: /Buy META/ })).toBeVisible()
  await page.getByTestId("action-quantity").fill("5")
  await page.getByTestId("action-price").fill("600")
  await page.getByRole("button", { name: "Confirm" }).click()
  await expect(page.getByText(/Bought 5 META/)).toBeVisible()
  await expect(metaRow.locator("td").nth(1)).toHaveText(String(Number(metaQty) + 5))

  const targetRow = page.locator("tbody tr").last()
  const targetSymbol = (await targetRow.locator("td").first().innerText()).split("\n")[0]

  await targetRow.getByRole("button", { name: "Position actions" }).click()
  await page.getByRole("button", { name: "Research" }).click()
  await expect(page).toHaveURL(new RegExp(`/en/research/${targetSymbol}/overview`))

  await page.goBack()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)
  await page.locator("tbody tr").last().getByRole("button", { name: "Position actions" }).click()
  await page.getByRole("button", { name: "Remove position" }).click()
  await expect(page.getByText(new RegExp(`Removed ${targetSymbol}`))).toBeVisible()
  await expect(page.locator("tbody tr").filter({ hasText: targetSymbol })).toHaveCount(0)
})
