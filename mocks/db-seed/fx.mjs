/**
 * Seed: demo FX rates into instruments.fx_rates (the store moved there in §48).
 * A deterministic DEMO_FX_DAYS-day schedule (flat at the DEMO_FX closes) ending
 * today, so the currency selectors, holdings/performance conversions and the
 * chart's ?currency= window have fresh, multi-day history before the first real
 * import. §62: split out of the deleted wallet seed so cash no longer needs it.
 * Idempotent: ON CONFLICT DO NOTHING.
 */
import { DEMO_FX, DEMO_FX_DAYS, demoFxSchedule } from "./constants.mjs"

export async function seedFx(sql) {
  const rows = demoFxSchedule()
  const values = rows.map((r) => `('${r.rateDate}', '${r.currency}', ${r.rate.toFixed(10)}, 'demo')`).join(", ")
  await sql.unsafe(
    `INSERT INTO instruments.fx_rates (rate_date, currency, rate, source)
     VALUES ${values}
     ON CONFLICT (rate_date, currency) DO NOTHING`,
  )
  console.log(`[db-seed] fx_rates: inserted ${rows.length} demo rows (${DEMO_FX_DAYS} days × ${Object.keys(DEMO_FX).length} currencies)`)
}
