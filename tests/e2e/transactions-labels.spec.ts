/**
 * §57.1 — the "Labels" button must open the picker next to the row that was
 * clicked, not clipped away by the card's `overflow-hidden` and not parked at
 * the bottom of the page.
 *
 * The old popover was `position: absolute` inside a detached zero-height anchor
 * div; inside `card overflow-hidden` it rendered off-viewport and was clipped.
 * It is now a `position: fixed` panel teleported to `document.body`, placed
 * from the trigger's rect — so these assertions are about geometry: the panel
 * must be fully inside the viewport and flush with the button.
 */
import { expect, test, type Locator, type Page } from "@playwright/test"

const LABEL_NAME = `E2E-TX-${Math.floor(Date.now() / 1000)}`

async function login(page: Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

/** The first data row that actually has a Labels button (skips group headers). */
function firstLabellableRow(page: Page): Locator {
  return page
    .locator("tbody tr")
    .filter({ has: page.getByRole("button", { name: "Set labels" }) })
    .first()
}

/**
 * Open the picker for the first labellable row and assert it is flush with the
 * button. Returns the row so the caller can assert the chip after saving.
 */
async function openPickerAdjacentToRow(page: Page) {
  const row = firstLabellableRow(page)
  await expect(row).toBeVisible({ timeout: 20000 })

  const button = row.getByRole("button", { name: "Set labels" })
  await button.click()

  const picker = page.getByRole("dialog", { name: "Set labels" })
  await expect(picker).toBeVisible({ timeout: 10000 })
  const pickerBox = (await picker.boundingBox())!
  // Measured after the click: Playwright scrolls the row into view, which moves
  // the button (and therefore the trigger rect the panel is placed from).
  const buttonBox = (await button.boundingBox())!

  const viewport = page.viewportSize()!

  // Not clipped, not off-screen: the whole panel is inside the viewport. This
  // is the assertion the old `absolute` + `overflow-hidden` anchor failed.
  expect(pickerBox.x).toBeGreaterThanOrEqual(0)
  expect(pickerBox.y).toBeGreaterThanOrEqual(0)
  expect(pickerBox.x + pickerBox.width).toBeLessThanOrEqual(viewport.width)
  expect(pickerBox.y + pickerBox.height).toBeLessThanOrEqual(viewport.height)

  // Adjacent: the vertical gap to the button is <= 16px either below it or
  // above it (the util flips when there is no room below). The old bug put the
  // panel hundreds of pixels away at the bottom of the page.
  const gapBelow = pickerBox.y - (buttonBox.y + buttonBox.height)
  const gapAbove = buttonBox.y - (pickerBox.y + pickerBox.height)
  const flush = gapBelow <= 16 || gapAbove <= 16
  expect(
    flush,
    `panel is not flush with the button (gapBelow=${gapBelow}, gapAbove=${gapAbove})`,
  ).toBe(true)

  // Right edges aligned (POPOVER_GAP = 8). While the actions column still
  // overflows the table (§57.2), the button sits off-screen and the panel is
  // clamped to the viewport instead — after §57.2 the first branch applies.
  const buttonRight = buttonBox.x + buttonBox.width
  if (buttonRight <= viewport.width) {
    expect(Math.abs(pickerBox.x + pickerBox.width - buttonRight)).toBeLessThanOrEqual(16)
  } else {
    expect(pickerBox.x + pickerBox.width).toBe(viewport.width - 8)
  }

  return { row, picker }
}

test.describe.serial("transactions labels picker placement (57.1)", () => {
  test("create a label to assign", async ({ page }) => {
    await login(page)
    await page.goto("/en/investments/transactions")
    await expect(firstLabellableRow(page)).toBeVisible({ timeout: 20000 })

    await page.getByRole("button", { name: "Manage labels" }).click()
    const dialog = page.getByRole("dialog", { name: "Manage labels" })
    await expect(dialog).toBeVisible()
    await dialog.getByPlaceholder("e.g. Dividend").fill(LABEL_NAME)
    await dialog.getByRole("button", { name: "Add" }).click()
    await expect(dialog.getByText(LABEL_NAME)).toBeVisible({ timeout: 5000 })
    await dialog.getByRole("button", { name: "Close" }).click()
  })

  test("global transactions: picker opens next to the row and the label sticks", async ({ page }) => {
    await login(page)
    await page.goto("/en/investments/transactions")

    const { row, picker } = await openPickerAdjacentToRow(page)

    await picker.locator("label").filter({ hasText: LABEL_NAME }).getByRole("checkbox").check()
    await picker.getByRole("button", { name: "Save" }).click()
    await expect(picker).not.toBeVisible({ timeout: 10000 })

    await expect(row.locator(`[title="${LABEL_NAME}"]`)).toBeVisible({ timeout: 20000 })
  })

  test("portfolio transactions tab: picker opens next to the row too", async ({ page }) => {
    await login(page)
    await page.getByRole("link", { name: /Top10/ }).click()
    await expect(page).toHaveURL(/\/en\/portfolios\/[^/]+\/holdings/)
    const pid = new URL(page.url()).pathname.split("/")[3]
    await page.goto(`/en/portfolios/${pid}/transactions`)

    const { picker } = await openPickerAdjacentToRow(page)
    await expect(picker).toBeVisible()
  })

  test("Escape closes the picker and clears the trigger state", async ({ page }) => {
    await login(page)
    await page.goto("/en/investments/transactions")

    const { picker } = await openPickerAdjacentToRow(page)
    await page.keyboard.press("Escape")
    await expect(picker).not.toBeVisible({ timeout: 5000 })

    // Re-opening from a different row still lands next to that row.
    const row = firstLabellableRow(page)
    await row.getByRole("button", { name: "Set labels" }).click()
    await expect(picker).toBeVisible({ timeout: 5000 })
  })
})
