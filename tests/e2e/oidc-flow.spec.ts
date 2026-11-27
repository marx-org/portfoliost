import { test, expect } from "@playwright/test"

test("OIDC flow: sign in with passkey completes full PKCE flow @needs-backend", async ({ page }) => {
  await page.goto("/login")
  await page.waitForLoadState("networkidle")

  const oidcBtn = page.getByTestId("oidc-signin")
  await expect(oidcBtn).toBeVisible({ timeout: 5000 })

  await oidcBtn.click()

  // Browser follows meta-refresh to /auth/callback?code=...&state=...
  // AuthCallback exchanges code via POST /api/auth/token, then lands on the
  // default page (Accounts balance).
  await page.waitForURL("**/accounts-balance**", { timeout: 15000 })
  await expect(page.getByTestId("accounts-balance")).toBeVisible({ timeout: 10000 })
})
