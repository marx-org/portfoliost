import { expect, test } from "@playwright/test"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

test("investments dashboard shows totals and the portfolio", async ({ page }) => {
  await login(page)

  await expect(page.getByRole("heading", { name: "Portfolios", exact: true })).toBeVisible()
  await expect(page.getByText("Total Value")).toBeVisible()
  await expect(page.getByRole("link", { name: /Top10/ })).toBeVisible()
})

test("investments tabs switch between portfolios, transactions, and watchlists", async ({ page }) => {
  await login(page)

  const tabs = page.getByRole("navigation", { name: "Investment sections" })
  await expect(tabs.getByRole("link", { name: "Portfolios", exact: true })).toHaveClass(/border-blue-600/)
  await expect(page.getByRole("button", { name: "Import from Broker" })).toBeVisible()

  await tabs.getByRole("link", { name: "Transactions" }).click()
  await expect(page).toHaveURL(/\/en\/investments\/transactions/)
  await expect(tabs.getByRole("link", { name: "Transactions" })).toHaveClass(/border-blue-600/)

  await tabs.getByRole("link", { name: "Watchlists" }).click()
  await expect(page).toHaveURL(/\/en\/investments\/watchlist/)
  await expect(tabs.getByRole("link", { name: "Watchlists" })).toHaveClass(/border-blue-600/)
})

test("portfolio detail shows metric strip, tabbed sections, and positions", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()

  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)
  await expect(page.getByRole("heading", { name: "Top10" })).toBeVisible()
  await expect(page.getByText("Total Value")).toBeVisible()

  const tabs = page.getByRole("navigation", { name: "Portfolio tabs" })
  await expect(tabs.getByRole("link", { name: "Holdings" })).toHaveClass(/border-blue-600/)

  const rows = page.locator("tbody tr")
  await expect(rows.first()).toBeVisible()
  await expect(rows.filter({ hasText: "META" }).first().getByText("META", { exact: true })).toBeVisible()

  await tabs.getByRole("link", { name: "Performance" }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/performance/)
  await expect(tabs.getByRole("link", { name: "Performance" })).toHaveClass(/border-blue-600/)
  await expect(page.getByText("Performance Chart")).toBeVisible()
  await expect(page.getByText("Returns Chart")).toBeVisible()

  const sections: Array<[string, string]> = [
    ["Performance", /\/performance/],
    ["Allocation", /\/allocation/],
    ["Risk Analysis", /\/risk-analysis/],
    ["Dividends", /\/dividends/],
    ["Calendar", /\/calendar/],
    ["News", /\/news/],
    ["Compare", /\/compare/],
    ["Transactions", /\/transactions/],
  ]
  for (const [label, url] of sections) {
    await tabs.getByRole("link", { name: label }).click()
    await expect(page).toHaveURL(url)
    await expect(tabs.getByRole("link", { name: label })).toHaveClass(/border-blue-600/)
  }

  await tabs.getByRole("link", { name: "Holdings" }).click()
  await page.getByRole("link", { name: "META" }).click()
  await expect(page).toHaveURL(/\/en\/research\/META\/overview/)
})

test("portfolio news cards show the shared identity block, enriched from the open position (§61.7)", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/[^/]+\/holdings/)
  const pid = new URL(page.url()).pathname.split("/")[3]
  // Only a held ticker can be enriched, so read the held set off the holdings
  // table first.
  const heldBadges = page.locator("tbody [data-testid='ticker-badge']")
  await expect(heldBadges.first()).toBeVisible({ timeout: 20000 })
  const held = new Map<string, { details: string; name: string }>()
  for (const t of await heldBadges.allInnerTexts()) {
    const [symbol, details, , name] = t.split("\n").map((s) => s.trim())
    if (name) held.set(symbol, { details, name })
  }

  await page.goto(`/en/portfolios/${pid}/news`)
  await expect(page.locator("article").first()).toBeVisible({ timeout: 20000 })
  // Match on the badge's own ticker line, not a substring of the whole card —
  // `:has-text("KO")` also matches an ORCL card.
  let checked = 0
  for (const card of await page.locator("article").all()) {
    const badge = card.getByTestId("ticker-badge")
    const symbol = (await badge.innerText()).split("\n")[0].trim()
    const expected = held.get(symbol)
    if (!expected) continue
    await expect(badge.locator("img")).toHaveAttribute("src", `/api/logos/${symbol}`)
    await expect(badge.locator('[data-testid="ticker-badge-details"]')).toHaveText(expected.details)
    await expect(badge.locator('[data-testid="ticker-badge-name"]')).toHaveText(expected.name)
    checked++
  }
  expect(checked, "no news card matched a held position").toBeGreaterThan(0)
})

test("transactions page lists transactions with sortable columns and pagination", async ({ page }) => {
  await login(page)
  await page.goto("/en/investments/transactions")

  await expect(page.getByRole("heading", { name: "Transactions", exact: true })).toBeVisible()
  await expect(page.getByText(/All investing and cash transactions/)).toBeVisible()
  await expect(page.locator("tbody tr").first()).toBeVisible()
  await expect(page.getByTestId("table-th-quantity")).toBeVisible()
  await expect(page.getByTestId("table-th-amount")).toBeVisible()
  await expect(page.getByTestId("table-th-date")).toContainText("↓")
  await page.getByTestId("table-th-amount").locator("button").click()
  await expect(page.getByTestId("table-th-amount")).toContainText("↑")
  await expect(page.getByLabel("Rows per page")).toContainText("10 per page")
  await expect(page.getByText(/^\d+[-–]\d+ of \d+$/)).toBeVisible()
})

test("cash transactions sub-tab lists cross-portfolio cash rows", async ({ page }) => {
  await login(page)
  await page.goto("/en/investments/transactions/cash")

  await expect(page.getByRole("heading", { name: "Transactions", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Cash Transactions" })).toHaveClass(/border-blue-600/)
  await expect(page.locator("tbody tr").first()).toBeVisible()
  await expect(page.getByTestId("table-th-portfolioName")).toBeVisible()
  await expect(page.getByTestId("table-th-amount")).toBeVisible()
  await expect(page.getByTestId("table-th-date")).toContainText("↓")
  await expect(page.getByRole("columnheader", { name: "Description" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Edit transaction" }).first()).toBeVisible()
  // the shared table paginates like the investing one
  await expect(page.getByLabel("Rows per page")).toContainText("10 per page")
  await expect(page.getByText(/^\d+[-–]\d+ of \d+$/)).toBeVisible()
  // every data column is sortable
  await page.getByTestId("table-th-amount").locator("button").click()
  await expect(page.getByTestId("table-th-amount")).toContainText("↑")
  await page.getByTestId("table-th-type").locator("button").click()
  await expect(page.getByTestId("table-th-type")).toContainText("↑")
  await expect(page.getByTestId("table-th-date")).not.toContainText("↓")
})

test("editing an investing transaction opens example-service-style modal and saves", async ({ page }) => {
  await login(page)
  await page.goto("/en/investments/transactions")

  await expect(page.getByRole("heading", { name: "Transactions", exact: true })).toBeVisible()
  await expect(page.locator("tbody tr").first()).toBeVisible()

  await page.getByRole("button", { name: "Edit transaction" }).first().click()
  const dialog = page.getByRole("dialog", { name: "Edit transaction" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole("heading", { name: /Edit .* Transaction/ })).toBeVisible()
  await expect(dialog.getByText("Purchase Date")).toBeVisible()
  await expect(dialog.getByText("Transaction Fees")).toBeVisible()
  await expect(dialog.getByText("Total Cost")).toBeVisible()
  await expect(dialog.getByText("Historical Price", { exact: false })).toBeVisible()

  await dialog.getByLabel("Quantity").fill("5")
  await dialog.getByLabel("Price per share ($)").fill("100")
  // zero the inherited fee so the total is exactly quantity × price
  await dialog.locator("#etx-fees").fill("0")
  // total cost may coincide with the edited symbol's market-price header
  await expect(dialog.getByText("$500.00").last()).toBeVisible()
  await dialog.getByRole("button", { name: "Save" }).click()

  await expect(page.getByText("Transaction updated")).toBeVisible()
  await expect(dialog).toBeHidden()
})

test("creating a new portfolio adds it to the list", async ({ page }) => {
  const name = `E2E Test ${Date.now()}`
  await login(page)

  await page.getByRole("button", { name: "Create Investment Portfolio" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.getByRole("textbox", { name: "Name" }).fill(name)
  await page.getByRole("button", { name: "Create", exact: true }).click()

  await expect(page.getByRole("link", { name })).toBeVisible()
})

test("position actions menu: buy updates quantity, research navigates, remove is blocked for a position with transactions", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)

  const metaRow = page.locator("tbody tr").filter({ hasText: "META" }).first()
  const metaQty = await metaRow.locator("td").nth(1).innerText()

  await metaRow.getByRole("button", { name: "Position actions" }).click()
  await expect(page.getByRole("button", { name: "Buy", exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Buy", exact: true }).click()
  await expect(page.getByRole("dialog", { name: /Buy META/ })).toBeVisible()
  await page.getByTestId("add-position-quantity").fill("5")
  await page.getByTestId("add-position-price").fill("600")
  await page.getByRole("button", { name: /Buy for \S+/ }).click()
  await expect(page.getByText(/Bought META/)).toBeVisible({ timeout: 10000 })
  await expect(metaRow.locator("td").nth(1)).toHaveText(String(Number(metaQty) + 5), { timeout: 10000 })

  const targetRow = page.locator("tbody tr").last()
  const targetSymbol = (await targetRow.locator("td").first().innerText()).split("\n")[0]

  await targetRow.getByRole("button", { name: "Position actions" }).click()
  await page.getByRole("button", { name: "Research" }).click()
  // No `(\.US)?` here any more: the holdings row's "Research" item always passed
  // the symbol verbatim, and §85.7 removed the one dialog that suffixed, so the
  // URL is now the honest symbol and this asserts that exactly.
  await expect(page).toHaveURL(new RegExp(`/en/research/${targetSymbol}/overview`))

  await page.goBack()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)

  // Positions with transactions must not be deletable: no dialog, row stays.
  await page.locator("tbody tr").filter({ hasText: "META" }).first().getByRole("button", { name: "Position actions" }).click()
  await page.getByRole("button", { name: "Remove position" }).click()
  await expect(page.getByText(/Cannot remove META — it has \d+ transactions?\. Delete the transactions first\./)).toBeVisible()
  await expect(page.getByRole("dialog", { name: "Remove position" })).toHaveCount(0)
  await expect(page.locator("tbody tr").filter({ hasText: "META" })).toHaveCount(1)
})

test("edit position opens a transaction list editor with rows and add row", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)

  const metaRow = page.locator("tbody tr").filter({ hasText: "META" }).first()
  await metaRow.getByRole("button", { name: "Position actions" }).click()
  await page.getByRole("button", { name: "Edit position" }).click()

  const dialog = page.getByRole("dialog", { name: "Edit META position" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole("heading", { name: "Add Transaction" })).toBeVisible()
  await expect(dialog.getByRole("columnheader", { name: "Total Cost" })).toBeVisible()

  // The dialog renders its "Loading..." row INSIDE the same <tbody> as the real
  // rows, so counting before the body has loaded counts the placeholder. The
  // columnheader assertion above is on the <thead>, which is always visible and
  // therefore does not wait for anything — it looked like a readiness check and
  // was not one. Wait for the placeholder explicitly.
  await expect(dialog.getByText("Loading...")).toHaveCount(0, { timeout: 15000 })

  const rowsBefore = await dialog.locator("tbody tr").count()
  await dialog.getByLabel("Quantity").last().fill("3")
  await dialog.getByLabel("Price per share").last().fill("500")
  await dialog.getByRole("button", { name: "Add Transaction", exact: true }).click()
  await expect(dialog.locator("tbody tr")).toHaveCount(rowsBefore + 1, { timeout: 15000 })

  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await expect(dialog).toHaveCount(0)
})

test("add position from the header opens a chooser with instrument/option/cfd and adds a stock row", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)

  await page.getByRole("button", { name: "Add Position", exact: true }).click()
  const chooser = page.getByRole("dialog", { name: "Add position" })
  await expect(chooser).toBeVisible()
  await expect(chooser.getByTestId("add-position-instrument")).toContainText("Stock, ETF or crypto")
  await expect(chooser.getByTestId("add-position-option")).toContainText("Option")
  await expect(chooser.getByTestId("add-position-cfd")).toContainText("CFD")

  const amdRowsBefore = await page.locator("tbody tr").filter({ hasText: "AMD" }).count()

  await chooser.getByTestId("add-position-instrument").click()
  await expect(page.getByRole("dialog", { name: "Search for Instruments" })).toBeVisible()
  await page.getByTestId("instrument-search").fill("AMD")
  await expect(page.getByRole("button", { name: /AMD/ }).first()).toBeVisible()
  await page.getByRole("dialog", { name: "Search for Instruments" }).getByRole("button", { name: /AMD/ }).first().click()

  await expect(page.getByRole("dialog", { name: "Buy Position" })).toBeVisible()
  await page.getByTestId("add-position-quantity").fill("10")
  await page.getByTestId("add-position-price").fill("120")
  await page.getByRole("dialog", { name: "Buy Position" }).getByRole("button", { name: /Buy for/ }).click()

  await expect(page.getByRole("dialog", { name: "Buy Position" })).toHaveCount(0)
  // The mock backend keeps state across runs — a buy of an already-held
  // symbol merges into the existing position row, so only guarantee the row set
  const amdRows = page.locator("tbody tr").filter({ hasText: "AMD" })
  await expect.poll(async () => amdRows.count()).toBeGreaterThanOrEqual(amdRowsBefore)
})

test("buy position stock step has purchase date, cash portfolio, fee % toggle and total", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)

  await page.getByRole("button", { name: "Add Position", exact: true }).click()
  const chooser = page.getByRole("dialog", { name: "Add position" })
  await chooser.getByTestId("add-position-instrument").click()
  await page.getByTestId("instrument-search").fill("KO")
  // ticker reference returns many KO-prefixed listings — pick the US original
  await page
    .getByRole("dialog", { name: "Search for Instruments" })
    .getByRole("button", { name: /^KO / })
    .first()
    .click()

  const dialog = page.getByRole("dialog", { name: "Buy Position" })
  await expect(dialog).toBeVisible()

  const date = dialog.getByTestId("add-position-date")
  await expect(date).toBeVisible()
  await expect(date).toHaveValue(new Date().toISOString().slice(0, 10))

  await dialog.getByTestId("add-position-quantity").fill("10")
  await dialog.getByTestId("add-position-price").fill("120")
  await dialog.getByTestId("add-position-fees").fill("1")
  await dialog.getByTestId("add-position-fees-toggle").click()
  await expect(dialog.getByTestId("add-position-fees-toggle")).toHaveText("%")
  await expect(dialog).toContainText("$1,212.00")

  const koRowsBefore = await page.locator("tbody tr").filter({ hasText: "KO" }).count()
  await dialog.getByRole("button", { name: /Buy for \$1,212.00/ }).click()
  await expect(dialog).toHaveCount(0, { timeout: 15000 })
  // same-symbol buys merge into one position row (state persists across runs)
  await expect.poll(async () => page.locator("tbody tr").filter({ hasText: "KO" }).count()).toBeGreaterThanOrEqual(koRowsBefore, { timeout: 15000 })
})

test("display currency switcher updates portfolio values and persists", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)

  await expect(page.getByRole("button", { name: /Display currency: USD/ })).toBeVisible()
  await page.getByRole("button", { name: /Display currency: USD/ }).click()
  await page.getByRole("button", { name: "EUR", exact: true }).click()

  await expect(page.getByRole("button", { name: /Display currency: EUR/ })).toBeVisible()
  await expect(page.getByText(/€\s*[0-9]/).first()).toBeVisible()

  await page.reload()
  await expect(page.getByRole("button", { name: /Display currency: EUR/ })).toBeVisible()

  await page.goto("/en/investments")
  await expect(page.getByRole("button", { name: /Display currency: EUR/ })).toBeVisible()
})

test("holdings table groups by type, sector, and country", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)

  const groupSelect = page.getByLabel("Group by")
  await expect(groupSelect).toHaveValue("none")

  await groupSelect.selectOption("assetType")
  await expect(page.getByTestId("holdings-group-row")).toHaveCount(1)
  await expect(page.getByTestId("holdings-group-row")).toContainText("Stock")
  await expect(page.getByText(/Stock subtotal/)).toHaveCount(1)

  await groupSelect.selectOption("sector")
  const sectorGroups = page.getByTestId("holdings-group-row")
  // other specs buy into Top10, so the set grows across runs — assert the
  // grouping structure (one named subtotal per group) plus the stable seed group
  await expect(sectorGroups.first()).toBeVisible()
  await expect(sectorGroups.filter({ hasText: "Technology" })).toHaveCount(1)
  await expect(page.getByText(/subtotal/)).toHaveCount(await sectorGroups.count())

  await groupSelect.selectOption("country")
  await expect(page.getByTestId("holdings-group-row").filter({ hasText: "US" })).toHaveCount(1)
  await expect(page.getByText(/US subtotal/)).toHaveCount(1)

  await groupSelect.selectOption("none")
  await expect(page.getByTestId("holdings-group-row")).toHaveCount(0)
  await expect(page.getByText(/Total/).first()).toBeVisible()
})

test("transactions page groups by kind of investment, sector, and country", async ({ page }) => {
  await login(page)
  await page.goto("/en/investments/transactions")

  await page.getByRole("combobox", { name: "Rows per page" }).selectOption("50")
  await expect(page.getByTestId("transactions-group-row")).toHaveCount(0)

  const groupSelect = page.getByLabel("Group by")
  await expect(groupSelect).toHaveValue("none")

  await groupSelect.selectOption("assetType")
  await expect(page.getByTestId("transactions-group-row")).toHaveCount(1)
  await expect(page.getByTestId("transactions-group-row")).toContainText("Stock")
  await expect(page.getByText(/Stock subtotal/)).toHaveCount(1)

  await groupSelect.selectOption("sector")
  const globalSectorGroups = page.getByTestId("transactions-group-row")
  await expect(globalSectorGroups.filter({ hasText: "Technology" })).toHaveCount(1)
  await expect(page.getByText(/subtotal/)).toHaveCount(await globalSectorGroups.count())

  await groupSelect.selectOption("country")
  await expect(page.getByTestId("transactions-group-row").filter({ hasText: "US" })).toHaveCount(1)
  await expect(page.getByText(/US subtotal/)).toHaveCount(1)

  await groupSelect.selectOption("none")
  await expect(page.getByTestId("transactions-group-row")).toHaveCount(0)
})

test("portfolio transactions tab groups by sector with subtotals", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)
  await page.getByRole("navigation", { name: "Portfolio tabs" }).getByRole("link", { name: "Transactions" }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/.*\/transactions/)

  const groupSelect = page.getByLabel("Group by")
  await groupSelect.selectOption("sector")
  const sectorGroups = page.getByTestId("transactions-group-row")
  await expect(sectorGroups.filter({ hasText: "Technology" })).toHaveCount(1)
  await expect(sectorGroups.filter({ hasText: "Communication Services" })).toHaveCount(1)
  await expect(page.getByText(/subtotal/)).toHaveCount(await sectorGroups.count())

  await groupSelect.selectOption("none")
  await expect(page.getByTestId("transactions-group-row")).toHaveCount(0)
})

test("deleting a transaction asks for confirmation and removes it on confirm", async ({ page }) => {
  await login(page)
  await page.goto("/en/investments/transactions")

  await expect(page.getByRole("heading", { name: "Transactions", exact: true })).toBeVisible()
  const firstDelete = page.getByRole("button", { name: "Delete transaction" }).first()
  await expect(firstDelete).toBeVisible()

  await firstDelete.click()
  const dialog = page.getByRole("dialog", { name: "Delete transaction" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole("heading", { name: "Delete Transaction" })).toBeVisible()
  await expect(dialog.getByText("Are you sure you want to delete this transaction? This action cannot be undone.")).toBeVisible()

  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("button", { name: "Delete transaction" }).first()).toBeVisible()

  await page.getByRole("button", { name: "Delete transaction" }).first().click()
  await dialog.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(page.getByText("Transaction deleted")).toBeVisible()
  await expect(dialog).toBeHidden()
})

test("portfolio calendar tab renders the month grid over holdings events", async ({ page }) => {
  await login(page)
  await page.getByRole("link", { name: /Top10/ }).click()
  await page.getByRole("navigation", { name: "Portfolio tabs" }).getByRole("link", { name: "Calendar" }).click()
  await expect(page).toHaveURL(/\/calendar/)

  // the holdings fan-out hits the live provider stack — allow a longer settle
  await expect(page.getByTestId("pf-cal-grid")).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId("pf-cal-day")).toHaveCount(42)
  await expect(page.getByTestId("pf-cal-filter")).toHaveValue("all")

  const month = page.getByTestId("pf-cal-month")
  await expect(month).toHaveText(/[A-Z][a-z]+ 20\d\d/)
  const initial = (await month.textContent())!.trim()
  await page.getByTestId("pf-cal-next-month").click()
  await expect(month).not.toHaveText(initial)
  await page.getByTestId("pf-cal-prev-month").click()
  await expect(month).toHaveText(initial)

  // The provider stack may yield no rows for the seeded holdings (fmp-only,
  // §49.9 fragility) — scan the instruments window (~4 months) and tolerate
  // it the same way research.spec.ts does for chart data.
  const chips = page.locator('[data-testid="pf-cal-day"] a')
  let hasChip = (await chips.count()) > 0
  for (let i = 0; i < 5 && !hasChip; i++) {
    await page.getByTestId("pf-cal-next-month").click()
    hasChip = (await chips.count()) > 0
  }
  if (hasChip) {
    const chip = chips.first()
    await expect(chip).toHaveText(/^[A-Z0-9.]+ (Earnings|Ex-Div|Div)(: .+)?$/)
    await expect(chip).toHaveAttribute("href", /\/en\/research\/[^/]+\/overview/)
  } else {
    for (let i = 0; i < 5; i++) {
      await page.getByTestId("pf-cal-prev-month").click()
    }
    await expect(page.getByText("No events in this month.")).toBeVisible()
  }
})
