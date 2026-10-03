import { expect, test } from "@playwright/test"

// §85.5 — the share page's holdings table is the one surface a visitor can see
// a ticker on and do nothing with. Each symbol now links to that symbol's
// research page, carrying the share page as `from`.
//
// §85.1 is what makes the round trip work: researchBackTarget only accepted a
// `/en/` prefix, so `from=/public/portfolio/…` would have been discarded on
// arrival and "Go back" would have dropped the visitor onto /en/investments.

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

/**
 * The SPA is served on :3000 but calls the API on the gateway (:8080) — see
 * `VITE_API_BASE_URL` in docker-compose.yml. `page.request` inherits the
 * Playwright baseURL, which is the SPA, so the API base has to be given
 * explicitly here or the request lands on the SPA's HTML fallback.
 */
const API_BASE = process.env.PORTFOLIOST_API_BASE_URL ?? "http://localhost:8080"

/** The first share the seeded user owns, read through the app's own token. */
async function firstShareId(page: import("@playwright/test").Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem("portfoliost_token"))
  const res = await page.request.get(`${API_BASE}/api/portfolios/shares`, {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(res.status()).toBe(200)
  const shares = (await res.json()) as Array<{ id: string }>
  if (!shares.length) throw new Error("the seeded user owns no portfolio share")
  return shares[0]!.id
}

test("a shared portfolio's holding links to research and comes back to the share", async ({ page }) => {
  await login(page)
  const shareId = await firstShareId(page)

  // Visit the share logged OUT, which is how a visitor sees it.
  await page.context().clearCookies()
  await page.evaluate(() => localStorage.removeItem("portfoliost_token"))
  await page.goto(`/public/portfolio/${shareId}`)

  const link = page.locator('table a[href*="/en/research/"]').first()
  await expect(link).toBeVisible()
  // The `from` is the share page — this is the §85.1 prefix at work.
  await expect(link).toHaveAttribute("href", /\/en\/research\/[A-Z0-9.-]+\/overview\?from=\/public\/portfolio\//)

  // The research route is `meta: { requiresAuth: true }`, so a logged-out
  // visitor is sent to login rather than to the page. That is the accepted
  // consequence of linking research from a public page, and it is asserted here
  // so a change in that guard shows up as a deliberate edit.
  await link.click()
  await expect(page).toHaveURL(/\/login\?redirect=/)

  // Signed in, the same link reaches research and "Go back" returns to the share.
  await login(page)
  await page.goto(`/public/portfolio/${shareId}`)
  await page.locator('table a[href*="/en/research/"]').first().click()
  await expect(page).toHaveURL(/\/en\/research\/[A-Z0-9.-]+\/overview/)

  await page.getByTestId("research-back").click()
  await expect(page).toHaveURL(new RegExp(`/public/portfolio/${shareId}`))
})
