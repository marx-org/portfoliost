import { expect, test, type Page } from "@playwright/test"

// §36 — an admin page was reachable only by clicking through the nav. A hard
// load of /en/admin/* ran the router guard before /auth/me had answered, read
// the unhydrated store as "not an admin" and bounced to /en/investments, so
// deep links, refreshes and bookmarks all landed on the dashboard.

async function login(page: Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\//)
}

test("a hard load of an admin deep link stays on that page", async ({ page }) => {
  await login(page)
  // page.goto is a full document load: no hydrated store, no client-side
  // navigation, exactly the case that used to bounce.
  await page.goto("/en/admin/jobs")

  await expect(page).toHaveURL(/\/en\/admin\/jobs/)
  // The Admin shell renders from the route alone; the job cards behind it need
  // headers this compose stack does not supply, so assert the shell.
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible()
})

test("a refresh on an admin page stays on that page", async ({ page }) => {
  await login(page)
  await page.goto("/en/admin/topology")
  await expect(page).toHaveURL(/\/en\/admin\/topology/)

  await page.reload()

  await expect(page).toHaveURL(/\/en\/admin\/topology/)
  await expect(page.getByTestId("topo-effects")).toBeVisible()
})

test("a non-admin deep link to an admin page is still bounced", async ({ page }) => {
  await login(page)
  // Only the admin is seeded in the mock, so strip the group off /auth/me to
  // produce a valid non-admin session. The guard must still refuse — the fix
  // waits for the answer, it does not wave everything through.
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    delete body.user.groups
    await route.fulfill({ response, json: body })
  })

  await page.goto("/en/admin/users")

  await expect(page).toHaveURL(/\/en\/investments/)
})

test("an anonymous admin deep link goes to login and comes back to the page", async ({ page }) => {
  await page.goto("/en/admin/jobs")
  await expect(page).toHaveURL(/\/login\?redirect=\/en\/admin\/jobs/)

  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()

  await expect(page).toHaveURL(/\/en\/admin\/jobs/)
})
