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

## 73. openst leaks memory until it is OOMKilled (found 2026-09-28)

> **POSTPONED 2026-09-30 by the user's instruction: "§73 needs cluster access —
> postpone it."** Not cancelled and not archived; the 44 open items stay open. The
> blocker is verification, not design: §73.5 needs to observe a failing
> unresolvable symbol walking the provider chain in a live pod, and every
> measurement that proves the fix needs pod logs or a DB read, neither of which
> is reachable from here. The two cleanup commits are already shipped
> (openst `v1.1.41`, `MEM_DEBUG=0`), so the section is parked in a **known-bad but
> no-longer-worsening** state rather than a bleeding one. Resume it when
> `kubectl` works again.

> **Cleanup shipped 2026-09-30** — openst `v1.1.41` (homelab `ff7e61ca0`), which
> carries the `malloc_trim` revert (`ed90e36`), and `MEM_DEBUG` flipped to `"0"`
> since the diagnosis it was switched on for is finished. PROD had been running
> the experimental `malloc_trim` build as `v1.1.39` the whole time; it was never
> more than a promise, because the memory split said `traced_fraction 0.0041`, so
> the growth is not JS heap and trimming it could not have helped.
>
> **Verified without kubectl**, via the admin System page (`/en/admin/system`),
> which lists the *running* image tag for every service — a better rollout check
> than `kubectl get deploy` when the API is unreachable, and the only channel that
> survived here. It reported `openst → v1.1.41` once Flux reconciled. Then a
> functional check, because a version string is not a working service:
> `summary-metrics.priceAsOf` advanced to `06:08:37Z` — *after* the rollout — with
> `priceSource: "quote"`, `unpricedPositions: 0`, and real prices (AMZN 246.67,
> PLW.WA 241.5, ELT.WA 61.15), so the quote path still flows through the new pod.
>
> Neither of those two steps changes §73.5, which is the actual fix: an
> unresolvable symbol must fail *before* walking every provider in the chain.
> That is still unimplemented and this cleanup does not claim it.

Found while deploying §72: both openst replicas were killed mid-investigation and
the ceiling turned out to be the visible symptom of an unbounded one. Deliberately
**deferred** until after the reimport and the price audit, because the reimport is
the burst that will otherwise kill it again.

### 73.1 — what is proven

Both replicas `exitCode: 137`, `reason: OOMKilled`, at 2026-09-28 16:02 UTC, against
a 700Mi limit with a 128Mi request. Prometheus
(`container_memory_working_set_bytes`, 24h) shows this is a **leak, not a high
baseline** — working set climbs monotonically and never returns to the floor:

    openst-…d67lw  543 → 570 → 583 → 602 → 649 → 679 → 692 Mi   (18h, 38 points)
    openst-…dxb2p  613 → 658 → 662 → 666 → 686 → 691 → 698 Mi   (hit the ceiling)
    after restart   423 → 425 → 442 → 684 → 693 Mi             (+240Mi in one step)

A fresh container floors at ~320–423Mi and climbs to the ceiling in roughly 4h under
load (~65 Mi/h). Both replicas died doing the same thing: a per-symbol sweep of
`/equity/logo/…` interleaved with `/fixedincome/search/…`, walking alphabetically
(`CREC.PS`, `CREO.L`, `CRES.BA`, `CREX`, `CRET.ST`), 300–1100ms per call.

**Not a cache.** `src/cache.py` is Redis-backed (`REDIS_DB 2`); there is no
`lru_cache`/`TTLCache` in `src/`. The memory is retained by something in the
request path, and the +240Mi step during a logo sweep says the logo/search path
rather than price bars.

### 73.2 — what is NOT proven, and must not be assumed

- **Which structure retains it.** The step is measured; the cause is not. It could
  be a per-call object graph held by a module-level registry, a provider session
  accumulating cookies/responses, OpenBB's own per-symbol cache, or a
  `ThreadingPoolExecutor` from `src/main.py` holding futures.
- **That the logo path is the cause.** It is what was *running* when both pods died,
  which is correlation. A concurrent price-bar burst would look identical in the
  logs.
- **That 2Gi is enough.** It buys ~3× the time and changes nothing about the shape
  of the curve.

Deliberately **not** done, and why — all three look like fixes and are not:

- **More replicas.** Every process leaks at the same rate. Three replicas raise the
  idle floor to ~1.26Gi and only slow the climb by spreading load.
- **An HPA on memory.** It would add replicas *because* memory is high and never
  converge — the wrong response to a per-process leak, and it would eventually
  exhaust the nodes.
- **Raising the limit further.** It converts a loud OOMKill into a slow node-level
  problem.

### 73.4 — find what retains it

> **Nothing is retained** — measured, not assumed. `MEM_DEBUG=1` is enabled in PROD
> (homelab `8497a46de`); without it the Python-heap-vs-RSS split this section turns
> on does not exist. Idle replica: `rss 376 MiB · traced 1.55 MiB` (**0.4 %**), and
> the top traced sites are interpreter bootstrap, not a cache.

**The split, first.** An idle replica, with `tracemalloc` on:

```
rss 376 MiB · traced 1.55 MiB · traced_fraction 0.0041 · up 70s
top sites: importlib._bootstrap (520 KiB) · _bootstrap_external (421 KiB) ·
          abc (136 KiB) · _asyncio (99 KiB) · linecache (56 KiB)
```

**0.4% of the resident set is Python heap**, and the top sites are interpreter
bootstrap — the import floor, not a leak. §73.2's "not a cache, and no
unbounded container in this repository" is now confirmed from the other
direction. The Python heap stayed **flat at ~10 MiB across every workload
measured** below; >90% of RSS is native throughout.

**The code checklist found one real defect, and it is not the leak.**
`_symbol_currency_cache` was a plain dict keyed on a caller-controlled ticker on
unauthenticated routes — while `_pays_dividend`, twenty lines above, is bounded
to 20 000 with a comment explaining exactly that hazard. Added later for the GBX
fix, never bounded. Fixed (openst `74c6bfb`, 3 tests), and **explicitly not
offered as the cause**: 400 real tickers of a short string is tens of kilobytes
against a curve of hundreds of megabytes — four orders of magnitude away.

**Hypothesis 1 — "it is not a leak, it is a high-water mark that `malloc_trim`
returns".** Plausible: repeat requests cost zero, and only 6-8% of each batch's
growth was Python heap. Made falsifiable by shipping `malloc_trim(0)` per
request and re-measuring the same batch:

| 15-16 fresh symbols, `/equity/logo` | dRSS | dTraced |
|---|---|---|
| v1.1.38, before the fix | **+84.5 MiB** | +7.03 MiB |
| v1.1.39, with `malloc_trim` | **+87.2 MiB** | +7.55 MiB |

**Falsified.** No effect, so the change was **reverted** (`ed90e36`) rather than
shipped. A per-request `libc` call that cannot be shown to help is not a fix.

**The confound that made hypothesis 1 look true.** The "warm batch costs 0.0 MiB"
reading was worthless: openst has its **own Redis cache**, so a repeated symbol
is served without a provider walk at all. That measures cache hits, not
retention. Every retention claim below is measured with a **distinct cache key
per call** (a varying date window) so each call is real work.

**Hypothesis 2 — "it is per-call retention".** One symbol, 20 distinct keys:

```
after 5 calls   rss 481.8    after 10  482.5    after 15  482.8    after 20  482.5
dRSS = +16.6 MiB, of which +16.4 landed on the first few and +0.7 across the
next fifteen. traced flat at 9.9 MiB.
```

**Falsified.** No per-call retention; the cost is a warm-up.

**Hypothesis 3 — "it is per-symbol retention".** Twelve fresh symbols, one at a
time, each a real walk:

```
/price/ohlcv   AAPL +9.3 · MSFT +1.0 · NVDA +0.9 · GOOGL -0.8 · AMZN +2.7 ·
               META +1.4 · TSLA +3.5 · AVGO/ORCL/CRM/AMD/ADBE +1.3 each
/equity/logo   INTC QCOM TXN IBM UBER SHOP JPM BAC WFC GS MS  ->  0.0 MiB each
```

**Falsified, and this is the finding.** The per-symbol cost **converges to
~1.3 MiB and stops**, then goes to **zero** once the high-water mark is already
paid. A later burst of 16 logos, from that same 482 MiB process, cost **0.0 MiB
per symbol** — the space was reused.

**What it actually is.** RSS is a high-water mark set by the **width of a burst
of concurrent provider walks**, and the peak is reused after the burst rather
than re-grown. Roughly 5.4 MiB per concurrent provider walk × the burst width.

**The clean experiment that settles it — and it overturned my own reading above.**
Every figure so far came from batches that started at *different* RSS, so
"+84.5 MiB for 16 symbols" and "0.0 MiB per symbol" were never comparable
numbers. Measured from a genuinely cold pod (scaled 0 then 1, no traffic):

```
cold floor, 46s uptime, no traffic     rss 375.9 MiB   traced 1.61 MiB
one cold /equity/logo NVDA            dRSS   +0.3 MiB
another cold /equity/logo ADBE        dRSS   +0.0 MiB
```

**A single successful provider walk costs ~0.3 MiB, and the next one is free.** So
the +84.5 MiB batch was never "5.4 MiB per symbol". What that batch had that
these do not: **12 of 15 requests returned 200 — three failed**, and a failure
walks the *entire* provider chain (`PROFILE_PROVIDERS` / `SEARCH_PROVIDERS`
fallbacks) before giving up. That is the most expensive path in the service and
it allocates the most before returning nothing.

**So the mechanism, stated properly: the peak is the FAILED multi-provider walk,
paid once per newly-unresolvable symbol.** The negative cache
(`_NEGATIVE_SENTINEL`, `NEGATIVE_TTL = 6h`, `main.py:71-75`) stops the *second*
sight for six hours — it does nothing for the first, and a per-symbol sweep meets
a *new* unknown ticker every time, so each one pays the full chain once and the
arena keeps the resulting high-water.

This also explains §73.1's own observation, which three passes had treated as
suspicious correlation. Both pods died walking `CREC.PS`, `CREO.L`, `CRES.BA`,
`CREX`, `CRET.ST` — obscure listings that resolve on no provider at all. The
correlated path was not "logos" and not "search"; it was **failing to resolve
anything**.

**Nothing here is a leak, and that is why every leak-shaped fix failed.** No
reference is retained; the process holds the largest *failed* walk it has ever
served. The OOMKill is peak-vs-limit, and both obvious leak remedies
(`malloc_trim`, memo bounds) are irrelevant to it.

**The cross-finding worth acting on — §63.9 made this worse, deliberately.**
§63.9's fix raised cachest's `fetch_max_wait` so a queue would "absorb a whole
portfolio sweep", and dropped its `fetch_interval` to 0.2 — a deliberate
increase in *how many* upstream requests openst is asked to have in flight at
once. The measured cost above is per-concurrent-walk, so the change that fixed
the missing price bars (§63.9.3) is also what raised openst's peak. Both replicas
were observed at **1101 MiB and 1368 MiB of the raised 2 Gi ceiling with zero
restarts in 19 h** — the 700→2 Gi raise bought time, exactly as §73.2 predicted,
and the shape is unchanged.

- [x] Reproduce deterministically: the two paths are separable, and neither leaks.
- [x] Bisect inside the path: no per-call and no per-symbol retention; peak scales
      with burst width.
- [x] Check the obvious holders: one real unbounded dict found and fixed
      (`_symbol_currency_cache`), and it is not the cause.
- [ ] **Make a symbol that cannot resolve CHEAP rather than expensive** — check the
      local ticker reference before falling through to a provider chain, and lengthen
      the negative TTL for sweep-shaped symbols.
      > §73.5. A cold-pod walk of a symbol that matches nothing costs **2.7 MiB**; a
      > *real* ticker no provider carries costs **24.61 MiB over 4.13 s** — ~9× — so
      > the expensive case is the one that walks the whole chain before failing.
- [x] Regression test: the **measurement harness** is the durable artefact here,
      not a unit test — a leak test cannot assert on a native high-water mark.
      `GET /__mem` plus a driver that defeats the Redis cache is what made this
      answerable at all, and both are now committed (`memdebug.py` landed in
      `dfede54`, the bound in `74c6bfb`).
- [x] Commit.

### 73.5 — fix, and prove the curve flattens

> §73.4 overturned the premise of this step, so it is re-specified rather than
> executed. The honest position: **there is nothing to flatten.** A leak fix
> would be a no-op, and the plan's own rule — *"Do not paper over it with a
> bigger limit"* — is the reason not to invent one.

**What would actually bound it**, in descending order of honesty:

1. **Stop walking the whole provider chain for symbols that cannot resolve.**
   Measured from a cold pod: a symbol that matches **nothing** costs **2.7 MiB**
   (rejected locally, no chain walked), while a **real ticker no provider carries**
   costs **24.61 MiB over 4.13 s** — the expensive case is the one that walks the
   whole chain before failing, not the one that resolves to nothing. The negative
   cache already covers this route and does help on repeat contact (measured:
   **+0.03 MiB, 0.00 s**); it does nothing on first contact, which is the only
   contact a per-symbol sweep ever has. The fix is to make "cannot resolve" a
   **cheap** answer: check the local ticker reference / bond catalogue before
   falling through to a provider chain, and
   lengthen the negative TTL for the symbol shapes a sweep produces. **This is
   the real fix and it belongs in openst.**
   > Note: `UPSTREAM_MAX_INFLIGHT = 8` (`main.py:81`) already bounds the width,
   > so "bound the burst" is **not available as a new change** — the bound
   > exists and has existed since the 2026-09-20 OOM.
2. **Reclaim the peak between bursts.** `malloc_trim` was measured and
   **rejected** — no effect on the burst number (§73.4). Recording the negative
   result so it is not re-attempted.
3. **Recycle on a memory ceiling.** Works, and is the honest label for what it is:
   mitigation for a peak, not a fix for a leak. Worth doing only if (1) is not
   enough, and it must be said out loud in the commit message, because a restart
   loop that looks like a fix is how this problem gets lost twice.

- [x] Fix the retaining structure, or pin/upgrade the upstream dependency if the
      retention is OpenBB's. → **There is no retaining structure.** Measured, in
      §73.4, three ways.
- [x] Re-run §73.4's measurement from a pod whose rss is at the floor, so the
      per-walk cost is a number rather than a difference between two elevated
      baselines.
      > §73.4. Floor ~366 MiB. A **successful** walk **+5.24 MiB**; a symbol matching
      > nothing **+2.7 MiB**; a *real* ticker no provider carries **+24.61 MiB over
      > 4.13 s**; the negative-cached repeat **+0.03 MiB**. The last one confirms the
      > negative cache, and the second is cheaper than the third — so cost tracks how
      > far the chain gets, not whether it fails.
- [ ] Then reconsider the limit downward — 2 Gi is headroom for bursts, not a
      target to keep.
      > §73.4. The per-walk cost is measured but the **aggregate** is not: `367 + 8x25`
      > is ~570–670 MiB, while live replicas were observed at **1101 and 1368 MiB**.
      > The ~500–800 MiB gap is unexplained, so the limit stays at 2 Gi until a
      > sustained-load measurement closes it.
- [ ] Add an alert on working set **approaching the limit** (~80%), not on growth
      rate — the failure mode is a peak, so a growth-rate alert fires on the sweep
      and misses the OOMKill.
      > §73.5. On the current curve this would have fired hours before both OOMKills.

---

## 78. Everything that needs YOU (2026-10-01)

Consolidated from the places it was scattered. Four items, all of them actions
only the portfolio owner can take — three are edits to the source spreadsheet, one
is a decision. Nothing here is a queue I can grind through, and each one blocks
work that is otherwise ready.

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

- [ ] Add the row above, re-import, confirm the unfunded-portfolio finding clears
      and `invested` stops being 0
      > **Then:** I re-measure XTB's worst single-day move (flow-adjusted) and
      > re-run §65.1's −25% bar across all ten.
- [ ] Decide whether XTB's `Gotówka` column should exist at all
      > Not blocking. The recon (§63.4) derives cash from the ledger, so the row
      > above is sufficient; a `Gotówka XTB` column would only make the recon
      > cross-checkable for this one account.

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
      > §78.1.

---

## 79. Fundamentals tab: `FCF / Share` is broken twice, and the statements have no currency or source (2026-10-02)

Two data-integrity defects found while assessing fonrex as a source of European
fundamentals. Not a proposal — these came out of the provider analysis, and both
are wrong *today* in PROD, independent of anything we add. Touches the frontend
(`portfoliost`), the instruments service, and the contracts repo.

Context that makes §79.2 the more serious of the two: `GET /api/instruments/
{symbol}/fundamentals` fires **three independent** `fetchFundamentals` calls
(`portfoliost-instruments/src/routes/instruments.ts:1090-1094`), one per
statement, and each walks `STATEMENT_PROVIDERS = ["fmp","yfinance","polygon",
"sec"]` separately (`openst/src/openbb_client.py:18`, first-non-empty). One
instrument can therefore return income from `yfinance` and balance from `polygon`,
in different currencies and units, merged into one response by
`toFundamentals()` (`src/adapters/translate.ts:544`) that records no provenance.
`FundamentalsData` (`openapi.yaml:649-705`) has **no `currency` field and no
`sources` field**, and the tab renders every value through `formatCompact` with
no currency symbol. A GPW name in PLN and a US name in USD are indistinguishable
on screen. §79.2 gets worse with every provider we add, which is why it is
sequenced before any Tier 1 fundamentals work.

### 79.1 — `FCF / Share` renders as a percentage and is never populated

Two independent faults stacked on one column.

**a. Wrong unit.** `ResearchFundamentals.vue:47` lists `freeCashFlowPerShare`
alongside the genuine ratios in the percent branch of `cell()`:

```
if (key.toLowerCase().includes("growth") || key === "netIncomeMargin" ||
    key === "debtEquityRatio" || key === "freeCashFlowPerShare") {
  return `${v.toFixed(1)}%`
}
```

`freeCashFlowPerShare` is currency-per-share, not a ratio. `$33.67` renders as
`33.7%`. Its three siblings in that branch (`netIncomeMargin`,
`debtEquityRatio`, and any `*growth*`) are real ratios.

- [ ] **Drop `freeCashFlowPerShare` from the percent branch of `cell()`** in
      `src/modules/instruments/ResearchFundamentals.vue:47`, leaving the three
      real ratios. It then falls through to the numeric ladder
      (`formatCompact` ≥1e6 → `toLocaleString` ≥1000 → `toFixed(2)`), which is
      correct for a per-share amount in the instrument's currency.
- [ ] **Add a unit test** that asserts `cell()` returns `"33.67"`, not
      `"33.7%"`, for `freeCashFlowPerShare: 33.67`, and still returns a
      percent for `netIncomeMargin: 12.5`.
      > `cell()` is currently not exported and has no test file. Export it (or
      > extract to `src/modules/instruments/fundamentalsFormat.ts` alongside
      > `compareMetrics.ts`) and cover all four percent-branch keys plus the
      > three ladder thresholds. Tests: `npm run test` green; `npm run build`
      > (includes `vue-tsc --noEmit`) green.

**b. Never populated.** The `cashFlow` mapper in `toFundamentals()`
(`src/adapters/translate.ts:596-616`) builds its row object explicitly and
contains **no `freeCashFlowPerShare` key**. Against the real
openst/cachest backend the column is permanently `—`. It only looks correct in
e2e because the mock seed carries it (`mocks/shared/data/research/AAPL.json`,
written by `scripts/regen-seed.mjs:205`) — a mock-only artefact masking the gap,
which is exactly why it survived.

- [ ] **Emit `freeCashFlowPerShare` in the cash-flow mapper**, keyed by fiscal
      year against the income statement's share count:
      `freeCashFlowPerShare = freeCashFlow / dilutedSharesOutstanding`, joining
      the two arrays on `year` (the income mapper already computes
      `dilutedSharesOutstanding` from `diluted_average_shares` /
      `weighted_average_shares_diluted`, `translate.ts:569`).
      > A year join, **not** a positional one: the three statements arrive from
      > independent provider calls with independent period coverage, so
      > `income[i]` and `cash[i]` are not guaranteed to be the same year. Guard
      > the division (undefined or 0 shares → `undefined`, never `NaN`/`Infinity`),
      > and prefer `diluted_average_shares` over the basic count for
      > consistency with `dilutedSharesOutstanding`.
- [ ] **Test the mapper** in `src/adapters/translate.test.ts`: aligned years
      produce the quotient; mismatched or missing years produce `undefined`,
      never `NaN`; a zero share count produces `undefined`.
- [ ] **Drop the value from the mock seed** so it stops masking regressions, or
      keep it and add an assertion that the real mapper path produces the same
      number for the seeded fixture.
      > Prefer removing it: the seed is what let (b) ship unnoticed. If it stays,
      > `regen-seed.mjs:205` must stop being the only source of the field.
      > Tests: `npm run test:mock` and `npm run test:e2e` green.
- [ ] **Commit** `fix(instruments): emit and correctly format freeCashFlowPerShare`
      > Split from 79.1a so the mapper and the formatter are independently
      > revertable — a bad join is a data bug, a bad format string is cosmetic.

**Related drift found alongside, not in scope here:** `openapi.yaml:685-689`
declares `totalCapitalization`, `longTermDebtToCapitalization` and
`totalDebtToCapitalization`, which `toFundamentals()` never emits and the tab
never renders; `balanceSheet.cash` (`openapi.yaml:680`) is emitted at
`translate.ts:580` and never rendered; `cashFlowFromOperatingActivitiesGrowth`
is computed at `translate.ts:611`, declared at `openapi.yaml:701`, and read by
no component. Separately, the tab hard-codes `period=annual`
(`routes/instruments.ts:1091`) with no quarter or year-range control, unlike
every sibling research tab. Log these against §78 rather than expanding §79.

### 79.2 — Statements carry no currency and no source provenance

Decide between labelling and pinning, then implement the chosen one. Both close
the defect; they differ in cost and in what they promise the user.

- [ ] **Record which of the two this section implements**, in a
      `Design decisions (resolved)` note under this section.
      > The two are not exclusive, but they are different scopes. *Label*
      > adds `currency` + `sources` to `FundamentalsData` and is honest about
      > what the data is: mixed-provider, single-currency-as-reported. *Pin*
      > resolves one provider per instrument, requests all three statements from
      > it, and can then legitimately claim a single consistent basis — at the
      > cost of losing statements the pinned provider does not carry (yfinance
      > has no balance sheet for some GPW names, so pinning can turn a
      > partially-filled table into an empty one).
- [ ] **Add `currency` and `sources` to `FundamentalsData`** in
      `../portfoliost-contracts/contracts/openapi.yaml`, as
      `sources: { incomeStatement, balanceSheet, cashFlow }` carrying the
      provider name per statement, `currency: string`, and `currencySource`
      mirroring the existing `CurrencyResolution["currencySource"]` vocabulary
      (`provider` / `estimated` / `unknown`, `src/services/instrument-currency.ts:265`).
      > Reuse that resolver, do not invent a parallel currency path: the route
      > already calls `resolveCurrency(db, symbol, profile.currency, exchangeHint)`
      > for `/profile` (`routes/instruments.ts:366`), and §71's venue-country
      > fallback is what makes it correct for a venue-qualified symbol with no
      > listing in `ticker_reference`. Threading `exchangeHint` here closes the
      > same class of defect §72.4 documents.
- [ ] **Regenerate types** with `npm run gen:types` from
      `../portfoliost-contracts/contracts` (not the repo root), then populate
      the new fields in `toFundamentals()`.
      > `toFundamentals(income, balance, cash)` currently receives only three
      > row arrays. It needs the resolved currency and the three provider names,
      > so either widen its signature or lift the merge into
      > `routes/instruments.ts:1090-1094`, which is where the per-call provider
      > identity is actually known.
      > `openst` does not report which provider satisfied a walk today
      > (`openbb_client.py` returns rows only), so provider identity has to come
      > from `request.state`-style plumbing in openst or from cachest response
      > metadata — **inspect `cachest/config.yaml:251-258` for what it forwards
      > before choosing**. Do not guess this shape.
- [ ] **Render the currency in the tab** — a currency label on each of the three
      cards, plus a visible source marker when the three statements disagree on
      provider.
      > `ResearchFundamentals.vue:43-55` `cell()` has no currency argument today;
      > the label belongs at card level, not per cell, to avoid repeating a
      > symbol on 30 values.
- [ ] **If pinning instead of labelling**: resolve the provider once per
      instrument, pass it to all three `fetchFundamentals` calls, and record the
      choice so it is stable across the 24 h cachest TTL
      > (`cachest/config.yaml:251-258`, `cache_ttl 86400`,
      > `stale_ttl 2592000`) rather than re-resolved per request — a per-request
      > pin would flip providers mid-table on a cache miss, which is the same
      > defect with a shorter fuse.
- [ ] **Tests**: contract schema test for the new fields; `toFundamentals` test
      asserting `sources` matches the providers actually used and that
      `currencySource` is `"estimated"` (not `"provider"`) when the answer comes
      from the venue; a component test that a mixed-source response renders the
      disagreement marker. `npm run test` and `npm run build` green.
- [ ] **Commit** `feat(instruments): expose statement currency and provider provenance`
