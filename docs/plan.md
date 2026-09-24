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

Proposal: — (user request 2026-09-24; no proposal doc — example-service parity per AGENTS.md).

The instrument calendar (research page, §49.9) is live; the portfolio
**Calendar** tab is a flat Upcoming/Recent events *table* fed by
`GET /api/portfolios/:id/calendar` — the wallets route is a stub
(`c.json({ events: [] })`), and the SPA's `PortfolioCalendarTab.vue` renders
`upcoming`/`past` shapes the real endpoint never returns. Example service's
portfolio calendar (inspected live 2026-09-24, `/pl/portfolios/<id>/calendar`) is
a **month grid**: toolbar `Calendar ‹ May 2026 › | (Impact) | All events ▾ | Today`,
SUN–SAT columns, day cells with small event chips (e.g. `AAPL Ex-Div: $0.26`),
and a premium gate. Parity target: the month grid over the portfolio's
holdings' events, **not gated** (AGENTS.md: premium features ship as working
content), **no Impact toggle** (abandoned — see Design decisions). Event
source = fan-out to the per-instrument calendar that §49.9 shipped
(openst/cachest/instruments unchanged — no provider-tier work).

Repos touched: `portfoliost-contracts` (54.1), `portfoliost-wallets` (54.2),
`portfoliost` SPA + mock (54.3–54.5). The mock endpoint
(`mocks/portfolios/index.js` `loadResearch`-based) already serves the flat
upcoming/past shapes and is kept unchanged (54.1's shape stays additive).

Example service observations to keep honest (2026-09-24 capture in
`/tmp/example-service_pf_calendar.png`): the "All events" dropdown also mixes in
macro-economic events (ISM, CPI, FOMC…) and holidays (Memorial Day) — those
are NOT holdings events and are out of scope here (Design decisions). Chip
format is `SYMBOL <Type>: <amount in instrument ccy>`.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass
(unit + docker-compose level).

---

### 54.1 — contracts: per-holding calendar in `CalendarData`

- [x] `contracts/openapi.yaml` — `CalendarData` gains `holdings` (additive;
  `upcoming`/`past` stay for the mock and any flat consumers):
  ```yaml
  holdings:
    type: array
    items:
      type: object
      required: [symbol]
      properties:
        symbol: { type: string }
        companyName: { type: string }
        currency: { type: string }
        earnings:   # same item shape as CalendarData.earnings
        exDividend: # same item shape as CalendarData.exDividend
        dividend:   # same item shape as CalendarData.dividend
  ```
  (item shapes reuse the existing `earnings`/`exDividend`/`dividend` item
  objects verbatim — factor into named sub-schemas if the spec tooling
  requires it; wallets/SPA types are contract-typed per AGENTS.md, no local
  redefinitions.)
- [x] Push → CI patch-bumps → `NODE_AUTH_TOKEN=$(gh auth token) npm install
  @marx2/contracts@<new>` in `portfoliost` + `portfoliost-wallets` →
  `npm run gen:types` (SPA) / regenerate (wallets) → contracts suite green.
- [x] Tests: contracts suite (`npm test` in `portfoliost-contracts/contracts/`).
- [x] Commit (contracts) + consumer bumps (one commit per repo).

### 54.2 — wallets: real `GET /:id/calendar` via instruments fan-out

- [x] New `src/services/portfolioCalendar.ts` — clone the `portfolioNews.ts`
  pattern: `getPortfolioSymbols` (distinct open positions) + per-symbol
  `fetch(`${INSTRUMENTS_URL}/api/instruments/${symbol}/calendar`)` (bounded
  fan-out, `Promise.allSettled`, per-symbol failure → skip symbol, never 500;
  pass through `Authorization`).
- [x] `src/routes/portfolios.ts` `/:id/calendar`: return `holdings` shape from
  the service (each entry: `symbol`, `companyName` (from `positions`),
  `currency` (from the instruments calendar response — the §47.5 resolved
  instrument currency, no fallback), and the three arrays within the
  instruments window; symbols whose fetch failed are omitted). Keep the
  endpoint `200` with `holdings: []` when the portfolio has no open
  positions or instruments is unreachable.
- [x] Unit tests (`portfolioCalendar.test.ts`, mocked `fetch`): (a) two symbols
  → two holdings with their arrays + currencies; (b) one fetch 502 → that
  symbol omitted, others intact; (c) no open positions → `holdings: []` and
  zero fetches; (d) `INSTRUMENTS_URL` unset → `holdings: []` (1:1 degrade,
  same rule as `instruments-fx.ts`).
- [x] Full wallets suite green (`npm run test`) + `npm run build`.
- [x] Commit.

### 54.3 — SPA: month-grid `PortfolioCalendarTab` (example-service layout)

- [x] Rewrite `src/modules/portfolios/PortfolioCalendarTab.vue` as the example-service
  month grid (per `docs/COMPONENTS.md`): toolbar row inside a `card` —
  "Calendar" label, ‹/› month buttons, "May 2026"-style month label, an
  event-type filter ("All events" / "Earnings" / "Ex-Dividend" / "Dividend
  payment" — plain `<select class="input">`, `testid="pf-cal-filter"`), and a
  **Today** button (`btn-secondary`). **No "Impact" control** (example-service has one;
  abandoned — no behavior defined, no decoration). Grid: `grid-cols-7` header
  SUN–SAT +
  42 day cells (6 weeks; prev/next-month days muted); today outlined; event
  chips per day (max ~3 visible + "+N more"; chip = `SYMBOL <Type>: <amount>`
  with `tabular-nums`, amounts formatted via `formatAmount(amount,
  holding.currency)` — the **instrument's base currency, never converted** to
  the portfolio ccy, per the resolved decision). Chip colors per type
  (earnings = blue, ex-dividend = amber, dividend payment = green — same
  mapping as today's `badgeClass`, with `dark:` variants). Clicking a symbol
  chip links to `research-overview` (existing pattern). Empty state: grid
  still renders; below it "No events in this month." testids: `pf-cal-prev-month`,
  `pf-cal-next-month`, `pf-cal-today`, `pf-cal-grid`, `pf-cal-filter`; the
  old table testids are dropped with the table — update
  `tests/e2e/portfolios.spec.ts` calendar expectations in the same commit.
  No macro-economic events or holidays are rendered (holdings events only).
- [x] Flat-shape compat: if `holdings` is absent (mock returns
  `upcoming`/`past`) the component derives holdings-shaped data from the flat
  arrays (group by symbol; no `currency` → omit amount) so the mock-backend
  dev path and 54.3's unit tests work without the real endpoint. The mock
  itself is untouched.
- [x] Vitest (`tests/unit/modules/portfolios/PortfolioCalendarTab.test.ts`):
  month navigation (prev/next changes the month label + rendered day set),
  Today resets, filter hides other types, chip count cap + "+N more",
  flat-shape derivation path; toolbar renders no "Impact" control.
  No macro events in any rendered output (fixture-driven).
- [x] `npm run build` + `npm run test` + `npm run test:mock` green; commit.

### 54.4 — E2E: calendar grid on a seeded portfolio (compose stack)

- [x] Playwright (docker compose, real wallets + live instruments): open a
  seeded portfolio → Calendar tab → expect `pf-cal-grid` with 42 day cells
  and the "All events" select; ‹/› navigation changes the month label; if
  the provider stack yields no rows for the seeded holdings (fmp-only,
  §49.9 fragility) the month still renders + empty state (no hard failure —
  same provider-skip convention as `research.spec.ts` chart tests); when
  rows exist, at least one chip is visible and links to research.
- [x] `npm run test:e2e` green; commit.

### 54.5 — Closeout

- [ ] Dev docker-compose smoke: seeded multi-holding portfolio → real
  endpoint returns `holdings` for ≥1 symbol with the instruments currency;
  grid renders its chips on the right days (verify dates by hand once —
  ex-date chips on `exDividend` rows, not payment dates).
- [ ] PROD (with user approval if a SPA pin bump is needed): Playwright
  against `https://portfoliost.k.homylab.com` — Calendar tab shows the month
  grid (not the table), navigation works, no paywall, no Impact control.
- [ ] Archive §54 to `plan-archive.md`.

**Design decisions (resolved 2026-09-24 by the user):**

- **"Impact" toggle abandoned** — example-service shows it (premium-gated, no visible
  behavior); we ship no Impact control at all, not even as decoration.
- **Chip amounts stay in the instrument's base currency** — never converted
  to the portfolio base ccy (example-service does the same; e.g. `$0.26` in a PLN
  portfolio). No D27 FX leg on this surface.
- **No macro-economic events or holidays** — holdings events only (example-service
  mixes in ISM/CPI/FOMC + holidays; no provider tier exists for macro).
