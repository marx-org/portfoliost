# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md`.

Legend: `[ ]` pending · `[x]` done

---

## 38. TFI fund renames land as display names in positions — catalog shadows ticker_reference (import fix, 2026-09-20)

Renamed GS TFI → NN/ING TFI funds landed in `portfolios.positions` with `symbol` = the display
name ("GOLDMAN SACHS AKCJI", "NN OBLIGACJI") instead of a `.TFI` quote symbol. Fixed at the import
step: the resolver (in `portfoliost-sheets-sync`, the google-sync module) owns the name → `.TFI`
mapping; `ticker_reference` stays pure upstream adanos + curated crypto routing rows. No sheet
edits; no reference-table patching; no resolver precedence change.

Root cause: the Podsumowanie catalog rows for these 6 funds carry a **null Yahoo symbol**, so the
catalog-first resolver matched the name, yielded the display name, `matched: true` — and
`ticker_reference` was never consulted. The curated `TFI::` rows in prod were also stale (bare
tickers, exchange `GPW`, empty aliases).

Resolution (user-directed, 2026-09-20): "ticker manipulation only in google-sync code." The old
sheet-name → new ING `.TFI` mapping lives **exclusively** in the resolver's `NAME_VENUE_OVERRIDES`
(import-side, §34.7 precedent). `ticker_reference` carries **no** curated `.TFI` fund rows. Mock
seed carries the funds only with valid, up-to-date ING names.

Rules: one step = one commit; a step is `[x]` only after its tests pass (unit in the touched repo +
docker-compose mock suite per AGENTS.md).

### 38.1 — Record the authoritative GS→ING fund symbol mapping

- [x] Changed-then-current fund symbols (verified via live biznesradar pages 2026-09-20):
  `GSAK.TFI` → `INGAKC.TFI`, `GSEM60.TFI` → `NNEP60.TFI`, `GSEM65.TFI` → `NNEP65.TFI`,
  `NNOB.TFI` → `INGOBL.TFI`, `NNEP25.TFI` unchanged ("ING Emerytura 2025"), `NNEP30.TFI`
  unchanged ("ING Emerytura 2030").
- [x] Each of the 6 current symbols returns 200 through the openst/cachest instrument tier
  (`/equity/profile`) — verified live in-cluster 2026-09-20, all 6 return 200.

### 38.2 — Drop curated TFI rows from tickerref-sync (reference stays pure)

- [x] Removed the `tfiFunds` block from `curatedListingRows()` in
  `portfoliost-instruments/src/scripts/tickerref-sync.ts` — `curatedListingRows()` now returns only
  the crypto pair rows. `ticker_reference` carries no curated `.TFI` fund rows. (Commit `3646694`.)
- [x] `tickerref-sync.test.ts` curated describe block no longer asserts any `TFI::` row.
  `npm test` in `portfoliost-instruments` green (286 passed).

### 38.3 — Resolver maps the 6 old fund names to ING `.TFI` via `NAME_VENUE_OVERRIDES`

- [x] Added the 6 funds to `NAME_VENUE_OVERRIDES` (`portfoliost-sheets-sync/src/instrument-resolver.ts`),
  keyed by the **old folded sheet names** (sheet stays old), mapping to the §38.1 symbols:
  `goldman sachs akcji` → `INGAKC.TFI`, `goldman sachs emerytura 2060` → `NNEP60.TFI`,
  `goldman sachs emerytura 2065` → `NNEP65.TFI`, `nn emerytura 2025` → `NNEP25.TFI`,
  `nn emerytura 2030` → `NNEP30.TFI`, `nn obligacji` → `INGOBL.TFI`. Each entry:
  `ticker`, `assetType: "fund"`, `yahooSymbol` (the `.TFI` ticker; no `exchange_reference` TFI row
  so suffix is empty), `sector: null`, `industry: null`, `country: "PL"`, `countryCode: null`.
  Runs before the catalog (step 1), bypassing the null-symbol catalog match — no resolver
  precedence change. (Commit `852010b`.)
- [x] `assetType: "fund"` flows to `transakcje-mapper.ts` → `.toUpperCase()` → position `FUND`.
- [x] `instrument-resolver.test.ts`: 6 fund rows resolve to the `.TFI` override; Allianz/Nintendo
  overrides still win; existing catalog/reference tests stay green. `npm test` in
  `portfoliost-sheets-sync` green.

### 38.4 — Single-entry fold-group short-circuit (fixes the other unmatched rows)

- [x] `byCatalogName` (`instrument-resolver.ts`) now returns `fromCatalog(group[0], row)` directly
  when `group.length === 1` — a single catalog fold entry wins regardless of the sheet's
  (symbol, giełda). Sheet rows carrying a typos symbol/venue no longer zero-out a valid single
  catalog match. Multi-entry groups are still narrowed by (symbol, giełda). (Commit `4f75f81`.)
- [x] `instrument-resolver.test.ts`: CATALOG entries like the live rows (e.g. Vonovia `VNA`/`ETR`
  + Yahoo `VNA.F`) resolve for rows carrying a typos symbol/venue; multi-entry groups still
  narrowed by (symbol, giełda). `npm test` in `portfoliost-sheets-sync` green (108 passed).

### 38.6 — Mock parity (mock seed + resolver fixtures)

- [x] Mock seed `mocks/db-seed/instruments/ticker_reference.csv` TFI rows aligned to valid,
  up-to-date ING fund names (no old GS/NN aliases). (Commit `8dd0424`.)
- [x] `instrument-resolver.test.ts` REF_ROWS TFI fixtures aligned with the mock/prod shape.
  (Commit `c1ca76c`.)

### 38.5 — Prod wipe & re-import (DONE 2026-09-20)

- [x] Deployed the latest to homelab (Flux `01bf64441`): `portfoliost-sheets-sync` **v1.0.6**
  (§38.3 + §38.4 resolver) via admin `SHEETS_SYNC_IMAGE`; `portfoliost-instruments` **v1.0.57**
  (§38.2). Verified running.
- [x] Re-ran the sheets-sync wipe & re-import (syncRun 61): **0 unmatched** (was 11) — §38.4
  fold-short-circuit + §38.3 fund override both live.
- [x] Verified `portfolios.positions.symbol` for the 6 funds is the `.TFI` symbol and asset_type
  `FUND`: `INGAKC.TFI`, `NNEP60.TFI`, `NNEP65.TFI`, `NNEP25.TFI`, `NNEP30.TFI`, `INGOBL.TFI`.
- [x] Pruned the 6 orphaned stale `TFI::*` rows (`GSAK`/`GSEM60`/`GSEM65`/`NNEP25`/`NNEP30`/`NNOB`,
  bare ticker, exchange `GPW`, empty aliases — §24.1): targeted `DELETE`, verified 0 `TFI::*` rows
  remain. (Full clean-baseline truncate + rerun deferred to §41.)

---

## 41. Rebuild `ticker_reference` from a clean truncate + tickerref-sync rerun (2026-09-21)

§38.5 pruned the 6 stale `TFI::*` rows surgically. A full clean-baseline rebuild — `TRUNCATE
instruments.ticker_reference` then re-run the tickerref-sync — is the end-state target: it
guarantees the table is exactly what `portfoliost-instruments` produces (post §40.2: pure adanos +
curated crypto), dropping any other stale/manual rows in one pass.

Safe now: a later sheets-sync wipe & re-import will run anyway, so a transient empty
`ticker_reference` window during the ~62k-row re-population causes no lasting data loss — positions
already reference `.TFI`/adanos symbols resolved **at import**, not the reference rows. No FKs
reference `ticker_reference` (verified 2026-09-21), so the truncate cannot cascade.

- [ ] After §40.2 lands (ALIAS_OVERRIDES removed), `TRUNCATE instruments.ticker_reference` in prod.
- [ ] Re-run the tickerref-sync (CronJob / `--url` one-shot); confirm row count, the 4 §40 keys
  carry pure adanos aliases, crypto rows present, zero `TFI::*` rows.
- [ ] Re-run the sheets-sync wipe & re-import (user approval) to re-resolve positions against the
  rebuilt reference; confirm zero unmatched.
- [ ] Commit.

---

**Still open (gated on user approval — homelab):** §41 clean-baseline `ticker_reference`
rebuild (after §40.2, which has landed).
