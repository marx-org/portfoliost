import { expect, test } from "@playwright/test"

/**
 * §47.5 — the research UI never renders a guessed USD currency:
 *
 * - provider-declared currency → clean label, no warning badge (SNT.WA, real
 *   stack: openst declares PLN and the local resolver agrees)
 * - estimated currency → amber "USD (estimated)" badge
 * - unknown currency → red "Currency unknown" badge + prices render as plain
 *   numbers (no fake "$")
 *
 * The estimated/unknown cases are injected via `page.route` — the seeded real
 * DB only produces provider/estimated organically. The mock backend carries
 * the canonical AMAT (estimated) / AMD (unknown) fixtures in
 * mocks/shared/data/research and is contract-tested in mocks/tests/run.mjs.
 */
type Carrier = { currency: string | null; currencySource: string }

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await page.waitForURL(/investments/, { timeout: 20000 })
}

/** Serve a fixed currency + currencySource on the profile and quote carriers. */
async function overrideCurrency(page: import("@playwright/test").Page, symbol: string, carrier: Carrier) {
  for (const suffix of ["profile", "quote"]) {
    await page.route(`**/api/instruments/${symbol}/${suffix}`, async (route) => {
      const res = await route.fetch()
      const json = (await res.json()) as Record<string, unknown>
      json.currency = carrier.currency
      json.currencySource = carrier.currencySource
      await route.fulfill({ response: res, json })
    })
  }
}

/** The header price line: <p> wrapping the price span, the change and the badge. */
function priceLine(page: import("@playwright/test").Page) {
  return page.locator("p:has(span.font-semibold)").first()
}

test("provider-declared currency renders without a warning badge (SNT.WA)", async ({ page }) => {
  await login(page)
  await page.goto("/en/research/SNT.WA/overview")

  const line = priceLine(page)
  await expect(line).toBeVisible({ timeout: 20000 })
  // PLN price label from the provider declaration…
  await expect(line).toContainText("PLN")
  // …and no warning badge.
  await expect(page.getByTestId("currency-warning")).toHaveCount(0)
})

test("estimated currency shows the amber (estimated) badge (AMAT)", async ({ page }) => {
  await login(page)
  await overrideCurrency(page, "AMAT", { currency: "USD", currencySource: "estimated" })
  await page.goto("/en/research/AMAT/overview")

  const line = priceLine(page)
  await expect(line).toBeVisible({ timeout: 20000 })
  const badge = page.getByTestId("currency-warning")
  await expect(badge).toBeVisible()
  await expect(badge).toHaveText("USD (estimated)")

  // Drop the rewrites before teardown so late SPA polls can't hit the handler.
  await page.unrouteAll({ behavior: "ignoreErrors" })
})

test("unknown currency red-flags and renders prices without a USD label (AMD)", async ({ page }) => {
  await login(page)
  await overrideCurrency(page, "AMD", { currency: null, currencySource: "unknown" })
  await page.goto("/en/research/AMD/overview")

  const line = priceLine(page)
  await expect(line).toBeVisible({ timeout: 20000 })
  const badge = page.getByTestId("currency-warning")
  await expect(badge).toBeVisible()
  await expect(badge).toHaveText("Currency unknown")
  // The price line carries a plain number — no fake currency symbol.
  const text = (await line.innerText()).replace(/\s+/g, " ")
  expect(text).toMatch(/\d/)
  expect(text).not.toContain("$")
  expect(text).not.toMatch(/USD|EUR|PLN|GBP/)

  await page.unrouteAll({ behavior: "ignoreErrors" })
})
