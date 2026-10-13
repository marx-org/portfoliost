import { expect, test, type APIRequestContext, type Page } from "@playwright/test"

/**
 * §143 — virtual portfolios, end to end against the compose stack.
 *
 * The unit suite (InvestmentsView.test.ts) owns the dialog logic and the tab
 * filter. What only a browser can show is the two-tab page itself: the strip
 * switches collections, the virtual cards are the SAME PortfolioCard, virtual
 * portfolios carry no cash/Add-Position affordances, and the card grid still lays
 * out at both a desktop and a phone width.
 *
 * **Seeding goes through the gateway, not the mock.** `deploy/services.env`
 * routes `/api/portfolios` and `/api/labels` to the real `wallets` module, so a
 * row written to the example-service-mock never appears in the SPA. The SPA's session
 * token (issued by the mock OIDC issuer the gateway trusts) is reused for the
 * setup calls, which is why the token is fetched from the same mock-login the UI
 * uses. The compose stack is seeded with Top10 only, so each test creates its own
 * uniquely-named label and virtual rows — idempotent if the stack is not reset
 * between runs (`npm run test:e2e` resets it in `pretest`).
 */

const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"
const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"

async function login(page: Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

/** The bearer the SPA itself uses, issued by the mock OIDC issuer. */
async function token(): Promise<string> {
  const res = await fetch(`${MOCK}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "demo@example.com", password: "example-service-mock" }),
  })
  expect(res.status).toBe(200)
  return ((await res.json()) as { access_token?: string }).access_token ?? ""
}

function auth(t: string) {
  return { authorization: `Bearer ${t}` }
}

/**
 * Remove every virtual portfolio for the user. The layout assertions compare two
 * cards, so the collection has to hold exactly the two this test seeds — a
 * leftover row from an earlier run would move them into different grid rows and
 * turn a green test red for the wrong reason.
 */
async function clearVirtualPortfolios(request: APIRequestContext, t: string): Promise<void> {
  const rows = (await (
    await request.get(`${GATEWAY}/api/portfolios`, { headers: auth(t) })
  ).json()) as Array<{ id: string; isVirtual: boolean }>
  for (const row of rows.filter((p) => p.isVirtual)) {
    const res = await request.delete(`${GATEWAY}/api/portfolios/${row.id}`, { headers: auth(t) })
    expect(res.ok()).toBeTruthy()
  }
}

/** A real wallets label, because the dialog's selector is fed by GET /api/labels. */
async function seedLabel(request: APIRequestContext, t: string): Promise<{ id: string; name: string }> {
  const name = `E2E-Virtual-${Date.now()}-${Math.floor(Math.random() * 1e4)}`
  const res = await request.post(`${GATEWAY}/api/labels`, {
    headers: auth(t),
    data: { name, color: "#2563eb" },
  })
  expect(res.ok()).toBeTruthy()
  return { id: ((await res.json()) as { id: string }).id, name }
}

async function seedVirtualPortfolios(
  request: APIRequestContext,
  t: string,
  labelId: string,
  count: number,
): Promise<string[]> {
  const names: string[] = []
  for (let i = 0; i < count; i++) {
    const name = `Virtual ${Date.now()}-${i}-${Math.floor(Math.random() * 1e4)}`
    const res = await request.post(`${GATEWAY}/api/portfolios`, {
      headers: auth(t),
      data: { name, description: "Paper trade", currency: "USD", isVirtual: true, labelId, cashLegOnTrade: true },
    })
    expect(res.ok()).toBeTruthy()
    names.push(name)
  }
  return names
}

test("creates a virtual portfolio through the dialog and lists it on the virtual tab", async ({ page, request }) => {
  const t = await token()
  const label = await seedLabel(request, t)
  const name = `Dialog Virtual ${Date.now()}`

  await login(page)
  await page.getByRole("button", { name: "Create Investment Portfolio" }).click()
  const dialog = page.getByRole("dialog", { name: "Create portfolio" })
  await expect(dialog).toBeVisible()

  await dialog.getByRole("textbox", { name: "Name" }).fill(name)
  // Casual first: no label selector until Virtual is ticked.
  await expect(dialog.getByLabel("Instrument label")).toHaveCount(0)

  await dialog.getByTestId("portfolio-virtual").check()
  const labelSelect = dialog.getByLabel("Instrument label")
  await expect(labelSelect).toBeVisible()

  // A virtual portfolio cannot be created without an assigned label.
  const submit = dialog.getByRole("button", { name: "Create", exact: true })
  await expect(submit).toBeDisabled()
  await labelSelect.selectOption({ label: label.name })
  await expect(submit).toBeEnabled()

  await submit.click()
  await expect(dialog).toBeHidden()

  // The server forces the cash leg off for a virtual portfolio.
  const created = (await (
    await request.get(`${GATEWAY}/api/portfolios`, { headers: auth(t) })
  ).json()) as Array<{ name: string; isVirtual: boolean; cashLegOnTrade: boolean }>
  const row = created.find((p) => p.name === name)
  expect(row?.isVirtual).toBe(true)
  expect(row?.cashLegOnTrade).toBe(false)

  // It belongs to the virtual collection, not the investment list.
  await page.goto("/en/investments/virtual-portfolios")
  await expect(page.getByTestId("portfolio-card").filter({ hasText: name })).toHaveCount(1)
})

test.describe("§143 the two-tab page across viewports", () => {
  for (const vp of [
    { label: "desktop", width: 1280, height: 800 },
    { label: "mobile", width: 390, height: 844 },
  ] as const) {
    test(`separates investments from virtual portfolios and lays the cards out (${vp.label})`, async ({ page, request }) => {
      const t = await token()
      await clearVirtualPortfolios(request, t)
      const label = await seedLabel(request, t)
      const names = await seedVirtualPortfolios(request, t, label.id, 2)

      await page.setViewportSize({ width: vp.width, height: vp.height })
      await login(page)

      // Investment tab: its own heading, and none of the virtual rows.
      await expect(page.getByRole("heading", { name: "Investment Portfolios" })).toBeVisible()
      await expect(page.getByRole("heading", { name: "Virtual Portfolios" })).toHaveCount(0)
      for (const name of names) {
        await expect(page.getByTestId("portfolio-card").filter({ hasText: name })).toHaveCount(0)
      }

      // Switch collections through the strip, not a direct navigation.
      const strip = page.getByRole("navigation", { name: "Investment sections" })
      await strip.getByRole("link", { name: "Virtual Portfolios" }).click()
      await expect(page).toHaveURL(/\/en\/investments\/virtual-portfolios/)
      await expect(strip.getByRole("link", { name: "Virtual Portfolios" })).toHaveClass(/border-blue-600/)
      await expect(page.getByRole("heading", { name: "Virtual Portfolios" })).toBeVisible()
      await expect(page.getByRole("heading", { name: "Investment Portfolios" })).toHaveCount(0)

      for (const name of names) {
        const card = page.getByTestId("portfolio-card").filter({ hasText: name })
        await expect(card).toHaveCount(1)
        // The shared card, not a parallel implementation: it renders card-value.
        await expect(card.getByTestId("card-value")).toBeVisible({ timeout: 20_000 })
        // Virtual portfolios have no cash leg and take no new positions.
        await expect(card.getByTestId("card-add-position")).toHaveCount(0)
      }

      // The virtual tab hides the cash affordances entirely.
      await expect(page.getByText("Cash balance")).toHaveCount(0)
      await expect(page.getByRole("heading", { name: "Cash", exact: true })).toHaveCount(0)

      // Layout: desktop puts two cards on one row, mobile stacks them, and the
      // page never scrolls sideways at either width.
      const first = await page.getByTestId("portfolio-card").filter({ hasText: names[0] }).boundingBox()
      const second = await page.getByTestId("portfolio-card").filter({ hasText: names[1] }).boundingBox()
      expect(first).not.toBeNull()
      expect(second).not.toBeNull()
      if (vp.label === "desktop") {
        expect(Math.abs(second!.y - first!.y)).toBeLessThanOrEqual(1)
      } else {
        // Stacked: the lower card starts at or below the bottom of the upper one.
        expect(Math.abs(second!.y - first!.y)).toBeGreaterThanOrEqual(first!.height)
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `horizontal overflow at ${vp.width}px`).toBeLessThanOrEqual(1)
    })
  }
})
