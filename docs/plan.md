# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md` / `plan-archive2.md`.

Legend: `[ ]` pending · `[x]` done

---

## 23. Wallets import API

Proposal: [wallets-import-api.md](proposals/wallets-import-api.md) — batch write surface
in `portfoliost-wallets` for external importers. Provides idempotent transaction
submission, wallet bootstrapping, sync-run tracking, deferred portfolio recompute, full
wipe for clean re-imports, and split preservation with retroactive adjustment.
First consumer: `portfoliost-sheets-sync` (§24). Future consumers: CSV broker exports,
bank feeds, etc.

Repos touched: `portfoliost-contracts`, `portfoliost-wallets`, `portfoliost-admin`,
`portfoliost` (mock handlers).

Rules: one step = one commit; a step is marked `[x]` only after its tests pass.

---

### 23.1 — `@marx2/contracts` bump: import API + internal apply-split contract

Contract-first (MODULARISATION.md): every module builds against
`@marx2/contracts` and annotates responses with `satisfies`, so the new
`/api/import/*` + `/internal/apply-split` surfaces must be defined here before
any route work (23.3+).

- [x] In `portfoliost-contracts/contracts/openapi.yaml` add schemas per the
      proposal shapes:
      - `ImportWalletBootstrapRequest` (`externalSource` + `wallets:
        [{name, currency, baseCurrency}]`), `ImportWalletBootstrapResponse`
        (`wallets: [{id, name, currency, baseCurrency, created}]`),
        `ImportPortfolioBootstrapRequest` / `Response`
        (`{id, name, currency, baseCurrency, created}`).
      - `ImportTransactionsRequest` (`source: {externalSource, spreadsheetId,
        sheet}` + `transactions[]`: `externalId`, `walletName`, `executedAt`,
        `walletTx: ImportWalletTx`, `portfolioTx: ImportPortfolioTx` optional),
        `ImportWalletTx` (fields of `wallet_transactions`, incl. `ADJUSTMENT`),
        `ImportPortfolioTx` (`Transaction` fields + optional
        `originalQuantity`, `originalPrice`), `ImportTransactionsResponse`
        (`{inserted, skipped, errors, syncRun}`).
      - `SyncRun`, `SyncRunsResponse` (`{items, total}`),
        `SourceWipeResponse` (`deleted: {walletTransactions, portfolios,
        wallets, syncRuns}`), `ApplySplitRequest` (`{symbol, factor,
        effectiveDate}`), `ApplySplitResponse` (`{updatedTransactions,
        affectedPortfolios}`).
      - Extend the existing portfolio `Transaction` schema with optional
        `externalSource`, `externalId`, `originalQuantity`, `originalPrice`;
        extend `CashTransaction` with optional `externalSource`, `externalId`.
        (`CashTransaction.type`/`Transaction.type` are free strings — no enum
        change needed for `ADJUSTMENT`.)
- [x] Add paths (tag `Wallets`): `POST /import/wallets/bootstrap`,
      `POST /import/portfolios/bootstrap`, `POST /import/transactions`,
      `GET /import/sync-runs`, `DELETE /import/sync-runs/{id}`,
      `DELETE /import/source/{externalSource}`; plus `POST /internal/apply-split`
      (no auth). Wire request/response `$ref`s incl. `404`/`422` error shapes
      per proposal. (Added new `Internal` tag.)
- [x] `npm run lint` (yaml parses), commit, push → CI auto-bumped and published
      `@marx2/contracts` `v1.6.21` (tag + GitHub Packages). No manual
      `package.json` bump needed — `release-contracts.yml` computes it from tags.
- [x] `portfoliost-wallets`: `npm install` (v1.6.21) + `npm run gen:types`; new
      paths/schemas verified in `src/generated/api-types.d.ts`.
- [x] `npm run build` (tsc clean) + `npm run test` pass unchanged (265/265).
- [x] Commit (contracts, `8b38246`): `feat(contracts): import API + internal
      apply-split contract`; commit (wallets, `c164517`): `chore: regenerate
      API types from @marx2/contracts v1.6.21`.

### 23.2 — DB migration: provenance + sync_runs + source tags + split columns

- [x] In `portfoliost-wallets` add Drizzle migration:
      - `wallets.wallets`: add `external_source text` (NULL = manual).
      - `portfolios.portfolios`: add `external_source text` (NULL = manual).
      - `wallets.wallet_transactions`: add `external_source text`, `external_id text`;
        partial unique index `uq_wtx_external ON (external_source, external_id) WHERE
        external_id IS NOT NULL`.
      - `portfolios.transactions`: add `external_source text`, `external_id text` +
        partial unique index `uq_ptx_external`; add `original_quantity numeric(20,8)`
        and `original_price numeric(20,8)` (both nullable; frozen at creation).
      - New table `wallets.sync_runs` per proposal schema.
      - Relax `ck_wtx_amount_nonzero` to `amount <> 0 OR type = 'ADJUSTMENT'`.
- [x] PGlite migration test: all objects exist; partial unique index rejects duplicate
      `external_id`; allows NULL duplicates (manual rows); `original_quantity` /
      `original_price` are independent of `quantity` / `price` (no constraint).
- [x] `npm run test` passes.
- [x] Commit: `feat(wallets): import API migration — provenance + split columns`.

### 23.3 — `POST /api/import/wallets/bootstrap` + `POST /api/import/portfolios/bootstrap`

- [x] New route file `src/routes/import.ts`; mount at `/api/import` in `server.ts`.
- [x] `POST /api/import/wallets/bootstrap`: accept `{ externalSource, wallets:
      [{name, currency, baseCurrency}] }`; upsert each on `(userId, name)` (`ON
      CONFLICT DO NOTHING`, re-select); set `external_source` on INSERT only; return
      array with `id` + `created` flag. Annotate responses with
      `satisfies ImportWalletBootstrapResponse`.
- [x] `POST /api/import/portfolios/bootstrap`: accept `{ externalSource, name,
      currency, baseCurrency }`; upsert on `(userId, name)`; set `external_source`
      on INSERT only; return `{ id, name, created }`.
- [x] Unit tests (PGlite): first call creates + tags (`created=true`); second call
      returns same id, does not re-tag (`created=false`); unknown fields → 422.
- [x] Prerequisite (no unique `(user_id, name)` existed): drizzle `0002` adds
      `uq_wallets_user_name` + `uq_portfolios_user_name`; prod verified free of
      duplicate names; manual create routes now return 409 on duplicate name.
      Migration chain audited against `database-schema-migrations.md` (pure DDL,
      own module only, breakpoint-separated — compliant).
- [x] `npm run test` passes (271/271).
- [x] Commit: `feat(wallets): POST /api/import/wallets/bootstrap + portfolios/bootstrap`.

### 23.4 — `POST /api/import/transactions`

- [ ] `POST /api/import/transactions`: accept `source` + `transactions[]` (≤ 500);
      per-row: resolve `walletName` → `walletId`; INSERT `wallet_transactions` with
      `ON CONFLICT (external_source, external_id) DO NOTHING`; when `portfolioTx`
      present INSERT `portfolios.transactions` with `original_quantity` and
      `original_price` from the payload (importer supplies pre-restatement values);
      upsert position (BUY: weighted avg cost; SELL: reduce qty + store
      `realizedGainLoss`; DIVIDEND: no qty change); collect row-level errors without
      aborting batch.
      After all rows: recalculate wallet balances as `SUM(amount)` for each affected
      wallet; call `recomputePortfolioTotals` once per distinct `portfolioId`;
      upsert `sync_runs` row.
- [ ] Existing interactive routes (`POST /api/portfolios/:id/transactions`,
      `POST /api/portfolios/:id/positions`): set `original_quantity = quantity` and
      `original_price = price` at INSERT time (server-side copy; caller never supplies
      these fields).
- [ ] Unit tests (PGlite):
      - BUY + SELL sequence: correct qty, avg cost, realizedGainLoss.
      - Import BUY with `originalQuantity ≠ quantity`: both stored independently;
        `quantity`/`price` are the restated values used in calculations.
      - Manual BUY (interactive route): `original_quantity = quantity` auto-set.
      - Idempotency: second call with same `externalId` array → `inserted=0, skipped=N`.
      - Unknown `walletName` → `errors[]`, rest of batch succeeds.
      - DEPOSIT (no `portfolioTx`): wallet row only, no position.
      - Wallet balance after batch equals `SUM(amount)`.
      - `sync_runs` upserted with correct counts.
- [ ] `npm run test` passes.
- [ ] Commit: `feat(wallets): POST /api/import/transactions — batch import + original values`.

### 23.5 — `GET /api/import/sync-runs`, `DELETE /api/import/sync-runs/:id`, `DELETE /api/import/source/:externalSource`

- [ ] `GET /api/import/sync-runs`: list runs for authenticated user; filter by
      `externalSource`; paginate with `limit`/`offset`.
- [ ] `DELETE /api/import/sync-runs/:id`: delete run record only; 404 if not owned.
- [ ] `DELETE /api/import/source/:externalSource`: wipe all data tagged with this
      source for the authenticated user, in a single DB transaction:
      1. DELETE `wallet_transactions` WHERE `external_source = $s AND user_id = $u`.
      2. DELETE `portfolios.portfolios` WHERE `external_source = $s AND user_id = $u`
         (cascades to positions, portfolio transactions, shares, snapshots).
      3. DELETE `wallets.wallets` WHERE `external_source = $s AND user_id = $u`.
      4. DELETE `sync_runs` WHERE `external_source = $s AND user_id = $u`.
      Returns `{ deleted: { walletTransactions, portfolios, wallets, syncRuns } }`.
      Manually-created rows (`external_source IS NULL`) are never touched.
- [ ] Unit tests: wipe removes only tagged rows; manual wallet/portfolio survive;
      wipe on empty source returns zero counts (not 404).
- [ ] `npm run test` passes.
- [ ] Commit: `feat(wallets): sync-run list/delete + source wipe endpoint`.

### 23.6 — `POST /internal/apply-split` (wallets)

- [ ] New internal endpoint `src/routes/internal.ts`, mounted at `/internal` (no JWT —
      internal network only, not exposed through nginx gateway):
      `POST /internal/apply-split` — body `{ symbol, factor, effectiveDate }`.
- [ ] Handler (single DB transaction per affected user batch):
      1. Fetch all `portfolios.transactions` rows where `instrument_symbol = $symbol`
         AND `executed_at < $effectiveDate` AND `original_quantity IS NOT NULL`
         (rows with originals — both imported and manual, since manual rows get
         `original_quantity = quantity` at creation).
      2. For each row compute cumulative factor = product of all
         `instruments.split_adjustments.factor` for this symbol with
         `detected_at ≤ $effectiveDate` (query instruments schema via
         `INSTRUMENTS_DATABASE_URL` read-only connection, same pattern as
         `ticker_reference` lookups).
      3. UPDATE `quantity = original_quantity × cumulative_factor`,
               `price    = original_price    / cumulative_factor`.
         `original_quantity` and `original_price` are never written.
      4. Recompute position avg cost + market value for all affected positions.
      5. Call `recomputePortfolioTotals` for all affected portfolios.
      Returns `{ updatedTransactions: N, affectedPortfolios: M }`.
- [ ] Idempotency: re-running with the same `(symbol, effectiveDate)` produces the
      same result because `original_quantity` is frozen (test: call twice, assert
      `quantity` identical after second call).
- [ ] Cumulative splits: two splits on same symbol applied in order; final `quantity =
      original_quantity × factor1 × factor2` (test with Amazon ×20 then ×4 fixture).
- [ ] `npm run test` passes.
- [ ] Commit: `feat(wallets): POST /internal/apply-split`.

### 23.7 — Admin split apply hook

- [ ] In `portfoliost-admin/src/market-data.ts`, after the existing
      `split_adjustments` INSERT in the `/apply` handler:
      fire `fetch(`${API_WALLETS_URL}/internal/apply-split`, { method: "POST", body:
      JSON.stringify({ symbol, factor, effectiveDate: today }) })`.
      On fetch failure: log error + return `{ ok: true, splitApplied: true,
      portfolioAdjustmentFailed: true, error: "..." }` (price bars are corrected;
      portfolio adjustment can be retried by re-calling apply from the admin panel).
- [ ] `portfoliost-admin` vitest: mock wallets fetch; assert it is called with correct
      body after successful `split_adjustments` insert.
- [ ] `npm run test` passes (admin suite).
- [ ] Commit: `feat(admin): fire apply-split hook on split candidate apply`.

### 23.8 — Mock handlers + full suite

- [ ] In `portfoliost/mocks/`: add handlers for all seven import/internal routes:
      `POST /api/import/wallets/bootstrap`, `POST /api/import/portfolios/bootstrap`,
      `POST /api/import/transactions`, `GET /api/import/sync-runs`,
      `DELETE /api/import/sync-runs/:id`, `DELETE /api/import/source/:externalSource`,
      `POST /internal/apply-split` → `{ updatedTransactions: 0, affectedPortfolios: 0 }`.
- [ ] `npm run build` + `npm run test` + `npm run test:mock` + `npm run test:e2e` pass.
- [ ] Commit: `feat(mocks): import API + apply-split mock handlers`.

### 23.9 — Closeout

- [ ] Update `wallets-import-api.md` status to **implemented** with date; resolve the
      three open questions; note `original_quantity`/`original_price` invariant and
      apply-split idempotency verified.
- [ ] Archive to `plan-archive.md`.
- [ ] Commit: `chore: wallets import API closeout`.

---

## 24. Google Sheets sync — Transakcje import (wallets + portfolio)

Proposal: [google-sheets-sync.md](proposals/google-sheets-sync.md) — sync the `Transakcje`
sheet of spreadsheet `1iDzR0OTHvqPbjjRSnAI4SdoD7sZOGy8uT9991sPFFps` into
`wallets.wallet_transactions` and `portfolios.transactions` / `positions` via a Kubernetes
CronJob. 2 024 data rows; 7 transaction types; columns A–AM (39 total).

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
over HTTP — **no direct DB access**. Auth: service JWT stored in `sheets-sync-secrets`.
The importer is responsible only for fetching + parsing + mapping; all DB writes and
position/balance logic go through `/api/import/transactions`.

**Dependency**: §23 (import API) must be complete before 24.3.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass.

---

### 24.1 — `ticker_reference` seed additions (instruments repo)

- [ ] In `portfoliost-instruments`, add to the tickerref seed CSV:
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
- [ ] Re-run `tickerref-sync.ts`; verify row counts.
- [ ] `npm run test` passes.
- [ ] Commit: `feat(instruments): ticker_reference seed — crypto + fund aliases`.

### 24.2 — Scaffold `portfoliost-sheets-sync` repo

- [ ] Create `Marx2/portfoliost-sheets-sync` (private) on GitHub.
- [ ] Scaffold: `package.json`, `tsconfig.json`, `vitest.config.ts` — copy from
      `portfoliost-wallets`; strip Hono/Drizzle/server deps. Keep: `vitest`, `tsx`,
      `typescript`. No direct DB access — all writes go through the wallets API.
- [ ] `Dockerfile`: `node:22-alpine`, `npm ci`, `tsc`, entrypoint `node dist/sync.js`.
      No healthcheck port, no server.
- [ ] Env vars: `WALLETS_API_URL`, `WALLETS_API_TOKEN` (service JWT),
      `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
      `INSTRUMENTS_DATABASE_URL` (read-only, `ticker_reference` lookup only).
- [ ] GHA: build + test on push; publish `ghcr.io/marx2/portfoliost-sheets-sync` on tags.
- [ ] `npm run build` + `npm run test` (empty suite) pass.
- [ ] Commit: `chore: scaffold portfoliost-sheets-sync repo`.

### 24.3 — Google Sheets REST client + token refresh

- [ ] `src/sheets-client.ts`: `fetchSheet(spreadsheetId, range, accessToken):
      Promise<string[][]>` — plain `fetch` against Sheets REST API v4; no SDK.
- [ ] `refreshToken(clientId, clientSecret, refreshToken): Promise<string>` — POST to
      `https://oauth2.googleapis.com/token`; called once at Job startup.
- [ ] Unit tests: mocked `fetch`; URL, auth header, empty-range, token refresh.
- [ ] Commit: `feat(sheets-sync): Sheets REST client + OAuth2 token refresh`.

### 24.4 — Row parser: column mapping, PL decimal, split restatement

- [ ] `src/transakcje-parser.ts`:
      - `parsePlDecimal(raw: string): number | null` — strips NBSP/space/` zł`,
        `,`→`.`, null for `-`/empty.
      - `parseRow(cols: string[]): RawTransakcjeRow` — maps cols 1–8, 12, 17, 19–21,
        29–35; `externalId` = SHA256 of `date|typ|aktywo|quantity|currency|kursPln`.
      - `restateSplits(rows: RawTransakcjeRow[]): RawTransakcjeRow[]` — per asset:
        `quantity *= F`, `priceNative /= F`, `pricePln /= F` for rows before split
        date; validate against col 11; throw `SplitMismatchError` on mismatch.
        Known splits: Amazon ×20 (2022-06-06), Alphabet ×20 (2022-07-15), Dino ×10
        (2025-07-30).
- [ ] Unit tests: decimal edge cases; BUY/DIV/SELL/DEPOSIT rows; Amazon split fixture.
- [ ] `npm run test` passes.
- [ ] Commit: `feat(sheets-sync): Transakcje row parser + split restatement`.

### 24.5 — Instrument resolver + Konto map

- [ ] `src/instrument-resolver.ts`: `resolveInstrument(row, instrumentsDb)`:
      symbol-primary (`ticker_reference` by `ticker` + `exchange`); aktywo-fallback
      (name-fold against `name`/`aliases`); unmatched → `{ ticker: aktywo,
      assetType: "stock", matched: false }`.
- [ ] `src/konto-map.ts`: static map `Konto` → `{ walletName, currency, baseCurrency }`
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

- [ ] Unit tests: symbol-primary; aktywo-fallback; unmatched; all 10 Konto values;
      unknown throws.
- [ ] `npm run test` passes.
- [ ] Commit: `feat(sheets-sync): instrument resolver + Konto→wallet map`.

### 24.6 — Wallets API client

- [ ] `src/wallets-api-client.ts`: typed `fetch` wrappers for `POST
      /api/import/wallets/bootstrap`, `POST /api/import/transactions`, `GET
      /api/import/sync-runs`. Auth: `Authorization: Bearer $WALLETS_API_TOKEN`.
- [ ] Unit tests: mocked fetch; URL, headers, payload shapes.
- [ ] Commit: `feat(sheets-sync): wallets import API client`.

### 24.7 — Row mapper: `RawTransakcjeRow` → `ImportTransaction`

- [ ] `src/transakcje-mapper.ts`: `mapRow(row, walletUuidMap, portfolioId):
      ImportTransaction` — converts parser output to the `POST /api/import/transactions`
      payload shape:
      - `walletName` from `konto-map`; `walletTx.type` from `Typ` mapping
        (`Kupno→INVEST`, `Sprzedaż→SELL`, `Div→DIVIDEND`, `Wpłata→DEPOSIT`,
        `Wypłata→WITHDRAWAL`, `Split→ADJUSTMENT`, `Sell Call Option→SELL`).
      - `walletTx.amount` = col 19 `cashFlow` (PLN signed); `currency` = col 20;
        `exchangeRate` = col 21; `rateSource=manual`.
      - `walletTx.fees` = col 33 when `feeCurrency ≠ PLN` else col 7;
        `feeCurrency` = col 31; `feeExchangeRate` = col 32; `feeRateSource=manual`.
      - `portfolioTx` (omit for DEPOSIT/WITHDRAWAL/ADJUSTMENT): `price` = col 30
        (post-restatement); `quantity` positive (post-restatement); `type` =
        BUY/SELL/DIVIDEND; `realizedGainLoss` from col 17 on SELL; `assetType` from
        resolved instrument.
      - **`portfolioTx.originalQuantity`** = `row.rawQuantity` (pre-restatement value
        captured by the parser before `restateSplits` runs; see 24.4). Set to `null`
        when the row was already in post-split terms (rawQuantity = restated quantity).
      - **`portfolioTx.originalPrice`** = `row.rawPriceNative` (same logic).
      - Options: `assetType=OPTION`, `optionType=CALL`, `direction=SHORT`,
        `contractSize=100`; strike/expiry null.
- [ ] `src/transakcje-parser.ts` (24.4): `RawTransakcjeRow` carries `rawQuantity` and
      `rawPriceNative` set from the sheet values **before** `restateSplits` overwrites
      them; `restateSplits` mutates `quantity`/`priceNative` only.
- [ ] Unit tests: pre-split BUY row → `originalQuantity ≠ quantity`,
      `originalPrice ≠ price`; post-split BUY row → both null; DEPOSIT → null.
- [ ] `npm run test` passes.
- [ ] Commit: `feat(sheets-sync): row mapper → ImportTransaction + original values`.

### 24.8 — Orchestrator

- [ ] `src/sync.ts` (entrypoint):
      1. If `--wipe` / `WIPE=true`: `DELETE /api/import/source/google-sheets:transakcje`
         and log deleted counts. Skip on production CronJob.
      2. Refresh OAuth2 token.
      3. `POST /api/import/wallets/bootstrap` with all 10 wallets → UUID map.
      4. `POST /api/import/portfolios/bootstrap` → `portfolioId`.
      5. `fetchSheet` → `parseRow` → `restateSplits` → `resolveInstrument` → `mapRow`.
      6. Batch into groups of ≤ 500; `POST /api/import/transactions` per batch.
      7. Log total inserted/skipped/errors and `syncRun.id`.
- [ ] Smoke (clean run): `docker compose run --rm sheets-sync node dist/sync.js --wipe`
      against local stack; assert `GET /api/import/sync-runs` shows completed run with
      `insertedWtx > 0`.
- [ ] Smoke (idempotent re-run): run again without `--wipe`; assert `inserted=0,
      skipped=<all rows>`.
- [ ] Add `sheets-sync` service to `portfoliost/docker-compose.yml` (build
      `../portfoliost-sheets-sync`, env `sheets-sync.env`, `restart: no`).
- [ ] `npm run test` passes.
- [ ] Commit: `feat(sheets-sync): sync orchestrator + wipe support`.

### 24.9 — Homelab CronJob

- [ ] `homelab/cluster/apps/pfire/portfoliost-sheets-sync/app/helmrelease.yaml`:
      app-template v5.1.0, `type: cronjob`, `schedule: "0 5 * * *"`,
      `concurrencyPolicy: Forbid`, image `ghcr.io/marx2/portfoliost-sheets-sync:<tag>`,
      command `node dist/sync.js`. Secrets: `sheets-sync-secrets`
      (`GOOGLE_REFRESH_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
      `WALLETS_API_TOKEN`); `WALLETS_API_URL` from ConfigMap;
      `INSTRUMENTS_DATABASE_URL` from instruments secret.
- [ ] `ks.yaml` + add to `homelab/cluster/apps/pfire/kustomization.yaml`.
- [ ] `kubectl kustomize` renders cleanly.
- [ ] Commit: `chore(homelab): portfoliost-sheets-sync CronJob`.

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

### 25.6 — Closeout D80/D81/D82

- [ ] Update `instruments-provider-module.md`: D80, D81, D82 done with date.
- [ ] Update `openst-coverage.md`: `CorporateBondProfileFetcher`; D81 routing table.
- [ ] Archive to `plan-archive.md`.
- [ ] Commit: `chore: D80/D81/D82 closeout`.

---

