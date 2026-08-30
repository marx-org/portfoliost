# AGENTS.md

Guidelines for working in this repo (example-service.ai parity build).

## Working guidelines

- **Parity with example-service is the goal.** `app.example-service.ai` is the source of truth for UI, pages, copy, and behavior. When implementing a page, replicate example-service's layout, wording, and interactions as closely as the mock data allows.
- **Compare against example-service with Playwright.** Use Playwright to open the current project and `app.example-service.ai` side by side (snapshots, a11y trees, screenshots) to diff pages before/after changes. Browser-based comparison is the preferred way to find gaps.
- **Operate in example-service freely to explore flows.** It is allowed to make operations in `app.example-service.ai` (clicking, filling forms, adding positions, etc.) to inspect behavior — as long as you never modify the **Top10** portfolio. To experiment, create a throwaway test portfolio in example-service and do changes in it instead.
- **Commit after every step.** A change is only "done" once the full suite passes and it is committed — do not batch multiple plan steps into one commit. Run:
  - `npm run build` (includes `vue-tsc --noEmit`)
  - `npm run test` (vitest unit tests)
  - `npm run test:mock` (mock API tests)
  - `npm run test:e2e` (Playwright, against docker compose)
- **Use docker compose.** `docker compose up -d --build` runs the app (`:8080`) and the mock backend (`:4010`). E2E tests run against the dockerized stack, so rebuild the `portfoliost` container after frontend changes.
- **Keep the API similar to example-service.** Endpoint paths, request/response shapes, and error formats should mirror the real example-service API (see `docs/api/example-service-real-api.yaml`, `docs/api/EXAMPLE_SERVICE_API.md`). Mock endpoints live in `mocks/` with seeded data in `mocks/shared/data/raw/`; regenerate seeds with `npm run mock:seed` after changing raw data.
- **Replace premium features with real content.** Where example-service gates a feature behind a premium plan, ship a working non-gated version with reasonable guessed content instead of a paywall (e.g. AI portfolio insights, statistics).
- **Mock where the real API is unavailable.** The `mocks/gateway` serves all `/api` routes; frontend code talks to the same endpoints example-service would. Keep mock responses faithful to the real API contracts.
- **Step-test-commit discipline.** Every plan step must prove itself with a test before it counts: run the step's tests (unit plus docker-compose level — including standalone-service compose for provider repos like openst/cachest), and only when all pass mark the step `[x]` in `docs/plan.md`, commit that step, then move on. One step = one commit.
- **Provider tier first.** New module data comes from cachest/openst. If data is missing, extend openst first (OpenBB likely covers it), expose it through cachest, and keep the translation adapter inside the owning module (proposal D2). Extend docker compose so every new service is testable locally.
- **New backend modules follow [docs/MODULARISATION.md](docs/MODULARISATION.md)**: separate repo per module, same stack as `portfoliost-users-auth` (Hono + Drizzle + Postgres + PGlite + jose), playbook naming.

## Example service sections to skip

Do not build or wire these sections from example-service:

- News screen (news dashboard)
- Premium plan description page
- Send error / "Report bug" form
- Copilot
- Import from broker
- Alerts (bell/badge/notifications)
- Payments / billing

## Conventions

- **Contract enforcement is a must.** Every API response the SPA or a backend module returns must be typed against the shared `@marx2/contracts` spec (generated `components` types / zod-openapi from the contract), so a shape drift fails the build. Hand-written response types that duplicate the contract are not allowed. Update the contract in `portfoliost-contracts` first when changing the wire shape, publish, then regenerate/enforce in consumers.
- New API wire fields use camelCase even where legacy schemas are snake_case (see `docs/proposals/fees-and-custom-fx.md` D29).
- FX conversion math must go through `@marx2/contracts/fx` — never re-implement cross-rate/settlement formulas locally (D27).
- Currency selectors are fed exclusively by the `/api/currencies` registry (`useCurrenciesStore`); never hardcode currency lists.


- Vue 3 `<script setup lang="ts">` SFCs; Pinia stores; `vue-router`; Tailwind utility classes (`card`, `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-danger`, `input`, `label`).
- API client functions live in `src/api/<domain>.ts` with explicit return types.
- Track long-running work in `docs/plan.md`; mark steps `[x]` only after they are verified with the full test suite and committed.
