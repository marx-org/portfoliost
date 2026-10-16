/**
 * Seed: instruments.ticker_reference + exchange_reference from bundled CSVs.
 * Ported from portfoliost-instruments/src/scripts/tickerref-sync.ts (D76).
 * Gated by row-count check (same semantics as --if-empty).
 * Inserts in 500-row batches with ON CONFLICT DO UPDATE.
 */
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const BATCH_SIZE = 500

/** Minimal RFC4180 CSV row parser (quoted fields, escaped quotes, CRLF). */
function parseCsvLine(line) {
  const out = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else { inQuotes = false }
      } else { cur += ch }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      out.push(cur); cur = ""
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function parseCsv(csv) {
  const lines = csv.split(/\r?\n/).filter(l => l.length > 0)
  if (lines.length === 0) return []
  const header = parseCsvLine(lines[0])
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line)
    const row = {}
    header.forEach((h, i) => { row[h] = values[i] ?? "" })
    return row
  })
}

function parseMicSuffixes(csv) {
  return parseCsv(csv)
    .filter(r => r.operating_mic)
    .map(r => ({ operatingMic: r.operating_mic, yahooSuffix: r.yahoo_suffix || null }))
}

/**
 * Builds `($1,$2,...),($3,...)` VALUES clause + flattened params for multi-row
 * inserts. Avoids postgres.js's ${sql(rows)} value fragment, which mis-treats
 * nested arrays as identifiers in 3.4.x releases (crashes on escape callback).
 */
function multiValues(rows) {
  const colCount = rows[0].length
  const clause = rows
    .map((_, i) => {
      const start = i * colCount + 1
      return `(${Array.from({ length: colCount }, (_, j) => `$${start + j}`).join(",")})`
    })
    .join(",")
  return { clause, params: rows.flat() }
}

export async function seedTickerReference(sql) {
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM instruments.ticker_reference`
  if (count > 0) {
    console.log(`[db-seed] ticker_reference: ${count} rows already present, skipping`)
  } else {
    const csvPath = resolve(__dirname, "instruments/ticker_reference.csv")
    const csv = await readFile(csvPath, "utf8")
    const rows = parseCsv(csv)
    let total = 0
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE).filter(r => r.listing_key && r.ticker)
      if (batch.length === 0) continue
      const { clause, params } = multiValues(batch.map(r => [
        r.listing_key,
        r.ticker.toUpperCase(),
        r.exchange,
        r.name,
        r.asset_type,
        r.stock_sector || null,
        r.etf_category || null,
        r.country || null,
        r.country_code || null,
        r.isin || null,
        r.aliases || null,
      ]))
      await sql.unsafe(`
        INSERT INTO instruments.ticker_reference
          (listing_key, ticker, exchange, name, asset_type, stock_sector, etf_category,
           country, country_code, isin, aliases)
        SELECT * FROM (VALUES ${clause})
          AS t(listing_key, ticker, exchange, name, asset_type, stock_sector,
            etf_category, country, country_code, isin, aliases)
        ON CONFLICT (listing_key) DO UPDATE SET
          ticker = EXCLUDED.ticker,
          exchange = EXCLUDED.exchange,
          name = EXCLUDED.name,
          asset_type = EXCLUDED.asset_type,
          stock_sector = EXCLUDED.stock_sector,
          etf_category = EXCLUDED.etf_category,
          country = EXCLUDED.country,
          country_code = EXCLUDED.country_code,
          isin = EXCLUDED.isin,
          aliases = EXCLUDED.aliases,
          updated_at = now()
      `, params)
      total += batch.length
    }
    console.log(`[db-seed] ticker_reference: inserted ${total} tickers`)
  }

  // Exchange reference
  const [{ exCount }] = await sql`SELECT count(*)::int AS "exCount" FROM instruments.exchange_reference`
  if (exCount > 0) {
    console.log(`[db-seed] exchange_reference: ${exCount} rows already present, skipping`)
    return
  }
  const venuesCsv = await readFile(resolve(__dirname, "instruments/venues.csv"), "utf8")
  const micCsv = await readFile(resolve(__dirname, "instruments/mic_yahoo_suffixes.csv"), "utf8")
  const suffixByMic = new Map(parseMicSuffixes(micCsv).map(r => [r.operatingMic, r.yahooSuffix]))
  const venues = parseCsv(venuesCsv).filter(v => v.exchange_code)
  if (venues.length === 0) return

  const { clause: vClause, params: vParams } = multiValues(venues.map(v => [
      v.exchange_code.toUpperCase(),
      v.operating_mic || null,
      v.canonical_name || null,
      v.country_code || null,
      suffixByMic.get((v.operating_mic || "").toUpperCase()) ?? null,
    ]))
  await sql.unsafe(`
    INSERT INTO instruments.exchange_reference
      (exchange_code, operating_mic, canonical_name, country_code, yahoo_suffix)
    SELECT * FROM (VALUES ${vClause})
      AS t(exchange_code, operating_mic, canonical_name, country_code, yahoo_suffix)
    ON CONFLICT (exchange_code) DO UPDATE SET
      operating_mic = EXCLUDED.operating_mic,
      canonical_name = EXCLUDED.canonical_name,
      country_code = EXCLUDED.country_code,
      yahoo_suffix = EXCLUDED.yahoo_suffix,
      updated_at = now()
  `, vParams)
  console.log(`[db-seed] exchange_reference: inserted ${venues.length} exchanges`)
}

/**
 * Seed: a handful of analizy.pl fund-category rows into instruments.ticker_reference.
 *
 * The full 734-code catalogue is a live snapshot that the instruments service
 * syncs from cachest in the cluster, but the local compose stack has no live
 * upstream and the main ticker_reference seed skips once the table is non-empty
 * (reset-mock-state.sh keeps the 62k reference rows across runs, so nothing ever
 * re-seeds). A fund category is recognised ONLY by its `ANALIZY::` listing key —
 * there is no symbol-shape test for it (a category code is indistinguishable from
 * a dotless corp-bond code) — so without a row the §78 research page 404s and
 * the Key Facts card never renders. This fixture seeds a representative set of
 * real codes (the ING01 family the class-W build exists for, plus one per other
 * prefix) so the fund-category profile and its `categoryCode` are exercised
 * locally. Unconditional: the seed must land on both the fresh-bootstrap and the
 * reset-mock-state paths, so it upserts rather than being gated on an empty table.
 */
export async function seedFundCatalogue(sql) {
  const csvPath = resolve(__dirname, "instruments/fund-catalogue.csv")
  const csv = await readFile(csvPath, "utf8")
  const rows = parseCsv(csv).filter((r) => r.listing_key && r.ticker && r.exchange)
  if (rows.length === 0) {
    console.log("[db-seed] fund catalogue: fixture empty, skipping")
    return
  }
  let total = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { clause, params } = multiValues(batch.map((r) => [
      r.listing_key,
      r.ticker,
      r.exchange,
      r.name,
      r.asset_type,
      r.stock_sector || null,
      r.etf_category || null,
      r.country || null,
      r.country_code || null,
      r.isin || null,
      r.aliases || null,
    ]))
    await sql.unsafe(`
      INSERT INTO instruments.ticker_reference
        (listing_key, ticker, exchange, name, asset_type, stock_sector, etf_category,
         country, country_code, isin, aliases)
      SELECT * FROM (VALUES ${clause})
        AS t(listing_key, ticker, exchange, name, asset_type, stock_sector,
          etf_category, country, country_code, isin, aliases)
      ON CONFLICT (listing_key) DO UPDATE SET
        ticker = EXCLUDED.ticker,
        exchange = EXCLUDED.exchange,
        name = EXCLUDED.name,
        asset_type = EXCLUDED.asset_type,
        country = EXCLUDED.country,
        country_code = EXCLUDED.country_code,
        updated_at = now()
    `, params)
    total += batch.length
  }
  console.log(`[db-seed] fund catalogue: upserted ${total} ANALIZY fund-category rows`)
}
