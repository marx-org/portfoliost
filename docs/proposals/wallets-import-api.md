# Proposal: wallets import API

**Status**: implemented (2026-09-17)
**Builds on**: [wallets-module.md](wallets-module.md), [google-sheets-sync.md](google-sheets-sync.md)

## Problem

`portfoliost-wallets` currently has no batch write surface.  Individual transaction
creation goes through interactive REST routes that (a) assume the caller supplies a
valid `walletId` UUID, (b) recompute portfolio totals synchronously on every write,
and (c) have no concept of idempotency — retrying a failed import duplicates rows.

The Google Sheets sync (§23) will be the first external importer, but future sources
(CSV export from a broker, a second spreadsheet, a bank feed) should go through the
same surface.  The API must be designed once, correctly.

## Goals

1. **Idempotent batch import** — an importer submits an array of events; re-submitting
   the same payload is a no-op.
2. **Source-agnostic** — the API accepts an `externalSource` + `externalId` per row; the
   importer (sheets-sync, a future CSV importer, …) is responsible for deriving a stable
   key.
3. **Wallet bootstrapping** — an importer can declare the set of wallets it expects to
   exist; the API creates missing ones (idempotent), tagged with the source.
4. **Deferred recompute** — portfolio totals are not recomputed row-by-row during import;
   a single recompute is triggered at the end of the batch.
5. **Sync-run tracking** — the API persists the import cursor (last processed row,
   status, timestamps) so the importer is stateless across retries.
6. **Clean wipe + re-import** — a single API call deletes everything created by a given
   `externalSource` (wallets, portfolios, all transactions) so a broken import can be
   discarded and re-run from scratch. This is the primary development workflow: wipe,
   fix the importer, re-run.
7. **JWT-protected** — same `X-User-*` middleware as every other wallets route.

## Out of scope

- Streaming / chunked upload (batch size ≤ 500 rows is sufficient for all known sources).
- Duplicate detection by content hash (the importer supplies `externalId`; the API
  trusts it).
- Partial rollback (individual row delete uses existing routes; full wipe uses the new
  DELETE endpoint).
- Conflict resolution (last-write-wins via `DO NOTHING` — a row already imported is
  never overwritten).

---

## New DB objects (migration in `portfoliost-wallets`)

### `wallets.sync_runs`

```sql
CREATE TABLE wallets.sync_runs (
  id              serial PRIMARY KEY,
  user_id         text        NOT NULL,
  external_source text        NOT NULL,
  spreadsheet_id  text        NOT NULL,   -- or file name / feed URL for other sources
  sheet           text        NOT NULL,   -- tab name / stream name
  last_row        int,                    -- importer cursor (source row number)
  status          text        NOT NULL DEFAULT 'pending',  -- pending|running|done|failed
  started_at      timestamptz,
  completed_at    timestamptz,
  error           text,
  inserted_wtx    int         NOT NULL DEFAULT 0,
  inserted_ptx    int         NOT NULL DEFAULT 0,
  skipped         int         NOT NULL DEFAULT 0,
  UNIQUE (user_id, external_source, spreadsheet_id, sheet)
);
```

### `external_source` tag on wallets and portfolios

```sql
-- wallets.wallets
ALTER TABLE wallets.wallets
  ADD COLUMN external_source text;   -- NULL = manually created; set by bootstrap

-- portfolios.portfolios
ALTER TABLE portfolios.portfolios
  ADD COLUMN external_source text;   -- NULL = manually created; set by bootstrap
```

Tagged rows are owned by the import source.  The wipe endpoint (below) deletes only
rows where `external_source = $1` for the authenticated user, leaving manually-created
wallets/portfolios untouched.

### Provenance columns on event tables

```sql
-- wallets.wallet_transactions
ALTER TABLE wallets.wallet_transactions
  ADD COLUMN external_source text,
  ADD COLUMN external_id     text;
CREATE UNIQUE INDEX uq_wtx_external
  ON wallets.wallet_transactions (external_source, external_id)
  WHERE external_id IS NOT NULL;

-- portfolios.transactions
ALTER TABLE portfolios.transactions
  ADD COLUMN external_source text,
  ADD COLUMN external_id     text;
CREATE UNIQUE INDEX uq_ptx_external
  ON portfolios.transactions (external_source, external_id)
  WHERE external_id IS NOT NULL;
```

Existing rows keep `NULL` in both columns (manual entries stay NULL forever — the
partial unique index does not constrain them).

---

## API surface

All routes under `/api/import/` — a new Hono sub-app mounted in `portfoliost-wallets`.
All routes require a valid JWT (`userIdentityMiddleware`).

---

### `POST /api/import/wallets/bootstrap`

Idempotently ensure a set of wallets exists for the authenticated user. Used by the
importer before the first batch so it can refer to wallets by `name` without knowing
their UUIDs. Created wallets are tagged with `external_source` so the wipe endpoint
can remove them.

**Request**
```json
{
  "externalSource": "google-sheets:transakcje",
  "wallets": [
    { "name": "IBKR",       "currency": "USD", "baseCurrency": "PLN" },
    { "name": "IKE Marek",  "currency": "PLN", "baseCurrency": "PLN" },
    { "name": "Equate+",    "currency": "EUR", "baseCurrency": "PLN" }
  ]
}
```

**Response `200`**
```json
{
  "wallets": [
    { "id": "<uuid>", "name": "IBKR",      "currency": "USD", "created": false },
    { "id": "<uuid>", "name": "IKE Marek", "currency": "PLN", "created": true  },
    { "id": "<uuid>", "name": "Equate+",   "currency": "EUR", "created": false }
  ]
}
```

`created: true` = wallet was just inserted (with `external_source` tag); `false` =
already existed (tag is set on creation only — re-bootstrap does not re-tag).
Match is on `(userId, name)` — `ON CONFLICT DO NOTHING`, then re-select.

---

### `POST /api/import/portfolios/bootstrap`

Idempotently ensure a portfolio exists for the authenticated user, tagged with the
source. Called by the importer to get the `portfolioId` needed in `portfolioTx`.

**Request**
```json
{
  "externalSource": "google-sheets:transakcje",
  "name": "Transakcje",
  "currency": "PLN",
  "baseCurrency": "PLN"
}
```

**Response `200`**
```json
{
  "id": "<uuid>",
  "name": "Transakcje",
  "currency": "PLN",
  "created": true
}
```

Match on `(userId, name)`. `ON CONFLICT DO NOTHING`, re-select. `created: true` if
just inserted.

---

### `POST /api/import/transactions`

Submit a batch of up to 500 transaction events.  Each event maps to one
`wallet_transactions` row and optionally one `portfolios.transactions` + position
upsert.

**Request**
```json
{
  "source": {
    "externalSource": "google-sheets:transakcje",
    "spreadsheetId":  "1iDzR0OTHvqPbjjRSnAI4SdoD7sZOGy8uT9991sPFFps",
    "sheet":          "Transakcje"
  },
  "transactions": [
    {
      "externalId":      "abc123",
      "walletName":      "IBKR",
      "executedAt":      "2022-06-15T00:00:00Z",
      "walletTx": {
        "type":           "INVEST",
        "amount":         -1500.00,
        "currency":       "USD",
        "exchangeRate":   4.20,
        "rateSource":     "manual",
        "fees":           5.00,
        "feeCurrency":    "USD",
        "feeRateSource":  "manual",
        "feeExchangeRate": 4.20,
        "description":    "SAP SE buy"
      },
      "portfolioTx": {
        "portfolioId":       "<uuid>",
        "type":              "BUY",
        "instrumentSymbol":  "SAP",
        "instrumentName":    "SAP SE",
        "assetType":         "STOCK",
        "quantity":          10,
        "price":             150.00,
        "currency":          "EUR",
        "exchangeRate":      4.50,
        "rateSource":        "manual",
        "fees":              5.00,
        "feeCurrency":       "USD",
        "feeRateSource":     "manual",
        "feeExchangeRate":   4.20,
        "realizedGainLoss":  null
      }
    }
  ]
}
```

**Fields**

| Field | Required | Notes |
|---|---|---|
| `externalId` | yes | Stable dedup key from the importer (e.g. SHA256 of source row fields). |
| `walletName` | yes | Must exist in `wallets.wallets` for this user (use bootstrap first). |
| `executedAt` | yes | ISO 8601. |
| `walletTx` | yes | All fields map 1:1 to `wallet_transactions` columns. `amount` is signed (negative = cash out). |
| `portfolioTx` | no | Omit for pure cash events (DEPOSIT/WITHDRAWAL). When present, triggers position upsert (BUY increases qty; SELL decreases; DIVIDEND adds no qty). |

**Processing per event**

1. Resolve `walletName` → `walletId` for this user (404 if missing).
2. INSERT `wallet_transactions` with `external_source`, `external_id`; `ON CONFLICT
   (external_source, external_id) DO NOTHING` → mark as skipped if 0 rows inserted.
3. If `portfolioTx` present: INSERT `portfolios.transactions`; upsert position qty/avg
   cost (BUY: weighted avg; SELL: reduce qty, compute `realizedGainLoss` from supplied
   value); `ON CONFLICT DO NOTHING` on the external_id index.
4. Balance and `availableBalance` on the wallet are **not** updated row-by-row — a
   single wallet balance recalculation runs after the whole batch (step 6 below).
5. After all rows: `recomputePortfolioTotals` once per distinct `portfolioId` seen.
6. Recalculate wallet balances as `SUM(amount)` over all `wallet_transactions` for
   each affected wallet (full recalc — avoids cumulative drift across retries).
7. Upsert `sync_runs` with `status=done`, `last_row`, `inserted_wtx`, `inserted_ptx`,
   `skipped`, `completed_at`.

**Response `200`**
```json
{
  "inserted": 42,
  "skipped":  3,
  "errors":   [],
  "syncRun": {
    "id": 7,
    "status": "done",
    "insertedWtx": 42,
    "insertedPtx": 39,
    "skipped": 3,
    "completedAt": "2026-09-17T05:01:22Z"
  }
}
```

Row-level errors (e.g. unknown `walletName`) are collected into `errors` and do not
abort the batch — the failing row is skipped with an error entry.  If all rows fail,
`status=failed`.

**Response `422`** — entire batch rejected (malformed payload, missing required fields).

---

### `GET /api/import/sync-runs`

List import runs for the authenticated user.

**Query params**: `externalSource` (filter), `limit` (default 20), `offset`.

**Response `200`**
```json
{
  "items": [
    {
      "id": 7,
      "externalSource": "google-sheets:transakcje",
      "spreadsheetId": "1iDzR0OTH…",
      "sheet": "Transakcje",
      "lastRow": 2024,
      "status": "done",
      "insertedWtx": 2021,
      "insertedPtx": 1963,
      "skipped": 3,
      "startedAt": "2026-09-17T05:00:00Z",
      "completedAt": "2026-09-17T05:01:22Z",
      "error": null
    }
  ],
  "total": 1
}
```

---

### `DELETE /api/import/sync-runs/:id`

Delete a sync run record (does **not** delete the imported transactions — use the wipe
endpoint for a full clean re-import).  Useful to clear a stale cursor.

**Response `204`** no content.

---

### `DELETE /api/import/source/:externalSource`

**Wipe everything created by a given import source for the authenticated user.**
This is the primary development tool: run once, fix the importer, re-run.

Deletion order (single DB transaction):
1. DELETE `wallets.wallet_transactions` WHERE `external_source = $source` AND `user_id = $user`.
2. DELETE `portfolios.portfolios` WHERE `external_source = $source` AND `user_id = $user`
   — cascades to `positions`, `portfolios.transactions`, `shares`, `valueSnapshots`,
   `portfolioBackfillMetadata` (existing `ON DELETE CASCADE` FKs).
3. DELETE `wallets.wallets` WHERE `external_source = $source` AND `user_id = $user`
   — safe now because all wallet transactions from this source are already gone.
4. DELETE `wallets.sync_runs` WHERE `external_source = $source` AND `user_id = $user`.

Manually-created wallets/portfolios (`external_source IS NULL`) are never touched.
Wallet transactions from other sources that happen to reference the same wallets are
**not** deleted (step 3 only deletes wallets tagged with this source).

**Response `200`**
```json
{
  "deleted": {
    "walletTransactions": 2024,
    "portfolios": 1,
    "wallets": 10,
    "syncRuns": 3
  }
}
```

**Response `404`** if no data exists for this source (nothing to wipe — not an error
in practice, safe to call on a fresh system).

---

## Importer contract

The `portfoliost-sheets-sync` Job (and any future importer) calls these endpoints
in order:

```
1. DELETE /api/import/source/:externalSource  — optional wipe (dev: always; prod: skip)
2. POST   /api/import/wallets/bootstrap       — ensure wallets exist, collect UUID map
3. POST   /api/import/portfolios/bootstrap    — ensure portfolio exists, get portfolioId
4. POST   /api/import/transactions            — batch of ≤500 rows (loop if > 500)
5. GET    /api/import/sync-runs               — verify completion (optional, for logging)
```

Step 1 is controlled by the importer's `--wipe` flag (or `WIPE=true` env var in the
k8s Job). In production the CronJob never passes `--wipe` — it is idempotent by
default. During development the dev runner always wipes first so each run is a clean
slate.

The importer is responsible for:
- Splitting > 500 rows into multiple `/transactions` calls.
- Deriving stable `externalId` values (the API never generates them).
- Refreshing the OAuth2 token before calling the API (token TTL = 1 h).
- Recording the `syncRun.id` for observability.

The importer is **not** responsible for:
- Wallet balance arithmetic.
- Position average-cost computation.
- Portfolio total recomputation.
- Detecting duplicates (the partial unique index handles that).

---

## Mock endpoint additions

Add matching mock handlers in `portfoliost/mocks/` so the frontend `test:mock` suite
remains unaffected:
- `POST /api/import/wallets/bootstrap` → submitted wallets with synthetic UUIDs.
- `POST /api/import/portfolios/bootstrap` → synthetic portfolio id, `created: true`.
- `POST /api/import/transactions` → `{ inserted: N, skipped: 0, errors: [] }`.
- `GET /api/import/sync-runs` → empty list.
- `DELETE /api/import/sync-runs/:id` → 204.
- `DELETE /api/import/source/:externalSource` → `{ deleted: { walletTransactions: 0, portfolios: 0, wallets: 0, syncRuns: 0 } }`.

---

## Testing strategy

- **Unit** (wallets vitest): bootstrap upsert + source tagging; idempotency (second
  bootstrap call: `created=false`, tag unchanged); batch writer idempotency (second
  call with same `externalId` array → `skipped=N, inserted=0`); wallet balance
  recalculation after batch; position qty/avg-cost for BUY/SELL sequence; error
  collection for unknown `walletName`; wipe deletes only tagged rows, leaves manual
  rows untouched; wipe cascade: portfolios delete removes positions + transactions.
- **Mock API** (`npm run test:mock`): submit minimal batch; assert `inserted > 0`.
- **E2E** (`npm run test:e2e`): wipe → bootstrap → full sheets-sync compose run →
  assert `GET /api/import/sync-runs` shows completed run; wipe again → assert counts
  return to zero.

---

## Open questions

1. **Batch size limit**: 500 rows chosen to stay within a 30 s k8s Job timeout.
   Measure the full 2 024-row Transakcje import in 23.7; adjust if needed.
   **Resolved (2026-09-17):** 500 stands. The full 2 024-row Transakcje import
   (5 batches) is the first real consumer (§24 sheets-sync); if the 30 s Job
   timeout is exceeded on that run, revisit the limit there — no import-side
   change is needed now.
2. **Split events**: `Split` rows (`type=ADJUSTMENT`, `amount=0`) hit the
   `ck_wtx_amount_nonzero` check. Resolution: relax to
   `amount <> 0 OR type = 'ADJUSTMENT'` — split markers are preserved for audit.
   **Resolved (2026-09-17):** done — `portfoliost-wallets` migration
   `drizzle/0001_grey_crusher_hogan.sql` relaxed the constraint to
   `amount <> 0 OR type = 'ADJUSTMENT'`; regression test in
   `src/db/schema.test.ts` ("relaxed amount check allows split markers").
3. **Wipe safety**: the wipe endpoint is scoped to `(user_id, external_source)` and
   runs in a single transaction — a partial failure leaves the DB consistent. The
   importer's `--wipe` flag must never be set on the production CronJob manifest.
   **Resolved (2026-09-17):** verified — §23.5 tests confirm the wipe deletes
   only `(user_id, external_source)`-tagged rows atomically and never touches
   manual rows; the `--wipe` prohibition is enforced by the §24 production
   CronJob manifest.

---

## Split preservation and retroactive adjustment

### Problem

Two distinct scenarios both require correct handling of stock splits against portfolio
transactions:

1. **Historical import** — the Google Sheets source keeps pre-split quantities and
   prices in the raw transaction columns. The importer restates them in-place before
   submission. If no original values are stored, the fact that a user "paid $3,200 for
   0.021 shares of Amazon" is lost — only the post-split equivalent "0.42 shares @
   $160" survives.

2. **Future splits accepted via admin panel** — when a new split is detected and
   accepted (admin `POST /admin/market-data/split-candidates/:symbol/apply`), the
   current code writes to `instruments.split_adjustments` and corrects price bars only.
   Portfolio transactions for that symbol are never updated. This means positions show
   the wrong quantity and average cost from the moment the split happens.

### Design

#### `portfolios.transactions` schema additions

```sql
ALTER TABLE portfolios.transactions
  ADD COLUMN original_quantity numeric(20,8),  -- set at creation; never modified
  ADD COLUMN original_price    numeric(20,8);  -- set at creation; never modified
```

**Invariant**: at creation time `original_quantity = quantity` and
`original_price = price`. They are frozen from that point forward and exist purely for
audit and display. All portfolio math (avg cost, realized P/L, market value) uses the
current `quantity` / `price` columns only.

`original_quantity IS NOT NULL` implies the row has been split-adjusted at least once
(or was imported with pre-split values). Both columns are NULL for transactions that
were created after their first split event and have never been restated.

#### Write path — import

The `POST /api/import/transactions` batch writer:
- Receives `portfolioTx.originalQuantity` and `portfolioTx.originalPrice` as optional
  fields in the payload.
- The sheets-sync mapper sets them from the **pre-restatement** values of each row
  (`rawQuantity`, `rawPrice` captured before `restateSplits` runs).
- For post-split rows (rows imported after their own split event — their raw and
  restated values are identical) the mapper leaves them null.
- Manual transactions submitted through the existing interactive routes always have
  `original_quantity = quantity` at creation (filled by the write handler, not the
  caller).

#### Write path — manual transactions

The existing `POST /api/portfolios/:id/transactions` and `POST
/api/portfolios/:id/positions` handlers set `original_quantity = quantity` and
`original_price = price` at INSERT time. The caller never supplies these fields — they
are a server-side copy of the initial values.

#### Retroactive split — `POST /internal/apply-split`

New internal endpoint on `portfoliost-wallets`:

```
POST /internal/apply-split
Body: { symbol: string, factor: number, effectiveDate: string }
```

Not JWT-authenticated — internal only (not exposed through the nginx gateway; called
only by `portfoliost-admin` over the internal compose/cluster network via
`API_WALLETS_URL`).

**Processing** (single DB transaction per affected user):

1. Find all `portfolios.transactions` rows where `instrument_symbol = $symbol` AND
   `executed_at < $effectiveDate`.
2. For each row:
   - Compute the **cumulative factor** for this symbol: product of all
     `split_adjustments.factor` values for this symbol where
     `detected_at <= $effectiveDate` (including the new one just applied).
   - Set `quantity = original_quantity × cumulative_factor`
   - Set `price    = original_price    / cumulative_factor`
   - `original_quantity` and `original_price` are never written.
3. Recompute average cost basis and market value for all affected positions.
4. Call `recomputePortfolioTotals` for all affected portfolios.

Returns `{ updatedTransactions: N, affectedPortfolios: M }`.

**Admin split apply hook** — `portfoliost-admin/src/market-data.ts` is extended: after
the existing `split_adjustments` INSERT succeeds, it fires a `fetch` to
`${API_WALLETS_URL}/internal/apply-split` with the symbol, factor, and today as
`effectiveDate`. Failure is logged but does not roll back the price-bar adjustment
(price bars and portfolio transactions are separate concerns; a retry is always safe
because the cumulative-factor approach is idempotent).

#### Idempotency

Re-running `apply-split` for the same `(symbol, effectiveDate)` is safe:
`quantity = original_quantity × cumulative_factor` always produces the same result
regardless of how many times it runs, because `original_quantity` is frozen.

#### Cumulative splits

Multiple splits on the same symbol are handled correctly: the cumulative factor is
recomputed from `split_adjustments` each time, so a second split automatically absorbs
the first without double-counting.

Example — Amazon ×20 (2022-06-06), then hypothetical ×4 (2026-01-01):
- 2019 BUY: `original_quantity = 0.021`, `original_price = 3200`
- After ×20: `quantity = 0.021 × 20 = 0.42`, `price = 3200 / 20 = 160`
- After ×4:  `quantity = 0.021 × 80 = 1.68`, `price = 3200 / 80 = 40`

#### Display

The UI can show both values on a transaction detail card:
- **Quantity** / **Price** — current adjusted values (used for all calculations)
- **Original quantity** / **Original price** — shown when `IS NOT NULL`, labelled
  "Pre-split" with a badge showing the total adjustment factor
  (`original_quantity / quantity` or `price / original_price`)

---

### Summary of new objects

| Object | Type | Purpose |
|---|---|---|
| `portfolios.transactions.original_quantity` | `numeric(20,8)` nullable | Pre-split quantity; frozen at creation |
| `portfolios.transactions.original_price` | `numeric(20,8)` nullable | Pre-split price; frozen at creation |
| `POST /internal/apply-split` | wallets endpoint | Retroactively adjusts `quantity`/`price` for all transactions of a symbol before the split date |
| Admin `apply` hook | admin code change | Fires `/internal/apply-split` after writing `split_adjustments` |

---

## Implementation closeout (2026-09-17)

Implemented across `portfoliost-contracts` (v1.6.21), `portfoliost-wallets`
(307798b, 3177bfb), `portfoliost-admin` (8616a9b) and `portfoliost` mocks (cd081ac).

- **`original_quantity` / `original_price` invariant verified:** set at creation
  (`= quantity` / `= price`), frozen afterwards. The import route defaults both from
  `quantity` / `price` when the payload omits them (§23.6), so every row —
  imported or manual — satisfies the invariant; all portfolio math uses only
  current `quantity` / `price`.
- **apply-split idempotency verified:** re-running `POST /internal/apply-split` for
  the same `(symbol, effectiveDate)` returns
  `{ updatedTransactions: 0, affectedPortfolios: 0 }` (AMZN 10@100 → 2:1 →
  20@50 smoke; KO 2:1 end-to-end via the admin hook — ledger factor 2,
  ptx 10@60 → 20@30).
- **E2E:** full compose run exercised all seven import routes + the admin split hook;
  the two unrelated pre-existing e2e failures (auth form visibility, price-bars
  live-data shadow) are documented in §23.8 of `plan-archive.md`.
