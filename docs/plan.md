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
