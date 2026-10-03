# SPA component conventions

House style for the Vue 3 SPA (`src/`). Follow this when adding a component;
the examples below are the existing components to imitate:

| Concern | Reference |
|---|---|
| Field group with a `testid` prefix | `src/components/FeeFields.vue` (`"fee-fields"`), `src/components/FxRateFields.vue` (`"fx"`) |
| Bigger form section with slots + shared math | `src/components/TransactionFormFields.vue`, `src/components/DividendFields.vue` |
| Feature view / dialog | `src/modules/portfolios/RecordDividendDialog.vue`, `src/modules/portfolios/EditTransactionModal.vue` |
| Instrument identity block (logo + ticker + `(CC) Type` + name) | `src/components/TickerBadge.vue` (`"ticker-badge"`) |

## Where things live

- `src/components/` — reusable primitives and field groups used by ≥2 places
  (inputs, selects, summary cards, fee/FX/dividend field blocks).
- `src/modules/<domain>/` — feature-scoped views and dialogs. A dialog stays
  in its module unless a second module needs it.
- Shared pure logic exported from a component file goes in a plain
  `<script>` block (not `<script setup>`), e.g. `dividendTotals()` from
  `DividendFields.vue`.

## Script conventions

- `<script setup lang="ts">` everywhere; typed `defineProps<{...}>()` with
  JSDoc comments on non-obvious props; optional props via `withDefaults` or
  `?`.
- v-model-style bindings use **explicit `defineEmits` with `update:x`
  events** — the codebase does not use `defineModel`, with one exception:
  `TransactionFormFields` uses `defineModel<TransactionFormModel>("form")` for
  its whole-form object. New components should follow the `update:x` pattern:

  ```ts
  const emit = defineEmits<{
    (e: "update:rate", v: string): void
  }>()
  ```

- Field-group components take a `testid?: string` prop and resolve a local
  `const tid = props.testid ?? "<default>"` (defaults: `"fee-fields"`,
  `"fx"`, `"dividend"`); every interactive element inside gets `:data-testid="`${tid}-<field>`"`. Testids are **stable API** — unit
  and e2e tests select on them; a rename requires updating those tests in the
  same commit.
- Inputs bind `:value` + `@input="emit('update:x', ($event.target as HTMLInputElement).value)"`
  (string values at the component boundary; parents keep the raw strings and
  do their own number parsing).

## Slots

Parents inject their own markup instead of prop-drilling it — see
`FxRateFields` `#manual`, `TransactionFormFields` `#footer`,
`DividendFields` `#after-toggle` / `#before-summary`.

## Shared math

Gross/net/price-style math that more than one parent needs belongs in an
exported pure function next to the component (see `dividendTotals()`):

```ts
export function dividendTotals(perShare, grossTotal, perShareGross, quantity, taxes): DividendTotals
```

Parents call it in a `computed` and reuse the result for payload building,
submit gating, and labels — never re-derive the formula inline.

## Styling

- Tailwind utilities plus the shared component classes in `src/styles/main.css`:
  `card`, `input`, `label`, `btn-primary`, `btn-secondary`, `btn-ghost`,
  `btn-danger`.
- Every color gets a `dark:` variant (`text-slate-500 dark:text-slate-400`,
  `border-slate-200 dark:border-slate-700/60`, ...).
- Numeric readouts use `tabular-nums`.
- Currency code/symbol comes **only** from `useCurrenciesStore` (the
  `/api/currencies` registry) — never a hardcoded list; the input-prefix
  pattern is `ccySymbol = store.info(ccy)?.symbol ?? ccy`.
- FX conversion math only via `@marx2/contracts/fx` (D27).
- **Instrument logos go through `TickerBadge`**, never a bare `<img>`. It owns
  the only `/api/logos/` reference in `src/`: a `rounded-[9px] object-contain`
  plate on `bg-slate-100 dark:bg-slate-800` (example-service's rounded square — *not* a
  circle). `grep -rn "/api/logos/" src` must return `TickerBadge.vue` and
  `RecentSearchesBar.vue` only; the latter is the one deliberate exception (a
  dense symbol-only chip bar, §61.9).

## KeyFactsCard (per-asset-class key facts, §86)

`src/modules/instruments/KeyFactsCard.vue` + `keyFactsRows.ts` — the research
overview's Key Facts card. One component for six asset classes, because the old
eight-row card was equity-shaped and rendered Sector, Industry, Employees and CEO
as dashes for every bond, fund, ETF and crypto pair.

- **Two blocks.** The shared identity rows (Name, Country + flag, ISIN, Exchange,
  weburl link) come from the profile. The class-specific rows come from
  `profile.keyFacts`, discriminated by `kind`.
- **Labels live only in `KEY_FACT_ROWS`** (`keyFactsRows.ts`), one array per
  `kind` — never in the template and never derived from a contract enum, the same
  rule `ASSET_TYPE_LABELS` follows in `TickerBadge.vue`. **A new asset class is
  one contract schema plus one array entry; the card does not change.**
- The table is a separate module because `<script setup>` cannot export, and an
  importable map is what makes the rule above enforceable.
- **`margin` is labelled by `rateRule`**, not always "Margin": "Rate" under
  `fixed`, "Inflation margin" under `cpi_12m+margin`, "NBP margin" under
  `nbp_ref+margin`, "Rate" when absent. The same stored number is a rate in one
  case and a spread in the others, so a fixed label states something false for
  two of the three savings-bond families.
- **Provider text renders verbatim** (`secured` is `NIE`, `status` is
  `Notowane`, `couponType` is Polish). Only numbers and dates are formatted.
- **No `keyFacts` falls back to the profile's own equity fields**
  (`PROFILE_FIELD`), so a stock's card is unchanged whether or not the backend
  classified it. Without that fallback an older instruments build would render a
  *different*, emptier card.
- The card hides itself when there is neither identity nor class-specific data —
  the same degradation the neighbouring equity-only cards do with `v-if`.

## TickerBadge (the instrument identity block)

`src/components/TickerBadge.vue` — one presentational component for every
surface that shows a ticker. It fetches nothing; each call site passes the
data it already has (or nothing, and the block degrades).

- Testid prefix `"ticker-badge"`; `-details` and `-name` for the two optional
  lines. Override with `testid="research-ticker"` etc.
- Props: `symbol` (required), `name`, `countryCode` (uppercased on render),
  `assetType` (contract enum `STOCK`/`ETF`/`CORP_BOND`/… or a displayable
  word), `size` `sm|md|lg` (logo `h-5`/`h-6`/`h-8`), `align` `left|right`
  (`flex-row-reverse text-right`, for compare-table column headers),
  `titleAs` `div|h1|h2` (the research header uses `h1`).
- Shared exports (plain `<script>` block, house style):
  `formatAssetType(t)` and `tickerDetails(countryCode, assetType)`. No call
  site re-derives the `(PL) Stock` format.
- **A missing part is omitted, never guessed.** `tickerDetails(null, null)` is
  `null` and the line does not render; a position with no `country` shows
  `Stock`, not `(US) Stock` (§61.5 replaced two `assetLabel()` helpers that
  did exactly that guess).

### A badge is expected to be a link (§85)

A badge on a portfolio, charting, admin or share-page surface is expected to
wrap the research route:

```vue
<router-link :to="researchRoute(symbol, route.fullPath)"><TickerBadge … /></router-link>
```

`researchRoute()` (`src/utils/research.ts`) is the **only** sanctioned way into
research — one route, one `from` convention. Never hand-build the URL, and never
give `TickerBadge` a `to` prop: it is documented as fetching nothing and each
call site passes the data it has, so a router-coupled prop would break its
no-router unit mounts. §85 added call sites to that helper; it introduced no
second way to build a link.

Pass `route.fullPath` as `from` so the research header's "Go back" returns to
the page the user is on. `researchBackTarget` honours exactly two prefixes —
`/en/` and `/public/` — and falls back to `/en/investments` for anything else,
including a protocol-relative or absolute URL.

**Inside a dialog, do not use `router-link`.** A link navigates without closing
the dialog it sits in, leaving the research page under a live overlay. Emit and
push instead — `emit("close")` first, then `router.push(researchRoute(...))` —
reusing the `view-chart` event those files already have. `from` is the page
*behind* the modal, because the route is unchanged while a modal is open.

Two surfaces are deliberately exempt, and both are judgement calls worth
re-reading before "fixing" them: a symbol with no research page stays clickable
(the `/:symbol/profile` bond fallback and the "Limited data availability" banner
cover most of them), and a navigation target is never placed inside a
destructive confirmation.

**Check, when you add a surface:** if a badge is reachable from a portfolio page,
it should be reachable by link too. A badge that renders with no `<a>` around it
and no click handler is the defect this rule exists to catch.

## Tests

- Unit: `tests/unit/**` mirrors `src/` (vitest + `@vue/test-utils` + pinia env
  per `tests/unit/modules/portfolios/RecordDividendDialog.test.ts`).
- E2E: `tests/e2e/*.spec.ts` against the dockerized compose stack
  (`docker compose up -d --build` first after SPA changes).
- Gate before commit: `npm run build` (vue-tsc) · `npm run test` ·
  `npm run test:mock` · `npm run test:e2e`.
