import { expect, test } from "@playwright/test"

test("login page hides the user/password form and create account link", async ({ page }) => {
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
