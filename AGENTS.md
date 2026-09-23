# AGENTS.md

Portfoliost-specific guidelines (parent `../AGENTS.md` has shared rules).

## UI guidelines

- **Parity with example-service is the starting point.** `app.example-service.ai` is the source of truth for UI, pages, copy, and behavior. When implementing a page, replicate example-service's layout, wording, and interactions as closely as the mock data allows.
- **Compare against example-service with Playwright.** Use Playwright to open the current project and `app.example-service.ai` side by side (snapshots, a11y trees, screenshots) to diff pages before/after changes. Browser-based comparison is the preferred way to find gaps.
- **Operate in example-service freely to explore flows.** It is allowed to make operations in `app.example-service.ai` (clicking, filling forms, adding positions, etc.) to inspect behavior — as long as you never modify the **Top10** portfolio. To experiment, create a throwaway test portfolio in example-service and do changes in it instead.
- **Replace premium features with real content.** Where example-service gates a feature behind a premium plan, ship a working non-gated version with reasonable guessed content instead of a paywall (e.g. AI portfolio insights, statistics).
- **Currency selectors are fed exclusively by the `/api/currencies` registry (`useCurrenciesStore`); never hardcode currency lists.**
- FX conversion math must go through `@marx2/contracts/fx` — never re-implement cross-rate/settlement formulas locally (D27).

## Tech stack

- **Component conventions: `docs/COMPONENTS.md`** — where components live, `testid` prefix + `update:x` emit pattern (no `defineModel` except `TransactionFormFields`' whole-form model), slots, shared-math exports, styling/currency rules, testid stability, test layout.
- Vue 3 `<script setup lang="ts">` SFCs; Pinia stores; `vue-router`; Tailwind utility classes (`card`, `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-danger`, `input`, `label`).
- API client functions live in `src/api/<domain>.ts` with explicit return types.
- **Contracts repo layout**: `../portfoliost-contracts/` — the OpenAPI spec is `../portfoliost-contracts/contracts/openapi.yaml`, but the npm `@marx2/contracts` package (package.json, vitest, build) lives one level down in `../portfoliost-contracts/contracts/`. Run `npm test` / `npm run lint` from there, not the repo root. Regenerated types land in `generated/api-types.d.ts` (`npm run gen:types`).

## Working guidelines

- **Commit after every step.** A change is only "done" once the full suite passes and it is committed — do not batch multiple plan steps into one commit. Run:
  - `npm run build` (includes `vue-tsc --noEmit`)
  - `npm run test` (vitest unit tests)
  - `npm run test:mock` (mock API tests)
  - `npm run test:e2e` (Playwright, against docker compose)
- **Use docker compose.** `docker compose up -d --build` runs the app (`:8080`) and the mock backend (`:4010`). E2E tests run against the dockerized stack, so rebuild the `portfoliost` container after frontend changes.
- **Keep the API similar to example-service.** Endpoint paths, request/response shapes, and error formats should mirror the real example-service API (see `docs/api/example-service-real-api.yaml`, `docs/api/EXAMPLE_SERVICE_API.md`). Mock endpoints live in `mocks/` with seeded data in `mocks/shared/data/raw/`; regenerate seeds with `npm run mock:seed` after changing raw data.
- **Production Google Sheets sync (D24).** The `portfoliost-sheets-sync` Job imports `Transakcje` into the live wallets/portfolios DB. It is triggered on demand from `https://portfoliost.k.homylab.com` → Admin → Jobs ("Wipe & Reimport" = `POST /api/admin/jobs/sheets-sync/run {wipe:true}`), which requires an authenticated Pocket-ID session. The import payload schema is version-coupled: a new `portfoliost-sheets-sync` image must not send keys a deployed `portfoliost-wallets` rejects (2026-09-19: sync `v1.0.4` needed wallets `v1.1.41`). Production re-imports touch homelab and require explicit user approval (see §28 in `docs/plan-archive.md`).

## Example service sections to skip

Do not build or wire these sections from example-service:

- News screen (news dashboard)
- Premium plan description page
- Send error / "Report bug" form
- Copilot
- Import from broker
- Alerts (bell/badge/notifications)
- Payments / billing
