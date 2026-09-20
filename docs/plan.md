# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md`.

Legend: `[ ]` pending · `[x]` done

---

_(No pending work — all sections complete and archived.)_

## 38. TFI fund renames land as display names in positions — catalog shadows ticker_reference (import fix, 2026-09-20)

Proposal: none (incident-style fix). Renamed GS TFI → NN/ING TFI funds keep landing in
`portfolios.positions` with `symbol = "GOLDMAN SACHS AKCJI"`/`"NN OBLIGACJI"` (a display name)
instead of a `.TFI` quote symbol. Touches `portfoliost-sheets-sync` (resolver),
`portfoliost-instruments`
(ticker_reference curation), `portfoliost` (mock parity). Constraint: no data migration — wipe &
re-import after the import path is fixed; user approved reimporting all data.

**Root cause (verified, 2026-09-20):** the Podsumowanie catalog has rows for these funds with a
**null Yahoo symbol** — `byAktywo("Goldman Sachs Akcji").yahooSymbol` is asserted `toBeNull()`
(`portfoliost-sheets-sync/src/podsumowanie-parser.test.ts:59-63`). The resolver's catalog-first
precedence (`byCatalogName`, plan §28.3, refined §34.7) matches the name, `fromCatalog` yields
`ticker = entry.symbol ?? row.aktywo` = the display name, `yahooSymbol = null`, `matched: true`
→ `ticker_reference` is **never consulted** for these rows → wallets import writes the name as
symbol. The curated `TFI::` rows in prod are additionally stale: bare tickers (`GSAK`, `GSEM60`)
with exchange
`GPW` (not in `exchange_reference`), empty aliases — while resolver tests and mock seed expect
`.TFI` tickers, exchange `TFI`, and aliases.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass (unit in the touched
repo + docker-compose mock suite per AGENTS.md).

**Open questions (user decision needed before 38.5):**

1. **RESOLVED (2026-09-20): sheet side stays OLD** — the Google Sheet Transakcje/Podsumowanie rows
   keep writing "Goldman Sachs Akcji" / "Goldman Sachs Emerytura 2060/2065" / "NN Emerytura 2025/2030"
   / "NN Obligacji". So `ticker_reference` rows must **map the old sheet names → the new ING `.TFI`
   symbols in code**: the reference row's folded name/aliases must still match the old names (so the
   §38.3 fall-through lands), while `ticker`/`yahooSymbol` become the new ING symbol.
2. **RESOLVED (2026-09-20): rejected fall-through — use `NAME_VENUE_OVERRIDES` instead.** A
   precedence change would alter catalog-first semantics for any symbol-less catalog row. The 6
   funds are instead hardcoded in the resolver's `NAME_VENUE_OVERRIDES` (pre-catalog step 1), keyed
   by the OLD folded sheet names → the new ING `.TFI` symbols. This is exactly the §34.7 mechanism
   ("overrides for assets whose live Podsumowanie row is stale … sheet edits are not allowed"),
   no resolver order change (see §38.3).

---

### 38.1 — Record the authoritative GS→ING fund symbol mapping

- [x] Changed-then-current fund symbols (verified via live biznesradar pages 2026-09-20):
  `GSAK.TFI` → `INGAKC.TFI`, `GSEM60.TFI` → `NNEP60.TFI`, `GSEM65.TFI` → `NNEP65.TFI`,
  `NNOB.TFI` → `INGOBL.TFI`, `NNEP25.TFI` unchanged ("ING Emerytura 2025"), `NNEP30.TFI`
  unchanged ("ING Emerytura 2030").
- [x] Verify each of the 6 current symbols returns 200 through the openst/cachest instrument tier
  (`/equity/profile`) — verified live in-cluster 2026-09-20, all 6 return 200:
  `INGAKC.TFI`, `NNEP60.TFI`, `NNEP65.TFI`, `NNEP25.TFI`, `NNEP30.TFI`, `INGOBL.TFI`.
- Commit (records the verified map; no code).

### 38.2 — Fix curated TFI rows in tickerref-sync (prod reference data)

- [ ] In `portfoliost-instruments/src/scripts/tickerref-sync.ts` `curatedListingRows()` → `tfiFunds`
  (lines 81-99): change the tuples to the §38.1 symbols — `ticker` = new ING `.TFI` symbol
  (`INGAKC.TFI`, `NNEP60.TFI`, `NNEP65.TFI`, `NNEP25.TFI`, `NNEP30.TFI`, `INGOBL.TFI`), exchange
  `TFI`. **The resolver override in §38.3 now handles the OLD sheet-name → new-symbol mapping**, so
  `ticker_reference` name/alias is free to carry the NEW ING fund names (e.g. `name` = "ING Akcji
  Polskich", alias `ing akcji|ing akcji polskich`) — matching modern aggregator surfacing and the
  search path; the old GS/NN names need not be aliased here. Mock seed already uses the reference
  shape (`mocks/db-seed/instruments/ticker_reference.csv` lines 61696-61701:
  `NNEP30.TFI,TFI`, `GSAK.TFI,TFI`, …, name + alias) — align its names to the new ING names too.
- [ ] Prod currently has `TFI::GSAK`/`TFI::GSEM60`/`TFI::GSEM65`/`TFI::NNOB` with bare ticker,
  exchange `GPW`, empty aliases (verified from live DB 2026-09-20) — these come from §24.1 and were
  applied to prod despite the comment claiming otherwise (comment: "applied to compose only",
  actually present in prod). Renaming the key (`TFI::GSAK` → `TFI::INGAKC.TFI`) orphans the old rows
  on the next upsert-run. Decide: prune obsolete `TFI::*` keys in `curatedListingRows` (delete
  `listing_key` not in the curated set), or keep old rows but make sure they no longer match by
  alias/name. Recommend pruning.
- [ ] `exchange_reference` has **no `TFI` row** in prod (verified live) nor in mock
  (`exchange_reference.csv` has no TFI). `fromTickerRef` joins suffix via `exchange_reference`; with
  no row the suffix is empty → `yahooSymbol = ticker` → exactly `INGAKC.TFI`. So a TFI exchange row
  is optional; adding one (country PL, yahoo_suffix empty) makes it explicit. Decide and align mock.
- [ ] Tests: update `tickerref-sync.test.ts` expectations to the new tickers/names; add a test that
  re-running after the rename prunes/updates cleanly (no orphaned `TFI::GSAK`).
- [ ] Re-run the ticker sync job against homelab and confirm `instruments.ticker_reference` rows.
- [ ] Commit.
- Tests: `npm test` in `portfoliost-instruments`.

### 38.3 — Fix resolver: map the 6 old fund names to ING `.TFI` via `NAME_VENUE_OVERRIDES`

- [ ] The Podsumowanie catalog **contains the 6 fund rows** (verified: fixture
  `src/tests/fixtures/podsumowanie.json` — "Goldman Sachs Akcji" line 324, "Goldman Sachs Emerytura
  2065/2060" lines 284/1044, "NN Emerytura 2025/2030" lines 1084/964, "NN Obligacji" line 1004) all
  with `-`/empty Yahoo symbol, `-` Symbol giełdowy. `podsumowanie-parser.ts` `nonEmpty()` maps `-`
  → null, so these rows are name-only. The `NAME_VENUE_OVERRIDES` comment at
  `instrument-resolver.ts:164-196` already states the mechanism's purpose ("overrides for assets
  whose live Podsumowanie row is known to be stale … sheet edits are not allowed") — exactly this
  case, so the fix is code-side and follows the existing Allianz/Nintendo pattern.
- [ ] Add the 6 funds to `NAME_VENUE_OVERRIDES` (`instrument-resolver.ts:170-196`), keyed by the
  **old folded names** (sheet stays old per open question 1), mapping to the §38.1 symbols:
  `"goldman sachs akcji"` → `INGAKC.TFI`, `"goldman sachs emerytura 2060"` → `NNEP60.TFI`,
  `"goldman sachs emerytura 2065"` → `NNEP65.TFI`, `"nn emerytura 2025"` → `NNEP25.TFI`,
  `"nn emerytura 2030"` → `NNEP30.TFI`, `"nn obligacji"` → `INGOBL.TFI`. Each entry:
  `ticker`, `assetType: "fund"`, `yahooSymbol` (the `.TFI` ticker itself — `exchange_reference` has
  no TFI row so suffix is empty), `sector: null`, `industry: null`, `country: "PL"`,
  `countryCode: null`. The override runs before the catalog (step 1) so the pure-name catalog match
  is bypassed — **no resolver precedence change needed** (open question 2 resolved).
- [ ] Override `assetType: "fund"` flows to `transakcje-mapper.ts:166` → `.toUpperCase()` → position
  `FUND` (verified code path; no Bond/cash leak for "NN Obligacji" whose Kategoria is Obligacje).
- [ ] Tests in `instrument-resolver.test.ts`: add rows for the 6 fund names resolving to the `.TFI`
  override (yahooSymbol = ticker, assetType `fund`); assert Allianz/Nintendo overrides still win and
  existing catalog/reference tests stay green.
- [ ] Commit.
- Tests: `npm test` in `portfoliost-sheets-sync`.

### 38.4 — Cover the remaining unmatched rows (run 51: "11 unmatched", only 10 printed)

**Root cause REWRITTEN (2026-09-20, live-sheet verification):** the 4 unmatched names are NOT absent
from the live Podsumowanie catalog — each has **exactly one** catalog entry carrying a valid Yahoo
symbol. They went unmatched because `byCatalogName` (`instrument-resolver.ts:203-216`) applies the
`(symbol, giełda)` pair-filter even to a **single-entry** fold group, contradicting its own doc
comment ("A single entry wins; several entries … are narrowed by (symbol, giełda)"). Sheet rows
carrying a symbol/giełda that disagrees with the catalog entry zero-out the pool → falls to
ticker_reference → no match → name-as-symbol. Verified against the live sheet (fetched via the job's
own credentials, 2026-09-20) and live catalog groups:

| name (run-51 rows) | sheet row symbol/giełda | live catalog entry (single) |
| --- | --- | --- |
| `Vonovia SE` (670, 1045) | `VNV` / `ETR` (symbol typo) | `VNA` / `ETR`, Yahoo `VNA.F` |
| `JM AB` (587) | `JM` / `ETR` (giełda typo, should be STO) | `JM` / `STO`, Yahoo `JM.ST` |
| `Novo Nordisk A/S` (1407, 1595, 1841) | `NVO` / `AS` (giełda ← unrecognized) | `NVO` / `NYSE`, Yahoo `NVO` |
| `Beta ETF Bitcoin … (PLN)` (1668, 1754, 1850, 1997) | `ETFBTCPL.WA` / `WSE` | `ETFBTCPL` / `WSE`, Yahoo `ETFBTCPL.WA` |

**Fix (code-side, no sheet edits):** in `byCatalogName`, return `fromCatalog(group[0], row)` directly
when `group.length === 1` — single fold-group match wins regardless of the row's (symbol, giełda).
This is exactly the intent already encoded at the top of the file (lines 4-8) and mirrors §34.7's
`NAME_VENUE_OVERRIDES` rationale ("a mismatching (Symbol, Giełda) pair cannot filter the row out"),
which becomes redundant for these names (keep the overrides). The catalog symbol/venue stays
authoritative per entry. Novo resolves to the catalog's `NVO`/NYSE (its fold group is single in the
catalog even though ticker_reference has both CPH::NOVO-B and NYSE::NVO — catalog wins first).

***Hidden 11th row identified (2026-09-20):*** run-51 printed unmatched rows sorted by sheet row
(587 → 1997) and then `slice(0, 10)`; the 11th is the next unmatched row > 1997 = **`Novo Nordisk
A/S` sheet row 2015** (`NVO` / `AS`) — the same failing pattern as rows 1407/1595/1841. Verified by
re-running resolution locally against the live sheet + live `ticker_reference` index. **The current
live sheet (post-run-51 edits) carries 27 unmatched rows across 12 names, all sharing the same
single-entry-narrowed mechanism** (Estee Lauder ×5 `EL/NASDAQ` vs catalog `NYSE`, Constellation ×5
`CSU/TO` vs catalog `TSE`, HubSpot ×2, iShares Biotech ×2 `BTEK/LON`, Vercom SA, Yum China `PAYC`
typo, …). The §38.4 single-entry short-circuit resolves **all** of them wholesale — the catalog
entry's symbol/venue stays authoritative regardless of the sheet's symbol/giełda columns; no
per-name aliases, curated rows, or venue decisions needed for any of the 12.

- [ ] Logging gap: `sync.ts` prints `unmatched.slice(0, 10)` — run 51 reported 11. Either print all
  (the list is at most a few dozen) or assert `unmatched.length === printed.length`. This hid the
  11th (now identified: Novo 2015).
- [ ] Change `byCatalogName` (`instrument-resolver.ts:203-216`): short-circuit single-entry fold
  groups before the (symbol, giełda) filter; keep the pair-narrowing for multi-entry groups only.
  Confirm no other asset's resolution regresses (the filter only ever removes catalog matches for
  single-entry groups, so behavior only changes unmatched rows).
- [ ] Tests in `instrument-resolver.test.ts`: add CATALOG entries like the live rows (e.g. Vonovia
  VNA/ETR + Yahoo VNA.F) asserted to resolve for rows carrying a typos symbol/giełda (`VNV`/`ETR`);
  assert multi-entry groups are still narrowed by (symbol, giełda) (existing Dupe Asset / SAP XETRA
  tests already cover this). Also add a test that the hidden 11th is printed (logging fix).
- [ ] Commit.
- Tests: extend `instrument-resolver.test.ts`; full resolver suite green.

### 38.5 — Import re-run + verification (after 38.2–38.4)

- [ ] Re-run the sheets-sync import (wipe & re-import) per user approval; confirm
  `portfolios.positions.symbol` for the 6 funds is now the `.TFI` symbol and asset_type `FUND`.
- [ ] Confirm the resolver test suite + docker-compose mock suite green.
- [ ] Commit.

### 38.6 — Mock parity (resolver tests vs prod shape vs mock seed)

- [ ] Align mock seed `mocks/db-seed/instruments/ticker_reference.csv` TFI rows and
  `mocks/instruments/index.js` search (universe has no fund rows) with the §38.2 shape.
- [ ] Align `instrument-resolver.test.ts` REF_ROWS TFI fixtures with prod after §38.2.
- Tests: mock API tests (`npm run test:mock`) + e2e search for "ing akcji".

---

## 40. Remove `ALIAS_OVERRIDES` — resolve sheet naming at the import step, keep `ticker_reference` pure adanos (2026-09-20)

Proposal: [google-sheets-sync.md](proposals/google-sheets-sync.md) f/up (incident-style cleanup of plan §24.9). `portfoliost-instruments` re-applies 4 sheet-specific aliases (`LSE::DTLA`, `LSE::IUFS`, `NASDAQ::RGEN`, `NASDAQ::ASML`) onto the adanos-synced `ticker_reference` after every sync run (commit `010921b`, persistence hack). That is **patching upstream reference data per one user's Google Sheet** — reset by every adanos upsert, brittle. The correct layer is the import: the sheets-sync resolver is **catalog-first**, and the live Podsumowanie catalog already carries all 4 assets with authoritative symbols (`podsumowanie.json`: `Repligen Corp`→`NASDAQ:RGEN`/`RGEN.US` line 1562, `ASML Holding NV`→`NASDAQ:ASML`/`ASML.US` line 1722, `iShares $ Treasury Bond 20+yr …`→`LON:DTLA`/`DTLA.L` line 4842, `iShares S&P 500 Financials …`→`LON:IUFS`/`IUFS.L` line 7482). The catalog + name-first resolver landed the same day as the hotfix (2026-09-19, `33723dc`/`cfbd292` vs `010921b`) — the aliases closed a pre-catalog gap that no longer exists. Target: after a wipe & re-import, positions carry the adanos-aligned tickers (RGEN/ASML/DTLA/IUFS), and `ticker_reference` stays 100 % upstream adanos + routing-critical curated rows — no sheet-compat patches.

Constraints: `NAME_VENUE_OVERRIDES` (`instrument-resolver.ts:170-196`) **stays** — it is an import-side fix (§38.3 precedent, user-confirmed); only reference-table patching is removed. §38.4 (single-entry fold-group short-circuit) must land **first** — it is what lets the catalog win for rows whose sheet symbol/giełda disagrees with the catalog entry. No sheet edits. Wipe & re-import on homelab needs user approval (§28, §24.9 job).

Rules: one step = one commit; a step is `[x]` only after its tests pass (unit in the touched repo + docker-compose mock per AGENTS.md).

---

### 40.1 — Prove the 4 names already resolve at import (no patch needed)

- [ ] In `portfoliost-sheets-sync`, after §38.4: add `instrument-resolver.test.ts` cases for the 4 live sheet rows — RGEN + ASML name-only (empty symbol col, like sheet rows 159/167/852), DTLA + IUFS symbol+venue `/LON` (rows 703/1673/1878) — asserting they resolve via the catalog (single-entry `byCatalogName`, §38.4) to `RGEN.US` / `ASML.US` / `DTLA.L` / `IUFS.L`, `matched: true`, and **not** via any `ticker_reference` alias. The CATALOG fixture already contains all 4 entries.
- [ ] Live check (same method as §38.4): resolve the current live Transakcje rows for these 4 names against the live catalog + live `ticker_reference` index (job's own credentials), adanos aliases only — confirm `matched: true`, correct ticker, zero name-as-symbol for these rows. Record sheet row numbers in the commit message.
- [ ] If any name still misses the catalog (fold mismatch), fix it **in the resolver** with a `NAME_VENUE_OVERRIDES` entry (import-side, per §38.3) — never in `ticker_reference`.
- Tests: full `npm test` in `portfoliost-sheets-sync` green.
- Commit.

### 40.2 — Delete `ALIAS_OVERRIDES` + `applyAliasOverrides` from `portfoliost-instruments`

- [ ] `src/scripts/tickerref-sync.ts`: remove the `ALIAS_OVERRIDES` constant + doc block (lines 19-35), the `applyAliasOverrides` function + doc (37-52), and the call/log in `main()` (329-330). Update the module doc comment (7-9): "pure upstream adanos sync + curated routing rows; no sheet-compat patches re-applied".
- [ ] `src/scripts/tickerref-sync.test.ts`: replace the §24.9 describe block (77-107) with a **purity regression test** — after `syncTickerReference(FIXTURE, db)` the alias column equals exactly the adanos fixture value (or null) for every row; delete the now-unused `ALIAS_OVERRIDES` / `applyAliasOverrides` imports (line 6).
- [ ] Grep the repo + homelab manifests for any other `ALIAS_OVERRIDES` / `applyAliasOverrides` reference; the CronJob/`--url` invocation is unchanged.
- Tests: `npm test` + `npm run build` in `portfoliost-instruments` green.
- Commit.

### 40.3 — Align mock seed to pure adanos

- [ ] `portfoliost/mocks/db-seed/instruments/ticker_reference.csv`: restore the 4 rows to pure adanos aliases — `NASDAQ::RGEN` (line 29291) drop the injected `repligen corp` fragment, `NASDAQ::ASML` (26108) drop `asml holding nv`; check `LSE::DTLA` (22933) / `LSE::IUFS` (23830) against the live `core_listings.csv` and keep only what adanos actually carries (drop the full-name fragments if adanos has none). Verify the real adanos values by fetching `DEFAULT_SOURCE_URL` (or the bundled seed) for these `listing_key`s; regenerate via `npm run mock:seed` if the flow supports it, else hand-edit.
- [ ] Search/mock/e2e expectations that hit the sheet-variant spellings (`repligen corp`, `asml holding nv`, the `(Acc)` iShares names): point them at the adanos name/alias (`repligen`, `asml`) — see consequences below.
- Tests: `npm run test:mock` + `npm run test:e2e` green.
- Commit.

### 40.4 — Prod rollout + wipe & re-import (needs user approval — touches homelab)

- [ ] Push `portfoliost-instruments` to `main`; verify the real GHA release tag (`gh release list --repo Marx2/portfoliost-instruments`, never tag manually); pin it in `~/prv/homelab/…/portfoliost-instruments/…/helmrelease.yaml`, commit + push, Flux applies.
- [ ] Re-run the tickerref sync in cluster (existing CronJob / `--url` one-shot); query `instruments.ticker_reference` for the 4 keys — aliases now equal pure adanos, `updated_at` refreshed.
- [ ] Re-run the sheets-sync wipe & re-import from the admin panel (`POST /api/admin/jobs/sheets-sync/run {wipe:true}`, user approval §28). Confirm `portfolios.positions.symbol` for the 4 names = `RGEN`/`ASML`/`DTLA`/`IUFS` (catalog-resolved), `matched: true`, and the sync run reports zero unmatched for them.
- [ ] SPA smoke (Playwright, compose or prod): the 4 positions show correct tickers; identity search by pure adanos names resolves.
- Tests: resolver suite + docker-compose suite green; archive §40 to `plan-archive.md` noting the deleted §24.9 persistence mechanism.
- Commit.

---

**Consequences (explicit, accepted):** SPA identity search over pure adanos loses the sheet-variant spellings the overrides had injected (`repligen corp`, `asml holding nv`, iShares `(Acc)` full names) — search by the exact adanos name/alias still resolves. If this bites later, the fix is an import-side resolver alias, never a `ticker_reference` patch. `NAME_VENUE_OVERRIDES` stays by design; §38 funds are unaffected (old GS/NN names → `.TFI` symbols already live at the import step, §38.3, and curated TFI rows carry only current names, §38.2).

