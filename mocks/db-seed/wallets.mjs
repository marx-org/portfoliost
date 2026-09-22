/**
 * Seed: wallets schema — parity cash wallet + demo FX rates.
 * Ported from portfoliost-wallets/src/db/seed.ts (D76).
 * Idempotent: skips if any wallet already exists.
 * The demo FX rows go into instruments.fx_rates — §48 moved the FX store out
 * of the wallets schema (the real service drops wallets.fx_rates in 0004).
 */
import { SEED_USER_ID, SEED_WALLET_ID, DEMO_FX, DEMO_FX_DAYS, demoFxSchedule } from "./constants.mjs"

const SEED_TXS = [
  { type: "DEPOSIT",    amount:  2500,    daysAgo: 30, description: "Monthly transfer" },
  { type: "WITHDRAWAL", amount:  2883.4,  daysAgo: 21, description: "Buy EUR bonds" },
  { type: "DEPOSIT",    amount:  9583.4,  daysAgo: 12, description: "Salary deposit" },
  { type: "DEPOSIT",    amount:  2000,    daysAgo:  6, description: "Cash dividend income" },
  { type: "WITHDRAWAL", amount:  1200,    daysAgo:  2, description: "EUR transfer" },
]

function seededBalance() {
  return Math.round(SEED_TXS.reduce((s, t) => s + (t.type === "DEPOSIT" ? t.amount : -t.amount), 0) * 100) / 100
}

export async function seedWallets(sql) {
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM wallets.wallets`
  if (count > 0) {
    console.log(`[db-seed] wallets: ${count} row(s) already present, skipping`)
    return
  }

  // Demo FX bootstrap so currency selectors/valuations work before first real import.
  // §48: the table now lives in the instruments schema.
  // §48.5: a deterministic DEMO_FX_DAYS-day schedule (flat at the DEMO_FX
  // closes) so the chart's ?currency= conversion window has multi-day history.
  const rows = demoFxSchedule()
  const values = rows
    .map((r) => `('${r.rateDate}', '${r.currency}', ${r.rate.toFixed(10)}, 'demo')`)
    .join(", ")
  await sql.unsafe(
    `INSERT INTO instruments.fx_rates (rate_date, currency, rate, source)
     VALUES ${values}
     ON CONFLICT (rate_date, currency) DO NOTHING`,
  )
  console.log(
    `[db-seed] fx_rates: inserted ${rows.length} demo rows (${DEMO_FX_DAYS} days × ${Object.keys(DEMO_FX).length} currencies)`,
  )

  const balance = seededBalance()
  await sql.begin(async tx => {
    await tx`
      INSERT INTO wallets.wallets (id, user_id, name, currency, base_currency, balance, available_balance)
      VALUES (${SEED_WALLET_ID}, ${SEED_USER_ID}, ${"Portfel USD 1"}, ${"USD"}, ${"USD"},
              ${balance.toFixed(8)}, ${balance.toFixed(8)})
    `
    for (const t of SEED_TXS) {
      const when = new Date(Date.now() - t.daysAgo * 86_400_000)
      const dateOnly = when.toISOString().slice(0, 10)
      const signed = t.type === "DEPOSIT" ? t.amount : -t.amount
      await tx`
        INSERT INTO wallets.wallet_transactions
          (user_id, wallet_id, type, amount, currency, status, description,
           transaction_date, executed_at, created_at, updated_at)
        VALUES
          (${SEED_USER_ID}, ${SEED_WALLET_ID}, ${t.type}, ${signed.toFixed(8)}, ${"USD"},
           ${"completed"}, ${t.description}, ${dateOnly}, ${when}, ${when}, ${when})
      `
    }
  })
  console.log(`[db-seed] wallets: inserted wallet ${SEED_WALLET_ID} (balance=${balance}) + ${SEED_TXS.length} transactions`)
}
