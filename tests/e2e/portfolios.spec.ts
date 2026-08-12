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

  await expect(page.getByRole("heading", { name: "Portfolios", exact: true })).toBeVisible()
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

  await tabs.getByRole("link", { name: "Performance" }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/performance/)
  await expect(tabs.getByRole("link", { name: "Performance" })).toHaveClass(/border-blue-600/)
  await expect(page.getByText("Performance Chart")).toBeVisible()
  await expect(page.getByText("Returns Chart")).toBeVisible()

  const sections: Array<[string, string]> = [
    ["Performance", /\/performance/],
    ["Allocation", /\/allocation/],
    ["Risk Analysis", /\/risk-analysis/],
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
  await expect(page).toHaveURL(/\/en\/research\/META\.US\/overview/)
})

test("transactions page lists transactions with sortable columns and pagination", async ({ page }) => {
  await login(page)
  await page.goto("/en/investments/transactions")

  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()
  await expect(page.getByText(/All investing and cash transactions/)).toBeVisible()
  await expect(page.locator("tbody tr").first()).toBeVisible()
  await expect(page.getByTestId("table-th-quantity")).toBeVisible()
  await expect(page.getByTestId("table-th-amount")).toBeVisible()
  await expect(page.getByText(/P&L/)).toBeVisible()
  await expect(page.getByTestId("table-th-date")).toContainText("↓")
  await page.getByTestId("table-th-amount").click()
  await expect(page.getByTestId("table-th-amount")).toContainText("↑")
  await expect(page.getByLabel("Rows per page")).toContainText("10 per page")
  await expect(page.getByText(/^\d+-\d+ of \d+$/)).toBeVisible()
})

test("wallet transactions sub-tab lists cash transactions", async ({ page }) => {
  await login(page)
  await page.goto("/en/investments/transactions/cash")

  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Wallet Transactions" })).toHaveClass(/border-blue-600/)
  await expect(page.locator("tbody tr").first()).toBeVisible()
  await expect(page.getByTestId("table-th-walletName")).toBeVisible()
  await expect(page.getByTestId("table-th-amount")).toBeVisible()
  await expect(page.getByTestId("table-th-date")).toContainText("↓")
  await expect(page.getByRole("button", { name: "Edit transaction" }).first()).toBeVisible()
})

test("creating a new portfolio adds it to the list", async ({ page }) => {
  const name = `E2E Test ${Date.now()}`
  await login(page)

  await page.getByRole("button", { name: "Create Investment Portfolio" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.getByRole("textbox", { name: "Name" }).fill(name)
  await page.getByRole("button", { name: "Create", exact: true }).click()

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
  await expect(page).toHaveURL(new RegExp(`/en/research/${targetSymbol}\\.US/overview`))

  await page.goBack()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)
  await page.locator("tbody tr").last().getByRole("button", { name: "Position actions" }).click()
  await page.getByRole("button", { name: "Remove position" }).click()
  await expect(page.getByText(new RegExp(`Removed ${targetSymbol}`))).toBeVisible()
  await expect(page.locator("tbody tr").filter({ hasText: targetSymbol })).toHaveCount(0)
})

test("edit position opens a transaction list editor with rows and add row", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)

  const metaRow = page.locator("tbody tr").first()
  await metaRow.getByRole("button", { name: "Position actions" }).click()
  await page.getByRole("button", { name: "Edit position" }).click()

  const dialog = page.getByRole("dialog", { name: "Edit META position" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(/Changes save when you leave a field/)).toBeVisible()
  await expect(dialog.getByRole("columnheader", { name: "Price per share" })).toBeVisible()
  await expect(dialog.getByRole("columnheader", { name: "Transaction Fees" })).toBeVisible()
  await expect(dialog.getByRole("columnheader", { name: "Total Cost" })).toBeVisible()
  await expect(dialog.getByRole("columnheader", { name: "Exchange Rate" })).toBeVisible()

  await dialog.getByLabel("Quantity").last().fill("3")
  await dialog.getByLabel("Price per share").last().fill("500")
  await dialog.getByRole("button", { name: "Add", exact: true }).click()
  await expect(dialog.locator("tbody tr")).toHaveCount(2)

  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await expect(dialog).toHaveCount(0)
})

test("add position from the header opens a chooser with instrument/option/cfd and adds a stock row", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)

  await page.getByRole("button", { name: "Add Position", exact: true }).click()
  const chooser = page.getByRole("dialog", { name: "Add position" })
  await expect(chooser).toBeVisible()
  await expect(chooser.getByTestId("add-position-instrument")).toContainText("Stock, ETF or crypto")
  await expect(chooser.getByTestId("add-position-option")).toContainText("Option")
  await expect(chooser.getByTestId("add-position-cfd")).toContainText("CFD")

  await chooser.getByTestId("add-position-instrument").click()
  await expect(page.getByRole("dialog", { name: "Search for Instruments" })).toBeVisible()
  await page.getByTestId("instrument-search").fill("AMD")
  await page.getByRole("dialog", { name: "Search for Instruments" }).getByRole("button", { name: /AMD/ }).first().click()

  await expect(page.getByRole("dialog", { name: "Buy Position" })).toBeVisible()
  await page.getByTestId("add-position-quantity").fill("10")
  await page.getByTestId("add-position-price").fill("120")
  await page.getByRole("dialog", { name: "Buy Position" }).getByRole("button", { name: /Buy for/ }).click()

  await expect(page.getByRole("dialog", { name: "Buy Position" })).toHaveCount(0)
  await expect(page.locator("tbody tr").filter({ hasText: "AMD" })).toHaveCount(1)
})

test("display currency switcher updates portfolio values and persists", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)

  await expect(page.getByRole("button", { name: /Display currency: USD/ })).toBeVisible()
  await page.getByRole("button", { name: /Display currency: USD/ }).click()
  await page.getByRole("button", { name: "EUR", exact: true }).click()

  await expect(page.getByRole("button", { name: /Display currency: EUR/ })).toBeVisible()
  await expect(page.getByText(/€\s*[0-9]/).first()).toBeVisible()

  await page.reload()
  await expect(page.getByRole("button", { name: /Display currency: EUR/ })).toBeVisible()

  await page.goto("/en/investments")
  await expect(page.getByRole("button", { name: /Display currency: EUR/ })).toBeVisible()
})

test("holdings table groups by type, sector, and country", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)

  const groupSelect = page.getByLabel("Group by")
  await expect(groupSelect).toHaveValue("none")

  await groupSelect.selectOption("assetType")
  await expect(page.getByTestId("holdings-group-row")).toHaveCount(1)
  await expect(page.getByTestId("holdings-group-row")).toContainText("Stock")
  await expect(page.getByText(/Stock subtotal/)).toHaveCount(1)

  await groupSelect.selectOption("sector")
  await expect(page.getByTestId("holdings-group-row")).toHaveCount(3)
  await expect(page.getByTestId("holdings-group-row").first()).toContainText("Communication Services")
  await expect(page.getByText(/subtotal/)).toHaveCount(3)

  await groupSelect.selectOption("country")
  await expect(page.getByTestId("holdings-group-row")).toHaveCount(1)
  await expect(page.getByTestId("holdings-group-row")).toContainText("US")

  await groupSelect.selectOption("none")
  await expect(page.getByTestId("holdings-group-row")).toHaveCount(0)
  await expect(page.getByText(/Total/).first()).toBeVisible()
})
