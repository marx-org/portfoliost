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
  const text = (await locator.innerText()).trim()
  const m = text.match(/-?[\d,]+\.\d{2}/)
  if (!m) throw new Error(`no amount in "${text}"`)
  const value = Number(m[0].replace(/,/g, ""))
  return text.startsWith("-") ? -Math.abs(value) : value
}

/** Pick a display currency from the page's own selector. */
async function setDisplayCurrency(page: Page, code: string) {
  await page.getByRole("button", { name: /Display currency:/ }).click()
  await page.getByTestId("display-currency-menu").getByRole("button", { name: code, exact: true }).click()
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
  // The list is asserted in full so a tab that lands in the wrong place is visible.
  await expect(strip).toHaveText(["Accounts balance", "Portfolios", "Virtual Portfolios", "Consolidated holdings", "Performance", "Transactions", "Watchlists"])

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
  //
  // Scoped to the Top10 row rather than asserting the account list has exactly
  // one row: what this test checks is that Top10's arithmetic adds up, and the
  // global count made it fail on any machine where another spec had left a
  // throwaway portfolio behind (several do, and they clean up best-effort).
  const row = page.getByTestId("accounts-balance-row").filter({ hasText: "Top10" })
  await expect(row).toHaveCount(1)
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

test("the consolidated holdings tab keeps portfolio context", async ({ page }) => {
  await login(page)
  await page.goto("/en/investments/holdings")

  await expect(page.getByRole("heading", { name: "Consolidated holdings" })).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "Portfolio", exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator("tbody tr").filter({ hasText: "Top10" }).first()).toBeVisible()
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

/**
 * §84.10 — the responsive layout, across the three widths the feature was designed
 * against. This is the project's FIRST responsive table and its first multi-viewport
 * e2e: `playwright.config.ts` pins Desktop Chrome at 1280x720 and no table in the repo
 * uses a breakpoint, so without this block the whole feature could regress to an
 * unusable phone layout with the suite still green.
 *
 * Viewports are set per test with `page.setViewportSize` rather than by touching the
 * config, because the rest of the suite depends on the 1280x720 default.
 */
test.describe("§84.10 accounts balance across viewports", () => {
  const HEADERS = ["Account", "Investments", "Free cash", "Total", "Deposits", "P/L", "Return %"]

  async function openTable(page: Page, width: number, height: number) {
    await page.setViewportSize({ width, height })
    await login(page)
    await page.goto("/en/investments/accounts-balance")
    // The table sits behind store.fetchAll() — wait for it, do not poll the DOM early.
    await expect(page.getByTestId("accounts-balance")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId("accounts-balance-row").first()).toBeVisible()
  }

  /** Clipped money cells, as "rowN/colN". Empty means nothing overflows its column. */
  async function clippedMoneyCells(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const out: string[] = []
      const rows = [...document.querySelectorAll('[data-testid="accounts-balance-row"]')]
      rows.forEach((r, ri) => {
        ;[...r.querySelectorAll("td")].forEach((c, ci) => {
          if (ci === 0) return
          const range = document.createRange()
          range.selectNodeContents(c)
          if (range.getBoundingClientRect().width > c.getBoundingClientRect().width + 0.5) {
            out.push(`row${ri}/col${ci}`)
          }
        })
      })
      return out
    })
  }

  test("keeps the Account column pinned when the table is scrolled right", async ({ page }) => {
    await openTable(page, 390, 844)

    // Scroll right far enough that an unpinned Account column is entirely gone: it
    // is ~144px wide inside an ~848px table.
    const scrollable = await page.evaluate(() => {
      const wrap = document.querySelector('[data-testid="accounts-balance"]')!.parentElement!
      return wrap.scrollWidth - wrap.clientWidth
    })
    expect(scrollable).toBeGreaterThan(400)

    const accountCell = page.getByTestId("accounts-balance-account").first()
    const before = (await accountCell.boundingBox())!.x
    await page.evaluate(() => {
      document.querySelector('[data-testid="accounts-balance"]')!.parentElement!.scrollLeft = 400
    })
    const after = (await accountCell.boundingBox())!.x
    // The regression this guards: the Account column used to scroll away entirely
    // (x went 25 -> -375 at 390px), leaving a grid of numbers with no names on it.
    expect(Math.abs(after - before)).toBeLessThanOrEqual(1)

    // …and it must not be a translucent cell with numbers bleeding through it.
    const alpha = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="accounts-balance-account"]')!
      const color = getComputedStyle(el).backgroundColor
      const alpha = color.match(/(?:\/|,)\s*([\d.]+)(%)?\s*\)$/)
      if (!alpha) return color === "transparent" ? 0 : 1
      return Number(alpha[1]) * (alpha[2] ? 0.01 : 1)
    })
    expect(alpha).toBe(1)
  })

  test("overflows rather than compressing, and clips nothing", async ({ page }) => {
    await openTable(page, 390, 844)
    const { tableW, clientW } = await page.evaluate(() => {
      const t = document.querySelector('[data-testid="accounts-balance"]')!
      return { tableW: t.getBoundingClientRect().width, clientW: t.parentElement!.clientWidth }
    })
    expect(tableW).toBeGreaterThan(clientW)
    // No money column may be narrower than the widest value it has to render.
    expect(await clippedMoneyCells(page)).toEqual([])

    // …and every account name is fully visible: wrapped, never truncated.
    const truncated = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="accounts-balance-account"]')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent?.trim()),
    )
    expect(truncated).toEqual([])
  })

  test("keeps every body row a usable touch target at 390px", async ({ page }) => {
    await openTable(page, 390, 844)
    const heights = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="accounts-balance-row"] td')].map(
        (td) => td.getBoundingClientRect().height,
      ),
    )
    expect(heights.length).toBeGreaterThan(0)
    // The measured minimum is 45px. A single-line row is the binding case: short
    // names like "Top10" are exactly the rows that do not wrap.
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44)
  })

  test("leaves the desktop layout exactly as it was", async ({ page }) => {
    await openTable(page, 1280, 720)
    const desktop = await page.evaluate(() => {
      const t = document.querySelector('[data-testid="accounts-balance"]')!
      const td = document.querySelector('[data-testid="accounts-balance-row"] td:nth-of-type(2)')!
      const cs = getComputedStyle(td)
      return {
        fontSize: getComputedStyle(t).fontSize,
        padLeft: cs.paddingLeft,
        padTop: cs.paddingTop,
        tableW: t.getBoundingClientRect().width,
        clientW: t.parentElement!.clientWidth,
      }
    })
    // These are the sm: values, so the phone density change cannot leak onto desktop.
    expect(desktop.fontSize).toBe("14px")
    expect(desktop.padLeft).toBe("20px")
    expect(desktop.padTop).toBe("10px")
    // …and no horizontal scrolling is needed at desktop width.
    expect(desktop.tableW).toBeLessThanOrEqual(desktop.clientW + 1)
  })

  test("shows the same seven headers and totals at every width", async ({ page }) => {
    // Three viewport changes and three loads in one test, so it needs more than the
    // 30s default.
    test.setTimeout(120_000)
    // Log in ONCE. The session cookie survives a viewport change, so re-running the
    // login flow per width is pure cost — it is what blew the default timeout first.
    await page.setViewportSize({ width: 1280, height: 720 })
    await login(page)

    // The regression guard for the density work: a width floor or a hidden column
    // would change the header array. The [↑↓] strip is this file's existing
    // convention for the sort glyph.
    for (const [w, h] of [
      [390, 844],
      [768, 1024],
      [1280, 720],
    ] as const) {
      await page.setViewportSize({ width: w, height: h })
      await page.goto("/en/investments/accounts-balance")
      await expect(page.getByTestId("accounts-balance")).toBeVisible({ timeout: 30_000 })
      const headers = await page
        .locator('[data-testid="accounts-balance"] thead th')
        .allInnerTexts()
        .then((t) => t.map((x) => x.replace(/[↑↓]/g, "").trim()))
      expect(headers, `headers at ${w}px`).toEqual(HEADERS)
      await expect(page.getByTestId("accounts-balance-totals")).toBeVisible()
    }
  })
})
