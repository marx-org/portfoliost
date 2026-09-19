# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md`.

Legend: `[ ]` pending · `[x]` done

---

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
- [x] Remaining (separate module work, portfoliost-instruments): `price-bars.spec.ts` "returns a valid series" failed because `price_bars_all` yields BOTH an `openst` overflow row (338.19) and the split-adjusted `stooq` row (57.625) for 2026-07-29; `dates.indexOf` picked the unadjusted one. Fixed read-only in `portfoliost-instruments@0c03214`: the price-bars query orders `stooq` rows ahead of `openst` overflow rows on equal dates (deterministic stooq-first; unit test added), so the split-adjusted value wins. The duplicate rows themselves remain in the view (the importer needs them) — data-level dedup stays an optional product/data decision in that repo. Verified 2026-09-20: `tests/e2e/price-bars.spec.ts` 3/3 against the compose stack.
  - Sources: homelab-deploy skill, `~/prv/homelab/homelab`, live read-only Kubernetes queries using `~/.kube/homylab` (2026-09-17). Wallets FX Sync and Instruments Ticker Sync confirmed; OpenST bond-import, bond-archive, cpi-import, and suspended cpi-seed were missing from the map.
  - Read-only cluster result: wallets fxsync `10 17 * * *`; instruments tickersync `30 4 * * 1`; OpenST bond-import and cpi-import `30 4 * * *`, bond-archive `0 6 3 * *`, cpi-seed `0 5 1 1 *` (suspended). All use controller timezone. No deployments were modified.
  - Baseline blockers: auth expected hidden password form although compose enables it; its OIDC-only test now explicitly overrides runtime configuration before application boot (no production change). Combined auth/topology E2E passes 16/16. AAPL price-bars remains failing: read-only SQL confirms both `openst` and split-adjusted `stooq` rows for July 29/30 in `price_bars_all`; expectations and seeds unchanged. Tracked as the remaining item above.



## 34. Holdings with no current price — asset-class-aware quote routing (D81 sibling)

Proposal: no separate file — this is a defect-fix plan extending
[price-data-architecture.md](proposals/price-data-architecture.md) and the D81
routing table in [instruments-provider-module.md](proposals/instruments-provider-module.md).

Some near-production positions show no current price; the affected assets are
almost all in the "(Other) Stock/Bond" row group, i.e. `country='Other'`
(the §28.6 sentinel bucket): retail savings bonds (`ROD*`/`EDO*`), Catalyst
corp-bond codes, PL TFI sub-funds, crypto (`BTC`/`ETH`), and two venue-unresolved
foreign stocks (Allianz SE, Nintendo Co). Verified read-only in the code: wallets
`refreshQuotes` (`portfoliost-wallets/src/services/quotes.ts:71`) asks
`GET /api/instruments/:symbol/quote`, and that route
(`portfoliost-instruments/src/routes/instruments.ts:428`) unconditionally proxies
`cachest fetchQuote` → `/equity/quote/{symbol}`. There is **no fixedincome quote**
(cachest has `/fixedincome/ohlcv` + profile only, openst has no
`/fixedincome/quote`) and **no crypto/fund quote branch** in the instruments quote
route, so those classes 404 and wallets marks `priceSource='fallback'` with no
price. `country='Other'` is *correlated*, not causal — the causal gap is the
equity-only quote path. `openbb_crypto` already exposes `get_crypto_quote`
(`openst/src/openbb_client.py:457`, route `/crypto/quote/{pair}`) and
`scrape_quote` already handles Catalyst `.WA` + `.TFI` fund symbols
(`openst/plugins/openbb_biznesradar/openbb_biznesradar/scraper.py:150`) — the
wiring in instruments/cachest is what is missing.

Repos touched: `openst`, `cachest`, `portfoliost-instruments`,
`portfoliost-sheets-sync` (step 34.7 only), `portfoliost` (mocks/tests). No
`@marx2/contracts` change expected — the `Quote` contract shape is reused.

Review 2026-09-20 (post D80/D81/D82, §35 deployed):
- D81 (§25.4) already ships the `ticker_reference.asset_type` lookup —
  `normalizeAssetType` + `lookupAssetType` live in `src/services/price-bars.ts`
  (not `db/tickerref-queries.ts`); 34.5 relocates them to a shared home instead
  of re-implementing.
- The D80 catalogue sync (§35, deployed) already seeded 937 `corp_bond` rows into
  `ticker_reference` (BST0327 → corp_bond verified in §35.5), so 34.5 dispatch
  resolves Catalyst codes in prod without extra seeding.
- cachest already routes `OPENST_CRYPTO_QUOTE` (D78, 6h TTL) → 34.4 is
  bond-quote only.
- `portfoliost-instruments/src/adapters/cachest.ts` still has no
  `fetchCryptoQuote` / `fetchFixedincomeQuote` (verified 2026-09-20); the OHLCV
  routes' `fetchOhlcvWithBondFallback` (D79) is the pattern to mirror for the
  quote route.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit per repo + mock per `AGENTS.md`; e2e against docker compose). The catalog
re-import in 34.7 touches homelab and requires explicit approval before running.
Step order mirrors the provider tier: openst → openst smoke → cachest →
instruments adapter → full stack → catalog/closeout. The `ticker_reference.asset_type`
lookup that dispatch needs is the same one D81 adds in 25.4 — implement it once
as a shared helper and reuse in both the price-bars route and the quote route.

---

### 34.1 — Read-only inventory of no-price positions + per-class quote probe

- [x] `psql` (read-only, prod DB): `select symbol, asset_type, country,
      price_source, current_price from positions where is_open and
      (current_price is null or current_price = 0)` → group by `asset_type`;
      confirm the overlap with `country='Other'`. Expect Catalyst codes to already
      carry `asset_type=corp_bond` from the D80 catalogue sync (§35); if any are
      missing, add them to the openst catalogue CSV (importer), not by hand-seeding.
      **Result (2026-09-20): 82 open rows, all `price_source='manual'`, all
      `price_as_of NULL`** — stale since the §28.6 recompute (2026-09-19 21:47 UTC),
      where 18 rows (AMZN, GOOGL, PL `.WA`, RIO.L and even corp bond `BST0327` =
      100.52) got quotes in the same pass. Groups: 25 savings bonds (BOND, Other),
      4 name-stored TFI funds + `ALLIANZ SE` (STOCK, Other), and ~53 plain
      US/PL/foreign stocks (IBKR, Rach. rejestrowy PKO BP, IKE…) whose quotes work
      live (stale state, self-heal on next read); 1 `SAP.DE` OPTION (no options
      branch — out of scope). No open crypto positions currently (Crypto portfolio
      empty); the crypto branch stays for completeness. Catalyst codes: none are
      open positions today (BST0327 is, with a price) — no missing catalogue rows.
- [x] For each distinct unresolved symbol (one per class): probe live through the
      stack and record the exact outcome — e.g. `ROD1033` → `/equity/quote/ROD1033`
      (expect 404) vs `/fixedincome/ohlcv/ROD1033` (200, last close);
      `BST0327`/`ARH` bare vs `BST0327.WA` → `/equity/quote/...` (biznesradar
      scrape); `BTC` vs `BTC-USD` → `/crypto/quote/...`; `NNEP25.TFI` ·
      `ALV.DE` → `/equity/quote/...`. Save rows/status to
      `openst/tests/fixtures/no-prices/` as JSON fixtures.
      **Result: fixtures committed** — `no-price-inventory.json` (82 rows) +
      `quote-probes.json` (live prod openst, read-only).
- [x] Record the required symbol normalization per class (`.WA` for Catalyst
      bonds, `-USD` pair form for crypto, bare for savings bonds) and the exact
      quote provider (obligacje computed close vs biznesradar vs crypto.route).
      **Verified forms:** corp bond `BST0327` **and** `BST0327.WA` both 200 on the
      equity quote (biznesradar dispatch, D80) → no normalization for
      corp_bond/fund; crypto pair `BTC-USD` only (bare `BTC` 404) → stored symbol
      must be the pair; savings bond bare `ROD1033` (equity 404,
      `/fixedincome/ohlcv` computed close 200); fund `NNEP25.TFI` 200; foreign
      `ALV.DE` / `7974.T` / `SAP.DE` 200. **Shape gotcha:** the crypto quote row
      uses `price` (not `last_price`) — `toQuote` (or the adapter) must map it.
- [x] Commit: `chore(openst): no-price asset inventory + quote probes`.

### 34.2 — openst: `/fixedincome/quote/{symbol}` (savings-bond current price)

- [x] `openst/src/openbb_client.py`: add `get_bond_quote(symbol)` → last 1–2 bars of
      `get_bond_ohlcv(symbol, …)` over a recent window (e.g. last 30 days — savings
      bonds move infrequently, so today alone may not yield a prev_close) shaped
      `{ last_price, prev_close, change, change_percent, currency: "PLN" }` —
      equity-quote-shaped so instruments' existing `toQuote` reuses it unchanged
      (or None when no bar / before issue date).
- [x] `openst/src/main.py`: `GET /fixedincome/quote/{symbol}` →
      `_cached_or_404("fixedincome_quote:{symbol}", get_bond_quote, "No bond quote...")`.
- [x] Unit tests (`test_main.py`, patch `get_bond_ohlcv`): known emission returns
      last price; unknown symbol → 404.
      (4 new tests: two-bar shape incl. 30-day window end-anchored to today,
      single-bar omits prev_close, None → 404, second call served from Redis.)
- [x] Full openst compose suite (openst + biznesradar + obligacje) passes.
      (268 + 69 + 53, `docker compose --profile test run --rm test`.)
- [x] Commit: `feat(openst): fixedincome quote endpoint (D79 sibling)`.

### 34.3 — openst standalone smoke (before any cachest change)

- [x] `docker compose up -d` openst; `curl /fixedincome/quote/ROD1033` check twice
      → second call Redis HIT (key `fixedincome_quote:ROD1033`).
      (Local compose: seeded `openst.bond_series` (449) + `openst.cpi_12m` (320)
      from the prod `openst` DB read-only. ROD1033 → 200 `last_price 151.99 PLN,
      prev_close 151.97, date 2026-09-19`; key `fixedincome_quote:ROD1033` exists
      after call 1, call 2 = 200 in ~12 ms (HIT). EDO0232 (12y EDO) → 200 147.03.
      UNKNOWN999 → 404 "No bond quote for …".)
- [x] Confirm the 34.1 outcome for Catalyst bonds and crypto: if equity quote with
      normalized symbol works (`.WA` / `-USD`), no new openst route is needed for
      them — note the verified symbol forms; else add the missing route here.
      (Confirmed in prod 34.1: corp bond `BST0327` bare AND `.WA` → 200 on the
      equity quote; crypto `BTC-USD` 200 / bare `BTC` 404. No new openst route
      needed → no openst code change in this step; the commit is the plan closeout.)

### 34.4 — cachest: quote routes for bonds (and crypto if not yet covered)

- [x] `cachest/config.yaml`: `OPENST_BOND_QUOTE` `/fixedincome/quote/{symbol}` →
      openst, `cache_ttl: 21600` (6h), `stale_ttl` matching
      `OPENST_BOND_OHLCV`. Crypto is already covered by `OPENST_CRYPTO_QUOTE`
      (D78) — nothing to add there.
- [x] Add `test_real_config_has_bond_quote_route`; full cachest suite passes.
      (81 passed incl. the new route test; knowledge graph refreshed.)
- [x] If 34.1 shows crypto quotes never reach `OPENST_CRYPTO_QUOTE` because of the
      stored pair form, document the normalization here (route itself exists).
      (34.1: `BTC-USD` 200 / bare `BTC` 404 — the route is fine; the stored-symbol
      normalization happens in the instruments dispatch, see 34.5.)
- [x] Commit: `feat(cachest): OPENST_BOND_QUOTE route`.

### 34.5 — instruments: asset-class-aware quote dispatch

- [ ] Relocate the D81 helpers (`normalizeAssetType` + `lookupAssetType` from
      `src/services/price-bars.ts`) into `src/db/tickerref-queries.ts`
      (`assetTypeForSymbol(db, symbol)` + the normalizer), with `services/price-bars.ts`
      re-exporting them — one shared implementation used by both the D81 price-bars
      dispatch and the new quote dispatch (no re-implementation).
- [ ] `src/adapters/cachest.ts`: add `fetchFixedincomeQuote(symbol)` →
      `/fixedincome/quote/{symbol}` and `fetchCryptoQuote(symbol)` →
      `/crypto/quote/{symbol}` (mirror the D79 `fetchOhlcvWithBondFallback` pattern).
- [ ] Route `/:symbol/quote` (`routes/instruments.ts:413`) and `/:symbol/price`
      (`instruments.ts:518`): branch on `asset_type`: `crypto` →
      `fetchCryptoQuote(venueFree(symbol))`; `bond` →
      `fetchFixedincomeQuote(venueFree(symbol))`; `corp_bond`/`fund` → existing
      equity `/equity/quote` with the 34.1-verified symbol form; default unchanged.
- [ ] `src/adapters/translate.ts`: reuse the existing quote row→`QuoteSchema`
      translator (`toQuote` at `translate.ts:155`) for bond/crypto quote rows;
      `currency` defaults to `PLN`/quote-provider value.
- [ ] Unit tests (`routes/instruments.test.ts` + `translate.test.ts`): correct
      adapter per `assetType`; AAPL regression unchanged; savings bond resolves.
- [ ] `npm run build` + `npm run test` + `npm run test:stack` pass.
- [ ] Commit: `feat(instruments): asset-class-aware quote dispatch (34)`.

### 34.6 — Full compose stack smoke + mock parity

- [ ] `docker compose up -d --build`; curl via cachest for one savings bond, one
      Catalyst bond, one crypto pair, one PL fund, and AAPL regression; second
      call → Redis HIT per route; wallets `refreshQuotes` no longer falls back for
      those symbols.
- [ ] `portfoliost/mocks/`: add bond/crypto positions to seed fixtures with
      `country='Other'` so `test:mock` and E2E assert current-price parity for
      those classes; `npm run test` + `npm run test:mock` + `npm run test:e2e`
      pass (incl. `price-bars.spec.ts` regression — stooq-first ordering from
      `0c03214` must keep holding).
- [ ] Commit: `test(portfoliost): no-price bond/crypto position parity`.

### 34.7 — Venue-unresolved stocks + catalog (sheets-sync, requires approval)

- [ ] Podsumowanie catalog (`portfoliost-sheets-sync`): add venue-qualified
      `Symbol Yahoo` rows for Allianz SE (`ALV.DE`) and Nintendo Co (venue
      decided against a live stooq/yahoo probe in 34.1); `Kraj` → DE/JP.
- [ ] Version coupling (D24): the new sheets-sync image must not send keys a
      deployed `portfoliost-wallets` rejects — check the live wallets tag in
      homelab before pinning the sheets-sync release.
- [ ] Re-run the prod sync Job (wipe + re-import — **explicit user approval**);
      verify read-only: Allianz/Nintendo positions now have country and a
      `price_source='quote'` current price.
- [ ] Commit: `feat(sheets-sync): resolve Allianz/Nintendo venues (34)`.

### 34.8 — Closeout

- [ ] Update `openst-coverage.md`: fixedincome quote route row; crypto/bond quote
      dispatch table for instruments.
- [ ] Update `google-sheets-sync.md` / `instruments-provider-module.md` statuses if
      affected.
- [ ] Archive §34 to `plan-archive.md`; add §28.6 cross-reference.
- [ ] Commit: `chore: §34 closeout (asset-class quotes)`.

Open questions (verified in 34.1, 2026-09-20):
- ~~Catalyst corp-bond current price: biznesradar market quote vs obligacje
  computed close —~~ **resolved:** the equity quote (biznesradar) serves it —
  `BST0327` got a live quote through the existing path during the §28.6 recompute;
  obligacje computed close stays for savings bonds only.
- ~~Stored crypto symbol form (`BTC` vs `BTC-USD`) determines whether a
  normalization step is needed —~~ **resolved:** no open crypto positions exist
  today; `ticker_reference` maps `BTC → BTC-USD`; bare `BTC` 404s on
  `/crypto/quote` → the crypto dispatch must normalize a bare ticker to the
  `-USD` pair (see 34.5).
- Retail savings bonds have no market price by definition — "quote" = today's
  computed close from the obligacje engine and is the intended behaviour, not a
  bug. **Confirmed:** `/fixedincome/ohlcv/ROD1033` returns computed daily closes
  (151.73 on 2026-09-04) for the full recent window.
