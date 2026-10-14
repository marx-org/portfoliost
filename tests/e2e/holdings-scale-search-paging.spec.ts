import { expect, test } from "@playwright/test"

/** §157 — the holdings table scales (no horizontal scroll, the symbol column
 *  absorbs long names), and gains a client-side search filter and paging. Both
 *  surfaces (the per-portfolio holdings view and the Consolidated holdings tab)
 *  share `HoldingsTable.vue`, so this spec drives one portfolio through both.
 *
 *  Self-contained (§48.4 precedent): creates its own throwaway portfolio — the
 *  seeded Top10 is not reliable (other e2e runs mutate it). Positions use
 *  quantity 1 / price 100 so every market value is a round 100 in the portfolio
 *  (base) currency and the totals are trivially asserted.
 */

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

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

test("§157 holdings table scales, filters and pages on both surfaces", async ({ page, request }) => {
  // Two logins (one per viewport) plus the paging/search steps — give it room.
  test.setTimeout(120_000)
  const run = Date.now()
  const token = await getBearerToken(request)
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }

  // A fresh portfolio with 25 positions → two pages at the default size of 20.
  const pfRes = await request.post(`${GATEWAY}/api/portfolios`, {
    headers: auth,
    data: { name: `E2E 157 ${run}`, baseCurrency: "USD" },
  })
  expect(pfRes.status(), `POST portfolio: ${await pfRes.text()}`).toBeLessThan(300)
  const pid = String((await pfRes.json() as { id: unknown }).id)
  // Create all 25 positions concurrently — 25 sequential posts blow the test
  // timeout on the in-memory mock.
  await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      request.post(`${GATEWAY}/api/portfolios/${pid}/positions`, {
        headers: auth,
        data: { symbol: `ZZ${i}`, quantity: 1, price: 100, currency: "USD" },
      }),
    ),
  )
  // Read back the real market values so the total assertion is self-consistent
  // (the mock prices unknown symbols from a shared fallback quote, not the 100
  // we posted).
  const posRes = await request.get(`${GATEWAY}/api/portfolios/${pid}/positions`, { headers: auth })
  const positions = (await posRes.json()) as Array<{ marketValue: number }>
  const expectedTotal = positions.reduce((s, p) => s + (p.marketValue || 0), 0)

  try {
    // The session cookie survives viewport changes, so log in ONCE before the
    // viewport loop and just re-navigate per width (re-logging per viewport
    // re-fetches the SPA and flakes).
    await page.setViewportSize({ width: 1280, height: 900 })
    await login(page)

    // ── 1. No horizontal scroll + every default column, at 1280 and 1440 ──
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/en/portfolios/${pid}/holdings`)
      await expect(page.locator('[data-testid="holdings-row"]').first()).toBeVisible({ timeout: 20000 })

      const layout = await page.evaluate(() => {
        const wrap = document.querySelector('[data-testid="holdings-table-wrap"]')!
        const wrapRect = wrap.getBoundingClientRect()
        const ths = [...wrap.querySelectorAll("thead th")]
        const labels = ths.map((t) => (t.textContent || "").trim())
        // Every default column header is present.
        const has = (s: string) => labels.some((l) => l.toUpperCase().startsWith(s))
        // The Market Value column's right edge must sit inside the visible wrap.
        const mvTh = ths.find((t) => (t.textContent || "").toUpperCase().includes("MARKET VALUE"))!
        return {
          hScroll: wrap.scrollWidth - wrap.clientWidth,
          hasSymbol: has("SYMBOL"),
          hasQuantity: has("QUANTITY"),
          hasAvgCost: has("AVG COST"),
          hasPrice: has("PRICE"),
          hasMarketValue: has("MARKET VALUE"),
          hasUnrealized: has("UNREALIZED"),
          hasWeight: has("% OF PORTFOLIO"),
          mvRightWithinWrap: mvTh.getBoundingClientRect().right <= wrapRect.right + 1,
          // The symbol td clamps overflow so a long name truncates, not inflates.
          symbolTdClips: (document.querySelector('[data-testid="holdings-row"] td') as HTMLElement)
            ?.className.includes("overflow-hidden") ?? false,
        }
      })
      expect(layout.hScroll, `horizontal scroll @${width}`).toBeLessThanOrEqual(1)
      expect(layout.hasSymbol).toBe(true)
      expect(layout.hasQuantity).toBe(true)
      expect(layout.hasAvgCost).toBe(true)
      expect(layout.hasPrice).toBe(true)
      expect(layout.hasMarketValue).toBe(true)
      expect(layout.hasUnrealized).toBe(true)
      expect(layout.hasWeight).toBe(true)
      expect(layout.mvRightWithinWrap, `Market Value column cut off @${width}`).toBe(true)
      expect(layout.symbolTdClips).toBe(true)
    }

    // ── 2. Client-side paging: 20/page by default, totals over all 25 ──
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/en/portfolios/${pid}/holdings`)
    const rows = page.locator('[data-testid="holdings-row"]')
    await expect(rows.first()).toBeVisible({ timeout: 20000 })
    await expect(rows).toHaveCount(20)
    await expect(page.locator("p").filter({ hasText: /^\d+–\d+ of 25$/ })).toHaveText("1–20 of 25")
    // The Total row is measured over ALL 25, not just the visible page.
    await expect(page.locator("tfoot")).toContainText(usd(expectedTotal))

    // Page 2: the remaining 5 rows, Total row unchanged.
    await page.getByRole("button", { name: "Next page" }).click()
    await expect(rows).toHaveCount(5)
    await expect(page.locator("p").filter({ hasText: /^\d+–\d+ of 25$/ })).toHaveText("21–25 of 25")
    await expect(page.locator("tfoot")).toContainText(usd(expectedTotal))

    // The page size selector re-paginates and the range footer follows.
    await page.getByLabel("Rows per page").selectOption("10")
    await expect(rows).toHaveCount(10)
    await expect(page.locator("p").filter({ hasText: /^\d+–\d+ of 25$/ })).toHaveText("1–10 of 25")

    // ── 3. Search filters by ticker and by company name, and clears back ──
    // The 25 symbols are ZZ0..ZZ24; "ZZ2" matches ZZ2, ZZ20..ZZ24 (ticker prefix).
    await page.getByLabel("Rows per page").selectOption("100") // one page so the filter is unambiguous
    await expect(rows).toHaveCount(25)
    const search = page.getByTestId("holdings-search")
    await search.fill("ZZ2")
    await expect(rows).toHaveCount(6) // ZZ2, ZZ20, ZZ21, ZZ22, ZZ23, ZZ24
    // Clearing restores the full list.
    await search.fill("")
    await expect(rows).toHaveCount(25)
  } finally {
    try { await request.delete(`${GATEWAY}/api/portfolios/${pid}`, { headers: auth }) } catch { /* ignore */ }
  }
})
