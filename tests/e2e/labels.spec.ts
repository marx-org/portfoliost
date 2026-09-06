/**
 * E2E integration test for labels (D65–D71).
 * Runs serially so later tests can assume the label created by the first test exists.
 */
import { expect, test } from "@playwright/test"

const LABEL_NAME = `E2E-${Math.floor(Date.now() / 1000)}`

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

test.describe.serial("labels (D65-D71)", () => {
  test("create a label via LabelManager", async ({ page }) => {
    await login(page)
    await page.getByRole("link", { name: /Top10/ }).click()
    await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)

    // Open dialog
    await page.getByRole("button", { name: "Manage labels" }).click()
    const dialog = page.getByRole("dialog", { name: "Manage labels" })
    await expect(dialog).toBeVisible()

    // Create a new label
    await dialog.getByPlaceholder("e.g. Dividend").fill(LABEL_NAME)
    await dialog.getByRole("button", { name: "Add" }).click()
    await expect(dialog.getByText(LABEL_NAME)).toBeVisible({ timeout: 5000 })

    // Close
    await dialog.getByRole("button", { name: "Close" }).click()
    await expect(dialog).not.toBeVisible()

    // Label chip appears in the filter bar
    const filterBar = page.getByTestId("label-filter-bar")
    await expect(filterBar.locator(`[title="${LABEL_NAME}"]`)).toBeVisible()
  })

  test("assign label to a position and verify badge in holdings row", async ({ page }) => {
    await login(page)
    await page.getByRole("link", { name: /Top10/ }).click()
    await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)

    // First row with META
    const metaRow = page.locator("tbody tr").filter({ hasText: "META" }).first()
    await expect(metaRow).toBeVisible({ timeout: 10000 })

    // Open kebab menu
    await metaRow.getByRole("button", { name: "Position actions" }).click()
    await expect(page.getByRole("button", { name: "Set labels..." })).toBeVisible()
    await page.getByRole("button", { name: "Set labels..." }).click()

    // Picker appears
    const picker = page.getByRole("dialog", { name: "Set labels" })
    await expect(picker).toBeVisible({ timeout: 5000 })

    // Find and check our label
    const labelRow = picker.locator("label").filter({ hasText: LABEL_NAME })
    await expect(labelRow).toBeVisible({ timeout: 5000 })
    await labelRow.getByRole("checkbox").check()

    // Save
    await picker.getByRole("button", { name: "Save" }).click()
    // Wait for picker to close and positions to re-fetch
    await expect(picker).not.toBeVisible({ timeout: 8000 })
    await page.waitForTimeout(500)

    // Label badge appears on the META row
    await expect(metaRow.locator(`[title="${LABEL_NAME}"]`)).toBeVisible({ timeout: 15000 })
  })

  test("filter by label in holdings shows only labelled positions", async ({ page }) => {
    await login(page)
    await page.getByRole("link", { name: /Top10/ }).click()
    await expect(page).toHaveURL(/\/en\/portfolios\/.*\/holdings/)

    // Wait for positions to load
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 10000 })

    // Click the label chip in the filter bar
    const filterBar = page.getByTestId("label-filter-bar")
    const chip = filterBar.locator(`[title="${LABEL_NAME}"]`)
    await expect(chip).toBeVisible({ timeout: 5000 })
    await chip.click()

    // After filter: only META row (the one we labelled) should be visible
    await page.waitForTimeout(600)
    const rows = page.locator("tbody tr")
    const count = await rows.count()
    // All visible rows should carry the label badge
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i).locator(`[title="${LABEL_NAME}"]`)).toBeVisible()
    }

    // De-select chip — rows expand back
    await chip.click()
    await page.waitForTimeout(600)
    expect(await rows.count()).toBeGreaterThanOrEqual(count)
  })
})
