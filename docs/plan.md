# plan.md — pending work

Long-running plan. Each step is implemented, verified, committed, and then archived.
Completed steps are archived in `plan-archive.md`.

Legend: `[ ]` pending · `[x]` done

---

## Topology — cinematic observability experience

<!-- §27 moved to plan-archive.md (closeout 2026-09-19) -->

- [x] **One implementation step:** create an original, motion-rich Portfoliost topology experience (atmospheric canvas, luminous directional traffic, polished controls/nodes/inspector, focus mode, and accessible motion controls). Preserve graph interaction, filtering, layouts, and API contracts.
  - First gate: browser tests prove animated effects run, pause/reduced-motion stops them, and node inspection still works before expanding the visual treatment.
  - Final gate: `npm run build`, `npm run test`, `npm run test:mock`, `docker compose up -d --build`, `npm run test:e2e`; desktop/mobile browser review. Mark complete and commit only on passing full validation.
  - This is original Portfoliost functionality, not a Example service parity page.
  - Result (2026-09-17): implemented — `mission-control.css` atmosphere (drifting aurora layers, grid, scan, grain, particles), luminous dual-layer flow edges (trail + particle) with corrected source→target direction, per-area accent styling across toolbar/nodes/lanes, redesigned dark explorer stage, focus mode (Esc exits), Pause effects + reduced-motion hard stop, telemetry status strip, empty-state recovery. Validation: `npm run build`, 272 unit, 186 mock, topology e2e 13/13 (3 new tests), dockerized stack rebuilt, mobile/focus/dark browser review, zero console errors. Known pre-existing failure outside this step: `auth.spec.ts` "login page hides form" — compose deliberately sets `VITE_PASSWORD_LOGIN_ENABLED=true` (introduced for D73–D79 mock login) while the test still expects the OIDC-only UI from c9a0a81; fails identically with this work stashed (baseline verified). Needs a product/test-strategy decision, tracked separately.

### Topology follow-up — themes, glow, deployed jobs

- [x] Restore a complete light palette and global light/dark/system controls; add icon glow and state-colored dot pulses. Validation: build, 279 unit (incl. new StatusDot pulse tests), 186 mock, motion gate, 15/15 topology E2E incl. real canvas/node/inspector colors, system-theme reactivity, glow pause/reduced-motion, mobile inspection. Fixed `theme.ts` system-listener bug. Fixed `auth.spec.ts` OIDC-only test to override `passwordLoginEnabled` before boot (compose keeps password login for other flows) — that blocker is resolved.
- [x] Add verified missing OpenST jobs and providers to the graph: Bond Import `30 4 * * *`, Bond Archive `0 6 3 * *`, CPI Import `30 4 * * *`, CPI Seed `0 5 1 1 *` (suspended) as job nodes with edges into openst and schedule metadata in the inspector; OpenBB plugins `biznesradar` (Polish TFI funds / Catalyst bonds, quotes/history/profile/search) and `obligacje` (retail savings-bond pricing from issue parameters + CPI) as provider leaves. Enabling the expansion surfaced two real defects, both fixed with tests: dagre could emit negative lane origins which the drag clamp treated as out of bounds (layout now normalizes into LANE_BOUNDS; unit test added), and resizing the canvas kept a stale viewport transform on small screens (ResizeObserver refit; min-zoom lowered). Draggable-lane, re-layout, persistence, mobile-inspection tests all pass.
- [x] Traffic metrics hidden for cachest/openst: the inspector rendered the Traffic section only for `area === "internal"`, but both are probed live services in `data-providers`. Verified live via `kubectl` port-forward to Prometheus (series exist for all six services under `job`/`service_name`) and the admin `/topology/traffic` mapping (every `serviceTargets()` entry is serialized). Gate removed; new `TopologyDetailsPanel` unit test locks Traffic + cachest per-upstream P99 visibility for data-provider nodes.
- [x] Remaining (separate module work, portfoliost-instruments): `price-bars.spec.ts` "returns a valid series" failed because `price_bars_all` yields BOTH an `openst` overflow row (338.19) and the split-adjusted `stooq` row (57.625) for 2026-07-29; `dates.indexOf` picked the unadjusted one. Fixed read-only in `portfoliost-instruments@0c03214`: the price-bars query orders `stooq` rows ahead of `openst` overflow rows on equal dates (deterministic stooq-first; unit test added), so the split-adjusted value wins. The duplicate rows themselves remain in the view (the importer needs them) — data-level dedup stays an optional product/data decision in that repo. Verified 2026-09-20: `tests/e2e/price-bars.spec.ts` 3/3 against the compose stack.
  - Sources: homelab-deploy skill, `~/prv/homelab/homelab`, live read-only Kubernetes queries using `~/.kube/homylab` (2026-09-17). Wallets FX Sync and Instruments Ticker Sync confirmed; OpenST bond-import, bond-archive, cpi-import, and suspended cpi-seed were missing from the map.
  - Read-only cluster result: wallets fxsync `10 17 * * *`; instruments tickersync `30 4 * * 1`; OpenST bond-import and cpi-import `30 4 * * *`, bond-archive `0 6 3 * *`, cpi-seed `0 5 1 1 *` (suspended). All use controller timezone. No deployments were modified.
  - Baseline blockers: auth expected hidden password form although compose enables it; its OIDC-only test now explicitly overrides runtime configuration before application boot (no production change). Combined auth/topology E2E passes 16/16. AAPL price-bars remains failing: read-only SQL confirms both `openst` and split-adjusted `stooq` rows for July 29/30 in `price_bars_all`; expectations and seeds unchanged. Tracked as the remaining item above.




<!-- §34 moved to plan-archive.md (closeout 2026-09-20) -->

<!-- §36 moved to plan-archive.md (closeout 2026-09-20) -->

## 37. Openst OOM on bond recompute — route savings bonds to the bond tier (incident 2026-09-20)

Incident: after the daily 04:30 bond import, `openst` (512Mi limit) OOMKilled 3× in a loop (13:38–13:45 UTC, still climbing on restart). Investigation (live cluster, read-only + user-approved destructive dev-cluster experiments) confirmed:

- Savings-bond emissions (`ROD*/EDO*`) are valid — all 449 exist in `openst.bond_series` and `/fixedincome/*` serves them with 200. They have **no `ticker_reference` row by design** (bonds are imported separately by the openst job; verified: zero ROD/EDO rows in `instruments.ticker_reference`).
- The recompute path (`portfoliost-instruments` `price-bars.ts`) resolves asset type from `ticker_reference`, degrades to `stock` when absent, and sends cold bonds through the **equity tier**: `PRICE_PROVIDERS` = 7 upstream fan-outs (yfinance, fmp, intrinio, polygon, cboe, tiingo, biznesradar), each guaranteed-404 and taking 0.4–14.6 s. `price_bar_metadata` shows every ROD/EDO symbol stamped `failed` at 13:39:18–13:39:31 — exactly the first OOM window.
- The §34.5 `SAVINGS_BOND` regex fallback exists in `quote-dispatch.ts` and the `/history` + detail-profile routes, **but not in `upstreamFor` (price-bars)** — so the recompute path never reaches the bond tier, and 404s are never cached (neither openst nor cachest negative-caches), so each cold symbol re-pays the 7-provider walk on every retry (1 h cooldown) and SPA visit.
- openst is a single uvicorn worker with sync endpoints (threadpool); dozens of 2–15 s in-flight multi-provider walks pile up: memory 336Mi idle → 493Mi under light traffic → 512Mi → OOM → restart → cold caches → storm repeats.

Repos: `portfoliost-instruments` (steps 1–2), `openst` (steps 3–4, 6), homelab cluster (steps 0, 5). No contract changes. No data migration.

Rules: one step = one commit; a step is marked `[x]` only after its tests pass (unit + docker-compose / cluster verification where noted).

---

### 37.0 — Immediate mitigation: scale openst to 2 replicas (homelab)

- [ ] `~/prv/homelab/homelab/cluster/apps/pfire/openst/app/helmrelease.yaml`: `replicas: 1` → `replicas: 2`. Commit + push; Flux applies in ~1 min.
- [ ] Verify: `kubectl get pods -n pfire | grep openst` shows 2 Running; service round-robins.
- [ ] No tests (infra config-only; verified by kubectl). Commit in homelab repo.

### 37.1 — Route savings bonds to the bond tier in the recompute path (portfoliost-instruments)

- [ ] `src/services/quote-dispatch.ts`: export `SAVINGS_BOND` (or a `isSavingsBond(symbol)` helper) so it has one source of truth.
- [ ] `src/db/tickerref-queries.ts` (or the lookup wrapper): when `ticker_reference` returns null for a symbol matching `SAVINGS_BOND`, classify it as `bond` — i.e. extend the asset-type resolution used by `price-bars.ts` (`lookupAssetType`) so `upstreamFor` routes `ROD*/EDO*` to `fetchBondOhlcv` without probing the equity tier. Keep `quote-dispatch.ts` behavior unchanged (its regex fallback stays as safety net).
- [ ] `src/services/price-bars.ts`: use the extended resolution in `getPriceBarSeries` gap-fill (and any other `lookupAssetType` call sites) so cold savings bonds fetch `fixedincome/ohlcv` once and land in `price_bars` overflow with `fetchStatus: "ok"`.
- [ ] Tests: unit — `upstreamFor`/gap-fill for `ROD1035` calls the fixedincome adapter, never the equity `fetchOhlcv` (mock the adapters, assert); existing stock/etf routing unchanged. `npm run test` green, `npm run build` green.
- [ ] Commit.

### 37.2 — Stop equity-tier probes for savings bonds in SPA-facing routes (portfoliost-instruments)

- [ ] `/profile` and `/detail` routes: for `SAVINGS_BOND` symbols, call `fetchBondProfile` first (skip the equity probe entirely).
- [ ] `/metrics` and `/fundamentals`: for `SAVINGS_BOND` symbols, return a structured 404 ("not applicable for savings bonds") without any upstream equity call.
- [ ] `/quote` (route): for `SAVINGS_BOND` symbols, dispatch straight to `fetchFixedincomeQuote` (no equity 404 round-trip) — keep the existing fallback for safety.
- [ ] Tests: unit per route (no `fetchQuote`/`fetchProfile`/`fetchMetrics`/fundamentals adapter call for `ROD*`); e2e if a compose-level test exists for the research page. `npm run test` + `npm run build` green.
- [ ] Commit.

### 37.3 — Negative-cache 404s in openst (short TTL)

- [ ] `openst/src/main.py` `_cached_or_404`: when `fetch()` returns `None`, store a short-TTL sentinel (e.g. 6 h, `__null__`) in Redis and return 404; on sentinel hit, 404 without calling the fetch. Do NOT negative-cache `[]` (price_ohlcv treats `[]` as a valid empty result). Add a module-level constant `NEGATIVE_TTL`.
- [ ] Tests: `tests/test_main.py` — a `None` fetch is cached (second call doesn't invoke fetch, same 404); an `[]` result is not negative-cached; a success after a negative entry evicts it (set TTL ordering test or explicit key clear check).
- [ ] `docker compose up -d` smoke: hit a dead ticker twice, second call fast + no upstream logs. Full openst suite green.
- [ ] Commit.

### 37.4 — Bound in-flight upstream work in openst (semaphore)

- [ ] `openst/src/main.py`: process-wide `threading.Semaphore` (e.g. 8) acquired inside `_cached_or_404`'s fetch path (and the catalogue route's fetch) so a burst queues instead of piling dozens of 2–15 s multi-provider walks in the threadpool.
- [ ] Tests: unit — N concurrent cache-miss fetches with a fake slow fetch never exceed the semaphore bound (count in-flight via a counter in the fake). Full openst suite green.
- [ ] Commit.

### 37.5 — Cluster verification of the storm + right-size the memory limit

- [ ] Deploy 37.1 + 37.2 (instruments image) and 37.3 + 37.4 (openst image) via GHA → pin in homelab helmreleases.
- [ ] Reproduce the storm (dev-cluster, user-approved): clear the openst Redis keys (`fixedincome_*`, `price_ohlcv:*`) and `instruments.price_bars` + `price_bar_metadata` rows for a batch of ROD/EDO symbols; trigger portfolio recomputes (sheets-sync reimport or the admin recompute endpoint); watch `kubectl top pod openst-*` and openst logs.
- [ ] Assert: `price_bar_metadata` for ROD/EDO flips `failed` → `ok`; `/price/ohlcv/ROD*` no longer appears in openst logs; `/equity/*` 404 storm gone; memory peak stable.
- [ ] Set the openst memory limit to ~2× the measured peak in `helmrelease.yaml` (requests stay 128Mi); commit + push; verify one full storm cycle survives with 0 restarts.
- [ ] No unit tests (cluster verification is the gate, per AGENTS.md ops section).

### 37.6 — (Optional polish) Align bond OHLCV/quote cache to CPI freshness

- [ ] `openst/src/main.py` `fixedincome_ohlcv`/`fixedincome_quote`: TTL anchored to data freshness (e.g. key by symbol, expiry at next CPI import / next daily 12:00) instead of 24 h from first fetch. Only worth doing after 37.5 confirms the OOM is dead.
- [ ] Tests: unit for the TTL/expiry computation. Full openst suite green.
- [ ] Commit.

---

### Open questions

1. 37.1 classification: put the `SAVINGS_BOND → bond` rule in `tickerref-queries.assetTypeForSymbol` itself (affects every caller) or in a thin wrapper used only by `price-bars.ts` + routes (narrower blast radius)? Default: wrapper, unless review says otherwise.
2. 37.6: preferred expiry anchor — next CPI import time (read `openst.cpi_12m` max date + 1 h) or a fixed 12:00 daily? Default: fixed 12:00 (user said "valid until noon").
