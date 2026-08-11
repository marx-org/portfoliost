import { expect, test } from "@playwright/test"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

async function openResearch(page: import("@playwright/test").Page, tab = "overview") {
  await login(page)
  await page.goto(`/en/research/AAPL/${tab}`)
}

test("research overview shows company data", async ({ page }) => {
  const consoleErrors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text())
  })

  await openResearch(page, "overview")

  await expect(page.getByRole("heading", { name: "AAPL", exact: true }).first()).toBeVisible()
  await expect(page.getByText(/About Apple Inc/)).toBeVisible()
  await expect(page.getByText("Analyst Price Target")).toBeVisible()
  await expect(page.getByText("Key Facts")).toBeVisible()
  await expect(page.getByText("Key Statistics")).toBeVisible()
  await expect(page.getByText("Latest Earnings Call")).toBeVisible()
  await expect(page.getByText("Seasonality")).toBeVisible()
  await expect(page.getByText("Price Chart")).toBeVisible()
  await expect(page.locator(".apexcharts-canvas").first()).toBeVisible()
  expect(consoleErrors).toEqual([])
})

test("overview description expands with show more", async ({ page }) => {
  await openResearch(page, "overview")
  const about = page.getByText(/About Apple Inc/)
  await expect(about).toBeVisible()
  await page.getByRole("button", { name: "Show more" }).click()
  await expect(page.getByRole("button", { name: "Show less" })).toBeVisible()
})

test("price chart supports timeframes, modes, compare and fullscreen", async ({ page }) => {
  await openResearch(page, "overview")
  const chart = page.getByText("Price Chart")

  await expect(chart).toBeVisible()
  await page.getByRole("button", { name: "3M", exact: true }).click()
  await expect(page.getByRole("button", { name: "Fullscreen" })).toBeVisible()

  await page.getByRole("button", { name: "Percent", exact: true }).click()
  await expect(page.getByText(/\+?[-\d.]{1,8}%/).first()).toBeVisible()

  await page.getByLabel(/Compare/).selectOption("spy")
  await expect(page.locator(".apexcharts-canvas").filter({ hasText: "S&P 500" }).first()).toBeVisible()

  await page.getByRole("button", { name: "Fullscreen" }).click()
  await expect(page.getByRole("button", { name: "Close" })).toBeVisible()
  await page.getByRole("button", { name: "Close" }).click()
})

test("price chart downloads csv", async ({ page }) => {
  await openResearch(page, "overview")
  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download", exact: true }).first().click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^AAPL_.*\.csv$/)
})

test("seasonality switches years and metric", async ({ page }) => {
  await openResearch(page, "overview")
  await expect(page.getByRole("heading", { name: "Seasonality" })).toBeVisible()
  await page.getByRole("button", { name: "10Y", exact: true }).click()
  await page.getByRole("button", { name: "Max", exact: true }).click()
  await expect(page.getByRole("button", { name: "Max", exact: true })).toHaveClass(/bg-slate-800/)
  await expect(page.locator(".apexcharts-canvas").nth(1)).toBeVisible()
})

test("research tabs switch between all views", async ({ page }) => {
  await openResearch(page, "overview")
  const tabs = page.locator("nav").filter({ has: page.getByRole("link", { name: "Dividends" }) })

  const cases: Array<[string, string, RegExp]> = [
    ["News", "news", /articles for AAPL/],
    ["Fundamentals", "fundamentals", /Income Statement/],
    ["Investor Relations", "investor-relations", /All \(/],
    ["Ownership", "ownership", /Institutional Holders/],
    ["Projections", "projections", /Price Target/],
    ["Compare", "compare", /Compare AAPL with peers/],
    ["Calendar", "calendar", /Upcoming Earnings/],
    ["Dividends", "dividends", /Payment History/],
  ]

  for (const [label, path, matcher] of cases) {
    await tabs.getByRole("link", { name: label }).click()
    await expect(page).toHaveURL(new RegExp(`/en/research/AAPL/${path}`))
    await expect(page.getByText(matcher).first()).toBeVisible()
  }

  await tabs.getByRole("link", { name: "Overview" }).click()
  await expect(page).toHaveURL(/\/en\/research\/AAPL\/overview/)
})

test("add to watchlist updates the button", async ({ page }) => {
  await openResearch(page, "overview")
  const button = page.getByRole("button", { name: "Add to Watchlist" })
  await expect(button).toBeVisible()
  await button.click()
  await expect(page.getByRole("button", { name: "In Watchlist" })).toBeDisabled()
  await expect(page.getByText(/Added AAPL to/)).toBeVisible()
})

test("search modal opens and navigates to a popular symbol", async ({ page }) => {
  await openResearch(page, "overview")

  await page.getByRole("button", { name: /Search for a stock/ }).click()
  await expect(page.getByRole("dialog")).toBeVisible()

  await page.getByRole("button", { name: "MSFT", exact: true }).click()
  await expect(page).toHaveURL(/\/en\/research\/MSFT\/overview/)
  await expect(page.getByRole("heading", { name: "MSFT", exact: true }).first()).toBeVisible()
})
