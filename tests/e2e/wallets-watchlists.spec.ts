import { expect, test } from "@playwright/test"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.getByTestId("email").fill("demo@example.com")
  await page.getByTestId("password").fill("example-service-mock")
  await page.getByTestId("signin").click()
  await expect(page).toHaveURL(/\/en\/investments/)
}

test("watchlists: create, add item, and remove item", async ({ page }) => {
  const name = `E2E Tech ${Date.now()}`
  await login(page)
  await page.goto("/en/investments/watchlist")

  await expect(page.getByRole("heading", { name: "Watchlists" })).toBeVisible()
  await page.getByRole("button", { name: "New watchlist" }).first().click()
  await page.getByRole("textbox", { name: "Name" }).fill(name)
  await page.getByRole("dialog", { name: "Create watchlist" }).getByRole("button", { name: "Create", exact: true }).click()

  const card = page.locator(".card", { hasText: name })
  await expect(card).toBeVisible()

  await card.getByLabel("Add symbol").fill("NVDA")
  await card.getByRole("button", { name: "Add", exact: true }).click()

  await expect(card.getByRole("link", { name: "NVDA" })).toBeVisible()
  await expect(card.getByText("NVIDIA")).toBeVisible()

  await card.getByRole("button", { name: "Remove" }).click()
  await expect(card.getByRole("link", { name: "NVDA" })).not.toBeVisible()
})

test("watchlists: rejects an unknown symbol", async ({ page }) => {
  const name = `E2E Validation ${Date.now()}`
  await login(page)
  await page.goto("/en/investments/watchlist")

  await page.getByRole("button", { name: "New watchlist" }).first().click()
  await page.getByRole("textbox", { name: "Name" }).fill(name)
  await page.getByRole("dialog", { name: "Create watchlist" }).getByRole("button", { name: "Create", exact: true }).click()

  const card = page.locator(".card", { hasText: name })
  await card.getByLabel("Add symbol").fill("ZZZZ")
  await card.getByRole("button", { name: "Add", exact: true }).click()

  await expect(card.getByText(/Unknown symbol ZZZZ/)).toBeVisible()
})

test("wallets: shows balance and deposits cash", async ({ page }) => {
  await login(page)
  await page.goto("/en/wallets")

  await expect(page.getByRole("heading", { name: "Wallets" })).toBeVisible()
  await expect(page.getByText("Total Balance")).toBeVisible()
  await expect(page.getByText("Portfel USD 1")).toBeVisible()

  await page.getByRole("button", { name: "Deposit" }).first().click()
  const dialog = page.getByRole("dialog", { name: "Cash movement" })
  await dialog.locator("#wc-amount").fill("100")
  await dialog.getByRole("button", { name: "Deposit", exact: true }).click()
  await expect(dialog).not.toBeVisible()

  await page.getByRole("button", { name: "Transactions" }).first().click()
  await expect(page.getByText("DEPOSIT").first()).toBeVisible()
})

test("wallets: creates a new wallet", async ({ page }) => {
  const name = `E2E Savings ${Date.now()}`
  await login(page)
  await page.goto("/en/wallets")

  await page.getByRole("button", { name: "New wallet" }).first().click()
  const dialog = page.getByRole("dialog", { name: "Create wallet" })
  await dialog.getByRole("textbox", { name: "Name" }).fill(name)
  await dialog.getByRole("button", { name: "Create" }).click()

  await expect(page.locator(".card", { hasText: name })).toBeVisible()
})

test("wallets: History opens wallet detail screen", async ({ page }) => {
  await login(page)

  await page.locator(".card", { hasText: "Portfel USD 1" }).first().getByRole("button", { name: "History", exact: true }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/wallets\/1a1f2d68-686c-4f8b-ba34-a67846163275/)

  await expect(page.getByRole("heading", { name: "Portfel USD 1" })).toBeVisible()
  await expect(page.getByText("Balance", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("Available", { exact: true })).toBeVisible()
  await expect(page.getByText("Currency", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Deposit", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Transfer", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Withdraw", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Delete wallet" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Balance History" })).toBeVisible()
  await expect(page.getByRole("button", { name: "1W" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Recent Transactions" })).toBeVisible()

  await page.getByRole("button", { name: "Go back" }).click()
  await expect(page).toHaveURL(/\/en\/investments/)
})

test("wallets: wallet detail recent transactions support edit and delete with confirmation", async ({ page }) => {
  await login(page)

  // Self-contained (plan §48.4b): the test creates its own wallet and its own
  // transactions instead of mutating the seed wallet's ledger — other specs
  // deposit into the shared seed wallet, which pushes the seeded rows out of
  // the bounded Recent-transactions list (default limit 10).
  const ts = Date.now()
  const walletName = `E2E Ledger ${ts}`
  const salaryDesc = `E2E salary ${ts}`
  const bondDesc = `E2E bond buy ${ts}`

  await page.goto("/en/wallets")
  await page.getByRole("button", { name: "New wallet" }).first().click()
  const createDialog = page.getByRole("dialog", { name: "Create wallet" })
  await createDialog.getByRole("textbox", { name: "Name" }).fill(walletName)
  await createDialog.getByRole("button", { name: "Create" }).click()
  await expect(createDialog).not.toBeVisible()

  const card = page.locator(".card").filter({ hasText: walletName })
  for (const [amount, desc] of [
    ["250", salaryDesc],
    ["100", bondDesc],
  ] as const) {
    await card.getByRole("button", { name: "Deposit", exact: true }).click()
    const cash = page.getByRole("dialog", { name: "Cash movement" })
    await cash.locator("#wc-amount").fill(amount)
    await cash.getByLabel("Description").fill(desc)
    await cash.getByRole("button", { name: "Deposit", exact: true }).click()
    await expect(cash).not.toBeVisible()
  }

  // Open the wallet detail (Recent Transactions) from the investments page.
  await page.goto("/en/investments")
  await page.locator(".card", { hasText: walletName }).getByRole("button", { name: "History", exact: true }).first().click()
  await expect(page).toHaveURL(/\/en\/portfolios\/wallets\/.*/)

  await expect(page.getByRole("button", { name: "Edit transaction" }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: "Delete transaction" }).first()).toBeVisible()

  const editRow = page.locator("tbody tr", { hasText: salaryDesc }).first()
  await editRow.getByRole("button", { name: "Edit transaction" }).click()
  const editDialog = page.getByRole("dialog", { name: "Edit transaction" })
  await expect(editDialog).toBeVisible()
  await editDialog.getByLabel("Description").fill(`${salaryDesc} edited`)
  await editDialog.getByRole("button", { name: "Update Transaction" }).click()
  await expect(page.getByText("Transaction updated")).toBeVisible()
  await expect(page.locator("tbody tr", { hasText: `${salaryDesc} edited` })).toBeVisible()

  const deleteRow = page.locator("tbody tr", { hasText: bondDesc }).first()
  await deleteRow.getByRole("button", { name: "Delete transaction" }).click()
  const confirm = page.getByRole("dialog", { name: "Delete transaction" })
  await expect(confirm).toBeVisible()
  await confirm.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(page.getByText("Transaction deleted")).toBeVisible()
  await expect(page.locator("tbody tr", { hasText: bondDesc })).toHaveCount(0)
})

test("wallets: clicking the wallet card opens wallet detail screen", async ({ page }) => {
  await login(page)

  await page.locator(".card", { hasText: "Portfel USD 1" }).first().click()
  await expect(page).toHaveURL(/\/en\/portfolios\/wallets\/1a1f2d68-686c-4f8b-ba34-a67846163275/)
})

test("wallets: delete is blocked for a wallet with transactions and redirected to the wallets page", async ({ page }) => {
  await login(page)

  await page.locator(".card", { hasText: "Portfel USD 1" }).first().getByRole("button", { name: "History", exact: true }).click()
  await expect(page).toHaveURL(/\/en\/portfolios\/wallets\/1a1f2d68-686c-4f8b-ba34-a67846163275/)

  await page.getByRole("button", { name: "Delete wallet" }).click()
  const confirm = page.getByRole("dialog", { name: "Delete wallet" })
  await expect(confirm).toBeVisible()
  await confirm.getByRole("button", { name: "Delete", exact: true }).click()

  await expect(page).toHaveURL(/\/en\/wallets/)
  await expect(page.getByText(/Cannot delete|has transactions|was not deleted/)).toBeVisible()
  await expect(page.locator(".card", { hasText: "Portfel USD 1" })).toBeVisible()
})

test("wallets: a wallet without transactions can be deleted", async ({ page }) => {
  const name = `E2E Deletable ${Date.now()}`
  await login(page)
  await page.goto("/en/wallets")

  await page.getByRole("button", { name: "New wallet" }).first().click()
  const createDialog = page.getByRole("dialog", { name: "Create wallet" })
  await createDialog.getByRole("textbox", { name: "Name" }).fill(name)
  await createDialog.getByRole("button", { name: "Create" }).click()
  await expect(page.locator(".card", { hasText: name })).toBeVisible()

  await page.goto("/en/investments")
  await page.locator(".card", { hasText: name }).getByRole("button", { name: "History", exact: true }).first().click()
  await expect(page).toHaveURL(/\/en\/portfolios\/wallets\/.*/)

  await page.getByRole("button", { name: "Delete wallet" }).click()
  const confirm = page.getByRole("dialog", { name: "Delete wallet" })
  await confirm.getByRole("button", { name: "Delete", exact: true }).click()

  await expect(page).toHaveURL(/\/en\/investments/)
  await page.goto("/en/wallets")
  await expect(page.locator(".card", { hasText: name })).toHaveCount(0)
})
