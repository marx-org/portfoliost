# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md`.

Legend: `[ ]` pending · `[x]` done

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

### 63.6 — Wallets: recalculation reliability, two recompute modes, scheduled additive refresh (WIP 2026-09-27)

**Symptoms (user-reported, PROD):** the composed (and per-portfolio) value
charts showed an "instant drop" / "sudden rise" around noon on 2026-09-27
that appeared and re-appeared over the day.

**Diagnosis (done 2026-09-27):**
1. **The drop** — the merged endpoint summed `value_snapshots` per exact
   date; today's snapshot is written LAZILY (snapshot-on-read / manual
   recompute), so early in the day only opened portfolios had a "today" row
   → the combined total collapsed to just those (PROD: 1/10 portfolios had a
   09-27 row → head point 31k vs 327k). **Fixed**: `sumSnapshotsByDateForwardFilled`
   (mergedAnalytics) — each portfolio contributes its latest-known value on
   dates it has no snapshot (step-function semantics; no-op on complete
   dates). No cron needed.
2. **The rise** — a STALE value from the second valuation path: the
   live-quote snapshot (`snapshotPortfolioValue` in quotes.ts, fired on
   detail-page read) disagreed with the backfill (price-bars
   `computeSnapshotBatch`). IBKR: live path wrote 09-26 = 587,547; the
   authoritative backfill = 457,493 (= 09-25, no real move). A manual
   recompute overwrote it → jump gone. This is **§63.2** (unify the two
   valuation paths) — the real fix; the recompute job below is the
   operational guard. IBKR is ~70% idle cash (EUR 141k + USD 963 − PLN 121k
   in a PLN-base portfolio), so FX differences between the two paths are the
   whole discrepancy.
3. **Two genuine 09-26 moves remain unexplained** (recompute rebuilt them,
   still high): Equate+ 3,947→8,633 (+119%) and IKE Marek 68,455→105,452
   (+54%). Equate+ = the short-SAP-option book (expiry effect?); IKE Marek
   = the LSE `.L` names. ~~**OPEN: root-cause with `RECALC_DEBUG=1`**~~
   — **RESOLVED, and it was not a valuation problem: see §63.10.** Both "moves"
   were the same artifact as the spike: a snapshot written by a pass that had
   priced *nothing*, so the stored value was cash only. Equate+ and IKE Marek now
   price 1/1 and 13/13 with no gaps. `RECALC_DEBUG` is **off** in the PROD
   helmrelease (turned off in §63.10.5).**

   **Diagnostic aid (2026-09-27, §63.7): the new value-vs-`Invested` chart
   isolates these from real deposits.** The **Invested** line (cumulative net
   money-in) is flat through them, while the **value** line dips/steeps — so
   a sharp value move with a *flat* Invested line is a valuation anomaly,
   not a deposit. On the combined 1Y chart the value line shows **two sharp
   V-shaped dips (late Jan 2026 and late May 2026)** that the flat Invested
   line does not follow — these are the "sudden move" anomalies the user
   reported, now visually separable and worth the same per-symbol
   `RECALC_DEBUG` root-cause as the 09-26 Equate+/IKE Marek moves. (IBKR also
   shows value 457,493 < invested 503,574 = a *negative* gap, i.e. behind
   money-in — the chart surfaces per-portfolio ahead/behind-at-a-glance too.)

**Implementation (DEPLOYED — wallets v1.1.63/v1.1.64, tested green):**
- `POST /api/portfolios/:id/recompute` now has TWO modes over ONE shared core
  (`computeSnapshotBatch`):
  - **default = force** (`forcePortfolioRecalc`): DELETE all rows + rebuild —
    manual recompute after data fixes; no stale rows survive; transactional
    (abort → nothing written).
  - **`?mode=upsert`** (`runBackfillRecent`, new): ADDITIVE upsert, window
    extends to **TODAY** (default window ends yesterday) — re-values the last
    2 days (FX for a fresh date is unknown until the ECB publish ~16:00 CET /
    fxsync 17:10 UTC and can still shift converted values). A failed pass
    leaves prior values in place.
- `src/scripts/snapshots-sync.ts` (new): standalone job — for EVERY
  portfolio, `runBackfillRecent` (serialized by the shared backfill runner;
  no user token needed — instruments `/internal/fx-rates` is unauthenticated).
- Deploy plan: cronjob `snapshotsync` in `portfoliost-wallets/app/helmrelease.yaml`,
  schedule **after fxsync** (instruments fxsync = 17:10 UTC) + a mid-day pass
  (~13:00 UTC) per the user's "run it twice a day" note; command
  `node dist/scripts/snapshots-sync.js`, env DATABASE_URL (+ INSTRUMENTS_URL).
- Tests: `recompute.test.ts` — new `?mode=upsert extends to today AND does
  not delete` case; `mergedAnalytics.test.ts` — 5 forward-fill cases; full
  suite 344 green.
- **Cash in/out series on the performance chart** (user request, pending):
  an additional accumulating series in the same currency as the main one,
  mirroring the Transakcje running columns AV:BE. BLOCKED on the user
  clarifying which definition (net money-in vs running free cash incl.
  trade effects) and what the AV:BE headers are. Documented as a diagnostic
  in `docs/proposals/portfolio-cash-tracing.md`.

- [x] Deploy the two-modes recompute + snapshotsync cron (wallets v1.1.63,
      pinned in helmrelease as `snapshotsync` 13:00 UTC +
      `snapshotsync-postfx` 17:20 UTC, after instruments fxsync). 2/2 cronjobs
      live.
- [x] Root-cause the "sudden growth" / fake-inflow spike (RECALC_DEBUG +
      PROD DB, 2026-09-27, IKE Beata `ab64f782…`). **It is NOT the price/FX
      valuation path and NOT a race** — it is **missing price-bar history**.
      The backfill (price-bars path) values only the symbols that have a bar
      in the window (`if (price == null) continue`); the live-quote
      `snapshotPortfolioValue` (fired on detail-page read) values **all** open
      positions from a single live quote. IKE Beata today: backfill 09-26 =
      154,860 (18 of 23 symbols) vs live today = 205,470 (all 23). The 5
      missing ≈ 50k: **XTB.WA, EMIM.AS, RBOE.AS** (`price_bars_all`=0,
      `price_bar_metadata.fetch_status='failed'`), **AMZN** (7,377 bars but
      gap on 09-26), **SP20.L** (465 bars, from Nov 2024, gap on 09-26).
      None exist in the stooq daily tables; the on-demand upstream fill
      (cachest `fetchOhlcv`) **failed** for them. So the two paths disagree
      purely because the backfill's symbols lack history — recomputing cannot
      fix it (the bars are still absent), and a page refresh re-writes today
      via the live path → the spike re-appears. **Fix = §63.8 (two prongs):
      (a) make instruments fill/repair missing history, (b) make the backfill
      *not silently drop* a held symbol with no bar — signal a data-gap so
      the value is flagged incomplete rather than quietly under-reported.**
      (Turn RECALC_DEBUG off in the helmrelease once §63.8 ships.)
- [ ] §63.2 — unify the two valuation paths (live-quote snapshot vs
      price-bars backfill) so they agree; **root cause pinned in §63.8** —
      the disagreement is upstream missing price history, not FX.

### 63.7 — Performance chart: "Invested" overlay line (cash in/out, value − invested = profit) — DONE 2026-09-27

User request (context switch from recompute): an additional accumulating
series on the **shared** performance chart (`PortfolioPerformanceChart` — used
by both the per-portfolio Performance tab AND the combined/composed chart),
same currency as the main value line, so you can see over time how much you
deposited vs the current value → the gap is your profit.

**Series = A = cumulative net money-in** (deposits − withdrawals ± transfer
legs) — verified the Transakcje column is **CH "Skumulowana wpłata własna"**
(cumulative own deposit); CH/CI headers exist but are empty, so the live
`invested` column (same definition) is the source. (Note: the per-portfolio
*balance* columns are BV:CE, not AV:BE.)

Implemented end-to-end (contracts → wallets → SPA → mock):
- **contracts** `openapi.yaml`: `performance.timeSeries[].invested`
  (`number, nullable`). **Also fixed a latent YAML break** — the EXPIRATION
  `description` (added in the §62 EXPIRATION commit) had an unquoted colon
  (`type: EXPIRATION`) that failed the whole spec-validate → no contracts
  release had published in a while. Published **v1.6.43**.
- **wallets** (`4463994`, **v1.1.64**): both `GET /:id/analytics` and
  `GET /merged` now emit per-point `invested` (already in
  `value_snapshots.invested`, summed/FX-converted in the merged forward-fill).
- **SPA** (`e3e615f`, **v1.0.236**): `PortfolioPerformanceChart` draws a
  second solid **"Invested"** line (cyan, thinner) when the series carries
  `invested` (auto-derived legend, added to the remount-key fingerprint);
  both callers (per-portfolio tab + `InvestmentsView` combined) convert
  `invested` by the same base→display rate as `value`.
- **mock** (`mocks/portfolios/index.js`): surfaces the fixture's
  `investedCapital` (monotonic 0→98k, = cumulative money-in) as `invested`
  so the line renders in docker/mock mode.
- Tests: wallets 344 green (per-portfolio + merged `invested` assertions);
  SPA 395 green (2 new chart cases: invested line drawn / omitted).
- **Deployed 1/1 both**; API + chart verification pending a login (session
  keeps expiring).

- [x] Contracts v1.6.43, wallets v1.1.64, SPA v1.0.236 deployed.
- [ ] Confirm in UI: combined + per-portfolio charts show the "Invested" line
      under the value line (gap = profit), same currency, both timeframes.

### 63.8 — Data-gap handling: fill/repair price history + surface incomplete backfills + gray-out during recompute (2026-09-27)

Follow-on from the §63.6 RCA: the "sudden growth"/fake-inflow spike on IKE Beata
looked like **missing price-bar history** — the backfill values only the symbols
it has a bar for (18/23 → 155k) while the live-quote snapshot values all 23
(→ 205k). Three coupled changes so the two valuation paths agree and the UI never
shows a silently-wrong value.

> **Superseded in part (2026-09-27).** The missing history was real and is fixed
> (item 2 → §63.9), but it was *not* the spike: the spike was the sweep pricing
> **nothing at all** (§63.10). The three changes here stand on their own merit —
> the gap signal, the gray-out, the fill — they are simply not what fixed the
> chart. The `18 of 23` figure was also an exact-date count; `buildPriceMap` carries
> prices forward, so the real number of unpriced symbols was smaller.

- [x] **Backfill must not silently drop a held symbol with no price bar.**
      (wallets `09f48c2` + `bcdf8e3`, 348 green; contracts v1.6.44.)
      `computeSnapshotBatch` now returns `{ rows, gapSymbols }` — the held
      (qty>0 on the window's last day) symbols with NO price bar. Both backfill
      paths persist it to `portfolio_backfill_metadata.gap_symbols` (migration
      0009; the force path writes it atomically inside the delete+rebuild tx;
      `persistGapSymbols` coerces []→null). `GET /:id/analytics` returns a
      top-level `gapSymbols` via `getGapSymbols`. +4 tests (gap detected / gap
      cleared / API present / API absent). The SPA renders an amber
      partial-sum warning (see item 3).
- [x] ~~**Instruments: fill/repair missing history — GATED on the provider tier
      (§63.5).**~~ **RESOLVED (wrong premise — see §63.9).** The diagnosis recorded
      here was wrong: `providerSymbol()` is not the problem, and this was never a
      provider-coverage gap. Probed in PROD on 2026-09-27: openst serves
      `/price/ohlcv/XTB.WA` (2637 bars), `EMIM.AS` (3152 bars) and `RBOE.AS` in
      0.3–2.1 s, **including with `start=1900-01-01`**. The symbols were always
      sourceable; nothing ever asked. Superseded by §63.9.
- [x] **UI: gray out + block every recomputing chart until done** (user
      request). (SPA `296343e` + `fe4c0e5`, 397 green.) `PortfolioPerformanceChart`
      gained a `recomputing` prop: the chart is dimmed (opacity-50) +
      pointer-events disabled with an in-progress overlay, and the Recompute
      button is disabled (no re-trigger) while a pass is in flight. Wired on the
      per-portfolio Performance tab (`recomputeBusy || backfillPending`) and the
      combined chart (`mergedBusy || mergedBackfillPending`); PortfolioCard
      already gates its timeframe buttons during recompute. A `gapSymbols` prop
      shows the amber partial-sum warning (Performance tab + card). +2 chart
      unit tests (gray-out blocks re-trigger; gap warning renders).

**Deployed 2026-09-27** — wallets **v1.1.65** + SPA **v1.0.239** pinned in
`cluster/apps/pfire/*/app/helmrelease.yaml` (homelab commit `f2be27648`), 1/1
both, migration 0009 (`gap_symbols`) applied in PROD.

**What's still missing (continue here next session):**
- [ ] **Item #2 — the actual price history** (GATED, provider tier / §63.5).
      Until the `.WA`/`.AS` symbols get bars, the value is *flagged* partial,
      not *corrected*. The 5 missing IKE Beata symbols (≈ 50k): **XTB.WA,
      EMIM.AS, RBOE.AS** (`fetch_status='failed'`, 0 bars) and **AMZN, SP20.L**
      (bars exist but a gap on the snapshot date). Concretely: (a) figure out
      why cachest/OpenBB `/ohlcv/XTB.WA` returns nothing (symbol mapping for
      WSE/ASX venues, or no provider coverage — check what openst/stooq could
      supply), (b) once sourceable, seed the history (instruments fill / stooq
      import) and re-run a backfill so `gap_symbols` clears to null and the
      value matches the live path. Also still open on the instruments side:
      log the provider error into `fetch_status`/`last_error` (diagnosability)
      and add a scheduled "fill gaps for held symbols" pass.
- [ ] **Confirm in UI** (needs a fresh PROD login — Playwright session closed
      mid-verification): on IKE Beata → Performance, verify (a) the amber
      "Value excludes 5 positions without price history" banner shows after one
      recompute, and (b) the chart grays out + Recompute is disabled during a
      Recompute and re-renders fresh when done.
- [x] ~~**Turn RECALC_DEBUG off**~~ — done in §63.10.5 (now `RECALC_DEBUG: "0"`).

### 63.9 — cachest's rate limiter caps upstream concurrency at 3 (RCA of the IKE Beata spike, 2026-09-27)

Continues §63.8 item 2, whose premise was wrong. Everything below is measured
against PROD (cluster reachable via `KUBECONFIG=$HOME/.kube/homylab`, ns `pfire`),
not inferred.

**The spike, end to end.** The 09-26 `IKE Beata` snapshot is written by two
different valuation paths. The **live-quote** path (`snapshotPortfolioValue`, fired
on a detail-page read) values *all 23* open positions from one live quote → 205,470.
The **price-bars** backfill (`computeSnapshotBatch`) values only the symbols it has a
bar for. Measured position-by-position in PROD, exactly **3 of 23** have zero bars:

| symbol | qty | bars | `price_bars_all` last | `fetch_status` |
| --- | --- | --- | --- | --- |
| `EMIM.AS` | 80 | **0** | — | `failed` 2026-09-22 06:31 |
| `RBOE.AS` | 53 | **0** | — | `failed` 2026-09-22 06:31 |
| `XTB.WA` | 84 | **0** | — | `failed` 2026-09-27 14:24:59 |

The other 20 have bars, so the earlier "18 of 23 / 5 missing" count was an
**exact-date** check and wrong: `buildPriceMap` (`portfoliost-wallets/src/services/backfill.ts:256`)
**carries prices forward**, so a symbol with a 09-25 bar *is* valued on 09-26/27
(09-26 was a Saturday). `AMZN` (last 09-21) and `SP20.L` (last 09-24) are stale but
never dropped. The ≈50k delta is the 3 zero-bar symbols' weight, full stop.

**Root cause: `cachest`'s `RateLimiter`.** `cachest/rate_limiter.py:22` claims the
slot with `self._last_fetch = time.monotonic() + sleep`, so with N waiters the
requested sleep *grows* — 2s, 3.9s, 5.8s, 7.7s … With `fetch_interval: 2` /
`fetch_max_wait: 4` on `OPENST_OHLCV` (`cachest/config.yaml:88-99`), the moment
`sleep > max_wait` the waiter is **rejected**: instant `503`, *no upstream call*
(`cachest/main.py:84-92`). Effective queue depth is `floor(max_wait/interval) + 1`
= **3**. Reproduced in PROD with 8 concurrent `forceRefresh` calls:

```
req0 -> 200 X-Cache=MISS 0.45s     req4 -> 503 X-Cache=None 0.04s 'rate limit exceeded…'
req1 -> 200 X-Cache=MISS 2.07s     req5 -> 503 X-Cache=None 0.04s
req2 -> 200 X-Cache=MISS 4.06s     req6 -> 503 X-Cache=None 0.04s
req3 -> 503 X-Cache=None 0.06s     req7 -> 503 X-Cache=None 0.03s
```

The same limiter serves `OPENST_QUOTE` (65 rejections in the last 5 h), `logo` (21)
and `OPENST_OHLCV_FUNDS`. So this is **not** IKE-Beata-specific: 175 symbols carry
`fetch_status='failed'` in PROD, and the `.WA` family is hit as a block — `SNT.WA`
and `ETFSP500.WA` are stuck at **09-18**, `PLW.WA`/`ELT.WA`/`KRU.WA` at 09-21,
`CBF.WA`/`DNP.WA` at 09-22 — because they lost the race, not because they delisted.

**Why the loser stays a loser.** `portfoliost-instruments/src/services/price-bars.ts:395`
catches the 503 in a **bare** `catch {}`, records `fetch_status='failed'`, and
`recentlyFailed` (`price-bars.ts:181-187`) then suppresses upstream for
`COOLDOWN_MS = 1 h`. The sweep runs 1–2×/day
(`portfoliost-wallets-snapshotsync` 13:00 UTC + `…-postfx` 17:20 UTC), so a symbol
that loses one race waits ≥1 h and typically loses the next one too. There is no
`last_error` column (`src/db/schema.ts:85-89`), so a transient 503 is recorded
identically to a genuine 404 "no such symbol" — which is why this took a day to pin.

**What the provider is NOT.** Both earlier hypotheses are dead, and it is worth
recording so they are not re-tried:
- *"`start=1900-01-01` for a zero-history symbol is too wide"* (`price-bars.ts:374`
  does send that) — **false**. openst answers `XTB.WA` with 2637 bars in 2.1 s and
  `EMIM.AS` with 3152 bars in 0.9 s *with that exact 126-year window*; yfinance
  clamps to the listing date. It is visible in the cache key
  (`ohlcv:VOX0224:1900-01-01:2026-09-26`) and looks alarming, but it is not the
  cause and needs no clamp.
- *"`providerSymbol()` doesn't strip `.WA`/`.AS`"* — **false**. The suffix is the
  correct Yahoo form; `.WA`/`.AS`/`.DE`/`.L` are handled identically, and
  `EMIM.AS`/`RBOE.AS` are Euronext-Amsterdam iShares ETFs (plan-archive §43) whose
  *quotes* already work — which is precisely why the live path values them and the
  backfill cannot.

**Design decision (resolved):** fix it in `cachest`, the owning tier. `fetch_interval`
is a *politeness spacing* toward upstream; for the routes that point at **our own**
`openst` service it is far too coarse, and openst already bounds real concurrency
itself (`UPSTREAM_MAX_INFLIGHT = 8`). So: drop the interval to `0.2` and raise
`fetch_max_wait` so the queue absorbs a whole portfolio sweep (≥175 symbols), for
every `openst.*` route. Genuinely external routes keep their spacing and only get
`fetch_max_wait` raised. Separately, `portfoliost-instruments` must stop converting
a *transient* 503 into a 1-hour `failed` — a 503/504/429 is retryable and must be
recorded as such, distinct from a 404.

### 63.9.1 — cachest: give the openst routes a queue that fits a sweep

- [x] **`RouteConfig.queue_depth` + config values + regression tests**
      (cachest, 198 green). `queue_depth` is a documented property
      (`config.py`: `floor(fetch_max_wait / fetch_interval) + 1`, `UNBOUNDED_QUEUE`
      for `fetch_interval: 0`) and is now logged per route at startup, so a
      depth-3 route is visible in the boot log instead of only in a 503.
      `config.yaml` (repo **and** the cluster copy at
      `homelab/cluster/apps/pfire/cachest/app/config/config.yaml` — they are two
      files, and the cluster one is what actually runs): every `openst.*` route
      that a sweep fans out over → `fetch_interval: 0.2`, `fetch_max_wait: 120`
      (depth 600). Politeness kept where openst's own leg scrapes an external
      site: `OPENST_OHLCV_FUNDS` 0.5, `OPENST_BOND_PROFILE` /
      `OPENST_CORP_BOND_PROFILE` 2 (depth 61/241), vendors keep 2 (61).
      `OPENST_NEWS` (300) and `OPENST_CORP_BOND_CATALOGUE` (60) stay at depth 1
      **on purpose** — per-company news on a 5-min cadence, and a param-less
      singleton scraped once a day — and are now named in the test so the
      exemption cannot quietly outlive its reason.
      Tests: `queue_depth` arithmetic + unbounded-without-pacing; two depth bars
      on the shipped config (`MIN_SWEEP_DEPTH = 128` for the four price-bar
      routes the snapshots-sync sweep hits, `MIN_UI_DEPTH = 32` for the rest);
      a `paced_external_scrapes` guard; and — the one that actually reproduces
      the bug — `test_shipped_ohlcv_route_serves_a_full_portfolio_sweep`, which
      runs the **real** `RateLimiter` (every other test in `test_main.py` stubs
      it out, which is why this survived) with 16 concurrent `forceRefresh`
      callers against the shipped `/ohlcv/{ticker}`, `/equity/quote/{ticker}` and
      `/logo/{ticker}`. Against the pre-fix config it fails with
      `13 of 16 callers were rate-limited with no upstream call
      (queue_depth=3); upstream saw 3 request(s)` — the local twin of the PROD
      8-request burst (3× 200, 5× 503).
      Compose smoke: 16 concurrent `/ohlcv/SNT.WA` against the running stack →
      **0 × 503**, 14.8 s wall clock, paced 0.2 s apart.
- [x] Deploy: pin the new `cachest` tag in the cluster HelmRelease, and the
      ConfigMap change in the same commit (Flux re-applies both; the pod picks
      the config up on restart, the `configmap.reloader` annotation is already
      on the deployment).

### 63.9.2 — instruments: a transient 503 is not a 1-hour `failed`

- [x] **Migration + status-aware breaker** (instruments `cc75111`, 356 green).
      `drizzle/0003_price_bar_metadata_last_error.sql` adds
      `price_bar_metadata.last_error` (status + message, bounded to 300 chars);
      schema in `src/db/schema.ts`. `UpstreamError` already carried `status`, so
      no adapter change was needed — what was missing was anywhere to *put* it.
      New `isTransientFailure` / `cooldownFor` / `describeFailure` in
      `src/services/price-bars.ts`: an upstream **404** keeps the hour-long
      breaker (there is genuinely nothing to fetch), while 429/502/503/504, a
      thrown fetch and an unparseable body all retry after
      `TRANSIENT_COOLDOWN_MS` (5 min). A success clears `last_error`. The
      breaker is now read with `cooldownFor(meta.lastError)`.
      Also fixed a latent test/clock bug: the metadata upserts wrote
      ``sql`now()` `` (the DB clock) while the breaker compared against the
      *injected* `now`, so the pre-existing "fails within the hour" case passed on
      a negative delta rather than on the cooldown it claimed to cover. Both now
      use the injected clock (identical in prod, where the route passes
      `new Date()`), and that case is now a real 404.
      +5 tests: `last_error` records the status, a 503 is retried at +6 min and
      succeeds (**fails against the old single hourly cooldown**), a 404 stays
      parked at +30 min, the transient/404 classification, `last_error` bounding.
- [ ] Deploy (push → GHA → pin the tag) + apply migration 0003 in PROD, then read
      `select symbol, last_error, count(*) from instruments.price_bar_metadata
      where fetch_status='failed' group by 1,2` to separate genuine 404s from
      retryable failures. Expect the `.WA`/`.L` cluster to clear on the next
      sweep.

### 63.9.3 — heal PROD and prove the spike is gone

- [x] **Deployed 2026-09-27** (cachest v1.0.44 + instruments v1.0.70 pinned in
      `cluster/apps/pfire/{cachest,portfoliost-instruments}/app/helmrelease.yaml`,
      homelab `b9c2a9eff`; migration 0003 applied). The cachest ConfigMap landed
      first and Flux's reloader restarted the pod on it, so the limiter fix was
      live before the images.
      Verified in PROD: 16 concurrent `forceRefresh` `/ohlcv/SNT.WA` → **16 × 200,
      0 × 503** in 3.08 s (the same burst gave 3 × 200 / 13 × 503 before). Cachest
      now logs `queue_depth` per route at boot. Drove the instruments gap-fill
      directly from the pod for the starved symbols: `XTB.WA` 2637 bars,
      `EMIM.AS` 1258, `RBOE.AS` 1230, and `SNT.WA`/`ETFSP500.WA` off 09-18 onto
      09-25. `fetch_status='failed'` symbols: **175 → 166**.
- [x] All 23 IKE Beata positions now have a price bar; the amber partial-sum
      signal is no longer needed for the missing-history case. The next sweep
      pass then exposed a **much larger, unrelated** problem — see §63.10.
- [ ] `logo` route: the 21 rejections came from the same depth-3 wall and are fixed
      by §63.9.1's config (depth 600), but the SPA still fans out ~80 logos per
      page, so re-check its rejection count after the next full page load.

### 63.10 — The scheduled sweep prices nothing: instruments demands a *user* JWT from a job that has no user (2026-09-27)

Found 2026-09-27 while verifying §63.9.3 in PROD. **This is the actual "sudden
spike"**, and it invalidates the §63.6 / §63.8 attribution.

**The bug.** `portfoliost-wallets/src/scripts/snapshots-sync.ts:35` calls
`runBackfillRecent(db, p.id, "")` — an **empty** auth token — justified by its own
header comment (line 13): *"No user token is needed: the instruments
/internal/fx-rates endpoint is unauthenticated."* That is false.
`GET /api/instruments/:symbol/price-bars` sits behind
`instruments.use("*", userIdentityMiddleware)`
(`portfoliost-instruments/src/routes/instruments.ts:255`) and `/internal/fx-rates`
behind the same middleware (`src/routes/fx.ts:163`). `POCKETID_ISSUER_URL` is set
in the cluster, so `validateJwt` runs and an empty header is a hard 401. Measured
in the running pod:

```
no auth        401 {"error":"Unauthorized","message":"Missing or invalid Authorization header"}
bogus bearer   401 {"error":"Unauthorized","message":"Invalid or expired token"}
```

The failure is then swallowed three times over: `fetchPriceBars` →
`if (!res.ok) return null` (`backfill.ts:61`); `fetchPriceSeries` → the symbol is
dropped (`backfill.ts:109`); `computeSnapshotBatch` → `if (price == null) continue`
(`backfill.ts:687`). `totalValue` collapses to **cash only**, and because
`_runBackfillCore` writes with `onConflictDoUpdate` (`backfill.ts:742-748`) the pass
**overwrites correct stored values with cash-only ones**. The FX leg degrades the
same way: `resolvedFxRate` sends no header for a falsy token and falls back to
`rate = 1` (`instruments-fx.ts:31-32`).

Measured fleet-wide after running the sweep — `gap_symbols` equals the position
count *exactly*, for every portfolio:

| portfolio | stored value | invested | positions | `gap_symbols` |
| --- | --- | --- | --- | --- |
| IBKR | **−24,602** | 20,130 | 35 | **35** |
| IKE Beata | 37,428 | 116,322 | 23 | **23** |
| IKE Marek | 33,695 | 38,771 | 13 | **13** |
| Rach. rejestrowy PKO BP | 8,500 | 45,000 | 23 | **23** |

Ground truth for IKE Beata: `Σ qty × last close` = **≈152,900** (matches §63.6's
"154,860"), against 37,428 stored — the cash remainder. An *interactive* recompute
carries a real browser JWT, prices 18–23 symbols and writes ~155k. The chart
therefore alternates between the two, and that is the user's "sudden drop" and
"sudden rise". The two V-dips §63.6 spotted in Jan/May 2026 are the same
cash-only collapse, and IBKR currently has a **negative** portfolio value. Both
CronJobs (`snapshotssync` 13:00 UTC, `snapshotssync-postfx` 17:20 UTC) have been
doing this twice a day.

**Why the design is wrong, not just the token.** A user JWT is the wrong credential
for this caller by construction: the sweep iterates *every* portfolio of *every*
user, so it has no single user context to present. Forcing it through a user token
guarantees it can only ever refresh one user's data. And the guard it is failing
against buys nothing where it is applied:

| | tables with `user_id` | handlers reading `userIdentity` | real authorization |
| --- | --- | --- | --- |
| `portfoliost-wallets` | **7** (`portfolios`, `positions`, `portfolio_transactions`, `portfolio_cash_transactions`, `labels`, `shares`, `sync_runs`) | many, e.g. `routes/portfolios.ts:186-191`, `:944-948` | yes — per-user scoping is load-bearing |
| `portfoliost-instruments` | **0** (10 tables, no user column anywhere) | **1**, and only inside `requireGroup` (`auth.ts:131`) | one route: `requireGroup("portfoliost_admin")` at `fx.ts:187` |

24 of instruments' 34 endpoints are behind `userIdentityMiddleware` and **not one
of their handlers reads the identity**. Every response is a pure function of the
URL. Prices, FX, ticker metadata, news and logos are the same for everybody — the
schema says so outright (`schema.ts:167-171`: *"NOT user-scoped — shared reference
data"*). So instruments authenticates 24 endpoints and authorizes none of them.

**Design decision (resolved).** Keep a gate on instruments, but make it a gate on
**the caller**, not on a user: accept *either* a user JWT *or* a service token.
Concretely:
- **Why not simply drop instruments' auth** (the "let services work without auth"
  option): the exposure chain is public → instruments → cachest → openst → provider
  keys, and **cachest and openst have no auth at all**. `GET /:symbol/history` and
  `GET /:symbol/price` are also write-through (`backgroundUpsertBars`), so dropping
  the gate would hand the internet an unauthenticated mutation of `price_bars` plus
  a metered-provider proxy. The pfire namespace has no edge auth to fall back on
  (`global-auth-url` is commented out at
  `cluster/apps/networking/ingress-nginx/helm-release.yaml:51`), so instruments'
  JWT check is currently the only thing in that chain.
- **Service token, not a forged identity.** The `POCKETID_ISSUER_URL`-unset
  fallback (`auth.ts:73-116`) trusts `X-User-*` headers and even an *unsigned*
  three-part bearer, minting `groups: ["portfoliost_admin"]` — so "just send a
  header" would work in compose and must never be how the cluster path
  authenticates. A shared secret compared with a timing-safe equality, sourced
  from the cluster secret, is the credential.
- **A service token must not grant user authority.** `GET /api/admin/fx-rates`
  keeps `requireGroup("portfoliost_admin")` and stays user-only; the sweep has no
  business reading the admin listing.
- **Edge auth stays out of scope for now.** Turning on nginx `auth_request` is
  worthwhile defence in depth for *browser* traffic, but it cannot fix a
  service-to-service caller and is a separate change — recorded as §63.11.
- **The safety net is the real lesson.** Even with the credential fixed, a pass
  that cannot price its positions must **never write**. `gap_symbols` already
  computes exactly that condition; the write path just has to honour it. That
  guard is what stops the next credential mistake from silently rewriting the
  fleet, and it is why the bug survived a full day of RCA.

### 63.10.1 — wallets: a transport failure must abort the pass, never write

- [x] **`InstrumentsUnavailableError` + abort semantics** (wallets `153bfb5`,
      351 green). `fetchPriceBars` no longer collapses a non-2xx into `null`: a
      **404 stays a gap** (cachest/instruments' documented "no data for this key",
      so an unresolvable benchmark ticker is still dropped rather than failing the
      request), while 401/403/400/5xx and an unreachable host throw.
      `fetchPriceSeries` latches the first worker failure and rethrows once all
      have settled, so a rejected fetch cannot leave a half-filled map.
- [x] **FX**: `resolvedFxRate` gained `strict`. The backfill sets it, so an
      unusable FX source aborts instead of degrading 1:1 across a whole valuation;
      the interactive deposit/fee/ledger paths keep the 1:1 degrade and now log
      it. Threaded through `fxTo`, `fxToOnDay`, `cashBalanceSeries`,
      `dailyExternalFlows`, `externalCashInvested`.
- [x] **`instrumentsAuthHeaders`** — one place deciding user-JWT vs service token
      (Bearer-prefixed or not) for every instruments call.
- [x] **The write guard**: `isUnpriceable` / `UnpriceablePortfolioError` — a pass
      that priced **0 of N** held symbols is refused before any write, on *both*
      paths (the force path deletes before it writes, so it would have erased the
      history and rebuilt it cash-only). A partial pass (≥1 priced) is still
      written and flagged; an all-cash portfolio (0 held) is unaffected.
- [x] Also fixed a test asserting the wrong thing: *"marks status failed when
      instruments unreachable"* asserted `complete`, documenting the
      swallow-everything behaviour. It now asserts `failed`.
- [x] Tests +5. Both new safety-net tests **fail against the pre-fix code**:
      "leaves the previous snapshots untouched when the pass cannot price" and
      "refuses a pass that priced 0 of N held symbols".

### 63.10.2 — instruments: accept a service token alongside a user JWT

- [x] **`serviceOrUserMiddleware`** (instruments `cfbfda8`, 367 green).
      `X-Service-Token` (opaque shared secret) **or** a user JWT; neither is
      optional. `serviceTokenMatches` is timing-safe (both sides hashed to a fixed
      width first, since `timingSafeEqual` throws on a length mismatch and would
      itself leak length) and **fails closed** — with
      `INSTRUMENTS_SERVICE_TOKEN` unset a service token is rejected, so a missing
      secret can never open the door. A service token fabricates no
      `userIdentity`, so `requireGroup` cannot be satisfied by one:
      `/api/admin/fx-rates` keeps `userIdentityMiddleware` +
      `requireGroup("portfoliost_admin")` and stays user-only. Applied to
      `instruments.*`, `news.*`, `/api/fx/latest`, `/api/internal/fx-rates`.
- [x] Tests +11, incl. the two that catch the wrong versions: deleting the
      `!expected` guard fails both fail-closed cases, and a service token is
      asserted to get 401 on the admin listing.

### 63.10.3 — wallets: send the service token from the sweep

- [x] **`resolveServiceToken`** (wallets `bec58a5`, 363 green) reads
      `INSTRUMENTS_SERVICE_TOKEN` and throws a message naming the variable and
      the consequence if missing. The script calls it **before `getDb()`**, so a
      misconfigured sweep never starts rather than producing a plausible-looking
      run. The header comment no longer asserts a falsehood.
- [x] Tests +12: the credential split and the failure split in
      `instruments-fx.test.ts`; `snapshots-sync.test.ts` asserts the message and
      spawns the script to prove it exits 1 **without dialling the database**.

### 63.10.4 — cluster: the shared secret

- [x] `INSTRUMENTS_SERVICE_TOKEN` (generated 32-byte hex) added to the
      SOPS-encrypted `cluster-secrets` — re-encrypted with the cluster's PGP
      recipient; the key-set diff is **exactly one addition** and the round-trip
      decrypt was verified against the intended plaintext (no plaintext in the
      committed file). `tmpl/cluster-secrets.yaml` gets the matching placeholder
      for the regeneration path. Referenced by the instruments app, the wallets
      app, **and both `snapshotsync` CronJob templates** (without it on the
      CronJob the sweep still cannot price anything).
- [x] **Compose parity** (`portfoliost` `64c2928`): both services get a
      committed dev default. Verified against the running stack — no credential
      401, wrong token 401, service token 200 on `/price-bars` and
      `/api/internal/fx-rates`, **401 on `/api/admin/fx-rates`**.

### 63.10.5 — the two further bugs the guard exposed, then the heal

Deploying §63.10.1–.4 and running the sweep immediately proved the guard works
(4 portfolios refused, **stored values left untouched** instead of corrupted) and
produced two *new* root causes, each of which had been silently corrupting values
long before this section:

- [x] **`resolveInstrumentCurrency` silenced any multi-venue ticker**
      (instruments `f6044f2`, 370 green). The `exchanges.size > 1 → null` rule is
      right for the **venue** and wrong for the **currency**, which only needs the
      candidates to agree. PROD: `MSFT` → NASDAQ + NEO, both US, resolved to
      `null`, so `?currency=PLN` 400'd. Now resolves when every candidate maps to
      one ISO code; genuine disagreement still returns null (§47), so
      `AFL` (NYSE/ASX), `META` (NASDAQ/LSE/STO) and the existing `SNT`/`AMD`
      ambiguity cases are unchanged.
- [x] **The backfill priced long-closed symbols** (wallets `bf0d600`, 364 green).
      The symbol list came from every BUY/SELL row ever imported, so a position
      sold in 2024 was still fetched in a 2026 window. The day grid and qty maps
      are now built before the price fetch and the fetch is restricted to symbols
      with qty > 0 on some day in the window.
- [x] **A ticker listed on several venues in different currencies could not be
      converted at all** — and that is the case the plan had already decided.
      §48.3b: *"fetches `/price-bars?currency=<portfolio base>` for positions
      whose **instrument currency is known** and non-base (null stays native —
      §45.3 never guess)"*. We did know it — `transactions.instrument_currency` —
      but only sent the **target**, so instruments re-derived the base with a
      weaker heuristic and §48.2's 400 vetoed the caller's own fact. One such
      position took its whole portfolio unvaluable (5 of 10 in PROD).
      Resolved in the direction the plan already points (contracts **v1.6.45**,
      instruments `db4bed7`, wallets `920cb7f`): a new optional `?baseCurrency=`
      carrying the base the caller already knows, **honoured only where the local
      resolver is silent and never overriding a resolved one** — so §47's "never
      guess" is intact and the response still reports which base was used.
- [x] **Deployed and verified.** wallets v1.1.68 + instruments v1.0.73. The
      sweep runs `ok=10 failed=0`, and every portfolio is `complete` with
      `gap_symbols` empty:

      | portfolio | before | after | invested | positions | gaps |
      | --- | --- | --- | --- | --- | --- |
      | **IKE Beata** | 37,428 | **196,827** | 116,322 | 23 | 0 |
      | **IBKR** | **−24,602** | **585,319** | 503,574 | 35 | 0 |
      | IKE Marek | 33,695 | 90,963 | 38,771 | 13 | 0 |
      | Rach. rejestrowy PKO BP | 8,500 | 56,448 | 45,000 | 23 | 0 |
      | Crypto | 208 | 888 | 873 | 0 | 0 |

      The spike is gone: §63.6 measured the two valuation paths 130k apart for
      IBKR (457,493 backfill vs 587,547 live) and IKE Beata at 18/23 symbols; the
      backfill now returns 585,319 vs the live path's 587,547 (**0.4%**) and
      prices 23/23. The two V-dips §63.6 flagged in late Jan and late May 2026 are
      **gone** — they were the cash-only collapse, not market moves: the series now
      runs 118k (Sep 2025) → 199k (Sep 2026) with no collapses.
- [x] **No force recompute was needed** — the additive pass upserts the whole
      `[first trade, today]` window, so the sweep already rebuilt the history. The
      monthly series confirms it (Jan 2026 min 129,464, previously 27k). The 12
      `snapshotsync` CronJobs' own schedule (13:00 / 17:20 UTC) is now healthy.
- [x] `RECALC_DEBUG` turned off in the wallets HelmRelease (§63.6's open item).
- [x] Plan closeout: §63.6 and §63.8 now point here; see §63.11 for the edge-auth
      follow-on this deliberately did not bundle in.

### 63.11 — Edge auth for browser traffic (follow-on, not a fix for §63.10)

Recorded, deliberately not part of §63.10: the cluster has a working global nginx
auth subrequest that is switched off
(`cluster/apps/networking/ingress-nginx/helm-release.yaml:51`,
`# global-auth-url: "https://auth.${SECRET_DOMAIN}/api/verify"`), and nothing in
`apps/pfire/*` uses oauth2-proxy or `auth-url`. So every access control in pfire is
per-service application-level JWT validation, and the instruments → cachest →
openst → provider-keys chain has exactly one check at its front. Worth turning on
as defence in depth once §63.10 settles — it hardens *browser* traffic and changes
nothing for the scheduled job, which is why it is not the fix.

---

### 63.12 — The −52% "crash" on 2025-09-24 is one mislabelled ticker (2026-09-27)

Found while diffing the combined performance series against a PLN-normalised SQL
comparison. The chart showed a single-day cliff that no §63.6–§63.11 work touched,
because **it was never a cashflow or a data gap** — it was one position priced off
the wrong exchange.

| Combined series | value |
|---|---|
| 2025-09-23 | 537,767 |
| 2025-09-24 | 257,700 |
| delta | **−52.1%** |

IBKR alone: `1,528,346` → `454,644`, and its Nintendo position went `20 → 0` on
2025-09-24. The sale is real; the *size* of the drop is not.

#### The chain

1. **The sheet contradicts itself.** The live Podsumowanie row for
   `Nintendo Co Ltd` (fixture row `[106]`) carries `Symbol giełdowy`=`NTO`,
   `Giełda`=`FRA`, currency=`EUR` — i.e. the Frankfurt line — but its
   `Symbol Yahoo` column says **`7974.T`**, the Tokyo line. The DIVIDEND rows on
   the same holding say `JPY` while the BUY/SELL rows say `EUR`.
2. **The resolver faithfully follows the stale column.** `resolveInstrument`'s
   order is `byNameOverride` → catalog-by-name → catalog-by-(symbol, venue) →
   `ticker_reference`, and the catalog entry's `yahooSymbol` *is* that Yahoo
   column. A name override was already supposed to shield this, and for `EMIM`
   (`§38.3`) and `RBOE` (`§43.1`) it does — but the `nintendo co ltd` entry itself
   pointed at `7974.T` with `country: "JP"`, so the override *enshrined* the wrong
   listing. It carried no provenance comment, unlike its `allianz se` neighbour.
3. **The currency resolver could not object.** `ticker_reference` has no `7974`
   row at all, and `exchange_reference`'s `TSE` row has an **empty
   `yahoo_suffix`**, so `resolveInstrumentCurrency` is silent and falls back to
   the caller-declared base — which is the trade row's `EUR`.
4. **Valuation then priced the wrong series.** The stored `instrument_currency` is
   `EUR`, so the ¥12,695 Tokyo close of 2025-09-23 became
   `20 × 12,695 × 4.25 ≈ 1,080,421 PLN`.

#### The evidence that the intended series is `NTO.F`

The stored transaction prices were *already* the Frankfurt ones — the import only
mislabelled the symbol. `NTO.F` closes reproduce them to within a day's spread,
while `7974.T` is a different series entirely (probed 2026-09-27 via openst):

| date | stored transaction price | `NTO.F` close | `7974.T` close |
|---|---|---|---|
| 2023-04-12 (BUY 5) | 37.50 EUR | **37.02** | 5,466 JPY |
| 2024-08-05 (BUY 5) | 42.72 EUR | **43.89** | 6,607 JPY |
| 2025-09-23 | — | **73.22** | 12,695 JPY |
| 2025-09-24 (SELL 20) | 74.70 EUR | — | — |

`NTO.DE`, `NTOG.UK` and `7974.TO` all 404; `NTO.F` is the only live line. It also
has the deeper history of the two (2,983 bars from 2015-01-02 vs 2,886 from
2015-01-05), so the reimport heals the whole holding rather than opening a gap.
Correct value of the 20 shares on 2025-09-23 is `20 × 73.22 ≈ 1,464 EUR ≈ 6,200 PLN`,
not 1,080,421 PLN — the cliff is **entirely** the phantom, and the recomputed
series should be flat across 2025-09-24.

#### Fix

`NAME_VENUE_OVERRIDES["nintendo co ltd"]` → `ticker: "NTO"`, `yahooSymbol: "NTO.F"`,
`country: "DE"` (`portfoliost-sheets-sync` `db04359`, shipped `v1.0.22`, pinned in
`portfoliost-admin`'s `SHEETS_SYNC_IMAGE`). EUR now matches the row's own currency
column, so the position needs **no conversion at all** — which also answers "why JPY
if we only use EUR": we do not; JPY was only ever the stale Tokyo line bleeding in.

Tests: `instrument-resolver.test.ts` asserts the override holds for `FRA` *and* for
a stale `TYO` row (it is name-keyed, so the venue column cannot filter it out);
`podsumowanie-parser.test.ts` keeps asserting `7974.T`/`JP` to pin the fact that the
parser reads the sheet verbatim and the correction lives in the resolver. 138 green.

#### Left open

- **A wipe & reimport is required.** The stored transactions still carry `7974.T`,
  so IBKR's `2023-04-12 .. 2025-09-23` value stays overstated by ~1.07M PLN until
  the reimport rewrites the label and a force-recompute rebuilds the series. This
  is the one case in §63 where a reimport *is* needed — §63.9/§63.10 did not
  require one.
- **The DIVIDEND rows will still be `JPY`** after the reimport: `currency` comes
  from the sheet, and the override only changes the symbol. Financially
  immaterial (~10 PLN total across four rows) but it is a residual label
  inconsistency.
- **The fleet-wide stale-symbol audit is unresolved.** The obvious check —
  compare each row's Yahoo column against `symbol + exchange_reference.yahoo_suffix`
  — does not work, because the sheet uses **Polish venue codes** (`ETR`, `LON`,
  `FRA`, `AMS`, `BIT`, `SWX`) while `exchange_reference` carries MIC-style ones
  (`XETRA`, `XLON`, `XFRA`, `XAMS`, `FSX`). 35 of 226 rows come back "unknown
  venue" and the naive comparison also flags legitimate local-ticker ≠ Yahoo-ticker
  cases (`V` → `HUBS`). Nintendo is the one case proven wrong by the data.
  Two real reference gaps surfaced while attempting it: `TSE` has an **empty**
  `yahoo_suffix` (which is why step 3 was silent), and there is **no TSX row**,
  so `CSU` (Constellation Software, `CSU.TO`) has no venue to resolve against.

---


## 64. Kubernetes probes for the pfire fleet (found 2026-09-27 while deploying openst v1.1.36)

No marx2-owned service in `pfire` had a working HTTP health probe until
openst v1.1.36. Auditing all nine against the live cluster found three
distinct states, and — worse — that the pattern already in the repo is a
**false friend**: it reads like an HTTP health check but deploys as a TCP
socket check. Nothing in the namespace can currently express "degraded", and
nothing restarts a hung process.

Scope: the 9 `ghcr.io/marx2/*` services in `cluster/apps/pfire/`. Third-party
images (`ghostfolio`, `pgadmin`, `pgweb`, `postgrest`, `swagger-ui`,
`investbrain`) are **out of scope** — their probe semantics belong to their
upstreams.

### Audited state (live, 2026-09-27 — not inferred)

| Service | chart | probes in yaml | renders as | health endpoint |
|---|---|---|---|---|
| `openst` | 5.1.0 | liveness+readiness+startup | `httpGet` ✅ | `/health` 200, `/ready` 200 |
| `cachest` | 5.1.0 | **none** | — | `/health` 200, `/ready` **404** |
| `portfoliost-wallets` | **5.0.1** | liveness+readiness | `tcpSocket` ⚠️ | `/health` 200 |
| `portfoliost-instruments` | 5.1.0 | liveness+readiness | `tcpSocket` ⚠️ | `/health` 200 |
| `portfoliost-admin` | **5.0.1** | liveness+readiness | `tcpSocket` ⚠️ | `/health` 200 |
| `portfoliost-users-auth` | 5.1.0 | liveness+readiness | `tcpSocket` ⚠️ | `/health` 200 |
| `portfoliost` (SPA) | 5.1.0 | **none** | — | `/` 200 (nginx SPA fallback) |
| `jobshot` | 5.1.0 | **none** | — | every path → `index.html` 200 |
| `mastra-ticker` | 5.1.0 | liveness (`custom: true`) | n/a — **no Deployment or Service in cluster** | unreachable |

### The chart contract (read from the chart, not guessed)

`app-template` 5.x nests probes at
`controllers.<c>.containers.<name>.probes.<probeName>`:

- `enabled: true` is **required** — a probe without it is silently skipped.
- `type` defaults to **`TCP`**, not HTTP. `type: HTTP` is needed for `httpGet`.
- `path` / `port` are read from the **probe** level; `initialDelaySeconds`,
  `failureThreshold`, `timeoutSeconds`, `periodSeconds` are read from `spec`.
- `port` defaults to the controller's primary service port.
- `custom: true` + a raw `spec` is the escape hatch that renders verbatim.

**Why the four existing probes are wrong:** they put `path: /health` inside
`spec:` and omit `type`. The template only lifts the four timing keys out of
`spec` and never reads `path` from there, so the path is dropped and the
default `TCP` applies. Verified live — all four render as
`tcpSocket: {port: 3000}`. A process that accepts connections but no longer
answers (deadlocked, event loop wedged, exhausted pool) passes both probes.

Rules: one step = one commit; step `[x]` only after its tests pass. Probe
changes are cluster-visible, so **every step ends with a Flux + `kubectl`
verification**, and each helmrelease change must be validated against
`app-template`'s `values.schema.json` **before** pushing — see §64.1.

---

### 64.1 — Fix the four false-friend probes (wallets, instruments, admin, users-auth)

- [ ] Convert each to the shape that actually renders `httpGet` — add
      `type: HTTP`, move `path: /health` from `spec` to the probe level, keep
      the timing keys in `spec`. Use the openst v1.1.36 block as the reference
      implementation, not the current wallets one.
- [ ] Bump `portfoliost-admin` and `portfoliost-wallets` from chart 5.0.1 to
      5.1.0 in the same commit, so all four pfire TS services share one chart
      version and one probe dialect.
- [ ] Add a **startupProbe** to each. These four have no schema migration on
      boot, but a slow first provider/db connect currently counts against
      `liveness` and can restart-loop a cold pod.
- [ ] Validate locally before pushing (this is the step that would have
      prevented the openst rollout failure — the first v1.1.36 push put
      `livenessProbe:` directly on the container, the Helm upgrade failed schema
      validation, and **openst silently stayed on v1.1.35**):
      ```sh
      helm pull bjw-s/app-template --version 5.1.0 && tar xzf app-template-5.1.0.tgz
      python -c "import json,yaml,jsonschema; jsonschema.validate(
        yaml.safe_load(open('cluster/apps/pfire/<app>/app/helmrelease.yaml'))['spec']['values'],
        json.load(open('app-template/values.schema.json')))"
      ```
- [ ] Tests: schema validation passes for all four; after Flux applies,
      `kubectl get deploy -n pfire <app> -o json` shows `httpGet` with
      `path: /health` (not `tcpSocket`) for both probes, and pods reach 1/1 with
      `restarts: 0`.
- [ ] Commit.

### 64.2 — cachest: add `/ready`, then probes

- [ ] `cachest`: add `GET /ready` mirroring openst's — `503` +
      `{"status":"degraded","redis":"unreachable"}` when the cache is down,
      `200` otherwise; keep `/health` as pure liveness that never touches Redis
      (a dependency-aware liveness probe restart-loops the pod during a cache
      blip, which cannot fix the cache). Since cachest's `RedisCache.get/set`
      already degrade to misses, readiness is the only honest place to drop the
      pod from rotation.
- [ ] Add liveness (`/health`), readiness (`/ready`) and startup probes to
      `cluster/apps/pfire/cachest/app/helmrelease.yaml`.
- [ ] `cachest`: add `test_ready_reports_503_when_redis_is_unreachable` and
      `test_health_stays_ok_while_redis_is_down`; full suite green
      (`docker build --target test -t cachest-test . && docker run --rm cachest-test`).
- [ ] Tests: pod 1/1 with 0 restarts; probes render `httpGet`; `/ready` returns
      200 in-cluster; and a deliberate Redis outage (scale the cache down) takes
      the pod out of rotation **without** `/health` flapping.
- [ ] Commit: `cachest` code + tests, then the homelab tag bump + probes.

### 64.3 — portfoliost SPA: probe nginx, and say so

- [ ] Add liveness + readiness on `GET /` (the SPA's own `/health` returns
      `index.html` via the nginx catch-all, so it is not a health check). This
      proves nginx is serving, which is the only failure mode an SPA has —
      the API is a separate deployment with its own probes after §64.1.
- [ ] Add a comment in the helmrelease recording that this probe covers nginx
      only, so a future reader does not assume it validates the app.
- [ ] Tests: pod 1/1; probe renders `httpGet` on `/`; rolling the deployment
      does not flap.
- [ ] Commit.

### 64.4 — jobshot: needs a real health route (crosses a 3rd repo)

- [ ] **Blocked on open question 1.** `jobshot` returns `index.html` for
      `/health`, `/healthz` and `/ready` alike (SPA fallback), so any HTTP probe
      on it is a no-op that always passes. Either add a real `/health` in the
      `jobshot` repo, or accept a `/` probe that only proves nginx is up.
- [ ] Tests: the chosen endpoint returns something other than the SPA shell
      (assert on content, not just status), pod 1/1.
- [ ] Commit.

### 64.5 — mastra-ticker: decide, or remove the dead helmrelease

- [ ] `mastra-ticker` has a helmrelease with a `custom: true` probe but **no
      Deployment and no Service** in `pfire` — it is not deployed. Either deploy
      it or drop the manifest so the next audit is not misled by a probe that
      protects nothing. `custom: true` is the correct escape hatch and is the
      shape to prefer when the built-in dialect does not fit.
- [ ] Tests: if deployed, pod 1/1 and probe reaching a 200; if removed,
      `kubectl get deploy -n pfire mastra-ticker` 404s and the Flux
      kustomization reconciles clean.
- [ ] Commit.

### 64.6 — Make the schema check routine, not a one-off

- [ ] Add a `hack/validate-helmrelease.py` (or equivalent) to the homelab repo
      that validates **every** `cluster/apps/pfire/*/app/helmrelease.yaml`
      against the pinned chart's `values.schema.json`, and call it from a
      pre-commit hook. §64.1's openst failure was a schema error that only
      surfaced as `Ready=False / UpgradeFailed` in the cluster, ~90 s after
      Flux applied it, with the service silently left on the old image.
- [ ] Also assert, in the same check, that a service declaring `probes:` has
      `type` set on each probe — the tcpSocket false friend is schema-**valid**,
      so only an explicit lint catches it.
- [ ] Tests: the script exits non-zero on (a) a schema violation and (b) a
      probe missing `type`; exits 0 on the current tree after §64.1–64.3.
- [ ] Commit.

### Open questions

1. **jobshot health route** — add a real `/health` in the `jobshot` repo
   (3rd repo for this plan), or accept a `/` probe that only proves nginx is
   up? The plan currently assumes a real route is preferred; §64.4 is blocked
   until this is answered.
2. **cachest `/ready`** — is a second endpoint worth it, given cachest already
   degrades gracefully to cache misses? The argument for it is that without it
   readiness would duplicate liveness and the pod would keep taking traffic it
   cannot serve quickly. Confirm before §64.2.
3. **Separate liveness vs readiness paths for the four TS services** — all four
   expose only `/health` (200); `/ready` is 404 on every one. So readiness
   would be a duplicate of liveness unless each service grows a `/ready` that
   checks its own dependencies (db, redis). Is a duplicated probe acceptable, or
   should `/ready` be added to each service?
4. **Third-party images** — deliberately excluded here. Should the audit cover
   `postgrest` / `swagger-ui` / `pgadmin` / `pgweb` too, or stay scoped to
   images this monorepo builds?
