import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto(`${process.env.PORTFOLIOST_BASE_URL || 'http://localhost:3000'}/login`)
  await page.getByTestId('email').fill('demo@example.com')
  await page.getByTestId('password').fill('example-service-mock')
  await page.getByTestId('signin').click()
  await page.waitForURL(/\/en\//)
  await page.getByRole('link', { name: 'Admin', exact: true }).click()
  await page.getByRole('link', { name: 'Topology', exact: true }).click()
  const aurora = page.locator('.mission-aurora').first()
  await aurora.waitFor()
  const animation = () => aurora.evaluate(el => ({ name: getComputedStyle(el).animationName, state: getComputedStyle(el).animationPlayState }))
  assert.equal(await page.locator('.mission-stage').evaluate(el => getComputedStyle(el).isolation), 'isolate', 'mission-control stylesheet is applied')
  assert.equal((await animation()).name, 'mission-drift', 'atmosphere animates normally')
  await page.getByTestId('topo-effects').click()
  assert.equal((await animation()).state, 'paused', 'Pause effects stops atmosphere')
  await page.getByTestId('topo-effects').click()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal((await animation()).name, 'none', 'reduced motion disables atmosphere')
  const flows = page.locator('.topo-flow')
  assert.ok(await flows.count(), 'traffic overlays exist')
  assert.equal(await flows.first().evaluate(el => getComputedStyle(el).animationName), 'none', 'reduced motion disables traffic')
  await page.locator('[data-node-id="cachest"]').first().click()
  await page.getByTestId('topology-details-panel').waitFor()
  console.log('PASS: stylesheet applied; motion runs, pauses, and respects reduced motion; inspection works.')
} finally {
  await browser.close()
}
