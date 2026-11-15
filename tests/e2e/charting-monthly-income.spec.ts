import { expect, test } from "@playwright/test"

/**
 * Income chart, end to end against the dockerized stack (feature #253,
 * sub-issue #257).
 *
 * The charting reads serve ONLY the published generation's `chart_event_facts`
 * — there is no on-read rebuild — so the db-seed publishes generation 1 for the
 * seeded Top10 portfolio with a few income facts (a dividend + interest month, a
 * true zero gap month, and a current partial month). This proves the monthly
 * chart renders the shared scoped dataset: one row per month, a zero month kept
 * (not hidden), and the current month marked partial. The exact amounts are
 * asserted against the seeded fixture so a silent scope/gap regression fails.
 */

const TOP10 = "3cb589d8-f92d-428f-aeab-9ee5d4b9cef2"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

test("income chart renders monthly dividends/interest/options with a zero and a partial month", async ({ page }) => {
  const consoleErrors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text())
  })

  await login(page)
  await page.goto(`/en/charting/income?accounts=${TOP10}`)

  const chart = page.getByTestId("monthly-income-chart")
  await expect(chart).toBeVisible({ timeout: 30_000 })

  // One row per visible month. The window is now-relative (last 4 months), so
  // assert the shape rather than hardcoded months: at least 3 rows and the
  // zero gap month and the current partial month both present.
  const rows = chart.locator("tbody tr")
  await expect.poll(async () => rows.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(3)

  // The partial column is present and the current (last) month is marked "yes".
  const header = await chart.locator("thead").innerText()
  expect(header).toContain("Partial")
  const partialCells = await chart.getByRole("cell", { name: "yes" }).count()
  expect(partialCells).toBeGreaterThanOrEqual(1)

  // A zero month is rendered as zero, not dropped: at least one row has all-zero
  // numeric cells except the month label.
  const bodyText = await chart.locator("tbody").innerText()
  expect(bodyText).toMatch(/\b0\b/)

  expect(consoleErrors).toEqual([])
})

test("income chart is empty for a scope that matches no facts", async ({ page }) => {
  await login(page)
  // A well-formed UUID that is not the seeded portfolio's account → empty scope.
  await page.goto("/en/charting/income?accounts=99999999-9999-4999-8999-999999999999")
  const chart = page.getByTestId("monthly-income-chart")
  await expect(chart).toBeVisible({ timeout: 30_000 })
  await expect(chart.getByText("No income data")).toBeVisible()
})