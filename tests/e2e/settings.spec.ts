import { expect, test } from "@playwright/test"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

test("settings: sidebar links and tabs navigate", async ({ page }) => {
  await login(page)

  // `exact: true` is load-bearing: without it this matches any link whose
  // accessible name CONTAINS "Settings", and e2e specs that leave throwaway
  // portfolios named e.g. "E2E CashLegSettings 1791018094209" behind make it a
  // strict-mode violation. Playwright's own disambiguation suggests this form.
  await page.getByRole("link", { name: "Settings", exact: true }).click()
  await expect(page).toHaveURL(/\/en\/settings\/profile/)
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible()

  const nav = page.getByRole("navigation", { name: "Settings" })
  const tabs: Record<string, string> = {
    Profile: "Profile Settings",
    "Shared Portfolios": "Shared Portfolios",
    "Broker Connections": "Broker Connections",
  }
  for (const [tab, heading] of Object.entries(tabs)) {
    await nav.getByRole("link", { name: tab, exact: true }).click()
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible()
  }
})

test("shared portfolios: shows active share and public link works", async ({ page }) => {
  await login(page)
  await page.goto("/en/settings/shared-portfolios")

  await expect(page.getByRole("heading", { name: "Shared Portfolios", exact: true })).toBeVisible()
  await expect(page.getByText("1 / 10")).toBeVisible()

  const pagePromise = page.waitForEvent("popup")
  await page.getByRole("link", { name: "View shared portfolio" }).click()
  const popup = await pagePromise
  await expect(popup).toHaveURL(/\/public\/portfolio\//)
  await expect(popup.getByRole("heading", { name: "Top10" })).toBeVisible()
  await expect(popup.getByText("Holdings")).toBeVisible()
})

test("theme switcher: sidebar dropdown applies and persists dark mode", async ({ page }) => {
  await login(page)

  await expect(page.locator("html")).not.toHaveClass(/dark/)

  const switcher = page.getByRole("button", { name: "Theme" })
  await switcher.click()
  const listbox = page.getByRole("listbox", { name: "Theme" })
  await listbox.getByRole("option", { name: "Dark" }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)

  await switcher.click()
  await listbox.getByRole("option", { name: "Light" }).click()
  await expect(page.locator("html")).not.toHaveClass(/dark/)

  await switcher.click()
  await listbox.getByRole("option", { name: "Dark" }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)

  await page.reload()
  await expect(page.locator("html")).toHaveClass(/dark/)
})

test("theme switcher: profile appearance buttons toggle theme", async ({ page }) => {
  await login(page)
  await page.goto("/en/settings/profile")

  const group = page.getByRole("group", { name: "Theme" })
  await group.getByRole("button", { name: "Dark" }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)

  await group.getByRole("button", { name: "Light" }).click()
  await expect(page.locator("html")).not.toHaveClass(/dark/)
})
