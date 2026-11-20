import { expect, type Page } from "@playwright/test"

/**
 * The shared sign-in flow.
 *
 * Every e2e spec used to carry its own copy of `login()` — 55 near-identical
 * definitions, differing only in the post-login URL matcher. This is the one
 * home. `login()` drives the real form so a spec that is specifically about the
 * login/OIDC page keeps working; the storageState path below is the fast one
 * (see `authenticatedPage`).
 */
export async function login(page: Page): Promise<void> {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\//)
}