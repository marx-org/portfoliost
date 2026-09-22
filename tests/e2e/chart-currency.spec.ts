import { expect, test } from "@playwright/test"
import { DEMO_FX } from "../../mocks/db-seed/constants.mjs"

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
    // trimStart: the title h2 wraps "Price Chart" + the currency <select>
    // (plan §48.5), so its textContent may carry leading whitespace.
    const chartCard = cards.find((c) => (c.querySelector("h2")?.textContent ?? "").trimStart().startsWith("Price Chart"))
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

test("§47.7: forced % normalization is flagged on the active Price mode (SNT.WA vs SPY)", async ({ page }) => {
  await login(page)
  await page.goto("/en/research/SNT.WA/overview")

  await expect(page.getByRole("heading", { name: /Price Chart/ })).toBeVisible({ timeout: 20000 })
  await expect(page.locator(".apexcharts-canvas").first()).toBeVisible({ timeout: 20000 })

  await page.getByText("Add comparison").click()
  await page.getByText("S&P 500").click()
  await expect(page.getByText(/currencies differ \(PLN vs USD\)/)).toBeVisible({ timeout: 20000 })

  // The active mode button keeps the "Price" highlight (the user's selection
  // is untouched) but flags the forced percent axis: "Price → %".
  const priceButton = page.locator('button:has([data-testid="mode-price-forced-pct"])')
  await expect(priceButton).toHaveText("Price → %")
  await expect(priceButton).toHaveClass(/bg-slate-800/)
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

/**
 * Plan §48.4a — chart resilience against a provider-tier 502 burst: the
 * background /history leg fails while the price-bars-rendered series is
 * visible (this is what happens under parallel e2e load). The series must be
 * kept — a failed /history never clears an already-rendered chart.
 */
test("price chart keeps the rendered series when /history 502s (provider burst)", async ({ page }) => {
  await login(page)
  await page.goto("/en/research/SNT.WA/overview")

  await expect(page.getByRole("heading", { name: "Price Chart" })).toBeVisible({ timeout: 20000 })
  await expect(page.locator(".apexcharts-canvas").first()).toBeVisible({ timeout: 20000 })
  // Precondition: a series is rendered (price-bars or full history).
  await expect
    .poll(async () => (await priceChartYAxis(page)).length, { timeout: 15000 })
    .toBeGreaterThan(0)

  // Force a 502 on the background full-history fetch for this symbol.
  await page.route("**/api/instruments/SNT.WA/history*", (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "BadGateway", message: "upstream 502" }),
    }),
  )

  // Selecting a comparison re-fires the two-stage load → /history leg 502s.
  await page.getByText("Add comparison").click()
  await page.getByText("S&P 500").click()

  // The failure is surfaced as a dismissible notice…
  await expect(page.getByText(/Full history unavailable/)).toBeVisible({ timeout: 15000 })
  // …and the series is never wiped: the chart falls back to the price-bars
  // data (possibly different axis values than the full-history series) but
  // always keeps a rendered, axis-labeled series.
  await expect
    .poll(async () => (await priceChartYAxis(page)).length, { timeout: 15000 })
    .toBeGreaterThan(0)
  await expect(page.getByText("No price history available")).toHaveCount(0)
  await expect(page.locator(".apexcharts-canvas").first()).toBeVisible()
})

/**
 * Plan §48.5 — the chart title currency is a selector (registry from
 * /api/currencies, default = the instrument's base currency). Selecting a
 * currency re-fetches both legs with ?currency= (server-side conversion),
 * converts the axis, and caveats via fxFrom when the visible window holds
 * unconverted bars. FX expectations derive from the seeded fixture only
 * (mocks/db-seed DEMO_FX — the §48.4 rule).
 */
test("§48.5 — currency selector converts the series + caveat (SNT.WA PLN→USD)", async ({ page }) => {
  await login(page)

  // Capture both price-bars responses (native on load, converted after the
  // selection) to assert exact fixture values.
  const captured: { native?: { closes: number[]; dates: string[]; currency: string; baseCurrency?: string | null; fxFrom?: string | null }; usd?: typeof captured.native } = {}
  await page.route("**/api/instruments/SNT.WA/price-bars*", async (route) => {
    const url = new URL(route.request().url())
    const resp = await route.fetch()
    const body = await resp.json().catch(() => null)
    if (body) {
      if (url.searchParams.get("currency")) captured.usd = body
      else captured.native = body
    }
    await route.fulfill({ response: resp, body: body ? JSON.stringify(body) : "" })
  })

  await page.goto("/en/research/SNT.WA/overview")

  await expect(page.getByRole("heading", { name: /Price Chart/ })).toBeVisible({ timeout: 20000 })
  await expect(page.locator(".apexcharts-canvas").first()).toBeVisible({ timeout: 20000 })
  await expect
    .poll(async () => (await priceChartYAxis(page)).length, { timeout: 15000 })
    .toBeGreaterThan(0)

  // Default = the instrument's base currency.
  const select = page.getByTestId("chart-currency-select")
  await expect(select).toBeVisible({ timeout: 10000 })
  await expect(select).toHaveValue("PLN")
  const ylabelsNative = await priceChartYAxis(page)
  expect(ylabelsNative.some((t) => t.includes("PLN"))).toBe(true)

  // Select USD → both legs re-fetch with ?currency=USD.
  await select.selectOption("USD")
  await expect(select).toHaveValue("USD")

  // Converted axis: en-US Intl USD renders "$" — no bare "PLN" labels.
  await expect
    .poll(async () => {
      const labels = await priceChartYAxis(page)
      return labels.length > 0 && labels.every((t) => !t.includes("PLN")) && labels.some((t) => t.includes("$"))
    }, { timeout: 30000 })
    .toBe(true)

  // The converted response: USD output, PLN base, converted tail at the
  // seeded fixture rate (flat schedule — exact), unconverted head.
  await expect.poll(async () => !!captured.usd, { timeout: 15000 }).toBe(true)
  expect(captured.usd!.currency).toBe("USD")
  expect(captured.usd!.baseCurrency).toBe("PLN")
  const rate = DEMO_FX.USD / DEMO_FX.PLN
  const last = captured.native!.closes.length - 1
  expect(Math.abs(captured.usd!.closes[last] - captured.native!.closes[last] * rate)).toBeLessThan(1e-6)

  // fxFrom floor: the first bar actually converted (the seeded 30-day
  // schedule starts ~29 days before today, so the default 1Y window still
  // shows unconverted bars) → the caveat renders.
  const firstConverted = captured.usd!.closes.findIndex((c, i) => c !== captured.native!.closes[i])
  expect(firstConverted).toBeGreaterThan(0)
  const fxFrom = captured.native!.dates[firstConverted]
  expect(captured.usd!.fxFrom).toBe(fxFrom)
  await expect(page.getByText(`FX rates from ${fxFrom}; earlier bars in PLN`)).toBeVisible({ timeout: 15000 })

  // §48.5b — the benchmark overlay shares the selected currency: with the
  // USD benchmark on a now-USD axis there is no cross-currency note.
  await page.getByText("Add comparison").click()
  await page.getByText("S&P 500").click()
  await expect(page.getByText("S&P 500 (SPY)").first()).toBeVisible({ timeout: 30000 })
  expect(await page.getByText(/currencies differ/).count()).toBe(0)
})
