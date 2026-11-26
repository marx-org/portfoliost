import { expect, test, type APIRequestContext } from "@playwright/test"
import { login } from "./helpers/login"

/**
 * Charting navigation and scope, end to end against the dockerized stack
 * (feature #253, sub-issue #256).
 *
 * Proves the shared scope is REAL: an account (and label) selection lives in the
 * URL, survives subpage navigation and a reload, and is what the page sends to
 * the charting API. It also proves there is ONE renderer per kind — the Charting
 * pages and the existing portfolio Performance/Allocation tabs mount the same
 * components, so a chart cannot drift between the two entry points.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

const TOP10 = "3cb589d8-f92d-428f-aeab-9ee5d4b9cef2"

async function auth(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  expect(res.status()).toBe(200)
  const token = ((await res.json()) as { access_token?: string }).access_token ?? ""
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

test("account scope persists across subpages, in the URL and across a reload", async ({ page }) => {
  await login(page)
  await page.goto("/en/charting/income")

  const toolbar = page.getByTestId("charting-toolbar")
  const top10 = toolbar.getByRole("button", { name: "Top10" })
  await expect(top10).toBeVisible()
  // All is the default: the accounts "All" chip is shown, no account selected.
  await expect(toolbar.locator("span").filter({ hasText: /^All$/ })).toBeVisible()

  await top10.click()
  await expect(page).toHaveURL(new RegExp(`accounts=${TOP10}`))
  await expect(toolbar.locator("span").filter({ hasText: /^All$/ })).toHaveCount(0)

  // The scope survives navigating to another subpage.
  await page.getByTestId("charting-layout").getByRole("link", { name: "Performance" }).click()
  // Wait for the PATH to change before asserting the query: asserting the query
  // alone passes against the pre-navigation URL, which is how this test stayed
  // green while the subpage links were dropping the scope.
  await expect(page).toHaveURL(/\/en\/charting\/performance/)
  await expect(page).toHaveURL(new RegExp(`accounts=${TOP10}`))

  // ...and a reload (a deep link): the same account comes back selected.
  await page.reload()
  await expect(page).toHaveURL(new RegExp(`accounts=${TOP10}`))
  await expect(page.getByTestId("charting-toolbar").getByRole("button", { name: "Top10" })).toHaveClass(/border-blue-500/)

  // Reset returns to All and clears the account from the URL.
  await page.getByTestId("charting-toolbar").getByRole("button", { name: "Reset" }).click()
  await expect(page).not.toHaveURL(/accounts=/)
  await expect(page.getByTestId("charting-toolbar").locator("span").filter({ hasText: /^All$/ })).toBeVisible()
})

test("the same renderers are reached through Charting and the portfolio tabs", async ({ page }) => {
  await login(page)

  // Charting → Performance renders the shared PortfolioPerformanceChart.
  await page.goto("/en/charting/performance")
  await expect(page.getByTestId("charting-performance").getByTestId("portfolio-performance-chart")).toBeVisible()

  // Charting → Allocation renders the shared AllocationBreakdown.
  await page.goto("/en/charting/allocation")
  await expect(page.locator('[data-testid="charting-allocation-breakdown-by-sector"]')).toBeVisible()

  // The portfolio Performance tab renders the SAME chart renderer.
  await page.goto(`/en/portfolios/${TOP10}/performance`)
  await expect(page.getByTestId("portfolio-performance-chart")).toBeVisible()

  // The portfolio Allocation tab renders the SAME breakdown renderer.
  await page.goto(`/en/portfolios/${TOP10}/allocation`)
  await expect(page.locator('[data-testid="portfolio-allocation-by-sector"]')).toBeVisible()
})

test("an account with no published projection does not empty the All scope @needs-backend", async ({ page, request }) => {
  // #95: a portfolio created after the seed has no charting facts. Before the
  // fix its generation-0 projection row made scope All read generation 0 for
  // every account, so the shared charts rendered "No income data" even though
  // Top10 had published facts.
  await login(page)
  const headers = await auth(request)

  const created = await request.post(`${GATEWAY}/api/portfolios`, {
    headers,
    data: { name: `E2E-NoProjection-${Date.now()}`, baseCurrency: "USD" },
  })
  expect(created.status(), await created.text()).toBeLessThan(300)

  const res = await request.get(`${GATEWAY}/api/portfolios/charting/income`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  const body = (await res.json()) as {
    coverage: { status: string; generation: number; missing: Array<{ reason: string; detail?: string }> }
    annual: Array<{ year: number; total: number }>
    monthly: unknown[]
  }
  expect(body.annual.length, JSON.stringify(body.coverage)).toBeGreaterThan(0)
  expect(body.coverage.status).toBe("partial")
  expect(body.coverage.missing.some((m) => m.reason === "not_projected")).toBe(true)

  // The page itself renders rows, not the empty state.
  await page.goto("/en/charting/income")
  const chart = page.getByTestId("annual-income-chart")
  await expect(chart).toBeVisible()
  await page.getByTestId("annual-income-chart-table-toggle").click()
  await expect(chart.locator("tbody tr")).toHaveCount(body.annual.length)
  await expect(page.getByTestId("charting-income").getByText("No income data for this scope")).toHaveCount(0)
})

test("an account AND a label scope intersect in the request the page sends", async ({ page, request }) => {
  await login(page)

  // The wallets DB owns labels; create one so the toolbar has a chip to select.
  const headers = await auth(request)
  const created = await request.post(`${GATEWAY}/api/labels`, {
    headers,
    data: { name: `E2E-CHART-${Date.now()}` },
  })
  expect(created.status(), await created.text()).toBeLessThan(300)
  const label = (await created.json()) as { id: string; name: string }

  const chartingReqs: string[] = []
  page.on("request", (r) => {
    if (r.url().includes("/api/portfolios/charting/")) chartingReqs.push(r.url())
  })

  await page.goto(`/en/charting/income?accounts=${TOP10}`)
  const toolbar = page.getByTestId("charting-toolbar")
  await expect(toolbar.getByRole("button", { name: "Top10" })).toBeVisible()

  // Select the label; both filters are now in the URL.
  const chip = page.getByTestId("label-filter-bar").getByText(label.name)
  await expect(chip).toBeVisible()
  await chip.click()
  await expect(page).toHaveURL(new RegExp(`accounts=${TOP10}`))
  await expect(page).toHaveURL(new RegExp(`labels=${label.id}`))

  // The charting read the page issued carries BOTH the account and the label.
  await expect
    .poll(() =>
      chartingReqs.some((u) => {
        const q = new URL(u).searchParams
        return q.get("accounts") === TOP10 && q.get("labels") === label.id
      }),
    )
    .toBe(true)
})

test("normal and virtual portfolios are separate, mutually exclusive scopes", async ({ page, request }) => {
  await login(page)
  const headers = await auth(request)

  // A label + a virtual portfolio that mirrors it. The virtual view is a
  // read-only label-defined portfolio, never mixed with real accounts.
  const labelRes = await request.post(`${GATEWAY}/api/labels`, {
    headers,
    data: { name: `E2E-VIRTUAL-${Date.now()}` },
  })
  expect(labelRes.status(), await labelRes.text()).toBeLessThan(300)
  const label = (await labelRes.json()) as { id: string }
  const virtualRes = await request.post(`${GATEWAY}/api/portfolios`, {
    headers,
    data: { name: `E2E-VIEW-${Date.now()}`, baseCurrency: "USD", isVirtual: true, labelId: label.id },
  })
  expect(virtualRes.status(), await virtualRes.text()).toBeLessThan(300)
  const virtual = (await virtualRes.json()) as { id: string; name: string }

  await page.goto("/en/charting/performance")
  const toolbar = page.getByTestId("charting-toolbar")
  const kindSwitch = page.getByTestId("charting-kind-switch")

  // Normal is the default; the virtual portfolio is not in the account list.
  await expect(kindSwitch.getByRole("button", { name: "Normal" })).toHaveClass(/bg-blue-600/)
  await expect(toolbar.getByRole("button", { name: "Top10" })).toBeVisible()
  await expect(toolbar.getByRole("button", { name: virtual.name })).toHaveCount(0)

  // Selecting a real account, then switching to Virtual, clears it: the two
  // sides can never be selected together.
  await toolbar.getByRole("button", { name: "Top10" }).click()
  await expect(page).toHaveURL(new RegExp(`accounts=${TOP10}`))
  await kindSwitch.getByRole("button", { name: "Virtual" }).click()
  await expect(page).toHaveURL(/kind=virtual/)
  await expect(page).not.toHaveURL(/accounts=/)
  await expect(toolbar.getByRole("button", { name: virtual.name })).toBeVisible()
  await expect(toolbar.getByRole("button", { name: "Top10" })).toHaveCount(0)

  // Reset returns to Normal + All.
  await toolbar.getByRole("button", { name: "Reset" }).click()
  await expect(page).not.toHaveURL(/kind=/)
  await expect(kindSwitch.getByRole("button", { name: "Normal" })).toHaveClass(/bg-blue-600/)
})

test("the Charting toolbar carries an inclusive date window in the URL", async ({ page }) => {
  await login(page)
  await page.goto("/en/charting/performance")

  await page.getByTestId("charting-date-from").fill("2026-01-01")
  await page.getByTestId("charting-date-to").fill("2026-06-30")
  await expect(page).toHaveURL(/from=2026-01-01/)
  await expect(page).toHaveURL(/to=2026-06-30/)

  // The window survives subpage navigation.
  await page.getByTestId("charting-layout").getByRole("link", { name: "Income" }).click()
  await expect(page).toHaveURL(/\/en\/charting\/income/)
  await expect(page).toHaveURL(/from=2026-01-01/)
  await expect(page).toHaveURL(/to=2026-06-30/)

  // Reset clears the window.
  await page.getByTestId("charting-toolbar").getByRole("button", { name: "Reset" }).click()
  await expect(page).not.toHaveURL(/from=/)
  await expect(page).not.toHaveURL(/to=/)

  // Predefined ranges behave like the performance chart's timeframe control.
  await page.getByTestId("charting-range-1m").click()
  await expect(page).toHaveURL(/from=/)
  await expect(page).not.toHaveURL(/to=/)
  await page.getByTestId("charting-range-all").click()
  await expect(page).not.toHaveURL(/from=/)
})