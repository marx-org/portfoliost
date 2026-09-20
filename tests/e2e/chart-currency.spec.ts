import { expect, test } from "@playwright/test"

/**
 * §36 — price charts display the instrument's native currency (not a hard
 * "USD"), and cross-currency benchmark comparison (PLN stock vs USD ETF) is
 * percent-normalized with an explicit caption instead of a misleading
 * raw-price overlay.
 */
async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await page.waitForURL(/investments/, { timeout: 20000 })
}

/** SVG y-axis labels of the Price Chart card (the page hosts other charts too). */
async function priceChartYAxis(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('[class*="card"]')] as HTMLElement[]
    const chartCard = cards.find((c) => c.querySelector("h2")?.textContent === "Price Chart")
    return chartCard ? [...chartCard.querySelectorAll(".apexcharts-yaxis text")].map((t) => t.textContent ?? "") : []
  })
}

test("price chart shows native currency + cross-currency note (SNT.WA vs SPY)", async ({ page }) => {
  await login(page)
  await page.goto("/en/research/SNT.WA/overview")

  await expect(page.getByRole("heading", { name: "Price Chart" })).toBeVisible({ timeout: 20000 })
  await expect(page.locator(".apexcharts-canvas").first()).toBeVisible({ timeout: 20000 })

  // Native currency on the y-axis: mock research SNT is PLN, so axis labels
  // must carry "PLN", never a "$" USD symbol.
  const ylabels = await priceChartYAxis(page)
  expect(ylabels.length).toBeGreaterThan(0)
  expect(ylabels.some((t) => t.includes("PLN"))).toBe(true)
  expect(ylabels.every((t) => !t.includes("$"))).toBe(true)

  // Cross-currency overlay: pick the USD S&P 500 benchmark in Price mode.
  await page.getByText("Add comparison").click()
  await page.getByText("S&P 500").click()
  await expect(page.getByText(/currencies differ \(PLN vs USD\)/)).toBeVisible({ timeout: 20000 })
})

test("price chart keeps raw prices for same-currency benchmark (AAPL vs SPY)", async ({ page }) => {
  await login(page)
  await page.goto("/en/research/AAPL/overview")

  await expect(page.getByRole("heading", { name: "Price Chart" })).toBeVisible({ timeout: 20000 })
  await expect(page.locator(".apexcharts-canvas").first()).toBeVisible({ timeout: 20000 })

  // USD instrument vs USD benchmark → no cross-currency note; USD renders
  // via the "$" symbol in the en-US Intl format. Selecting the benchmark
  // remounts the chart (key bump) — wait for it to re-render.
  await page.getByText("Add comparison").click()
  await page.getByText("S&P 500").click()
  await page.waitForTimeout(2000)
  expect(await page.getByText(/currencies differ/).count()).toBe(0)
  const ylabels = await priceChartYAxis(page)
  expect(ylabels.some((t) => t.includes("$"))).toBe(true)
})
