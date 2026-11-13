import { expect, test } from "@playwright/test"

/** §62 — the investments "Cash balance" card renders the portfolio-native cash
 * total (totalMetrics.cashValue, already in the total-metrics base currency)
 * converted to the display currency — never a raw sum of native balances under a
 * foreign symbol. Self-contained: creates a funded multi-currency portfolio, then
 * verifies the rendered card total against the live totalMetrics.cashValue
 * converted at the LIVE /api/fx/latest rate for the display currency. */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

async function getBearerToken(request: import("@playwright/test").APIRequestContext): Promise<string> {
  const res = await request.post(`${MOCK}/api/auth/login`, { data: { email: "demo@example.com", password: "example-service-mock" } })
  expect(res.status()).toBe(200)
  return ((await res.json()) as { access_token?: string }).access_token ?? ""
}

/** The card renders with `Intl.NumberFormat(..., { style: "currency" })`, so a
 * negative amount is "-$31,261.62" in USD but "-PLN 124,467.56" in PLN — the
 * sign is attached to the currency symbol, not to the digits. The old
 * `-?[\d,]+\.\d{2}` regex only captured the digits, so it read a negative balance
 * as positive. Take the number, then decide the sign from what precedes it. */
function parseAmount(line: string): number | null {
  const cleaned = line.replace(/\u00a0/g, " ").replace(/\u2212/g, "-").trim()
  const m = cleaned.match(/[\d,]+\.\d{2}/)
  if (!m) return null // "—" while the FX rate is still resolving
  const value = Number(m[0].replace(/,/g, ""))
  const negative = cleaned.slice(0, m.index ?? 0).includes("-") || cleaned.startsWith("(")
  return negative ? -value : value
}

/** The card converts `cashValue` at the live rate, so the rendered amount is
 * expected to match within a cent-scale tolerance, sign included. */
function matches(expected: number, got: number): boolean {
  return Math.abs(got - expected) <= Math.max(1, Math.abs(expected) * 0.002)
}

test("investments cash balance renders the converted total for the display currency", async ({ page, request }) => {
  const run = Date.now()
  const token = await getBearerToken(request)
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }

  const mk = async (path: string, data: unknown) => {
    const res = await request.post(`${GATEWAY}${path}`, { headers: auth, data })
    expect(res.status(), `POST ${path}: ${await res.text()}`).toBeLessThan(300)
    return (await res.json()) as Record<string, unknown>
  }
  // A self-owned multi-currency cash portfolio (PLN + USD).
  const portfolio = await mk("/api/portfolios", { name: `E2E B4 ${run}`, baseCurrency: "USD" })
  const pid = String(portfolio.id)
  await mk(`/api/portfolios/${pid}/cash/deposits`, { amount: 1000, currency: "PLN" })
  await mk(`/api/portfolios/${pid}/cash/deposits`, { amount: 500, currency: "USD" })

  // The live total-cash figure (across every portfolio) in the base currency,
  // plus the FX rate base→display — the card re-expresses cashValue with this.
  const rate = async (from: string, to: string): Promise<number> => {
    if (from === to) return 1
    const res = await request.get(`${GATEWAY}/api/fx/latest?from=${from}&to=${to}`, { headers: auth })
    expect(res.status()).toBe(200)
    return (await res.json() as { rate: number }).rate
  }
  const cashValueInfo = async () => {
    const res = await request.get(`${GATEWAY}/api/portfolios/total-metrics`, { headers: auth })
    expect(res.status()).toBe(200)
    const m = (await res.json()) as { cashValue: number; baseCurrency: string }
    return m
  }

  try {
    await login(page)
    await expect(page.getByTestId("cash-balance")).toBeVisible({ timeout: 10000 })

    const expectTotal = async (display: string) => {
      const { cashValue, baseCurrency } = await cashValueInfo()
      const r = await rate(baseCurrency, display)
      return { expected: cashValue * r, cashValue, baseCurrency }
    }

    // Default display USD. Poll until the card matches rather than until it is
    // positive: aggregate cash across portfolios can legitimately be negative
    // (the replayed trade legs outweigh the deposits), and a `got > 0` gate
    // then waits out the whole timeout on a card that is rendering correctly.
    const usd = await expectTotal("USD")
    await expect
      .poll(
        async () => {
          const got = parseAmount(await page.getByTestId("cash-balance").innerText())
          return got !== null && matches(usd.expected, got)
        },
        {
          timeout: 30000,
          message: `cash card should render cashValue ${usd.cashValue} ${usd.baseCurrency} converted to USD`,
        },
      )
      .toBeTruthy()

    // Switch the display to PLN: the same cash, now valued in PLN.
    await page.getByRole("button", { name: /Display currency:/ }).click()
    await page.locator("div.absolute.right-0").getByRole("button", { name: "PLN", exact: true }).click()
    const pln = await expectTotal("PLN")
    await expect
      .poll(
        async () => {
          const got = parseAmount(await page.getByTestId("cash-balance").innerText())
          return got !== null && matches(pln.expected, got)
        },
        {
          timeout: 30000,
          message: `cash card should render the same cash in PLN (${pln.expected})`,
        },
      )
      .toBeTruthy()
  } finally {
    try { await request.delete(`${GATEWAY}/api/portfolios/${pid}`, { headers: auth }) } catch { /* ignore */ }
  }
})
