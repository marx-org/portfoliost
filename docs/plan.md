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
always progress on my own: one spreadsheet edit, one CI decision, and a batch of
manual `CONVERT` entries. Everything else here is mine to pick up.

---

## 78. Everything that needs YOU (2026-10-01)

Consolidated from the places it was scattered. Four items, all of them actions
only the portfolio owner can take — three are edits to the source spreadsheet, one
is a decision. Nothing here is a queue I can grind through, and each one blocks
work that is otherwise ready.

**All four are now accounted for — three closed, and one moved.** §78.1 (XTB's
funding) was answered by the owner and is superseded by **§87** — XTB never
holds cash, so the fix is a sell-side cash leg in the importer plus an `AU` flip on
its ten trade rows, not a `Wpłata` row. §78.3's decision was accepted: the six
bonds' pre-sale history is unrecoverable. §78.2 was re-measured on 2026-10-03 and
**its premise was wrong** — there are no missing rows on any of the three
accounts, so it is no longer a spreadsheet item at all; the resolution is a new
cash-transaction type in **§89**, which is mine to build. §78.4 was decided and
built on 2026-10-04: the tests now run in all five GHA builds. What remains for
you is the manual `CONVERT` entries in §89.7.
§78.5 and §78.6 stay parked until §89 lands.

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

### 78.2 — IBKR / IKE Marek / IKE Beata: no missing rows — re-measured, premise corrected (2026-10-03)

§63.4 replaced the old per-day report with one comparable number per account.
Re-measured on PROD 2026-10-03 (sheets-sync `v1.0.36`, run `inserted=21
skipped=2365 errors=0`; derived side re-read live from `GET
/internal/cash-balances?asOf=2026-09-29`; sheet's last dated row 2026-09-29):

| account | derived | sheet's last row | Δ | direction |
|---|---|---|---|---|
| IBKR | 24 741,35 | 6 006,42 | **+18 734,93** | app knows money the sheet does not |
| IKE Beata | 4 442,52 | 3 032,89 | **+1 409,63** | same |
| IKE Marek | 961,87 | 4 951,85 | **−3 989,98** | **reverse** — the sheet has ~4k the app does not |

**Byte-identical to §63.4's first run on 2026-10-01.** No owner action has
landed, and the premise this section was written on — "the `Transakcje` rows
are missing" — is wrong for all three accounts. Full evidence, including what
each Gotówka column actually measures, is in
[proposals/portfolio-cash-tracing.md](proposals/portfolio-cash-tracing.md) §3;
the resolution is **§89**.

- [x] Add the missing Transakcje rows for IBKR and IKE Beata
      > **Withdrawn 2026-10-03 — the premise was wrong, so no row is missing.**
      > **IBKR's inflows are not missing — §69 drops them on purpose.** The 37
      > no-op `Wpłata Gotówka IB` rows in the sync log are
      > `isDuplicateTransferFunding` hits (`transakcje-mapper.ts:239`): the
      > broker's own record of the Equate+ SAP sale proceeds landing, kept once
      > as the synthesized `Equate+ → IBKR` TRANSFER pair instead of twice. The
      > owner confirmed that model in §69 and it is working as designed, so no
      > spreadsheet edit closes IBKR's Δ.
      >
      > **IKE Beata's half is the same defect as IKE Marek's** (§89): its PLN
      > leg is `+47 429,70` against the sheet's `3 032,89`, i.e. **+44 396,81**,
      > because the sheet records no FX-conversion rows and the importer debits
      > each buy in its own currency. The `+1 409,63` headline is two ~±42k
      > errors nearly cancelling, not a small gap. A `Wpłata` row cannot express
      > it.
      >
      > **The AU-flip arithmetic in the note this replaces was wrong in
      > mechanism, not just in number.** `externalIdOf`
      > (`transakcje-parser.ts:28-31`) hashes cols 2,3,4,5,20,21 and **not**
      > col 47 (`AU`), so a `#d` leg's `external_id` is unchanged by a flag flip;
      > and the sync is insert-only. The three `Buy: ASR Nederland NV` `#d`
      > DEPOSITs (2 344,88 EUR) are still in PROD and IBKR's derived is unmoved
      > at 24 741,35 — the gap did not shrink by the predicted ≤9 975,17 and
      > does not stand at `+8 759,76`. Closing it needs a wipe or a targeted
      > delete, never a re-sync. Corollary: the id is a content hash, so editing
      > a sheet row **orphans** the old imported row and inserts a new one.
- [x] **IKE Marek is the one to look at first** — a *negative* Δ means the sheet
      records money the app has no record of.
      > **Answered 2026-10-03: there is no such row, and that is the finding.**
      > All four legs re-derived from `portfolios.transactions` and matching to
      > the penny — PLN `+43 425,30`, EUR `−2 883,46`, GBP `−3 154,49`, USD
      > `−3 592,67` — so the PLN leg is **+38 473,45** over the sheet's
      > `4 951,85` while the foreign legs are ≈**−42 463,43** of purchases that
      > were never funded. The `Gotówka` column is a single-PLN cash ledger and
      > the grid has no conversion rows, so the PLN that left the account to buy
      > EUR/GBP/USD is invisible. What is absent is a whole class of movement,
      > not one row — which is why the section's own framing could not close.
      >
      > **Do not act on the sheet row numbers cited in §78.2 or §87.** Read live
      > from the sheet: row **1565** is a `Wpłata "Gotówka IB"` at `AU=1`, not a
      > funded `Kupno`; **1646** is `Kupno "CubeSmart"`; **1805** is a `Div`; and
      > **1852** is `Kupno "Agree Realty Corp"`, 2026-04-15, qty 4, USD. §87's
      > substance still holds (IB: 387 `Kupno` / 91 `Sprzedaż` / 448 `Div` /
      > 2 `Split`, every trade `AU=0`, flows from 41 `Wpłata` + 5 `Wypłata`) —
      > only the indices are wrong. Cite `Typ` + date + `Aktywo`, which is stable
      > under row insertion.
      >
      > **And the metric could not have told you either.** 143/302 IBKR,
      > 81/130 IKE Marek and 86/137 IKE Beata "gap days" carry no `Transakcje`
      > row at all — the column moves anyway, because it is a whole-account PLN
      > figure that revalues daily. Only 5 of the 58 cash rows line up with a
      > clean step in their column on their own date, and the report sums `Wpłata`
      > col 19 without flipping its sign (the sheet writes it negative), so every
      > contribution day is scored as a withdrawal of twice the amount. That is
      > §89.1, and it lands first by owner decision.

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

- [x] **Add `npm test` (and `npm run test:mock` where the repo has one) on every
      PR, for all five repos**
      > Decided 2026-10-04: always run the tests in the GHA builds. Each repo's
      > `.github/workflows/docker-image.yml` gained a `test` job — checkout →
      > `setup-node` 22 → `npm ci` → `npm run build` → `npm run test`, with
      > `portfoliost` additionally running `npm run test:mock` — and `build` now
      > reads `needs: [test, release]`, so a red suite blocks the image push on
      > both pull_request and push. `portfoliost-sheets-sync` already carried
      > exactly this job and was the shape copied, which is why the five
      > workflows stayed byte-identical to each other.
      > The one delta from that precedent is
      > `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` on the job, which
      > sheets-sync does not need: all five interpolate it in `.npmrc` for
      > `@marx2/contracts`, and the lockfile's `resolved` tarball answers 401
      > unauthenticated and 302 with a token, so `npm ci` cannot succeed without
      > it. `npm ci --dry-run` does *not* catch this — it resolves the tree
      > without fetching a tarball, so it passes with no token at all.
      > Gate before the commit, all local: portfoliost 651, wallets 604,
      > instruments 555, users-auth 35, admin 105 tests green; `npm run build`
      > green in all five; `npm run test:mock` 242 checks, 0 failed (it spawns
      > its own in-process gateway on port 4099, so it needs no compose stack).
      > **GHA then found what the local gate could not.** The first run was
      > green in wallets, instruments, users-auth and admin, and red in
      > `portfoliost` — reporting `78 passed` and *still* exiting 1, because two
      > unhandled rejections took the exit code down. The unit suite had been
      > passing only because this machine runs the compose stack: `VITE_API_BASE_URL`
      > is unset in CI, happy-dom resolves the relative `/api/...` against its
      > default `localhost:3000`, and an unawaited `getUserProfile` rejection
      > surfaced as an unhandled error. Fixed in `6f35de5` — a `fetch` stub in
      > `tests/unit/setup.ts`, plus `getPortfolios`/`getPortfolioTotalMetrics`
      > added to `PortfolioCashTab.test.ts`'s mock, whose factory spread
      > `...actual` and so left the real API function to overwrite the store's
      > list with `{}`. Second run: `test`, `release` and `build` all green, 78
      > files / 651 tests and 242 mock checks inside GHA.
      > Reproduced and verified locally without touching the running stack, by
      > pointing the base URL at a dead port
      > (`VITE_API_BASE_URL=http://127.0.0.1:1 npm test`): exit 1 before the
      > fix, exit 0 after. Worth remembering that a suite can be *fully green*
      > and still fail the job.
      > Cost of the copied shape: a red run burns a version. On the failed push
      > `release` succeeded and `build` was skipped, so `v1.0.377` exists as a
      > Release with no image in ghcr while `v1.0.376` and `v1.0.378` both have
      > one. Gating `release` on `test` too would close that.
      > `docker-image-mock.yml` deliberately keeps no test
      > job: same repo and same triggers as `docker-image.yml`, so a second copy
      > would run the suite twice per PR, and cross-workflow gating would need
      > `workflow_run`.

### 78.5 — Then verify, once §89's entries land

**Folded in from §65.1, which had no open work of its own left.** The two halves were
split the wrong way round: the owner's action and the check that confirms it are one
chain, and separating them meant §65 sat open with nothing anyone could do. §65's
remaining three steps are here; §65 is archived.

**No `--wipe`.** The wipe ran 2026-10-01 14:16 UTC and the incremental sync then
reported `inserted=0 skipped=2368`, so the database is already exactly what the sheet
says. Adding rows and re-running the *incremental* sync is sufficient — §69.3
re-backfills every portfolio the import touched, from the first trade, with nobody
pressing Recompute. Admin → Jobs → "Sync sheet" (not "Wipe & Reimport").

**The §78.2 half no longer arrives as sheet rows.** Per D4 the conversions are
entered by hand in the cash dialog (§89.7), so there is no sync to re-run for them
and no `do dodania` column to paste from — the deltas below move because a
`CONVERT` row was added to the portfolio, not because Transakcje changed.

- [ ] **Re-run the Gotówka recon and confirm all three deltas move toward zero**
      > §65.1. Today: IBKR **+18 734,93**, IKE Beata **+1 409,63**, IKE Marek
      > **−3 989,98**. **IBKR's is not expected to reach zero and must not be the
      > gate** — §78.2 measured its inflows as deliberately modelled (§69), so it
      > is a known modelling difference, not an error to close. What must move is
      > the IKE pair, and only once §89.2 has said what the comparison is worth.
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

**This is not a new defect, and not a rendering one.** It is §78.2 — whose
2026-10-03 re-measurement found the IKE accounts' PLN leg inflated by the full
cost of an unfunded foreign book (≈±40k each, see
[proposals/portfolio-cash-tracing.md](proposals/portfolio-cash-tracing.md) §3.2)
— and §78.1 (XTB's missing `Wpłata`) reaching the
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
- [ ] **Land §87 + §89, then re-measure this table.** The prediction is that
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
      known §89 data gap, the same way §83.6 (archived) states the FX caveat.
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

---

## 89. `CONVERT` + `ADJUSTMENT`: two cash-transaction types, and a recon that can be believed (2026-10-03)

The resolution of §78.2, which its 2026-10-03 re-measurement turned into a
modelling problem rather than a spreadsheet one. Evidence and the full decision
record: [proposals/portfolio-cash-tracing.md](proposals/portfolio-cash-tracing.md)
§3 (findings) and §4 (decisions D1–D7).

**Repos touched: four** — `portfoliost-contracts`, `portfoliost-wallets`,
`portfoliost-sheets-sync`, `portfoliost`. Flagged up front because it crosses
more than two; the shape was the owner's explicit call (a new cash-transaction
type that the UI must cover).

**The finding that shapes all of it.** The IKE Marek / IKE Beata / IBKR Δ is not
missing rows. Their foreign-currency legs are unfunded — IKE Marek is
`+43 425,30` PLN against a sheet that says `4 951,85`, and `−2 883,46 EUR /
−3 154,49 GBP / −3 592,67 USD` of purchases the sheet never funded. The
`Gotówka` column is a single-PLN cash ledger, the `Transakcje` grid records no
FX-conversion rows, and the importer debits each buy in its own currency. A
conversion inside one portfolio is not expressible today because `TRANSFER`
requires `toPortfolioName` that "must exist and **differ** from the source
portfolio" (`openapi.yaml:2301`). Hence a new type.

**Design decisions (owner, 2026-10-03).** Recorded here rather than as open
questions; each step below is the source of truth for the one it covers.

- **`CONVERT`** — a new member of the `ImportPortfolioCashTx.type` enum
  alongside `DEPOSIT`/`WITHDRAWAL`/`TRANSFER` (`openapi.yaml:2289`), carrying
  `fromCurrency`, `toCurrency`, `fromAmount`, `toAmount` and a rate on **one**
  row, from which wallets derives both legs linked as a pair. Two correlated
  rows was rejected: it puts two entries in every cash list and lets the pair
  drift. (D2, D3)
- **Recorded manually, in the UI.** The importer invents nothing. `externalIdOf`
  (`transakcje-parser.ts:28-31`) hashes content, not `AU`, and the sync is
  insert-only — so an inferred row would orphan-and-insert rather than
  reconcile. (D4)
- **Available on every portfolio**, not gated behind a per-portfolio switch;
  converting currencies is real for any account holding more than one. (D5)
- **`ADJUSTMENT`** — moves one chosen currency's balance by a signed delta,
  mandatory reason. `cashBalances` is a pure replay, so a delta is the only
  shape implementable without a stored balance; an absolute "set the balance to
  X" would be a delta at write time anyway. **It counts toward `invested`
  according to its sign**, like an inflow or outflow — knowingly the
  non-conservative choice, and §78.6 records the cost: a flow series wrong in
  shape distorts XIRR badly, and an adjustment that moves the denominator can
  mask or amplify it. Accepted; 89.5 pins it with a test so it cannot change by
  accident. (D6)
- **The history is reconstructed as `CONVERT`, not as adjustments.** Both ship;
  `ADJUSTMENT` is the escape hatch when the number is known but the story is
  not. Chosen over closing the gap with a handful of adjustments because the
  reconstructed history is self-documenting. (D7)

Rules: one step = one commit; a step is marked `[x]` only after its tests pass.

---

### 89.1 — Make the gap report correct and tested, and measure the columns' own noise

- [ ] Fix the sign bug: `scripts/gotowka-gap-report.ts:78` sums raw
      `Przepływ gotówki` into `flows`, but the sheet writes `Wpłata` **negative**
      (row 101 `−15 777,00 zł`) and `Wypłata` positive (row 865
      `+20 850,00 zł`), so every contribution day is scored as a withdrawal of
      twice the amount. Normalise by `Typ` before summing.
- [ ] Move the arithmetic out of `scripts/` into `src/gotowka-gap.ts` (pure:
      `flows`, per-day column deltas, gap rows) and leave
      `scripts/gotowka-gap-report.ts` a thin I/O shell. Reason it must move:
      `vitest.config.ts` sets no `include`, so the default glob matches no
      script and the report has had **no** test since 2026-09-25 — which is how
      a sign error survived a full month and a 580-row report.
- [ ] Fixture from the live grid, committed: a `Gotówka` column with a
      contribution day and two cash-event-free days, and the two `Wpłata`/
      `Wypłata` rows above. Assert the sign normalisation **and** assert that a
      day with no cash row is reported as a gap rather than silently skipped —
      that is the 143/302 · 81/130 · 86/137 finding, and it is the report's
      actual subject.
- [ ] Measure each tracked column's noise floor (the Σ|Δ| attributable to days
      with no cash event) and print it in the report header next to Σ BRAKUJE,
      so a reader can see whether a Δ is inside the column's own volatility.
- [ ] Tests: `src/gotowka-gap.test.ts` green; `npm run test && npm run build`;
      commit `fix(sheets-sync): normalise Wpłata sign in the Gotówka gap report`.

### 89.2 — Say what each tracked column is compared against

- [ ] `src/gotowka-recon.ts`: the eight `Gotówka` columns are whole accounts
      stated in PLN and partition exactly — `Suma` == Σ(cols 1..8) and
      `Suma brokerzy` == IKE Marek + IKE Beata + IB on **333/333** dated rows.
      `derived free-cash` versus a whole-account figure is not like-for-like.
      Record that as the schema's stated meaning in the file header, and compare
      `derived − sheet` only alongside 89.1's noise floor so a Δ inside the
      column's volatility cannot read as a discrepancy.
- [ ] `GOTOWKA_TOL.IB` stays ±50 PLN and the two IKE stay ±10 — the values the
      operator's seen — but state in the comment that the threshold is now
      advisory against a measured noise floor, not a correctness bound.
- [ ] Tests: extend `src/gotowka-recon.test.ts` (17 today) with a column whose
      last row sits inside its own noise and assert the line is **not** raised;
      keep the existing as-of-date and missing-credential properties green.

### 89.3 — Contract: `CONVERT` and `ADJUSTMENT`

- [ ] `portfoliost-contracts/contracts/openapi.yaml`:
      `ImportPortfolioCashTx.type` enum (`:2289`) gains `CONVERT` and
      `ADJUSTMENT`; `ImportPortfolioCashTx` gains nullable `fromCurrency`,
      `toCurrency`, `toAmount` (required iff `CONVERT`), and
      `adjustmentReason` (required iff `ADJUSTMENT`).
- [ ] `RecentCashTransaction.type` stays a plain `string` and `displayLabel`
      already exists, so the read path needs no enum change — assert that in the
      spec test rather than assuming it.
- [ ] Follow the AGENTS.md contract workflow exactly: edit → push `main` → CI
      bumps the patch version → verify with
      `gh release list --repo Marx2/portfoliost-contracts` →
      `NODE_AUTH_TOKEN=$(gh auth token) npm install @marx2/contracts@<new>` in
      each consumer → `npm run gen:types` in `portfoliost` and
      `portfoliost-instruments`. Never hand-edit `package.json`'s version.
- [ ] Tests: contracts `npm test && npm run build && npm run lint` green; commit
      and let CI release.

### 89.4 — Wallets: `ADJUSTMENT` and the `CONVERT` delta in the replay

- [ ] `src/db/schema.ts`: `ck_pctx_type` gains both values; `CONVERT` needs
      `from_currency` / `to_currency` / `to_amount` columns, `ADJUSTMENT` needs
      `adjustment_reason`. Generate the migration with `npm run db:generate` —
      **never hand-write migration files** (KB
      `pfire/portfoliost-wallets/drizzle-migration-workflow`).
- [ ] `src/services/cashLedger.ts`: `cashBalances` emits **two** deltas for a
      `CONVERT` row — `−fromAmount` in `fromCurrency`, `+toAmount` in
      `toCurrency` — so one stored row replays as a real conversion and the two
      currencies cannot disagree. This is the whole reason D3 chose one row.
      `dailyExternalFlows` picks up `ADJUSTMENT` signed as sent (D6).
- [ ] `src/routes/portfolio-cash.ts`: the per-type sign clamp (`:48`) must not
      apply to `CONVERT`, which carries two magnitudes; `displayLabel` becomes
      `Convert` / `Adjustment`; the edit path re-derives both legs; a
      `CONVERT` whose `fromCurrency` equals its `toCurrency` is rejected, and so
      is one whose amounts are not both positive.
- [ ] Tests: `cashLedger.test.ts` — a funded `CONVERT` moves the two currencies
      and leaves the base-currency total equal to the rate-consistent difference;
      a same-currency `CONVERT` is rejected at the route; an `ADJUSTMENT` with a
      negative amount lands as a negative `net_flow`. Full `npm run test &&
      npm run build`; commit
      `feat(wallets): CONVERT and ADJUSTMENT cash transactions`.

### 89.5 — Pin `ADJUSTMENT`'s effect on `invested` (D6), before any UI ships

- [ ] Assert in `backfill.ts`'s `net_flow` computation that an `ADJUSTMENT`
      enters `dailyExternalFlows` with its sign, and that therefore a positive
      adjustment raises `invested` and a negative one lowers it.
- [ ] Assert the consequence D6 knowingly accepts, so it cannot be discovered
      later as a bug: a portfolio whose only flow is an adjustment reports an
      `invested` that no deposit supports, and its XIRR is correspondingly
      meaningless. The test names that as the intended behaviour.
- [ ] Tests: commit
      `test(wallets): pin ADJUSTMENT's signed contribution to invested`.

### 89.6 — SPA: both types in the cash dialog and the cash table

- [ ] `src/components/CashTransactionsTable.vue`: `TYPE_LABELS` (`:260`) gains
      `CONVERT` → "Convert FX" and `ADJUSTMENT` → "Adjustment"; a `CONVERT` row
      renders both currencies (`fromAmount fromCurrency → toAmount toCurrency`)
      rather than one amount and a currency, which the current
      `<td>{{ typeLabel(tx) }}</td>` (`:411`) layout has no column for.
- [ ] `src/modules/portfolios/PortfolioCashModals.vue`: add the two actions.
      `CONVERT` needs two amounts, two currency pickers and a rate; `ADJUSTMENT`
      needs one signed amount, one currency and a **required** reason. Reuse
      `useCurrenciesStore` for the pickers — never hardcode a currency list —
      and follow `docs/COMPONENTS.md` for testid prefixes and the
      `update:x` emit pattern.
- [ ] `src/api/portfolios.ts`: the client types come from
      `components["schemas"]` (regenerated in 89.3), not hand-written shapes.
- [ ] Tests: unit coverage for both dialogs (required reason blocks submit;
      same-currency convert blocks submit), and the `CashTransactionsTable`
      rendering of a `CONVERT` row's two amounts. `npm run build && npm run test
      && npm run test:mock`, then `docker compose up -d --build && docker
      compose up -d --force-recreate gateway` (the gateway caches upstream IPs)
      and `npm run test:e2e`; commit
      `feat(spa): convert-FX and adjustment cash transactions`.

### 89.7 — Reconstruct the history as `CONVERT`, and re-measure

- [ ] **Owner action.** For IKE Marek, IKE Beata and IBKR, enter the `CONVERT`
      rows for the historical PLN→FX movements behind the unfunded legs measured
      on 2026-10-03 (IKE Marek: PLN leg `+43 425,30` against a sheet reading
      `4 951,85`, foreign legs `−2 883,46 EUR / −3 154,49 GBP / −3 592,67 USD`;
      IKE Beata's PLN leg `+47 429,70` against `3 032,89`; IBKR's
      `−39 041,46 USD / −4 337,85 CAD / −4 075,56 SEK / −255,74 SGD`). Each row
      records a rate the sheet's own col 21 carries, so the history is
      self-documenting (D7). `ADJUSTMENT` is the fallback only where the rate is
      genuinely unrecoverable, and its reason field must say so.
- [ ] Then re-run the gap report and the import recon, and record the new Δ per
      account. **IBKR's residual is not expected to reach zero** — §78.2 measured
      its inflows as deliberately modelled (§69) — so the assertion is that the
      IKE pair moves, and IBKR is reported, not gated.
- [ ] Update `proposals/portfolio-cash-tracing.md` §3 with the post-`CONVERT`
      numbers and §5 with what closed, and drop the retired sheet row numbers
      (§3.5) in favour of `Typ` + date + `Aktywo`.
- [ ] Only then unblock §78.5 and §78.6.

### 89.8 — Closeout

- [ ] `docs/COMPONENTS.md`: add both dialogs to the portfolios reference, and
      record the rule this section exists because of — *a cash movement the
      ledger cannot express becomes a new transaction type, and the type's
      effect on `invested` is a decision that must be pinned by a test, not a
      consequence left to the replay*.
- [ ] Sweep for the same shape: any other place that assumes
      `DEPOSIT | WITHDRAWAL | TRANSFER` is exhaustive — grep
      `TRANSFER` across the SPA, wallets and sheets-sync for unguarded enum
      switches — and record what the sweep finds.
- [ ] Archive §89 on its own pass; commit.
