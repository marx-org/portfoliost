import { expect, test } from "@playwright/test"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

async function openCharting(page: import("@playwright/test").Page) {
  await login(page)
  await page.goto("/en/charting")
}

test("charting shows an empty state and a preset is applied", async ({ page }) => {
  const consoleErrors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text())
  })

  await openCharting(page)

  await expect(page.getByRole("heading", { name: "Charting" })).toBeVisible()
  await expect(page.getByText(/No stocks added yet/)).toBeVisible()

  await page.getByTestId("preset-mega-cap-tech").click()
  await expect(page.getByTestId("stock-chip")).toHaveCount(6)
  await expect(page.locator(".apexcharts-canvas").first()).toBeVisible()
  await expect(page.getByText("P/E (TTM)").last()).toBeVisible()

  expect(consoleErrors).toEqual([])
})

test("charting adds stocks via search and compares them", async ({ page }) => {
  await openCharting(page)

  await page.getByTestId("add-stock").click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.getByTestId("instrument-search").fill("apple")
  await expect(page.getByRole("button", { name: /Apple Inc/ })).toBeVisible()
  await page.getByRole("button", { name: /Apple Inc/ }).click()
  await expect(page.getByRole("dialog")).not.toBeVisible()

  await page.getByTestId("add-stock").click()
  await page.getByTestId("instrument-search").fill("microsoft")
  await expect(page.getByRole("button", { name: /Microsoft Corp/ })).toBeVisible()
  await page.getByRole("button", { name: /Microsoft Corp/ }).click()

  await expect(page.getByTestId("stock-chip")).toHaveCount(2)
  await expect(page.locator(".apexcharts-canvas").first()).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "AAPL" })).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "MSFT" })).toBeVisible()
})

test("charting switches metric and removes a stock", async ({ page }) => {
  await openCharting(page)

  await page.getByTestId("preset-chip-makers").click()
  await expect(page.getByTestId("stock-chip")).toHaveCount(7)
  await expect(page.getByRole("columnheader", { name: "NVDA" })).toBeVisible()

  await page.getByTestId("metric-picker").selectOption("netMargin")
  await expect(page.getByText("Net Margin").last()).toBeVisible()

  await page.getByTestId("remove-stock").first().click()
  await expect(page.getByTestId("stock-chip")).toHaveCount(6)
})
