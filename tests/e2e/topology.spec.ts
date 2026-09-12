import { expect, test } from "@playwright/test"

// D55 / step 10 — click-to-inspect details panel + selection highlight/dimming.
// Login as the mock admin (mocks/oidc seeds demo@example.com with the
// portfoliost_admin group), open the Topology tab, then exercise the canvas:
// clicking a node opens the right-side panel, the selected node rings and
// unrelated nodes dim, and clicking the canvas background closes the panel.

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\//)
}

async function openTopology(page: import("@playwright/test").Page) {
  await login(page)
  // Navigate via the sidebar (client-side) rather than page.goto: a full reload
  // races the router guard against App.vue's async fetchMe(), which would treat
  // the admin group as not-yet-known and bounce to /en/investments.
  await page.getByRole("link", { name: "Admin" }).click()
  await page.getByRole("link", { name: "Topology" }).click()
  await expect(page).toHaveURL(/\/en\/admin\/topology/)
}

/** The .vue-flow__node wrapper that contains the given node component. */
function nodeWrapper(page: import("@playwright/test").Page, nodeId: string) {
  return page.locator(`.vue-flow__node:has([data-node-id="${nodeId}"])`)
}

test("clicking a node opens the details panel", async ({ page }) => {
  await openTopology(page)

  const cachest = page.locator('[data-node-id="cachest"]').first()
  await expect(cachest).toBeVisible()
  await cachest.click()

  const panel = page.getByTestId("topology-details-panel")
  await expect(panel).toBeVisible()
  await expect(panel).toContainText("cachest")
  // Static content from graph-definition: provider metadata + neighbours.
  await expect(panel).toContainText("Market data cache (TTL proxy)")
  await expect(panel).toContainText("Neighbours")
})

test("selecting a node rings it and dims unrelated nodes", async ({ page }) => {
  await openTopology(page)

  await page.locator('[data-node-id="portfoliost-instruments"]').first().click()

  const selected = nodeWrapper(page, "portfoliost-instruments")
  await expect(selected).toHaveClass(/topo-node--selected/)

  // portfoliost (SPA) has no edge to portfoliost-instruments → dimmed.
  const spaNode = nodeWrapper(page, "portfoliost")
  await expect(spaNode).toHaveClass(/topo-node--dimmed/)

  // cachest shares a market-data edge with portfoliost-instruments → full opacity.
  const cachestNode = nodeWrapper(page, "cachest")
  await expect(cachestNode).not.toHaveClass(/topo-node--dimmed/)
})

test("clicking the canvas background closes the panel and resets the selection", async ({ page }) => {
  await openTopology(page)

  const cachest = page.locator('[data-node-id="cachest"]').first()
  await cachest.click()
  await expect(page.getByTestId("topology-details-panel")).toBeVisible()

  // Click empty canvas area on the left, clear of the 320px side panel.
  await page.locator(".vue-flow__pane").click({ position: { x: 60, y: 80 } })

  await expect(page.getByTestId("topology-details-panel")).toHaveCount(0)
  const spaNode = nodeWrapper(page, "portfoliost")
  await expect(spaNode).not.toHaveClass(/topo-node--dimmed/)
  await expect(spaNode).not.toHaveClass(/topo-node--selected/)
})

test("panel close button closes the panel", async ({ page }) => {
  await openTopology(page)

  await page.locator('[data-node-id="openst"]').first().click()
  await expect(page.getByTestId("topology-details-panel")).toBeVisible()
  await expect(page.getByTestId("topology-details-panel")).toContainText("Provides")

  await page.getByTestId("topology-panel-close").click()
  await expect(page.getByTestId("topology-details-panel")).toHaveCount(0)
})