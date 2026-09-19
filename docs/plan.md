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

- [x] Push `portfoliost-sheets-sync` main → GHA release. Note: `v1.0.2` tag exists but has no
  release (GHA auto-bumped to `v1.0.3`); the admin job spec pins
  `v1.0.3` (stable date-sort + 1:1 wallet↔portfolio).
- [x] `portfoliost-admin`: `POST /api/admin/jobs/sheets-sync/run` (`{ wipe?: boolean }`)
      + `GET /api/admin/jobs/sheets-sync/status` + `GET .../log` — build the jobshot
      payload above; duplicate-run guard (409); `job_run` row kind `sheets_sync`
      (backend poller tracks it). Unit tests: payload carries the request JWT, wipe → `["--wipe"]`,
  409 while running. Commit + release (`v1.0.47`, 2026-09-19; the sheets-sync job image pin had the
  same GHA off-by-one — `v1.0.2` → `v1.0.3`).
- [x] `portfoliost` (SPA): `src/api/adminJobs.ts` — `runSheetsSync`,
      `getSheetsSyncStatus`, `getSheetsSyncLog`; `JobsView.vue` — "Google Sheets"
      card: Run Sync + Wipe & re-import (confirm), status badge, last-run info, 60 s polling (stooq
  pattern). Commit + release (`v1.0.166`, 2026-09-19).
- [x] `homelab/cluster/apps/pfire/portfoliost-sheets-sync/`: `sheets-sync-secrets`
      (Google creds, postBuild substitution) + `ks.yaml` + app kustomization (no
      HelmRelease — image is pinned in the admin job spec); add
      `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` to `tmpl/cluster-secrets.yaml`; tag bumps for
  the admin + portfoliost releases. Applied 2026-09-18.
- [x] E2E: trigger the sync from the admin panel against the cluster — run 21
      (2026-09-19 10:54 local, image `v1.0.3`, wipe): job **Complete**,
      `status=done`, `inserted=2016 skipped=7 errors=0 walletOnly=1 noOp=1`
      (matches the §24.8 smoke counts exactly).

**Deployment incident (2026-09-19, resolved) — homelab tag bump off-by-one.**
The §24.9 tag bumps pinned `admin v1.0.45` / `wallets v1.1.37` — tags that GHA never released
(auto-bump produced `v1.0.46` / `v1.1.38` instead). Helm upgrades timed out on `ImagePullBackOff`
(rollout never ready), and the stuck
`pending-upgrade` helm revisions left both HelmReleases `Stalled/RetriesExceeded`
/ blocked, wedging the kustomizations for a day. Fixed by homelab `ca03848ff`
(admin `v1.0.47`, wallets `v1.1.38`, SPA `v1.0.166`); the spec change cleared the Stalled state and
all three rolled out clean. Lesson: after pushing a service, wait for the GHA release and pin the
tag it actually created.

**Sync row errors (2026-09-19, all resolved via reference data — nothing left in
the sheet).** Run 11 (first admin-triggered wipe) failed with 5 row errors. All
five were `ticker_reference` gaps, not sheet typos — the cluster table had lost
the §24.8 manual aliases (the live tickersync upserts from adanos and resets the
column) and the sheet's naming/venue variants don't name-fold onto the upstream
names:
- RGEN buy 0.2297 (sheet row 159, "Repligen Corp", empty symbol col) → ref name
  folds to "repligen corporation", no "repligen corp" alias → name-as-symbol.
  Fixed by `NASDAQ::RGEN` alias `repligen corp`.
- DTLA buy 64 (row 703, venue `LON`), IUFS sell 24 (row 1673, `LON`), IUFS buy
  45 (row 1878, `LON`) → venue-strict match misses (`LON` ≠ ref venue `LSE`)
  and the name-fold fallback needed the full-name aliases, missing in-cluster.
  Fixed by `LSE::DTLA` / `LSE::IUFS` full-name aliases.
- ASML sell 0.4909 (row 852) → ASML buy 0.1028 (row 167, "ASML Holding NV")
  didn't resolve: ref name "ASML Holding N.V." folds to "asml holding n v" vs
  sheet "asml holding nv". Fixed by `NASDAQ::ASML` alias `asml holding nv`.
Persistence: `ALIAS_OVERRIDES` in `tickerref-sync` re-applies all four after
every upstream sync (instruments `010921b` + `2c9912e`, release `v1.0.48`,
homelab `5c23d5b81`). Optional sheet-side cleanup (owner): normalize the Giełda
col `LON` → `LSE` on rows 703/1673/1878 — with the aliases this is now moot.

**Known bug (2026-09-19, fix later) — `wallets.sync_runs` stores only the last
batch's counts.** The import API upserts the run row per batch (≤500 rows)
without accumulating, so after a 5-batch run `inserted_wtx` reads 24 (batch 5)
instead of 2011. The §24.10 verification "insertedWtx ≈ 2024" will read wrong
until the API accumulates (or the job POSTs a final summary update).

**Known bug (2026-09-19, fix later) — SPA admin route bounces on hard reload.**
`router.beforeEach` checks `auth.isAdmin` synchronously, but on a fresh page
load `user` is null until `fetchMe` resolves, so `to.meta.admin` routes redirect
to `/investments` (only soft navigation after login works). Fix: await
`fetchMe()` (once per session) in the guard before the admin check, or hydrate
the store before the initial navigation.

**Fixed (2026-09-19) — pfire postgres CPU saturation from price-bar backfill.**
After the full sheets re-import (~2000 txs → 100+ positions), the value-snapshot
backfill hammered `instruments.price_bars_all` with per-symbol price lookups,
10+ portfolios in parallel. The pfire postgres pod (node `kura`) pegged the node
at ~100 % CPU; probe timeouts cascaded cluster-wide and `pfire` k8s rollouts
timed out → Helm/Flux rollbacks (wallets v1.1.38 / admin v1.0.46).
`pg_terminate_backend` on the active queries dropped node load to ~16 %.

**Root causes (two independent):**
1. **Missing index (the big one).** The `price_bars_all` US branch computes
   `replace(ticker, '.US', '') AS symbol` over the `stooq_daily_us` foreign
   table (28M rows); no index could serve that expression, so every per-symbol
   US lookup was a full 28M-row FDW fetch (~2.2 s for 20 rows). Fixed with a
   functional index in the remote `stooq` DB:
   `daily_us_stripped_ticker_date on public.daily_us (replace(ticker, '.US', ''), date)`
   → US branch 2219 ms → 7.7 ms; full-view US query ~15 ms. Persisted in
   `pfire-init-sql.yaml` (bootstrap) + local PGlite/docker parity
   (`stooq_daily_us_stripped_ticker_date`, portfoliost-instruments v1.0.49).
2. **Unbounded parallelism.** `computeSnapshotBatch` fanned out
   `Promise.all` over every symbol, and multiple portfolios' backfills/recalcs
   ran concurrently. Fixed in portfoliost-wallets v1.1.39:
   - `backfill-runner.ts`: global FIFO runner — **one recompute pass at a time
     cluster-wide** (analytics `runBackfill` and post-mutation recalcs share it).
     Per-portfolio dedupe (latest state wins); abort + re-run after the grace
     period; `MAX_AUTO_RESTARTS` valve against abort livelock.
   - Per-pass price fan-out bounded: `RECALC_PRICE_CONCURRENCY` (default 4).
   - Import route still triggers **no** snapshot recompute (only wallet-balance
     recalc), so price-bar work starts only after the import, one portfolio at
     a time — as required ("suspend until the whole import is done, then
     one-by-one").

**Verified in cluster (2026-09-19):** wallets v1.1.39 + instruments v1.0.49
running; US-symbol view query 15 ms; `kubectl top nodes` 15–27 % CPU (kura was
100 %).

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

## 26. Topology storage metrics — postgres + redis workload health & resource usage

Scope: the Admin → Topology map shows live status/traffic for the six HTTP
services but nothing for the storage lane. This section makes the **postgres**
(Crunchy PostgresCluster `postgres-pfire`, StatefulSet
`postgres-pfire-postgres-pfire-k8db`) and **redis** (deployment `redis`,
`REDIS_HOST: redis` per cachest helmrelease) nodes show: health pill +
replicas/restarts (status) and CPU / memory / throughput cards (traffic).

Investigation (2026-09-19, read-only, Prometheus `kube-prometheus-stack-prometheus`
v3.14 in `monitoring`, `podMonitorSelector`/`podMonitorNamespaceSelector` empty =
accepts any PodMonitor in any namespace):

- **Already in Prometheus today** (cAdvisor via kubelet + kube-state-metrics):
  `container_cpu_usage_seconds_total` / `container_memory_working_set_bytes`
  for both workloads; `kube_statefulset_status_replicas[_ready]` for the
  StatefulSet (admin's `loadDeploymentHealth` only queries `kube_deployment_*` —
  the reason postgres shows nothing); `kube_pod_container_info` (image tag →
  version).
- **Not in Prometheus:** the Crunchy exporter (container `exporter`, port name
  `exporter`/9187, present in the pod via `spec.monitoring.pgmonitor.exporter`)
  is never scraped — `pg_up` empty, no `spec.metrics` dispatcher on the
  PostgresCluster, no PodMonitor. Query-level metrics (connections,
  transactions/min) need a scrape target first.
- Redis has no exporter; redis query-level metrics would need a
  redis-exporter — **out of scope** (CPU/mem/restarts are enough for the map).

Repos touched: `@marx2/contracts`, `portfoliost-admin`, `portfoliost` (SPA),
homelab (one new PodMonitor YAML + two tag pins).

Design: no new endpoints. `/topology/status` gains k8s-only workload rows for
nodes without `/__meta` (impl `real`, reachable = ready replicas, version from
the `kube_pod_container_info` image tag); `/topology/traffic` gains rows whose
`source` is `prometheus` carrying `cpuCores`/`memoryBytes`/`connections` and
`requestsPerMin` reused as transactions/min for postgres (null until the
exporter is scraped). Compose stack has no Prometheus → endpoints degrade
exactly as today; compose E2E stays static-only.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass.

---

### 26.1 — Contracts: nullable HTTP fields + resource metrics on `TopologyServiceTraffic`

- [x] `portfoliost-contracts/contracts/openapi.yaml`:
  - `TopologyServiceTraffic`: make `requestsPerMin`, `errorRate`,
    `p99LatencyMs` nullable (DB workloads have no HTTP latency); add nullable
    `cpuCores`, `memoryBytes`, `connections` (numbers); extend `source` enum
    with `prometheus`; `required` shrinks to `[name, source]`; document
    `requestsPerMin` as "requests/min (HTTP) or transactions/min (databases)".
  - `TopologyServiceStatus.reachable`: update description to cover
    k8s-only workloads (ready replicas) alongside `/__meta` reachability.
- [x] Push main → GHA `release.yml` auto-bump; `gh release list` to read the real
  tag (never assume +1).
- [x] In `portfoliost-admin` + `portfoliost`: `NODE_AUTH_TOKEN=$(gh auth token)
  npm install @marx2/contracts@<new>` → `npm run gen:types` (both repos have it)
  → commit `package-lock.json` + `generated/api-types.d.ts` in each.
- [x] Tests: contracts repo suite green; consumer builds (`tsc` / `vue-tsc`)
  accept the generated types.
- [x] Commit: `feat(contracts): topology traffic — nullable HTTP fields + resource metrics`.

### 26.2 — admin: workload health in `/topology/status`

- [x] `portfoliost-admin/src/workload-probe.ts` (new module per
  `docs/MODULARISATION.md`): `workloadTargets()` —
  `{ id: "postgres", kind: "statefulset", sts: env TOPOLOGY_POSTGRES_STATEFULSET
  ?? "postgres-pfire-postgres-pfire-k8db", podRe: "^postgres-pfire-postgres-pfire-",
  container: "database" }` and `{ id: "redis", kind: "deployment", name: "redis",
  container: "redis" }`.
- [x] `topology.ts` `loadDeploymentHealth`: keep deployment chain; add
  StatefulSet branch (`kube_statefulset_status_replicas{statefulset=…}`,
  `kube_statefulset_status_replicas_ready`) and a restarts attribution for STS
  pods (`sum by (created_by_name)(kube_pod_container_status_restarts_total *
  on(pod) group_left(label_replace(kube_pod_info, "created_by_name", "$1",
  "created_by_name", "(.+)")))` — for STS pods `created_by_name` is the
  StatefulSet name).
- [x] `/topology/status` handler: after the `/__meta` fan-out, append one row per
  workload target — `reachable: ready >= desired`, `impl: "real"`,
  `replicas {desired, ready}`, `restarts`, `version` = image tag parsed from
  `kube_pod_container_info{pod=~podRe, container=…}` (null on failure). Degrade
  per target (a failed query nulls that row's fields, never 500s), same
  pattern as the existing Prometheus fallback.
- [x] Unit tests (mocked `queryInstant`): STS + deployment rows merged, version
  parsing, degradation on query failure, deployment rows unchanged.
- [x] `npm run test` + `npm run build` pass.
- [x] Commit: `feat(admin): topology status — postgres/redis workload health`.

### 26.3 — admin: resource metrics in `/topology/traffic` + release

- [x] `topology-traffic.ts` `loadTrafficData`: alongside the existing service
  rows, build one row per workload target —
  - `cpuCores`: `sum(rate(container_cpu_usage_seconds_total{namespace=~ns,
    pod=~podRe, container=…}[5m]))`
  - `memoryBytes`: `sum(container_memory_working_set_bytes{…same…})`
  - postgres only: `connections`: `sum(pg_stat_activity_count{namespace=~ns})`,
    `requestsPerMin`:
    `sum(rate(pg_stat_database_xact_commit{namespace=~ns}[5m]) +
    rate(pg_stat_database_xact_rollback{namespace=~ns}[5m])) * 60` — both null
    while the exporter is not yet scraped (queries fail → nulls, not zeros)
  - `errorRate`/`p99LatencyMs`: null; `source: "prometheus"` (or `"none"` when
    `PROMETHEUS_URL` unset — then no workload rows at all, as today).
- [x] Existing `buildService` rows unchanged in shape (HTTP fields stay set).
- [x] Unit tests: workload rows with/without exporter series; degradation;
  existing otel/ingress rows unchanged.
- [x] `npm run test` + `npm run build` pass; push main → GHA release; record the
  real tag for the 26.5 homelab pin.
- [x] Commit: `feat(admin): topology traffic — postgres/redis CPU/mem/throughput`.

### 26.4 — SPA: mark storage live + resource cards in the details panel

- [ ] `graph-definition.ts`: `postgres` and `redis` → `live: true` (they now map
  to probed workloads). Update `topology-graph-definition.test.ts` live list
  (6 → 8) + snapshot.
- [ ] `TopologyDetailsPanel.vue`: when `traffic.cpuCores != null` render a
  resource card row — CPU (cores, 2 dp), Memory (MiB, rounded),
  Tx/min (`requestsPerMin`) for postgres — instead of the Req/min/P99/Errors
  cards; make the existing cards null-safe (`v-if` per field) so a partial
  payload renders only what exists. Version row already `v-if="status.version"`.
- [ ] Unit tests: panel renders resource cards from a mocked store payload;
  HTTP cards still render for `cachest`; null fields render nothing.
- [ ] `npm run build` + `npm run test` + `npm run test:mock` +
  `docker compose up -d --build portfoliost` + `npm run test:e2e` (topology
  specs; compose has no Prometheus so postgres/redis show no live overlay —
  assert the nodes still render and inspect). Push main → GHA release; record
  the real SPA tag.
- [ ] Commit: `feat(admin-ui): topology — storage resource cards + live postgres/redis`.

### 26.5 — homelab: scrape the Crunchy exporter + pin admin/SPA

- [ ] New `cluster/apps/pfire/postgres-exporter-podmonitor.yaml` (standalone
  PodMonitor — deterministic, no operator-RBAC dependency; the
  operator-managed `spec.metrics` alternative noted but not used):
  `selector.matchLabels.postgres-operator.crunchydata.com/cluster:
  postgres-pfire`, `podMetricsEndpoints: [{portName: exporter, interval: 30s}]`,
  namespace `pfire`; add to the pfire app kustomization.
- [ ] Verify scrape: port-forward `kube-prometheus-stack-prometheus`,
  `pg_up{namespace="pfire"}` = 1, `pg_stat_database_xact_commit` +
  `pg_stat_activity_count` series present.
- [ ] Bump `helmrelease.yaml` tags: admin → 26.3 tag, portfoliost → 26.4 tag
  (pin the real GHA tags; several files pin twice — check none of these two do).
- [ ] Commit + push homelab main; Flux reconcile
  (`kubectl get kustomization -n flux-system portfoliost` ready) →
  `kubectl get deploy -n pfire portfoliost,portfoliost-admin -o
  jsonpath=…image` + pods running.
- [ ] Live verification: hit the cluster admin API
  (`kubectl -n pfire exec` into the admin pod → `curl localhost:3000/api/admin/topology/status`
  + `/traffic`): postgres row `replicas 1/1`, version = pg image tag; traffic
  row `cpuCores > 0`, `memoryBytes > 0`, and after the PodMonitor: `connections`
  + `requestsPerMin` present.
- [ ] Browser: Playwright on https://portfoliost.k.homylab.com → Admin →
  Topology → click postgres: health pill + replicas, CPU/Memory/Tx-min cards
  with non-zero values; same for redis (CPU/Memory).

### 26.6 — Closeout

- [ ] KB: save the Prometheus query cookbook (cAdvisor + kube-state-metrics
  workload health + Crunchy exporter labels, PodMonitor location,
  `podMonitorSelector` = any-namespace fact) under `pfire/ops`.
- [ ] Update this section's investigation notes with the live numbers observed.
- [ ] Archive to `plan-archive.md`.
- [ ] Commit: `chore: topology storage metrics closeout`.

**Open questions / out of scope**

- redis query-level metrics (queries/sec, hit ratio) need a redis-exporter —
  follow-up, not part of this section.
- Job nodes (fxsync, tickersync, sheets-sync, …) could later show last-run
  completion from `kube_job_status_succeeded` — separate follow-up.
- pgBouncer metrics: not deployed (pgdb spec section commented out) — nothing
  to surface.

---

