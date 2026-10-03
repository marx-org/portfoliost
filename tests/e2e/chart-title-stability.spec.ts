import { expect, test } from "@playwright/test"

/**
 * §47.6 — the Price Chart title carries the resolved instrument currency and
 * the plot box stays put when the transactions toggle / comparison /
 * cross-currency note appear — no card reflow. Plan §48.5: the currency is
 * shown as the title selector, defaulted to the instrument's base currency.
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

  await expect(page.getByRole("heading", { name: /Price Chart/ })).toBeVisible({ timeout: 20000 })
  // §48.5 — the title currency is the selector, defaulted to the base currency.
  await expect(page.getByTestId("chart-currency-select")).toHaveValue("PLN")
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

/**
 * §48.6e B6 — the Price Chart's SVG must fill its fixed 380px wrapper
 * exactly (options.chart.height honored), never the apexcharts "auto"
 * golden-ratio fallback that overflows the card.
 */
test("clicking a transaction marker opens that trade's details", async ({ page }) => {
  await login(page)
  await page.goto("/en/research/SNT.WA/overview")

  await expect(page.getByRole("heading", { name: "Price Chart" })).toBeVisible({ timeout: 20000 })
  await page.getByRole("checkbox", { name: "Transactions" }).check()

  // The click cannot go through `annotations.points[].click`: vue3-apexcharts
  // hands updateOptions a JSON copy of the options, so the function is dropped
  // on the next redraw and the dot is repainted inert. This asserts the real
  // path — a listener bound to the marker node — survives a later redraw too.
  const marker = page.locator(".apexcharts-point-annotation-marker").first()
  await expect(marker).toBeVisible({ timeout: 20000 })
  await marker.click()
  const panel = page.getByTestId("chart-tx-details")
  await expect(panel).toBeVisible()
  // Account, volume and price.
  await expect(panel).toContainText("Top10")
  await expect(panel).toContainText("400 @")

  // A chart option changes (the comparison), which redraws every marker.
  await page.getByText("Add comparison").click()
  await page.getByText("S&P 500").click()
  await expect(page.getByText(/currencies differ \(PLN vs USD\)/)).toBeVisible({ timeout: 20000 })
  await page.waitForTimeout(1000)

  await marker.click()
  await expect(panel).toBeVisible()
  await page.getByTestId("chart-tx-details-close").click()
  await expect(panel).toBeHidden()
})

test("price chart svg height matches the fixed 380px wrapper (AAPL)", async ({ page }) => {
  await login(page)
  await page.goto("/en/research/AAPL/overview")

  await expect(page.getByRole("heading", { name: /Price Chart/ })).toBeVisible({ timeout: 20000 })
  const card = page.getByRole("heading", { name: /Price Chart/ }).locator("xpath=ancestor::div[contains(@class,'card')][1]")
  await expect(card.locator(".apexcharts-svg")).toBeVisible({ timeout: 20000 })

  const heights = await card.evaluate((el) => {
    const svg = el.querySelector("svg.apexcharts-svg") as SVGElement
    const wrapper = svg.closest(".h-\\[380px\\]") as HTMLElement
    return { svg: Number(svg.getAttribute("height")), wrapper: wrapper?.getBoundingClientRect().height ?? -1, card: el.getBoundingClientRect().height, cardScroll: el.scrollHeight }
  })
  expect(heights.wrapper).toBeCloseTo(380, 0)
  expect(heights.svg).toBeCloseTo(380, 0)
  // No overflow: the card (padded 380px wrapper + headers) is not taller than
  // its scroll content would need, and the svg bottom stays inside the card.
  const svgBottomInsideCard = await card.evaluate((el) => {
    const svg = el.querySelector("svg.apexcharts-svg") as SVGElement
    return svg.getBoundingClientRect().bottom <= el.getBoundingClientRect().bottom + 1
  })
  expect(svgBottomInsideCard).toBe(true)
})
