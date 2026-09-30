import { expect, test } from "@playwright/test"
import type { Page, Request } from "@playwright/test"

async function login(page: Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

/** Every mutating call the SPA makes, so "navigation writes nothing" is checkable. */
function collectWrites(page: Page) {
  const writes: string[] = []
  page.on("request", (req: Request) => {
    const m = req.method()
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return
    writes.push(`${m} ${req.url()}`)
  })
  return writes
}

test("manual refresh is additive: the card button issues POST /recompute?mode=upsert (§76.2)", async ({
  page,
}) => {
  await login(page)

  const button = page.getByTestId("card-refresh").first()
  await expect(button).toBeVisible({ timeout: 30_000 })

  const [request] = await Promise.all([
    page.waitForRequest(
      (r) => r.url().includes("/recompute") && r.method() === "POST",
      { timeout: 30_000 },
    ),
    button.click(),
  ])

  const url = new URL(request.url())
  // The bare endpoint is forcePortfolioRecalc: DELETE every snapshot row and
  // rebuild. A user pressing "Refresh" must never reach that path.
  expect(url.searchParams.get("mode")).toBe("upsert")
  expect(request.url()).not.toMatch(/\/recompute$/)
  expect(request.url()).toContain("/recompute?mode=upsert")
})

test("the control is on every card, not only on a failed chart (§76.2)", async ({ page }) => {
  await login(page)
  await page.waitForLoadState("networkidle")

  const buttons = page.getByTestId("card-refresh")
  await expect(buttons.first()).toBeVisible({ timeout: 30_000 })

  const cards = page.locator('[data-testid="portfolio-card"]')
  const cardCount = await cards.count()
  expect(cardCount).toBeGreaterThan(0)
  expect(await buttons.count()).toBe(cardCount)

  // The old control only rendered inside the chart's "unavailable" branch.
  await expect(page.getByTestId("card-chart-recompute")).toHaveCount(0)
})

test("the card states the price as-of rather than implying a live number (§76.2)", async ({ page }) => {
  await login(page)
  await page.waitForLoadState("networkidle")
  const asOf = page.getByTestId("card-price-as-of").first()
  await expect(asOf).toBeVisible({ timeout: 30_000 })
  // Locale-formatted, so match the shape rather than a fixed field order:
  // "Prices as of Sep 30, 07:03 AM" and "Prices as of 30 Sep, 07:03" both occur.
  await expect(asOf).toContainText(
    /Prices as of (\d{1,2}\s?[A-Za-z]{3}|[A-Za-z]{3}\s?\d{1,2}),?\s?\d{1,2}:\d{2}/,
  )
})

test("plain navigation issues no write at all (§76.1/§76.2)", async ({ page }) => {
  await login(page)
  await page.waitForLoadState("networkidle")

  // Start collecting only now: login itself is a legitimate POST to /api/auth.
  const writes = collectWrites(page)

  await page.goto("/en/portfolios/3cb589d8-f92d-428f-aeab-9ee5d4b9cef2/holdings")
  await page.waitForLoadState("networkidle")
  await page.goto("/en/portfolios/3cb589d8-f92d-428f-aeab-9ee5d4b9cef2/allocation")
  await page.waitForLoadState("networkidle")
  await page.goto("/en/portfolios/3cb589d8-f92d-428f-aeab-9ee5d4b9cef2/performance")
  await page.waitForLoadState("networkidle")
  await page.goto("/en/investments")
  await page.waitForLoadState("networkidle")

  // Browsing a portfolio used to write a snapshot, move current_value and stamp
  // price_as_of on every position. Nothing in the list is a POST/PUT/DELETE.
  expect(writes).toEqual([])
})
