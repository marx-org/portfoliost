# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then
archived. This file holds **only unfinished work**; everything completed,
superseded or obsoleted lives in `plan-archive.md`.

Some steps below cite an earlier section by number for provenance (e.g. "the
bar established in §63.13"). Those citations may point into `plan-archive.md` —
the RCA they refer to is preserved there in full.

Legend: `[ ]` pending · `[x]` done (a `[x]` only ever appears in a step that
also still has `[ ]` work; fully finished steps are archived)

**Start at [§78 — Everything that needs YOU](#78-everything-that-needs-you-2026-10-01).**
It is the only section whose items block other work, and the only one I cannot
progress on my own: three spreadsheet edits and two decisions. Everything else
here is mine to pick up.

---

## 78. Everything that needs YOU (2026-10-01)

Consolidated from the places it was scattered. Four items, all of them actions
only the portfolio owner can take — three are edits to the source spreadsheet, one
is a decision. Nothing here is a queue I can grind through, and each one blocks
work that is otherwise ready.

**Two of the four are now closed (2026-10-02), and one of them moved.** §78.1
(XTB's funding) was answered by the owner and is superseded by **§87** — XTB never
holds cash, so the fix is a sell-side cash leg in the importer plus an `AU` flip on
its ten trade rows, not a `Wpłata` row. §78.3's decision was accepted: the six
bonds' pre-sale history is unrecoverable. What remains for you is **§78.2** (the
IKE Marek `Gotówka` series, and the IKE Beata rows) and **§78.4** (the CI
decision). §78.5 and §78.6 stay parked until §78.2 lands.

**Everything below this line needs no `--wipe`.** The wipe ran today at 14:16 UTC
and the incremental import reports `inserted=0 skipped=2368`, so the database is
already exactly what the sheet says. Adding rows and re-running the *incremental*
sync is sufficient: §69.3 re-backfills every portfolio the import touched, from
the first trade, with nobody pressing Recompute.

Admin → Jobs → "Sync sheet" (the incremental one, **not** "Wipe & Reimport").

### 78.1 — XTB: add one `Wpłata` row. Until then its history is offset.

XTB's value series goes **negative** — `9.49 → −4.04` on 2022-02-17, a −142.6%
single-day "move" that is the worst in the system. §72.35 read the sheet
in-cluster and proved the import is not at fault: the funding row does not exist.
`Typ` counts per Konto show XTB with `Kupno=5 Sprzedaż=5 Div=12` and **no
`Wpłata` and no `Wypłata` at all**, and the `Gotówka` sheet has no XTB column
either, so the funding was never recorded anywhere.

One row, dated **on or before 2022-02-11**:

| column | value |
|---|---|
| `Typ` | `Wpłata` |
| `Aktywo` | `Gotówka XTB` |
| `Ilość transakcyjna` | `2716,60` |
| `Cena transakcyjna jednostki (PLN)` | `1,00 zł` |
| `Wartość transakcji (PLN)` | `2 716,60 zł` |
| `Waluta transakcji` / `Kurs waluty transakcji` | `PLN` / `1,00 zł` |
| `Konto` | `XTB` |
| `wpłata/wypłata` | `1` |

**2 716,60 PLN is exact**: the sum of XTB's five buys (568,20 + 396,97 + 446,74 +
434,75 + 869,94) against 2 957,88 PLN of sales — a real +241,28 PLN realised,
which the ledger currently reports as −56,50.

**`wpłata/wypłata` must be `1`.** Despite the name the importer reads that column
as the **AU flag**, and `parseRow` *throws* on a `Wpłata`/`Wypłata` row whose AU
flag is 0 — the whole import aborts. So a plausible-looking `0` there costs you
every row in the sheet, not just this one.

- [x] Add the row above, re-import, confirm the unfunded-portfolio finding clears
      and `invested` stops being 0
      > **Superseded by §87.4 — this row is withdrawn, not deferred.** The owner
      > established on 2026-10-02 that XTB never holds cash: it is deposit→buy and
      > sell→withdraw, all ten trade rows. §87.1 adds the missing sell-side
      > `WITHDRAWAL`, so flipping XTB's 5 `Kupno` + 5 `Sprzedaż` to `AU=1` closes
      > the account at ≈0 with no spreadsheet row at all. The `2 716,60` figure
      > above is the trap this avoids: it is the buy total only, so a lone
      > `Wpłata` row would have pinned `invested` at `2 716,60` for the rest of
      > time and re-created the offset it was meant to remove. The insertion point
      > worked out for it (sheet row 138, above the first `Kupno`) is not needed.
- [x] Decide whether XTB's `Gotówka` column should exist at all
      > **No — 2026-10-02.** The `Gotówka` sheet's account columns are `ING ROR`,
      > `OKO wspolne`, `OKO Obligacje`, `Smart Saver/PKO SA/OKO Rudnik`,
      > `Inteligo ROR`, `IKE Marek`, `IKE Beata`, `IB` — no XTB, and none is
      > needed: §63.4's recon derives cash from the ledger, which is what §87.4
      > makes correct. A column would only make the recon cross-checkable for this
      > one account.

### 78.2 — IBKR / IKE Marek / IKE Beata: the Transakcje rows are missing, not Gotówka

§63.4 replaced the old per-day report with one comparable number per account, and
that is where this stands (measured today, unchanged since this afternoon):

| account | derived | sheet's last row | Δ | direction |
|---|---|---|---|---|
| IBKR | 24 741,35 | 6 006,42 | **+18 734,93** | app knows money the sheet does not |
| IKE Beata | 4 442,52 | 3 032,89 | **+1 409,63** | same |
| IKE Marek | 961,87 | 4 951,85 | **−3 989,98** | **reverse** — the sheet has ~4k the app does not |

**This is two different problems wearing one number, which is why it cannot be
closed by watching a figure approach zero.** IBKR and IKE Beata are missing
`Transakcje` inflow/outflow rows. IKE Marek is the opposite: the sheet's balance
runs ~4k *ahead* of what the ledger can explain, so something is recorded there
that the app never saw.

Note the old report's numbers were meaningless — it reported `recon =
−368,300.77` on IBKR, which was never a balance but the sheet's own `cashFlow`
column replayed onto a `Gotówka` anchor the flows do not belong to, summed over
full history. A check reporting a figure about itself.

- [ ] Add the missing Transakcje rows for IBKR and IKE Beata
      > **Then:** I re-run the dry sync and confirm both deltas fall toward zero.
      > **The IBKR half is measured against a sheet that has since changed
      > (2026-10-02)** and its `+18 734,93` cannot be closed by what moved. The
      > owner normalised all three of IB's `AU=1` trades to `AU=0` — rows 1565,
      > 1646, 1805 (3 funded `Kupno`s, 9 975,17 PLN / 2 344,88 EUR of `DEPOSIT`s
      > that were genuinely being posted) and row 1852, the 40-share ASRNL exit
      > that was already inert. Those three buys were the only IB rows posting any
      > cash, so the gap can shrink by at most 9 975,17 and still stands at
      > ≥ `+8 759,76`; flipping 1852 changed nothing because the sell branch was
      > already inert outside `Equate+` (§87.1). Re-measure before chasing this
      > one — the number above is arithmetic on a prior measurement, not a fresh
      > reading.
- [ ] **IKE Marek is the one to look at first** — a *negative* Δ means the sheet
      records money the app has no record of. That is not a missing row; it is a
      row whose `Typ`/`Aktywo` the importer does not read as a deposit. Give me
      the Gotówka series for that account and I will find which row it is rather
      than you hunting for it.
      > This is the single most useful thing in this section: it is the one item
      > where I can do the work once you hand me the numbers.

### 78.3 — Six PL government bonds 404 upstream. Decide: hunt, or accept and label.

Six PL bonds (`BST0322`-style SKMs) return 404 from every configured provider.
The price-audit lists 11 more that "have no bars" — mostly these plus MPW/WBA
(delisted, correctly) and the `.TFI` funds.

**Their pre-sale history is understated by a known-unknown amount**, and §72.31's
`gapSymbols` is the only thing marking it.

- [x] **Decide: find a source that carries them, or accept the partial sum and
      make the UI say so**
      > **Accepted 2026-10-01**, and the hunt is impossible rather than deprioritised:
      > the feed discards matured instruments *and their history*. `BST0327` (matures
      > Mar 2027) has **427** bars; `BST0922` (matured Sep 2022) has **0**, though it
      > traded across 2021–22. All 8 are Polish **government** retail bonds, and
      > carrying them at cost (§72.21) is near-correct since they were redeemed.

### 78.4 — Add a CI job that runs the test suite, across all five repos

Not a spreadsheet item, but it is yours to decide and it is the only open item
that needs a judgement rather than data.

**No CI in any of the five repos runs `npm test`.** Every workflow is release +
build + push; the Dockerfile runs `npm run build` (tsc) but not the suite.
Wallets' entire CI history has two workflow names. So the suite has only ever run
on this machine.

- [ ] **Add `npm test` (and `npm run test:mock` where the repo has one) on every
      PR, for all five repos**

### 78.5 — Then verify, once the rows land

**Folded in from §65.1, which had no open work of its own left.** The two halves were
split the wrong way round: the owner's action and the check that confirms it are one
chain, and separating them meant §65 sat open with nothing anyone could do. §65's
remaining three steps are here; §65 is archived.

**No `--wipe`.** The wipe ran 2026-10-01 14:16 UTC and the incremental sync then
reported `inserted=0 skipped=2368`, so the database is already exactly what the sheet
says. Adding rows and re-running the *incremental* sync is sufficient — §69.3
re-backfills every portfolio the import touched, from the first trade, with nobody
pressing Recompute. Admin → Jobs → "Sync sheet" (not "Wipe & Reimport").

- [ ] **Re-run the Gotówka recon and confirm all three deltas move toward zero**
      > §65.1. Today: IBKR **+18 734,93**, IKE Beata **+1 409,63**, IKE Marek
      > **−3 989,98**. IKE Marek's sign is the interesting one — see §78.2.
- [ ] **Assert 0 row errors and that the synthetic `#d`/`#t` legs still dedupe on a
      second run**
      > §65.1. Both held on the 2026-10-01 run (`errors=0`, all 2,368 skipped,
      > `portfoliosTouched=0`); re-assert after the new rows land.
- [ ] **All 10 `portfolio_backfill_metadata.status = complete`, and every
      `gap_symbols` accounted for**
      > §65.1. `status` is `complete` on all ten today. `gap_symbols` is **not** empty
      > on 4 (Crypto 1, IKE Beata 7, IKE Marek 6, Rach. 1) — six of those symbols are
      > the §78.3 bonds, so this cannot close until that decision's *consequences* are
      > recorded rather than until the symbols gain prices.
- [ ] **No single-day move worse than −25% in the ALL series**
      > §65.1, bar from §63.13. **Measure flow-adjusted** (`(value − net_flow)` vs the
      > prior day): on raw `value` Equate+ reads −80.2% and IBKR −20.0%, both pure
      > *withdrawals* — Equate+'s true worst day is −22.0%. IKE Marek's −76.1% and
      > IKE Beata's −34.1% are **explained** by §78.5's `unpricedValue`: each is
      > exactly the unpriceable bond purchase on that day. XTB remains, and it needs
      > §78.1. The **money-weighted** column has the same cause and its own
      > re-measurement in §78.6 — a flow series that starts late is why XIRR reads
      > +201% on the aggregate while TWR p.a. reads +12.92%.

### 78.6 — Then re-measure the money-weighted return, once the rows land

**Folded in from §83.8** (archived with §83 in `plan-archive.md`), which was
the one thing §83.7's PROD verification left behind — found in the browser, not
by a test. It belongs here because its cause is §78.1 + §78.2, so it is the same
chain as §78.5: your rows, then this check.

The cumulative tab renders XIRR **+201.05%** beside TWR p.a. **+12.92%** — a
pairing that cannot both be true of the same money, and the aggregate is only the
sum of portfolios that each show it too.

**Measured on PROD, `?timeframe=ALL`, 2026-10-02:**

| portfolio | XIRR | TWR p.a. | TWR | value | invested |
|---|---|---|---|---|---|
| XTB | **1166.93%** | 72.82% | 1166.93% | −24.08 | 0 |
| NN TFI PPO | **326.64%** | 16.87% | 181.42% | 198 019 | 97 485 |
| NN TFI PPK | **194.46%** | 13.00% | 129.52% | 124 148 | 74 443 |
| IKE Beata | **127.66%** | 11.52% | 71.34% | 204 674 | 132 099 |
| IKE Marek | **105.81%** | 0.50% | 2.51% | 91 862 | 54 548 |
| IBKR | **72.65%** | −0.28% | −1.28% | 279 380 | 202 751 |
| Obligacje PKO SA Beata | 4.17% | 3.40% | 4.14% | 119 300 | 115 000 |
| Crypto | 2.77% | −2.81% | −12.39% | 889 | 873 |
| Equate+ | −23.57% | 3.23% | 26.55% | 17 513 | 23 901 |

The pattern is unambiguous: the two portfolios whose TWR p.a. is small (IBKR
−0.28%, IKE Marek 0.50%) report XIRR of +72% and +106% on gains of +38% and +68%
*in total*. XIRR can exceed the simple return only if the money arrived late in
the window — and it did, because the deposit history is incomplete.

**This is not a new defect, and not a rendering one.** It is §78.2 (IBKR / IKE Marek /
IKE Beata missing ledger rows) and §78.1 (XTB's missing `Wpłata`) reaching the
money-weighted column: `net_flow` is
written from `dailyExternalFlows` (`backfill.ts:1344`), so a portfolio whose
early deposits are missing has a flow series that starts too late, and XIRR
compounds the remainder as if it had been invested for the whole period. The KB's
own §82.6 table puts IKE Marek's opening net at −2 610.72 and IBKR's at +2.88,
which is the same missing-ledger story from the other end.

§82.6's lesson applies again, one level up: **§82.2's XIRR tile was verified
against compose seed data, where the 49-point fixture produces sane numbers, and
was never checked in PROD.** It is the same false-assumption class that made §82's
Σ-gains reconciliation wrong for 6 of 10 real portfolios.

- [ ] **Do not "fix" the aggregate.** §83.2 (archived) reads `buildMwr` unchanged, which is
      correct: the aggregate's money-weighted return of a set of portfolios with
      incomplete ledgers is wrong in the same way, and for the same reason. Any
      clamp or sanity filter applied only here would make the two tabs disagree.
- [ ] **Land §78.1 + §78.2, then re-measure this table.** The prediction is that
      XIRR collapses toward TWR p.a. for the portfolios whose deposits are
      restored. If it does not, the cause is the solver (Newton roots on
      one-sided flow histories, cf. §53.1's `MAX_ABS_XIRR` guard and its
      `buildSimple` fallback) rather than the data, and that is a separate fix.
- [ ] **Record the withholding honestly in the meantime.** The tile renders a
      confident number with `moneyWeightedReturnWithheldReason: null` because
      `buildMwr` cannot tell "XIRR converged" from "XIRR gave up and returned a
      simple return" — §83.2's note keeps that parity rather than inventing a
      reason the per-portfolio route does not send. Until §78 lands, the cheapest
      honest improvement is a one-line caveat on the Overview card naming the
      known §78.1/§78.2 data gap, the same way §83.6 (archived) states the FX caveat.
- [ ] Test: the PROD table above becomes the regression fixture — assert that a
      portfolio whose flow series starts on the same day as its first snapshot
      reports an XIRR within a sane band of its TWR p.a. The unit tests that
      pinned §82.2's tile all used a fixture with a complete ledger, which is
      precisely why they passed.
- [ ] Commit `fix(spa): disclose the known money-weighted data gap (plan §78.6)`.

---

---

## 88. One "Portfolio settings" dialog, not two copies of it (2026-10-03)

Owner-driven, found while landing §87.5. The app has **two** dialogs that are the
same dialog: `PortfolioDetailView.vue`'s (opened by the page's "Rename" button) and
`PortfolioCard.vue`'s (opened by the card's kebab menu → "Edit"). Both carry
`aria-label="Rename portfolio"`, both own a `renameName`/`renameBusy`/
`renameError` trio plus their own `updatePortfolio` call, and both had to be edited
when §87.5 added the cash-leg switch — which is exactly how they drifted: §87.5
landed the checkbox on the detail page first, and the owner reported the card's
dialog still had none, i.e. the setting was editable from `/en/portfolios/:id` and
invisible from `/en/investments`.

This is a duplicate-with-a-history, not a cosmetic one. The lesson generalises: a
per-portfolio setting added to "the dialog" is added to one of the dialogs.

**Design decisions (resolved).**
- **One component, two openers.** The dialog moves out of both parents into
  `src/modules/portfolios/PortfolioSettingsDialog.vue`; the parents keep only the
  button/menu item and an `open` ref. No new route, no store change.
- **The dialog owns the write**, like every other dialog in
  `src/modules/portfolios/` (`RecordDividendDialog`, `EditTransactionModal`): it
  takes `portfolioId` + the current `name`/`cashLegOnTrade`, calls
  `updatePortfolio`, and emits `saved`. The parents' post-save refresh stays where
  it is (the card `store.fetchAll()` + its "Portfolio renamed" notice, the detail
  view `fetchAll()` + `fetchDetail(id)`), because only they know what their
  surface renders.
- **The trigger label becomes "Settings"** on both surfaces (page button, card menu
  item) and the heading stays "Portfolio settings". The dialog's `aria-label`
  changes to "Portfolio settings" too — it is no longer a rename form. §88.2 owns
  every test that selected the old label; per `docs/COMPONENTS.md` a testid/label
  rename is stable API and must move in the same commit as the change.
- **Both testids collapse to one**, `cash-leg-on-trade`. Two testids for one
  control is what let §87.5's e2e pass while the card's dialog was missing the
  control entirely.
- **One input id**, `portfolio-settings-name`. The two parents currently disagree
  (`rename-name` vs `portfolio-name`), so a page can carry both labels' `for`
  attributes pointing at nothing.

Scope: the SPA only. No contract, wallets or sheets-sync change — `cashLegOnTrade`
already exists on `Portfolio` and `CreatePortfolioRequest` (§87.5).

### 88.1 — Extract `PortfolioSettingsDialog.vue`

- [ ] New `src/modules/portfolios/PortfolioSettingsDialog.vue`:
      `defineProps<{ open: boolean; portfolioId: string; name: string;
      cashLegOnTrade?: boolean }>()`, `defineEmits<{ close: []; saved: [] }>()`,
      local `name`/`cashLeg`/`busy`/`error` seeded from the props in a `watch` on
      `open` (the same shape both parents use today in `openRename`), and the
      submit calling `updatePortfolio(portfolioId, { name: trimmed,
      cashLegOnTrade })`. On success: `busy = false`, `emit("saved")`, `close`.
      Copy the markup verbatim from `PortfolioDetailView.vue`'s dialog (it is the
      newer of the two) including the §87.5 help text and `dark:` variants.
- [ ] Move, do not redesign: the overlay (`fixed inset-0 z-50 … bg-slate-900/40
      p-4 pt-24`), `card w-full max-w-md p-6`, `role="dialog"`,
      `aria-modal="true"`, the `@click.self` close, the error line, and the
      Cancel/Save pair. `@click.stop` on the inner card **only** where the parent
      needs it (the card's dialog sits inside a clickable card, the detail page's
      does not) — express it as a `stopInnerClick?: boolean` prop rather than
      copying the attribute into both.
- [ ] Replace the duplicated `<input id>` with one `portfolio-settings-name`, and
      both `cash-leg-on-trade` testids with that single testid.
- [ ] Tests: `tests/unit/modules/portfolios/PortfolioSettingsDialog.test.ts` —
      mounts with `open: true`, asserts the checkbox reflects the `cashLegOnTrade`
      prop; submitting calls `updatePortfolio` with `{ name, cashLegOnTrade }`
      (mocked `@/api/portfolios`, per `PortfolioCard.test.ts`'s existing mock
      shape); an empty/whitespace name does not call it; a rejected promise renders
      the error and keeps the dialog open; `saved` + `close` are emitted together.
- [ ] `npm run build && npm run test`; commit
      `refactor(spa): extract the portfolio settings dialog`.

### 88.2 — Point both surfaces at it, and fix the labels their tests select

- [ ] `PortfolioDetailView.vue`: delete `showRename`/`renameName`/`renameCashLeg`/
      `renameBusy`/`renameError`, `openRename`, `submitRename` and the dialog
      markup; render `<PortfolioSettingsDialog :open="showSettings" … @close="
      showSettings = false" @saved="onSettingsSaved" />` and relabel the button
      "Rename" → "Settings".
- [ ] `PortfolioCard.vue`: the same deletion; the kebab menu item "Edit" becomes
      "Settings"; `onSettingsSaved` keeps the existing `store.fetchAll()` and the
      `notice.value = "Portfolio renamed"` → retitle to "Portfolio updated", since
      the dialog is no longer only a rename.
- [ ] Both parents pass `cashLegOnTrade` from what they already hold
      (`store.detail?.cashLegOnTrade` on the page, `props.portfolio.cashLegOnTrade`
      on the card). Neither may fetch it itself.
- [ ] Update every selector that names the old things, in the same commit:
      `aria-label="Rename portfolio"` → `"Portfolio settings"` in
      `tests/e2e/parity-portfolios.spec.ts:87` and in
      `tests/e2e/cash-leg-on-trade.spec.ts`; the card's
      `card-cash-leg-on-trade` → `cash-leg-on-trade`; the page button name
      "Rename" → "Settings"; the kebab item "Edit" → "Settings". Grep first:
      `grep -rn "Rename portfolio\|Rename\"\|card-cash-leg-on-trade" tests/ src/`
      must return nothing afterwards.
- [ ] The §87.5 e2e keeps BOTH of its dialog cases (page + card) and they now
      assert the *same* testid, so a future edit that touches one dialog and not
      the other cannot pass.
- [ ] `npm run build && npm run test && npm run test:mock`, then
      `docker compose up -d --build && docker compose up -d --force-recreate
      gateway` (the gateway caches upstream IPs, AGENTS.md) and
      `npm run test:e2e`; commit
      `refactor(spa): one settings dialog behind both the page button and the card menu`.

### 88.3 — Closeout

- [ ] `docs/COMPONENTS.md`: add `PortfolioSettingsDialog.vue` to the "Feature
      view / dialog" reference row, and record the rule this section exists
      because of — *a per-portfolio setting added to "the dialog" is added to one
      of the dialogs until there is exactly one*.
- [ ] Sweep for the same shape elsewhere before declaring the pattern fixed, and
      record what it finds — the sweep run while writing this section (2026-10-03)
      already found the **second** instance of this exact defect:

      ```
      $ grep -rho 'aria-label="[^"]*"' src/ | sort | uniq -c | sort -rn | head -3
            2 aria-label="Rename portfolio"
            2 aria-label="Delete portfolio"
      ```

      So `PortfolioDetailView.vue:317` and `PortfolioCard.vue:708` hold a second
      copy-paste pair — the delete-confirm dialog, identical but for the button
      class (`btn-danger` vs `btn-primary bg-red-600`) and the name source. It is
      **not** fixed here (one section, one concern: this one is the settings
      dialog), and it is recorded so the next dialog-shaped change to either file
      knows the other file has the same thing. Every other dialog in the app is
      single-instance, so the rename/settings pair and the delete pair are the
      whole of the pattern today.
- [ ] Archive §88 on its own pass — §87 was archived 2026-10-03, and §88 is the
      only section left of §85–§88; commit.
