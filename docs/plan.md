# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md` / `plan-archive2.md`.

Legend: `[ ]` pending · `[x]` done

---

## 25. D80 / D81 / D82 — Catalyst bond profiles, asset-class routing, contract patch

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) —
closes remaining open D-items: Catalyst corporate-bond profile metadata (D80), asset-class
routing in `price-bars` for `fund/crypto/bond/corp_bond` (D81), `InstrumentType` contract
widening + admin surface (D82).

D77 wired Catalyst OHLCV; D79 wired retail-savings-bond OHLCV. Independent of §23/§24.

Repos touched: `openst`, `cachest`, `portfoliost-instruments`, `portfoliost-admin`,
`@marx2/contracts`.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass.

---

### 25.1 — HTML fixture capture: `obligacje.pl` bond detail + search pages

- [ ] `curl` `obligacje.pl/pl/obligacja/BST0327` → save to
      `openst/tests/fixtures/obligacje_bond_profile_BST0327.html`.
- [ ] `curl` `obligacje.pl/pl/narzedzia/wyszukiwarka-obligacji-notowanych` (page 1) →
      save to `openst/tests/fixtures/obligacje_bond_catalogue_page1.html`.
- [ ] Record: CSS selectors for emitent, ISIN, market, nominal, coupon type, margin,
      maturity; pagination URL pattern; total bond count (≈936).
- [ ] Commit: `test(openst): fixture HTML for obligacje.pl bond profile + catalogue (D80)`.

### 25.2 — `CorporateBondProfileFetcher` in `openbb_biznesradar`

- [ ] `openst/plugins/openbb_biznesradar/fetchers/corp_bond_profile.py`: scrapes
      `obligacje.pl/pl/obligacja/{symbol}`; returns emitent, ISIN, market, nominal,
      coupon type, margin, maturity, `asset_type="corp_bond"`, `country="PL"`,
      `currency="PLN"`.
- [ ] `EquityInfoFetcher.__call__` dispatches on Catalyst pattern `[A-Z]{3}\d{4}(\.WA)?$`
      → new fetcher; all other symbols keep existing path.
- [ ] Unit tests against fixture; regression: existing profile tests unchanged.
- [ ] Full openst compose suite passes.
- [ ] Commit: `feat(openbb_biznesradar): CorporateBondProfileFetcher (D80)`.

### 25.3 — openst smoke + cachest route + corp-bond catalogue

- [ ] `docker compose up -d` openst; verify `/equity/profile/BST0327` →
      `asset_type=corp_bond`; regression `/equity/profile/NNEP25.TFI` unchanged.
- [ ] Add `OPENST_CORP_BOND_PROFILE` to `cachest/config.yaml` (TTL 24h);
      `test_real_config_has_corp_bond_profile_route`; full cachest suite passes.
- [ ] `openst/src/importers/corp_bond_catalogue.py`: scrapes all pages of
      `obligacje.pl/pl/narzedzia/wyszukiwarka-obligacji-notowanych`; emits
      `tickerref-sync.ts` CSV format with `asset_type=corp_bond`. One-shot k8s Job;
      unit tests with `obligacje_bond_catalogue_page1.html` fixture.
- [ ] `npm run test` passes.
- [ ] Commit: `feat(openst+cachest+instruments): D80 corp-bond profile + catalogue`.

### 25.4 — D81: asset-class routing in `price-bars`

- [ ] `portfoliost-instruments/src/services/price-bars.ts`: `getPriceBarSeries` accepts
      `assetType`; branches: `crypto` → `fetchCryptoOhlcv`; `bond` →
      `fetchBondOhlcv` (new, hits `OPENST_BOND_OHLCV`); `corp_bond`/`fund` → existing
      equity `fetchOhlcv`; `stock`/`etf` → unchanged stooq-overflow path.
- [ ] Add `fetchBondOhlcv` to `src/adapters/cachest.ts`.
- [ ] Route handler looks up `ticker_reference.asset_type`; falls back to `stock`.
- [ ] Unit tests: correct adapter per `assetType`; stooq skipped for crypto/bond/corp_bond.
- [ ] Compose stack smoke: ROD1033, BST0327.WA, BTC-USD price-bars end-to-end.
- [ ] `npm run test` + `npm run test:stack` pass.
- [ ] Commit: `feat(instruments): asset-class routing in price-bars — D81`.

### 25.5 — D82: contracts patch + admin surface

- [ ] `@marx2/contracts` `openapi.yaml`: add `fund | bond | corp_bond | crypto` to
      `InstrumentType`; patch bump; reinstall; `gen:types`.
- [ ] `src/adapters/translate.ts`: add `corp_bond → CORP_BOND`, `fund → FUND`
      (BOND and CRYPTO already at `translate.ts:289`).
- [ ] portfoliost-admin: read-only table for `openst.bond_series` (symbol, name,
      issue/maturity, rate_rule, margin; row count) and `openst.cpi_12m` (24 rows;
      staleness warning > 40 days).
- [ ] `npm run build` + `npm run test` + `npm run test:mock` pass.
- [ ] Commit: `feat(contracts+admin): InstrumentType widening + bond/CPI admin (D82)`.

## Topology — cinematic observability experience

<!-- §27 moved to plan-archive.md (closeout 2026-09-19) -->

- [x] **One implementation step:** create an original, motion-rich Portfoliost topology experience (atmospheric canvas, luminous directional traffic, polished controls/nodes/inspector, focus mode, and accessible motion controls). Preserve graph interaction, filtering, layouts, and API contracts.
  - First gate: browser tests prove animated effects run, pause/reduced-motion stops them, and node inspection still works before expanding the visual treatment.
  - Final gate: `npm run build`, `npm run test`, `npm run test:mock`, `docker compose up -d --build`, `npm run test:e2e`; desktop/mobile browser review. Mark complete and commit only on passing full validation.
  - This is original Portfoliost functionality, not a Example service parity page.
  - Result (2026-09-17): implemented — `mission-control.css` atmosphere (drifting aurora layers, grid, scan, grain, particles), luminous dual-layer flow edges (trail + particle) with corrected source→target direction, per-area accent styling across toolbar/nodes/lanes, redesigned dark explorer stage, focus mode (Esc exits), Pause effects + reduced-motion hard stop, telemetry status strip, empty-state recovery. Validation: `npm run build`, 272 unit, 186 mock, topology e2e 13/13 (3 new tests), dockerized stack rebuilt, mobile/focus/dark browser review, zero console errors. Known pre-existing failure outside this step: `auth.spec.ts` "login page hides form" — compose deliberately sets `VITE_PASSWORD_LOGIN_ENABLED=true` (introduced for D73–D79 mock login) while the test still expects the OIDC-only UI from c9a0a81; fails identically with this work stashed (baseline verified). Needs a product/test-strategy decision, tracked separately.

### Topology follow-up — themes, glow, deployed jobs

- [x] Restore a complete light palette and global light/dark/system controls; add icon glow and state-colored dot pulses. Validation: build, 279 unit (incl. new StatusDot pulse tests), 186 mock, motion gate, 15/15 topology E2E incl. real canvas/node/inspector colors, system-theme reactivity, glow pause/reduced-motion, mobile inspection. Fixed `theme.ts` system-listener bug. Fixed `auth.spec.ts` OIDC-only test to override `passwordLoginEnabled` before boot (compose keeps password login for other flows) — that blocker is resolved.
- [x] Add verified missing OpenST jobs and providers to the graph: Bond Import `30 4 * * *`, Bond Archive `0 6 3 * *`, CPI Import `30 4 * * *`, CPI Seed `0 5 1 1 *` (suspended) as job nodes with edges into openst and schedule metadata in the inspector; OpenBB plugins `biznesradar` (Polish TFI funds / Catalyst bonds, quotes/history/profile/search) and `obligacje` (retail savings-bond pricing from issue parameters + CPI) as provider leaves. Enabling the expansion surfaced two real defects, both fixed with tests: dagre could emit negative lane origins which the drag clamp treated as out of bounds (layout now normalizes into LANE_BOUNDS; unit test added), and resizing the canvas kept a stale viewport transform on small screens (ResizeObserver refit; min-zoom lowered). Draggable-lane, re-layout, persistence, mobile-inspection tests all pass.
- [x] Traffic metrics hidden for cachest/openst: the inspector rendered the Traffic section only for `area === "internal"`, but both are probed live services in `data-providers`. Verified live via `kubectl` port-forward to Prometheus (series exist for all six services under `job`/`service_name`) and the admin `/topology/traffic` mapping (every `serviceTargets()` entry is serialized). Gate removed; new `TopologyDetailsPanel` unit test locks Traffic + cachest per-upstream P99 visibility for data-provider nodes.
- [ ] Remaining (separate module work, portfoliost-instruments): `price-bars.spec.ts` "returns a valid series" fails because `price_bars_all` yields BOTH an `openst` overflow row (338.19) and the split-adjusted `stooq` row (57.625) for 2026-07-29; `dates.indexOf` picks the unadjusted one. Verified read-only via SQL. The view's source-priority/cleanup rules (price-data-architecture, "overflow kept free of rows covered by stooq") are not enforced for this overlap; needs a product/data decision in that repo. Not masked here.
  - Sources: homelab-deploy skill, `~/prv/homelab/homelab`, live read-only Kubernetes queries using `~/.kube/homylab` (2026-09-17). Wallets FX Sync and Instruments Ticker Sync confirmed; OpenST bond-import, bond-archive, cpi-import, and suspended cpi-seed were missing from the map.
  - Read-only cluster result: wallets fxsync `10 17 * * *`; instruments tickersync `30 4 * * 1`; OpenST bond-import and cpi-import `30 4 * * *`, bond-archive `0 6 3 * *`, cpi-seed `0 5 1 1 *` (suspended). All use controller timezone. No deployments were modified.
  - Baseline blockers: auth expected hidden password form although compose enables it; its OIDC-only test now explicitly overrides runtime configuration before application boot (no production change). Combined auth/topology E2E passes 16/16. AAPL price-bars remains failing: read-only SQL confirms both `openst` and split-adjusted `stooq` rows for July 29/30 in `price_bars_all`; expectations and seeds unchanged. Tracked as the remaining item above.

### 25.6 — Closeout D80/D81/D82

- [ ] Update `instruments-provider-module.md`: D80, D81, D82 done with date.
- [ ] Update `openst-coverage.md`: `CorporateBondProfileFetcher`; D81 routing table.
- [ ] Archive to `plan-archive.md`.
- [ ] Commit: `chore: D80/D81/D82 closeout`.

---
---

## 28. Google Sheets import: venue-correct symbols + real country/sector (D24 follow-up)

Proposal: [google-sheets-sync.md](proposals/google-sheets-sync.md) — fix two defects
surfaced after production import (§24): (a) every position shows "(Other) Stock" in
holdings because import stamps `country="Other"` and nothing corrects it; (b) SNT
and NWG are enriched to the wrong listings — **Senstar Technologies (NASDAQ)** instead
of Synektik SA and **NatWest Group (LSE)** instead of Newag SA — because wallets later
re-resolve the stored **bare** ticker, which is ambiguous across venues.

Fix approach (verified read-only 2026-09-19 against the live spreadsheet + real DB):

- The **"Podsumowanie" sheet is the authoritative per-asset catalog**: 225 named
  assets with `Kategoria`, `Aktywo`, `Symbol Google`, **`Symbol Yahoo` (venue-qualified:
  `SNT.WA`, `NWG.WA`, `MBR.WA`, `SAP.DE`, `RIO.L`, bare `CRM`)**, `Sektor` (PL + English),
  `Kraj` (empty for PL, Polish names otherwise), `Oryginalna waluta`, plus the
  `Symbol giełdowy`/`Giełda` pair (col 29/30) and `Symbol Stooq` (col 35).
- **Join key = folded `Aktywo` name** (Transakcje col D ↔ Podsumowanie col B); with a
  new "S.A."→"sa" fold rule, **all 707 position rows (86 assets) name-match the
  catalog (verified 0 misses)**. `(Symbol giełdowy, Giełda)` (Transakcje col AH/AI)
  is the secondary fallback key for future typos/misses; in doubts the Transakcje
  `Aktywo` name wins — never guess.
- Imported transactions get `instrumentSymbol = Symbol Yahoo` (venue-qualified) plus
  `country`/`countryCode`/`sector`/`industry` carried through the contracts, so
  wallets enrichment, quotes, and research resolve the exact listing (Synektik/WSE)
  and the holdings label becomes "(PL) Stock".

Repos touched: `portfoliost-contracts`, `portfoliost-sheets-sync`, `portfoliost-wallets`,
`portfoliost` (mocks/tests only). No openst/cachest changes.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit per repo + mock per `AGENTS.md`; e2e against docker compose). The production
re-import in 28.6 touches homelab and requires explicit approval before running.

---

### 28.1 — Contract: `ImportPortfolioTx` carries sector/industry/country

Contract-first (`MODULARISATION.md`); the sync client in 28.4 and wallets in 28.5
both build against it.

- [x] `portfoliost-contracts/contracts/openapi.yaml` `ImportPortfolioTx` (~1734):
      add optional `sector`, `industry` (strings, nullable), `country` (string,
      ISO-2 e.g. `PL`, nullable), `countryCode` (string, nullable, legacy 2/3-letter
      when different from the ISO-2 `country`).
- [x] `portfoliost-contracts/contracts`: `npm run lint` + `npm test`.
- [x] Bump `@marx2/contracts`, publish, bump in `portfoliost-wallets/package.json`
      + `portfoliost/package.json`, `npm install`.
- [x] `npm run gen:types` in `portfoliost-wallets`; confirm fields on
      `ImportPortfolioTx`.
- [x] Commit: `feat(contracts): ImportPortfolioTx sector/industry/country`.

### 28.2 — Podsumowanie catalog reader + fixture (sheets-sync)

- [x] Capture fixture `src/tests/fixtures/podsumowanie.json` from the live
      `Podsumowanie!A1:AL233` (226 data rows via existing `fetchSheet` +
      `FORMATTED_VALUE`).
- [x] `src/podsumowanie-parser.ts`: `readPodsumowanie(sheet)` →
      `PodsumowanieCatalogEntry[]` with `aktywo, symbol, giełda, yahooSymbol,
      stooqSymbol, sektor, krajRaw, currency, kategoria` from cols 1/29/30/4/35/20/36/37/0
      (empty strings → null). Indexes: `byFoldedName` and `bySymbolGielda`.
- [x] `src/instrument-resolver.ts` `nameFold`: add "S.A."-style collapse
      (`/\bs a\b/` → `sa`) so `"Newag S.A."` ≡ `"Newag Sa"`; export it for reuse by
      the parser (single fold implementation). Keep NFD/diacritics transliteration.
- [x] `src/countries.ts`: Kraj → ISO-2 map `Niemcy→DE, USA→US, UK→GB, Tajwan→TW,
      Holandia→NL, Irlandia→IE, Szwecja→SE, Singapur→SG, Kanada→CA, Japonia→JP,
      Chiny→CN, Dania→DK, Luksemburg→LU`, empty → null (→ later resolved by venue).
- [x] Tests (`src/podsumowanie-parser.test.ts`, extend `instrument-resolver.test.ts`):
      fixture parses 226 rows; folded-name key uniqueness (no silent collisions);
      Synektik SA / Newag Sa / MO-BRUK SA rows map to `SNT.WA`/`NWG.WA`/`MBR.WA` with
      `sektor`; Kraj mapping incl. empty→null; `nameFold("Newag S.A.")`
      === `nameFold("Newag Sa")`.
- [x] Gate: `npm run test` in `portfoliost-sheets-sync` passes.
- [x] Commit: `feat(sheets-sync): Podsumowanie catalog reader + name fold (D24 f/up)`.

### 28.3 — Resolver: name-first catalog join, venue-qualified symbol

- [x] `ResolvedInstrument` gains `yahooSymbol: string | null`, `sector`,
      `industry`, `country: string | null` (ISO-2), `countryCode: string | null`.
- [x] Resolution order in `resolveInstrument`: (1) **catalog by folded `Aktywo`
      name** → single entry wins; multiple entries with the same folded name are
      disambiguated by `(symbol, giełda)` when present, else treated as unmatched
      (no guessing); (2) **catalog by `(symbol giełdowy, giełda)`** when name misses
      (typo case, e.g. "w Wrszw SA"); (3) existing `ticker_reference` match (which
      remains for assets absent from the catalog, e.g. funds) — build `yahooSymbol`
      as `ticker + yahoo_suffix` from a `LEFT JOIN exchange_reference ON exchange`
      added to the index load, `country` from `exchange_reference.country_code`,
      sector from `stock_sector`; (4) unmatched keeps sheet values + `matched:false`.
- [x] Mapper (`transakcje-mapper.ts:164`): set `instrumentSymbol = yahooSymbol ??
      ticker` — the **venue-qualified** symbol is what wallets/quotes/research see
      downstream, so bare ambiguous tickers never re-resolve to a namesake.
- [x] Tests (`instrument-resolver.test.ts`, `transakcje-mapper.test.ts`): SNT/WSE →
      `SNT.WA` + `PL` + sektor; NWG/WSE → `NWG.WA`; SAP/ETR → `SAP.DE`; RIO/LON →
      `RIO.L`; CRM/NYSE stays bare; fund (`NN Emerytura 2030`) keeps ticker_reference
      path; ambiguous-name catalog case stays unmatched. Update existing
      `ResolvedInstrument` assertions.
- [x] Gate: `npm run test` + `npm run build` (tsc) in `portfoliost-sheets-sync` pass.
- [x] Commit: `feat(sheets-sync): name-first catalog join + venue symbols (D24 f/up)`.

### 28.4 — Sync client ships catalog fields

- [x] `wallets-api-client.ts`: `ImportPortfolioTx` request body adds `sector`,
      `industry`, `country`, `countryCode` from the resolved instrument (nulls
      omitted); `instrumentSymbol` already reflects 28.3.
- [x] `sync.ts`: fetch `Podsumowanie!A1:AL233`, `readPodsumowanie`, pass the
      catalog into `resolveInstrument`.
- [x] Tests (`wallets-api-client.test.ts`, `transakcje-mapper.test.ts`): request body carries venue-qualified
      symbol + new fields; regression on the happy-path import.
- [x] Gate: `npm run test` + `npm run build` (tsc) in `portfoliost-sheets-sync` pass.
- [x] Commit: `feat(sheets-sync): send sector/country in import payload`.

### 28.5 — Wallets: persist fields + self-heal the "Other" sentinel

- [x] `portfoliost-wallets/src/routes/import.ts` (~240): when `tx.country` is
      provided use it and its `countryCode`, else keep the current `"Other"`
      fallback; map `tx.sector`/`tx.industry` onto positions (fallback stays
      `"Other"`); same in `portfolio-transactions.ts:206` (industry added).
- [x] `src/services/quotes.ts` (~215): enrichment fills `country`/`sector` when
      the stored value is `null`, empty, **or the `"Other"` sentinel** — so already
      imported positions self-heal on the next quotes pass without a wipe.
- [x] Tests (`routes/import.test.ts` / `quotes.test.ts`): positions persist the
      incoming sector/country; `"Other"`+`null` positions get overwritten by the
      profile country; a real-profile position keeps its stored values.
- [x] Gate: `npm run test` + `npm run build` (tsc) in `portfoliost-wallets` pass.
- [x] Commit: `feat(wallets): persist sector/country + heal 'Other' (D24 f/up)`.

### 28.6 — Mock parity + full re-import + validation

- [ ] `portfoliost/mocks/`: import/position fixtures gain `sector`/`country`/`countryCode`
      samples; `npm run mock:seed` unchanged unless seeds add positions.
- [ ] Full gates: `npm run build` + `npm run test` + `npm run test:mock` in
      `portfoliost`; `npm run test` + `npm run lint` in contracts/wallets/sheets-sync;
      dockerized `npm run test:e2e`.
- [ ] Commit: `test(portfoliost): mock parity for sector/country positions`.
- [ ] **Production re-import (requires explicit user approval):** rebuild the
      `portfoliost-sheets-sync` image, run the Job against the live spreadsheet
      (wipe + re-import), then verify read-only via `psql`:
      `positions` for SNT → company `Synektik`, country `PL`, sector not "Other";
      NWG → `Newag`, country `PL`; count remaining `country='Other'` rows — expect
      only genuinely-unknown assets (name-less funds/bonds) and report the list.
- [ ] Commit the re-import result/summary to the plan section.

### 28.7 — Closeout: google-sheets-sync.md to final status

- [ ] `docs/proposals/google-sheets-sync.md`: set status to **final/done**; document
      the Podsumowanie catalog (name-first join), venue-qualified `Symbol Yahoo`
      import, country/sector sources (catalog → exchange_reference), and the
      "(Other) Stock" root cause + self-heal.
- [ ] Update `AGENTS.md`/KB if the sync-surface notes need refreshing.
- [ ] Archive §28 into `plan-archive.md`.
- [ ] Commit: `chore: D24 follow-up closeout (venue symbols + country/sector)`.

---

