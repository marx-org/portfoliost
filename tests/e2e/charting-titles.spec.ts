import { expect, test } from "@playwright/test"
import { login } from "./helpers/login"

/**
 * Charting built-in titles (#150).
 *
 * The visible HTML heading stays for page semantics; the ApexCharts title is
 * also rendered into the SVG so an SVG/PNG export carries it. Axis titles name
 * the unit. The dark-mode case checks the CSS fill override rather than the
 * option object, because the same options must stay legible in both themes.
 */

const TOP10 = "3cb589d8-f92d-428f-aeab-9ee5d4b9cef2"

test("chart and value-axis titles are present in the rendered SVG", async ({ page }) => {
  await login(page)
  await page.goto(`/en/charting/income?accounts=${TOP10}`)

  const chart = page.getByTestId("monthly-income-chart")
  await expect(chart).toBeVisible({ timeout: 30_000 })

  const title = chart.locator(".apexcharts-title-text")
  await expect(title).toHaveText("Monthly income", { timeout: 30_000 })
  await expect(chart.locator(".apexcharts-yaxis-title-text")).toContainText("Income (USD)")

  // The SVG is what ApexCharts serialises for export; the built-in title and
  // axis title must be inside it, not only in the surrounding HTML.
  const svg = await chart.locator("svg.apexcharts-svg").evaluate((el) => el.outerHTML)
  expect(svg).toContain("Monthly income")
  expect(svg).toContain("Income (USD)")
})

test("built-in title uses the dark-theme fill override", async ({ page }) => {
  await page.goto("/login")
  await page.evaluate(() => localStorage.setItem("portfoliost_theme", "dark"))
  await page.reload()

  await login(page)
  await page.goto(`/en/charting/income?accounts=${TOP10}`)

  const chart = page.getByTestId("monthly-income-chart")
  const title = chart.locator(".apexcharts-title-text")
  await expect(title).toHaveText("Monthly income", { timeout: 30_000 })

  const fill = await title.evaluate((el) => getComputedStyle(el).fill)
  expect(fill).toBe("rgb(241, 245, 249)")
})