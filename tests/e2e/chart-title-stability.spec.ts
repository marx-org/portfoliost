import { expect, test } from "@playwright/test"

/**
 * §47.6 — the Price Chart title carries the resolved instrument currency
 * (`Price Chart (PLN)`) and the plot box stays put when the transactions
 * toggle / comparison / cross-currency note appear — no card reflow.
 */
async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await page.waitForURL(/investments/, { timeout: 20000 })
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Bounding box of the chart's plot area (the apexcharts grid region). */
async function plotBox(page: import("@playwright/test").Page): Promise<Box> {
  return page.evaluate(() => {
    const grid = document.querySelector("g.apexcharts-grid") as SVGElement | null
    if (!grid) return { x: -1, y: -1, width: -1, height: -1 }
    const r = grid.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
}

// The plot box must keep its SIZE across state changes. Its vertical position
// may shift if the cross-currency note above it appears, so we assert the
// width × height box is unchanged (the §47.6 "stable chart height" guarantee).
function expectSameBox(before: Box, after: Box, label: string) {
  expect(after.width, `width ${label}`).toBeCloseTo(before.width, 0)
  expect(after.height, `height ${label}`).toBeCloseTo(before.height, 0)
}

test("price chart title shows the resolved currency (SNT.WA)", async ({ page }) => {
  await login(page)
  await page.goto("/en/research/SNT.WA/overview")

  await expect(page.getByRole("heading", { name: "Price Chart (PLN)" })).toBeVisible({ timeout: 20000 })
})

test("plot box is stable across transactions + comparison toggles (SNT.WA)", async ({ page }) => {
  await login(page)
  await page.goto("/en/research/SNT.WA/overview")

  await expect(page.getByRole("heading", { name: "Price Chart" })).toBeVisible({ timeout: 20000 })
  await expect(page.locator(".apexcharts-canvas").first()).toBeVisible({ timeout: 20000 })
  const base = await plotBox(page)
  expect(base.width).toBeGreaterThan(0)

  // Transactions on → markers/annotations re-render the chart.
  await page.getByRole("checkbox", { name: "Transactions" }).check()
  await page.waitForTimeout(1500)
  expectSameBox(base, await plotBox(page), "after transactions")

  // USD benchmark on a PLN instrument → cross-currency note appears and the
  // chart remounts percent-normalized; the plot box must not move.
  await page.getByText("Add comparison").click()
  await page.getByText("S&P 500").click()
  await expect(page.getByText(/currencies differ \(PLN vs USD\)/)).toBeVisible({ timeout: 20000 })
  await page.waitForTimeout(1000)
  expectSameBox(base, await plotBox(page), "after comparison")
})
