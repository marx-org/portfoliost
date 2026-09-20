/**
 * Seed: openst savings-bond rows for the deterministic plan-34 compose smoke.
 * The full portfoliost stack reuses the shared compose Postgres, but openst
 * normally fills `openst.bond_series` / `openst.cpi_12m` from the live importers.
 * This seed gives the obligacje engine one priceable ROD emission plus enough
 * 12m-CPI history to compute a current quote for ROD1033 without network I/O.
 */
function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

function monthEnd(year, month) {
  return new Date(Date.UTC(year, month + 1, 0))
}

export async function seedOpenstNoPriceBonds(sql) {
  const now = new Date()
  const issue = new Date(Date.UTC(now.getUTCFullYear() - 3, now.getUTCMonth(), now.getUTCDate()))
  const maturity = new Date(Date.UTC(issue.getUTCFullYear() + 10, issue.getUTCMonth(), issue.getUTCDate()))

  await sql.unsafe(
    `
      INSERT INTO openst.bond_series
        (symbol, name, series_code, issue_date, maturity_date, term_months,
         rate_rule, margin, fee_b, nominal)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (symbol) DO UPDATE SET
        name = EXCLUDED.name,
        series_code = EXCLUDED.series_code,
        issue_date = EXCLUDED.issue_date,
        maturity_date = EXCLUDED.maturity_date,
        term_months = EXCLUDED.term_months,
        rate_rule = EXCLUDED.rate_rule,
        margin = EXCLUDED.margin,
        fee_b = EXCLUDED.fee_b,
        nominal = EXCLUDED.nominal
    `,
    [
      "ROD1033",
      "Obligacja oszczędnościowa ROD 2033",
      "ROD",
      isoDate(issue),
      isoDate(maturity),
      120,
      "cpi_12m+margin",
      2.0,
      2.0,
      100.0,
    ],
  )

  const cpiRows = []
  for (let i = 59; i >= 0; i--) {
    const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    cpiRows.push([isoDate(monthEnd(anchor.getUTCFullYear(), anchor.getUTCMonth())), 3.5])
  }
  const clause = cpiRows.map((_, i) => `($${i * 2 + 1},$${i * 2 + 2})`).join(",")
  await sql.unsafe(
    `
      INSERT INTO openst.cpi_12m (date, value)
      VALUES ${clause}
      ON CONFLICT (date) DO NOTHING
    `,
    cpiRows.flat(),
  )

  console.log(`[db-seed] openst: ROD1033 bond series + ${cpiRows.length} CPI rows seeded`)
}
