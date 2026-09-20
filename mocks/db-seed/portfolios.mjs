/**
 * Seed: portfolios schema — Top10 portfolio + share + positions + transactions.
 * Ported from portfoliost-wallets/src/db/portfolio-seed.ts (D76).
 * Idempotent: skips if any portfolio already exists.
 */
import {
  SEED_USER_ID, SEED_WALLET_ID, SEED_PORTFOLIO_ID, SEED_SHARE_ID,
  SEED_POSITIONS, SEED_TRANSACTIONS, SEED_SHARE_PRIVACY,
} from "./constants.mjs"

function seededTotalInvested() {
  return Math.round(SEED_TRANSACTIONS.reduce((s, t) => s + t.totalAmount, 0) * 100) / 100
}

export async function seedPortfolios(sql) {
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM portfolios.portfolios`
  if (count > 0) {
    console.log(`[db-seed] portfolios: ${count} row(s) already present, skipping`)
    return
  }

  const totalInvested = seededTotalInvested()
  const createdAt = "2026-08-01T10:14:16.111Z"
  const updatedAt = "2026-08-02T08:57:38.461Z"
  const txExecutedAt = "2026-08-02T00:00:00.000Z"
  const posOpenedAt = "2026-08-02T00:00:00.000Z"

  await sql.begin(async tx => {
    // Portfolio
    await tx`
      INSERT INTO portfolios.portfolios
        (id, user_id, name, description, strategy, type, currency, base_currency,
         wallet_id, total_invested, current_value, is_public, is_margin_enabled,
         margin_rate, maintenance_margin_rate, created_at, updated_at)
      VALUES
        (${SEED_PORTFOLIO_ID}, ${SEED_USER_ID}, ${"Top10"},
         ${"Top10 big US stocks with best ghrowth potential, rebalanced monthly"},
         ${"GROWTH"}, ${"regular"}, ${"USD"}, ${"USD"}, ${SEED_WALLET_ID},
         ${totalInvested.toFixed(8)}, ${totalInvested.toFixed(8)},
         false, false, ${"0.5000"}, ${"0.2500"}, ${createdAt}, ${updatedAt})
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

    // Positions
    for (const pos of SEED_POSITIONS) {
      await tx`
        INSERT INTO portfolios.positions
          (id, user_id, portfolio_id, symbol, company_name, asset_type,
           quantity, average_cost_basis, instrument_currency, purchase_currency,
           sector, industry, country, is_open, opened_at, created_at, updated_at)
        VALUES
          (${pos.id}, ${SEED_USER_ID}, ${SEED_PORTFOLIO_ID}, ${pos.symbol},
           ${pos.companyName}, ${"STOCK"},
           ${pos.quantity.toFixed(8)}, ${pos.averageCostBasis.toFixed(8)},
           ${pos.instrumentCurrency ?? "USD"}, ${pos.instrumentCurrency ?? "USD"}, ${pos.sector}, ${pos.industry}, ${pos.country},
           true, ${posOpenedAt}, ${createdAt}, ${updatedAt})
      `
    }

    // Transactions (all BUYs)
    for (const t of SEED_TRANSACTIONS) {
      await tx`
        INSERT INTO portfolios.transactions
          (id, user_id, portfolio_id, position_id, wallet_id, type,
           instrument_symbol, instrument_name, sector, country,
           quantity, price, currency, instrument_currency, asset_type,
           fees, total_amount, exchange_rate, rate_source, fee_rate_source,
           is_gift, synthesized_opening_lot, executed_at, created_at, updated_at)
        VALUES
          (${t.id}, ${SEED_USER_ID}, ${SEED_PORTFOLIO_ID}, ${t.positionId},
           ${SEED_WALLET_ID}, ${"BUY"}, ${t.instrumentSymbol}, ${t.instrumentName},
           ${t.sector}, ${t.country},
           ${t.quantity.toFixed(8)}, ${t.price.toFixed(8)}, ${t.instrumentCurrency ?? "USD"}, ${t.instrumentCurrency ?? "USD"}, ${"STOCK"},
           ${"0"}, ${t.totalAmount.toFixed(8)}, ${"1"}, ${"automatic"}, ${"automatic"},
           false, false, ${txExecutedAt}, ${createdAt}, ${updatedAt})
      `
    }
  })
  console.log(`[db-seed] portfolios: inserted Top10 portfolio, ${SEED_POSITIONS.length} positions, ${SEED_TRANSACTIONS.length} transactions`)
}
