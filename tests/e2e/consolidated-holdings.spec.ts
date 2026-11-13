/**
 * §142 — the consolidated Holdings table at /en/investments/holdings is the same
 * component as the per-portfolio table in `mode="global"`: it aggregates open
 * positions across every portfolio, adds a Portfolio column, and keeps one row
 * per portfolio for a symbol two portfolios both hold.
 *
 * The per-portfolio specs prove the component; they do not prove the mode. This
 * spec drives the global mode specifically: cross-portfolio aggregation, duplicate
 * symbols, labels, sorting, grouping, column customization, CSV export, display
 * currency, research/chart actions, mutations that must land on the OWNING
 * portfolio, and the empty and error states.
 *
 * The demo account is shared and a portfolio with transactions cannot be deleted
 * (409), so rows from every previous run stay in the aggregate. Every assertion
 * here is therefore scoped to the two portfolios this spec creates, or derived
 * from the same `/api/portfolios/positions` payload the view fetched — never from
 * a hardcoded row count (#82, #83).
 */
import { expect, test, type Page, type APIRequestContext } from "@playwright/test"
import { readFileSync } from "node:fs"

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

const RUN = Date.now()
const NAME_A = `E2E Consolidated A ${RUN}`
const NAME_B = `E2E Consolidated B ${RUN}`
const LABEL_NAME = `E2E-CONS-${RUN}`

type Position = {
  id: string
  portfolioId?: string
  portfolioName?: string
  symbol?: string
  quantity?: number
  assetType?: string
  isOpen?: boolean
}

async function login(page: Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

async function auth(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  expect(res.status()).toBe(200)
  const token = ((await res.json()) as { access_token?: string }).access_token ?? ""
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

/**
 * Two portfolios, one shared symbol: AAPL is held by both, MSFT by A only. That
 * is the smallest fixture which can prove aggregation, portfolio context and
 * duplicate-symbol row preservation at the same time.
 */
async function seedPortfolios(request: APIRequestContext, headers: Record<string, string>): Promise<{ a: string; b: string }> {
  const mk = async (name: string): Promise<string> => {
    const res = await request.post(`${GATEWAY}/api/portfolios`, {
      headers,
      data: { name, baseCurrency: "USD" },
    })
    expect(res.status(), `create ${name}: ${await res.text()}`).toBeLessThan(300)
    return String((await res.json() as { id: unknown }).id)
  }
  const buy = async (pid: string, symbol: string, quantity: number, price: number) => {
    const res = await request.post(`${GATEWAY}/api/portfolios/${pid}/transactions`, {
      headers,
      data: { type: "BUY", symbol, quantity, price, currency: "USD" },
    })
    expect(res.status(), `BUY ${symbol}: ${await res.text()}`).toBe(201)
  }
  const a = await mk(NAME_A)
  const b = await mk(NAME_B)
  await buy(a, "AAPL", 5, 100)
  await buy(a, "MSFT", 3, 200)
  await buy(b, "AAPL", 2, 150)
  return { a, b }
}

/** Nothing in the suite deletes the labels it creates; clean this spec's first. */
async function removeOwnLabels(request: APIRequestContext, headers: Record<string, string>) {
  const res = await request.get(`${GATEWAY}/api/labels`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  for (const label of (await res.json()) as Array<{ id: string; name: string }>) {
    if (!/^E2E-CONS-\d+$/.test(label.name)) continue
    const del = await request.delete(`${GATEWAY}/api/labels/${label.id}`, { headers })
    expect(del.status(), `delete ${label.name}: ${await del.text()}`).toBeLessThan(300)
  }
}

async function createLabel(request: APIRequestContext, headers: Record<string, string>): Promise<string> {
  const res = await request.post(`${GATEWAY}/api/labels`, { headers, data: { name: LABEL_NAME } })
  expect(res.status(), await res.text()).toBeLessThan(300)
  return String((await res.json() as { id: unknown }).id)
}

/** The open aggregate exactly as the view sees it — the source of derived asserts. */
async function openPositions(request: APIRequestContext, headers: Record<string, string>): Promise<Position[]> {
  const res = await request.get(`${GATEWAY}/api/portfolios/positions`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  const body = await res.json()
  const rows: Position[] = Array.isArray(body) ? body : (body as { positions: Position[] }).positions ?? []
  return rows.filter((r) => r.isOpen)
}

async function portfolioSymbols(request: APIRequestContext, headers: Record<string, string>, pid: string): Promise<string[]> {
  const res = await request.get(`${GATEWAY}/api/portfolios/${pid}/positions`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  const body = await res.json()
  const rows: Array<{ symbol?: string }> = Array.isArray(body) ? body : (body as { positions: Array<{ symbol?: string }> }).positions ?? []
  return rows.map((r) => String(r.symbol ?? "").toUpperCase())
}

async function transactionCount(request: APIRequestContext, headers: Record<string, string>, pid: string): Promise<number> {
  const res = await request.get(`${GATEWAY}/api/portfolios/${pid}/transactions?page=1&limit=1`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  return Number((await res.json() as { total?: number }).total ?? 0)
}

/**
 * Open the consolidated table. The search box narrows the whole set (paging,
 * totals and the export all follow it), which is how this spec keeps its rows on
 * the visible page without depending on how much data previous runs left behind.
 */
async function filterTable(page: Page, query = "") {
  await page.getByTestId("holdings-page-size").selectOption("100")
  await page.getByTestId("holdings-search").fill(query)
  // Either the table is there or the empty message is — both mean the fetch
  // finished, so the assertions that follow are not racing a loading state.
  await expect(
    page.getByTestId("holdings-table-wrap").or(page.getByText("No positions match the current filters.")),
  ).toBeVisible({ timeout: 20_000 })
}

async function openHoldings(page: Page, query = "") {
  await page.goto("/en/investments/holdings")
  await filterTable(page, query)
}

function quantityOf(row: import("@playwright/test").Locator) {
  return row.locator("td").nth(2).innerText()
}

function asNumber(text: string): number {
  return Number(text.replace(/[^0-9.,-]/g, "").replace(/,/g, ""))
}

test.describe.serial("consolidated holdings (§142)", () => {
  let ids: { a: string; b: string }
  let headers: Record<string, string>

  test.beforeAll(async ({ request }) => {
    headers = await auth(request)
    await removeOwnLabels(request, headers)
    ids = await seedPortfolios(request, headers)
    await createLabel(request, headers)
  })

  test("aggregates both portfolios and keeps a duplicate symbol as two rows", async ({ page, request }) => {
    await login(page)
    await openHoldings(page, "AAPL")

    await expect(page.getByRole("heading", { name: "Consolidated holdings" })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "Portfolio", exact: true })).toBeVisible()

    const rows = page.getByTestId("holdings-row")
    await expect(rows.filter({ hasText: NAME_A })).toHaveCount(1)
    await expect(rows.filter({ hasText: NAME_B })).toHaveCount(1)

    // The two AAPL rows are separate positions, not one merged line: 5 in A, 2 in B.
    const qtyA = asNumber(await quantityOf(rows.filter({ hasText: NAME_A }).first()))
    const qtyB = asNumber(await quantityOf(rows.filter({ hasText: NAME_B }).first()))
    expect(qtyA).toBe(5)
    expect(qtyB).toBe(2)

    // The API agrees with what the table renders, portfolio by portfolio.
    expect(await portfolioSymbols(request, headers, ids.a)).toContain("MSFT")
    expect(await portfolioSymbols(request, headers, ids.b)).toContain("AAPL")
  })

  test("labels: assigning on a consolidated row badges that row and filters the table", async ({ page }) => {
    await login(page)
    await openHoldings(page, "AAPL")

    const rowA = page.getByTestId("holdings-row").filter({ hasText: NAME_A }).first()
    await expect(rowA).toBeVisible()
    await rowA.getByRole("button", { name: "Position actions" }).click()
    await page.getByRole("button", { name: "Set labels..." }).click()

    const picker = page.getByRole("dialog", { name: "Set labels" })
    await expect(picker).toBeVisible()
    await picker.locator("label").filter({ hasText: LABEL_NAME }).getByRole("checkbox").check()
    await picker.getByRole("button", { name: "Save" }).click()
    await expect(picker).not.toBeVisible({ timeout: 10_000 })

    // §90 — saving re-fetches the aggregate. The table must survive that refresh:
    // the 100-row page and the search the user set are still in effect.
    await expect(page.getByTestId("holdings-page-size")).toHaveValue("100")
    await expect(page.getByTestId("holdings-search")).toHaveValue("AAPL")

    // Only the labelled row carries the badge; the other portfolio's AAPL row does not.
    const rows = page.getByTestId("holdings-row")
    await expect(rows.filter({ hasText: LABEL_NAME })).toHaveCount(1)
    await expect(rows.filter({ hasText: LABEL_NAME }).first()).toContainText(NAME_A)

    const chip = page.getByTestId("label-filter-bar").locator(`[title="${LABEL_NAME}"]`)
    await expect(chip).toBeVisible()
    await chip.click()
    await expect(page.getByTestId("holdings-row")).toHaveCount(1)
    await expect(page.getByTestId("holdings-row").first()).toContainText(NAME_A)
    await chip.click()
    await expect(rows.filter({ hasText: LABEL_NAME })).toHaveCount(1)
  })

  test("grouping subtotals and counts match the aggregate the view fetched", async ({ page, request }) => {
    await login(page)
    await openHoldings(page)

    const fetched = await openPositions(request, headers)
    const expected = new Map<string, number>()
    for (const p of fetched) {
      const raw = p.assetType || "Stock"
      const label = raw.charAt(0) + raw.slice(1).toLowerCase()
      expected.set(label, (expected.get(label) ?? 0) + 1)
    }
    expect(expected.size).toBeGreaterThan(1)

    await page.getByLabel("Group by").selectOption("assetType")
    const groupRows = page.getByTestId("holdings-group-row")
    await expect(groupRows).toHaveCount(expected.size)
    for (const [label, count] of expected) {
      const header = groupRows.filter({ hasText: label }).first()
      await expect(header).toBeVisible()
      // The header's counter is the size of the group, not of the visible page.
      await expect(header).toContainText(String(count))
    }

    await page.getByLabel("Group by").selectOption("none")
  })

  test("sorting the consolidated table orders the aggregate", async ({ page, request }) => {
    await login(page)
    await openHoldings(page)

    const fetched = await openPositions(request, headers)
    const minQuantity = Math.min(...fetched.map((p) => p.quantity ?? 0))

    await page.getByRole("columnheader", { name: "Quantity" }).click()
    await expect(page.getByRole("columnheader", { name: "Quantity" })).toHaveAttribute("aria-sort", "ascending")

    const quantities: number[] = []
    for (const row of await page.getByTestId("holdings-row").all()) {
      quantities.push(asNumber(await quantityOf(row)))
    }
    expect(quantities).toEqual([...quantities].sort((x, y) => x - y))
    expect(quantities[0]).toBe(minQuantity)

    await page.getByRole("columnheader", { name: "Quantity" }).click()
    await expect(page.getByRole("columnheader", { name: "Quantity" })).toHaveAttribute("aria-sort", "descending")
  })

  test("column customization and CSV export reflect the consolidated set", async ({ page, request }) => {
    await login(page)
    await openHoldings(page)

    await page.getByRole("button", { name: /^Customize \d+$/ }).click()
    const realized = page.getByRole("checkbox", { name: "Realized P/L", exact: true })
    await expect(realized).toBeChecked()
    await realized.setChecked(false)
    await expect(page.getByTestId("holdings-column-realized")).toHaveCount(0)
    await realized.setChecked(true)
    await expect(page.getByTestId("holdings-column-realized")).toHaveCount(1)
    // The customize panel is z-30 over a fixed inset-0 z-20 backdrop, so the
    // Customize button itself is not clickable while the menu is open.
    await page.locator("div.fixed.inset-0.z-20").click()

    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "Export", exact: true }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe("consolidated-positions.csv")

    const path = await download.path()
    const csv = path ? readFileSync(path, "utf8") : ""
    const lines = csv.split("\n").filter(Boolean)
    expect(lines[0]).toBe("Symbol,Quantity,Avg Cost,Price,Market Value,Unrealized P/L,Realized P/L,Weight")
    const rows = lines.slice(1)

    // One exported line per open position in the aggregate — the duplicate symbol
    // is not merged into a single line.
    const fetched = await openPositions(request, headers)
    expect(rows.length).toBe(fetched.length)
    const aapl = rows.filter((r) => r.split(",")[0].toUpperCase() === "AAPL")
    expect(aapl.some((r) => r.startsWith("AAPL,5,100"))).toBe(true)
    expect(aapl.some((r) => r.startsWith("AAPL,2,150"))).toBe(true)
    expect(rows.some((r) => r.split(",")[0].toUpperCase() === "MSFT")).toBe(true)
  })

  test("the display currency re-expresses consolidated values", async ({ page }) => {
    await login(page)
    await page.goto("/en/investments")
    await page.getByRole("button", { name: /Display currency:/ }).click()
    await page.locator("div.absolute.right-0").getByRole("button", { name: "PLN", exact: true }).click()

    await openHoldings(page, "AAPL")
    const row = page.getByTestId("holdings-row").filter({ hasText: NAME_A }).first()
    await expect(row).toBeVisible()
    // The instrument is USD-denominated, so the row must show the native amount
    // and the PLN conversion, not a bare USD figure.
    await expect(row).toContainText("PLN")

    // Restore the default so a later spec asserting the USD rendering is not
    // reading this spec's leftover preference.
    await page.goto("/en/investments")
    await page.getByRole("button", { name: /Display currency:/ }).click()
    await page.locator("div.absolute.right-0").getByRole("button", { name: "USD", exact: true }).click()
  })

  test("research and chart actions open from a consolidated row", async ({ page }) => {
    await login(page)
    await openHoldings(page, "MSFT")

    const row = page.getByTestId("holdings-row").filter({ hasText: NAME_A }).first()
    await row.getByRole("button", { name: "Position actions" }).click()
    await page.getByRole("button", { name: "Research" }).click()
    await expect(page).toHaveURL(/\/en\/research\/MSFT\/overview\?from=\/en\/investments\/holdings/)

    await openHoldings(page, "MSFT")
    const row2 = page.getByTestId("holdings-row").filter({ hasText: NAME_A }).first()
    await row2.getByRole("button", { name: "Position actions" }).click()
    await page.getByRole("button", { name: "View chart" }).click()
    await expect(page.getByTestId("ticker-badge").first()).toBeVisible()
    await page.getByRole("button", { name: "Close" }).click()
  })

  test("a Buy from a consolidated row lands in the owning portfolio and refreshes the row", async ({ page, request }) => {
    await login(page)
    await openHoldings(page, "AAPL")

    const beforeA = await transactionCount(request, headers, ids.a)
    const beforeB = await transactionCount(request, headers, ids.b)

    const rowB = page.getByTestId("holdings-row").filter({ hasText: NAME_B }).first()
    await rowB.getByRole("button", { name: "Position actions" }).click()
    await page.getByRole("button", { name: "Buy", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: /Buy AAPL/ })
    await expect(dialog).toBeVisible()
    await page.getByTestId("add-position-quantity").fill("1")
    await page.getByTestId("add-position-price").fill("110")
    await page.getByRole("button", { name: /Buy for/ }).click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })

    // The leg is written to B, not to A, and the aggregate row for B shows 3.
    await expect.poll(async () => transactionCount(request, headers, ids.b), { timeout: 15_000 }).toBe(beforeB + 1)
    expect(await transactionCount(request, headers, ids.a)).toBe(beforeA)

    // §90 — the aggregate refreshed in place, so the controls are still set and the
    // row for B is on the visible page with its new quantity.
    await expect(page.getByTestId("holdings-page-size")).toHaveValue("100")
    await expect(page.getByTestId("holdings-search")).toHaveValue("AAPL")
    await expect.poll(
      async () => asNumber(await quantityOf(page.getByTestId("holdings-row").filter({ hasText: NAME_B }).first())),
      { timeout: 15_000 },
    ).toBe(3)
    expect(asNumber(await quantityOf(page.getByTestId("holdings-row").filter({ hasText: NAME_A }).first()))).toBe(5)
  })

  test("the empty state is stated when nothing matches", async ({ page }) => {
    await login(page)
    await openHoldings(page, "not-a-real-ticker-zzz")
    await expect(page.getByTestId("holdings-table-wrap")).toHaveCount(0)
    await expect(page.getByText("No positions match the current filters.")).toBeVisible()
  })

  test("the error state offers a Retry that restores the table", async ({ page }) => {
    await login(page)
    await page.route("**/api/portfolios/positions*", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Holdings unavailable (test)" }) }),
    )
    await page.goto("/en/investments/holdings")
    await expect(page.getByText("Holdings unavailable (test)")).toBeVisible()
    const retry = page.getByRole("button", { name: "Retry" })
    await expect(retry).toBeVisible()
    await expect(page.getByTestId("holdings-table-wrap")).toHaveCount(0)

    await page.unroute("**/api/portfolios/positions*")
    await retry.click()
    await expect(page.getByTestId("holdings-table-wrap")).toBeVisible({ timeout: 20_000 })
  })
})
