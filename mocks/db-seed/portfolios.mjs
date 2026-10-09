/**
 * Seed: portfolios schema — Top10 portfolio + share + positions + transactions.
 * Ported from portfoliost-wallets/src/db/portfolio-seed.ts (D76).
 * Idempotent: skips if any portfolio already exists.
 */
import {
  SEED_USER_ID, SEED_PORTFOLIO_ID, SEED_SHARE_ID,
  SEED_POSITIONS, SEED_TRANSACTIONS, SEED_SHARE_PRIVACY,
} from "./constants.mjs"

function seededTotalInvested() {
  return Math.round(SEED_TRANSACTIONS.reduce((s, t) => s + t.totalAmount, 0) * 100) / 100
}

// Daily value snapshots for Top10 so the REAL wallets /portfolios/merged and
// /:id/analytics routes serve a non-empty series in e2e (§46.4, §75.1). The
// analytics routes report "pending" — and answer with an EMPTY series — for any
// portfolio holding <2 snapshot rows, so without this the combined chart never
// renders. Since §72.7 (wallets, 2026-09-28) a GET no longer backfills, so the
// seed is the only thing that can supply the history.
//
// The window is anchored to TODAY, 48 daily rows ending today. It used to be a
// hardcoded 2026-08-01…2026-09-18, which was already 11 days stale when §75
// found it and would eventually slide out of the 1Y timeframe the specs query —
// the same rot `reset-mock-state.sh` calls out for pricebars-sim. The seeded
// transactions stay at 2026-08-02; a history starting after the funding date is
// consistent, and it is what makes the "n >= 2" check resolve complete.
//
// Deterministic: ~6% growth over the window with a gentle wobble (no randomness).
function seededSnapshots(totalInvested, now = new Date()) {
  const rows = []
  const invested = Math.round(totalInvested * 100) / 100
  const windowDays = 48
  // UTC midnight of today, so the row dates do not shift with the runner's TZ.
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const start = end - windowDays * 86400000
  for (let t = start; t <= end; t += 86400000) {
    const elapsed = Math.round((t - start) / 86400000)
    const growth = 1 + 0.06 * (elapsed / windowDays) + 0.004 * (elapsed % 7)
    const iso = new Date(t).toISOString().slice(0, 10)
    rows.push({
      snapshotDate: iso,
      value: (invested * growth).toFixed(8),
      invested: invested.toFixed(8),
    })
  }
  return rows
}

export async function seedPortfolios(sql) {
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM portfolios.portfolios`
  if (count > 0) {
    console.log(`[db-seed] portfolios: ${count} row(s) already present, skipping`)
    return
  }

  const totalInvested = seededTotalInvested()
  const snapshots = seededSnapshots(totalInvested)
  if (snapshots.length === 0) {
    // §75.2 — a fixture that seeds nothing must fail loudly. This exact class of
    // silent no-op shipped once already: the insert loop iterated an empty array
    // while the log line printed the *generated* count, so the seed reported
    // "48 snapshots" and inserted none.
    throw new Error("seededSnapshots() produced no rows — refusing to seed a portfolio with no snapshot history")
  }
  const createdAt = "2026-08-01T10:14:16.111Z"
  const updatedAt = "2026-08-02T08:57:38.461Z"
  const txExecutedAt = "2026-08-02T00:00:00.000Z"
  const posOpenedAt = "2026-08-02T00:00:00.000Z"
  let insertedSnapshots = 0

  await sql.begin(async tx => {
    // Portfolio (wallet entity dropped in §62.2 — no wallet_id / currency column;
    // strategy / type / margin rates dropped in #113)
    await tx`
      INSERT INTO portfolios.portfolios
        (id, user_id, name, description, base_currency,
         total_invested, current_value, is_public, is_margin_enabled,
         created_at, updated_at)
      VALUES
        (${SEED_PORTFOLIO_ID}, ${SEED_USER_ID}, ${"Top10"},
         ${"Top10 big US stocks with best ghrowth potential, rebalanced monthly"},
         ${"USD"},
         ${totalInvested.toFixed(8)}, ${totalInvested.toFixed(8)},
         false, false, ${createdAt}, ${updatedAt})
    `

    // Shared link (parity with mock seeded share for Top10)
    await tx`
      INSERT INTO portfolios.shares
        (id, user_id, portfolio_id, display_name, view_count, expires_at,
         privacy_settings, created_at, updated_at)
      VALUES
        (${SEED_SHARE_ID}, ${SEED_USER_ID}, ${SEED_PORTFOLIO_ID}, ${""}, ${0}, ${null},
         ${SEED_SHARE_PRIVACY}::jsonb, ${createdAt}, ${updatedAt})
    `

    // Positions (#115). Ownership is the many-to-many position_portfolios
    // membership, so positions no longer carry portfolio_id; the loop writes the
    // membership row alongside each position.
    for (const pos of SEED_POSITIONS) {
      await tx`
        INSERT INTO portfolios.positions
          (id, user_id, symbol, company_name, asset_type,
           quantity, average_cost_basis, instrument_currency, purchase_currency,
           sector, industry, country, is_open, opened_at, created_at, updated_at)
        VALUES
          (${pos.id}, ${SEED_USER_ID}, ${pos.symbol},
           ${pos.companyName}, ${"STOCK"},
           ${pos.quantity.toFixed(8)}, ${pos.averageCostBasis.toFixed(8)},
           ${pos.instrumentCurrency ?? "USD"}, ${pos.instrumentCurrency ?? "USD"}, ${pos.sector}, ${pos.industry}, ${pos.country},
           true, ${posOpenedAt}, ${createdAt}, ${updatedAt})
      `
      await tx`
        INSERT INTO portfolios.position_portfolios (position_id, portfolio_id)
        VALUES (${pos.id}, ${SEED_PORTFOLIO_ID})
      `
    }

    // Transactions (all BUYs) — no wallet_id column (§62.2)
    for (const t of SEED_TRANSACTIONS) {
      await tx`
        INSERT INTO portfolios.transactions
          (id, user_id, portfolio_id, position_id, type,
           instrument_symbol, instrument_name, sector, country,
           quantity, price, currency, instrument_currency, asset_type,
           fees, total_amount, exchange_rate, rate_source, fee_rate_source,
           is_gift, synthesized_opening_lot, executed_at, created_at, updated_at)
        VALUES
          (${t.id}, ${SEED_USER_ID}, ${SEED_PORTFOLIO_ID}, ${t.positionId},
           ${"BUY"}, ${t.instrumentSymbol}, ${t.instrumentName},
           ${t.sector}, ${t.country},
           ${t.quantity.toFixed(8)}, ${t.price.toFixed(8)}, ${t.instrumentCurrency ?? "USD"}, ${t.instrumentCurrency ?? "USD"}, ${"STOCK"},
           ${"0"}, ${t.totalAmount.toFixed(8)}, ${"1"}, ${"automatic"}, ${"automatic"},
           false, false, ${txExecutedAt}, ${createdAt}, ${updatedAt})
      `
    }

    // Opening cash deposit: the seeded BUYs spend the portfolio's cash, so seed
    // a funding DEPOSIT covering the buy total (minus a positive remainder). The
    // cash ledger is derived by replay — a DEPOSIT row makes Top10 cash positive
    // (otherwise it is -totalInvested, which is meaningless for a funded book).
    await tx`
      INSERT INTO portfolios.portfolio_cash_transactions
        (user_id, portfolio_id, type, amount, currency, description, transaction_date, rate_source)
      VALUES
        (${SEED_USER_ID}, ${SEED_PORTFOLIO_ID}, ${"DEPOSIT"},
         ${(totalInvested + 5000).toFixed(8)}, ${"USD"},
         ${"Opening funding"}, ${"2026-08-01"}, ${"automatic"})
    `

    // Value snapshots — the wallets analytics routes need ≥2 rows per portfolio
    // to resolve "complete" instead of firing a backfill (§46.4, §75.2). This
    // loop used to iterate `snapshots.length ? [] : []`, i.e. nothing: the seed
    // inserted zero rows and only §72.7's removal of the GET-side backfill made
    // that visible.
    for (const s of snapshots) {
      await tx`
        INSERT INTO portfolios.value_snapshots
          (portfolio_id, snapshot_date, value, invested, net_flow)
        VALUES
          (${SEED_PORTFOLIO_ID}, ${s.snapshotDate}, ${s.value}, ${s.invested}, ${"0"})
      `
    }
    insertedSnapshots = snapshots.length
  })
  console.log(`[db-seed] portfolios: inserted Top10 portfolio, ${SEED_POSITIONS.length} positions, ${SEED_TRANSACTIONS.length} transactions, ${insertedSnapshots} snapshots (${snapshots[0].snapshotDate}…${snapshots[snapshots.length - 1].snapshotDate})`)
}
