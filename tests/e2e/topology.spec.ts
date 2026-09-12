import { expect, test } from "@playwright/test"

// D55 / steps 10-11 — click-to-inspect details panel + selection
// highlight/dimming (step 10) and the toolbar with search + area filter pills
// (step 11). Login as the mock admin (mocks/oidc seeds demo@example.com with
// the portfoliost_admin group), open the Topology tab, then exercise the
// canvas: clicking a node opens the right-side panel, the selected node rings
// and unrelated nodes dim, clicking the canvas background closes the panel,
// searching filters nodes down to matches, and filter pills toggle area
// visibility. Live status/traffic never resolves in this compose stack (the
// admin module needs X-User-* headers or a JWT), so assertions stay on static
// content and filtering behavior.

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

test("search filters nodes down to matches", async ({ page }) => {
  await openTopology(page)

  const cachest = nodeWrapper(page, "cachest")
  const openst = nodeWrapper(page, "openst")
  const spa = nodeWrapper(page, "portfoliost")
  await expect(cachest).toBeVisible()

  await page.getByTestId("topo-search").fill("cachest")

  // The matching node stays; non-matching nodes are removed from the DOM.
  await expect(cachest).toBeVisible()
  await expect(openst).toHaveCount(0)
  await expect(spa).toHaveCount(0)

  // The inspector still opens for the visible match.
  await cachest.click()
  await expect(page.getByTestId("topology-details-panel")).toBeVisible()
  await expect(page.getByTestId("topology-details-panel")).toContainText("cachest")

  // Clearing the search restores every node.
  await page.getByTestId("topo-search").fill("")
  await expect(openst).toBeVisible()
  await expect(spa).toBeVisible()
})

test("filter pill toggles area visibility", async ({ page }) => {
  await openTopology(page)

  const providersPill = page.getByTestId("topo-filter-data-providers")
  const cachest = nodeWrapper(page, "cachest")
  const spa = nodeWrapper(page, "portfoliost")
  await expect(cachest).toBeVisible()
  await expect(providersPill).toHaveAttribute("aria-pressed", "true")

  // Providers off → openst/cachest disappear while Internal (SPA) remains.
  await providersPill.click()
  await expect(cachest).toHaveCount(0)
  await expect(spa).toBeVisible()
  await expect(providersPill).toHaveAttribute("aria-pressed", "false")

  // Back on → providers return.
  await providersPill.click()
  await expect(cachest).toBeVisible()
  await expect(providersPill).toHaveAttribute("aria-pressed", "true")
})