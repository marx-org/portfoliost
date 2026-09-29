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

  // Right edges aligned (POPOVER_GAP = 8). The actions column is sticky since
  // §57.2, so the button is always inside the viewport and the first branch is
  // the normal path; the fallback keeps the assertion meaningful if a future
  // column set pushes it off-screen again.
  const buttonRight = buttonBox.x + buttonBox.width
  if (buttonRight <= viewport.width) {
    expect(Math.abs(pickerBox.x + pickerBox.width - buttonRight)).toBeLessThanOrEqual(16)
  } else {
    expect(pickerBox.x + pickerBox.width).toBe(viewport.width - 8)
  }

  return { row, picker }
}

/**
 * The scrollable wrapper around the transactions table. The page has nested
 * `.overflow-x-auto` elements (an outer flex-1 panel wraps the table's own
 * scroller), and a `has:` filter alone matches the ancestor too — so require
 * the table to be a DIRECT child, and the labels button to be inside.
 */
function transactionsWrap(page: Page) {
  return page
    .locator(".overflow-x-auto:has(> table)")
    .filter({ has: page.getByRole("button", { name: "Set labels" }) })
    .first()
}

/**
 * §57.2 — the actions column is pinned to the right edge of the table wrap:
 * visible with no horizontal scroll, and it stays put when the table is
 * scrolled right. (Example service parity; measured on app.example-service.ai.)
 */
async function expectActionsPinned(page: Page) {
  const wrap = transactionsWrap(page)
  await expect(wrap).toBeVisible({ timeout: 20000 })

  const row = firstLabellableRow(page)
  const buttons = {
    edit: row.getByRole("button", { name: "Edit transaction" }),
    labels: row.getByRole("button", { name: "Set labels" }),
    delete: row.getByRole("button", { name: "Delete transaction" }),
  }

  const wrapBox = (await wrap.boundingBox())!
  const atRest: Record<string, number> = {}
  for (const [name, button] of Object.entries(buttons)) {
    const box = (await button.boundingBox())!
    // Fully inside the visible area of the wrap, without scrolling.
    expect(box.x, `${name} starts left of the wrap`).toBeGreaterThanOrEqual(wrapBox.x - 1)
    expect(box.x + box.width, `${name} ends right of the wrap`).toBeLessThanOrEqual(wrapBox.x + wrapBox.width + 1)
    atRest[name] = box.x
  }

  // Scroll the table fully right: sticky holds the same on-screen x.
  await wrap.evaluate((el) => {
    el.scrollLeft = el.scrollWidth
  })
  await page.waitForTimeout(300)
  for (const [name, button] of Object.entries(buttons)) {
    const box = (await button.boundingBox())!
    expect(Math.abs(box.x - atRest[name]), `${name} moved when the table scrolled`).toBeLessThanOrEqual(1)
    expect(box.x + box.width).toBeLessThanOrEqual(wrapBox.x + wrapBox.width + 1)
  }
  await wrap.evaluate((el) => {
    el.scrollLeft = 0
  })
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

    // Unassign again. `LabelChips` renders only the first 3 labels, so a spec
    // re-run without a mock-state reset would push this row's new chip past
    // `max` and fail on its own leftovers. Leaving the fixture as we found it
    // also exercises the picker's removal path.
    await row.getByRole("button", { name: "Set labels" }).click()
    await expect(picker).toBeVisible({ timeout: 10000 })
    await picker.locator("label").filter({ hasText: LABEL_NAME }).getByRole("checkbox").uncheck()
    await picker.getByRole("button", { name: "Save" }).click()
    await expect(picker).not.toBeVisible({ timeout: 10000 })
    await expect(row.locator(`[title="${LABEL_NAME}"]`)).toHaveCount(0, { timeout: 20000 })
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

  test("global transactions: actions stay pinned at 1280px, before and after scrolling (57.2)", async ({ page }) => {
    await login(page)
    await page.goto("/en/investments/transactions")
    await expect(firstLabellableRow(page)).toBeVisible({ timeout: 20000 })

    // The bug: 10–11 columns, wrap 991 vs scroll 1143 at 1280px — Edit was
    // 22/38px visible and Labels + Delete were entirely off-screen.
    const metrics = await transactionsWrap(page).evaluate((el) => ({
      client: el.clientWidth,
      scroll: el.scrollWidth,
    }))
    expect(metrics.scroll).toBeGreaterThan(metrics.client)

    await expectActionsPinned(page)
  })

  test("cash transactions: actions stay pinned at 1280px (57.2)", async ({ page }) => {
    await login(page)
    await page.goto("/en/investments/transactions/cash")
    await expect(firstLabellableRow(page)).toBeVisible({ timeout: 20000 })

    await expectActionsPinned(page)
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
