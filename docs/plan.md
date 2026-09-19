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
- [ ] Remaining (separate module work, portfoliost-instruments): `price-bars.spec.ts` "returns a valid series" fails because `price_bars_all` yields BOTH an `openst` overflow row (338.19) and the split-adjusted `stooq` row (57.625) for 2026-07-29; `dates.indexOf` picks the unadjusted one. Verified read-only via SQL. The view's source-priority/cleanup rules (price-data-architecture, "overflow kept free of rows covered by stooq") are not enforced for this overlap; needs a product/data decision in that repo. Not masked here.
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

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit per repo + mock per `AGENTS.md`; e2e against docker compose). The catalog
re-import in 34.7 touches homelab and requires explicit approval before running.
Step order mirrors the provider tier: openst → openst smoke → cachest →
instruments adapter → full stack → catalog/closeout. The `ticker_reference.asset_type`
lookup that dispatch needs is the same one D81 adds in 25.4 — implement it once
as a shared helper and reuse in both the price-bars route and the quote route.

---

### 34.1 — Read-only inventory of no-price positions + per-class quote probe

- [ ] `psql` (read-only, prod DB): `select symbol, asset_type, country,
      price_source, current_price from positions where is_open and
      (current_price is null or current_price = 0)` → group by `asset_type`;
      confirm the overlap with `country='Other'`.
- [ ] For each distinct unresolved symbol (one per class): probe live through the
      stack and record the exact outcome — e.g. `ROD1033` → `/equity/quote/ROD1033`
      (expect 404) vs `/fixedincome/ohlcv/ROD1033` (200, last close);
      `BST0327`/`ARH` bare vs `BST0327.WA` → `/equity/quote/...` (biznesradar
      scrape); `BTC` vs `BTC-USD` → `/crypto/quote/...`; `NNEP25.TFI` ·
      `ALV.DE` → `/equity/quote/...`. Save rows/status to
      `openst/tests/fixtures/no-prices/` as JSON fixtures.
- [ ] Record the required symbol normalization per class (`.WA` for Catalyst
      bonds, `-USD` pair form for crypto, bare for savings bonds) and the exact
      quote provider (obligacje computed close vs biznesradar vs crypto.route).
- [ ] Commit: `chore(openst): no-price asset inventory + quote probes`.

### 34.2 — openst: `/fixedincome/quote/{symbol}` (savings-bond current price)

- [ ] `openst/src/openbb_client.py`: add `get_bond_quote(symbol)` → last bar of
      `get_bond_ohlcv(symbol, today, today)` shaped
      `{ last_price, currency: "PLN" }` (or None when no bar / before issue date).
- [ ] `openst/src/main.py`: `GET /fixedincome/quote/{symbol}` →
      `_cached_or_404("fixedincome_quote:{symbol}", get_bond_quote, "No bond quote...")`.
- [ ] Unit tests (`test_main.py`, patch `get_bond_ohlcv`): known emission returns
      last price; unknown symbol → 404.
- [ ] Full openst compose suite (openst + biznesradar + obligacje) passes.
- [ ] Commit: `feat(openst): fixedincome quote endpoint (D79 sibling)`.

### 34.3 — openst standalone smoke (before any cachest change)

- [ ] `docker compose up -d` openst; `curl /fixedincome/quote/ROD1033` check twice
      → second call Redis HIT (key `fixedincome_quote:ROD1033`).
- [ ] Confirm the 34.1 outcome for Catalyst bonds and crypto: if equity quote with
      normalized symbol works (`.WA` / `-USD`), no new openst route is needed for
      them — note the verified symbol forms; else add the missing route here.
- [ ] Commit: `chore(openst): smoke-verify fixedincome quote + class symbol forms`.

### 34.4 — cachest: quote routes for bonds (and crypto if not yet covered)

- [ ] `cachest/config.yaml`: `OPENST_BOND_QUOTE` `/fixedincome/quote/{symbol}` →
      openst, `cache_ttl: 21600` (6h), `stale_ttl` matching
      `OPENST_BOND_OHLCV`.
- [ ] Add `test_real_config_has_bond_quote_route`; full cachest suite passes.
- [ ] If 34.1 shows crypto quotes never reach `OPENST_CRYPTO_QUOTE` because of the
      stored pair form, document the normalization here (route itself exists).
- [ ] Commit: `feat(cachest): OPENST_BOND_QUOTE route`.

### 34.5 — instruments: asset-class-aware quote dispatch

- [ ] Extract the `ticker_reference.asset_type` lookup as a shared helper (reused
      by the D81 price-bars route in 25.4): `src/db/tickerref-queries.ts`
      `assetTypeForSymbol(db, symbol)`.
- [ ] `src/adapters/cachest.ts`: add `fetchFixedincomeQuote(symbol)` →
      `/fixedincome/quote/{symbol}` and `fetchCryptoQuote(symbol)` →
      `/crypto/quote/{symbol}`.
- [ ] Route `/:symbol/quote` (`routes/instruments.ts:428`) and `/:symbol/price`
      (`instruments.ts:536`): branch on `asset_type`: `crypto` →
      `fetchCryptoQuote(venueFree(symbol))`; `bond` →
      `fetchFixedincomeQuote(venueFree(symbol))`; `corp_bond`/`fund` → existing
      equity `/equity/quote` with the 34.1-verified symbol form; default unchanged.
- [ ] `src/adapters/translate.ts`: reuse the existing quote row→`QuoteSchema`
      translator (`toQuote` at `translate.ts:119`) for bond/crypto quote rows;
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
      pass.
- [ ] Commit: `test(portfoliost): no-price bond/crypto position parity`.

### 34.7 — Venue-unresolved stocks + catalog (sheets-sync, requires approval)

- [ ] Podsumowanie catalog (`portfoliost-sheets-sync`): add venue-qualified
      `Symbol Yahoo` rows for Allianz SE (`ALV.DE`) and Nintendo Co (venue
      decided against a live stooq/yahoo probe in 34.1); `Kraj` → DE/JP.
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

Open questions (verify in 34.1, do not guess before):
- Catalyst corp-bond current price: biznesradar market quote (`/notowania/BST0327.WA`)
  vs obligacje computed close — pick per probe result.
- Stored crypto symbol form at import time (`BTC` vs `BTC-USD`) determines whether
  a normalization step is needed in `venueFreeSymbol` or the wallets store.
- Retail savings bonds have no market price by definition — "quote" = today's
  computed close from the obligacje engine and is the intended behaviour, not a bug.

---
---

---

## 35. Deploy the corp-bond catalogue sync — D80 carry-over (plan §25.3 / §25.6)

Proposal: [instruments-provider-module.md](proposals/instruments-provider-module.md) —
D80 "Catalyst bond catalogue". The 25.3 one-shot catalogue importer
(`openst/src/importers/corp_bond_catalogue.py`) was built and tested but never
deployed: the cluster `ticker_reference` still holds Stock/ETF rows only, so the
D81 price-bars routing (25.4) is a no-op for `corp_bond`/`bond`/`crypto`
(`asset_type` lookup falls back to `stock` for unlisted tickers).

Context: the importer scrapes a single server-rendered `obligacje.pl` catalogue
page (937 unique bonds) and emits a `tickerref-sync` CSV with `asset_type`
pinned to `corp_bond`, listing keys `WSE::{SYMBOL}`. **Periodicity — daily.**
The plan (D80) already specified "the daily CronJob re-imports to pick up newly
listed bonds"; the scrape is one page fetch, cached in openst Redis 24h, and the
upsert touches only `WSE::` keys, so a daily 04:45 UTC pass (staggered after the
04:30 openst bond/CPI imports) is cheap and idempotent. Weekly adanos tickersync
(04:30 Mon) is untouched — the two CSVs cover disjoint listing keys.

Repos touched: `openst` (new HTTP endpoint over the existing importer — **in
progress: route + 3 tests written, suite pending**), `cachest` (route + TTL),
`portfoliost-instruments` (new `corp-bond-catalogue-sync` script reusing
`syncTickerReference`), homelab (new `corpbondsync` CronJob in the instruments
helmrelease via app-template `type: cronjob`; tag bumps for all five images).
No contracts change (no wire shape changes). No nginx change (no new path
prefix at the gateway — the new endpoints live behind the existing
`/api/instruments`-adjacent cachest URL space and are consumed job-side).

Rules: one step = one commit; a step is marked `[x]` only after its tests pass.
Step order follows the provider tier (openst → smoke → cachest → instruments →
stack → deploy).

---

### 35.1 — openst: `GET /corp-bond/catalogue` (tickerref CSV)

- [x] `src/main.py`: `@app.get("/corp-bond/catalogue")` → lazy import
      `fetch_catalogue` + `to_tickerref_csv` from `src/importers/corp_bond_catalogue`;
      Redis-cached under key `corp_bond_catalogue` (plain string, 24h default TTL —
      same `_cache` as profile endpoints); 404 when zero rows; `text/csv` response.
      Lazy import keeps the scraper module out of service startup.
- [x] Tests in `tests/test_main.py`: 200 + `text/csv` + rows on fetch; 404 on empty
      catalogue; cache-hit path returns stored CSV without re-fetch.
- [x] Full openst pytest suite green (compose test stage).
- [x] Commit: `feat(openst): /corp-bond/catalogue CSV endpoint (D80 25.3 deploy)`.
  - Result: 261 (openst) + 69 + 53 green. Compose smoke: `curl /corp-bond/catalogue` →
    HTTP 200 `text/csv`, 937 `WSE::` rows all `asset_type=corp_bond`; second call
    served from Redis (1.5 ms vs 1021 ms first).

### 35.2 — openst standalone smoke

- [x] `docker compose up -d --build`; `curl /corp-bond/catalogue` → HTTP 200,
      `text/csv`, header + ~937 `WSE::` rows, `asset_type=corp_bond`; second call
      served from Redis (log/cache HIT).
- [x] Commit: none (verify-only step). (Ran on the portfoliost full compose stack —
      same openst runtime target — as part of 35.5.)

### 35.3 — cachest: `OPENST_CORP_BOND_CATALOGUE` route

- [x] `config.yaml`: route `/corp-bond/catalogue` → `http://openst:8080/corp-bond/catalogue`,
      `cache_ttl: 43200` (12h — half the openst TTL so the daily job always sees a
      fresh-enough scrape), same fetch timeouts as `OPENST_CORP_BOND_PROFILE`.
- [x] `test_real_config_has_corp_bond_catalogue_route`; full cachest suite green.
- [x] Commit: `feat(cachest): OPENST_CORP_BOND_CATALOGUE route (D80 25.3 deploy)`.
  - Result: 80 green. Noted: cachest re-serializes every proxied body as
    `PlainTextResponse` (content-type `text/plain`), so the instruments consumer
    accepts both `text/csv` (openst direct) and `text/plain` (via cachest).

### 35.4 — instruments: `corp-bond-catalogue-sync` script

- [x] `src/scripts/corp-bond-catalogue-sync.ts`: fetch
      `${CACHEST_URL ?? http://cachest:8080}/corp-bond/catalogue`, fail fast on
      non-200/non-text, sanity-check row count (>500 — a truncated scrape must not
      log as success and must not touch the DB), then `syncTickerReference(csv, db)`
      (existing exported helper — upserts on `listingKey`, touches only `WSE::` keys),
      log total. Exit-code-driven for k8s.
- [x] Unit tests (`corp-bond-catalogue-sync.test.ts`): CSV fetch failure → throw;
      empty/too-small CSV → abort with no DB writes; valid CSV → `syncTickerReference`
      called once; text/plain (cachest) accepted; non-text rejected.
- [x] `npm run build` + `npm run test` green.
- [x] Commit: `feat(instruments): corp-bond-catalogue-sync script (D80 25.3 deploy)`.
  - Result: 247 green.

### 35.5 — compose stack smoke (seeds local `ticker_reference`)

- [x] Full compose stack up; run `node dist/scripts/corp-bond-catalogue-sync.js`
      against the compose instruments DB; verify `ticker_reference` has ~937
      `WSE::` `corp_bond` rows.
- [x] End-to-end: `lookupAssetType` resolves `BST0327 → corp_bond` (the D81 price-bars
      leg that was a no-op now dispatches to the equity OHLCV path).
- [x] `npm run test` + e2e green.
  - Result: sync → "upserted 937 corp_bond rows"; DB `instruments.ticker_reference`
    has 937 `corp_bond` rows, `BST0327`/`WSE::BST0327` present. `lookupAssetType`:
    BST0327→corp_bond, BTC-USD→crypto, AAPL→Stock (ROD1033→null: savings bonds are
    a separate class not in this catalogue). price-bars e2e 3/3 (AAPL regression).
- [x] Commit: none (verify-only step).

### 35.6 — Cluster deploy (homelab)

- [ ] Push `openst`, `cachest`, `portfoliost-instruments` → GHA green → `gh release list`
      verifies the real `v*` tags (never tag manually).
- [ ] homelab: bump `openst` (5 occurrences: app + 4 cronjobs), `cachest` (1),
      `portfoliost-instruments` (2: app + tickersync) to the new tags; add
      `corpbondsync` CronJob to the instruments helmrelease — app-template
      `type: cronjob`, `schedule: "45 4 * * *"`, `concurrencyPolicy: Forbid`,
      `command: ["node", "dist/scripts/corp-bond-catalogue-sync.js"]`,
      `DATABASE_URL` from `postgres-pfire-pguser-portfoliost` (same secret as
      `tickersync`), env `CACHEST_URL=http://cachest:8080`, resources 50m/128Mi
      → 512Mi. No KEDA/ingress changes (no new routes).
- [ ] Commit + push homelab; Flux reconciles in ~1 min; `flux reconcile`/`kubectl`
      verify HelmReleased.
- [ ] Trigger the CronJob once (`kubectl create job --from=cronjob/corpbondsync
      -n pfire corpbondsync-now`), check logs: rows synced.
- [ ] Verify in cluster: `ticker_reference` corp_bond row count ~937 via psql;
      spot-check a `BST0327` price-bars call through the live instruments service.
- [ ] Commit: none (deploy verified by the bump commit).

### 35.7 — Closeout

- [ ] Update `instruments-provider-module.md` (D80 catalogue note: deployed, daily
      CronJob `corpbondsync`) + `openst-coverage.md` (catalogue endpoint row).
- [ ] Mark the §25.6 carry-over note resolved (plan-archive.md, one-line addendum).
- [ ] Archive §35 to `plan-archive.md`.
- [ ] Commit: `chore: D80 corp-bond catalogue sync deploy closeout`.
