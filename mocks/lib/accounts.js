// Known-account registry shared by the portfolio and charting mocks.
//
// The charting endpoints answer `coverage: "empty"` for a scope whose account
// ids match no known portfolio — that is a deliberate contract (a well-formed
// but foreign id must not silently return the seeded data). The set of "known"
// ids therefore has to be the portfolios the mock actually serves: the seeded
// Top10 (db-seed) plus anything created through `POST /api/portfolios`.
//
// Keeping this in one module means the portfolios and charting mocks agree on
// what "a real account" is without either re-implementing the other's data.

import { SEED_PORTFOLIO_ID } from "../db-seed/constants.mjs"

/** Ids the charting mock treats as real accounts. Seeded ids are always known. */
const known = new Set([SEED_PORTFOLIO_ID])

/** Register a portfolio id as known (called when the mock creates one). */
export function markPortfolioKnown(id) {
  if (id) known.add(id)
}

/** True when the id is a portfolio the mock serves (seeded or created). */
export function isKnownAccount(id) {
  return known.has(id)
}