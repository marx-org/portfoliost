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
 * currency re-fetches both legs with ?currency= (server-side conversion) and
 * converts the axis. FX expectations derive from the seeded fixture only
 * (mocks/db-seed DEMO_FX — the §48.4 rule).
 *
 * §75.3: a converted series no longer carries an unconverted head. §72.17
 * (instruments, 2026-09-28) made `?currency=` DROP a bar it cannot convert
 * instead of passing it through in the source currency — "a converted series
 * must not contain another currency". So the response is a strict subset of
 * the native dates, every returned bar is converted, and there is nothing left
 * to caveat. This test used to assert the old §48.5 shape (same-length arrays,
 * `firstConverted > 0`, the caveat line) and went NaN on
 * `usd.closes[native.length - 1]` once the service changed under it.
 */
test("§48.5/§72.17 — currency selector converts the series (SNT.WA PLN→USD)", async ({ page }) => {
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

  // The converted response: USD output, PLN base, every bar converted at the
  // seeded fixture rate (flat schedule — exact).
  await expect.poll(async () => !!captured.usd, { timeout: 15000 }).toBe(true)
  expect(captured.usd!.currency).toBe("USD")
  expect(captured.usd!.baseCurrency).toBe("PLN")
  const rate = DEMO_FX.USD / DEMO_FX.PLN

  // §72.17: the FX floor drops what it cannot convert, so the converted series
  // is a strict subset of the native one (SNT.WA has USD-denominated bars back
  // to 2015; the seeded 30-day FX schedule only covers the last 30 days).
  expect(captured.usd!.closes.length).toBeGreaterThan(0)
  expect(captured.usd!.closes.length).toBeLessThan(captured.native!.closes.length)

  // Every converted bar is the native close for the SAME date times the rate.
  // Keyed by date, not by index: the two series have different lengths, and
  // price_bars_all can hold two sources (stooq + openst) for one date.
  const nativeByDate = new Map<string, number[]>()
  captured.native!.dates.forEach((d, i) => {
    const list = nativeByDate.get(d) ?? []
    list.push(captured.native!.closes[i])
    nativeByDate.set(d, list)
  })
  const lastIdx = captured.usd!.closes.length - 1
  for (let i = 0; i <= lastIdx; i++) {
    const natives = nativeByDate.get(captured.usd!.dates[i]) ?? []
    const expected = natives.map((c) => c * rate)
    expect(
      expected.some((c) => Math.abs(captured.usd!.closes[i] - c) < 1e-6),
      `${captured.usd!.dates[i]}: ${captured.usd!.closes[i]} is not any native close × ${rate}`,
    ).toBe(true)
  }

  // fxFrom = the first bar that converted. With nothing left unconverted it is
  // the first row of the response, and the chart shows no bars before it — so
  // the §48.5a caveat ("earlier bars in PLN") must NOT render: the SPA derives
  // windowStartIso from the first VISIBLE bar, which now equals fxFrom.
  expect(captured.usd!.fxFrom).toBe(captured.usd!.dates[0])
  expect(captured.usd!.dates[0] > captured.native!.dates[0]).toBe(true)
  await expect(page.getByText(/earlier bars in/)).toHaveCount(0)

  // §48.5b — the benchmark overlay shares the selected currency: with the
  // USD benchmark on a now-USD axis there is no cross-currency note.
  await page.getByText("Add comparison").click()
  await page.getByText("S&P 500").click()
  await expect(page.getByText("S&P 500 (SPY)").first()).toBeVisible({ timeout: 30000 })
  expect(await page.getByText(/currencies differ/).count()).toBe(0)
})
