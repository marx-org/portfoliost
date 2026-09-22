import { expect, test } from "@playwright/test"

/** §48.6e B3 — the portfolio performance chart plots the analytics series,
 * which is denominated in the portfolio BASE currency (wallets
 * `baseCurrency`). When the display currency differs, the series (and the
 * benchmark overlay) must be converted client-side — the y-axis must never
 * carry a foreign symbol over native values.
 *
 * Uses the seeded Top10 portfolio, reads its actual series max + base
 * currency + the live USD→PLN rate from the API, switches the display to
 * PLN, and asserts the y-axis max tick moved into the converted range
 * (≥ 0.95 × seriesMax × rate) and no longer carries a $ symbol. */

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

/** Compact y-axis ticks ("$120K", "zł500K") → { abs, symbol }. */
function parseTick(label: string): { abs: number; symbol: string } | null {
  const m = label.match(/([^\d]*?)(\d+(?:\.\d+)?)([KMB]?)/)
  if (!m) return null
  const mult = m[3] === "K" ? 1e3 : m[3] === "M" ? 1e6 : m[3] === "B" ? 1e9 : 1
  return { abs: Number(m[2]) * mult, symbol: m[1] }
}

async function yTicks(page: import("@playwright/test").Page) {
  const card = page.locator(".card").filter({ has: page.getByText("Performance Chart:") }).first()
  const labels = await card.locator(".apexcharts-yaxis text").allTextContents()
  return labels.map(parseTick).filter((t): t is { abs: number; symbol: string } => t !== null)
}

test("performance chart converts the series (and axis) to the display currency", async ({ page, request }) => {
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  const token = ((await res.json()) as { access_token?: string }).access_token ?? ""
  const auth = { Authorization: `Bearer ${token}` }

  // Seeded Top10 — its actual series max + base currency from the API.
  const pfRes = await request.get(`${GATEWAY}/api/portfolios`, { headers: auth })
  const portfolios = (await pfRes.json()) as Array<{ id: string; name: string }>
  const top10 = portfolios.find((p) => p.name === "Top10")
  expect(top10, "seeded Top10 portfolio").toBeTruthy()

  const detailRes = await request.get(`${GATEWAY}/api/portfolios/${top10!.id}`, { headers: auth })
  const detail = (await detailRes.json()) as { baseCurrency?: string; currency?: string }
  const baseCcy = (detail.baseCurrency ?? detail.currency ?? "USD").toUpperCase()

  const anRes = await request.get(`${GATEWAY}/api/portfolios/${top10!.id}/analytics?timeframe=1Y`, { headers: auth })
  const an = (await anRes.json()) as {
    performance?: { timeSeries?: Array<{ value?: number }> }
    benchmarks?: Array<{ timeSeries?: Array<{ value?: number }> }>
  }
  const values = [
    ...(an.performance?.timeSeries ?? []).map((p) => p.value ?? 0),
    ...(an.benchmarks ?? []).flatMap((b) => (b.timeSeries ?? []).map((p) => p.value ?? 0)),
  ]
  const seriesMax = Math.max(...values)
  expect(seriesMax, "Top10 has a populated 1Y series").toBeGreaterThan(0)

  const fxRes = await request.get(`${GATEWAY}/api/fx/latest?from=${baseCcy}&to=PLN`, { headers: auth })
  expect(fxRes.status()).toBe(200)
  const rate = ((await fxRes.json()) as { rate: number }).rate
  expect(rate).toBeGreaterThan(0)

  await login(page)
  await page.goto(`/en/portfolios/${top10!.id}/performance`)
  const card = page.locator(".card").filter({ has: page.getByText("Performance Chart:") }).first()
  await expect(card.locator(".apexcharts-canvas")).toBeVisible({ timeout: 30_000 })

  // Baseline (display USD): ticks resolve.
  await expect
    .poll(async () => (await yTicks(page)).filter((t) => t.abs > 0).length, { timeout: 10_000 })
    .toBeGreaterThan(0)

  // Switch the display to PLN: the plotted series (and benchmarks) convert by
  // the live rate — the axis max moves into the converted range and every
  // tick carries the PLN symbol, never "$" over native values.
  await page.getByRole("button", { name: /Display currency:/ }).click()
  await page.locator("div.absolute.right-0").getByRole("button", { name: "PLN", exact: true }).click()

  await expect
    .poll(async () => {
      const t = await yTicks(page)
      return t.length ? Math.max(...t.map((x) => x.abs)) : 0
    }, { timeout: 15_000, message: "y-axis should reflect the converted (PLN) series" })
      .toBeGreaterThanOrEqual(seriesMax * rate * 0.95)

  const ticks = await yTicks(page)
  expect(ticks.every((t) => !t.symbol.includes("$")), "no $ symbol over converted values").toBe(true)
})
