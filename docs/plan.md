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

## 56. ticker_reference ambiguity: resolver silence for multi-exchange ticker collisions

Proposal: — (user request 2026-09-24; follow-up to the §54.5 PROD finding; no proposal doc).

The §54.5 PROD verification exposed a currency defect: the calendar for a
portfolio holding un-suffixed **AMD** resolved currency **AUD** —
`resolveInstrumentCurrency` (§47.5) matched `ticker_reference` and took
`rows[0]` of four exact `AMD` listings (ASX Arrow Minerals, NASDAQ Advanced
Micro Devices, NEO CDR, TASE Amiad Water). Verified in PROD 2026-09-24: the
non-venue `searchTickerReference` ranks all exact matches identically (rank 0,
same length) and the final tiebreak (`ticker` — identical across rows) leaves
the order to heap luck; ASX won. The §47 contract says the resolver "returns
null on any uncertainty — never guess", but a multi-exchange collision with no
venue hint is exactly such uncertainty and is not treated as one.

**A sheet-sync override is not the fix** (verified 2026-09-24, ruled out):
the Podsumowanie catalog (§40 import-side symbol mapping) can only rewrite the
imported symbol string, and the only disambiguating form is a venue suffix —
but PROD `exchange_reference` has **no `yahoo_suffix` for NASDAQ or NYSE**
(both empty; only e.g. WSE→WA), so no sheet value can qualify the listing, and
a bare AMD→AMD mapping is a no-op. The defect is in the instruments resolver
selection, not the sheet data; `ticker_reference` stays pure adanos
(§40 — never patch).

Repos touched: `portfoliost-instruments` only (no contracts change — response
shapes are unchanged). Caller audit (all already written against the §47
"null on uncertainty" contract): the calendar route (`?? "USD"` §49.6
fallback — AMD then gets USD), `resolveCurrency` (§47.4 — a provider-declared
currency now beats a silent local instead of losing to a wrong "estimated"
local — the /dividends & profile surfaces are strictly improved), the
price-bars route guard (§48.2 — an explicit `?currency=` conversion on an
ambiguous symbol → 400 "base currency unknown" instead of a silently
wrong-base conversion; default chart loads pass no `currency`, unaffected),
and `price-bars.ts` baseCcy (null → no conversion, native series with
`currency: null` — chart titles omit the currency per §47.6 rather than
guessing).

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level).

### 56.1 — instruments: ambiguity → resolver silence in `resolveInstrumentCurrency`

- [x] `src/services/instrument-currency.ts` — in the un-suffixed branch (no
  exchange hint), fetch up to 10 `searchTickerReference` rows and, among rows
  whose `ticker` exactly equals the route symbol, count distinct `exchange`
  values: **>1 → return null** (silence); exactly 1 → resolve as today.
  Venue-qualified path (suffix → exchange → exact listing) and the
  bond/fund short-circuit are untouched.
- [x] Unit tests (`instrument-currency.test.ts`): (a) AMD-shaped collision —
  exact `AMD` rows on ASX + NASDAQ + NEO + TASE, no suffix → `null`; and
  `resolveCurrency` with provider-declared USD → `{ USD, "provider" }`, not
  `{ AUD, "estimated" }`; (b) a single-listing ticker still resolves via
  country code; (c) venue-qualified `SNT.WA` with a cross-exchange `SNT`
  collision still resolves to the WSE row (regression guard, §49.9
  follow-up); (d) bond/savings short-circuit unchanged.
- [x] Full instruments suite green (`npm run test`) + `npm run build`.
- [x] Commit.

### 56.2 — release + PROD verify

- [x] Push → GHA patch-bump (pin the **real** tag from `gh release list`) →
  bump the pin in the homelab instruments helmrelease — **all 4 occurrences**
  (app + tickersync + corpbondsync + fxsyync cronjobs).
- [x] Flux + kubectl verify (`KUBECONFIG=$HOME/.kube/homylab`); if the RWO
  logos PVC multi-attach stalls the rollout (known gotcha), scale the
  deployment to 0, wait, scale back to 1.
- [ ] Playwright PROD: a portfolio holding un-suffixed AMD →
  `GET /api/portfolios/:id/calendar` returns `currency: "USD"` for the AMD
  holding (and the Calendar tab renders accordingly); the AMD research chart
  still renders (default load = no conversion); an explicit display-currency
  selection on AMD shows the §48.2 400 error state, not a silently converted
  series. **Verified 2026-09-24 — first two clauses pass; third clause
  exposed a gap:** the `price-bars` leg does return the §48.2 400, but
  `PriceChart.vue` runs a second `/history` leg which has NO base-currency
  guard — for ambiguous AMD it returns 200 with `currency: null` and
  unconverted USD closes, and the UI keeps showing that series while the
  title selector still reads the chosen display currency (PLN) — i.e. a
  silently wrong-denomination series, exactly what the guard was meant to
  prevent. Follow-up needed (instruments guard on `/history`, or PriceChart
  error state on 400).
- [ ] Commit (plan closeout) + archive §56.

 **Open question (decide before 56.2):** is silence → the §49.6 USD fallback
sufficient, or do we also want **precise disambiguation** — wallets' calendar
fan-out passes the position's `companyName` as a hint (`?company=`) and the
resolver prefers the exactly-matching name row among colliding tickers? The
hint variant fixes the rare non-US un-suffixed collision (e.g. a foreign
ticker imported bare from IBKR) that the USD fallback would get wrong; it
touches wallets + instruments (new API param), so it would land as a separate
step if wanted.

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
