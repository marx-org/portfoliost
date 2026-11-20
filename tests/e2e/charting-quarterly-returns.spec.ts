import { expect, test, type APIRequestContext } from "@playwright/test"
import { login } from "./helpers/login"

/**
 * Quarterly TWR and net-gain-change modes, end to end against the dockerized
 * stack (feature #253, sub-issue #274).
 *
 * Both modes share quarter boundaries and partial flags. The exact arithmetic
 * (deposit-only = 0 TWR; 100/100 -> 150/120 = 20% net-gain change; chained
 * quarterly TWR = annual index) is covered in wallets
 * \`performance.test.ts\`; this proves the route serves the quarterly dataset and
 * the shared Returns chart renders both modes.
 */

const GATEWAY = process.env.PORTFOLIOST_GATEWAY_URL || "http://localhost:8080"
const MOCK = process.env.PORTFOLIOST_MOCK_URL || "http://localhost:4010"

type Quarter = {
  quarter: string
  endingValue: number
  cumulativeNetContributions: number | null
  twr: number | null
  netGainChange: number | null
  partial: boolean
}
type Performance = { coverage: { status: string; generation: number }; quarterly: Quarter[] }

async function auth(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post(`${MOCK}/api/auth/login`, {
    data: { email: "demo@example.com", password: "example-service-mock" },
  })
  expect(res.status()).toBe(200)
  const token = ((await res.json()) as { access_token?: string }).access_token ?? ""
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

test("quarterly returns expose TWR and net-gain-change modes", async ({ page, request }) => {
  await login(page)
  const headers = await auth(request)

  const res = await request.get(`${GATEWAY}/api/portfolios/charting/performance`, { headers })
  expect(res.status(), await res.text()).toBe(200)
  const body = (await res.json()) as Performance
  expect(body.quarterly.length, JSON.stringify(body.coverage)).toBeGreaterThan(0)

  for (const q of body.quarterly) {
    expect(q.quarter).toMatch(/^\d{4}-Q[1-4]$/)
    expect(typeof q.endingValue).toBe("number")
    expect(q.twr === null || typeof q.twr === "number").toBe(true)
    expect(q.netGainChange === null || typeof q.netGainChange === "number").toBe(true)
    expect(typeof q.partial).toBe("boolean")
  }
  // The current calendar quarter is partial when it is present; a series that
  // starts mid-quarter also flags its first quarter (partial data, not a full
  // quarter). What must never happen is a full quarter marked complete.
  const now = new Date()
  const currentKey = `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`
  const current = body.quarterly.find((q) => q.quarter === currentKey)
  if (current) expect(current.partial).toBe(true)
  expect(body.quarterly.some((q) => q.partial), JSON.stringify(body.quarterly)).toBe(true)

  // The Charting page renders the shared Returns chart and the mode toggle.
  await page.goto("/en/charting/performance")
  const chart = page.getByTestId("charting-quarterly-returns")
  await expect(chart).toBeVisible()
  await page.getByTestId("charting-quarterly-returns-table-toggle").click()
  await expect(page.getByTestId("charting-quarterly-returns-table")).toBeVisible()
  await expect(page.getByTestId("charting-quarterly-returns-mode-net-gain")).toBeVisible()
  await page.getByTestId("charting-quarterly-returns-mode-net-gain").click()
  await expect(page.getByRole("heading", { name: /Quarterly Returns — Net-gain change/ })).toBeVisible()
  await expect(page.getByTestId("charting-toolbar")).toBeVisible()
})