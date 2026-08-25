import { expect, test } from "@playwright/test"

// logos.md §12.6 — logos resolve through the real provider tier
// (gateway → instruments → cachest → openst) with permanent local storage.
//
// The SPA calls the API cross-origin (VITE_API_BASE_URL → gateway :8080);
// the static SPA origin itself does not proxy /api. API assertions therefore
// target the gateway directly.

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\//)
}

test("research page requests a logo for the viewed symbol", async ({ page }) => {
  await login(page)
  await page.goto("/en/research/AAPL.US/overview")
  const logo = page.locator('img[src*="/api/logos/AAPL"]').first()
  await expect(logo).toBeAttached()
})

test("gateway serves persisted logo bytes for US and WSE tickers", async ({ request }) => {
  // AAPL = provider-resolved path; KTY.WA = the long tail the old mock 404'd
  for (const symbol of ["AAPL", "KTY.WA"]) {
    const res = await request.get(`${GATEWAY}/api/logos/${symbol}`)
    expect(res.status()).toBe(200)
    expect(res.headers()["content-type"]).toMatch(/image\/(png|svg\+xml|x-icon)/)
    const cacheControl = res.headers()["cache-control"] ?? ""
    expect(cacheControl).toContain("max-age")
    expect((await res.body()).length).toBeGreaterThan(0)
  }
})
