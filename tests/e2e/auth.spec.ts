import { expect, test } from "@playwright/test"

test("login page validates the form", async ({ page }) => {
  await page.goto("/login")

  await page.getByTestId("email").fill("not-an-email")
  await page.getByTestId("password").fill("")
  await expect(page.getByTestId("signin")).toBeDisabled()

  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await expect(page.getByTestId("signin")).toBeEnabled()
})

test("login with valid credentials lands on investments", async ({ page }) => {
  await page.goto("/login")

  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()

  await expect(page).toHaveURL(/\/en\/investments/)
  await expect(page.getByRole("heading", { name: "Portfolios", exact: true })).toBeVisible()
})

test("login with invalid credentials shows an error", async ({ page }) => {
  await page.goto("/login")

  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("wrong-password")
  await page.getByTestId("signin").click()

  await expect(page.getByTestId("login-error")).toBeVisible()
})

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/en/investments")
  await expect(page).toHaveURL(/\/login/)
})
