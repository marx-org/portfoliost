#!/usr/bin/env node
// Compose-level test for pfire-docs#98 — "Unit and compose tests cover sync
// merge, conflict handling, and resolver precedence."
//
// The instruments module has no compose stack of its own; the compose stack it
// runs in is portfoliost's, where the container is already built and owns the
// migration. So this script runs its assertions INSIDE the running
// `instruments` container, against the real live Postgres — the only place the
// curated-override table, the shipping sync function and the shipping resolver
// are all wired the way production wires them.
//
// Run from the host with the stack up:
//   docker compose up -d --build instruments
//   npm run test:stack:listing-overrides
//
// The host branch streams this same file over stdin into the container
// (`node --input-type=module -`), which re-executes it with the in-container
// flag set. Absolute `/app/dist` imports mirror the container's build layout.

const IN_CONTAINER = process.env.LISTING_OVERRIDES_IN_CONTAINER === "1"

if (!IN_CONTAINER) {
  const { spawnSync } = await import("node:child_process")
  const { readFileSync } = await import("node:fs")
  const { fileURLToPath } = await import("node:url")
  const { dirname, resolve } = await import("node:path")

  const self = fileURLToPath(import.meta.url)
  const composeDir = resolve(dirname(self), "..")
  const code = readFileSync(self)
  const result = spawnSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "-e",
      "LISTING_OVERRIDES_IN_CONTAINER=1",
      "instruments",
      "node",
      "--input-type=module",
      "-",
    ],
    { cwd: composeDir, input: code, stdio: ["pipe", "inherit", "inherit"] },
  )
  process.exit(result.status ?? 1)
}

const { eq, sql } = await import("drizzle-orm")
const { getDb, closeDb } = await import("/app/dist/db/index.js")
const { curatedListingOverrides, tickerReference } = await import("/app/dist/db/schema.js")
const { syncCuratedListingOverrides } = await import("/app/dist/scripts/tickerref-sync.js")
const { resolveCurrency, resolveInstrumentCurrency } = await import(
  "/app/dist/services/instrument-currency.js"
)
const { CURATED_LISTING_OVERRIDES, CURATED_LISTING_OVERRIDES_VERSION } = await import(
  "/app/dist/data/curated-listing-overrides.js"
)

let failures = 0
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.error(`  fail ${name}${detail ? ` — ${detail}` : ""}`)
  }
}
const eqDeep = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const db = getDb()

// ── sync merge ───────────────────────────────────────────────────────────────
// The curated source is re-applied on every run; running twice must converge,
// not duplicate, and must leave upstream ticker_reference untouched.
const upstreamBefore = (await db.select({ c: sql`count(*)::int` }).from(tickerReference))[0].c
const mfcTsxBefore = (
  await db
    .select()
    .from(tickerReference)
    .where(eq(tickerReference.listingKey, "TSX::MFC"))
)[0]

await syncCuratedListingOverrides(db)
await syncCuratedListingOverrides(db)

const overrideRows = await db.select().from(curatedListingOverrides)
check(
  "sync merge is idempotent",
  overrideRows.length === CURATED_LISTING_OVERRIDES.length,
  `expected ${CURATED_LISTING_OVERRIDES.length} rows, got ${overrideRows.length}`,
)

const mfcOverride = overrideRows.find((r) => r.listingKey === "NYSE::MFC")
check("curated MFC/NYSE/USD row is persisted", mfcOverride?.quoteCurrency === "USD")
check(
  "override carries versioned provenance",
  mfcOverride?.sourceVersion === CURATED_LISTING_OVERRIDES_VERSION &&
    Boolean(mfcOverride?.rationale) &&
    Boolean(mfcOverride?.provenance),
  `sourceVersion=${mfcOverride?.sourceVersion}`,
)

const upstreamAfter = (await db.select({ c: sql`count(*)::int` }).from(tickerReference))[0].c
const mfcTsxAfter = (
  await db
    .select()
    .from(tickerReference)
    .where(eq(tickerReference.listingKey, "TSX::MFC"))
)[0]
check(
  "upstream rows are neither deleted nor mutated",
  upstreamBefore === upstreamAfter &&
    Boolean(mfcTsxBefore) &&
    mfcTsxAfter?.countryCode === mfcTsxBefore?.countryCode,
  `before=${upstreamBefore} after=${upstreamAfter}`,
)
check(
  "upstream listing is not turned into an override",
  !overrideRows.some((r) => r.ticker === "MFC" && r.exchange === "TSX"),
)

// ── conflict handling ────────────────────────────────────────────────────────
// MFC is cross-listed (TSX/CA *and* SET/TH). The override is scoped to a single
// listing: it must not bleed onto the other venue, and a venue-free lookup must
// not silently return the override's currency.
const mfcListings = (
  await db.select({ c: sql`count(*)::int` }).from(tickerReference).where(eq(tickerReference.ticker, "MFC"))
)[0].c
check("MFC is genuinely cross-listed upstream (conflict exists)", mfcListings > 1, `listings=${mfcListings}`)
check(
  "venue-free MFC does not pick up the NYSE override",
  (await resolveInstrumentCurrency(db, "MFC")) !== "USD",
)
check(
  "venue-qualified MFC/TSX resolves deterministically to CAD",
  (await resolveInstrumentCurrency(db, "MFC", "TSX")) === "CAD",
)

// ── resolver precedence ──────────────────────────────────────────────────────
// The curated override is local truth for its listing and outranks the
// provider's declaration (§47.4), reporting "estimated" rather than "provider".
check(
  "curated override outranks a provider mismatch (MFC/CAD@NYSE → USD)",
  eqDeep(await resolveCurrency(db, "MFC", "CAD", "NYSE"), {
    currency: "USD",
    currencySource: "estimated",
  }),
)
check(
  "curated override agreeing with the provider reports provider",
  eqDeep(await resolveCurrency(db, "MFC", "USD", "NYSE"), {
    currency: "USD",
    currencySource: "provider",
  }),
)
check(
  "override does not leak to another venue (MFC/TSX stays CAD)",
  eqDeep(await resolveCurrency(db, "MFC", "CAD", "TSX"), {
    currency: "CAD",
    currencySource: "provider",
  }),
)

await closeDb()

if (failures > 0) {
  console.error(`\nlisting-overrides stack test: ${failures} failure(s)`)
  process.exit(1)
}
console.log("\nlisting-overrides stack test: all checks passed")