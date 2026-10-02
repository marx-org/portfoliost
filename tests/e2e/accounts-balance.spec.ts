import { expect, test, type Locator, type Page } from "@playwright/test"

/**
 * §84.3 — the Accounts balance tab, end to end against the compose stack.
 *
 * Self-contained and idempotent: it creates nothing and deletes nothing, so a
 * second run starts from the same state as the first (`npm run test:e2e` wipes
 * app state in `pretest`, but `npx playwright test` does not).
 *
 * The seeded stack has exactly ONE portfolio (Top10 — `mocks/db-seed/portfolios.mjs`),
 * so the multi-row behaviour (sorting, the em-dash Return % of a zero-deposit row)
 * is the unit test's job. What only a browser can show is that the tab is the
 * landing page, that the row arithmetic holds in the DOM, and that the footer and
 * the dashboard tile are the same number on two different routes.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

async function login(page: Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

async function bearer(request: import("@playwright/test").APIRequestContext): Promise<string> {
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  expect(res.status()).toBe(200)
  return ((await res.json()) as { access_token?: string }).access_token ?? ""
}

/**
 * The rendered money cell as a number. Scoped to the locator passed in — the page
 * hosts several readouts, so a bare `getByTestId` would be ambiguous and a `.first()`
 * could silently pick the wrong cell.
 *
 * The sign is read from the text, not from the match: `Intl` writes it BEFORE the
 * symbol ("−$103,129.91"), so a `-?[\d,]+` pattern would capture an unsigned number
 * and report a −103k loss as a +103k gain.
 */
async function amount(locator: Locator): Promise<number> {
  const text = (await locator.innerText()).replace(/ /g, " ").trim()
  const m = text.match(/-?[\d,]+\.\d{2}/)
  if (!m) throw new Error(`no amount in "${text}"`)
  const value = Number(m[0].replace(/,/g, ""))
  return text.startsWith("-") ? -Math.abs(value) : value
}

/** Pick a display currency from the page's own selector. */
async function setDisplayCurrency(page: Page, code: string) {
  await page.getByRole("button", { name: /Display currency:/ }).click()
  await page.locator("div.absolute.right-0").getByRole("button", { name: code, exact: true }).click()
  await expect(page.getByRole("button", { name: /Display currency:/ })).toContainText(code)
}

test("the accounts balance tab is the landing page, and its rows add up", async ({ page, request }) => {
  const token = await bearer(request)
  const auth = { Authorization: `Bearer ${token}` }

  const pfRes = await request.get(`${GATEWAY}/api/portfolios`, { headers: auth })
  expect(pfRes.status()).toBe(200)
  const top10 = ((await pfRes.json()) as Array<{ id: string; name: string }>).find(
    (p) => p.name === "Top10",
  )
  expect(top10, "seeded Top10 portfolio").toBeTruthy()

  await login(page)

  // §84 — `/` opens the tab, not the portfolios grid.
  await page.goto("/")
  await expect(page).toHaveURL(/\/en\/investments\/accounts-balance$/)

  // First in the strip, on all four views that render it.
  const strip = page.getByRole("navigation", { name: "Investment sections" }).getByRole("link")
  await expect(strip.first()).toHaveText("Accounts balance")
  await expect(strip.first()).toHaveAttribute("href", "/en/investments/accounts-balance")
  await expect(strip).toHaveText(["Accounts balance", "Portfolios", "Transactions", "Watchlists"])

  // The table is behind `store.fetchAll()` (the store is per-route state), so
  // wait for it rather than reading the DOM while the view still says "Loading".
  await expect(page.getByTestId("accounts-balance")).toBeVisible({ timeout: 30_000 })

  const headers = await page.locator('[data-testid="accounts-balance"] thead th').allInnerTexts()
  expect(headers.map((h) => h.replace(/[↑↓]/g, "").trim())).toEqual([
    "Account",
    "Investments",
    "Free cash",
    "Total",
    "Deposits",
    "P/L",
    "Return %",
  ])

  // Column 4 = column 2 + column 3, and column 6 = column 4 − column 5, on the row.
  await expect(page.getByTestId("accounts-balance-row")).toHaveCount(1)
  const row = page.getByTestId("accounts-balance-row").first()
  await expect(row.getByTestId("accounts-balance-account")).toContainText("Top10")
  const [investments, cash, total, deposits, gain] = await Promise.all([
    amount(row.getByTestId("accounts-balance-investments")),
    amount(row.getByTestId("accounts-balance-cash")),
    amount(row.getByTestId("accounts-balance-total")),
    amount(row.getByTestId("accounts-balance-deposits")),
    amount(row.getByTestId("accounts-balance-gain")),
  ])
  expect(total).toBeCloseTo(investments + cash, 1)
  expect(gain).toBeCloseTo(total - deposits, 1)

  // The Σ footer's Total is the aggregate's own totalValue, so it equals the
  // dashboard's "Total value" tile after the same conversion — on another route.
  const footerTotal = await amount(page.getByTestId("accounts-balance-totals-total"))
  await page.goto("/en/investments")
  await expect(page.getByTestId("tile-total-value")).toBeVisible({ timeout: 30_000 })
  const tileTotal = await amount(page.getByTestId("tile-total-value"))
  // Tolerance of 1 unit, not a percentage: both cells are the same conversion of
  // the same number, so anything larger is a real disagreement rather than a
  // rounding difference.
  expect(Math.abs(footerTotal - tileTotal)).toBeLessThanOrEqual(1)

  // A row click opens that portfolio's holdings.
  await page.goto("/en/investments/accounts-balance")
  await page.getByTestId("accounts-balance-row").first().getByTestId("accounts-balance-total").click()
  await expect(page).toHaveURL(new RegExp(`/en/portfolios/${top10!.id}/holdings`))
})

test("the money columns follow the display currency, and switch back", async ({ page, request }) => {
  const token = await bearer(request)
  const auth = { Authorization: `Bearer ${token}` }
  const rate = async (from: string, to: string): Promise<number> => {
    if (from === to) return 1
    const res = await request.get(`${GATEWAY}/api/fx/latest?from=${from}&to=${to}`, { headers: auth })
    expect(res.status()).toBe(200)
    return ((await res.json()) as { rate: number }).rate
  }
  const tmRes = await request.get(`${GATEWAY}/api/portfolios/total-metrics`, { headers: auth })
  expect(tmRes.status()).toBe(200)
  const tm = (await tmRes.json()) as { totalValue: number; baseCurrency: string }

  await login(page)
  await page.goto("/en/investments/accounts-balance")
  const footer = page.getByTestId("accounts-balance-totals-total")
  /**
   * `null` while the cell is still an em dash. `useDisplayConversion.convert()`
   * returns null until the rate resolves and the cell renders "—" rather than 0
   * (§66.3 rule 1), so the first read after a currency switch is legitimately
   * unparseable and the poll has to tolerate it instead of throwing.
   */
  const settled = async (): Promise<number | null> =>
    (await footer.innerText()).includes("—") ? null : amount(footer)

  // Start from a known currency: a sibling spec leaves the server preference on
  // PLN, so assuming the USD default would make this test order-dependent.
  await setDisplayCurrency(page, "USD")
  await expect(footer).toContainText("$")
  const usd = await amount(footer)
  expect(Math.abs(usd - tm.totalValue)).toBeLessThanOrEqual(1)

  await setDisplayCurrency(page, "PLN")
  await expect.poll(settled, { timeout: 30_000 }).not.toBeNull()
  const pln = await amount(footer)
  expect(Math.abs(pln - tm.totalValue * (await rate(tm.baseCurrency, "PLN")))).toBeLessThanOrEqual(
    Math.max(1, tm.totalValue * 0.002),
  )
  // A conversion that did nothing would also pass the equality above only if the
  // rate were 1; assert the cell actually re-denominated.
  expect(Math.abs(pln - usd)).toBeGreaterThan(1)
  // `formatCurrency` renders through `en-US`, where PLN has no narrow symbol, so
  // the cell carries the ISO code rather than "zł" — assert what is actually shown.
  await expect(footer).toContainText("PLN")

  // …and back, so the display preference is left where the rest of the suite
  // expects it.
  await setDisplayCurrency(page, "USD")
  await expect(footer).toContainText("$")
  await expect.poll(settled, { timeout: 30_000 }).toBeCloseTo(usd, 1)
})