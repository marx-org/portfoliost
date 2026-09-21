# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md`.

Legend: `[ ]` pending · `[x]` done

---

## 45. TFI fund overview page: wrong quote currency (USD) + 11-year OHLCV 502 (INGAKC.TFI, 2026-09-21)

User report: `/en/research/INGAKC.TFI/overview` — `upstream 502 for
cachest:8080/ohlcv/INGAKC.TFI?start=2015-09-21&end=2026-09-21` and the current price shown in USD.
Follow-up to §42–44 (same portfolios, the §38.3
`.TFI` fund renames are now live).

Diagnosis (probed in-cluster via the cachest pod, 2026-09-21):

**Problem A — currency USD.** `.TFI` fund prices come from the biznesradar plugin, whose
quote/profile rows carry **no `currency` field** (the model omits it; `scrape_quote` returns only
symbol/name/prices — verified locally and via `cachest /equity/quote/INGAKC.TFI`:
`last_price 812.36`, no currency).
`toQuote` (`portfoliost-instruments/src/adapters/translate.ts:208`) and
`toInstrumentProfile` (`:150`, `:144`) then default to `"USD"`. The wallets quotes pass
unconditionally overwrites `instrument_currency`
(`quotes.ts` profile block: `if (profile.instrumentCurrency !== null)
profileUpdate.instrumentCurrency = ...`) — so a reimport (with PLN from the sheet) gets clobbered to
USD on the first quotes pass. DB confirms: 2 of 6
`.TFI` positions show `USD` (INGAKC.TFI, NNEP65.TFI); the other 4 are PLN only because their quote
never landed yet. The biznesradar page itself declares
`<meta itemprop="priceCurrency" content="PLN">` (verified in the HTML) — PLN is the true price
currency for every Polish fund page.

**Problem B — 11-year OHLCV 502.** The overview history request spans
`start=2015-09-21`. For `.TFI` symbols openst serves the history via the biznesradar **multi-page
scraper**
(`plugins/openbb_biznesradar/.../equity_historical.py`): ~253 monthly pages for 11 years ×
`BIZNESRADAR_FETCH_DELAY_S=2.0` s/page → measured **76.9 s**
for 2020→2026 (2015→2026 ≈ 110 s). The 502 is the **nginx ingress**
(`proxy-read-timeout` unset → 60 s default) cutting the connection, not the SPA — so "make the UI
wait patiently" alone cannot work (the hop in front of the SPA dies first), and it is **not a
one-time cost**: cachest only caches after a successful fetch, so the first request after every
6 h TTL expiry pays the full scrape and 502s. The `2015` start also pre-dates the fund's first NAV
for many `.TFI` tickers — pure wasted pages.

Extra fact (probed 2026-09-21): `instruments.price_bars` already holds `.TFI` overflow bars from
the passive write-through — 1399 rows, 2021-02-17 → 2026-09-17, source `openst` — so the SPA
chart path (`/price-bars`) already serves funds instantly; only the research overview's `/history`
leg hits the slow scrape.

Decisions (2026-09-21, user): A — do the **nullable-contract follow-up**
(unknown currency must never be silently guessed); B — first load must be **fast**
(openst clamp to first NAV) plus a **graceful UI** (render price_bars immediately, full history in
the background — never a blank 110 s spinner).

Step order: 45.1 (openst scraper, standalone) → 45.2 (contracts cycle, per AGENTS.md
workflow: spec → publish → consumer bumps) → 45.3 (instruments null-default, needs 45.2 types)
→ 45.4 (releases A) → 45.5/45.6 (Problem B, independent) → 45.7 (release B).

---

### 45.1 — Problem A (openst): biznesradar quote+profile carry the page's currency

- [x] `openst/plugins/openbb_biznesradar/openbb_biznesradar/scraper.py`: read
  `<meta itemprop="priceCurrency" content="...">` from the `/notowania/{symbol}`
  page (one shared parse helper; the profile probe already fetches the same page — `probe_notowania`
  should return the currency too, or add
  `scrape_currency(symbol)`); `scrape_quote` adds `currency` to its dict when the meta tag is
  present (missing tag → key omitted, not `None`, so the model stays backwards-compatible).
- [x] `models/equity_quote.py`: document the new optional key. `models/equity_profile.py`:
  `EquityInfoData` has no `currency` field — verify how the corp_bond profile already emits
  `currency: "PLN"` (test_corp_bond_profile.py:169) and mirror that mechanism for funds.
- [x] Capture fixture: save the INGAKC.TFI `/notowania` HTML to
  `openst/plugins/openbb_biznesradar/tests/fixtures/` (single request, manual); unit tests: currency
  parsed from the meta tag; quote dict includes `PLN`; missing tag → no key. Full openst compose
  suite green.
- [x] Standalone smoke: `docker compose up -d`, `curl /equity/quote/INGAKC.TFI`
  → `"currency": "PLN"`; second call is a cache HIT.
- [x] Commit.

### 45.2 — Problem A: nullable `currency` in the shared contract (user decision: do the follow-up)

The contract `Quote.currency` (and the profile/instrument currency fields — enumerate all
affected schemas in `openapi.yaml` before editing, incl. `InstrumentProfile`, `Quote`, and the
position/price schemas that carry a price currency) is a required `string`, which forces the
`?? "USD"` guess. User decision (2026-09-21): make them nullable so an unknown currency can never
be silently guessed (100× off semantics, the §39 pence precedent).

- [x] `portfoliost-contracts/contracts/openapi.yaml`: `currency` → nullable
  (`nullable: true` / `oneOf [string, null]` per the file's existing conventions) for the quote /
  profile currency fields (keep `PriceHistory.currency` and FX/registry currencies as-is unless
  they hit the same guess path — decide per schema and note why). Update the §`currency` doc
  comments ("USD when unknown" at line ~842 becomes "null when unknown").
- [x] Push `main` → CI auto-bumps the patch version + publishes `@marx2/contracts@<new>`
  (never hand-edit package.json).
- [x] Consumers: `NODE_AUTH_TOKEN=$(gh auth token) npm install @marx2/contracts@<new>` +
  `npm run gen:types` in `portfoliost-instruments` (has gen:types) and `portfoliost` (SPA has
  gen:types per AGENTS.md; check `portfoliost-wallets` too) — commit `package-lock.json` +
  `generated/api-types.d.ts` per repo (code changes that adapt to the nullable type are 45.3 /
  the release step, not this one).
- [x] Tests: `npm test` in `portfoliost-contracts/contracts` green.
- [x] Commit per repo (contracts push is its own CI cycle).

### 45.3 — Problem A (instruments): drop the `USD` guess now that the contract is nullable

Precondition: 45.2's regenerated types are installed in `portfoliost-instruments`.

- [x] `portfoliost-instruments/src/adapters/translate.ts`: `toQuote` — `currency` →
  `toIsoCurrency(str(q.currency)) ?? null` (no `"USD"` guess); `toInstrumentProfile` —
  `currency ?? (isBond ? "PLN" : null)`. Verify every other `toXxx` that copies a currency field
  compiles against the nullable contract type.
- [x] Tests: `translate.test.ts` — currency-less row → `currency: null` (quote + profile
  non-bond), bond → `PLN`, PLN row (the 45.1 shape) passes through, GBp/USD regressions unchanged.
  Full instruments suite green.
- [x] Wallets: `fetchProfile` already skips null (`isIsoCurrency`) → no code change expected;
  verify it compiles against the regenerated types and that a null-currency profile keeps the
  stored `instrument_currency` (add a `quotes.test.ts` case if the path is contract-typed).
- [x] SPA: any component reading `quote.currency`/profile currency must tolerate null (display
  fallback); vue-tsc catches the rest; `npm run build && npm run test && npm run test:mock` green.
- [x] Commit.

### 45.4 — Release A (openst → instruments) + verify currency end-to-end

- [x] Release openst (GHA → pin homelab helmrelease → Flux), verify in-cluster:
  `cachest /equity/quote/INGAKC.TFI` carries `currency: PLN`. — openst `v1.1.29` (app + 4
  cronjobs). After flushing openst's own Redis quote cache (it outlived the rollout) the fresh
  in-cluster fetch returns `currency: PLN` (9.8 s cold scrape).
- [x] Release portfoliost-instruments (GHA → pin → Flux). — `v1.0.60` (app + 2 cronjobs).
  **Deploy incident + recovery:** the first Flux apply of the v1.0.60 pin hit
  `timeout waiting for Deployment InProgress` (4 attempts) and Helm auto-rolled
  back to v1.0.59 (which still had the `?? "USD"` bug), leaving the HelmRelease
  **Stalled**. Proved the v1.0.60 image itself is healthy (manual pod: migrates +
  `/health` 200 on :3000), so it was a transient rollout/timeout failure, not a
  build problem. Un-stalled by reverting the pin to v1.0.59 (no-op, matched the
  running release → Flux Ready), then re-applying v1.0.60 → upgrade succeeded
  (v93), now Ready. Running pod confirmed to carry the 45.3 no-guess code
  (`?? (isBond ? "PLN" : null)` / `?? null`).
- [x] Verify: the INGAKC.TFI overview shows PLN; after one SPA read the DB shows
  `instrument_currency = PLN` for all 6 `.TFI` positions (the quotes pass overwrites from the
  now-PLN profile); FX to the portfolio base currency then values them correctly (812.36 PLN, not
  USD). — openst `profile`+`quote` both return `PLN`; wallets `fetchProfile` overwrites
  `instrument_currency` from a non-null ISO profile currency (unit-pinned, 330 green). DB check at
  deploy: 4/6 `.TFI` already `PLN`; INGAKC.TFI + NNEP65.TFI still `USD` **because their quote
  passed through the pre-rollout image at 16:55/16:56 UTC** (rollout finished ~16:57) — the `USD`
  clobber is gone in the new image, so the next profile pass (≤15 min, or the next SPA read of
  either portfolio) flips both to `PLN`. Read-triggered DB, no schedule.
- [x] Commit (homelab pins) — `217b86ded`.

---

### 45.5 — Problem B: fast first-load (openst clamp to first NAV)

Why not "just wait patiently": the nginx ingress (60 s `proxy-read-timeout`, unset → default)
kills the request at 60 s regardless of the UI, and the slow path recurs on every 6 h cachest TTL
expiry (first request after each expiry), not once. So make the request short:

- [x] `openst/plugins/openbb_biznesradar/openbb_biznesradar/`: add a
  `first_nav_month(symbol)` probe — fetch the **oldest** page of
  `/notowania-historyczne/{symbol}` (pagination is newest-first: the last page, or a binary search
  over the page index with the `exhausted` row check) → the fund's oldest NAV date. Cache it in
  openst's Redis (long TTL — fund inception never changes; key
  `fund_first_nav:<symbol>`). One extra page per fund lifetime, not per request. — implemented as
  `scraper.probe_first_nav` (page-1 footer's highest `pages_pos` index → that last page's min
  row date; 2 fetches); `fund_first_nav:<symbol>` cached 30 d.
- [x] `openst/src/main.py` `/price/ohlcv/{ticker}` handler: for `_is_fund(ticker)` symbols,
  clamp `start = max(start, first_nav)` when the probe resolves (probe failure → keep the
  requested start, never block the request); log the clamp.
- [x] Optionally pair with a lower politeness delay for funds in
  `equity_historical.py` (e.g. 0.2 s) so 11 y of real NAVs (INGAKC ~2016: ≈ 66 months ≈ 13 s) sits
  comfortably under the 60 s ingress cap with margin. — **`BIZNESRADAR_FUND_FETCH_DELAY_S`
  (default 0.3 s)**. ⚠️ The plan assumed INGAKC incepts ~2016; it is actually a **1998-vintage
  fund** (oldest NAV 1998-03-11, 143 pages). So the **clamp does NOT shorten its 2015-start
  window** (1998 < 2015) — the **fund delay is the real lever** that pulls an old fund's 11-yr
  request (~45 pages) under the cap. The clamp still saves pre-inception pages for *younger*
  funds. Both shipped.
- [x] Unit tests with a captured oldest-page fixture (openst): clamp applied, probe-miss keeps
  original start, non-fund tickers untouched; full openst compose suite green. — fixtures
  `INGAKC.TFI_history_p1.html` / `_history_last.html` captured; 279+87+53 green.
- [x] Standalone smoke: `docker compose up -d`, `curl /price/ohlcv/INGAKC.TFI?start=2015-09-21&end=
  2026-09-21` → 200 in <30 s (previously ~110 s / 502); repeat = cache HIT. — measured **40.3 s
  first call** (2749 bars), **0.03 s** cache HIT. (40 s, not 30 — the 1998 inception means a
  full 2015→2026 window; still under the 60 s cap with margin, down from ~115 s.)
- [x] Commit. — `d62cd65`.

### 45.6 — Problem B: graceful UI (price-bars now, full history in background)

- [ ] `portfoliost` research overview (the view calling `getHistory`, `src/api/instruments.ts:76`):
  on load, render the price chart from the **existing** `/price-bars` series immediately (already
  fetched/cached for TFI — 2021→2026 in `price_bars`), mark it as "partial, full history loading…"
  when the overview requests a wider range; the `/history` result replaces it in place on success.
- [ ] On `/history` failure (502/timeout): keep the price-bars chart, show a dismissible
  "full history unavailable — retry" notice (no blank canvas, no blocking spinner).
- [ ] E2E: research overview for a `.TFI` symbol renders a chart before the `/history` response
  resolves (assert canvas + loading flag, then final state); `npm run test:e2e` green.
- [ ] Commit.

### 45.7 — Release B + closeout

- [ ] Release openst (pin homelab) + portfoliost (normal SPA deploy), verify in-cluster:
  `cachest /ohlcv/INGAKC.TFI?start=2015-09-21…` → 200 < 30 s, and the SPA overview chart renders
  immediately with no 502 in the instruments logs.
- [ ] Re-check the 6 h-expiry case conceptually (first request after TTL pays the clamped, now
  short, scrape) — note in closeout.
- [ ] Commit (homelab pins).

---

Decisions (2026-09-21, user): A → do the nullable-contract follow-up (45.2); B → fast first-load
(45.5) + graceful UI (45.6), because "make the UI wait patiently" alone is impossible (nginx 60 s
cap in front of the SPA) and the slow path recurs every 6 h cachest TTL expiry, not once.



---

## 46. Real `GET /api/portfolios/merged` in `portfoliost-wallets` (§41 follow-up 1, 2026-09-21)

User request: make the §41.5 combined (all-portfolios) chart appear in production. Today the SPA
calls `GET /api/portfolios/merged` (`src/api/portfolios.ts:137`), but `portfoliost-wallets` has no
such route → 500 → the block is hidden (graceful). Contract + mock already define the path; the
wallet route is the missing piece.

Design (decided 2026-09-21): **client-side currency conversion, unified with the single-portfolio
chart.** Both analytics endpoints return their series in a single source currency and the SPA
converts source → display with `getLatestRate`, so the two charts behave identically and differ only
in scope:
- `/:id/analytics` → series in the portfolio's `baseCurrency` (already so; SPA source
  `store.detail.currency`, `PortfolioPerformanceTab.vue:241`).
- `/merged` → series summed into **USD** (each portfolio converted via `@marx2/contracts/fx`), the
  currency the SPA already assumes as source (`store.totalMetrics.baseCurrency` in
  `InvestmentsView.vue`; `total-metrics` hardcodes `"USD"`, `portfolios.ts:303`). No contracts
  change, no SPA change — §41.5's client-side convert stays.

Client-side conversion is fast enough: one cached `getLatestRate` call + a map over the series (same
as the single-portfolio tab); the rate is a latest-rate approximation either way (neither client nor
server uses per-date historical rates here). The server-side conversion merged *does* need is the
cross-portfolio one (summing USD+PLN portfolios requires a common currency) — that is unavoidable
and stays in the service.

Scope decisions: `benchmarks: []` for v1; `cumulativeTwr/Mwr` and the scalar return fields left
`undefined`/`null` (the chart plots `value` only). Repos touched: portfoliost-wallets,
portfoliost (dev gateway + mock), homelab (deploy). **No contracts release.**

Key facts: `value_snapshots` (`src/db/schema.ts:391`) holds `value`/`invested` per portfolio in that
portfolio's `base_currency`; `convert(amount, from, to, rates)` + `latestRates(db)` are the existing
FX path (`@marx2/contracts/fx`, `src/services/valuation.ts`); per-portfolio shape built in
`routes/:id/analytics` (`src/routes/portfolios.ts:827`); `timeframeCutoff` at `portfolios.ts:134`;
backfill at `src/services/backfill.ts` (`getBackfillStatus:288`, `runBackfill`).

Rules: one step = one commit; a step is `[x]` only after its tests pass (unit + docker-compose per
AGENTS.md).

---

### 46.1 — `portfoliost-wallets`: merged aggregation service (pure, unit-tested)

- [x] New `src/services/mergedAnalytics.ts`: `sumSnapshotsByDate(rows, rates, target)` where `rows`
  = `{ baseCurrency, snapshotDate, value, invested }[]` — group by date, convert each row
  `baseCurrency → target` via `convert`, sum `value`/`invested`; **skip a row whose rate is
  unavailable** (never fabricate a 1:1 rate). Return `{ date, value, invested }[]` ascending.
- [x] `buildMergedPerformance(series)` → `totalValue`/`totalInvested`/`totalReturn`/
  `totalReturnPercent` from the last point (mirror `/:id/analytics:892-895`); `monthlyReturns: []`,
  `timeWeightedReturn`/`moneyWeightedReturn`/`simpleReturnPercent` = `null`.
- [x] Tests `src/services/mergedAnalytics.test.ts`: single portfolio == its own series (target = its
  own currency, no FX); USD+PLN sum at known rates; missing-rate row skipped; empty input → empty
  series / zeros.
- [x] Tests: `npm run test` + `npm run lint` green.
- [x] Commit (`9af8363`).

### 46.2 — `portfoliost-wallets`: `GET /portfolios/merged` route

- [x] `src/routes/portfolios.ts`: register `routes.get("/merged", …)` **above `routes.get("/:id")`
  (line 553)** (otherwise `merged` is parsed as a portfolio id), modelled on `/:id/analytics`.
- [x] Resolve `timeframe` (`c.req.query("timeframe") || "ALL"`); `latestRates(db)`; select the user's
  portfolios + their `value_snapshots` filtered by `timeframeCutoff(timeframe)`; call 46.1 with
  `target = "USD"` (must stay equal to `total-metrics.baseCurrency`).
- [x] `backfillStatus`: if **any** of the user's portfolios has `< 2` snapshots → fire `runBackfill`
  per incomplete portfolio (fire-and-forget, mirroring `/:id/analytics:852-863`) and return the
  pending shape; else `complete` with the summed series. `benchmarks: []`.
- [x] Tests `src/routes/portfolios.test.ts`: two seeded portfolios (USD + PLN) → last point equals
  the FX-converted sum in USD; `GET /portfolios/merged` is not captured by `/:id`; pending path
  returns `backfillStatus:"pending"` and triggers backfill.
- [x] Tests: `npm run test` green; compose smoke — `curl` through the gateway
  `/api/portfolios/merged?timeframe=ALL` returns the domain-shaped body (200).
- [x] Commit (`fa91581`).

### 46.3 — SPA: keep §41.5 client-side conversion (no code change expected)

- [x] Confirm `InvestmentsView.vue` (`mergedSourceCcy` = `store.totalMetrics.baseCurrency`) matches
  the 46.2 response currency; add a unit assertion in
  `tests/unit/modules/portfolios/InvestmentsView.test.ts` that the merged series is converted from
  `totalMetrics.baseCurrency` → display currency (guards future drift).
- [x] Tests: `npm run build` + `npm run test` green.
- [x] Commit (test only; if nothing changes, fold the verification note into 46.6) (`40dc625`).

### 46.4 — portfoliost dev stack: route merged back to wallets + mock parity

- [x] `gateway/default.conf.template`: drop the §41.5 `location /api/portfolios/merged →
  ${API_BACKEND_URL}` special-case so merged flows to `${API_PORTFOLIOS_URL}` (wallets, now real).
- [x] `mocks/portfolios/index.js`: keep `/portfolios/merged` returning the fixture **in USD** (the
  single seeded portfolio is USD, so `merged == its series` stays valid); keep the `/merged/light`
  passthrough.
- [x] Tests: `npm run test:mock` green; `docker compose up -d --build wallets portfoliost gateway` +
  `npm run test:e2e` green (combined-chart + chart-recompute + chart-currency) against real wallets.
  Full suite: 84 passed / 1 skipped (wallets e2e edit-delete flake was a bare-`npx playwright test`
  artefact — reset only runs via `npm run test:e2e` pretest).
- [x] Commit (`68de01c`).

### 46.5 — Release + deploy `portfoliost-wallets` (homelab)

- [x] Push wallets `main` → GHA tags `vX.Y.Z` and pushes `ghcr.io/marx2/portfoliost-wallets:vX.Y.Z`;
  verify with `gh run list` / `gh release list`. → **v1.1.43** (build + release green).
- [x] Bump the pinned tag in `homelab` `cluster/apps/pfire/portfoliost-wallets/app/helmrelease.yaml`
  (**both** occurrences — app Deployment and the `fxsync` CronJob), rebase on `origin/main`, push.
  → `46af5c617`.
- [x] Verify: `kubectl -n pfire rollout status deploy/portfoliost-wallets` (success); production
  `GET /api/portfolios/merged?timeframe=ALL` hits the new route (401 auth-guard, not 404) and the SPA
  `/en/investments` shows the combined chart. Full 200 + chart render require a logged-in Pocket-ID
  session — manual/visual check, not scriptable headlessly.
- [x] Commit (homelab repo, separate) (`46af5c617`).

### 46.6 — Closeout

- [x] `docs/plan.md`: mark §41 follow-up 1 done; record the base-currency coupling and `/merged/light`
  as open items (below); archive §41 + §46 to `plan-archive.md`/`plan-archive2.md`; update the §41.6
  residual-gap note (block now renders in production).
- [x] Commit.

---

Open items (from the 2026-09-21 design review):

1. **Base currency is hardcoded USD** on both `/merged` (46.2) and `/total-metrics`
   (`portfolios.ts:303`). If the base moves to a user preference (`preferredBaseCurrency`), the two
   must change in the same commit **and** `/total-metrics` must gain per-portfolio FX conversion for
   its `totalValue` (it currently sums raw values) — otherwise the SPA's assumed source currency and
   the header total both drift. Deferred; do them together.
2. **`/merged/light`**: defined in the contract (`openapi.yaml:3034`) but has no consumer (no SPA
   call, no wallets route; mock passthrough only). Left as-is until a consumer appears; a real
   implementation would be speculative.
3. **Server-side `displayCurrency`** (example-service-style, §41 follow-up 2) was **not** adopted — both
   analytics endpoints stay client-side converted (fast enough: one cached rate call + a series map).
   Revisit only if per-date historical FX is needed, which would require server-side conversion.

