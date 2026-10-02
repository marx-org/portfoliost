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

/** §82.5 — the overview card's Net gain tile and the yearly table's Gain column
 *  share ONE rate (`useDisplayConversion().convert`), and the yearly Σ footer is
 *  asserted equal to the tile on screen. That equality is the property: it can
 *  only hold because both read the same conversion, so a regression in either is
 *  one assertion away.
 *
 *  Yearly is gated to the `ALL` timeframe (`analytics` is timeframe-filtered
 *  server-side), so this drives ALL → Yearly rather than relying on a default. */
async function token(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  return ((await res.json()) as { access_token?: string }).access_token ?? ""
}

/** "zł 11,599.01" / "$11,599.01" → 11599.01. Returns null for the "—" placeholder. */
function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[^0-9.,-]/g, "")
  if (!cleaned) return null
  return Number(cleaned.replace(/,/g, ""))
}

test("overview Net gain tile and yearly Gain column re-convert together (§82.5)", async ({ page, request }) => {
  const auth = { Authorization: `Bearer ${await token(request)}` }
  const portfolios = (await (await request.get(`${GATEWAY}/api/portfolios`, { headers: auth })).json()) as Array<{
    id: string
    name: string
  }>
  const top10 = portfolios.find((p) => p.name === "Top10")
  expect(top10, "seeded Top10 portfolio").toBeTruthy()

  const detail = (await (
    await request.get(`${GATEWAY}/api/portfolios/${top10!.id}`, { headers: auth })
  ).json()) as { baseCurrency?: string }
  const baseCcy = (detail.baseCurrency ?? "USD").toUpperCase()

  // The seeded history is what it is; read the SAME numbers the SPA will render
  // so the assertions are against the payload, not against a guess.
  const analytics = (await (
    await request.get(`${GATEWAY}/api/portfolios/${top10!.id}/analytics?timeframe=ALL`, { headers: auth })
  ).json()) as {
    performance?: {
      totalReturn?: number
      timeSeries?: Array<{ value?: number; invested?: number | null }>
      annualizedReturn?: number | null
    }
  }
  const series = analytics.performance?.timeSeries ?? []
  const totalReturn = analytics.performance?.totalReturn ?? 0
  expect(series.length, "seeded Top10 has a populated ALL series").toBeGreaterThan(1)
  expect(totalReturn).not.toBe(0)

  // §82.5 (PROD) — the Σ Gain footer is `totalReturn − openingNet`, NOT
  // `totalReturn`. D88 claimed they were equal; that holds only for a series
  // that opens at net 0, which the compose seed always is and PROD often is not
  // (6 of 10 PROD portfolios open non-zero; the gap reaches 45%). Asserting the
  // bare equality here would pass in compose forever and be false in PROD, so the
  // opening net is read from the payload and subtracted explicitly.
  const openingNet = (series[0]?.value ?? 0) - (series[0]?.invested ?? 0)
  expect(openingNet, "compose seed opens at net 0").toBe(0)
  const expectedGain = totalReturn - openingNet

  const rate = ((await (await request.get(`${GATEWAY}/api/fx/latest?from=${baseCcy}&to=PLN`, { headers: auth })).json()) as {
    rate: number
  }).rate
  expect(rate).toBeGreaterThan(0)

  await login(page)
  await page.goto(`/en/portfolios/${top10!.id}/performance`)

  // ALL, then Yearly — the gate is part of the feature under test.
  await page.getByRole("button", { name: "ALL", exact: true }).click()
  const yearlyBtn = page.getByTestId("perf-returns-mode-yearly")
  await expect(yearlyBtn).toBeEnabled({ timeout: 30_000 })
  await yearlyBtn.click()
  await expect(page.getByTestId("perf-returns-yearly")).toBeVisible()

  const netGain = page.getByTestId("perf-overview-net-gain")
  const sumGain = page.getByTestId("perf-returns-yearly-total-gain")

  // Baseline (display USD): the tile is the payload's `totalReturn` …
  await expect(netGain).toHaveText(/[\d,]+\.\d\d/)
  // … and the Σ footer is the same figure net of the series' opening net.
  await expect
    .poll(async () => parseMoney(await sumGain.textContent() ?? ""), { timeout: 15_000 })
    .toBeCloseTo(expectedGain, 1)
  await expect
    .poll(async () => parseMoney(await netGain.textContent() ?? ""), { timeout: 15_000 })
    .toBeCloseTo(totalReturn, 1)

  // Switch the display to PLN: both re-convert by the live rate.
  await page.getByRole("button", { name: /Display currency:/ }).click()
  await page.locator("div.absolute.right-0").getByRole("button", { name: "PLN", exact: true }).click()

  await expect
    .poll(async () => parseMoney(await netGain.textContent() ?? ""), {
      timeout: 15_000,
      message: "Net gain tile should re-convert to PLN",
    })
    .toBeCloseTo(totalReturn * rate, 0)

  // Both re-converted by the SAME rate — which is the property this case exists
  // for. They are two different quantities that must move together, not one
  // number asserted twice, so the equality is on the RATE, not the amount.
  await expect
    .poll(
      async () => {
        const tile = parseMoney(await netGain.textContent() ?? "")
        const sum = parseMoney(await sumGain.textContent() ?? "")
        return tile && sum ? tile / sum : 0
      },
      { timeout: 15_000, message: "tile and Σ footer must re-convert by the same rate" },
    )
    .toBeCloseTo(totalReturn / expectedGain, 3)
  await expect(sumGain).toHaveText(/PLN|zł|₺/)
})
