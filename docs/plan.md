# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md`.

Legend: `[ ]` pending · `[x]` done

---

## 51. Document the SPA component conventions (docs/COMPONENTS.md)

Closed 2026-09-23 — `docs/COMPONENTS.md` + the `AGENTS.md` pointer are in
place (commit `367270e`, doc accuracy pass this closeout); full record in
`plan-archive.md` §51.

---

## 52. Additional dividend providers: biznesradar calendar + dividendmax plugin

Closed 2026-09-24 — biznesradar `CalendarDividend` (GPW coupon/payment
calendar, union-merged in openst `get_calendar`) + dividendmax
`HistoricalDividends` (key-free public-page scrape, fallback). Decisions:
dividendmax stays a fallback (nasdaq remains preferred for US); biznesradar
is the GPW coupon/payment calendar. Commits: openst 03b1ca5 / 6ce9ec0 /
8d898e9 / 4f0e40d / c53979b, cachest 9799638. Full record in
`plan-archive.md` §52.

---

## 53. Main-page portfolio cards: stale charts, MWR overflow, current_value, snapshot FX

Closed 2026-09-24 — XIRR divergence guard + numeric(28,8) cumulative columns
(wallets), `current_value` maintained from the latest snapshot, snapshot-on-read
FX unified with the backfill rule (quote-currency conversion), and the SPA card:
sparkline remount key, failed-backfill state and the empty-window "No data"
state. PROD wipe & reimport clean (2016 txs, 0 errors), all 10 backfills
complete with no overflow (Crypto MWR max 45 982 vs pre-fix ≈1.01e12), Crypto
re-armed with a BTC-USD position. Commits: portfoliost-wallets 2f745f7 /
315c936 / 2624331 / 1bf9375 (→ v1.1.51), portfoliost ae8ab4b / c3410ea /
dfe84ca (→ v1.0.212). Full record in `plan-archive.md` §53.

---

## 54. Portfolio calendar: month grid over holdings' event calendars (example-service parity)

Closed 2026-09-24 — the portfolio Calendar tab is now the example-service **month
grid** over holdings' events (not gated, **no Impact control**, no macro
events, chip amounts in the instrument's base currency). Shipped on
contracts `CalendarData.holdings` (v1.6.37) + a real wallets
`GET /:id/calendar` (instruments fan-out, per-symbol failure-tolerant).
Compose e2e + PROD verified (SPA v1.0.220 / wallets v1.1.53, homelab
b4997f87f); one data finding — PROD `ticker_reference` resolves un-suffixed
AMD to the ASX Arrow Minerals row (currency AUD), user to fix manually.
Commits: portfoliost-contracts a567437, portfoliost-wallets 67958a7,
portfoliost b5620b2 / eee0bfd. Full record in `plan-archive.md` §54.

---

## 55. Sheets-sync import: dividend taxes + sheet-derived labels (user request 2026-09-27)

Proposal: — (direct user request; no proposal doc).

The Google-Sheets import currently drops three things the sheet already
carries: (1) dividend taxes — `Transakcje:AK` "kwota opodatkowana dywidendy
(waluta)" (taxable GROSS total in the transaction currency) and `Transakcje:AL`
"podatek zapłacony dywidendy (waluta)" (withholding tax total in the
transaction currency); (2) a free-text "program" column `Transakcje:AJ` (verified live
2026-09-27: 20 distinct values like `OwnSAP`, `MoveSAP`, `doplata roczna`);
(3) per-asset flags in the Podsumowanie catalog: `AI` = "Inspiracja" (28
distinct values, e.g. `Narzucone`, `Własne`) plus six boolean flag columns
with the literal cell value `"1"` = true: `AM` Crypto (2 assets), `AN`
Obligacje, `AO` Funds, `AP` Stock, `AQ` Growth, `AR` Dividend.

**Verified facts (live capture via a one-shot pod with the job's secrets,
2026-09-27 — do not re-derive):**

- Transakcje sheet has 2025 data rows; the sync currently reads `A1:AM` —
  AK/AL (0-based 36/37) are **already inside the fetched range**, only parsing
  is missing. AJ is 0-based 35.
- Dividend tax cells are **totals** in the transaction currency (verified
  against the sheet's own arithmetic): SAP 2022-05-23 row: qty 125, AD
  1,80384, AK `306,25` (gross), AL `80,77` (tax), and qty × AD = 225,48 =
  AK − AL = cashPLN ÷ rate (net); JM AB 2023-04-05: 23 × 9,8 = 225,4 =
  322,00 − 96,60. So AD/price is the NET per-unit price, sheet cash is the
  NET total, AK = gross total, AL = tax total. Rows from 2019–2021 and most
  PLN dividends have AK/AL empty — treat as net, no tax. AL `0,00`/empty =
  no tax.
- `Transakcje:AJ` holds 20 distinct program values (`OwnSAP`, `MoveSAP`,
  `doplata roczna`, …). An earlier capture (2026-09-27) also showed 47 Div
  rows (REITs, 2025-07 → 2026-07) carrying "X,XX zł" values there — the user
  removed those from the sheet the same day, so AJ is programs-only. If a
  `\d,\d+ zł`-shaped value ever reappears in AJ, skip it as a label (log a
  warning), never import it as data.
- Podsumowanie: the row-1 headers at AN–AR are **stale cached formula totals**
  ("162 077,72 zł" etc.), not real names — the user's semantics (AN =
  Obligacje, AO = Funds, AQ = Growth, AR = Dividend) are the source of truth.
  AI/AM headers are correct ("Inspiracja", "Crypto"). Column AP (0-based 41)
  also carries `"1"` flags — assigned the label **"Stock"** by the user.
- Wallets already models `taxes` end-to-end (zod + `scale8` persist in
  `src/routes/import.ts`, `wallet_transactions.taxes` / `portfolio_transactions.taxes`);
  the interactive dividend route uses the **example-service convention**
  (`portfolio-transactions.ts` §49): ptx `totalAmount` = NET = gross − taxes,
  wallet leg credited the NET. The import route currently does NOT apply that
  convention — it stores `totalAmount` = gross and ignores `wt.taxes` for the
  amount.
- Labels already exist in wallets: `labels` table (unique (user, name),
  palette-colored), join tables `position_labels` / `transaction_labels` /
  `wallet_transaction_labels`, `assertLabelsOwned` in `services/labels.ts`.
  The import API has **no** label surface today.

Repos touched: `portfoliost-contracts` (55.1), `portfoliost-wallets` (55.2),
`portfoliost-sheets-sync` (55.3). No SPA/mock changes: the label + tax shapes
ship through the existing contract-typed responses; the mock backend is not on
the import path.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level where applicable).

---

### 55.1 — contracts: label bootstrap + labels on ImportPortfolioTx

- [ ] `contracts/openapi.yaml`:
  - New `ImportLabelBootstrapRequest { externalSource, labels: string[]
    (min 1, max 200) }` and `ImportLabelBootstrapResponse { labels: { name,
    id }[] }` — idempotent ensure-by-name per user (201/200).
  - `ImportPortfolioTx` gains two optional string-array properties:
    `positionLabels` (names, applied to the row's open position) and
    `transactionLabels` (names, applied to the row's portfolio
    transaction). Names, not UUIDs — the importer only sees sheet text;
    resolution is server-side, per user.
- [ ] Push → CI patch-bump → `NODE_AUTH_TOKEN=$(gh auth token) npm install
  @marx2/contracts@<new>` in `portfoliost-wallets` → regenerate
  `generated/api-types` → contracts suite green.
- [ ] Tests: contracts suite (`npm test` in `portfoliost-contracts/contracts/`).
- [ ] Commit (contracts) + wallets consumer bump (one commit per repo).

### 55.2 — wallets: label bootstrap endpoint + labels/tax convention in import

- [ ] New route `POST /api/import/labels/bootstrap` in
  `src/routes/import.ts`: for each requested name, upsert `labels` on
  (userId, name) (palette auto-color via `nextPaletteColor` for creates,
  `onConflictDoNothing` + re-select for existing), return `{ name, id }` per
  name. Service JWT identity like the other import routes.
- [ ] `ImportPortfolioTxSchema`: add `positionLabels` / `transactionLabels`
  (`.array(z.string().min(1).max(40)).max(20).optional()`) mirroring the
  contract; reject unknown names with a per-row `ImportRowError
  ("label_not_found", …)` — a name the bootstrap didn't create is a bug,
  fail loud, don't silently drop.
- [ ] In `insertImportPortfolioTx`: after the position/tx is written (BUY/
  SELL/SHORT-open path yields `positionId`; the DIVIDEND path has the
  ptx row's `returning` id — capture it), apply labels idempotently:
  `positionLabels` → ensure the join set on `positionLabels` equals the
  requested set for that position (DELETE + INSERT within the row tx, same
  semantics as `setPositionLabels`); `transactionLabels` → same on the ptx
  row via `transactionLabels`. Empty/absent → no-op (never clears existing
  labels — labels are additive across rows; the §23.5 wipe deletes rows and
  the FK cascade cleans the joins).
- [ ] **Dividend net-amount convention** (align import with the interactive
  §49 rule): in `insertImportPortfolioTx`, when `ptx.type === "DIVIDEND"` and
  `ptx.taxes != null`: validate `taxes <= notional` (row error otherwise),
  `totalAmount` / `convertedTotalAmount` / `displayCurrency` fields use NET =
  round2(notional − taxes) exactly like `portfolio-transactions.ts`; the
  `walletTx.amount` keeps whatever the importer sent (the sheet's actual
  cash). When `ptx.taxes` is null, behavior is unchanged (net = gross).
- [ ] Unit tests (`import.test.ts`): (a) bootstrap creates then re-uses
  (second call → same id, `created` semantics not needed — just stable
  ids); (b) `positionLabels` sets the join on a BUY's position; (c)
  `transactionLabels` sets the join on the ptx row; (d) unknown label name →
  row error `label_not_found`, rest of batch unaffected; (e) DIVIDEND with
  `taxes` → ptx `totalAmount` = gross − taxes, `convertedTotalAmount` net ×
  rate, wallet amount untouched; (f) DIVIDEND with taxes > notional → row
  error; (g) DIVIDEND without taxes → totalAmount = gross (unchanged).
- [ ] Full wallets suite green (`npm run test`) + `npm run build`.
- [ ] Commit.

### 55.3 — sheets-sync: parse AK/AL/AJ + catalog flags, map labels & tax

- [ ] `transakcje-parser.ts`: `RawTransakcjeRow` gains `program: string`
  (col 35, trimmed, `"-"` → empty), `dividendTaxable: number | null` (col 36,
  `parsePlDecimal`), `dividendTax: number | null` (col 37, same parser).
  Update the file-header column list. **Do not** change `externalIdOf`
  (stable dedup keys must survive — no re-keying on a re-import).
- [ ] `podsumowanie-parser.ts`: `PodsumowanieCatalogEntry` gains
  `inspiracja: string | null` (col 34) and flag booleans for cols 38
  (Crypto), 39 (Obligacje), 40 (Funds), 41 (Stock), 42 (Growth), 43
  (Dividend) — true ⇔ trimmed cell === `"1"`. Expose as
  `catalogLabels: string[]` on the entry (label names: the Inspiracja value
  itself plus the flag names). Update the file-header column map + note that
  live AN–AR headers are stale formula totals (verified 2026-09-27).
- [ ] `sync.ts`: `CATALOG_RANGE` → `Podsumowanie!A1:AR233`. Before the import
  loop, collect the full label name set (all non-empty `program` values,
  skipping any `^\d,\d+\s*zł$` shapes with a logged warning, + all
  `catalogLabels` across matched entries), call the new
  `client.bootstrapLabels(...)`; assert every requested name came back with
  an id (fail fast). Extend the typed client in `wallets-api-client.ts`
  (`ImportLabelBootstrapRequest/Response`, `bootstrapLabels` method).
- [ ] `instrument-resolver.ts`: carry the catalog entry's
  `inspiracja`/flags through into `ResolvedInstrument` (e.g.
  `catalogLabels: string[]`) so the mapper can label the position — only
  when the join actually matched a catalog entry, never on the
  name-as-symbol fallback.
- [ ] `transakcje-mapper.ts`: for rows with a portfolio leg —
    - `portfolioTx.positionLabels = instrument?.catalogLabels ?? []`
      (omitted when empty);
    - `portfolioTx.transactionLabels = row.program ? [row.program] : []`
      (omitted when empty);
  - Dividend rows: when AK is present: `portfolioTx.price =
      row.dividendTaxable / quantity` (AK ÷ qty = GROSS per-unit, the §49
      interactive convention — notional = qty × price = AK gross) and
      `portfolioTx.taxes = row.dividendTax` (AL total); wallets then derives
      totalAmount = gross − tax = net, matching the sheet's AD/qty/cash.
      When AK is empty but AL present: keep the current AD/derived price and
      `taxes = AL` (row error if AL ≥ qty × price, per the 55.2 validation).
      Rows with AK AND AL empty → no taxes, today's behavior exactly.
      Rows of other Typs with AK/AL present → ignored (taxes only map on
      Div rows).
  - Dividend rows that are wallet-only (zero quantity) still ship
    `walletTx.taxes = null` (unchanged — the sheet's cash is the truth
    there) — taxes only apply on the ptx leg.
- [ ] Unit tests (`transakcje-parser.test.ts`, `podsumowanie-parser.test.ts`,
  `transakcje-mapper.test.ts`): parser — AK/AL/AJ parse incl. `"0,00"` →
  0 and empty → null; catalog — `"1"` flags (all six incl. AP→Stock) +
  Inspiracja → `catalogLabels`, missing cols → no labels; mapper — Div with
  AK+AL → ptx price = AK ÷ qty, taxes = AL, `transactionLabels` from AJ,
  `positionLabels` from catalog; Div with AL only → price unchanged +
  taxes = AL; Div without AK/AL → byte-identical to today's output; Kupno
  with AJ → `transactionLabels` on the BUY ptx; non-Div with AK/AL present
  → ignored; AJ with a `\d,\d+ zł` value → not a label, run logs a warning.
- [ ] Full sheets-sync suite green (`npm run test`); commit.

### 55.4 — PROD verification (wipe & re-import)

- [ ] Bump `portfoliost-wallets` pin (new GHA `v*` tag) and the
  `portfoliost-sheets-sync` image pin in
  `~/prv/homelab/homelab/cluster/apps/pfire/*/app/helmrelease.yaml`;
  Flux apply; verify with kubectl (`KUBECONFIG=$HOME/.kube/homylab`, ns
  `pfire`).
- [ ] Trigger Admin → Jobs → "Wipe & Reimport" (requires Pocket-ID session;
  user approves — production re-imports per AGENTS.md). Expected: zero row
  errors; the run log shows the label bootstrap count (≈ 20 program names +
  28 Inspiracja + 6 flags).
- [ ] Spot-check via API/SPA: a 2022 SAP Div shows ptx `taxes` = 80,77 EUR
  (sheet row 204), NET totalAmount, and the wallet leg = the sheet's net
  cash; an OwnSAP-labeled Kupno (2023-12-06 SAP) carries the `OwnSAP`
  transaction label; MO-BRUK position carries `Moje IKE` + `Dividend` +
  `Stock` position labels; a Crypto-flagged asset carries `Crypto`.
- [ ] Archive §55 to `plan-archive.md`.

**Design decisions (resolved 2026-09-27 by the user):**

- **Wallet leg = the sheet's cash as-is.** The sheet's formulas derive the
  per-share amounts from AK/AL, so the sheet cash (col 19) is the source of
  truth — verified net (cash ÷ rate = AK − AL). No re-derivation on the
  wallet side.
- **AJ is programs-only** — the "X,XX zł" per-unit notes were removed from
  the sheet by the user; a defensive skip for any future `zł`-shaped AJ
  value is kept (warn, never import as data).
- **AP flag = label "Stock"** (six flags total: Crypto, Obligacje, Funds,
  Stock, Growth, Dividend).
- **Multiple labels per asset are expected** — Inspiracja + all applicable
  flags stack on the position; no cap or priority.

