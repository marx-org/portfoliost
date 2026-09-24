import { expect, test } from "@playwright/test"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

test("sidebar matches example-service: no Wallets/News, Report bug, cash portfolios on main page", async ({ page }) => {
  await login(page)

  const nav = page.getByRole("navigation", { name: "Main navigation" })
  await expect(nav.getByRole("link", { name: /Wallets/ })).toHaveCount(0)
  await expect(nav.getByRole("link", { name: /News/ })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Report bug" })).toHaveCount(0)

  await expect(page.getByRole("heading", { name: "Investment Portfolios", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Cash Portfolios", exact: true })).toBeVisible()
  await expect(page.getByText("Portfel USD 1")).toBeVisible()
  await expect(page.getByRole("button", { name: "Deposit", exact: true }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: "Withdraw", exact: true }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: "Transfer", exact: true }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: "History", exact: true }).first()).toBeVisible()
})

test("portfolio card shows chart, quick links and manage menu", async ({ page }) => {
  await login(page)

  const card = page.locator(".card", { hasText: "Top10" }).first()
  await expect(card.getByRole("button", { name: "Add Position" })).toBeVisible()
  await expect(card.getByRole("link", { name: "Analytics" })).toBeVisible()
  await expect(card.getByRole("link", { name: "News" })).toBeVisible()
  await expect(card.getByRole("link", { name: "Calendar" })).toBeVisible()
  await expect(card.getByText("Performance")).toBeVisible()

  await card.getByRole("button", { name: "Add Position" }).click()
  const dialog = page.getByRole("dialog", { name: "Add Position" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId("add-position-instrument")).toContainText("Stock, ETF or crypto")
  await expect(dialog.getByTestId("add-position-option")).toContainText("Option")
  await expect(dialog.getByTestId("add-position-cfd")).toContainText("CFD")
  await page.getByRole("button", { name: "Close modal" }).click()
  await expect(dialog).toHaveCount(0)

  await card.getByRole("button", { name: "Portfolio actions" }).click()
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Export as CSV" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Export as XML" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Export as JSON" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeVisible()
})

test("card sparkline remounts on timeframe switch (§53.3)", async ({ page }) => {
  await login(page)

  const card = page.locator(".card", { hasText: "Top10" }).first()
  const oldChart = await card.locator(".vue-apexcharts").first().elementHandle()
  expect(oldChart).not.toBeNull()

  await card.getByRole("button", { name: "1Y", exact: true }).click()

  // §48.6e B3: vue3-apexcharts never pushes a prop update into the mounted
  // chart, so the chartKey fingerprint (timeframe + series shape) must replace
  // the running instance — the old chart node detaches from the DOM.
  await expect
    .poll(async () => (oldChart ? await oldChart.evaluate((el) => el.isConnected) : false))
    .toBe(false)
  await expect(card.locator(".vue-apexcharts").first()).toBeVisible()
})

test("create, rename and delete a portfolio from the card manage menu", async ({ page }) => {
  const name = `E2E Manage ${Date.now()}`
  const renamed = `${name} renamed`
  await login(page)

  await page.getByRole("button", { name: "Create Investment Portfolio" }).click()
  await page.getByRole("textbox", { name: "Name" }).fill(name)
  await page.getByRole("button", { name: "Create", exact: true }).click()
  let card = page.locator(".card", { hasText: name })
  await expect(card).toBeVisible()

  await card.getByRole("button", { name: "Portfolio actions" }).click()
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Rename portfolio" })).toBeVisible()
  await page.getByRole("textbox", { name: "Name" }).fill(renamed)
  await page.getByRole("button", { name: "Save" }).click()
  card = page.locator(".card", { hasText: renamed })
  await expect(card).toBeVisible()

  await card.getByRole("button", { name: "Portfolio actions" }).click()
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Delete portfolio" })).toBeVisible()
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(page.locator(".card", { hasText: renamed })).toHaveCount(0)
})

test("holdings: no AI premium banner, customize columns, sort and export", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).first().click()
  await expect(page).toHaveURL(/holdings/)

  await expect(page.getByText("AI Insight")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Upgrade to Premium" })).toHaveCount(0)

  await page.getByRole("button", { name: /Customize/ }).click()
  await page.getByLabel("Market Value").uncheck()
  await expect(page.getByRole("columnheader", { name: "Market Value" })).toHaveCount(0)
  await page.locator("div.fixed.inset-0.z-20").click()

  await page.getByRole("columnheader", { name: /Quantity/ }).click()
  await expect(page.getByRole("columnheader", { name: /Quantity/ })).toHaveAttribute("aria-sort", "ascending")

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export", exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/positions\.csv$/)
})
