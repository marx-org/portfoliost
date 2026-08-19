import { test, expect } from "@playwright/test"

test("OIDC flow: sign in with passkey completes full PKCE flow", async ({ page }) => {
  await page.goto("/login")
  await page.waitForLoadState("networkidle")

  const oidcBtn = page.getByTestId("oidc-signin")
  await expect(oidcBtn).toBeVisible({ timeout: 5000 })

  await oidcBtn.click()

  // Browser follows meta-refresh to /auth/callback?code=...&state=...
  // AuthCallback exchanges code via POST /api/auth/token
  await page.waitForURL("**/investments**", { timeout: 15000 })
  await expect(page.getByTestId("cash-balance")).toBeVisible({ timeout: 10000 })
})
