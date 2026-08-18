# Proposal: Use `openapi-typescript` for API Type Generation

**Status**: Proposed  
**Date**: 2026-08-17  

## Problem

Types for API request/response bodies are managed through a fragmented system:

1. **`scripts/gen-types.mjs`** reads raw JSON seed files from `mocks/shared/data/raw/*.json` and infers TypeScript interfaces, writing them to `generated/api-types.d.ts` (~19K lines).
2. **`src/api/types.ts`** re-exports generated types and adds ~25 manual interfaces not covered by the seed data.
3. **Per-module files** (`src/api/portfolios.ts`, `src/api/wallets.ts`, etc.) define additional inline interfaces for input types and narrower response shapes.

The OpenAPI spec (`docs/api/example-service-real-api.yaml`, 2329 lines) already exists but is **not used for type generation**. It serves only as documentation. This means:

- Types can drift from the spec without anyone noticing
- Updating the API contract requires updating both the spec AND the type generation separately
- The mock backend (plain JS) has no schema enforcement at all

## Proposed Solution

Replace the JSON-seed-based type generation pipeline with `openapi-typescript`:

```
example-service-real-api.yaml  -->  openapi-typescript  -->  generated/api-types.d.ts
```

### Steps

1. **Install** `openapi-typescript` as a dev dependency
2. **Add script** to `package.json`: `"gen:api-types": "openapi-typescript docs/api/example-service-real-api.yaml -o generated/api-types.d.ts"`
3. **Delete** `scripts/gen-types.mjs` (no longer needed)
4. **Update** `src/api/types.ts` to re-export from the generated file (path stays the same, minimal change)
5. **Extend the OpenAPI spec** to cover missing schemas currently defined manually:
   - `AuthUser`, `AuthResponse`
   - `AllocationSlice`, `PortfolioAllocation`
   - `PortfolioDividendRow`, `PortfolioDividends`
   - `PortfolioCalendar*`, `PortfolioNews`, `PortfolioCompare*`
   - `ResearchSeasonality`, `ResearchFundamentals`, `ResearchOwnership`
   - `ResearchDividends`, `ResearchCalendar`, `ResearchCompare`, `ResearchPeers`
   - Per-module input types (`CreatePortfolioPositionInput`, `DepositInput`, etc.)
6. **Audit per-module inline types** — either move them into the spec or keep as supplementary manual types
7. **Run** `npm run build` and `npm run test` to verify no regressions

### Benefits

- **Single source of truth**: The YAML spec drives documentation AND types
- **Easier maintenance**: Change the API contract in one place, regenerate types
- **Type drift detection**: Compiler errors if frontend uses shapes the spec doesn't define
- **Foundation for future improvements**: Response validation in mocks, `openapi-fetch` typed client, etc.

### Risks / Considerations

- The existing spec is incomplete — ~25+ interfaces in `src/api/types.ts` and per-module files are not in the YAML. These must be added to the spec or kept as supplementary types.
- The mock backend remains plain JS; this does not add runtime validation.
- Generated types may have different naming conventions than existing manual types, requiring import renames across the codebase.

## Current Type Generation Pipeline

```
mocks/shared/data/raw/*.json
        |
        v
  scripts/gen-types.mjs
        |
        v
  generated/api-types.d.ts  (19,064 lines)
        |
        v
  src/api/types.ts  (re-exports + 25 manual interfaces)
        |
        v
  Per-module API files  (additional inline interfaces)
```

## Proposed Pipeline

```
docs/api/example-service-real-api.yaml
        |
        v
  openapi-typescript (CLI)
        |
        v
  generated/api-types.d.ts  (generated, no manual edits)
        |
        v
  src/api/types.ts  (re-exports + supplementary manual types only)
        |
        v
  Per-module API files  (input types, narrow response types)
```
