# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md` / `plan-archive2.md`.

Legend: `[ ]` pending · `[x]` done

---

## 24. Google Sheets sync — Transakcje import (wallets + portfolio)

Proposal: [google-sheets-sync.md](proposals/google-sheets-sync.md) — sync the `Transakcje`
sheet of spreadsheet `1iDzR0OTHvqPbjjRSnAI4SdoD7sZOGy8uT9991sPFFps` into
`wallets.wallet_transactions` and `portfolios.transactions` / `positions` via a Kubernetes
Job triggered from the portfoliost-admin panel (jobshot). 2 024 data rows; 7 transaction
types; columns A–AM (39 total).

**Proposal corrections from live sheet inspection (2026-09-17):**

- Col 27 `Zysk/strata z opcji`, col 28 `Skumulowany zysk z opcji (PLN)` — skip.
- **Col 29 `Konto`** — account name per row; maps directly to wallet. Distinct values:
  `IB` (965), `IKE Beata` (396), `IKE Marek` (261), `Equate+` (173), `NN TFI PPK`
  (93), `NN TFI PPO` (81), `Rach. rejestrowy PKO BP` (26), `XTB` (22), `Crypto` (5),
  `Obligacje PKO SA Beata` (2). Zero empty rows — "no account column" was wrong.
- **Col 30** `Cena transakcyjna jednostki (w walucie)` — native-currency unit price;
  used as `price`. Cols 31–33: fee currency details.
- **Col 34 `Symbol`**, col 35 `Giełda`** — canonical ticker + exchange; primary
  instrument key for stocks, ETFs, bonds, Beta ETF FIZ.
- Bonds (`ROD`, `EDO`, `BST`, …): `Symbol` col populated → resolve directly via
  `ticker_reference`; no exclusion needed.
- Crypto (`BTC`, `ETH`): `Konto=Crypto`, no `Symbol` → resolve by `Aktywo` via seed.
- Funds (NN TFI, Goldman): no `Symbol` → resolve by `Aktywo` name-fold via seed.

**Imported columns:** 1–8, 12, 17, 19–21, 29–35. Skipped: 9–11, 13–16, 18, 22–28, 36–39.

**Architecture**: `portfoliost-sheets-sync` is a standalone Job repo
(`Marx2/portfoliost-sheets-sync`). It calls the `portfoliost-wallets` import API (§23)
over HTTP — **no direct DB access**. Auth (decided 2026-09-18): the sync is triggered
manually from the admin panel; the caller's Pocket-ID JWT (admin API is JWT-gated) is
passed through by the admin backend to the K8s Job as `WALLETS_API_TOKEN` — no static
service token, no CronJob.
The importer is responsible only for fetching + parsing + mapping; all DB writes and
position/balance logic go through `/api/import/transactions`.

**Dependency**: §23 (import API) must be complete before 24.3.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass.

---

### 24.1 — `ticker_reference` seed additions (instruments repo)

- [x] In `portfoliost-instruments`, add to the tickerref seed CSV:
      - **Crypto**: `BTC` → `BTC-USD` (`asset_type=crypto`), `ETH` → `ETH-USD`
        (`asset_type=crypto`).
      - **NN/Goldman funds** (no `Symbol` in sheet): `NN Emerytura 2030` →
        `NNEP30.TFI`, `NN Emerytura 2025` → `NNEP25.TFI`, `Goldman Sachs Emerytura
        2065` → `GSEM65.TFI`, `Goldman Sachs Emerytura 2060` → `GSEM60.TFI`,
        `Goldman Sachs Akcji` → `GSAK.TFI`, `NN Obligacji` → `NNOB.TFI`;
        all `asset_type=fund`.
      - **Beta ETF FIZ**: confirm `ETFBM40TR`, `ETFBTBSP`, `ETFBTCPL.WA`, `ETFBW20TR`
        exist in reference or add with `asset_type=fund`, exchange `WSE`.
      - **Noisy-name aliases**: `Text S.A.` / `Text` → `TXT` WSE; confirm abbreviated
        names audited in the proposal have aliases.
- [x] Re-run `tickerref-sync.ts`; verify row counts.
- [x] `npm run test` passes.
- [x] Commit: `feat(instruments): ticker_reference seed — crypto + fund aliases`.

### 24.2 — Scaffold `portfoliost-sheets-sync` repo

- [x] Create `Marx2/portfoliost-sheets-sync` (private) on GitHub.
- [x] Scaffold: `package.json`, `tsconfig.json`, `vitest.config.ts` — copy from
      `portfoliost-wallets`; strip Hono/Drizzle/server deps. Keep: `vitest`, `tsx`,
      `typescript`. No direct DB access — all writes go through the wallets API.
- [x] `Dockerfile`: `node:22-alpine`, `npm ci`, `tsc`, entrypoint `node dist/sync.js`.
      No healthcheck port, no server.
- [x] Env vars: `WALLETS_API_URL`, `WALLETS_API_TOKEN` (caller JWT, injected per run),
      `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
      `INSTRUMENTS_DATABASE_URL` (read-only, `ticker_reference` lookup only).
- [x] GHA: build + test on push; publish `ghcr.io/marx2/portfoliost-sheets-sync` on tags.
- [x] `npm run build` + `npm run test` (empty suite) pass.
- [x] Commit: `chore: scaffold portfoliost-sheets-sync repo`.

### 24.3 — Google Sheets REST client + token refresh

- [x] `src/sheets-client.ts`: `fetchSheet(spreadsheetId, range, accessToken):
      Promise<string[][]>` — plain `fetch` against Sheets REST API v4; no SDK.
      Always `valueRenderOption=FORMATTED_VALUE` (parser is built for the PL
      display format); empty range → `[]`.
- [x] `refreshToken(clientId, clientSecret, refreshToken): Promise<string>` — POST to
      `https://oauth2.googleapis.com/token`; called once at Job startup.
- [x] Unit tests: mocked `fetch`; URL, auth header, empty-range, token refresh.
- [x] Commit: `feat(sheets-sync): Sheets REST client + OAuth2 token refresh`.

### 24.4 — Row parser: column mapping, PL decimal, split restatement

- [x] `src/transakcje-parser.ts`:
      - `parsePlDecimal(raw: string): number | null` — strips NBSP/space/` zł`,
        `,`→`.`, null for `-`/empty.
      - `parseRow(cols: string[]): RawTransakcjeRow` — maps cols 1–8, 12, 17, 19–21,
        29–35; `externalId` = SHA256 of `date|typ|aktywo|quantity|currency|kursPln`.
      - `restateSplits(rows: RawTransakcjeRow[]): RawTransakcjeRow[]` — per asset:
        `quantity *= F`, `priceNative /= F`, `pricePln /= F` for rows before split
        date; validate against col 11; throw `SplitMismatchError` on mismatch.
        Known splits: Amazon ×20 (2022-06-06), Alphabet ×20 (2022-07-15), Dino ×10
        (2025-07-30).
- [x] Unit tests: decimal edge cases; BUY/DIV/SELL/DEPOSIT rows; Amazon split fixture.
- [x] `npm run test` passes.
- [x] Commit: `feat(sheets-sync): Transakcje row parser + split restatement`.

### 24.5 — Instrument resolver + Konto map

- [x] `src/instrument-resolver.ts`: `resolveInstrument(row, instrumentsDb)`:
      symbol-primary (`ticker_reference` by `ticker` + `exchange`; with exchange
      → venue-strict, without → ticker must be unique across venues); aktywo-fallback
      (name-fold against `name`/`aliases`; Polish ąćęłńśźż transliterated — no NFD
      decomposition); ambiguous fold → unmatched; unmatched → `{ ticker: aktywo,
      assetType: "stock", matched: false }`. Index loaded once per connection
      (WeakMap cache) — ~60k rows in memory.
- [x] `src/konto-map.ts`: static map `Konto` → `{ walletName, currency, baseCurrency }`
      for all 10 known values; throws on unknown.

      | Konto                     | walletName                  | currency | baseCurrency |
      |---------------------------|-----------------------------|----------|--------------|
      | `IB`                      | IBKR                        | USD      | PLN          |
      | `Equate+`                 | Equate+                     | EUR      | PLN          |
      | `IKE Marek`               | IKE Marek                   | PLN      | PLN          |
      | `IKE Beata`               | IKE Beata                   | PLN      | PLN          |
      | `NN TFI PPK`              | NN TFI PPK                  | PLN      | PLN          |
      | `NN TFI PPO`              | NN TFI PPO                  | PLN      | PLN          |
      | `Rach. rejestrowy PKO BP` | Rach. rejestrowy PKO BP     | PLN      | PLN          |
      | `XTB`                     | XTB                         | PLN      | PLN          |
      | `Crypto`                  | Crypto                      | PLN      | PLN          |
      | `Obligacje PKO SA Beata`  | Obligacje PKO SA Beata      | PLN      | PLN          |

- [x] Unit tests: symbol-primary; aktywo-fallback; unmatched; all 10 Konto values;
      unknown throws.
- [x] `npm run test` passes.
- [x] Commit: `feat(sheets-sync): instrument resolver + Konto→wallet map`.

### 24.6 — Wallets API client

- [x] `src/wallets-api-client.ts`: typed `fetch` wrappers for `POST
      /api/import/wallets/bootstrap`, `POST /api/import/transactions`, `GET
      /api/import/sync-runs` (plus `POST /api/import/portfolios/bootstrap` and
      `DELETE /api/import/source/:externalSource` for §24.8). Auth:
      `Authorization: Bearer $WALLETS_API_TOKEN`. `createWalletsClient(baseUrl, token)`
      + `walletsClientFromEnv()`; enforces the 500-row batch cap client-side.
- [x] Unit tests: mocked fetch; URL, headers, payload shapes.
- [x] Commit: `feat(sheets-sync): wallets import API client`.

### 24.7 — Row mapper: `RawTransakcjeRow` → `ImportTransaction`

- [x] `src/transakcje-mapper.ts`: `mapRow(row, walletUuidMap, portfolioId):
      ImportTransaction` — converts parser output to the `POST /api/import/transactions`
      payload shape (row is enriched with `instrument` by the orchestrator):
      - `walletName` from `konto-map`; `walletTx.type` from `Typ` mapping
        (`Kupno→INVEST`, `Sprzedaż→SELL`, `Div→DIVIDEND`, `Wpłata→DEPOSIT`,
        `Wypłata→WITHDRAWAL`, `Split→ADJUSTMENT`, `Sell Call Option→SELL`).
      - `walletTx.amount` = col 19 `cashFlow` (PLN signed); `currency` = col 20;
        `exchangeRate` = col 21; `rateSource=manual`.
      - `walletTx.fees` = col 33 when `feeCurrency ≠ PLN` else col 7;
        `feeCurrency` = col 31; `feeExchangeRate` = col 32; `feeRateSource=manual`.
        Fees applied to both legs (proposal col 7).
      - `portfolioTx` (omit for DEPOSIT/WITHDRAWAL/ADJUSTMENT): `price` = col 30
        (post-restatement; fallback `|cashFlow| ÷ rate ÷ qty` only when col 30 is
        empty — never overrides a sheet value); `quantity` positive (post-
        restatement); `type` = BUY/SELL/DIVIDEND; `realizedGainLoss` from col 17 on
        Sprzedaż; `assetType` from resolved instrument (uppercased).
      - **`portfolioTx.originalQuantity`** = `row.rawQuantity` (pre-restatement),
        null when raw == restated; **`originalPrice`** = `row.rawPriceNative` (same).
      - Options: `assetType=OPTION`, `optionType=CALL`, `direction=SHORT`,
        `contractSize=100`; strike/expiry null.
      - Unknown Typ / wallet missing from bootstrap map / no usable qty or price
        → throw (loud abort, never drop a row).
- [x] `portfoliost-wallets` (feecddd): `ImportPortfolioTxSchema` gains
      `direction`/`optionType`/`contractSize`; `direction=SHORT` = short-option
      OPEN (position-creating regardless of type) with its own lot distinct from
      the same-symbol underlying equity lot (direction-filtered position lookup);
      new test: SAP equity + written calls.
- [x] `@marx2/contracts` (ea74c37): `ImportPortfolioTx` option fields; fixed
      pre-existing broken YAML indentation (13-space keys) that invalidated the
      whole spec.
- [x] Unit tests: pre-split BUY row → `originalQuantity ≠ quantity`,
      `originalPrice ≠ price`; post-split BUY row → both null; DEPOSIT → null.
- [x] `npm run test` passes (sheets-sync 64, wallets 296).
- [x] Commit: `feat(sheets-sync): row mapper → ImportTransaction + original values`.

### 24.8 — Orchestrator

- [x] `src/sync.ts` (entrypoint):
      1. If `--wipe` / `WIPE=true`: `DELETE /api/import/source/google-sheets:transakcje`
         and log deleted counts. Skip on production CronJob.
      2. Refresh OAuth2 token.
      3. `POST /api/import/wallets/bootstrap` with all 10 wallets → UUID map.
      4. `POST /api/import/portfolios/bootstrap` → `portfolioId`.
      5. `fetchSheet` → `parseRow` → `restateSplits` → `resolveInstrument` → `mapRow`.
      6. Batch into groups of ≤ 500; `POST /api/import/transactions` per batch.
      7. Log total inserted/skipped/errors and `syncRun.id`.
- [x] Smoke (clean run): `docker compose run --rm sheets-sync node dist/sync.js --wipe`
      against local stack; assert `GET /api/import/sync-runs` shows completed run with
      `insertedWtx > 0`.
- [x] Smoke (idempotent re-run): run again without `--wipe`; assert `inserted=0,
      skipped=<all rows>`.
- [x] Add `sheets-sync` service to `portfoliost/docker-compose.yml` (build
      `../portfoliost-sheets-sync`, env `sheets-sync.env`, `restart: no`).
- [x] `npm run test` passes.
- [x] Commit: `feat(sheets-sync): sync orchestrator + wipe support`.
- **Real-data decisions (2024 rows forced these; all loud, none silent):**
  - `mapRow` returns `null` for **no-op rows** (zero quantity AND zero cash —
    e.g. sheet row 29 Div SAP): nothing to import (the wallets DB also forbids
    zero-amount non-ADJUSTMENT wallet txs, `ck_wtx_amount_nonzero`); the Job logs
    each (`noOp=1`).
  - **Zero-quantity rows with cash** (sheet row 206 Kupno Intuit, −0.43 zł):
    wallet cash leg only, no portfolio leg (the sheet's col 11 is unchanged);
    Job logs each (`walletOnly=1`).
  - **Zero-price buys** (Syn2bio 21, Creotech 13 — free allotments, cash 0):
    `ImportPortfolioTx.price` relaxed to `nonnegative` (portfoliost-wallets),
    wallet leg books `ADJUSTMENT` (zero cash); zero-cost lot, `averageCostBasis=0`.
  - **Display-precision sell drift**: sheet quantities are 6-decimal rounded,
    so a full-position exit can exceed the rounded buy sum by ~1e-6 relative
    (GSEM60: 995.290675 vs 995.290673). `processImportSell` clamps within
    `max(1e-9, qty·1e-6)` and errors beyond.
  - `ticker_reference` aliases added (bundled CSV + local DB): `RGEN` +
    `repligen corp`; `DTLA` + `ishares treasury bond 20 yr ucits etf usd a`;
    `IUFS` + `ishares s p 500 financials sector ucits etf usd a` — rows with an
    empty Symbol col now resolve instead of splitting positions under a
    name-as-symbol.
  - Smoke result: clean `--wipe` run `inserted=2016 skipped=7 errors=0
    walletOnly=1 noOp=1` (2024 rows; 7 = duplicate-`externalId` pairs by
    idempotency design); re-run `inserted=0 skipped=2023 errors=0`, run row
    `status=done`.
  - **Known sheet typos left as-is** (symbol col authoritative; report to owner):
    `Monolithic Power Systems Inc` rows tagged `TSM`, `Yum China` tagged `PAYC`,
    `Vercom SA` tagged `VER`, `Big Cheese Studio SA` tagged `BCS`/`MBR`.

### 24.9 — Sheets sync job from the admin panel

Approach change (2026-09-18, supersedes the CronJob design): no schedule, no static
service token. The admin panel (JWT-gated, Pocket-ID) triggers the sync on demand via
jobshot; the backend passes the **caller's own JWT** to the K8s Job as
`WALLETS_API_TOKEN`, so the job authenticates to the wallets import API exactly like a
browser session. All pfire services share one database, so the admin's `DATABASE_URL`
serves as the Job's `INSTRUMENTS_DATABASE_URL` (read-only `ticker_reference` lookup).

Job spec (jobshot `POST /api/run-job`):
- image `ghcr.io/marx2/portfoliost-sheets-sync:<tag>`, command `node dist/sync.js`,
  optional `--wipe` (full re-import) from the UI.
- `secretName: sheets-sync-secrets` (envFrom) — `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.
- per-run `env` from the admin backend: `WALLETS_API_TOKEN` (caller JWT from the
  request), `WALLETS_API_URL` (= admin `API_WALLETS_URL`),
  `INSTRUMENTS_DATABASE_URL` (= admin `DATABASE_URL`).
- jobshot unchanged — its `env` map already supports arbitrary values.

Note: 24.3–24.8 commits were never pushed; `v1.0.1` (2026-09-18) is the first release
containing the full sync (v1.0.0 was the bare scaffold).

- [ ] Push `portfoliost-sheets-sync` main → GHA release `v1.0.1` (done 2026-09-18,
      image built; record here when the rest of this step lands).
- [ ] `portfoliost-admin`: `POST /api/admin/jobs/sheets-sync/run` (`{ wipe?: boolean }`)
      + `GET /api/admin/jobs/sheets-sync/status` + `GET .../log` — build the jobshot
      payload above; duplicate-run guard (409); `job_run` row kind `sheets_sync`
      (backend poller tracks it). Unit tests: payload carries the request JWT,
      wipe → `["--wipe"]`, 409 while running. Commit + release.
- [ ] `portfoliost` (SPA): `src/api/adminJobs.ts` — `runSheetsSync`,
      `getSheetsSyncStatus`, `getSheetsSyncLog`; `JobsView.vue` — "Google Sheets"
      card: Run Sync + Wipe & re-import (confirm), status badge, last-run info,
      60 s polling (stooq pattern). Commit + release.
- [ ] `homelab/cluster/apps/pfire/portfoliost-sheets-sync/`: `sheets-sync-secrets`
      (Google creds, postBuild substitution) + `ks.yaml` + app kustomization (no
      HelmRelease — image is pinned in the admin job spec); add
      `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` to `tmpl/cluster-secrets.yaml`;
      tag bumps for the admin + portfoliost releases. `kubectl kustomize` renders
      cleanly. Commit: `chore(homelab): portfoliost-sheets-sync admin job secret`.
- [ ] E2E: trigger the sync from the admin panel against the cluster; assert
       `GET /api/import/sync-runs` shows a completed run with `insertedWtx > 0`.

**Known issue (2026-09-19, fix later) — pfire postgres CPU saturation from price-bar
backfill.** After the full sheets re-import (~2000 txs → 100+ positions), the
value-snapshot backfill hammers `instruments.price_bars_all` with per-symbol
`select max(date) … where symbol = ?` + cursor `FETCH 100` loops, 10+ concurrent,
each 15–21 s. The pfire postgres pod (node `kura`) pegs the node at ~100 % CPU;
probe timeouts cascade cluster-wide (metallb/longhorn/loki …) and **k8s deployment
rollouts in `pfire` time out** ("timeout waiting for Deployment InProgress") —
Helm/Flux then rolls back. Symptom chain observed 2026-09-19: wallets v1.1.38 +
admin v1.0.46 rollbacks; `pg_terminate_backend` on the active queries immediately
drops node load to ~16 %. Fix candidates: bound backfill concurrency, index
`price_bars_all(symbol, date)` (check existing index), batch the max-date lookups,
or rate-limit the backfill worker.

### 24.10 — Closeout

- [ ] Update `google-sheets-sync.md`: status **implemented**; record col 29 `Konto`;
      close "no account column" follow-up; mark bond decision 6 superseded.
- [ ] Verify via `GET /api/import/sync-runs`: completed run, `insertedWtx ≈ 2024`;
      spot-check 5 SELL rows for `realizedGainLoss`; 3 split-restated BUY rows.
- [ ] Archive to `plan-archive.md`.
- [ ] Commit: `chore: google-sheets-sync closeout`.

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

