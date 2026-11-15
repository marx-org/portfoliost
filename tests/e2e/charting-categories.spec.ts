import { expect, test } from "@playwright/test"

/**
 * Stock-category editor, end to end against the dockerized stack (feature #253,
 * sub-issue #258).
 *
 * The assignment is stored once per owner + STOCK identity and survives a
 * reload. Editing a category must not trigger any financial replay: the only
 * write the page issues is the category PUT.
 */

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

test("a stock category persists across a reload and the edit is the only write", async ({ page }) => {
  await login(page)

  const writes: string[] = []
  page.on("request", (r) => {
    const method = r.method()
    if (method === "GET" || method === "HEAD") return
    writes.push(`${method} ${new URL(r.url()).pathname}`)
  })

  await page.goto("/en/charting/stock-categories")

  // MSFT is held by the seeded Top10 portfolio as a STOCK.
  const row = page.getByTestId("charting-categories").locator("tbody tr", { hasText: "MSFT" }).first()
  await expect(row).toBeVisible()
  const select = row.locator("select")
  await expect(select).toBeVisible()

  const current = await select.inputValue()
  const target = current === "high_growth" ? "balanced" : "high_growth"
  await select.selectOption(target)
  await expect.poll(() => writes.some((w) => w.startsWith("PUT /api/portfolios/charting/stock-categories"))).toBe(true)

  // Reload: the assignment comes back selected.
  await page.reload()
  const reloaded = page.getByTestId("charting-categories").locator("tbody tr", { hasText: "MSFT" }).first()
  await expect(reloaded.locator("select")).toHaveValue(target)

  // No financial replay: every write this page made was the category PUT.
  expect(writes.every((w) => w === "PUT /api/portfolios/charting/stock-categories")).toBe(true)
})