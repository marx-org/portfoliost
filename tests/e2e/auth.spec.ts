import { expect, test } from "@playwright/test"

test("login page hides the user/password form and create account link when password login is disabled", async ({ page }) => {
  // Compose enables password login for other E2E flows. This test explicitly
  // exercises OIDC-only mode without changing the deployed configuration.
  await page.route("**/runtime-config.js", async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}\nwindow.__OIDC_CONFIG__ = { ...window.__OIDC_CONFIG__, passwordLoginEnabled: false };`,
    })
  })
  await page.goto("/login")

  await expect(page.getByTestId("email")).toHaveCount(0)
  await expect(page.getByTestId("password")).toHaveCount(0)
  await expect(page.getByTestId("signin")).toHaveCount(0)
  await expect(page.getByText("Create one")).toHaveCount(0)
})

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/en/investments")
  await expect(page).toHaveURL(/\/login/)
})
