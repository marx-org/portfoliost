# Proposal: labels for positions & transactions

**Status**: proposed (2026-09-06)
**Builds on**: [wallets-module.md](wallets-module.md) (D16–D24), [portfolios-module.md](portfolios-module.md) (D53–D64), [fees-and-custom-fx.md](fees-and-custom-fx.md) (D25–D41), [MODULARISATION.md](../MODULARISATION.md)
**Scope**: add a global label system so users can tag positions and portfolio transactions with named, coloured decorators. Labels are user-created, each with an auto-assigned colour (overridable), and visible in the holdings and history tables. A multi-select label filter is provided in both views.

---

## Context

Positions and transactions currently carry only system-derived metadata strings (`sector`, `country`, `assetType`). There is no way for a user to apply custom organisation — e.g. "watch closely", "dividend play", "tax lot", "speculative". Example service also lacks labels, so this is a portfoliost-original feature.

---

## Design

### D65 — data model: `labels` table + join tables

New table in the `portfolios` schema (`portfoliost-wallets`):

```sql
CREATE TABLE portfolios.labels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  name        text NOT NULL,
  color       text NOT NULL,       -- hex "#rrggbb"
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);
CREATE INDEX idx_labels_user ON portfolios.labels(user_id);
```

Join tables (many-to-many):

```sql
CREATE TABLE portfolios.position_labels (
  position_id uuid NOT NULL REFERENCES portfolios.positions(id) ON DELETE CASCADE,
  label_id    uuid NOT NULL REFERENCES portfolios.labels(id) ON DELETE CASCADE,
  PRIMARY KEY (position_id, label_id)
);

CREATE TABLE portfolios.transaction_labels (
  transaction_id uuid NOT NULL REFERENCES portfolios.transactions(id) ON DELETE CASCADE,
  label_id       uuid NOT NULL REFERENCES portfolios.labels(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, label_id)
);

CREATE TABLE portfolios.wallet_transaction_labels (
  wallet_transaction_id uuid NOT NULL REFERENCES wallets.wallet_transactions(id) ON DELETE CASCADE,
  label_id             uuid NOT NULL REFERENCES portfolios.labels(id) ON DELETE CASCADE,
  PRIMARY KEY (wallet_transaction_id, label_id)
);
```

Cascade semantics: deleting a position/transaction/wallet-transaction drops the join row; deleting a label drops all join rows and the label itself.

### D66 — colour palette & auto-assignment

A fixed palette of 10 colours, cycling on creation:

| Index | Name   | Light bg        | Light text      | Dark bg            | Dark text         |
| ----- | ------ | --------------- | --------------- | ------------------ | ----------------- |
| 0     | slate  | `bg-slate-100`  | `text-slate-700`| `bg-slate-500/15`  | `text-slate-400`  |
| 1     | red    | `bg-red-50`     | `text-red-700`  | `bg-red-500/15`    | `text-red-400`    |
| 2     | amber  | `bg-amber-50`   | `text-amber-700`| `bg-amber-500/15`  | `text-amber-400`  |
| 3     | emerald| `bg-emerald-50` | `text-emerald-700`| `bg-emerald-500/15`| `text-emerald-400`|
| 4     | blue   | `bg-blue-50`    | `text-blue-700` | `bg-blue-500/15`   | `text-blue-400`   |
| 5     | purple | `bg-purple-50`  | `text-purple-700`| `bg-purple-500/15`| `text-purple-400` |
| 6     | pink   | `bg-pink-50`    | `text-pink-700` | `bg-pink-500/15`   | `text-pink-400`   |
| 7     | cyan   | `bg-cyan-50`    | `text-cyan-700` | `bg-cyan-500/15`   | `text-cyan-400`   |
| 8     | orange | `bg-orange-50`  | `text-orange-700`| `bg-orange-500/15`| `text-orange-400` |
| 9     | teal   | `bg-teal-50`    | `text-teal-700` | `bg-teal-500/15`   | `text-teal-400`   |

Auto-assignment: when creating a label without an explicit colour, pick the next palette index not yet used by any of the user's existing labels (modulo 10). User can override the colour manually after creation via a colour picker in the label management UI.

The SPA stores the palette mapping in a shared `labelColors.ts` utility. The backend stores the hex value; the SPA translates hex to Tailwind classes at render time (since Tailwind requires static class strings). The 10 palette hex values are the allowed set in the colour picker.

### D67 — contract changes (`portfoliost-contracts/openapi.yaml`)

**New schemas:**

```yaml
Label:
  type: object
  required: [id, name, color]
  properties:
    id: { type: string, format: uuid }
    name: { type: string }
    color: { type: string }   # hex "#rrggbb"
    createdAt: { type: string, format: date-time }

LabelInput:
  type: object
  required: [name]
  properties:
    name: { type: string }
    color: { type: string }   # optional; auto-assigned if omitted
```

**Extend existing schemas** -- add `labels` array to `Position`, `Transaction`, `CashTransaction` and `RecentCashTransaction`:

```yaml
# in Position:
  labels:
    type: array
    items: { $ref: '#/components/schemas/Label' }

# in Transaction:
  labels:
    type: array
    items: { $ref: '#/components/schemas/Label' }

# in CashTransaction:
  labels:
    type: array
    items: { $ref: '#/components/schemas/Label' }

# in RecentCashTransaction:
  labels:
    type: array
    items: { $ref: '#/components/schemas/Label' }
```

**New endpoints** (all under `Portfolios` tag):

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/labels` | List all labels for the authenticated user |
| `POST` | `/labels` | Create a label (name, optional color) |
| `PATCH` | `/labels/{id}` | Update name or color |
| `DELETE` | `/labels/{id}` | Delete a label (cascades to join rows) |
| `POST` | `/positions/{positionId}/labels` | Set labels on a position (body: `{ labelIds: string[] }`) |
| `POST` | `/portfolios/{id}/transactions/{transactionId}/labels` | Set labels on a transaction (body: `{ labelIds: string[] }`) |
| `POST` | `/wallets/{walletId}/transactions/{transactionId}/labels` | Set labels on a wallet/cash transaction (body: `{ labelIds: string[] }`) |

The set-labels endpoints use **replace semantics** -- the full `labelIds` array is the new state, matching the `D19` push model pattern.

**Extend listing endpoints** with optional label filter query params:

```
GET /portfolios/{id}/positions?labels=uuid1,uuid2   # AND filter
GET /portfolios/{id}/transactions?labels=uuid1,uuid2
GET /portfolios/transactions?labels=uuid1,uuid2     # cross-portfolio
GET /wallets/{walletId}/transactions?labels=uuid1,uuid2
```

When `labels` param is present, return only positions/transactions that have **all** specified labels (AND semantics).

Labels on a given entity are returned **alphabetically by name**.

### D68 -- backend (`portfoliost-wallets`)

**New files:**

- `src/routes/labels.ts` -- CRUD for labels (GET/POST/PATCH/DELETE `/labels`)
- `src/routes/position-labels.ts` -- `POST /:positionId/labels` (set labels on position)
- `src/routes/transaction-labels.ts` -- `POST /:id/transactions/:txId/labels` (set labels on transaction)
- `src/routes/wallet-transaction-labels.ts` -- `POST /:walletId/transactions/:txId/labels` (set labels on wallet/cash transaction)

**Serialization:** `serializeLabels(dbLabels)` returns `Label[]`. Called inside `serializePosition()`, `serializeTx()` and the cash-transaction serializers to populate the `labels` array on each entity. Labels are returned **sorted alphabetically by name**.

**Filtering:** the positions and transactions listing handlers read the optional `labels` query param, split on `,`, and add a `WHERE ... AND position_id IN (SELECT position_id FROM position_labels WHERE label_id = ANY(...))` clause. The join queries are composed via Drizzle's `inArray` + subquery.

**Join table writes:** the set-labels handlers delete all existing join rows for the entity, then bulk-insert the new set -- one `DELETE` + one `INSERT` per call (atomic within a Postgres transaction).

### D69 -- SPA: label badge component

A shared `LabelBadge.vue` component:

```html
<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      :style="{ backgroundColor: bgColor, color: textColor }">
  {{ label.name }}
</span>
```

Uses the same Tailwind recipe as the existing transaction-type pill (`TransactionsTable.vue:196`) and calendar badge (`PortfolioCalendarTab.vue:27`). The hex to background/text pair is resolved from `labelColors.ts` (the 10-colour palette).

**Overflow:** a row may carry many labels; show the first **10** badges then a `+N` pill. The full list is visible on hover (native `title` tooltip). No hard limit on how many labels an entity may have.

### D70 -- SPA: label management UI

**LabelManager dialog** (accessible from a "Manage labels" link in the holdings/transactions table header bar):

- List of all user labels with colour swatch + name + edit/delete actions.
- "New label" form: name input + colour picker (10-colour grid).
- Edit: inline name edit + colour picker.
- Delete: confirm modal (warns that the label is removed from all positions/transactions).

**Set-label popover** (per position/transaction/cash-transaction row):

- A kebab menu action "Set labels..." opens a small popover with checkboxes for each label.
- Checked = the label is applied; unchecked = removed.
- "Create new label" inline option at the bottom of the popover.
- Saves on close (debounced POST to the set-labels endpoint).

### D71 -- SPA: label filter in tables

Add a "Labels" multi-select filter chip bar to `PortfolioHoldingsTab.vue`, `TransactionsTable.vue` and `CashTransactionsView.vue`:

- Below the "Group by" / "Customize" header bar, show a row of label filter chips (all user labels as `LabelBadge` with an `x` when active).
- Clicking an inactive label adds it to the filter (sends `?labels=...` to the listing endpoint).
- Clicking an active label removes it.
- Multiple active labels = AND filter (intersection).
- Visual: active chips have a ring/outline; inactive chips are muted.

### D72 -- deployment

- New migration file in `portfoliost-wallets/src/db/migrations/` adding the four tables.
- No new module; everything is within `portfoliost-wallets` (D53 -- extend, don't split).
- Contract published via the standard `openapi.yaml` -> tag -> `@marx2/contracts` flow.

---

## Implementation plan

- [ ] **1. Contract** -- add `Label`, `LabelInput` schemas + `labels` arrays to `Position`/`Transaction`/`CashTransaction`/`RecentCashTransaction` + new endpoints (incl. wallet-transaction set-labels) + filter query params in `openapi.yaml`; publish `@marx2/contracts` release
- [ ] **2. Backend: migration** -- create `labels`, `position_labels`, `transaction_labels`, `wallet_transaction_labels` tables + indexes
- [ ] **3. Backend: labels CRUD** -- `src/routes/labels.ts` (GET/POST/PATCH/DELETE `/labels`)
- [ ] **4. Backend: position labels** -- `src/routes/position-labels.ts` + serialize labels in `serializePosition()`
- [ ] **5. Backend: transaction labels** -- `src/routes/transaction-labels.ts` + serialize labels in `serializeTx()`
- [ ] **6. Backend: wallet-transaction labels** -- `src/routes/wallet-transaction-labels.ts` + serialize labels in cash-transaction serializers
- [ ] **7. Backend: filtering** -- wire `?labels=` query param into positions, portfolio-transactions and wallet-transactions listing handlers
- [ ] **8. Backend: tests** -- PGLite unit tests for labels CRUD, set-labels (all three entity types), filtering, alphabetical ordering
- [ ] **9. SPA: contract types** -- install bumped `@marx2/contracts`, run `gen:types`
- [ ] **10. SPA: labelColors utility** -- shared palette mapping (hex to Tailwind class pairs)
- [ ] **11. SPA: LabelBadge component** -- shared badge component with `+N` overflow
- [ ] **12. SPA: LabelManager dialog** -- CRUD UI for labels
- [ ] **13. SPA: set-label popover** -- per-row label assignment in holdings + transactions + cash-transactions tables
- [ ] **14. SPA: label filter** -- multi-select chip filter in `PortfolioHoldingsTab` + `TransactionsTable` + `CashTransactionsView`
- [ ] **15. SPA: tests** -- vitest unit tests for components + Playwright e2e for full flow
- [ ] **16. Integration test** -- docker-compose end-to-end: create label -> assign to position/transaction/cash-transaction -> verify filter

---

## Resolved decisions

1. **Wallet/cash transactions are labelled too** (all three entity types: positions, portfolio transactions, wallet transactions).
2. **Label ordering** on an entity is **alphabetical by name** (server-sorted in serialization).
3. **Max labels per entity**: no hard limit; UI shows 10 badges with `+N` overflow and a hover tooltip.
