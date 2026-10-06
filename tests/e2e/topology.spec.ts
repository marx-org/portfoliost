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
  // A full reload, not a click-through: this used to race the router guard
  // against the async /auth/me and bounce to /en/investments, which is why the
  // nav had to be clicked here. §36 fixed the guard, so the hard load is the
  // honest way in and the regression guard for it.
  await page.goto("/en/admin/topology")
  await expect(page).toHaveURL(/\/en\/admin\/topology/)
}

/** The .vue-flow__node wrapper that contains the given node component. */
function nodeWrapper(page: import("@playwright/test").Page, nodeId: string) {
  return page.locator(`.vue-flow__node:has([data-node-id="${nodeId}"])`)
}

test("cinematic effects animate, pause, and respect reduced motion without blocking inspection", async ({ page }) => {
  await openTopology(page)
  const atmosphere = page.locator('.mission-aurora').first()
  const flow = page.locator('.topo-flow').first()
  // Icon glow (mission-icon-breathe) pulses on every node regardless of live
  // status; the status dot only pulses when health resolves (unit-tested).
  const iconGlow = page.locator('.vue-flow__node [data-node-id]').first()
  // The breathe glow renders on the node card's ::before pseudo-element.
  const glowAnimation = () => iconGlow.evaluate((e) => getComputedStyle(e, '::before').animationName)
  const glowPlayState = () => iconGlow.evaluate((e) => getComputedStyle(e, '::before').animationPlayState)
  await expect(atmosphere).toHaveCSS('animation-name', 'mission-drift')
  await expect(atmosphere).toHaveCSS('animation-play-state', 'running')
  await expect(flow).toHaveCSS('animation-name', 'topo-edge-flow')
  await expect.poll(glowAnimation).toBe('mission-icon-breathe')
  await page.getByTestId('topo-effects').click()
  await expect(page.getByTestId('topo-effects')).toHaveAttribute('aria-pressed', 'true')
  await expect(atmosphere).toHaveCSS('animation-play-state', 'paused')
  await expect(flow).toHaveCSS('animation-play-state', 'paused')
  await expect.poll(glowPlayState).toBe('paused')
  await page.getByTestId('topo-effects').click()
  await expect(atmosphere).toHaveCSS('animation-play-state', 'running')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(atmosphere).toHaveCSS('animation-name', 'none')
  await expect(flow).toHaveCSS('animation-name', 'none')
  await expect.poll(glowAnimation).toBe('none')
  await expect(page.locator('.mission-legend')).toContainText('Reduced motion')
  await page.locator('[data-node-id="cachest"]').first().click()
  await expect(page.getByTestId('topology-details-panel')).toBeVisible()
})

test("theme switcher switches light, dark, and system, and persists across reload", async ({ page }) => {
  await openTopology(page)
  const dark = page.getByTestId('topo-theme-dark')
  const light = page.getByTestId('topo-theme-light')
  const auto = page.getByTestId('topo-theme-system')

  const stage = page.locator('.mission-stage')
  const node = page.locator('[data-node-id="cachest"]').first()
  const nodeBackground = () => node.evaluate(el => getComputedStyle(el).backgroundImage)
  await dark.click()
  await expect(dark).toHaveAttribute('aria-pressed', 'true')
  await expect(stage).toHaveCSS('background-color', 'rgb(7, 17, 31)')
  await expect.poll(nodeBackground).toContain('rgb(27, 42, 66)')

  // Light: the dark shell on <html> is removed and the stage follows.
  await light.click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect(stage).toHaveCSS('background-color', 'rgb(237, 244, 252)')
  await expect(page.locator('.mission-atmosphere')).toHaveCSS('background-color', 'rgb(237, 244, 252)')
  await expect.poll(nodeBackground).toContain('rgb(255, 255, 255)')
  await node.click()
  await expect(page.getByTestId('topology-details-panel')).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.96)')
  await page.getByTestId('topology-panel-close').click()

  // Auto: follows the OS setting (emulated dark here); the fixed listener
  // re-applies the class when the OS setting changes.
  await page.emulateMedia({ colorScheme: 'dark' })
  await auto.click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).not.toHaveClass(/dark/)

  // Preference persists across a reload.
  await page.emulateMedia({ colorScheme: 'dark' })
  await dark.click()
  await page.reload()
  await page.getByRole('link', { name: 'Admin' }).click()
  await page.getByRole('link', { name: 'Topology' }).click()
  await expect(page.getByTestId('topo-theme-dark')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('html')).toHaveClass(/dark/)

  // Restore light so other tests (which assume the default) are unaffected.
  await light.click()
})

test("OpenST plugins and scheduled jobs are mapped and inspectable", async ({ page }) => {
  await openTopology(page)
  for (const id of ['biznesradar', 'obligacje', 'openst-bond-import', 'openst-bond-archive', 'openst-cpi-import', 'openst-cpi-seed']) {
    const node = page.locator(`[data-node-id="${id}"]`).first()
    await node.click()
    await expect(page.getByTestId('topology-details-panel')).toBeVisible()
    if (id === 'openst-cpi-seed') {
      await expect(page.getByTestId('topology-details-panel')).toContainText('Suspended')
      await expect(page.getByTestId('topology-details-panel')).toContainText('Not live execution status')
    }
    if (id === 'obligacje') {
      await expect(page.getByTestId('topology-details-panel')).toContainText('issue parameters + CPI')
    }
    await page.getByTestId('topology-panel-close').click()
  }
})

test("focus mode exits with Escape and empty search offers recovery", async ({ page }) => {
  await openTopology(page)
  await page.getByTestId('topo-focus').click()
  await expect(page.locator('.mission-control')).toHaveClass(/mission-control--focus/)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('topo-focus')).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('topo-search').fill('no-service-matches-this')
  await expect(page.getByText('No nodes in view')).toBeVisible()
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click()
  await expect(page.getByTestId('topo-search')).toHaveValue('')
  await expect(page.locator('[data-node-id="cachest"]').first()).toBeVisible()
})

test("cinematic workspace fits mobile and keeps the inspector reachable", async ({ page }) => {
  // Login/navigation in the desktop shell, then switch to mobile for this admin surface.
  await page.setViewportSize({ width: 1280, height: 900 })
  await openTopology(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('topo-effects')).toBeVisible()
  const bounds = await page.locator('.mission-stage').boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391)
  await page.getByTestId('topo-focus').click()
  await page.locator('[data-node-id="cachest"]').first().click()
  const panel = page.getByTestId('topology-details-panel')
  await expect(panel).toBeVisible()
  await expect.poll(async () => {
    const box = await panel.boundingBox()
    return box!.x + box!.width
  }).toBeLessThanOrEqual(391)
  expect((await panel.boundingBox())!.x).toBeGreaterThanOrEqual(0)
  await page.getByTestId('topology-panel-close').click()
  await page.getByTestId('topo-focus').click()
  await expect(page.getByTestId('topo-focus')).toHaveAttribute('aria-pressed', 'false')
})

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

test("storage workloads (postgres/redis) render and inspect without a live overlay in compose", async ({ page }) => {
  await openTopology(page)

  // compose has no Prometheus → the mock /topology endpoints return no rows for
  // postgres/redis, so the nodes render with static content only (no overlay).
  for (const id of ["postgres", "redis"]) {
    const node = page.locator(`[data-node-id="${id}"]`).first()
    await expect(node).toBeVisible()
    await node.click()
    const panel = page.getByTestId("topology-details-panel")
    await expect(panel).toBeVisible()
    // no live metrics sections — status overlay is absent in the compose mock
    await expect(panel).not.toContainText("Replicas")
    await expect(panel).not.toContainText("Source:")
    await page.getByTestId("topology-panel-close").click()
    await expect(panel).toBeHidden()
  }
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
  // Park the element at a fixed viewport spot before measuring. The canvas is
  // taller than a 720px-tall window, so a lane can sit below the fold: without
  // this, mouse.down() at those coordinates lands outside the viewport and the
  // drag silently never starts. Centring is deterministic, so repeated calls
  // for the same element measure in the same scroll state and stay comparable
  // — including after a click that scrolled the page on its own.
  await locator.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }))
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return { x: box!.x, y: box!.y }
}

/** The lane's position in graph coordinates, from vue-flow's inline transform. */
async function laneGraphPos(locator: import("@playwright/test").Locator): Promise<{ x: number; y: number }> {
  const transform = await locator.evaluate((el) => (el as HTMLElement).style.transform)
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(transform)
  expect(m, `lane transform "${transform}"`).not.toBeNull()
  return { x: Number(m![1]), y: Number(m![2]) }
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

test("every rendered node fits inside its lane, not just the sampled five (§80.4)", async ({ page }) => {
  await openTopology(page)

  // NODE_SIZES is a hand-maintained per-area constant and the components draw
  // their own box from Tailwind padding, so the two can disagree — and a node
  // wider than the lane that reserved room for it is clipped. Measure what the
  // browser actually painted, for every node.
  const overflow = await page.evaluate(() => {
    const bad: string[] = []
    for (const el of Array.from(document.querySelectorAll("[data-node-id]"))) {
      const node = el as HTMLElement
      const lane = node.closest(".topo-lane-node") as HTMLElement | null
      if (!lane) continue
      const n = node.getBoundingClientRect()
      const l = lane.getBoundingClientRect()
      const id = node.getAttribute("data-node-id")
      if (n.left < l.left - 1 || n.right > l.right + 1 || n.top < l.top - 1 || n.bottom > l.bottom + 1) {
        bad.push(
          `${id}: node ${n.width.toFixed(0)}x${n.height.toFixed(0)} at ${n.left.toFixed(0)},${n.top.toFixed(0)} escapes lane ${l.width.toFixed(0)}x${l.height.toFixed(0)} at ${l.left.toFixed(0)},${l.top.toFixed(0)}`,
        )
      }
    }
    return bad
  })
  expect(overflow).toEqual([])
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
  // Drag horizontally through free space; a diagonal path may correctly hit
  // the jobs lane as the graph grows (collision clamping is unit-tested).
  await page.mouse.move(hb.x + 40 + 80, hb.y + hb.height / 2, { steps: 8 })
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
  await page.mouse.move(hb.x + 40 + 120, hb.y + hb.height / 2, { steps: 8 })
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
  // Compare graph coordinates, not screen pixels: the drag can move the lane far
  // enough sideways that the next measurement scrolls, and a persisted position
  // is a graph-space fact.
  const afterDrag = await laneGraphPos(external)
  expect(afterDrag.x).toBeGreaterThan(40)

  await page.reload()
  await page.getByRole("link", { name: "Admin" }).click()
  await page.getByRole("link", { name: "Topology" }).click()
  await expect(page).toHaveURL(/\/en\/admin\/topology/)

  const restored = await laneGraphPos(laneNode(page, "external-services"))
  expect(Math.abs(restored.x - afterDrag.x)).toBeLessThan(2)
  expect(Math.abs(restored.y - afterDrag.y)).toBeLessThan(2)
})