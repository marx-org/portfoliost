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
  await page.goto(`/en/research/AAPL.US/${tab}`)
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

test("overview shows extended statistics and EPS 5Q combobox", async ({ page }) => {
  await openResearch(page, "overview")

  await expect(page.getByText("Valuation (NTM)")).toBeVisible()
  const stats = page.locator(".card", { hasText: "Key Statistics" })
  await expect(stats.getByText("Dividends", { exact: true })).toBeVisible()
  await expect(stats.getByText("P/FCF", { exact: true }).first()).toBeVisible()
  await expect(stats.getByText("ROTA", { exact: true }).first()).toBeVisible()

  await page.getByLabel("EPS timeframe").selectOption("quarterly")
  await expect(page.getByLabel("EPS timeframe")).toHaveValue("quarterly")
  await expect(page.getByText("EPS Surprises - AAPL")).toBeVisible()
})

test("research shows quick-switch logo row", async ({ page }) => {
  await openResearch(page, "overview")
  await page.getByRole("navigation", { name: "Quick symbol switch" }).getByRole("link", { name: /NVDA/ }).click()
  await expect(page).toHaveURL(/\/en\/research\/NVDA\.US\/overview/)
  await expect(page.getByRole("heading", { name: "NVDA", exact: true }).first()).toBeVisible()
})

test("price chart shows Total Chg and CAGR", async ({ page }) => {
  await openResearch(page, "overview")
  const chartCard = page.locator(".card", { hasText: "Price Chart" })
  await expect(chartCard.getByText("Total Chg")).toBeVisible()
  await expect(chartCard.getByText("CAGR", { exact: true })).toBeVisible()
  await expect(page.getByText("Powered by Example service")).toBeVisible()
})

test("news tab shows timeline and analyzed article counts", async ({ page }) => {
  await openResearch(page, "news")
  await expect(page.getByText("Timeline Events")).toBeVisible()
  await expect(page.getByText("Analyzed Articles")).toBeVisible()
  await expect(page.getByText(/articles for AAPL/)).toBeVisible()
})

test("price chart supports timeframes, modes, compare and fullscreen", async ({ page }) => {
  await openResearch(page, "overview")
  const chart = page.getByText("Price Chart")

  await expect(chart).toBeVisible()
  await page.getByRole("button", { name: "3M", exact: true }).click()
  await expect(page.getByRole("button", { name: "Fullscreen" })).toBeVisible()

  await page.getByRole("button", { name: "Percent", exact: true }).click()
  await expect(page.getByText(/\+?[-\d.]{1,8}%/).first()).toBeVisible()

  await page.getByRole("button", { name: "Add comparison" }).click()
  await page.getByRole("button", { name: "S&P 500", exact: true }).click()
  await expect(page.getByRole("button", { name: /S&P 500/ }).first()).toBeVisible()

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
  const seasonality = page.locator(".card", { hasText: "Seasonality" })
  await expect(page.getByRole("heading", { name: "Seasonality" })).toBeVisible()
  await seasonality.getByRole("button", { name: "10Y", exact: true }).click()
  await seasonality.getByRole("button", { name: "Max", exact: true }).click()
  await expect(seasonality.getByRole("button", { name: "Max", exact: true })).toHaveClass(/bg-slate-800/)
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
    await expect(page).toHaveURL(new RegExp(`/en/research/AAPL\\.US/${path}`))
    await expect(page.getByText(matcher).first()).toBeVisible()
  }

  await tabs.getByRole("link", { name: "Overview" }).click()
  await expect(page).toHaveURL(/\/en\/research\/AAPL\.US\/overview/)
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
  await expect(page).toHaveURL(/\/en\/research\/MSFT\.US\/overview/)
  await expect(page.getByRole("heading", { name: "MSFT", exact: true }).first()).toBeVisible()
})
