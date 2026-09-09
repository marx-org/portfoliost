# Instrument symbol canonicalisation and search enrichment

**Status**: accepted (2026-09-09)
**Scope**: Establish a single unambiguous canonical symbol format across the entire system, fix venue-defaulting bugs in research navigation, enrich the instrument search UI, and add ISIN search support.

---

## Problem statement

Three separate symbol formats co-existed without clear ownership:

| Format | Example | Problem |
|---|---|---|
| Base/company symbol | `SAP` | Ambiguous — SAP trades on XETRA (EUR) and NYSE (USD) |
| `.US`-suffixed route symbol | `SAP.US` | Stooq artefact, not a real exchange identifier |
| Venue-qualified symbol | `SAP.DE` | Correct — but silently overridden to `SAP.US` by `researchSymbol()` |

Concrete bug: user buys `SAP.DE` on XETRA, navigates to research. `ResearchView` strips the suffix via `baseSymbol()`, records `"SAP"` in recent searches, `researchSymbol("SAP")` appends `.US`, research tab shows NYSE ADR price instead of XETRA. Transaction overlay on the price chart fetches `instrumentSymbol=SAP.US`, wallets returns empty because stored transactions say `SAP.DE`.

---

## Decisions

### D1 — Canonical symbol format

A listing is identified by `ticker + exchange`. The human-readable form is:

- **Non-US**: Yahoo venue suffix — `SAP.DE`, `SNT.WA`, `RHM.DE`. This is both the route symbol and the stored symbol.
- **US**: bare ticker — `SAP`, `AAPL`. No `.US` suffix anywhere in the system.

`.US` is a stooq-internal artefact. It must not appear in routes, stored transactions, watchlists, recent searches, or any API response. It is stripped at every boundary.

`ticker_reference` is the source of truth. Every symbol stored anywhere must correspond to a `listingKey` row (`XETRA::SAP`, `NYSE::SAP`, `WSE::SNT`). The Yahoo suffix is derived from `exchange_reference.yahooSuffix` at query time.

### D2 — `.US` stripped everywhere, clean break

No legacy shims, no redirects for old `.US` routes. Existing bookmarks or stored preferences containing `.US` suffixes become invalid. This is acceptable at the current development stage.

`providerSymbol()` in `adapters/symbol.ts` already strips `.US` before every cachest/openst call — this remains correct and unchanged. After this change, the strip becomes a no-op for US tickers (they arrive as bare tickers) but is kept as a defensive guard.

### D3 — `baseSymbol()` deleted

`baseSymbol()` (strips everything after the first `.`) is deleted entirely. It was used in two places:

- `ResearchView.vue` — for display and (wrongly) for recent-searches recording.
- `ResearchCompare.vue` — passed to `getInstrumentPeers()`.

Under the new model `routeSymbol` is used directly everywhere: display, API calls, navigation, storage. `SAP.DE` is a perfectly readable display label and disambiguates listings that would otherwise both show as `SAP`.

### D4 — `researchSymbol()` simplified or deleted

`researchSymbol()` currently appends `.US` for bare symbols. Under D1, bare symbols ARE the US canonical form — no suffix needed. The function either:

- Is deleted if no callers remain after the cleanup, or
- Simplified to a pure uppercase passthrough (no `.US` appending, no exchange-suffix logic).

`symbolExchange()` in `research.ts`, which extracts the suffix from a route symbol, becomes dead code and is deleted alongside `baseSymbol()`.

### D5 — Recent searches record only on explicit selection

`recentSearches.record()` is called only when the user explicitly selects an instrument from `InstrumentSearchModal` — i.e. inside the `openResult()` / `add` emit handler. It is removed from `ResearchView.onMounted` and the `watch(routeSymbol)` handler.

The full `routeSymbol` is recorded (`SAP.DE`, `SAP`, `SNT.WA`). Never a stripped form.

### D6 — Search returns all listings, richer result card

The search endpoint already returns all `ticker_reference` rows matching the query. No US-defaulting or deduplication by company. The result card in `InstrumentSearchModal` is enriched to show exchange and country (both already present in `TickerSearchRow` and the search response).

Currency is not added — it is not in the upstream `adanos/free-ticker-database` source and would require a hand-curated `exchange → currency` seed file. Deferred to a separate proposal.

### D7 — ISIN search enabled

`searchTickerReference()` in `tickerref-queries.ts` gains one additional WHERE branch:

```sql
OR upper(isin) = upper(?)   -- only when query is exactly 12 characters
```

Exact match only (not ILIKE). The existing `ticker_reference_isin_idx` btree index makes this fast. When a user pastes an ISIN that maps to multiple listings (same company, multiple exchanges), all matching rows are returned — consistent with D6.

The search response (`InstrumentSearchResponse`) already carries `isin` through `toReferenceSearchResponse()` — no contract change needed; the field is already in `openapi.yaml`.

### D8 — Transaction matching (wallets + PriceChart)

The wallets OR-match introduced in the in-flight fix is kept:

```sql
upper(instrument_symbol) = upper(?)
OR upper(instrument_symbol) LIKE upper(?) || '.%'
```

This handles legacy transactions that may have been stored with mixed formats (e.g. `SAP.US`, bare `SAP`). New transactions stored after this change will always use the canonical form (D1).

`PriceChart.vue` client-side scoping replaces the exact-match filter with a base-prefix match consistent with the wallets query: `tx.instrumentSymbol.toUpperCase() === symbol || tx.instrumentSymbol.toUpperCase().startsWith(symbol + '.')` where `symbol` is the base ticker extracted from `routeSymbol`.

---

## What does NOT change

- `providerSymbol()` and `symbolSuffix()` in `adapters/symbol.ts` — correct as-is, no changes beyond updating the comment that references `AAPL.US` as an example.
- `price_bars.symbol` — already uses the canonical form (`SAP`, `SAP.DE`). The stooq import hook strips `.US` internally; this is a stooq-boundary detail and not exposed.
- cachest / openst — fully insulated by `providerSymbol()`. No changes required.
- `exchange_reference` schema — no currency column added (D6).
- `ticker_reference` schema — no changes. ISIN column and index already exist.

---

## Affected files

| File | Change |
|---|---|
| `portfoliost/src/utils/research.ts` | Delete `baseSymbol`, delete `symbolExchange`, simplify `researchSymbol` to passthrough |
| `portfoliost/src/modules/instruments/ResearchView.vue` | Use `routeSymbol` directly everywhere; remove `baseSymbol` import; fix `recentSearches.record` call (D5) |
| `portfoliost/src/modules/instruments/ResearchCompare.vue` | Pass `routeSymbol` to `getInstrumentPeers`; remove `baseSymbol` import |
| `portfoliost/src/modules/instruments/InstrumentSearchModal.vue` | Record recent search on explicit select; pass symbol as-is (no `researchSymbol` post-processing); enrich result card UI with exchange + country |
| `portfoliost/src/components/PriceChart.vue` | Replace client-side exact-match scoping with base-prefix match (D8) |
| `portfoliost-instruments/src/db/tickerref-queries.ts` | Add ISIN exact-match branch to `searchTickerReference` WHERE clause (D7) |
| `portfoliost-instruments/src/adapters/translate.ts` | Remove `.US` hardcode from `toInstrumentDetail` `id` field |
| `portfoliost-instruments/src/adapters/symbol.ts` | Update comment (remove `AAPL.US` example) |
| `portfoliost-contracts/openapi.yaml` | Update `instrumentSymbol` param description to document base-prefix matching |
| `portfoliost/mocks/portfolios/index.js` | Update `filterTransactionsBySymbol` to use base-prefix match |

---

## Out of scope

- Exchange → currency mapping (deferred)
- Grouping search results by company/ISIN
- Migration of existing stored transactions to canonical form (normalise on read via wallets OR-match)
- `portfoliost-admin` stooq upload UI symbol handling

---

## Execution plan

Each step is a single commit. Mark `[x]` after the step's tests pass and the commit is made.

### Rules for the executing model

- Use `semble search` to find exact file locations — do not grep blindly
- After every step: run `npm run build && npm run test && npm run test:mock` in `portfoliost/`
- After steps touching `portfoliost-instruments`: run `npm run build && npm run test` in `portfoliost-instruments/`
- One step = one commit. Commit message format: `fix(symbols): <short description>`
- Do NOT batch steps

---

### Step 1 — Simplify `researchSymbol`, delete `baseSymbol` and `symbolExchange` [ ]

File: `portfoliost/src/utils/research.ts`

- Delete `baseSymbol()` entirely
- Delete `symbolExchange()` entirely
- Simplify `researchSymbol()` to: uppercase and return as-is. No `.US` appending, no exchange-suffix logic. New implementation:
  ```ts
  export function researchSymbol(symbol: string): string {
    return String(symbol).toUpperCase()
  }
  ```
- The `exchange` parameter is removed from the signature

Tests: `npm run build` in `portfoliost/`

---

### Step 2 — Fix `ResearchView.vue` [ ]

File: `portfoliost/src/modules/instruments/ResearchView.vue`

- Remove `baseSymbol` from import (keep `researchSymbol` only if still called, otherwise remove too)
- Delete `const symbol = computed(() => baseSymbol(routeSymbol.value))` — use `routeSymbol.value` directly wherever `symbol.value` was used
- In `goToSymbol()`: simplify to `router.push({ name: String(route.name), params: { symbol: s.toUpperCase() } })` — no `researchSymbol` call, no dot-check
- In `onMounted`: remove `recentSearches.record(symbol.value)` entirely (recording moves to search modal, D5)
- In `watch(routeSymbol)`: remove `recentSearches.record(baseSymbol(sym))` entirely
- In the template: replace `{{ symbol }}` with `{{ routeSymbol }}` — the full venue-qualified symbol is the display label

Tests: `npm run build` in `portfoliost/`

---

### Step 3 — Fix `ResearchCompare.vue` [ ]

File: `portfoliost/src/modules/instruments/ResearchCompare.vue`

- Remove `baseSymbol` import
- Change `const symbol = baseSymbol(routeSymbol)` → `const symbol = routeSymbol`
- `getInstrumentPeers(symbol)` now receives the full route symbol (e.g. `SAP.DE`). Backend `providerSymbol()` already strips suffixes before provider calls — no backend change needed.

Tests: `npm run build` in `portfoliost/`

---

### Step 4 — Fix `InstrumentSearchModal.vue` [ ]

File: `portfoliost/src/modules/instruments/InstrumentSearchModal.vue`

- In `openResult()`: remove the dot-check + `researchSymbol()` call. Use the symbol from the search result directly — it is already in canonical form from the backend (`SAP.DE`, `SAP`, `SNT.WA`).
- Add `recentSearches.record(symbol)` inside `openResult()` when mode is `"navigate"`, and inside the `add` emit when mode is `"add"`. This is the ONLY place recent searches are recorded (D5).
- Import `useRecentSearchesStore` if not already imported.
- Enrich the result card template: show exchange and country below the instrument name (e.g. `NYSE · US`, `XETRA · DE`). Both fields are already in the search response (`result.exchange`, `result.countryCode`). Check `portfoliost-contracts/openapi.yaml` `InstrumentSearchResult` schema — if `countryCode` is missing, add it (then `npm run gen:types` in `portfoliost/`).

Tests: `npm run build && npm run test && npm run test:mock` in `portfoliost/`

---

### Step 5 — Remove `.US` hardcode from `toInstrumentDetail` [ ]

File: `portfoliost-instruments/src/adapters/translate.ts`

- Line ~77: `id: \`${symbol.toUpperCase()}.US\`` → change to `id: symbol.toUpperCase()`
- Check `portfoliost-contracts/openapi.yaml` `InstrumentDetail.id` — confirm it is a plain `string` with no `.US` format constraint.
- Update any test assertions that expect `id` to end in `.US`.

Tests: `npm run build && npm run test` in `portfoliost-instruments/`

---

### Step 6 — Update `symbol.ts` comment [ ]

File: `portfoliost-instruments/src/adapters/symbol.ts`

- Update the docstring. Remove `AAPL.US` as an example. New comment:
  ```
  /** Route symbols are venue-qualified for non-US listings (SNT.WA, SAP.DE)
   * and bare tickers for US listings (AAPL, SAP).
   * Provider calls use the full symbol for non-US venues (Yahoo-style suffixes);
   * US providers receive bare tickers — providerSymbol() is a no-op for those. */
  ```
- `providerSymbol()` logic itself is unchanged.

Tests: `npm run build` in `portfoliost-instruments/`

---

### Step 7 — Add ISIN search to `searchTickerReference` [ ]

File: `portfoliost-instruments/src/db/tickerref-queries.ts`

- In `searchTickerReference()`, add an ISIN exact-match branch to the WHERE clause, gated on query length === 12 (ISIN length):
  ```ts
  const isIsin = upper.length === 12
  // add to WHERE: OR (isIsin condition) upper(isin) = upper(?)
  ```
  Uses the existing `ticker_reference_isin_idx` btree index. Multiple listings for the same ISIN are all returned.
- Add a test in `tickerref-queries.test.ts`: search by ISIN `"US0378331005"` returns the AAPL row.

Tests: `npm run build && npm run test` in `portfoliost-instruments/`

---

### Step 8 — Fix `PriceChart.vue` client-side scoping [ ]

File: `portfoliost/src/components/PriceChart.vue`

- Find `scopedTransactions` computed (~line 234). Replace exact match:
  ```ts
  String(tx.instrumentSymbol ?? "").toUpperCase() === props.symbol.toUpperCase()
  ```
  with base-prefix match:
  ```ts
  const base = props.symbol.toUpperCase().split(".")[0]
  const txSym = String(tx.instrumentSymbol ?? "").toUpperCase()
  return txSym === base || txSym === props.symbol.toUpperCase() || txSym.startsWith(base + ".")
  ```
  Matches: `SAP` stored tx on a `SAP.DE` chart; `SAP.DE` tx on a `SAP.DE` chart; legacy `SAP.US` tx on a `SAP` chart.

Tests: `npm run build && npm run test` in `portfoliost/`

---

### Step 9 — Fix wallets mock `filterTransactionsBySymbol` [ ]

File: `portfoliost/mocks/portfolios/index.js`

- Find `filterTransactionsBySymbol` (~line 133). Replace exact match:
  ```js
  String(t.instrumentSymbol ?? "").toUpperCase() === q
  ```
  with base-prefix match:
  ```js
  const base = q.split(".")[0]
  const sym = String(t.instrumentSymbol ?? "").toUpperCase()
  return sym === q || sym === base || sym.startsWith(base + ".")
  ```

Tests: `npm run test:mock` in `portfoliost/`

---

### Step 10 — Update OpenAPI contract `instrumentSymbol` description [ ]

File: `portfoliost-contracts/openapi.yaml`

- Update the `instrumentSymbol` query parameter description on both transaction list operations (`GET /portfolios/transactions` and `GET /portfolios/{portfolioId}/transactions`) to:
  `"Filter by instrument symbol. Canonical form: bare ticker for US listings (AAPL, SAP), Yahoo venue suffix for others (SAP.DE, SNT.WA). When the value is a bare base ticker, all venue-qualified variants are also matched (SAP matches SAP, SAP.DE, SAP.US). Case-insensitive."`
- If `InstrumentSearchResult` was missing `countryCode` (found in Step 4), add it here in the same bump.
- Bump the patch version per the contracts workflow. Then in each consumer repo: `NODE_AUTH_TOKEN=$(gh auth token) npm install @marx2/contracts@<new-version>` and `npm run gen:types`.

Tests: `npm run build` in all consumer repos after installing the new contracts version.

---

## Verification checklist

- [ ] Search "SAP" returns both `SAP` (NYSE) and `SAP.DE` (XETRA) as separate results with exchange and country shown
- [ ] Clicking `SAP.DE` in search navigates to `/research/SAP.DE`, not `/research/SAP.US`
- [ ] Recent searches after clicking `SAP.DE` records `"SAP.DE"`, not `"SAP"`
- [ ] `/research/SAP.DE` display label shows `SAP.DE`, not `SAP`
- [ ] Price chart on `/research/SAP.DE` shows SAP.DE transactions (not empty)
- [ ] Pasting ISIN `DE0007164600` in search returns SAP listings
- [ ] No `.US` suffix appears anywhere in the UI, URLs, or API responses for US listings
- [ ] `npm run build && npm run test && npm run test:mock && npm run test:e2e` pass in `portfoliost/`
- [ ] `npm run build && npm run test` pass in `portfoliost-instruments/`
