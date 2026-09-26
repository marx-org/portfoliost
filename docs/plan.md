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

## 55. Sheets-sync import: dividend taxes + sheet-derived labels

Closed 2026-09-27 — Dividend taxes (Transakcje AK/AL) imported with the §49
net convention (ptx gross = AK, taxes = AL, totalAmount = net); sheet-derived
labels attached: Transakcje AJ "program" → transaction label, Podsumowanie
Inspiracja (AI) + six flags (AM Crypto / AN Obligacje / AO Funds / AP Stock /
AQ Growth / AR Dividend) → position labels. New `POST /api/import/labels/
bootstrap` + `positionLabels`/`transactionLabels` on `ImportPortfolioTx`.
PROD wipe & re-import clean (2016 inserted, 0 errors). Full record in
`plan-archive.md` §55.

---

Closed 2026-09-24 — un-suffixed multi-exchange ticker collisions now leave
`resolveInstrumentCurrency` silent (§56.1, instruments v1.0.68); the
§56.2 PROD verify confirmed the calendar USD fix and exposed a missing
base-currency guard on `/history` + a hardcoded banner in `PriceChart.vue`,
both fixed in §56.3 (instruments v1.0.69, SPA v1.0.224; refusal state verified
in PROD). Open question resolved: no `?company=` hint. Full record in
`plan-archive.md` §56.

---

## 57. Transactions UI: clipped labels picker, missing label chips, hidden action column (user request 2026-09-24)

Proposal: — (direct user request; no proposal doc).

Three transactions-UI bugs reported from PROD (SPA v1.0.220 / wallets v1.1.55,
homelab). All three verified locally (vite + mock backend, 1280px viewport)
and, for the layout, against live example-service (the parity source):

1. **The "Labels" button looks dead in the transactions tables.**
   `LabelPickerPopover.vue:114` is `position:absolute; right-0` anchored to a
   detached zero-height `relative inline-block` div, never to the clicked row.
   In `TransactionsTable.vue` that anchor (:529–539) sits inside the root
   `card overflow-hidden` (:291, closes :540): the empty inline-block collapses
   to the card's left edge, so the 288px-wide panel opens at the card's
   bottom-left and extends ~170px below the card's bottom edge. Measured at
   1280px: popover top 1320 vs card bottom 1323, popover left −39
   (off-viewport) → the panel is fully clipped by `overflow-hidden`. In
   `CashTransactionsView.vue:380–390` and `PortfolioHoldingsTab.vue:575–584`
   the anchor sits outside the card, so the panel is not clipped but renders at
   the bottom of the page, hundreds of px from the clicked row (the holdings
   e2e in `tests/e2e/labels.spec.ts` passes for exactly that reason).
 2. **Labels are not visible in the transactions list.** The backend is
    correct: wallets joins `transactionLabels` in every list route
    (`portfolio-transactions.ts:1154–1206` per-portfolio, `:1668–1740` global
    `routes.get("/")`; `history.ts:105–115 / :131–143 / :159–174` the three
    wallet-cash routes), PROD wallets v1.1.55 (2026-09-24) contains D65–D68
    (`7075df9`), and the SPA already renders chips where data exists
    (`TransactionsTable.vue:389`, `CashTransactionsView.vue:234`). At the time
    of the report no PROD transaction carried a label: the only assignment
    paths were the broken picker (bug 1) and the sheets-sync import — and
    §55 **closed the same day** (commit `939ede9`): wipe & re-import clean
    (2016 rows, 0 errors, **39 labels created, incl. 33 `OwnSAP` transaction
    labels**), so the data gap is gone; PROD re-verification belongs in 57.5.
    Two real gaps remain: `WalletDetailView.vue:399–451` "Recent Transactions"
    renders no chips at all (its API `GET /api/wallets/:id/transactions`
    returns `labels`), and `portfoliost-wallets src/routes/transactions.ts:256`
    hardcodes `labels: []` in the wallet-tx PATCH response (the SPA re-fetches
    after edits so it is not user-visible today, but it contradicts the
    contract). The mock backend has zero label routes (dev-mock 404s on
    `/api/labels`) — out of scope here; e2e runs against the real wallets
    compose service.
3. **Action buttons invisible in the consolidated (global) transactions
   view.** Global mode is 10–11 columns; measured at 1280px: table wrap
   clientWidth 991 / scrollWidth 1143, actions-cell right edge 1392 vs the
   visible area ending at 1240 → Edit 22/38px visible, Labels + Delete fully
   off-screen behind `overflow-x-auto` (the user's "form is not wide enough").
   Example service (measured live on `app.example-service.ai`, both its transactions tables)
   keeps the actions column visible via `position:sticky; right:0;
   z-index:10` with a solid background (dark `rgb(15,20,36)`) and a
   `box-shadow: -1px 0 0` left separator — that is the parity fix.

Repos touched: `portfoliost` (SPA — 57.1, 57.2, 57.3, 57.5) and
`portfoliost-wallets` (57.4). No contracts change: response shapes are
unchanged, only the PATCH response stops lying about `labels`.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose e2e per AGENTS.md).

---

### 57.1 — Floating label picker anchored to the clicked button (fixes "labels button does not work")

- [ ] New `src/utils/popoverPosition.ts`: pure
  `computePopoverPosition(trigger: {top, right, bottom, left}, panel:
  {width, height}, viewport: {width, height}): {top, left}` — default below
  the trigger, panel's right edge aligned to the trigger's right; flip above
  (`top = trigger.top − gap − panel.height`) when the below position exceeds
  `viewport.height`; clamp `left ≥ 8` and `top ≥ 8`. Plain objects, no DOM —
  unit-testable.
- [ ] `LabelPickerPopover.vue`:
  - New prop `trigger: {top, right, bottom, left} | null` (rect numbers
    captured at click time — the trigger may unmount after a kebab menu
    closes, so store numbers, not the element).
  - Wrap the panel in `<Teleport to="body">`; replace `absolute right-0 mt-1`
    with `fixed z-40` + `:style` top/left from `computePopoverPosition`
    (panel size from a template ref measured after mount; estimate
    `{width: 288, height: 320}` for the first paint).
  - Close on outside `pointerdown` (document listener, ignore events inside
    the panel) and `Escape`; recompute position on `scroll` (capture) and
    `resize` while open. The `open` prop and `close`/`saved` emits are
    unchanged so the three call sites keep their contract.
- [ ] Rewire the call sites — delete the detached anchor div, pass the
  clicked button's rect:
  - `TransactionsTable.vue`: `openLabelPicker(tx, e: MouseEvent)` stores
    `pickerTrigger` from `e.currentTarget.getBoundingClientRect()`; replace
    the `:529–539` anchor div with a plain `<LabelPickerPopover … :trigger="pickerTrigger" />`
    mount; `@close` now clears `pickerTx` as well as `pickerOpen` (fixes the
    lingering empty anchor after Cancel).
  - `CashTransactionsView.vue:380–390` and `PortfolioHoldingsTab.vue:575–584`:
    same change (holdings passes the kebab "Set labels…" item's rect).
- [ ] Unit tests:
  - New `tests/unit/utils/popoverPosition.test.ts`: fits-below → below,
    right-aligned; no room below → flip above; narrow viewport → left clamped
    ≥ 8; no negative top.
  - Extend existing `tests/unit/components/LabelPickerPopover.test.ts`: panel
    renders into `document.body` (teleport) at the util-computed position for
    a given trigger rect; outside click emits `close`; Escape emits `close`.
- [ ] E2E: new `tests/e2e/transactions-labels.spec.ts` (serial, reuse the
  `login` helper from `labels.spec.ts`): on the portfolio transactions tab —
  click a row's "Labels" → `dialog[name="Set labels"]` visible **and** its
  `boundingBox()` inside the viewport with `top` within ~250px of the clicked
  row's `boundingBox().y` (proves adjacent, not bottom-of-page, not clipped);
  check a label, Save → chip `[title=<name>]` appears in that row. Repeat the
  open+assert flow on the global `/en/investments/transactions` view (the bug-1
  site).
- [ ] Tests: `npm run test`, `npm run build`, `npm run test:mock`,
  `npm run test:e2e` (docker compose) green.
- [ ] Commit.

### 57.2 — Sticky actions column in the transactions tables (example-service parity; fixes hidden Edit/Labels/Delete)

- [ ] `TransactionsTable.vue`:
  - Actions `th` (:343) and actions `td` (:456): add
    `sticky right-0 z-10 bg-white dark:bg-slate-900` plus the left separator
    `shadow-[-1px_0_0_0_#e2e8f0] dark:shadow-[-1px_0_0_0_#334155]` (example-service
    parity: `box-shadow: -1px 0 0`, solid background, z-10).
  - Row `<tr>` (:357): add `group`; the sticky `td` gets
    `group-hover:bg-slate-50 dark:group-hover:bg-slate-800` — opaque, so the
    scrolled-under columns never bleed through (the existing
    `hover:bg-slate-50 dark:hover:bg-slate-800/50` tr tint is translucent and
    cannot be used on the sticky cell).
  - Group-subtotal row (:479): split the trailing `td[colspan]` into a plain
    Ccy spacer `td` (global mode) + the sticky actions `td`, so the sticky
    cell is exactly one column wide.
- [ ] `CashTransactionsView.vue`: same treatment on its actions `th`/`td`
  (:239–266) — no overflow today at 1280 (6 columns), but parity +
  narrow-viewport safety.
- [ ] E2E (extend `transactions-labels.spec.ts`): at the default 1280×720
  viewport on the global transactions page — assert each row's Edit/Labels/
  Delete `boundingBox()` right edges are ≤ the table wrap's client rect right
  edge at `scrollLeft = 0` (visible without scrolling); then set the wrap
  `scrollLeft = scrollWidth` and assert the buttons keep the same on-screen x
  (sticky holds).
- [ ] Tests: `npm run build`, `npm run test`, `npm run test:mock`,
  `npm run test:e2e` green.
- [ ] Commit.

### 57.3 — Label chips in wallet "Recent Transactions" (SPA)

- [ ] `WalletDetailView.vue` recent-transactions table (:399–451): render
  `<LabelChips v-if="tx.labels?.length" :labels="tx.labels" :max="3"
  class="mt-1" />` under the description cell (parity with
  `CashTransactionsView.vue:234`); `GET /api/wallets/:id/transactions`
  already returns `labels` (wallets `history.ts:111–115`).
- [ ] E2E: extend `transactions-labels.spec.ts` — after labelling a cash
  transaction via the cash-tab picker (57.1), open its wallet detail and
  assert the chip appears in "Recent Transactions".
- [ ] Tests: `npm run build` + `npm run test:e2e` green.
- [ ] Commit.

### 57.4 — wallets: return real labels on the wallet-tx PATCH response

- [ ] `portfoliost-wallets src/routes/transactions.ts`: `serializeTx`
  (:234) gains a `labels: Label[] = []` parameter (parity with
  `portfolio-transactions.ts:1620`); the PATCH `/:txId` route fetches
  `labelsForWalletTransactions(db, [id])` for the updated row and passes it —
  replaces the hardcoded `labels: []` at :256.
- [ ] Unit test (`transactions.test.ts`): create a wallet tx, assign labels
  via `POST /api/wallets/:id/transactions/:txId/labels`, PATCH the tx →
  response `labels` contains the assigned label.
- [ ] Full wallets suite green (`npm run test`) + `npm run build`.
- [ ] Commit (portfoliost-wallets repo).

### 57.5 — Release + PROD verify

- [ ] Push `portfoliost` → GHA patch-bump → pin the **real** tag from
  `gh release list` in the homelab portfoliost helmrelease; 57.4 ships a
  wallets release + pin bump the same way (`KUBECONFIG=$HOME/.kube/homylab`,
  ns `pfire`).
- [ ] Flux + kubectl verify both deployments rolled.
- [ ] Playwright PROD (user's passkey session):
  - Consolidated transactions at 1280–1440px: Edit/Labels/Delete visible with
    no horizontal scroll; after scrolling the table right they stay pinned
    (sticky).
  - "Labels" on a transaction row: popover opens adjacent to the row (not
    clipped, not off-screen); assign a label → Save → chip appears in the row;
    for a wallet tx the chip also shows in the cash view + wallet detail.
  - Labels visible in the list (the §55 re-import already ran — 39 labels,
    33 `OwnSAP` tx labels): the 2023-12-06 SAP Kupno row shows the `OwnSAP`
    chip in the global view and in the per-portfolio transactions tab; the
    label filter bar lists the imported labels and filters the table.
- [ ] Commit (plan closeout) + archive §57 to `plan-archive.md`.

**Out of scope (noted):** labels control inside edit/create forms
(`EditTransactionModal`, wallet edit dialogs) — not part of the reported
bugs; mock-backend label routes (`/api/labels` 404 in dev-mock mode) —
separate follow-up.

---

## 58. Sheets-sync: AU (col 47) deposit/withdrawal reconstruction + wallet-tx labels + balance column

Proposal: — (user request 2026-09-29; extends `proposals/google-sheets-sync.md` §col-3 Typ mapping; no new proposal doc).

`Transakcje!AU` (col 47, header `wpłata/wypłata`) is a 1/0 flag that is
**not imported today** (job fetches `A1:AM` only). Semantics (user-confirmed
2026-09-29): **0 = no deposit/withdrawal impact on the wallet; 1 = the row's
cash movement is a deposit/withdrawal, direction per Typ.** Verified on the
live sheet (2 024 rows): AU=1 on all 58 Wpłata/Wypłata rows, on 320 Kupno and
45 Sprzedaż rows (Equate+ 121/39, NN PPK/PPO 168, Rach. rejestrowy PKO BP
26, Crypto 5, IB 4), AU=0 on everything else. These are the deposits missing
from wallets: e.g. every Equate+ monthly salary→SAP buy (121 Kupno) has no
Wpłata row, and Equate+ is a special no-cash account — its stock comes
directly, and each SAP sale's cash is in fact deposited into IBKR (user
confirmed). The `Gotówka` sheet (332 weekly balance snapshots 2020-11 →
2026-09, cols `IB` / `IKE Marek` / `IKE Beata` among ROR accounts) is a
**reference only** — used for a warn-only reconciliation report that makes
sheet/import mistakes easy to find, never a data source (user will iterate
the algorithm over several wipe & reimport rounds).

Also in this section (user request): wallet-transaction **labels on import**
(the DB table `wallet_transaction_labels` + SPA `LabelPickerPopover` already
exist; the import API and the SPA wallet-tx edit dialog do not expose labels
— §57 owns the *interactive* picker/chips UI, this section owns the
*import-side* labels + the wallet edit-dialog labels control) and a
**balance-after-transaction** column computed on every wallet-tx list route
(ledger-derived via window sum, no new storage).

Repos touched: `portfoliost-contracts` (58.1), `portfoliost-wallets` (58.2,
58.3, 58.4), `portfoliost-sheets-sync` (58.5, 58.6, 58.7), `portfoliost`
SPA (58.8), release/PROD (58.9, 58.10).

Design decisions (resolved 2026-09-29):

- **Paired legs** (option a): an AU=1 position row keeps its existing wallet
  leg (INVEST/SELL) **and** gains a synthetic counterpart leg (DEPOSIT with
  equal & opposite sign, or for Equate+: a TRANSFER of the cash into IBKR).
  Net balance effect zero — history complete, no distortion.
- **Equate+ rows**: `Konto = Equate+` never ends with cash in that wallet —
  its synthetic leg is always a TRANSFER to **IBKR** (`targetWalletName`),
  EUR→USD at the row's col 21 rate. AU=1 Equate+ Kupno: synthetic `DEPOSIT +X`
  into Equate+ **and** `TRANSFER −X → IBKR` (paired legs); AU=1 Sprzedaż:
  synthetic `TRANSFER −X → IBKR` on the SELL row. Net: IBKR gains the cash,
  Equate+ wallet stays at 0.
- **Sign convention (wipe & reimport fixes it)**: DEPOSIT is imported with a
  **positive** amount, WITHDRAWAL negative — the mapper normalizes the
  sheet's cash-flow sign (`Wpłata` is written negative in the sheet, so the
  current 53 DEPOSIT rows sit in PROD with negative amounts). Wallets server
  clamps: DEPOSIT/SELL/DIVIDEND/INTEREST → +|amount|, WITHDRAWAL/FEE →
  −|amount|, INVEST/ADJUSTMENT/TRANSFER → amount as sent.
- **Gotówka recon is warn-only**, never fails the run (data stays reference
  quality); IBKR tolerance ±50 USD converted at the latest row rate (margin
  account, invisible fees; negative balances allowed), IKE Marek/Beata ±10
  PLN (negative balance → loud warning, never synthesized).
- **No Gotówka-driven synthesis** — only the AU flag produces rows.
- **Label split vs §57**: §57 = SPA interactive picker fixes, chips in lists,
  sticky actions. §58 = import-API labels (`ImportWalletTx.labels`), the
  wallet-tx **edit-dialog** labels control, and label chips on the AU-synthetic
  + Wpłata/Wypłata import rows. No overlap.

Rules: one step = one commit; a step is marked `[x]` only after its tests
pass (unit + docker-compose level). 58.1–58.4 land before any wipe (the
reimport depends on the new wallets surface).

---

### 58.1 — contracts: transfer-on-import, wallet-tx labels, balanceAfter

- [ ] `portfoliost-contracts/contracts/openapi.yaml`:
  - `ImportWalletTx` (import schema): add `targetWalletName: { type: string,
    nullable: true }` (paired-transfer destination, resolved server-side by
    name among the bootstrapped wallets) and `labels: { type: array, items:
    { type: string } }` (label names, bootstrap-resolved, same convention as
    `ImportPortfolioTx.transactionLabels`).
  - `WalletTransaction` (+ the recent-transactions item shape if it is a
    separate schema): add `balanceAfter: { type: number, nullable: true }`
    (wallet currency, after this tx) and, for transfer legs, `targetWalletName:
    { type: string, nullable: true }` + `targetAmount: { type: number,
    nullable: true }` so the SPA can render "→ IBKR (1 431,02 USD)".
- [ ] Push contracts main → GHA patch bump; `NODE_AUTH_TOKEN=$(gh auth token)
  npm install @marx2/contracts@<new>` + `npm run gen:types` in
  `portfoliost`, `portfoliost-wallets` (if generated), `portfoliost-sheets-sync`
  (types only where used).
- [ ] Tests: contracts `npm test` (spec validity) green.
- [ ] Commit (portfoliost-contracts) + consumer install commits.

### 58.2 — wallets: TRANSFER legs on the import API (paired, name-addressed)

- [ ] `portfoliost-wallets src/routes/import.ts`:
  - `ImportWalletTxSchema`: add `targetWalletName: z.string().min(1).nullable()
    .optional()`; validate: not equal to the row's wallet, wallet exists
    (name among the user's wallets), and `targetAmount` is never sent (server
    computes: same-ccy = −amount; cross-ccy = amount × exchangeRate,
    `rateSource: manual` when the row carries col-21-style rates).
  - `insertImportWalletTx`: when `targetWalletName` set → insert the source
    leg (`amount` as sent, `toWalletId`, `targetAmount`, `transferFxRate =
    exchangeRate`) and the paired counterpart leg in the destination wallet
    (`type: TRANSFER`, `amount = +targetAmount`, `linkedTxId` back-reference,
    `rateSource: "manual"`, `externalId = row.externalId + "#t"`,
    `reference` suffixed `(→ <target>)`), both `externalSource =
    google-sheets:transakcje`.
  - Wipe/row-error paths: verify `DELETE ... where walletId in (sourceWallets)`
    removes **both** legs (the counterpart lives in the destination wallet;
    currently only `toWalletId` is nulled — extend the wipe to also delete by
    `linkedTxId in (...)` / `externalSource` so re-imports never double-count
    the IBKR leg).
- [ ] Unit tests (`import.test.ts`): same-ccy transfer pair (amounts/opposite
  signs, `linkedTxId` both ways, both wallets' balances move), cross-ccy pair
  (targetAmount via the manual rate), unknown target name → 400 row error,
  target == own wallet → row error, wipe removes both legs and re-import
  recreates them idempotently.
- [ ] Full wallets suite green (`npm run test`) + `npm run build`.
- [ ] Commit (portfoliost-wallets).

### 58.3 — wallets: wallet-tx labels on import + real migration

- [ ] DB: `wallet_transaction_labels` exists in `src/db/schema.ts` but check
  for a migration — if absent, add one (create table + indexes, mirrors
  `transaction_labels`).
- [ ] `src/routes/import.ts`:
  - `ImportWalletTxSchema`: add `labels: z.array(z.string().min(1).max(40))
    .max(20).optional()`.
  - After the wallet tx inserts, resolve names → ids with the same
    unknown-name-loudly-fails rule as `ImportPortfolioTx.transactionLabels`
    (§55.1) and insert into `wallet_transaction_labels` (the job's
    `/labels/bootstrap` call already creates them).
  - Server-side sign clamp (design decision): normalize amounts by type
    (DEPOSIT/SELL/DIVIDEND/INTEREST → +|a|; WITHDRAWAL/FEE → −|a|;
    INVEST/ADJUSTMENT/TRANSFER as sent) in `insertImportWalletTx`.
  - `serializeTx`-family list responses already join `wallet_transaction_labels`
    in `history.ts`; ensure the plain `GET /wallets/:id/transactions` list
    returns `labels` (it is in the contract) — fix if it doesn't.
- [ ] Unit tests: import a wallet tx with `labels: ["OwnSAP"]` (bootstrapped)
  → list returns the chip; unknown label name → row error `label_not_found`;
  DEPOSIT sent as −500 lands as +500, WITHDRAWAL +500 as −500 (balance math
  asserted).
- [ ] Full wallets suite green + build.
- [ ] Commit (portfoliost-wallets).

### 58.4 — wallets: `balanceAfter` on wallet-tx list responses (ledger-derived)

- [ ] `portfoliost-wallets` (list routes over `wallet_transactions`:
  `routes/transactions.ts` list, `routes/history.ts` the three wallet-cash
  routes, `recent-transactions`): compute per row
  `balanceAfter = running SUM(rowEffect) over (partition by walletId order by
  executedAt, id)` — `rowEffect` (already the fee- and FX-aware signed delta,
  in wallet currency) from `transactions.ts`. Prepend the wallet's opening
  (pre-import) balance only if trivial — default: running sum from first
  ledger row (null for none). Same-ccy rows add their amount; cross-ccy rows
  add amount × (manual `exchangeRate` or FX table) exactly as `rowEffect` does.
- [ ] Contract shape: `balanceAfter` on `WalletTransaction` / recent item
  (58.1) — SPA consumes, mock backend returns `null` (documented dev gap).
- [ ] Unit tests: seeded 4-tx wallet (DEPOSIT, INVEST, SELL, WITHDRAWAL + one
  cross-ccy INVEST with manual rate) → list rows' `balanceAfter` equals
  hand-computed running balances incl. fee deduction; a TRANSFER pair shows
  −X on source and +targetAmount on destination with each wallet's series
  consistent.
- [ ] Full wallets suite green + build.
- [ ] Commit (portfoliost-wallets).

### 58.5 — sheets-sync: fetch to AU, parse the flag, validation gate

- [ ] `portfoliost-sheets-sync src/sync.ts`: `RANGE = "Transakcje!A1:AU"`.
- [ ] `src/transakcje-parser.ts`: `RawTransakcjeRow.au: number` — 0/1 from
  col 47 (0-based 46); a non-`0`/`1` non-empty value throws (sheet contract
  violation, abort); `parseRow` + unit tests (0, 1, empty→abort, garbage→abort).
- [ ] Validation gate in the mapper/orchestrator: a `Wpłata`/`Wypłata` row
  with AU=0 → **abort** with sheet-row number (the flag says the cash event
  isn't a wallet deposit/withdrawal — contradiction, never guess).
- [ ] Tests: parser unit tests + mapper abort test. Full sheets-sync suite
  green (`npm run test`).
- [ ] Commit (portfoliost-sheets-sync).

### 58.6 — sheets-sync: AU=1 synthetic cash legs (+ Equate+ transfers, sign fix)

- [ ] `src/transakcje-mapper.ts` — return type becomes `{ legs: ImportTransaction[] }`
  (or an array) since one row can now produce two wallet legs:
  - **Kupno AU=1**: existing legs (INVEST wallet + BUY portfolio) + synthetic
    `DEPOSIT +|cashFlow|` in the row's wallet/ccy/rate (rateSource manual,
    `externalId = row.externalId + "#d"`, description `Wpłata (${aktywo},
    wiersz N)`, `reference` same convention; labels: the row's `program` note
    if any). For `Konto = Equate+`: the DEPOSIT is paired as a TRANSFER —
    i.e. `targetWalletName: "IBKR"` (server creates the IBKR credit leg);
    the portfolio BUY still lands in the Equate+ portfolio.
  - **Sprzedaż AU=1**: existing legs (SELL wallet + SELL portfolio) +
    synthetic `WITHDRAWAL −|cashFlow|` (`#w`), **except** `Konto = Equate+`
    where the SELL wallet leg itself carries `targetWalletName: "IBKR"`
    (paired transfer of the proceeds EUR→USD at the row rate; the portfolio
    leg is unchanged).
  - **Wpłata/Wypłata**: sign-normalized (positive DEPOSIT / negative
    WITHDRAWAL — the server clamp of 58.3 makes this safe) + labels
    `["Program note"]` when AJ present. No `targetWalletName` (bank→broker
    top-ups stay in the destination wallet).
  - **AU=0 rows**: unchanged (INVEST/SELL/DIVIDEND legs as today).
  - `externalId` suffixes stay within the wallets' dedup key
    (`externalId + "#d"` etc. are unique strings — no contract change).
- [ ] `src/wallets-api-client.ts`: `ImportWalletTx` gains
    `targetWalletName?: string | null` + `labels?: string[]` (match 58.1
    types); `sync.ts` bootstrap-labels set includes the Wpłata/Wypłata AJ
    notes.
- [ ] Unit tests (`transakcje-mapper.test.ts`): Kupno AU=1 (two legs, signs,
    `#d` externalId, DEPOSIT positive), Sprzedaż AU=1, Kupno AU=1 Equate+
    (TRANSFER target IBKR, EUR/USD rate passed), Sprzedaż AU=1 Equate+ (SELL
    leg carries target), Wpłata sign flip (sheet −6 336,29 → +6336.29),
    AU=0 Kupno unchanged (no extra leg), Wpłata AU=0 → abort.
- [ ] Full sheets-sync suite green.
- [ ] Commit (portfoliost-sheets-sync).

### 58.7 — sheets-sync: Gotówka reconciliation report (warn-only)

- [ ] `src/gotowka-recon.ts` (new): fetch `Gotówka!A1:L`; map header names →
    tracked wallets: `IB` → IBKR, `IKE Marek` → IKE Marek, `IKE Beata` →
    IKE Beata (other columns ignored — bank accounts out of scope per user);
    missing/renamed tracked column → abort with the header list.
- [ ] Per tracked wallet: interleave ledger effects (58.4 `rowEffect` in PLN
    — cross-ccy rows × their rate) with the snapshots; at each snapshot date
    `diff = sheetBalance − (prevSheetBalance + Σ effects in between)`;
    report lines `[gotowka] IBKR 2022-10-15: sheet 41 876,34 vs recon
    41 412,10 (Δ +464,24)` for |Δ| over tolerance — **IBKR ±50 USD at the
    latest row rate, IKE ±10 PLN**; negative recon balance on IKE wallets →
    `⚠ below zero` line; print a per-wallet summary (worst Δ, snapshot count).
    **Never changes the exit code** (58.10's row-error exit code stands
    alone).
- [ ] `sync.ts`: call after import batches complete (needs the fresh ledger —
    read the wallets' tx list via a new read-only client method, or recompute
    from the mapped rows in-memory — prefer in-memory: same `rowEffect`
    math over the rows we just sent).
- [ ] Unit tests: synthetic ledger+snapshots fixture — deposit found exactly
    (no line), 60 USD IBKR gap → one line, 5 PLN IKE gap → none (within tol),
    IKE below-zero → warning line, unknown header → abort.
- [ ] Full sheets-sync suite green.
- [ ] Commit (portfoliost-sheets-sync).

### 58.8 — SPA: balance column + wallet-tx edit-dialog labels control

- [ ] Balance display (typed against 58.1 generated components):
  - `TransactionsTable.vue`: new `Balance` column (after Amount) rendering
    `tx.balanceAfter` via the existing currency formatter (null-safe);
  - `CashTransactionsView.vue` + `WalletDetailView.vue` recent-transactions
    table: same column.
- [ ] Wallet-tx edit dialog (`WalletDetailView.vue` :500+): add a labels row
    using `LabelPickerPopover` (entity = wallet tx id) — the §57 popover
    component as-is (cross-reference: picker anchoring/chips are §57.1/57.3;
    here only the dialog mount + a chip preview); save via existing
    `setWalletTransactionLabels` API (already in `src/api/labels.ts`).
  - Transfer rows render `→ <targetWalletName> (targetAmount ccy)` from the
    58.1 fields; transfer rows keep their existing no-edit guard.
- [ ] Unit tests: table renders balance column values + null case; dialog
    shows the picker and calls `setWalletTransactionLabels` on save.
- [ ] E2E (extend `tests/e2e/`): wallet detail — a DEPOSIT row shows a
    Balance cell equal to the wallet balance when it is the latest row; the
    edit dialog label picker assigns a label → chip appears in the row
    (against the compose wallets service, not the mock).
- [ ] Tests: `npm run build`, `npm run test`, `npm run test:mock`,
    `npm run test:e2e` green.
- [ ] Commit (portfoliost).

### 58.9 — Release + PROD verify (before the first wipe)

- [ ] Push `portfoliost-wallets` + `portfoliost` → GHA patch bumps → pin the
    **real** tags from `gh release list` in the homelab helmreleases
    (`KUBECONFIG=$HOME/.kube/homylab`, ns `pfire`); verify both rollouts.
- [ ] `portfoliost-sheets-sync` image rebuilt via GHA; pin in the homelab
    job/cron.
- [ ] kubectl verify + a dry run of the sync job **without** `--wipe`
    (idempotent no-op expected: all rows skipped, recon report prints, exit 0
    — proves the new code path is safe before touching PROD data).
- [ ] Commit (plan note).

### 58.10 — PROD wipe & reimport (iterative; user-authorized per run)

- [ ] Admin → Jobs → Wipe & Reimport (`POST /api/admin/jobs/sheets-sync/run
    {wipe:true}`, authenticated Pocket-ID session).
- [ ] Assert: 0 row errors; DEPOSIT rows positive / WITHDRAWAL negative;
    the ~166 AU=1 Equate+/PPK/PPO/Rach.rej/Crypto rows produced their
    synthetic legs (Equate+ wallet balance ≈ 0, IBKR gained the SAP sale
    proceeds as transfers); `#d`/`#w`/`#t` externalIds dedupe on a second
    run (skipped, no duplicates).
- [ ] Read the Gotówka recon report: for each warning line decide with the
    user — sheet mistake (fix sheet) vs import gap (adjust 58.6) — then wipe
    & reimport again. Repeat until the report is clean within tolerances.
- [ ] Commit (plan closeout) + archive §58 to `plan-archive.md` once the
    report is accepted clean.

---

## 59. ApexCharts 5.16 → 7.5.1 (user request 2026-09-24)

Proposal: — (direct user request: "upgrade charts apex to latest"; no proposal doc).

SPA-only dependency bump: `apexcharts ^5.10.0` (5.16.0 installed) →
`^7.5.1` (latest, 2026-09-20), keeping `vue3-apexcharts 1.11.1` (already the
latest release; peer range `apexcharts >=5.10.0`). No other repo is touched —
no contracts, no backend, no provider tier.

Verified 2026-09-24 (upstream release notes + a temporary local bump that was
fully reverted afterwards):

- **Usage surface is small.** All ~14 chart mounts go through the local
  `src/components/ApexChart.vue` wrapper (globally registered as
  `apexchart`), which wraps `vue3-apexcharts`. Chart types in use: area
  (card sparklines, wallet balance, price area), line (portfolio performance),
  bar (seasonality, EPS surprises, fundamentals, charting comparison), donut
  (allocation, projections). **None** of the v7 opt-in features
  (trellis/storyboard/perspectives/ink/renderer-canvas/link/measure/history/
  context-menu) and **no** `plotOptions.bar.borderRadiusWhenStacked` (removed
  in v7) are used — both v7 breaking changes are no-ops here. `dataLabels`
  are enabled only on the static research bar charts; v7's new
  `dataLabels.animate.enabled` default (true) affects only data-change
  updates, not initial render.
- **v6.0.0 is config-compatible** ("existing configs keep working unchanged");
  its default-on behaviour changes (coherent variable-length transitions,
  mobile pinch/pan) are no-ops: our charts remount on data swap via the
  §48.6e `key` pattern rather than in-place `updateOptions`, and the app is
  desktop-first. v6's idempotent `render()` additionally guards the
  wrapper's mount path.
- **Wrapper works on v7 — proven, not assumed.** `vue3-apexcharts 1.11.1`
  predates v6/v7 (published 2026-03-03) and was never tested against them, but
  a live smoke (temporary `apexcharts@7.5.1` install, vite dev + mock backend,
  Playwright) rendered every surface correctly: sparklines, performance line,
  research PriceChart incl. the custom `tooltip.custom` HTML on hover
  (`.apexcharts-tooltip`/`-title`/`-series-group` structure intact), bars with
  data labels, grouped bars, donut. **Zero** console warnings — in particular
  no v7 "feature configured but not loaded" warnings — and no watermark.
  Every e2e selector the suite depends on (`.apexcharts-canvas`,
  `svg.apexcharts-svg`, `g.apexcharts-grid`, `.apexcharts-yaxis text`,
  `.apexcharts-xaxis`, `.apexcharts-tooltip`, `.apexcharts-legend`) is
  unchanged in v7. One v7 DOM difference found: donut slices are now
  `apexcharts-donut-slice-N` (indexed) instead of bare
  `apexcharts-donut-slice` — nothing in `src/` or `tests/` references the
  bare class, so no action.
- **Licensing improves.** The v6.x default bundle shipped 24%
  licence-gated Premium code (watermarked without a licence); v7 moved all
  premium features to opt-in add-ons, so the default bundle is 0% gated and
  our usage (all free-tier features) renders watermark-free — verified in the
  smoke.
- **Node engines:** apexcharts 7.5.1 declares `^20.19.0 || ^22.12.0 ||
  >=24.0.0`; the Dockerfile's floating `node:22-alpine` currently resolves to
  22.23 (satisfied) and the local toolchain is 22.23. No Dockerfile change
  needed; noted so a future node-20 pin doesn't break the build.

Design decisions (resolved 2026-09-24): keep `vue3-apexcharts` (the smoke
above is the evidence for the keep-vs-drop question); if 59.2 nevertheless
exposes wrapper/v7 incompatibility in the dockerized stack, the fallback is to
replace `vue3-apexcharts` with a ~60-line direct wrapper inside the existing
`ApexChart.vue` (`new ApexCharts(el, options).render()` on mount, destroy on
unmount, keep the remount-key pattern the callers already use) — and re-run
59.2.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level per AGENTS.md).

---

### 59.1 — Bump `apexcharts` to `^7.5.1`

- [ ] `package.json`: `"apexcharts": "^7.5.1"`; `npm install` → commit the
  `package-lock.json` change; assert the tree resolves `apexcharts@7.5.1` and
  `vue3-apexcharts@1.11.1` (unchanged) — `npm ls apexcharts vue3-apexcharts`.
- [ ] No source changes expected (config compatibility verified in the
  section intro). If `vue-tsc` surfaces type fallout from the types v6+ ships
  in-package (e.g. `chart.type` literal narrowing in the `as const` options
  objects), fix it in the affected chart components only — minimal diff, no
  behaviour change.
- [ ] Tests: `npm run build` (includes `vue-tsc --noEmit`), `npm run test`,
  `npm run test:mock`, `docker compose up -d --build` +
  `npm run test:e2e` (the chart specs — `chart-currency`,
  `chart-title-stability`, `chart-recompute`, `charting`, `combined-chart`,
  `parity-portfolios`, `research`, `performance-display-currency` — assert on
  the `.apexcharts-*` DOM and double as the v7 DOM-compatibility gate) green.
- [ ] Commit.

### 59.2 — Visual + console sweep across all chart surfaces (docker compose)

- [ ] Against the rebuilt compose stack (`:8080`), Playwright pass at 1280px
  over every chart surface: main page (portfolio-card sparklines +
  "Portfolio Value" line), research overview (PriceChart: render, custom
  tooltip on hover shows title + series row + transactions block when
  transactions are enabled, buy/sell markers), seasonality + EPS bar charts
  (data labels legible), allocation + projections donuts, charting grouped
  bars (preset-loaded), wallet balance area.
- [ ] Per surface assert: chart visible (`.apexcharts-canvas`), console has
  **zero** errors/warnings mentioning apexcharts — in particular no v7
  "feature … configured but … not loaded" warning and no watermark overlay or
  "Premium" text in the rendered page.
- [ ] If a surface drifted (label animation unwanted on the static bar
  charts, tooltip placement, sizing): adjust that component's options (e.g.
  `dataLabels: { animate: { enabled: false } }`) — re-run the sweep and the
  chart e2e specs.
- [ ] Commit (the fixes, if any; a verification-only step otherwise — note
  that in the commit of 59.3's plan closeout).

### 59.3 — Release + PROD verify

- [ ] Push `portfoliost` → GHA patch-bump → pin the **real** tag from
  `gh release list` in the homelab portfoliost helmrelease
  (`KUBECONFIG=$HOME/.kube/homylab`, ns `pfire`); Flux + kubectl verify the
  rollout.
- [ ] Playwright PROD (user's passkey session): main page cards + one
  research PriceChart render, custom tooltip works on hover, console clean,
  no watermark, no v7 feature warnings.
- [ ] Commit (plan closeout) + archive §59 to `plan-archive.md`.

---

## 60. Research "Go back" returns to the origin page (user request)

Proposal: — (direct user request; no proposal doc).

Bug (user-reported): the research page's "← Go back" link
(`src/modules/instruments/ResearchView.vue:89`) is hardcoded to
`/en/investments`. Coming into research from a specific portfolio (holdings
/ calendar / compare tabs) or from the transactions list (global or
per-portfolio), "Go back" drops the user to the main portfolios page
instead of the page they came from.

Fix: a context-aware back target. Every contextual entry point into research
passes the current page's `route.fullPath` as a `from` query param; the
research header's back link targets it (guarded to internal `/en/` paths).
When `from` is absent (deep link / first load / direct nav) the fallback is
`/en/investments` — today's behaviour. `from` is preserved across research
tab switches and symbol quick-switches so the origin is not lost mid-research.
`fullPath` (not just `path`) is used so transactions-list filter state
survives the round trip.

SPA-only (`portfoliost`); no contracts or backend changes. The sidebar
"Research" nav item (`SidebarNav.vue:60`, a static top-level nav entry to a
default AAPL symbol) is not a contextual link — explicitly unchanged, it
keeps the fallback.

Rules: one step = one commit; a step is marked `[x]` only after its tests
pass (unit + docker-compose level per AGENTS.md).

---

### 60.1 — Core: `from` query param + back-target resolution (`research.ts`, `ResearchView.vue`)

- [ ] `src/utils/research.ts`:
  - `researchRoute(symbol: string, from?: string | null): RouteLocationRaw`
    → `{ name: "research-overview", params: { symbol:
      researchSymbol(symbol) }, query: from ? { from } : undefined }`
    (single source for every entry point; keeps the existing symbol
    normalization rule).
  - `researchBackTarget(query: Record<string, unknown>): string` — pure:
    `typeof query.from === "string" && query.from.startsWith("/en/")` →
    return that path; anything else (missing, external URL, relative, junk)
    → `"/en/investments"`.
- [ ] `src/modules/instruments/ResearchView.vue`:
  - `const backTarget = computed(() => researchBackTarget(route.query))`;
    replace `to="/en/investments"` (:89) with `:to="backTarget"`.
  - Preserve `from` on in-research navigation so the origin survives
    tab/symbol switches: add
    `const preservedQuery = computed(() =>
    route.query.from ? { from: String(route.query.from) } : undefined)`;
    the tab-nav router-links (:112–121) get `:to="{ name: tab.name, params:
    { symbol: routeSymbol }, query: preservedQuery }"` and `goToSymbol`
    (:33–35) pushes the same query.
- [ ] Unit tests: new `tests/unit/utils/research.test.ts` —
  `researchRoute`: with `from` (query present, symbol normalized), without
  (`query` absent, not an empty object); `researchBackTarget`: a valid
  `/en/portfolios/1/holdings` passed through; `http://…`, `//evil`,
  `investments` (relative), non-string, and empty query →
  `/en/investments`.
- [ ] Tests: `npm run test`, `npm run build`, `npm run test:mock` green.
- [ ] Commit.

### 60.2 — Wire `from` (current `route.fullPath`) at all contextual entry points

Every navigation into research below switches to
`researchRoute(symbol, route.fullPath)` (add `useRoute()` where the
component does not already use it):

- [ ] `src/components/TransactionsTable.vue:373` — shared by the global
  `/en/investments/transactions` view and the per-portfolio transactions
  tab (the reported bug site).
- [ ] `src/modules/portfolios/PortfolioHoldingsTab.vue` — `goResearch()`
  (:328, kebab "Research") and the symbol router-link (:426).
- [ ] `src/modules/portfolios/PortfolioCalendarTab.vue:221` (event chips).
- [ ] `src/modules/portfolios/PortfolioCompareTab.vue:60` (rows).
- [ ] `src/modules/portfolios/EditTransactionModal.vue:173` (`goResearch` —
  `from` = the page the modal was opened over, since the route is
  unchanged while a modal is open).
- [ ] `src/modules/portfolios/AddPositionDialog.vue:470` (`goResearch` —
  keep the existing `.US` suffix handling, then call the helper).
- [ ] `src/modules/instruments/InstrumentSearchModal.vue:47`
  (`openResult`, default mode only — the `mode="add"` mounts in
  ChartingView / AddPositionDialog / PortfolioPerformanceTab emit instead
  of navigating and are untouched; when mounted on the research page itself,
  `from` = the current research path, so switching symbols keeps the
  previous symbol reachable via back).
- [ ] `src/modules/watchlists/WatchlistsView.vue:124` (watchlist items →
  back returns to the watchlist).
- [ ] Explicitly unchanged: `src/layout/SidebarNav.vue:60` (top-level nav
  entry, no context — falls back to `/en/investments`).
- [ ] Tests: `npm run build`, `npm run test`, `npm run test:mock` green.
  This step is behaviour-neutral on its own (no entry point passed `from`
  before 60.1, and the back target only changes when the param is present);
  the user-visible fix is proven by the e2e in 60.3.
- [ ] Commit.

### 60.3 — E2E: back returns to the origin (extend `tests/e2e/research.spec.ts`)

Reuse the existing spec's login helper and seeded portfolio/transaction
fixtures (the seeded portfolio with transactions that
`tests/e2e/labels.spec.ts` already uses on the per-portfolio tab).

- [ ] Portfolio origin: main page → open the seeded portfolio → Holdings
  tab → click a position's symbol link → research overview for that symbol;
  assert the "Go back" link's `href` equals `/en/portfolios/<id>/holdings`;
  click it → URL is that portfolio's holdings tab and the holdings table is
  visible.
- [ ] Global transactions origin: `/en/investments/transactions` → click a
  row's symbol → research; back link `href` =
  `/en/investments/transactions`; click → the transactions table is
  visible.
- [ ] Per-portfolio transactions origin: open the seeded portfolio's
  Transactions tab → click a row's symbol → research; back link `href` =
  `/en/portfolios/<id>/transactions`; click → that tab is shown.
- [ ] Origin survives tab switch: arriving at research from Holdings, click
  the "Dividends" research tab → the back link `href` still equals the
  holdings path.
- [ ] Deep-link fallback: navigate directly to
  `/en/research/<seeded symbol>/overview` (no `from`) → back link `href` =
  `/en/investments`.
- [ ] Tests: `npm run test:e2e` (docker compose) green.
- [ ] Commit.

### 60.4 — Release + PROD verify

- [ ] Push `portfoliost` → GHA patch-bump → pin the **real** tag from
  `gh release list` in the homelab portfoliost helmrelease
  (`KUBECONFIG=$HOME/.kube/homylab`, ns `pfire`); Flux + kubectl verify
  the rollout.
- [ ] Playwright PROD (user's passkey session):
  - Open a portfolio → Holdings → click a holding's symbol → research;
    "Go back" → back on that portfolio's holdings tab.
  - Global transactions list → click a row's symbol → research; "Go back"
    → back on the transactions list (filters intact if any were set).
  - On research, switch a tab → "Go back" still targets the origin.
- [ ] Commit (plan closeout) + archive §60 to `plan-archive.md`.

---

## 61. Shared TickerBadge: logo + ticker + name + details at every ticker surface (user request 2026-09-24)

Proposal: — (direct user request: "make a ticker component which consist of: logo, ticker, name, details (like (PL) Stock) and then use this component everywhere we show a ticker, for example: top/bottom performers, dividends tab, news, Compare with peers"; no proposal doc).

One presentational component — `src/components/TickerBadge.vue` — replaces the ~10 ad-hoc
ticker renderings across the SPA: holdings symbol cell, top/bottom performers, transactions
symbol cell, portfolio dividends rows, portfolio news cards, research header, research
overview header, compare-with-peers column headers, instrument search results, watchlist
items, and form symbol previews. It renders the instrument logo, the ticker, an optional
details line `(<CC>) <Type>` (e.g. `(PL) Stock`), and the company name.

Example service parity source (verified live 2026-09-24): the holdings-table
`instrument-identity` block — logo (24/28px rounded square, `object-contain`) + `MSFT` +
` (US) ` exchange hint + `Akcja` (Stock) pill + `Microsoft Corp` — and the research header
`ih-identity` — logo (32px rounded square) + name + `US · MSFT` chip. The example-service research
header and holdings cell use the *same* identity block at different scales; that is the
`size` prop of the component.

Data availability per surface (audited 2026-09-24 against the SPA types + backend routes):

| Surface | File | symbol | name | country | assetType |
|---|---|---|---|---|---|
| Holdings cell | `PortfolioHoldingsTab.vue:420` | `pos.symbol` | `pos.companyName` | `pos.country` | `pos.assetType` |
| Top/Bottom performers | `PortfolioPerformanceTab.vue:350/370` | `p.symbol` | `p.companyName` | `p.country` | `p.assetType` |
| Transactions cell | `TransactionsTable.vue:370` | `tx.instrumentSymbol` | `tx.instrumentName` | `tx.country` | `tx.assetType` |
| Dividends rows | `PortfolioDividendsTab.vue:95` | `d.symbol` | `d.instrumentName` | **new (61.3)** | **new (61.3)** |
| News cards | `PortfolioNewsTab.vue:43` | `a.ticker` | position lookup | position lookup | position lookup |
| Research header | `ResearchView.vue:88` | `routeSymbol` | `profile.name` | `profile.countryCode` | `profile.type` |
| Overview header | `ResearchOverview.vue:229` | `symbol` | `profile.name` | `profile.countryCode` | `profile.type` |
| Compare columns | `ResearchCompare.vue:46` | `r.symbol` | `r.name` | **new (61.4)** | **new (61.4)** |
| Search results | `InstrumentSearchModal.vue` | `result.symbol` | `result.name` | `result.countryCode` | `result.type` |
| Watchlist items | `WatchlistsView.vue:122` | `item.symbol` | `item.name` | — | — |
| Form previews | `AddPositionDialog` / `EditTransactionModal` / `RecordDividendDialog` / `TransactionFormFields` | typed/selected symbol | selected name | — | — |

Design decisions (resolved 2026-09-24):

- **Logo shape standardized to example-service's rounded square** (`rounded-[9px] object-contain`
  on a `bg-slate-100 dark:bg-slate-800` plate) at every surface — replaces the current
  circle style; the `docs/COMPONENTS.md` logo line is updated in 61.10.
- **Backends are enriched** so the dividends tab and compare tab show full details:
  wallets adds `assetType`/`country` to `GET /:id/dividends` items (both columns already
  on the DIVIDEND tx row, `portfolios.ts:1105`), instruments adds `countryCode`/
  `assetType` to the `/:symbol/peers` rows (local `ticker_reference` lookup, same
  `ref.ticker === baseTicker` guard as the profile route), both via nullable contracts
  fields — never guessed, null when unknown.
- **Presentational only** — the component fetches nothing; each call site passes the
  data it already has (or a local lookup, for news). Surfaces without country/type
  (watchlist, forms, symbol-only rows) degrade to logo + ticker (+ name when known);
  the details line is simply omitted.
- **Not a link** — parents that need a research link wrap the badge in their existing
  `router-link`; note/label-chip rows (transactions) keep their extra lines below the
  badge.
- **Out of scope (stay as-is):** `RecentSearchesBar` symbol chips (dense bar, symbol
  only), `PortfolioCalendarTab` month-grid text chips (`SAP dividend: 10,00 PLN` — a
  badge would break the grid), the sentence titles in `ResearchDividends.vue` /
  `ResearchNews.vue` ("Dividends per share - MSFT", "N of M articles for MSFT"),
  `PortfolioCompareTab` (compares portfolios, not instruments).

Repos touched: `portfoliost-contracts` (61.2), `portfoliost-wallets` (61.3),
`portfoliost-instruments` (61.4), `portfoliost` SPA + mocks (61.1, 61.4–61.10).

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level per AGENTS.md).

---

### 61.1 — SPA: `TickerBadge.vue` component + unit tests

- [ ] New `src/components/TickerBadge.vue`:
  - Props (`<script setup lang="ts">`, typed `defineProps`):
    `symbol: string` (required); `name?: string | null`; `countryCode?: string | null`
    (2-letter code, uppercased on render); `assetType?: string | null` (accepts the
    enum form `STOCK`/`ETF`/… or an already-displayable word); `size?: "sm" | "md" |
    "lg"` (default `"md"`; logo `h-5` / `h-6` / `h-8`); `align?: "left" | "right"`
    (default `"left"`; right = `flex-row-reverse text-right`, for compare-table column
    headers); `titleAs?: "div" | "h1" | "h2"` (default `"div"`; element of the ticker
    line — research header uses `"h1"`); `testid?: string` (default `"ticker-badge"`).
  - Layout: `<div :data-testid="tid" class="flex min-w-0 items-center gap-2.5">` →
    `<img :src="`/api/logos/${symbol}`" :alt="symbol" loading="lazy"
    class="shrink-0 rounded-[9px] object-contain bg-slate-100 dark:bg-slate-800 …size">`
    → text block (`min-w-0`): line 1 = ticker (`<Component :is="titleAs"
    class="truncate font-medium text-slate-900 dark:text-slate-100">`) + details
    `<span :data-testid="`${tid}-details`" class="text-[11px] text-slate-400
    dark:text-slate-500">` (only when non-empty); line 2 = name (`text-xs
    text-slate-500 dark:text-slate-400 truncate`, only when provided).
  - Plain `<script>` block (house style for shared logic) exporting:
    `formatAssetType(t: string | null | undefined): string` — `STOCK→"Stock"`,
    `ETF→"ETF"`, `BOND→"Bond"`, `CORP_BOND→"Bond"`, `CRYPTO→"Crypto"`, `FUND→"Fund"`,
    empty/null→`""`, other → title-case as-is; and
    `tickerDetails(countryCode?: string | null, assetType?: string | null):
    string | null` — `(${CC}) ${Type}` over the non-empty parts, `null` when both are
    missing. Both pure and unit-tested; no other call site re-derives the format.
- [ ] Unit tests, new `tests/unit/components/TickerBadge.test.ts`:
  - full props → logo `img[src*="/api/logos/SAP"]`, ticker `SAP`, name line,
    details `(PL) Stock` (and `${tid}-details` testid);
  - no `name` → no name line; no details → no details span; countryCode only →
    `(PL)`; assetType only → `Stock`;
  - `formatAssetType` map incl. `ETF` (not `Etf`), `CORP_BOND`, unknown passthrough;
    `tickerDetails(null, null) === null`;
  - `size` sm/lg swap the logo class; `align="right"` adds the row-reverse class;
    `titleAs="h1"` renders an `<h1>`; custom `testid` prefixes the root + details.
- [ ] Tests: `npm run test`, `npm run build` green.
- [ ] Commit.

### 61.2 — contracts: dividends items + compare rows carry identity fields

- [ ] `portfoliost-contracts/contracts/openapi.yaml`:
  - `DividendsData.items` item: add `assetType: { type: string, nullable: true }` and
    `country: { type: string, nullable: true }` (nullable — the research-backed
    `history` shape has neither).
  - `ResearchCompare`: add `countryCode: { type: string, nullable: true }` and
    `assetType: { type: string, nullable: true }` (nullable — never guessed, 61.4).
- [ ] Push contracts main → GHA patch bump; `NODE_AUTH_TOKEN=$(gh auth token)
  npm install @marx2/contracts@<new>` + `npm run gen:types` in `portfoliost`,
  `portfoliost-wallets`, `portfoliost-instruments` (all three have generated types).
- [ ] Tests: contracts `npm test` (spec validity) green.
- [ ] Commit (portfoliost-contracts) + consumer install commits.

### 61.3 — wallets: `assetType` + `country` on `GET /:id/dividends` items

- [ ] `portfoliost-wallets src/routes/portfolios.ts` `/:id/dividends` (:1105): the
  item map adds `assetType: r.assetType ?? null` and `country: r.country ?? null` —
  both columns are already selected (`select()` over `portfolioTransactions`); no
  schema/DB change.
- [ ] Unit test (`portfolios.test.ts` dividends describe): a DIVIDEND tx seeded with
  `assetType: "ETF"`, `country: "PL"` → response `items[0].assetType === "ETF"`,
  `items[0].country === "PL"`; a tx without them → `null`.
- [ ] Full wallets suite green (`npm run test`) + `npm run build`.
- [ ] Commit (portfoliost-wallets).

### 61.4 — instruments: `countryCode` + `assetType` on `/:symbol/peers` rows (+ SPA mock)

- [ ] `portfoliost-instruments src/routes/instruments.ts` `/:symbol/peers` (:1346):
  after each `toCompare(...)` item is built, enrich from the local reference table —
  same pattern as the profile route (:1602): `searchTickerReference(getDb(),
  sym.split(".")[0], 1)`, only when `ref.ticker === baseTicker` set
  `item.countryCode = ref.countryCode ?? null` and
  `item.assetType = toInstrumentType(ref.assetType)`; no ref row → both stay null
  (never guessed). `toCompare` (translate.ts) stays pure.
- [ ] Unit test (`instruments.test.ts` peers describe): a ref row for the primary
  symbol (e.g. AAPL → `US` / `STOCK`) → `items[0].countryCode === "US"`,
  `items[0].assetType === "STOCK"`; a symbol with no ref row → both null.
- [ ] Full instruments suite green (`npm run test`) + `npm run build`.
- [ ] Commit (portfoliost-instruments).
- [ ] SPA mock (e2e runs against the compose mock backend): `mocks/instruments/
  index.js` — the `/compare` and `/peers` mappers add `countryCode`/`assetType` to
  each compare row, derived from the seeded research data where it carries a country
  (else `null`).
- [ ] Tests: `npm run test:mock` green (portfoliost).
- [ ] Commit (portfoliost).

### 61.5 — SPA: adopt in holdings table + top/bottom performers

- [ ] `PortfolioHoldingsTab.vue` symbol cell (:420–433): replace the logo `img` +
  symbol `router-link` + `assetLabel(pos)` line with the existing `router-link`
  wrapping `<TickerBadge :symbol="pos.symbol" :name="pos.companyName"
  :country-code="pos.country" :asset-type="pos.assetType" />`; delete the now-unused
  `assetLabel` function (:235) — its format lives in the component's
  `tickerDetails`.
- [ ] `PortfolioPerformanceTab.vue` Top/Bottom performers lists (:350, :370):
  replace the `symbol` + `companyName` div with
  `<TickerBadge size="sm" :symbol="p.symbol" :name="p.companyName"
  :country-code="p.country" :asset-type="p.assetType" />`; the P/L right column is
  untouched.
- [ ] Update the affected unit tests (holdings/performance specs that assert the old
  markup) to select on `ticker-badge` / `ticker-badge-details`.
- [ ] Tests: `npm run build`, `npm run test`, `npm run test:mock` green;
  `docker compose up -d --build` + `npm run test:e2e` (holdings +
  `top-performers-currency.spec.ts`) green.
- [ ] Commit.

### 61.6 — SPA: adopt in transactions table + portfolio dividends tab (+ SPA mock)

- [ ] `TransactionsTable.vue` symbol cell (:370–392): replace the global-mode logo
  `img` + `symbol` + `assetLabel(tx)` + `instrumentName` lines with
  `<TickerBadge :symbol="tx.instrumentSymbol" :name="tx.instrumentName"
  :country-code="tx.country" :asset-type="tx.assetType" />` inside the existing
  `router-link`; the note line and `LabelChips` stay below the badge (transaction-
  level, not identity).
- [ ] `PortfolioDividendsTab.vue` symbol cell (:96): replace the plain
  `{{ d.symbol }}` with
  `<TickerBadge size="sm" :symbol="d.symbol" :name="d.instrumentName"
  :country-code="d.country" :asset-type="d.assetType" />` — the 61.2/61.3 fields are
  nullable, so a research-backed legacy row degrades to ticker-only.
- [ ] SPA mock: `mocks/portfolios/index.js` dividends mapper (:731) adds
  `assetType: t.assetType ?? null, country: t.country ?? null` (tx rows already carry
  both via `enrichTx`).
- [ ] Update affected unit tests; e2e: `dividends.spec.ts` + the transactions specs.
- [ ] Tests: `npm run build`, `npm run test`, `npm run test:mock`,
  `docker compose up -d --build` + `npm run test:e2e` green.
- [ ] Commit.

### 61.7 — SPA: adopt in portfolio news cards

- [ ] `PortfolioNewsTab.vue` (:43): replace the uppercase `a.ticker` chip with
  `<TickerBadge size="sm" :symbol="a.ticker" :name="..." :country-code="..."
  :asset-type="...">` enriched from a `symbol → position` map over
  `usePortfolioStore().positions` (`companyName` / `country` / `assetType`); call
  `store.fetchPositions(id)` on mount when `store.positions` is empty (the tab is
  directly reachable via its route). A ticker absent from open positions degrades to
  logo + ticker (news is fetched for held stocks, so this is the rare case). The
  sentiment chip stays on the right.
- [ ] E2E: portfolio News tab — a card for a held ticker shows the badge with the
  position's name and details; the sentiment chip is still present.
- [ ] Tests: `npm run build`, `npm run test`, `npm run test:mock`,
  `docker compose up -d --build` + `npm run test:e2e` green.
- [ ] Commit.

### 61.8 — SPA: adopt in research header, overview header, compare columns

- [ ] `ResearchView.vue` header (:88–105): replace the logo `img` + `h1` ticker +
  name line + the duplicate ticker pill with
  `<TickerBadge size="lg" title-as="h1" :symbol="routeSymbol" :name="profile?.name"
  :country-code="profile?.countryCode" :asset-type="profile?.type" />` (details and
  name appear when the profile resolves; the `Add to Watchlist` / search buttons and
  the `from`-aware back link are untouched).
- [ ] `ResearchOverview.vue` header block (:229–232): replace the logo `img` + `h2`
  symbol + name with `<TickerBadge title-as="h2" :symbol="symbol"
  :name="profile?.name" :country-code="profile?.countryCode"
  :asset-type="profile?.type" />`.
- [ ] `ResearchCompare.vue` column headers (:46–49): replace the symbol + name
  divs with `<TickerBadge size="sm" align="right" :symbol="r.symbol" :name="r.name"
  :country-code="r.countryCode" :asset-type="r.assetType" />` (61.4 fields, nullable);
  the primary column keeps its `font-bold text-blue-700 dark:text-blue-400` highlight
  via a wrapper class.
- [ ] Tests: `npm run build`, `npm run test`, `npm run test:mock` green;
  `docker compose up -d --build` + `npm run test:e2e` (`research.spec.ts`,
  `logos.spec.ts`) green.
- [ ] Playwright visual pass (1280px, compose stack): research header shows logo +
  ticker + `(US) Stock` + name at 32px; compare table column headers show the badge
  with details, right-aligned.
- [ ] Commit.

### 61.9 — SPA: adopt in search modal, watchlists, form previews

- [ ] `InstrumentSearchModal.vue` result row: replace the logo `img` + symbol/name/
  exchange block + type pill with
  `<TickerBadge :symbol="result.symbol" :name="result.name"
  :country-code="result.countryCode" :asset-type="result.type" />` (search results
  already carry all four fields).
- [ ] `WatchlistsView.vue` items (:122–131): replace the plain symbol `router-link`
  + name span with the link wrapping
  `<TickerBadge :symbol="item.symbol" :name="item.name" />` (no country/type stored —
  details omitted).
- [ ] Form symbol previews — `AddPositionDialog.vue`, `EditTransactionModal.vue`,
  `RecordDividendDialog.vue`, `TransactionFormFields.vue`: replace each
  logo-`img`+symbol pair with `<TickerBadge :symbol="..." :name="..." />` (name from
  the selected search result where the dialog keeps it; typed-only symbols degrade to
  ticker-only).
- [ ] `RecentSearchesBar.vue` unchanged (decision — dense symbol-only chips).
- [ ] Tests: `npm run build`, `npm run test`, `npm run test:mock`,
  `docker compose up -d --build` + `npm run test:e2e` (watchlists + add-position
  specs) green.
- [ ] Commit.

### 61.10 — Sweep, docs, parity check

- [ ] Sweep: `grep -rn "/api/logos/" src` returns hits **only** in
  `src/components/TickerBadge.vue` — fix any leftover ad-hoc logo renders surfaced by
  the grep (the form previews of 61.9 are the expected tail).
- [ ] `docs/COMPONENTS.md`: update the instrument-logo line (the rounded-square
  `object-contain` plate, not the circle) and add `TickerBadge` to the reference
  table (presentational identity block; `ticker-badge` testid prefix;
  `tickerDetails`/`formatAssetType` shared exports).
- [ ] Playwright parity pass (AGENTS.md): side-by-side a11y snapshots + screenshots
  at 1280px vs `app.example-service.ai` for the holdings table, the performance tab, the
  research header, and the compare tab; fix visual drift (spacing/truncation) in the
  component, not per call site.
- [ ] Tests: full suite green — `npm run build`, `npm run test`,
  `npm run test:mock`, `npm run test:e2e`.
- [ ] Commit.

### 61.11 — Release + PROD verify

- [ ] Push `portfoliost-wallets`, `portfoliost-instruments`, `portfoliost` → GHA
  patch bumps → pin the **real** tags from `gh release list` in the homelab
  helmreleases (`KUBECONFIG=$HOME/.kube/homylab`, ns `pfire`); for instruments bump
  **all 4 occurrences** (app + tickersync + corpbondsync + fxsyync cronjobs, §56.2).
  Contracts ship inside the npm installs — no deploy.
- [ ] Flux + kubectl verify all three rollouts (if the RWO logos PVC multi-attach
  stalls the instruments rollout, scale to 0, wait, scale back to 1 — known gotcha).
- [ ] Playwright PROD (user's passkey session):
  - Holdings table row: rounded-square logo + ticker + `(US) Stock`-style details +
    company name.
  - Top/Bottom performers: badge with details on each row.
  - Portfolio Dividends tab: rows show name + details for held instruments
    (the 61.3 fields from the re-imported tx rows).
  - Portfolio News tab: cards show the badge (position-enriched) + sentiment chip.
  - Research: header badge (32px logo, `h1` ticker, details from the profile),
    Compare-with-peers column headers show details.
- [ ] Commit (plan closeout) + archive §61 to `plan-archive.md`.

---

## 62. Remove wallets: portfolio-native multi-currency cash position (user request 2026-09-24)

Proposal: — (direct user request: remove the wallet concept — a portfolio owns a cash
position in its own currencies, trades/deposits/withdrawals/adjust it, and cash counts
toward portfolio value and performance; no data migration — the sheets import is
re-targeted and PROD is wiped & re-imported; no proposal doc).

**Scope.** The `CashWallet` entity goes away. Each portfolio owns its cash as a
per-currency ledger (IBKR model — a portfolio may hold cash in several currencies;
the portfolio's `baseCurrency` stays the single display/valuation currency).
BUY/SELL/DIVIDEND adjust the portfolio's cash in the transaction's settlement
currency; DEPOSIT/WITHDRAWAL/TRANSFER become portfolio-scoped transactions
(transfer = portfolio → portfolio). Cash is **included** in portfolio value and in
all performance math (TWR/MWR/vol/drawdown/benchmarks) — idle cash drags, and
dividends finally count as return via the cash leg. `/api/wallets/*` is removed;
cash endpoints move under `/api/portfolios`. **No migration**: the sheets-sync
importer is re-targeted to the new schema, PROD is wiped & re-imported
(user-authorized), orphan wallets are simply dropped.

Design decisions (resolved 2026-09-24):

- **`Portfolio.currency` is dropped** — it is vestigial: set at creation (defaulted
  from the linked wallet's currency) and used nowhere in computation; valuation,
  snapshots and analytics all use `baseCurrency` (verified: only `portfolios.ts:74`
  serialization + `:1265` shared-portfolio display). `baseCurrency` remains the
  single portfolio-level currency. Also dropped: `portfolios.wallet_id`,
  `positions.wallet_id`, `transactions.wallet_id` (D57 pairing columns).
- **Cash balances are derived by replay, never stored** (the D17 ledger principle,
  now portfolio-scoped). Per-currency balance = Σ signed effects of (a) trade rows —
  BUY −(notional+fees), SELL +(notional−fees), DIVIDEND +net, principal leg in
  `tx.currency`, fee leg in `tx.feeCurrency` when different (the existing D28/D29
  two-leg / `settledFeeOf` math, made currency-aware) — and (b) external rows
  (DEPOSIT +, WITHDRAWAL −, TRANSFER legs). The paired-row machinery and its
  immutability rules (D23#6, D57) disappear: cash is a pure function of the
  portfolio's transactions + its cash transactions, so editing a trade
  automatically corrects the cash history.
- **Negative cash is allowed** (replay fidelity — real ledgers dip negative before
  a deposit lands). `isMarginEnabled` stays per portfolio (IBKR = true) and is
  **informational in v1**: a warning badge when any currency balance < 0 and the
  flag is off; no hard validation.
- **Performance semantics:** snapshot `value(D) = positions(D) +
  Σ_c balance_c(D) × fx(c→base, D)`. TWR/MWR external flows = DEPOSIT/WITHDRAWAL/
  TRANSFER converted at that day's rate; DIVIDEND is **not** a flow (it stays in
  the value). This redefines `dailyNetCashFlows` (D50, today BUY/SELL): BUY/SELL
  are *internal* (cash ↔ positions), so the benchmark cash-flow mirror and the
  `value_snapshots.netFlow` column switch to the external-flow series.
- **Example service (verified live 2026-09-24):** their nav no longer has a separate Cash
  section — wallets are embedded per portfolio card (balance + Deposit/Withdraw/
  Transfer), plus a dashboard cash summary. We go one step further (no wallet
  entity, no orphan state), so this is example-service's direction, not a fork; AGENTS.md's
  "keep the API similar to example-service" is satisfied for the UI, the endpoint paths move
  because the entity is gone.
- **Orphan wallets: dropped** (PROD is rebuilt from the sheet).

**Ordering note (read first):** pending §57.3/§57.4 and most of §58 target wallet
code this section deletes. §58's AU reconstruction / sign clamp / Equate+→IBKR
transfer / Gotówka-recon design **carries over into 62.4–62.6, re-targeted at
portfolios**, so §58 is largely *absorbed*; §57.3/§57.4 re-target to the portfolio
cash-tx UI/route. Do §62 first; the superseded pending steps are rewritten at
closeout (62.10).

Repos touched: `portfoliost-contracts` (62.1), `portfoliost-wallets` (62.2–62.5),
`portfoliost-sheets-sync` (62.6), `portfoliost` SPA + mocks (62.7–62.9),
release/PROD (62.9b).

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level per AGENTS.md). 62.2–62.5 land before any SPA work
and before any wipe.

---

### 62.1 — contracts: drop the wallet entity, add portfolio cash schemas + endpoints

- [x] `portfoliost-contracts/contracts/openapi.yaml`:
  - `Portfolio`: remove `currency` (properties + `required`) and `walletId`
    (properties + `required`); `CreatePortfolioRequest` unchanged (it never had a
    walletId in the contract — the SPA passed one ad hoc; 62.7 removes it).
  - The portfolio summary item schema (backing `GET /api/portfolios`) and
    `PortfolioDetail` (:1378): add `cash: { $ref: PortfolioCash }`.
  - `PortfolioPosition` (the holdings/transactions position shape carrying
    `walletId` at :1484/:1588): remove `walletId` (properties + `required`).
  - New `PortfolioCash`: `required: [baseCurrency, balances, total]` —
    `baseCurrency: string`, `balances: array of { currency: string, balance:
    number }` (per-currency, in that currency), `total: number` (base currency,
    server-computed).
  - New `PortfolioCashHistory` (same `data`/`meta` shape as the old
    `BalanceHistory`, but `data[].balance` = the **base-currency total** of all
    currency balances at that date).
  - `CashTransaction`: `walletId` → `portfolioId`; `walletName` →
    `portfolioName`; `to_wallet_id` → `to_portfolio_id`; add `balanceAfter:
    { type: number, nullable: true }` (the row's own-currency balance after this
    tx — ledger-derived, window sum, no storage; absorbs §58.4).
  - `RecentCashTransaction`: `walletId` → `portfolioId`, `walletName` →
    `portfolioName`.
  - `PortfolioTotalMetrics`: add `totalCash: { type: number }` (base) +
    `cashBreakdown: array of { currency, balance }` (dashboard cash summary).
  - New request schemas (all `allOf FeeFxFields` where FX applies):
    `DepositCashRequest` (`amount, currency?, description?, transaction_date?`),
    `WithdrawCashRequest` (`+ payment_method?`), `TransferCashRequest`
    (`amount, currency, to_portfolio_id, targetAmount?, targetFxRate?` + FX
    fields — the D22 elastic target leg, portfolio-scoped).
  - `ImportWalletTx` → `ImportPortfolioCashTx`: `walletName` → `portfolioName`,
    `targetWalletName` → `toPortfolioName`, keep `amount, currency, type
    (DEPOSIT|WITHDRAWAL|TRANSFER), description, date, fees/fees_type/feeCurrency,
    exchangeRate, targetAmount, labels?`; the import row leg field `walletTx`
    → `cashTx`.
  - Endpoints: delete every `/wallets/*` path (list/create/rename/delete,
    total-balance, `:id/balance-history`, `:id/transactions`,
    `recent-transactions`, `transactions/:txId` PATCH/DELETE,
    `:id/transactions/:txId/labels`, deposits/withdrawals/transfers). Add under
    portfolios: `GET /api/portfolios/{id}/cash` (→ `PortfolioCash`),
    `GET /api/portfolios/{id}/cash/balance-history` (→
    `PortfolioCashHistory`), `GET /api/portfolios/{id}/cash/transactions`
    (paginated + `labels` filter → `CashTransaction[]`),
    `POST /api/portfolios/{id}/cash/deposits|withdrawals|transfers` (→
    `CashTransaction`), `GET /api/portfolios/cash/recent-transactions`
    (cross-portfolio feed, paginated + `labels` filter →
    `RecentCashTransactionsPage`), `PATCH|DELETE
    /api/portfolios/cash/transactions/{txId}`, `POST
    /api/portfolios/cash/transactions/{txId}/labels`.
- [x] Push contracts main → GHA patch bump; `NODE_AUTH_TOKEN=$(gh auth token)
  npm install @marx2/contracts@<new>` + `npm run gen:types` in `portfoliost`,
  `portfoliost-wallets`, `portfoliost-sheets-sync`.
- [x] Tests: contracts `npm test` (spec validity) green.
- [x] Commit (portfoliost-contracts) + consumer install commits.

### 62.2 — wallets backend: schema + cash replay service

- [x] `portfoliost-wallets src/db/schema.ts` + new drizzle migration:
  - New `portfolios.portfolio_cash_transactions`: mirrors
    `wallet_transactions` minus wallet fields — `userId`, `portfolioId` (FK
    `portfolios.id` on-delete cascade), `type` in
    (DEPOSIT, WITHDRAWAL, TRANSFER), `amount numeric(28,8)`, `currency`,
    `feeCurrency`, `fees`, `fees_type`, `rateSource`, `exchangeRate`,
    `feeRateSource`, `feeExchangeRate`, `toPortfolioId` (FK, nullable),
    `targetAmount`, `transferFxRate`, `linkedTxId` (counterpart pair),
    `description`, `transactionDate`, `paymentMethod`, `externalSource`,
    `externalId` (unique per externalSource), `createdAt`; index on
    `portfolioId` (+ `transactionDate`).
  - New `portfolios.portfolio_cash_transaction_labels` (mirrors
    `wallet_transaction_labels`).
  - Drop columns `portfolios.currency`, `portfolios.wallet_id`,
    `positions.wallet_id`, `transactions.wallet_id`; drop tables
    `wallets.wallets`, `wallets.wallet_transactions`,
    `wallets.wallet_transaction_labels` (data intentionally discarded — PROD
    rebuilds via wipe & reimport; migration ships with the 62.9 image).
- [x] New `src/services/cashLedger.ts`:
  - `tradeCashEffects(tx: portfolioTransactions row): Map<string, number>` —
    principal leg in `tx.currency`: BUY −totalAmount, SELL +totalAmount,
    DIVIDEND +totalAmount (net, the §49 convention — `totalAmount` is already
    net of tax); fee leg in `tx.feeCurrency ?? tx.currency`: BUY +fee,
    SELL/DIVIDEND −fee (fee magnitude via the existing `settledFeeOf` math:
    `pct` resolved against |notional|). Splits/ADJUSTMENT → empty map.
  - `cashBalances(db, authToken, portfolioId, asOf?): Promise<Map<string,
    number>>` — replay trade rows (`executedAt ≤ asOf`) + external rows,
    summed per currency.
  - `cashBalanceSeries(db, authToken, portfolioId, from, to):
    Promise<Map<string, number>>` — daily **base-currency** totals: running
    per-currency balances at each day's close, each × `fxTo(base)` (same
    memoized instruments-FX machinery as `dailyNetCashFlows`).
  - `dailyExternalFlows(db, authToken, portfolioId, from, to):
    Promise<Map<string, number>>` — daily net external flow in base currency
    (DEPOSIT +, WITHDRAWAL −, TRANSFER ± its own leg) at that day's rate —
    **the D50 replacement** for `dailyNetCashFlows` (rename the old function,
    delete the BUY/SELL series).
- [x] Unit tests (`src/services/cashLedger.test.ts`): seeded multi-currency
  portfolio (USD trades, EUR dividend, fee in a third currency, DEPOSIT/WITHDRAW/
  cross-ccy TRANSFER) → `cashBalances` per currency hand-computed;
  `cashBalanceSeries` across an FX-moving window; `dailyExternalFlows` signs
  (deposit inflow, withdrawal outflow, transfer leg).
- [x] Full wallets suite green (`npm run test`) + `npm run build`.
- [x] Commit (portfoliost-wallets).

### 62.3 — wallets backend: portfolio cash routes; delete wallet routes

- [x] New `src/routes/portfolio-cash.ts` (mounted by `index.ts`):
  - `GET /:id/cash` → `PortfolioCash` (balances from `cashBalances`, `total` via
    `fxTo(base)`); ownership guard as the other portfolio routes.
  - `GET /:id/cash/balance-history` → `PortfolioCashHistory` from
    `cashBalanceSeries` (same period/resolution/meta shape as the old wallet
    history route).
  - `GET /:id/cash/transactions` → paginated, `labels` filter, `balanceAfter`
    per row = running window sum of the row-currency balance (trade effects +
    external effects ordered by `transactionDate, createdAt`), labels joined
    (absorbs §58.4).
  - `POST /:id/cash/deposits|withdrawals|transfers` — zod schemas mirroring
    62.1; sign clamp (DEPOSIT → +|a|, WITHDRAWAL → −|a|, TRANSFER as sent — the
    §58.3 decision); deposit/withdrawal `currency` defaults to the portfolio
    `baseCurrency`, any registry currency allowed (FX leg via the D28/D29
    fields); transfer: `to_portfolio_id` must exist, belong to the user, differ
    from the source; cross-ccy `targetAmount` server-computed when
    `rateSource: "manual"` (same-ccy = −amount, cross = amount ×
    `targetFxRate`), the paired counterpart leg inserted with `linkedTxId`
    both ways + `reference` suffixed `(→ <target portfolio>)`; both legs'
    `externalSource`/`externalId` as sent (manual = null).
  - `GET /cash/recent-transactions` (cross-portfolio, paginated, `labels`
    filter) — the D19 read-model feed, now over `portfolio_cash_transactions`
    only (trade rows no longer appear here — they are portfolio transactions).
  - `PATCH|DELETE /cash/transactions/:txId` + `POST
    /cash/transactions/:txId/labels` — manual cash rows editable (the D23#6
    "trade-derived rows are immutable" rule no longer exists); PATCH returns
    real `labels` (absorbs §57.4).
- [x] `routes/portfolios.ts`: `POST /` drops `walletId` from the create schema
  (it was accepted ad hoc); `GET /` (summaries) and `GET /:id` (detail) add
  `cash` (62.1 shape); `GET /total-metrics` adds `totalCash` + `cashBreakdown`
  (Σ `cashBalances` over the user's portfolios, base-converted).
- [x] Delete: `routes/wallets.ts`, `routes/wallet-transaction-labels.ts`, the
  wallet-cash list/update/delete routes in `routes/transactions.ts` (keep
  `rowEffect` only if still referenced — it is replaced by
  `cashLedger.tradeCashEffects`, so delete it), the wallet-cash read models in
  `routes/history.ts` (keep the portfolio-side D19 parts), the wallet branches
  in `routes/labels.ts`.
- [x] Unit tests (`routes/portfolio-cash.test.ts`): deposit (own + foreign
  ccy, fee leg), withdrawal, same-ccy + cross-ccy transfer (paired legs,
  `linkedTxId`, both balances move, `balanceAfter` on the list), recent feed
  ordering + label filter, PATCH/DELETE/labels on a manual row, 404/403
  ownership, transfer to own portfolio → 400.
- [x] Full wallets suite green + `npm run build`.
- [x] Commit (portfoliost-wallets).

### 62.4 — wallets backend: snapshots, currentValue and analytics include cash

- [x] `src/services/backfill.ts`:
  - `value(D) = positionValue(D) + cashBalanceSeries(D)` (62.2) — the
    `value_snapshots` `value` column now includes cash; `netFlow(D) =
    dailyExternalFlows(D)` (replaces the BUY/SELL series; D50's
    benchmark-overlay seed/mirror switches to the same series —
    `portfolios.ts:1021–1029` consumer updated).
  - `src/services/cashFlows.ts`: delete `dailyNetCashFlows` (consumers now
    `dailyExternalFlows`): update `routes/portfolios.ts` analytics mirror,
    `services/quotes.ts:362` (today's flows for the day-change), `backfill.ts`.
  - `services/quotes.ts` / `routes/portfolios.ts`: `currentValue`
    maintenance (position market value, §53) **plus the current cash total** —
    `portfolios.current_value` and every summary `currentValue`/`totalValue`
    henceforth include cash; `PortfolioTotalMetrics.totalValue` inherits via
    the breakdown.
- [x] Analytics endpoints (TWR/MWR, vol, drawdown, benchmarks) consume the
  snapshots — no formula change; **fixtures updated**: every
  analytics/backfill/quotes test with a cash-bearing portfolio gains the
  expected cash leg (a portfolio that deposits 1k and never invests must now
  show value 1k and 0% return, previously 0/0).
- [x] Unit tests: backfill over a seeded portfolio with a USD position + EUR
  cash + a mid-window deposit → snapshot values hand-computed incl. FX;
  netFlow = external flows only (a BUY/SELL day with no deposit/withdraw has
  netFlow 0); `quotes` day-change includes a same-day deposit.
- [x] Full wallets suite green + `npm run build`.
- [x] Commit (portfoliost-wallets).

### 62.5 — wallets backend: import API on the new cash schema

- [x] `src/routes/import.ts`:
  - `ImportWalletTxSchema` → `ImportPortfolioCashTxSchema` (62.1 shape); the
    per-row leg field `walletTx` → `cashTx` (`portfolioTx` unchanged — trade
    legs no longer carry a walletId; `insertImportPortfolioTx` drops the
    `walletId` argument and the D57 pairing write).
  - `insertImportWalletTx` → `insertImportPortfolioCashTx`: portfolio resolved
    by name via `uq_portfolios_user_name` (bootstrap as today); transfer
    `toPortfolioName` validated (exists, ≠ source) with the server-computed
    `targetAmount` + paired counterpart leg (62.3 rules,
    `externalSource = google-sheets:transakcje`, `externalId + "#t"`);
    sign clamp per the §58.3 decision; `labels` bootstrapped + attached to
    `portfolio_cash_transaction_labels` (§58.3 rule, unknown name → row error).
  - Wipe (`DELETE /import/source/:externalSource`): add
    `portfolio_cash_transactions` (+ labels) to the delete cascade (the old
    wallet tables are already dropped by the 62.2 migration — the wipe no
    longer touches them).
- [x] Unit tests (`import.test.ts`): DEPOSIT/WITHDRAWAL rows land with clamped
  signs + labels; cross-ccy TRANSFER pair (amounts, `linkedTxId`, both
  portfolios' balances); unknown portfolio name → row error; `#t` dedupe on a
  second run; wipe removes both transfer legs and re-import recreates
  idempotently.
- [x] Full wallets suite green + `npm run build`.
- [x] Commit (portfoliost-wallets).

### 62.6 — sheets-sync: mapper + recon re-targeted at portfolio cash

- [x] `src/transakcje-parser.ts`: `RANGE = "Transakcje!A1:AU"`; `au` flag
    parsing + abort-on-garbage + Wpłata/Wypłata-with-AU=0 abort (absorbs §58.5).
- [x] `src/transakcje-mapper.ts`:
  - **Drop the INVEST/SELL wallet legs entirely** — the trade's cash effect is
    derived server-side by replay; the row emits only `portfolioTx` (BUY/SELL/
    DIVIDEND unchanged) + optional `cashTx`.
  - `Konto` → **portfolio** name mapping reuses the existing wallet-name map
    (Equate+ / NN PPK / NN PPO / Rach. rejestrowy PKO BP / Crypto / IBKR
    portfolios are bootstrapped by name as the wallets were).
  - **Kupno AU=1**: `cashTx DEPOSIT +|cash|` (row's portfolio/ccy/rate,
    `#d`) — paired with the derived BUY −X, net zero (the §58.6 decision).
    `Konto = Equate+`: the DEPOSIT is paired as a TRANSFER —
    `toPortfolioName: "IBKR"` (server creates the IBKR credit leg).
    → *Implementation note (62.6): the plan's Kupno-Equate+ `toPortfolioName:
    "IBKR"` (a credit INTO IBKR) is inconsistent with the Gotówka recon, which
    tracks IBKR as a cash account — crediting it on every purchase would show a
    gap. The mapper instead posts the Kupno-Equate+ funding as a TRANSFER OUT
    of IBKR (debit USD) → `toPortfolioName: "Equate+"` (server creates the
    Equate+ credit leg, netting the derived BUY), so IBKR's cash ledger shows
    the funding leaving. Sprzedaż-Equate+ proceeds DO land in IBKR (the plan's
    direction, kept).*
  - **Sprzedaż AU=1**: `cashTx WITHDRAWAL −|cash|` (`#w`), **except Equate+**
    → `cashTx TRANSFER −|cash| (EUR)` with `toPortfolioName: "IBKR"` +
    `exchangeRate` (proceeds land in the IBKR portfolio, USD).
  - **Wpłata/Wypłata**: sign-normalized DEPOSIT/WITHDRAWAL on the row's
    portfolio, AJ `program` note → labels; no transfer target.
  - **AU=0**: trade legs only (no `cashTx`).
  - `externalId` suffixes (`#d`/`#w`/`#t`) unchanged (dedupe keys).
- [x] API client: the wallet cash methods re-target to the 62.1
    `/api/portfolios…cash` endpoints (import batch payload field `walletTx` →
    `cashTx`); bootstrap-labels set includes the Wpłata/Wypłata AJ notes.
- [x] `src/gotowka-recon.ts` (new; absorbs §58.7): fetch `Gotówka!A1:L`;
  tracked columns `IB` → IBKR, `IKE Marek` → IKE Marek, `IKE Beata` → IKE Beata
  (now **portfolios**; other columns ignored); per tracked portfolio interleave
  the in-memory ledger effects (the mapped rows' `cashLedger`-equivalent math,
  cross-ccy × their rate) with the snapshots; warn-only lines over tolerance
  (IBKR ±50 USD at the latest row rate, IKE ±10 PLN; below-zero IKE → loud
  warning); never changes the exit code.
- [x] Unit tests (`transakcje-mapper.test.ts`): Kupno AU=1 (portfolioTx +
  DEPOSIT `#d`, no INVEST leg), Kupno AU=1 Equate+ (TRANSFER to IBKR),
  Sprzedaż AU=1 (WITHDRAWAL `#w`), Sprzedaż AU=1 Equate+ (TRANSFER EUR→USD),
  Wpłata sign flip (sheet −6 336,29 → +6336.29), AU=0 Kupno (portfolioTx
  only), Wpłata AU=0 → abort; recon fixtures (exact match / 60 USD gap / 5 PLN
  in-tol / below-zero / unknown header abort).
- [x] Full sheets-sync suite green (`npm run test`).
- [x] Commit (portfoliost-sheets-sync).

### 62.7 — SPA: delete the wallet module, re-point the API layer

- [x] Delete: `src/stores/wallets.ts`, `src/api/wallets.ts`,
  `src/modules/wallets/` (WalletsView, WalletDetailView),
  `src/modules/portfolios/CashWalletCard.vue`; router entries `wallets`,
  `wallet-detail` (the `transactions-cash` route + `CashTransactionsView.vue`
  stay — re-fetched in 62.9). *(Also dropped `WalletCashModals.vue`, consumed
  only by the deleted views/cards — re-scoped to PortfolioCashModals in 62.8.)*
- [x] New cash API in `src/api/portfolios.ts` (62.1 endpoints, explicit return
  types from the regenerated contracts): `getPortfolioCash(id)`,
  `getPortfolioCashHistory(id)`, `getPortfolioCashTransactions(id, …)`,
  `depositCash/withdrawCash/transferCash(id, …)`,
  `getRecentCashTransactions(page, limit, …)`, `updateCashTransaction/delete
  CashTransaction/setCashTransactionLabels`.
- [x] Form cleanup — remove `walletId` everywhere (the field simply stops
  being sent): `AddPositionDialog.vue`, `EditPositionDialog.vue` (drop the
  `tx.walletId` read at :169), `EditTransactionModal.vue` (drop both wallet
  selects + defaulting), `RecordDividendDialog.vue` (drop the wallet default
  from `portfolio.walletId` — the dividend now needs no wallet at all),
  `TransactionFormFields.vue` (drop the `walletId` prop + select),
  `LabelPickerPopover.vue` (the `walletId` entity param → cash-tx entity),
  `InvestmentsView.vue` (drop the new-portfolio wallet select at :435 and the
  "create wallet" dialog + flow at :233–245 — new portfolio: name/description/
  strategy/currency only).
- [x] Dashboard: `InvestmentsView.vue` drops the wallet-cards row
  (:386–398) + the `getWalletTotalBalance`/`cashBreakdown`-from-wallets fetch
  (:152–161) — the cash summary card switches to
  `totalMetrics.totalCash` + `totalMetrics.cashBreakdown` (62.4) — same
  visual (total + per-currency pct chips).
- [x] Update every unit test touching the deleted store/API; e2e specs that
  navigate `wallets`/`wallet-detail` or assert wallet picks are fixed in 62.9.
- [x] Tests: `npm run build`, `npm run test`, `npm run test:mock` green.
- [x] Commit.

### 62.8 — SPA: per-portfolio cash UI (example-service parity)

- [x] `PortfolioCard.vue` (main page): example-service-parity "Cash" group under the
  card (verified layout: name-less, balance line + per-currency hint +
  Deposit/Withdraw/Transfer buttons) — data from the summary's `cash`;
  clicking the balance opens the portfolio's cash tab.
- [x] New `src/modules/portfolios/PortfolioCashTab.vue` (tab next to
  Holdings/Transactions/Dividends/Performance in `PortfolioDetailView.vue`;
  route `/en/portfolios/:id/cash` directly reachable):
  - Balance block: one row per currency (`DualCurrencyCell`-style, in its own
    currency) + the base-currency total; `WalletBalanceChart.vue` re-scoped to
    the base-currency `PortfolioCashHistory` series (component file renamed
    `CashBalanceChart.vue`, props unchanged otherwise).
  - Deposit / Withdraw / Transfer buttons → new
    `PortfolioCashModals.vue` (re-scope of the deleted `WalletCashModals.vue`:
    currency select from the `/api/currencies` registry — never hardcoded,
    D28/D29 `FxRateFields` on both legs; transfer adds a target-portfolio
    select (other user portfolios) + the D22 elastic target leg).
  - Cash transactions table (reuse the `TransactionsTable` patterns): Type /
    Amount (+ dual-currency where FX) / Balance (`balanceAfter`) / Description
    / Labels (`LabelChips`) / actions (edit/delete via
    `EditTransactionModal` re-scoped to cash rows, or a small cash edit form).
  - **Negative-cash warning**: if `isMarginEnabled === false` and any currency
    balance < 0 → an amber badge line (currency + amount), informational only
    (62 design decision).
- [x] `CashTransactionsView.vue` (global Cash tab): re-fetch
  `getRecentCashTransactions` (cross-portfolio feed) — rows gain the
  portfolio name in place of the wallet name; edit/delete/labels via the 62.7
  cash-tx API.
- [x] Shared portfolios: cash rows appear under the existing
  `showTransactionHistory` privacy setting (verified in the §62.9 e2e — no
  new gating).
- [x] Unit tests: tab renders per-currency rows + total + chart + warning
  badge case; modals submit the 62.1 shapes (transfer carries
  `to_portfolio_id` + elastic leg); the card's cash group renders from
  summary `cash`.
- [x] E2E: portfolio cash tab — deposit flow (form → row appears, balance
  moves), transfer between two seeded portfolios (both balances move),
  negative-cash badge after an over-withdrawal on a non-margin portfolio;
  global cash feed shows rows from both portfolios (run in the §62.9 e2e
  sweep against the dockerized stack).
- [x] Tests: `npm run build`, `npm run test`, `npm run test:mock` green
  (committed); `docker compose up -d --build` + `npm run test:e2e` verified in
  the §62.9 sweep.
- [x] Commit (`989b8a8`).

### 62.9 — Mocks + full e2e sweep

- [x] `mocks/wallets/` deleted; `mocks/portfolios/index.js` + new
  `mocks/portfolios/cash.js` gain the 62.1 cash routes (per-currency ledger
  replay over seeded cash + trade rows — the mock keeps its simple ledger math,
  state in-memory per process; Top10 seeded multi-currency USD+EUR); raw data:
  deleted `wallets.json` / `wallet_balance_history.json` /
  `wallets_total_balance.json`; the db-seed drops the wallet seed (its demo FX
  is re-homed to `db-seed/fx.mjs`) and re-targets `portfolios.mjs` to the
  §62.2 schema (no `wallet_id`) + an opening cash DEPOSIT so Top10 cash is
  positive. The cash shapes are served by the cash module rather than added as
  raw JSON files (the mock ledger is derived, not seeded files).
- [x] E2E sweep: every wallet-surface spec re-targeted to the cash UI — new
  `portfolio-cash.spec.ts` (deposit/transfer/negative-badge/edit+delete/global
  feed against the real wallets service); `wallets-watchlists.spec.ts` keeps
  only the watchlist tests (cash lives on the portfolio tab now);
  `portfolios.spec.ts` / `fees-fx.spec.ts` / `dividends.spec.ts` /
  `holdings` / `cash-balance-display-currency` / `chart-recompute` / parity
  re-written for portfolio-native cash + portfolio-base FX (no wallet select).
  Cash appears in the portfolio card group + the investments cash-balance card.
- [x] Tests: full suite green — `npm run build`, `npm run test` (374),
  `npm run test:mock` (223), `docker compose up -d --build` + `npm run test:e2e`
  (101 passed, 1 skipped).
- [x] Commit.

### 62.9b — Release + PROD wipe & reimport (user-authorized)

- [x] Push `portfoliost-wallets`, `portfoliost`, `portfoliost-sheets-sync` →
  GHA patch bumps → pin the **real** tags from `gh release list` in the
  homelab helmreleases / job (`KUBECONFIG=$HOME/.kube/homylab`, ns `pfire`);
  Flux + kubectl verify all three rollouts — the wallets rollout runs the
  62.2 migration (drops the old tables + columns); verify it applied
  (`\d portfolios.portfolio_cash_transactions` present, `wallets` schema
  empty) and that the service boots clean.
  - **Done 2026-09-25**: wallets `v1.1.55→v1.1.56`, portfoliost `v1.0.224→v1.0.226`,
    sheets-sync `v1.0.11→v1.0.12` (pinned in `portfoliost-admin`'s
    `SHEETS_SYNC_IMAGE`); homelab commit `f9a9015b5`. All three rollouts clean.
    Migration verified in PROD DB: `portfolios.portfolio_cash_transactions`
    present (0 rows), `portfolios.base_currency` present, old
    `portfolios.currency` + wallet tables gone, 10 portfolios intact.
    Note: the `wallets` schema retains exactly one table — `wallets.sync_runs`
    (0 rows) — by design (schema.ts: "the wallets schema is kept for
    sync_runs only").
- [x] Admin → Jobs → **Wipe & Reimport** (`POST /api/admin/jobs/sheets-sync/run
  {wipe:true}`, authenticated Pocket-ID session) — the first wipe on the new
  schema; assert: 0 row errors; DEPOSIT rows positive / WITHDRAWAL negative;
  the ~166 AU=1 rows produced their cash legs (Equate+ portfolio cash ≈ 0,
  IBKR portfolio gained the SAP-sale proceeds as transfer legs); `#d`/`#w`/
  `#t` dedupe on a second run.
  - **Done 2026-09-26 (syncRun 146, user-triggered, ×2)**: 0 row errors,
    2371 inserted / 8 skipped (4 no-op splits/div, 4 dup re-statement rows).
    DEPOSIT 373 (+663 912.79, all positive), WITHDRAWAL 5 (−121 130, negative),
    TRANSFER 38 legs (paired, Σ=0); `#d`×320 + `#t`×38 dedupe keys present,
    second wipe+reimport re-created everything idempotently (identical counts).
- [ ] Read the Gotówka recon report (62.6): for each warning line decide with
  the user — sheet mistake (fix sheet) vs import gap (adjust 62.6) — then wipe
  & reimport again. Repeat until clean within tolerances.
  - **RCA done 2026-09-26**: the recon's premise was wrong — the Gotówka
    columns do NOT equal the running sum of Transakcje cash flows (matched
    dates: IBKR 2/161, IKE Marek 2/71); user confirmed the sheet **missed
    inflow/outflow rows** (the Gotówka column is the source of truth). Report
    generated with every gap (Δ per day, suggested Wpłata/Wypłata row per
    Konto, PLN): 586 rows, Σ +293 242,29 PLN (IB 311 / IKE Marek 126 /
    IKE Beata 139) — user is adding them to the sheet step by step; re-run the
    comparison as they land, then wipe & reimport when ~empty.
  - **While there (2026-09-26, user request, shipped v1.1.58/v1.0.230/v1.0.19)**:
    (1) Sell Call Option = expired unexecuted calls → new **EXPIRATION** tx
    type (contracts enum; wallets closes the SHORT option lot at 0, zero cash,
    migration 0008; mapper emits `#e` leg — the phantom −500 SAP position on
    Equate+ is gone); (2) cash-tx descriptions show the kind of transaction
    ("Buy: SAP SE" / "Sell: …" / "Dividend: …" / "Option premium: …" /
    "Deposit/Withdrawal: …"); (3) transfers show direction on both legs
    (debit "… (→ Target)", server credit "… (from Source)"); (4) cash-tx Edit
    reuses the Deposit/Withdraw/Transfer modal (full-field PATCH: amount
    re-clamped per type, currency locked for transfers, fees/feeFx, date).
- [x] Playwright PROD (user's passkey session, 2026-09-26): main page — no
  wallet cards; cash summary card from total metrics (PLN 59,927.74 +
  PLN/EUR/GBP/USD pct chips); every portfolio card shows its Cash group with
  per-currency balances (e.g. IKE Beata: EUR −€250.03, GBP −£661.67,
  PLN 8,170.62, USD −$260.64). IBKR cash tab — per-currency rows + base total
  + balance history chart + negative-cash warning badge (CAD/PLN/SEK/SGD/USD
  negative) + cash transactions table with Balance/Labels/Actions. Deposit
  round-trip: €100 "pi 62.9b test" deposit → row appeared at top with
  balanceAfter, EUR +€100, total +PLN 437.18 (FX at day rate); deleted →
  balance restored exactly, row gone. Global cash feed
  (/en/investments/transactions/cash): 454 rows across IBKR/Equate+/NN TFI
  PPO/NN TFI PPK, paired transfer legs visible (Equate+ −€1,462.09 + IBKR
  +€1,462.09 for one SAP SE sale). Headline totals include cash (totalValue
  USD 210,287.86 vs invested 205,893.78 → return 2.13%). *Top10 check
  skipped on instruction: no Top10 portfolio exists in this user's PROD.*
  *Shared-portfolio privacy not verifiable: no shared (is_public) portfolios
  in PROD; all 10 are private.*
- [x] Commit (plan note).

### 62.10 — Closeout: rewrite the superseded pending sections

- [ ] `docs/plan.md`: rewrite §57.3/§57.4 to the portfolio cash-tx surface
  (§57.3 → chips in the portfolio cash tab — delivered by 62.8, mark
  superseded with a pointer; §57.4 → delivered by 62.3's PATCH-returns-labels,
  mark superseded), and §58 → a short "superseded by §62" stub mapping
  58.1→62.1, 58.2/58.3→62.5, 58.4→62.3, 58.5/58.6/58.7→62.6, 58.8→62.8,
  58.9/58.10→62.9b (keep the sheet-fact background paragraph for reference).
- [ ] Archive §62 to `plan-archive.md` once the PROD report is accepted clean.
- [ ] Commit.

## 63. Portfolio value correctness: unified live valuation, recompute reliability, cash-included charts (user request 2026-09-25)

Post-§62 PROD verification exposed that portfolio **value** is computed by
two divergent, both-wrong paths, and that the recompute button silently no-ops:

- **Chart / analytics** = `value_snapshots.value` = Σ qty × `price_bars.close`
  (+ cash). Openst history quotes are 10–70× off for several held symbols
  (CSN.L £363 vs £5 cost, RIO.L £7 199, BYG.L £820, SAP.DE cost basis €1.16 vs
  quote €184) → IKE Marek snapshot 2 300 732 vs true ~100k.
- **Headline "Total Value"** = Σ `positions.market_value`, which is **stale/0**
  (no live quote at last import) → falls back to `qty × avgCostBasis` → reads
  ~755k (cheap).
- **Recompute** `POST /api/portfolios/:id/recompute` is fire-and-forget with
  `.catch(() => undefined)` — it fails silently (no logs, no value change).

User spec (2026-09-25): cash = uninvested (free) cash per the **Gotówka sheet**
(traces free cash on brokerage accounts), multi-currency; Gotówka is a
*reference*, the same values must also be **derivable from inflows/outflows
+ transactions**; a funded buy (AU=1) is one inflow + immediate buy; the
performance/consolidated charts must show **positions + cash** over time.

Rules: one step = one commit; step `[x]` only after its tests pass (unit +
docker-compose level). Provider tier first (openst/cachest) for the bad
quotes — §63.5 is gated on reproducing the bad symbol's provider response.

---

### 63.1 — Wallets: make recompute reliable + observable (no silent no-op)

- [x] `portfoliost-wallets`: `POST /:id/recompute` and the recalc-queue/backfill
  runner stop swallowing errors — log the error (service, portfolioId, error)
  and expose status. `backfillStatus` reflects the real outcome; a failed pass
  is visible (log line + `GET /:id/analytics` `backfillStatus` not stuck
  `pending` with no effect).
- [x] Recompute actually rewrites `value_snapshots` + `portfolios.current_value`
  for a portfolio (verified in PROD: the pass runs and completes — the value
  "didn't change" because it recomputed the same bad price data; see §63.5).
- [x] Tests: runner defensive-catch logs (not swallows) + queue keeps draining; 333 wallets tests
  green, build green.
- [x] Commit (`da301e4`).

### 63.2 — Wallets: one live valuation path for headline + charts (single source of truth)

- [ ] `portfoliost-wallets`: headline total-metrics `totalValue` and
  `value_snapshots` both derive position value from the **same** live price
  source (quote service / cached live price), not `price_bars` for one and
  `positions.market_value`-fallback for the other. When no live price, use the
  latest `price_bars` close (not `avgCostBasis`) and mark `priceSource`.
- [ ] `portfolios.current_value` is refreshed from the live value (positions +
  cash) on the quotes pass and on recompute — so headline = chart last point
  (± cash timing) after a recompute.
- [ ] Tests: a portfolio's headline totalValue equals the latest snapshot value
  (positions + cash) when quotes are fresh; fallback-to-close (not cost) is
  asserted when no quote.
- [ ] Tests: `npm run build`, full `vitest` green.
- [ ] Commit.

### 63.3 — Wallets: cash included in consolidated + per-portfolio performance series

- [ ] Verify/fix the consolidated (all-portfolio) performance chart and each
  portfolio chart show **Σ positions + cash** per day (cash per §62 base-
  currency balance already added in backfill — confirm it is in the consolidated
  merge path `getMergedAnalytics` too, and that negative cash doesn't hide).
- [ ] Tests: consolidated series = Σ per-portfolio (positions + cash); a
  deposit moves the consolidated line up on that day.
- [ ] Tests: `npm run build`, full `vitest` green.
- [ ] Commit.

### 63.4 — Sheets-sync: derive free-cash from flows+trades; Gotówka as reconciliation reference (multi-currency)

- [ ] Model "uninvested/free cash" per account as the §62 per-currency cash
  ledger (external flows + derived trade effects) — this already nets a funded
  buy (inflow + immediate buy) to ~0 net cash and is multi-currency. Keep
  Gotówka as a **reconciliation reference** (warn-only), not the source of the
  cash value. Re-scope the §62.6 Gotówka recon to compare the *derived* free-
  cash total against the Gotówka snapshot on the right basis/currency (resolve
  the IB=USD vs column=PLN basis) so the 3 tracked accounts give a meaningful
  Δ instead of the current full-history mismatch.
- [ ] Tests: derived free-cash for a funded-buy round-trip (inflow + buy) ≈ 0
  net; Gotówka recon warn-line compares derived vs snapshot within tolerance.
- [ ] Tests: `npm run build`, full `vitest` green.
- [ ] Commit.

### 63.5 — Provider tier: root-cause the mispriced symbols (openst/cachest) — GATED

**RCA (confirmed 2026-09-25, PROD):** the 4.5M chart comes from `price_bars`
rows with `source: 'openst'` that are **100× too high for LSE `.L` tickers** — yfinance (the first
OHLCV provider in `PRICE_PROVIDERS`) quotes London tickers in **GBX (pence)**: BYG.L price_bars 820
vs live quote £8.20 (exactly ×100); CSN.L 363 vs £3.525, RIO.L 7199 vs £70.89 (~×100, offset by a
3-day price move). Non-LSE symbols are fine (VRC.WA/SNT.WA/AMD/TSM price_bars == live quote). The
quote path (a different provider) returns **GBP**, so headline (cheap, cost- basis fallback) and
chart (×100) diverge. stooq UK data is stale (max date 2026-08-28) so it doesn't override the bad
openst overflow rows.

- [x] Reproduce the provider response: fetch raw yfinance OHLCV for CSN.L / BYG.L / RIO.L and
  confirm the close is in pence (vs the GBP quote). (GATE — blocked here: can't reach yfinance from
  this environment; do where openst has keys.)
  - **Confirmed via PROD data + unit tests (2026-09-26)**: every `.L` series is uniform
    (0 discontinuities ≥10×, median consecutive ratio 1.000–1.002 per symbol — single unit
    throughout, i.e. all fetched via yfinance in pence); BYG.L 820 → £8.20, LGEN.L 318.4 →
    £3.18, CSN.L 363 → £3.525 all match live GBP quotes after ÷100.
- [x] Fix at the owning tier: in `openst/src/openbb_client.py` `get_ohlcv_history`
  (and `get_price_history`) normalize yfinance LSE/GBX closes ÷100 to GBP — or route LSE history off
  yfinance. Add a unit test with a pence fixture.
  - **Done (openst `355c6c5`, v1.1.35 deployed to PROD 2/2)**: `_needs_gbx_normalization`
    (yfinance + `.L`) divides open/high/low/close by 100 on both paths; 4 new unit tests
    (pence fixture, non-LSE untouched, non-yfinance untouched); full suite green in the Docker
    test stage (111 passed).
- [x] Backfill/correct the existing bad `price_bars` overflow rows (delete
  `source='openst'` rows for the affected `.L` symbols so they re-fetch, or divide by 100), then
  recompute affected portfolios.
  - **Done (2026-09-26)**: `UPDATE price_bars SET close = close/100 WHERE symbol LIKE
    '%.L' AND source='openst'` — 69,247 rows across all 16 `.L` symbols (uniform 100×, safe;
    `price_bars_all` is a read-only UNION view that reads `price_bars`, so it follows). Verified:
    BYG.L latest bar £8.20, CSN.L £3.76, LGEN.L £3.18. **Recomputes done too** (user session):
    POST /recompute on IKE Marek + IKE Beata → `backfillStatus: complete`; snapshot series now sane
    (IKE Marek max £75,521 / latest 69,220 vs the pre-fix ~2.3M artifact; IKE Beata max £157,254 /
    latest 155,635; 1,796–1,800 daily snapshots each through 2026-09-25).
- [ ] Add a sanity guard: an extreme quote-vs-last-close jump (≳10×) on the overflow write
  flags/logs instead of silently valuing 70×.
- [x] Tests: openst suite green; fixed symbols' price_bars match the GBP quote.
- [x] GATE: this step fixes the *data*; §63.1–63.4 fix the *pipeline*. "Chart == true value" is not
  achievable until this ships.
  - **Lifted 2026-09-26** (openst v1.1.35 + data backfill + recomputes; only the ≳10× sanity
    guard remains as hardening).
- [x] Commit.
