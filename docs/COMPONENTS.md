# SPA component conventions

House style for the Vue 3 SPA (`src/`). Follow this when adding a component;
the examples below are the existing components to imitate:

| Concern | Reference |
|---|---|
| Field group with a `testid` prefix | `src/components/FeeFields.vue`, `src/components/FxRateFields.vue` |
| Bigger form section with slots + shared math | `src/components/TransactionFormFields.vue`, `src/components/DividendFields.vue` |
| Feature view / dialog | `src/modules/portfolios/RecordDividendDialog.vue`, `src/modules/portfolios/EditTransactionModal.vue` |

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
  events** — the codebase does not use `defineModel`:

  ```ts
  const emit = defineEmits<{
    (e: "update:rate", v: string): void
  }>()
  ```

- Field-group components take a `testid?: string` prop and resolve a local
  `const tid = props.testid ?? "default"`; every interactive element inside
  gets `:data-testid="`${tid}-<field>`"`. Testids are **stable API** — unit
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
- Instrument logos: `<img :src="`/api/logos/${symbol}`">` with
  `rounded-full bg-slate-100 dark:bg-slate-800`.

## Tests

- Unit: `tests/unit/**` mirrors `src/` (vitest + `@vue/test-utils` + pinia env
  per `tests/unit/modules/portfolios/RecordDividendDialog.test.ts`).
- E2E: `tests/e2e/*.spec.ts` against the dockerized compose stack
  (`docker compose up -d --build` first after SPA changes).
- Gate before commit: `npm run build` (vue-tsc) · `npm run test` ·
  `npm run test:mock` · `npm run test:e2e`.
