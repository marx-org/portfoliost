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

- [ ] `src/services/instrument-currency.ts` — in the un-suffixed branch (no
  exchange hint), fetch up to 10 `searchTickerReference` rows and, among rows
  whose `ticker` exactly equals the route symbol, count distinct `exchange`
  values: **>1 → return null** (silence); exactly 1 → resolve as today.
  Venue-qualified path (suffix → exchange → exact listing) and the
  bond/fund short-circuit are untouched.
- [ ] Unit tests (`instrument-currency.test.ts`): (a) AMD-shaped collision —
  exact `AMD` rows on ASX + NASDAQ + NEO + TASE, no suffix → `null`; and
  `resolveCurrency` with provider-declared USD → `{ USD, "provider" }`, not
  `{ AUD, "estimated" }`; (b) a single-listing ticker still resolves via
  country code; (c) venue-qualified `SNT.WA` with a cross-exchange `SNT`
  collision still resolves to the WSE row (regression guard, §49.9
  follow-up); (d) bond/savings short-circuit unchanged.
- [ ] Full instruments suite green (`npm run test`) + `npm run build`.
- [ ] Commit.

### 56.2 — release + PROD verify

- [ ] Push → GHA patch-bump (pin the **real** tag from `gh release list`) →
  bump the pin in the homelab instruments helmrelease — **all 4 occurrences**
  (app + tickersync + corpbondsync + fxsyync cronjobs).
- [ ] Flux + kubectl verify (`KUBECONFIG=$HOME/.kube/homylab`); if the RWO
  logos PVC multi-attach stalls the rollout (known gotcha), scale the
  deployment to 0, wait, scale back to 1.
- [ ] Playwright PROD: a portfolio holding un-suffixed AMD →
  `GET /api/portfolios/:id/calendar` returns `currency: "USD"` for the AMD
  holding (and the Calendar tab renders accordingly); the AMD research chart
  still renders (default load = no conversion); an explicit display-currency
  selection on AMD shows the §48.2 400 error state, not a silently converted
  series.
- [ ] Commit (plan closeout) + archive §56.

**Open question (decide before 56.2):** is silence → the §49.6 USD fallback
sufficient, or do we also want **precise disambiguation** — wallets' calendar
fan-out passes the position's `companyName` as a hint (`?company=`) and the
resolver prefers the exactly-matching name row among colliding tickers? The
hint variant fixes the rare non-US un-suffixed collision (e.g. a foreign
ticker imported bare from IBKR) that the USD fallback would get wrong; it
touches wallets + instruments (new API param), so it would land as a separate
step if wanted.
