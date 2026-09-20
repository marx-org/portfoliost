/**
 * mock-db-seed entry point (D76).
 * Runs after all module containers report healthy (schema guaranteed).
 * Order: FX + wallet → portfolio (FK on wallet) → user prefs → ticker reference.
 */
import postgres from "postgres"
import { seedWallets } from "./wallets.mjs"
import { seedPortfolios } from "./portfolios.mjs"
import { seedUserPreferences } from "./user-preferences.mjs"
import { seedTickerReference } from "./ticker-reference.mjs"
import { seedOpenstNoPriceBonds } from "./openst.mjs"

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://portfoliost:portfoliost@localhost:5432/portfoliost"

const SEED_PORTFOLIOS = process.env.SEED_PORTFOLIOS !== "false"

const sql = postgres(DATABASE_URL, { max: 3 })

try {
  console.log("[db-seed] starting")

  await seedWallets(sql)

  if (SEED_PORTFOLIOS) {
    await seedPortfolios(sql)
  } else {
    console.log("[db-seed] portfolios: SEED_PORTFOLIOS=false, skipping")
  }

  await seedUserPreferences(sql)
  await seedTickerReference(sql)
  await seedOpenstNoPriceBonds(sql)

  console.log("[db-seed] done")
} catch (err) {
  console.error("[db-seed] failed:", err)
  process.exit(1)
} finally {
  await sql.end()
}
