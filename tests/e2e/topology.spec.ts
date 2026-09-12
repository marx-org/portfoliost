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

// D55 / follow-up — each area renders as a movable parent lane node. The lanes
// never overlap, dragging a lane header moves the whole group together, the
// Re-layout button restores the canonical dagre arrangement, and manual
// positions survive a reload (localStorage).

function laneNode(page: import("@playwright/test").Page, area: string) {
  return page.locator(`.topo-lane-node:has([data-lane="${area}"])`)
}

async function laneBox(locator: import("@playwright/test").Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return { x: box!.x, y: box!.y }
}

function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return ox > 0 && oy > 0
}

test("lane parent boxes render per area and never overlap", async ({ page }) => {
  await openTopology(page)

  const lanes = page.locator(".topo-lane-node")
  await expect(lanes).toHaveCount(5)
  for (const area of ["internal", "storage", "jobs", "external-services", "data-providers"]) {
    await expect(laneNode(page, area)).toBeVisible()
    await expect(laneNode(page, area).locator(".topo-lane__label")).toContainText(
      area === "external-services" ? "External" : area === "data-providers" ? "Providers" : area.slice(0, 1).toUpperCase() + area.slice(1),
    )
  }

  const boxes = await Promise.all(
    ["internal", "storage", "jobs", "external-services", "data-providers"].map(async (area) => ({
      area,
      box: (await laneNode(page, area).boundingBox())!,
    })),
  )
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      expect(intersects(boxes[i].box, boxes[j].box), `${boxes[i].area} ⊕ ${boxes[j].area}`).toBe(false)
    }
  }

  // Every member node sits inside its lane box on screen.
  for (const id of ["cachest", "portfoliost-admin", "jobshot", "postgres", "pocketid"]) {
    const member = await nodeWrapper(page, id).boundingBox()
    const lane = boxes.find((l) =>
      l.box.x <= member!.x + 1 &&
      l.box.y <= member!.y + 1 &&
      l.box.x + l.box.width >= member!.x + member!.width - 1 &&
      l.box.y + l.box.height >= member!.y + member!.height - 1,
    )
    expect(lane, `${id} inside a lane`).toBeDefined()
  }
})

test("dragging a lane header moves its member nodes together", async ({ page }) => {
  await openTopology(page)

  const external = laneNode(page, "external-services")
  const pocketid = nodeWrapper(page, "pocketid")
  const beforeLane = await laneBox(external)
  const beforeChild = await laneBox(pocketid)

  const header = external.locator(".topo-lane__header")
  const hb = (await header.boundingBox())!
  await page.mouse.move(hb.x + 40, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + 40 + 80, hb.y + hb.height / 2 + 30, { steps: 8 })
  await page.mouse.up()

  const afterLane = await laneBox(external)
  const afterChild = await laneBox(pocketid)
  // Members are parented to the lane: both translate by the same vector.
  expect(afterLane.x - beforeLane.x).toBeGreaterThan(20)
  expect(Math.abs(afterChild.x - beforeChild.x - (afterLane.x - beforeLane.x))).toBeLessThan(2)
  expect(Math.abs(afterChild.y - beforeChild.y - (afterLane.y - beforeLane.y))).toBeLessThan(2)
})

test("re-layout restores the canonical arrangement after a manual move", async ({ page }) => {
  await openTopology(page)

  const external = laneNode(page, "external-services")
  const before = await laneBox(external)

  const header = external.locator(".topo-lane__header")
  const hb = (await header.boundingBox())!
  await page.mouse.move(hb.x + 40, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + 40 + 120, hb.y + hb.height / 2 + 60, { steps: 8 })
  await page.mouse.up()
  const afterDrag = await laneBox(external)
  expect(Math.abs(afterDrag.x - before.x)).toBeGreaterThan(40)

  await page.getByTestId("topo-relayout").click()
  const afterRelayout = await laneBox(external)
  expect(Math.abs(afterRelayout.x - before.x)).toBeLessThan(2)
  expect(Math.abs(afterRelayout.y - before.y)).toBeLessThan(2)
})

test("moved lanes persist across a reload", async ({ page }) => {
  await openTopology(page)

  const external = laneNode(page, "external-services")
  const header = external.locator(".topo-lane__header")
  const hb = (await header.boundingBox())!
  await page.mouse.move(hb.x + 40, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + 40 + 100, hb.y + hb.height / 2, { steps: 8 })
  await page.mouse.up()
  const afterDrag = await laneBox(external)
  expect(afterDrag.x).toBeGreaterThan(40)

  await page.reload()
  await page.getByRole("link", { name: "Admin" }).click()
  await page.getByRole("link", { name: "Topology" }).click()
  await expect(page).toHaveURL(/\/en\/admin\/topology/)

  const restored = await laneBox(laneNode(page, "external-services"))
  expect(Math.abs(restored.x - afterDrag.x)).toBeLessThan(2)
  expect(Math.abs(restored.y - afterDrag.y)).toBeLessThan(2)
})