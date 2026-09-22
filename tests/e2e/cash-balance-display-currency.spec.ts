import { expect, test } from "@playwright/test"

/** §48.6e B4 — investments "Cash balance" must render the CONVERTED total
 * (`/api/wallets/total-balance?baseCurrency=<display>`), never the raw sum of
 * native wallet balances under a foreign symbol. Self-contained (§48.4
 * precedent): creates its own funded PLN + USD wallets, then verifies the
 * rendered total against the sum of every wallet's balance converted at the
 * LIVE `/api/fx/latest` rates (leftover wallets from other specs included —
 * the server converts the same set, so the totals must match). */

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
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  expect(res.status()).toBe(200)
  const body = (await res.json()) as { access_token?: string }
  return body.access_token ?? ""
}

function parseAmount(line: string): number {
  const m = line.replace(/\u00a0/g, " ").match(/-?[\d,]+\.\d{2}/)
  if (!m) throw new Error(`no amount in "${line}"`)
  return Number(m[0].replace(/,/g, ""))
}

test("investments cash balance renders the converted total for the display currency", async ({ page, request }) => {
  const run = Date.now()
  const token = await getBearerToken(request)
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }

  const mk = async (path: string, data: unknown) => {
    const res = await request.post(`${GATEWAY}${path}`, { headers: auth, data })
    expect(res.status(), `POST ${path}: ${await res.text()}`).toBeLessThan(300)
    return res.json() as Promise<Record<string, unknown>>
  }
  const plnWallet = await mk("/api/wallets", { name: `E2E B4 PLN ${run}`, currency: "PLN" })
  const usdWallet = await mk("/api/wallets", { name: `E2E B4 USD ${run}`, currency: "USD" })
  await mk(`/api/wallets/${plnWallet.id}/deposits`, { amount: 1_000_000 })
  await mk(`/api/wallets/${usdWallet.id}/deposits`, { amount: 1_000_000 })

  // Live FX rates (the same latest snapshot the server uses).
  const rate = async (from: string, to: string): Promise<number> => {
    if (from === to) return 1
    const res = await request.get(`${GATEWAY}/api/fx/latest?from=${from}&to=${to}`, { headers: auth })
    expect(res.status()).toBe(200)
    const body = (await res.json()) as { rate: number }
    return body.rate
  }
  const expectedTotal = async (target: string): Promise<number> => {
    const res = await request.get(`${GATEWAY}/api/wallets`, { headers: auth })
    const all = (await res.json()) as Array<{ id: string; currency: string; balance: number }>
    let sum = 0
    for (const w of all) sum += w.balance * (await rate(w.currency, target))
    return sum
  }

  try {
    await login(page)
    await expect(page.getByTestId("cash-balance")).toBeVisible({ timeout: 10000 })

    // Default display USD: the rendered total must equal every wallet's
    // balance converted to USD (NOT the raw native sum).
    const usdEl = page.getByTestId("cash-balance")
    await expect
      .poll(async () => (await usdEl.innerText()).replace(/\s/g, "").includes("."), {
        // 30s: under the full parallel suite the gateway queues browser
        // connections and the (one-shot, no-retry) fetch can land late.
        timeout: 30000,
        message: "cash balance should resolve to an amount",
      })
      .toBeTruthy()
    const totalUsd = parseAmount(await usdEl.innerText())
    const expUsd = await expectedTotal("USD")
    expect(Math.abs(totalUsd - expUsd), "USD total = Σ balance × rate(ccy→USD)").toBeLessThanOrEqual(Math.max(1, expUsd * 0.002))
    // A per-currency share chip for my PLN wallet is present (converted
    // weights, not raw balances).
    await expect(page.locator("span").filter({ hasText: /^PLN \d+%$/ }).first()).toBeVisible({ timeout: 5000 })

    // Switch the display to PLN: the same wallets, now valued in PLN.
    await page.getByRole("button", { name: /Display currency:/ }).click()
    await page.locator("div.absolute.right-0").getByRole("button", { name: "PLN", exact: true }).click()

    let totalPln = 0
    await expect
      .poll(async () => {
        // "—" while the (one-shot, no-retry) converted-total fetch is in
        // flight — must return falsy, NOT throw: expect.poll stops on a throw.
        const m = (await page.getByTestId("cash-balance").innerText()).replace(/\u00a0/g, " ").match(/-?[\d,]+\.\d{2}/)
        totalPln = m ? Number(m[0].replace(/,/g, "")) : 0
        return totalPln > 0
      }, { timeout: 30000 })
      .toBeTruthy()
    const expPln = await expectedTotal("PLN")
    expect(Math.abs(totalPln - expPln), "PLN total = Σ balance × rate(ccy→PLN)").toBeLessThanOrEqual(Math.max(1, expPln * 0.002))
  } finally {
    for (const del of [`${GATEWAY}/api/wallets/${plnWallet.id}`, `${GATEWAY}/api/wallets/${usdWallet.id}`]) {
      try { await request.delete(del, { headers: auth }) } catch { /* ignore */ }
    }
  }
})
